// Autopilot in the city: drives the Roadster round the streets through the normal controls, on
// the same lane graph as the traffic. It steers by pure pursuit along its lane, keeps its distance
// to the cars ahead, slows for corners, stops for red lights and gives way when turning left.
import { CAR, clamp, wrapPi, makeControls } from './constants.js'
import { LANES, NODES, GREEN, YELLOW, signal, pointAt } from './city.js'

export const CITY_CAPS = [
  'Autopilot · City',
  'Driving itself downtown',
  'Stops for red lights · gives way · keeps its distance'
]
const CRUISE = 15 // m/s, a little over 50 km/h
const A = 2.5 // comfortable acceleration and braking, m/s^2
const B = 3.5
const LOOK = 70
const DRIVER = { type: 0 } // how traffic.choose sees the Roadster: an ordinary car
const P = { x: 0, z: 0, hx: 1, hz: 0 }

export class CityPilot {
  constructor (sim, traffic) {
    this.sim = sim
    this.traffic = traffic
    this.reset()
  }
  // the same fields the test-site autopilot exposes to the main loop and the HUD
  reset () {
    this.edge = null
    this.next = null
    this.go = null
    this.s = 0
    this.cap = CITY_CAPS.slice()
    this.shot = null
    this.countdown = null
    this.slow = 1
    this.restart = false
  }

  // Join the nearest lane that runs the way the car faces. False if there is none close by.
  join () {
    const s = this.sim,
      fx = Math.cos(s.yaw),
      fz = -Math.sin(s.yaw)
    let best = null,
      bd = 10 * 10
    for (const e of LANES) {
      if (e.dx * fx + e.dz * fz < 0.5) continue
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
    if (!best || s.mode !== 'ground') return false
    this.edge = best
    this.next = this.traffic.choose(best, DRIVER)
    this.go = null
    return true
  }
  // distance along edge e of the point nearest (x, z)
  project (e, x, z) {
    if (e.kind === 0) return (x - e.x0) * e.dx + (z - e.z0) * e.dz
    return wrapPi(Math.atan2(z - e.cz, x - e.cx) - e.a0) * e.sg * e.r
  }

  update () {
    const sim = this.sim,
      c = makeControls()
    c.fan = false
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
      this.next = this.traffic.choose(this.edge, DRIVER)
      this.go = null
      this.s = this.project(this.edge, x, z)
    }
    const v = Math.max(0, sim.speed)
    // a turn from the other lane: pull over when there's room (steering follows the new lane),
    // or go another way if the chance has passed
    const cur = this.edge
    if (cur.road && cur.twin && this.next && !cur.next.includes(this.next)) {
      const me = { s: this.s, v, len: 2 * CAR.halfL }
      if (
        this.s > 4 &&
        this.s < cur.len - 25 &&
        this.traffic.canMerge(cur.twin, me, true)
      ) {
        this.edge = cur.twin
        this.s = this.project(this.edge, x, z)
      } else if (this.s >= cur.len - 25)
        this.next = this.traffic.choose(cur, DRIVER, true)
    }

    // steer for a point a little way up the lane: further at speed, closer through a corner
    const turning =
      this.edge.kind === 1 ||
      (this.next?.kind === 1 && this.edge.len - this.s < 8)
    let e = this.edge,
      n = this.next,
      s = this.s + (turning ? 2.5 + v * 0.3 : 5 + v * 0.45)
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
      vl = 0
    for (const o of this.traffic.cars) {
      if (o.parked && !o.loose) continue
      const dx = o.x - x,
        dz = o.z - z
      if (Math.abs(dx) > LOOK || Math.abs(dz) > LOOK) continue
      const along = dx * hx + dz * hz
      if (
        along <= 0 ||
        Math.abs(dz * hx - dx * hz) > o.wid / 2 + CAR.halfW + 0.5
      )
        continue
      const g = along - CAR.halfL - o.len / 2
      if (g < gap) {
        gap = g
        vl = Math.max(
          0,
          o.loose ? o.vx * hx + o.vz * hz : o.v * (o.hx * hx + o.hz * hz)
        )
      }
    }
    const lane = this.edge
    if (lane.road && this.next && this.go !== lane) {
      const toLine = lane.len - this.s - CAR.halfL
      if (toLine < LOOK && toLine > -1) {
        const node = NODES[lane.to],
          st = signal(node, lane.dir, this.traffic.t)
        let stop = st !== GREEN
        if (st === YELLOW && v * v > 2 * 4 * Math.max(0, toLine - 1)) {
          this.go = lane // too close to stop: carry on through
          stop = false
        }
        if (!stop && this.next.move === 'L' && toLine < 30)
          stop = this.traffic.oncoming(node, lane.dir)
        if (stop && toLine - 1.4 < gap) {
          gap = toLine - 1.4
          vl = 0
        }
      }
    }
    // cruise, slowing early for the corner ahead
    let v0 = Math.min(CRUISE, lane.vmax)
    if (this.next && this.next.vmax < v0)
      v0 = Math.min(
        v0,
        Math.sqrt(
          this.next.vmax ** 2 + 2 * 2 * Math.max(0, lane.len - this.s - 1)
        )
      )
    let acc = A * (1 - (v / Math.max(v0, 0.1)) ** 4)
    if (gap < LOOK) {
      const ss =
        2.5 + Math.max(0, v * 1.3 + (v * (v - vl)) / (2 * Math.sqrt(A * B)))
      acc -= A * (ss / Math.max(gap, 0.2)) ** 2
    }
    // pedals: throttle to speed up or hold, lift off and let regen slow it, brake for more
    if (acc > -0.4) c.throttle = clamp(0.02 + acc / 13, 0, 1)
    else if (acc < -1.4) c.brake = clamp(-acc / 13, 0, 1)
    if (v < 0.3 && gap < 8) {
      c.throttle = 0
      c.brake = 1 // hold at a standstill
    }
    return c
  }
}
