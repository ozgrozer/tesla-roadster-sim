// Autopilot in the city: drives the Roadster round the streets through the normal controls, on
// the same lane graph as the traffic. It steers by pure pursuit along its lane, keeps its distance
// to the cars ahead, slows for corners, stops for red lights and gives way when turning left.
// Started, it heads for the gridlock downtown, sits in it, leans on the horn and then flies over it
// (cityHop.js); after that it drives on, and hops over any other jam it gets stuck in.
import { Hop, landingSpot, routeToJam } from './cityHop.js'
import { CAR, clamp, wrapPi, makeControls } from './constants.js'
import {
  LANES,
  NODES,
  GREEN,
  YELLOW,
  signal,
  pointAt,
  holdLight,
  releaseLight
} from './city.js'

const CAPS = {
  jam: [
    'Autopilot · City',
    'Heading for the gridlock',
    'Downtown, where nothing moves'
  ],
  stuck: ['Autopilot · City', 'Stuck in traffic', 'Nobody is going anywhere'],
  red: [
    'Autopilot · City',
    'Stuck in the gridlock',
    'Red light ahead · nobody is going anywhere'
  ],
  hop: [
    'Autopilot · City',
    'Over the traffic',
    'Lift thrusters up, main thrusters along'
  ],
  free: ['Autopilot · City', 'Back on the road', 'Stuck again? It flies over']
}
const STUCK = 8 // s stopped in traffic before it takes off
const HONK = [0.5, 0.75, 0.95, 1.2, 1.4, 2.4] // horn on, off, on, off, on, off (s into the wait)
const HOP_AIR = 170 // kg of air it wants in the tanks before a hop
let PLAN = null // the route to the gridlock (the same for every run, so worked out once)
const CRUISE = 33 // m/s, about 120 km/h: it is a Roadster
const A = 8 // a hard launch and firm braking, m/s^2
const B = 9
const LAT = 6 // m/s^2 round a corner (traffic takes them at 2.6)
const HEADWAY = 0.9 // s behind the car ahead (traffic keeps 1.3)
const LOOK = 110 // m ahead it watches for cars and lights, enough to stop from cruising speed
const DRIVER = { type: 0 } // how traffic.choose sees the Roadster: an ordinary car
const corner = e => (e.kind === 1 ? Math.sqrt(LAT * e.r) : Infinity)
const P = { x: 0, z: 0, hx: 1, hz: 0 }

export class CityPilot {
  constructor (sim, traffic) {
    this.sim = sim
    this.traffic = traffic
    this.reset()
  }
  // the same fields the test-site autopilot exposes to the main loop and the HUD, plus the horn
  reset () {
    this.releaseLights()
    this.edge = null
    this.next = null
    this.go = null
    this.s = 0
    this.cap = CAPS.jam.slice()
    this.shot = null
    this.countdown = null
    this.slow = 1
    this.restart = false
    this.horn = false
    this.acc = 0 // the acceleration it asks for, smoothed so the pedals don't flicker
    this.stuckT = 0
    this.passT = 0 // s until it may change lanes to overtake again
    this.hop = null
    this.plan = PLAN || (PLAN = routeToJam()) // until it has flown over the gridlock
  }
  // where to go at the end of lane e: towards the gridlock while it is still heading there
  pick (e, own = false) {
    const c = this.plan && (this.plan.get(e) || (!own && this.plan.get(e.twin)))
    return c || this.traffic.choose(e, DRIVER, own)
  }

  // Join the nearest lane that runs the way the car faces. False if there is none close by.
  join () {
    const s = this.sim,
      fx = Math.cos(s.yaw),
      fz = -Math.sin(s.yaw)
    let best = null,
      bd = 10 * 10
    for (const e of LANES) {
      if (e.closed || e.dx * fx + e.dz * fz < 0.5) continue
      const t = clamp(
        (s.pos.x - e.x0) * e.dx + (s.pos.z - e.z0) * e.dz,
        0,
        e.len
      )
      const d =
        (e.x0 + e.dx * t - s.pos.x) ** 2 + (e.z0 + e.dz * t - s.pos.z) ** 2
      if (d < bd) {
        bd = d
        best = e
      }
    }
    if (!best || s.mode !== 'ground' || s.floor > 0) return false // (not from a roof)
    this.edge = best
    this.next = this.pick(best)
    this.go = null
    return true
  }
  // Room to move over into lane t at speed v: a safe gap to its cars (traffic.canMerge), and nothing
  // at all in it (a wreck, a car still crossing the junction) slower than the Roadster for as far
  // ahead as it covers in 2.5 s, nor coming up fast from behind.
  clear (t, v) {
    if (!this.traffic.canMerge(t, { s: this.s, v, len: 2 * CAR.halfL }, true))
      return false
    pointAt(t, clamp(this.s, 0, t.len), P)
    for (const o of this.traffic.cars) {
      const dx = o.x - P.x,
        dz = o.z - P.z,
        along = dx * P.hx + dz * P.hz
      if (Math.abs(dz * P.hx - dx * P.hz) > 2.6) continue
      const ov = o.loose
        ? o.vx * P.hx + o.vz * P.hz
        : o.v * (o.hx * P.hx + o.hz * P.hz)
      if (along > -6 && along < 12 + v * 2.5 && ov < v - 1) return false
      if (along <= -6 && along > -12 - ov * 1.5 && ov > v + 1) return false
    }
    return true
  }
  // distance along edge e of the point nearest (x, z)
  project (e, x, z) {
    if (e.kind === 0) return (x - e.x0) * e.dx + (z - e.z0) * e.dz
    return wrapPi(Math.atan2(z - e.cz, x - e.cx) - e.a0) * e.sg * e.r
  }

  update (dt = 1 / 120) {
    const sim = this.sim
    if (this.hop) {
      const c = this.hop.update(dt)
      if (this.hop.done) this.landed()
      return c
    }
    const c = makeControls()
    c.fan = false
    this.horn = false
    if (sim.mode === 'crash') {
      if (sim.crashSettled) this.restart = true
      return c
    }
    if (sim.mode !== 'ground' || (!this.edge && !this.join())) {
      c.brake = 1
      return c
    }
    const x = sim.pos.x,
      z = sim.pos.z
    this.s = this.project(this.edge, x, z)
    while (this.s > this.edge.len && this.next) {
      this.edge = this.next
      this.next = this.pick(this.edge)
      this.go = null
      this.s = this.project(this.edge, x, z)
    }
    const v = Math.max(0, sim.speed)
    // a turn from the other lane: pull over when there's room (steering follows the new lane),
    // or go another way if the chance has passed
    const cur = this.edge
    if (cur.road && cur.twin && this.next && !cur.next.includes(this.next)) {
      if (
        this.s > 4 &&
        this.s < cur.len - 25 &&
        v < 20 &&
        this.clear(cur.twin, v)
      ) {
        this.edge = cur.twin
        this.s = this.project(this.edge, x, z)
      } else if (this.s >= cur.len - 25) this.next = this.pick(cur, true)
    }

    this.lights(this.edge)
    // steer for a point a little way up the lane: further at speed, closer through a corner
    const turning =
      this.edge.kind === 1 ||
      (this.next?.kind === 1 && this.edge.len - this.s < 8)
    let e = this.edge,
      n = this.next,
      s = this.s + (turning ? 2.5 + v * 0.3 : 5 + v * 0.7)
    while (s > e.len && n) {
      s -= e.len
      e = n
      n = e.next.length === 1 ? e.next[0] : null
    }
    pointAt(e, Math.min(s, e.len), P)
    const dist = Math.max(1, Math.hypot(P.x - x, P.z - z))
    const alpha = wrapPi(Math.atan2(-(P.z - z), P.x - x) - sim.yaw)
    const steer = Math.atan((2 * CAR.wheelbase * Math.sin(alpha)) / dist)
    c.steer = clamp(steer / (0.6 / (1 + (v * v) / 300)), -1, 1)

    // what is ahead: traffic in the lane, anything knocked loose, the signal at the end of the lane
    const hx = Math.cos(sim.yaw),
      hz = -Math.sin(sim.yaw)
    let gap = Infinity,
      vl = 0,
      red = false,
      walker = false // what it waits for is someone on foot
    for (const o of this.traffic.cars) {
      if (o.parked && !o.loose && !o.jam) continue // (parked in a lot, not queued in the jam)
      const dx = o.x - x,
        dz = o.z - z
      if (Math.abs(dx) > LOOK || Math.abs(dz) > LOOK) continue
      const along = dx * hx + dz * hz
      if (along <= 0) continue
      // the whole of a car counts, so one turning across in front blocks the lane with its tail too
      const cos = Math.abs(o.hx * hx + o.hz * hz),
        sin = Math.abs(o.hx * hz - o.hz * hx)
      const across = (o.len / 2) * sin + (o.wid / 2) * cos
      if (Math.abs(dz * hx - dx * hz) > CAR.halfW + 0.5 + across) continue
      const g = along - CAR.halfL - (o.len / 2) * cos - (o.wid / 2) * sin
      if (g < gap) {
        gap = g
        vl = Math.max(
          0,
          o.loose ? o.vx * hx + o.vz * hz : o.v * (o.hx * hx + o.hz * hz)
        )
      }
    }
    // and anyone on foot in the road (on a crossing, or still getting out of the way)
    for (const p of this.traffic.peds) {
      const dx = p.x - x,
        dz = p.z - z,
        along = dx * hx + dz * hz
      if (along <= 0 || along > LOOK) continue
      if (Math.abs(dz * hx - dx * hz) > CAR.halfW + 0.9) continue
      const g = along - CAR.halfL - 0.5
      if (g < gap) {
        gap = g
        vl = 0
        walker = true
      }
    }
    // overtake: a slower car ahead (not one stopped in a queue), room in the other lane and street
    // enough left to get by; on its way to the gridlock, only where it can still turn as planned
    const cur2 = this.edge
    this.passT -= dt
    if (
      this.passT <= 0 &&
      cur2.road &&
      cur2.twin &&
      !cur2.closed &&
      !this.next?.closed &&
      gap < 40 &&
      vl > 2 &&
      vl < CRUISE * 0.75 &&
      v < 22 &&
      this.s > 4 &&
      this.s < cur2.len - 40 &&
      (!this.plan || cur2.twin.next.includes(this.next)) &&
      this.clear(cur2.twin, v)
    ) {
      this.edge = cur2.twin
      this.s = this.project(this.edge, x, z)
      if (!this.edge.next.includes(this.next))
        this.next = this.pick(this.edge, true)
      this.passT = 3
    }
    const lane = this.edge
    // on its way to the gridlock it waits at the light like anyone else, then on the green drives on
    // into the jammed street and pulls up behind the last car in the queue (lane.closed: in it)
    if (lane.road && this.next && this.go !== lane) {
      const toLine = lane.len - this.s - CAR.halfL
      if (toLine < LOOK && toLine > -1) {
        const node = NODES[lane.to],
          st = signal(node, lane.dir, this.traffic.t)
        let stop = st !== GREEN
        if (st === YELLOW && v * v > 2 * 8 * Math.max(0, toLine - 1)) {
          this.go = lane // too close to stop: carry on through
          stop = false
        }
        if (!stop && this.next.move === 'L' && toLine < 30)
          stop = this.traffic.oncoming(node, lane.dir)
        if (stop && toLine - 1.4 < gap) {
          gap = toLine - 1.4
          vl = 0
          red = true
        }
      }
    }
    // cruise, braking in time for the corner ahead
    let v0 = Math.min(CRUISE, corner(lane))
    if (this.next && corner(this.next) < v0)
      v0 = Math.min(
        v0,
        Math.sqrt(
          corner(this.next) ** 2 + 2 * 5 * Math.max(0, lane.len - this.s - 1)
        )
      )
    let acc = A * (1 - (v / Math.max(v0, 0.1)) ** 4)
    if (gap < LOOK) {
      const ss =
        2.5 + Math.max(0, v * HEADWAY + (v * (v - vl)) / (2 * Math.sqrt(A * B)))
      acc -= A * (ss / Math.max(gap, 0.2)) ** 2
    }
    // Pedals that follow the asked-for acceleration smoothly: a touch of throttle holds the speed,
    // the brake (never the on-off step of regen) slows it. Snapping between throttle, regen and brake
    // every few frames is what rocked the car on its springs.
    acc = clamp(acc, -9, A)
    this.acc +=
      (acc - this.acc) * (1 - Math.exp(-dt * (acc < this.acc ? 10 : 4)))
    if (this.acc > -0.25) c.throttle = clamp((this.acc + 0.25) / 15, 0.001, 1)
    else c.brake = clamp((-this.acc - 0.25) / 12, 0.002, 1)
    if ((v < 2 && gap < 2.5 + v) || (v < 0.3 && gap < 8)) {
      c.throttle = 0
      c.brake = 1 // pull up crisply, and hold at a standstill
    }
    // stuck: in the gridlock at once, elsewhere after a long wait in traffic (not at a red light,
    // nor for someone on foot)
    const inJam = lane.closed
    const held = v < 0.3 && gap < 9 && (inJam || (!red && !walker))
    this.stuckT = held ? this.stuckT + dt : 0
    const wait = inJam ? 2.2 : STUCK // (in the jam it sits at the red a moment first)
    if (this.stuckT > wait) this.wait(this.stuckT - wait, gap)
    else if (inJam) this.cap = CAPS.red
    else if (!this.plan) this.cap = CAPS.free
    return c
  }

  // sat in the jam: lean on the horn, then take off over it if there is somewhere to come down
  wait (t, gap) {
    this.cap = this.edge.closed ? CAPS.red : CAPS.stuck
    this.horn = HONK.findIndex(h => t < h) % 2 === 1
    if (t < HONK[HONK.length - 1] + 0.6 || this.sim.air < HOP_AIR) return
    const spot = landingSpot(this.edge, this.s, this.traffic, gap + 10)
    if (!spot) {
      this.stuckT = 0 // nowhere to land yet: wait some more
      return
    }
    this.hop = new Hop(this.sim, spot, this.traffic)
    this.cap = CAPS.hop
    this.horn = false
  }
  // On its way to the gridlock the lights go its way, a green wave: every one on the route turns
  // green for it as soon as Autopilot starts (after the cross street's yellow), so each is green
  // by the time it gets there, and goes back to its cycle once it is through. In the jam, the light
  // at the far end of the street turns red and holds the gridlock up. Over it, the wave carries on
  // wherever it drives: the light at the end of the street it is on turns green for it.
  lights (lane) {
    const t = this.traffic.t
    // the junctions still ahead on the way, with the way it goes through each
    const want = new Map()
    if (this.plan && !lane.closed) {
      let L = lane
      if (!lane.road) {
        want.set(NODES[lane.node], lane.dir & 1) // still crossing this one
        L = lane.next[0]
      }
      for (let k = 0; L && !L.closed && k < 16; k++) {
        const c = this.plan.get(L) || this.plan.get(L.twin)
        if (!c) break
        want.set(NODES[L.to], L.dir & 1)
        L = c.next[0]
      }
    } else if (!this.plan && !lane.closed) {
      if (!lane.road) want.set(NODES[lane.node], lane.dir & 1)
      else want.set(NODES[lane.to], lane.dir & 1)
    }
    for (const node of this.held.keys())
      if (!want.has(node)) {
        releaseLight(node, t)
        this.held.delete(node)
      }
    for (const [node, axis] of want)
      if (!this.held.has(node)) {
        holdLight(node, axis, t)
        this.held.set(node, axis)
      }
    if (lane.closed && !this.red) {
      this.red = NODES[lane.to]
      holdLight(this.red, (lane.dir & 1) ^ 1, t)
    }
  }
  // every light it held back on its cycle (when it lands, or hands over)
  releaseLights () {
    const t = this.traffic?.t ?? 0
    for (const node of this.held?.keys() || []) releaseLight(node, t)
    if (this.red) releaseLight(this.red, t)
    this.held = new Map()
    this.red = null
  }
  // back on the road beyond the jam: carry on down the lane it came down on
  landed () {
    this.releaseLights()
    const to = this.hop.to
    this.hop = null
    this.plan = null
    this.stuckT = 0
    this.acc = 0
    this.cap = CAPS.free
    const sim = this.sim
    if (sim.mode !== 'ground') return
    this.edge = to.lane
    this.s = this.project(this.edge, sim.pos.x, sim.pos.z)
    this.next = this.pick(this.edge)
    this.go = null
  }
}
