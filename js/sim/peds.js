// People on foot: they walk the pavements round the blocks, keeping to a line a metre or three in
// from the kerb, each at their own pace (and a few jogging), some in pairs, some standing about, and
// at each corner some of them cross: they step to the kerb by the crosswalk, wait for the walk (the
// first few seconds of the cross street's green, when the street they cross has red, so they are
// over before it changes) and cross on the stripes to the next block. Now and then someone jaywalks
// (crowd.js). Traffic and Autopilot stop for anyone in the road (traffic.peds). Anyone in the
// Roadster's way (or a car's it sent sliding) dives clear, then walks back to the pavement; nobody
// is ever left under the car; and when it does something frightening close by, people run.
// They live in a bubble round the player, like the traffic: those left far behind turn up ahead,
// as many as the hour, the rain and the neighbourhood draw (footfall.js). In the rain umbrellas
// go up and hoods, and they hurry (shelter.js); some sit on the benches, look in a shop window or
// stand under its canopy out of the rain, some stand talking in threes (linger.js), and a few walk
// a dog (dogs.js). A wreck's driver climbs out and hurries off to the pavement (alight.js).
import { ENV } from './env.js'
import { kerbDist } from './street.js'
import { CROWD } from './crowd.js'
import { DOGS } from './dogs.js'
import { ALIGHT } from './alight.js'
import { PEDBRAIN } from './pedBrain.js'
import { LINGER } from './linger.js'
import { SHELTER } from './shelter.js'
import { FOOTFALL } from './footfall.js'
import { warm } from './traffic.js'
import { CAR, clamp } from './constants.js'
import { rng, BLOCKS } from './city.js'
import {
  LINES,
  ringOf,
  ringAt,
  walkOn,
  crossings,
  nearestOn,
  standBack
} from './pavement.js'

export { ringAt, walkOn, ENV }
let WARM = false
const P = { x: 0, z: 0, hx: 1, hz: 0, piece: 0 }

export class Peds {
  constructor ({ count = 240, radius = 150, seed = 11 } = {}) {
    Object.assign(this, { count, radius })
    this.R = rng(seed)
    // (a second stream for what came later: the weather, the hour, benches, windows, threes and
    // dogs, so the first one's sequence is as it was)
    this.Q = rng(seed * 7 + 3)
    this.list = []
    this.dogs = []
    this.held = new Map() // bench seats taken: seat to who (linger.js)
    this.eve = 0 // how much of an evening it is (footfall.js)
    this.onRoad = [] // in the road just now: what traffic and Autopilot look out for
    this.clock = 0
    this.P = { x: 0, z: 0, hx: 1, hz: 0, piece: 0 }
    this.panic = 0 // how many people are running scared just now (for the sound)
    this.scream = 0 // how many have just started to, this step
    this.panicX = this.panicZ = 0 // where the last fright was
    this.frame = 0
    this.ids = 0
    this.threats = []
    this.ext = [] // threats raised by others (pedBrain.js threat)
    this.hornWas = false
    this.pool = []
    this.me = { x: 0, z: 0, vx: 0, vz: 0, hx: 1, hz: 0, hl: CAR.halfL, hw: CAR.halfW }
  }
  reset (x, z) {
    this.list.length = 0
    this.dogs.length = 0
    this.held.clear()
    this.wasAir = false // (a reset mid-air is no landing)
    this.lastMode = 'ground'
    const n = this.target(x, z)
    for (let i = 0; i < this.count * 4 && this.list.length < n; i++)
      this.spawn(x, z, 0, this.radius)
  }
  // someone on a block's pavement between rMin and rMax from (x, z), out of the view's sight
  spawn (x, z, rMin, rMax, view) {
    const R = this.R
    for (let tries = 0; tries < 20; tries++) {
      const b = BLOCKS[Math.floor(R() * BLOCKS.length)]
      const g = ringOf(b, Math.floor(R() * LINES.length))
      const s = R() * g.len
      ringAt(g, s, P)
      const d = Math.hypot(P.x - x, P.z - z)
      if (d < rMin || d > rMax) continue
      // (never popping up in sight: only behind the camera, or far off)
      const ahead =
        view && (P.x - view.x) * view.fx + (P.z - view.z) * view.fz > 0
      if (ahead && d < 120) continue
      if (!this.welcome(b)) continue
      const p = this.spawnAt(g, s, R() < 0.5 ? 1 : -1)
      this.extras(p, view)
      return p
    }
    return null
  }
  // someone on ring g at s, walking round it in direction dir
  spawnAt (g, s, dir) {
    const R = this.R
    const p = {
      ring: g,
      s,
      dir,
      v: 1.3,
      state: 'walk',
      x: 0,
      z: 0,
      yaw: 0,
      phase: R() * 6.3,
      gait: 1, // stride, 0 standing to 1.6 running
      fright: 0, // arms up as they dive
      hop: 0,
      t: 0,
      piece: 0,
      look: R(), // their clothes and build, for the renderer
      sway: R() * 6.3,
      i: this.ids++,
      lod: 1, // moved every lod-th step
      lodT: 0,
      inRoad: false,
      // (every field anyone sets, so they all keep the same shape)
      v0: 1.3,
      tall: 1,
      wide: 1,
      jog: false,
      head: 0,
      headT: 0,
      act: 0,
      lead: null,
      side: 0,
      idleT: 0,
      fleeT: 0,
      hurry: 0,
      jay: false,
      gone: false,
      cross: null,
      aside: null,
      turned: false,
      stall: 0,
      near: Infinity,
      vx: 0,
      vz: 0,
      back: null,
      // (pedBrain.js: stepping out to pass, how soon they see a car, s stood in the road, down)
      pass: 0,
      alert: 0,
      roadT: 0,
      fall: 0,
      downT: 0,
      dead: false,
      jacked: false,
      fromX: 0,
      fromZ: 0,
      backRing: null,
      backS: 0,
      mate: null, // the one walking with them, if any
      // the rain (shelter.js): an umbrella or not, how hard it must rain before they mind, how far
      // they have taken it (0 to 1), the umbrella up, hunched (and a hood up), running for it, and
      // how much quicker they go
      brolly: false,
      wetK: 0.3,
      wet: 0,
      umb: 0,
      hunch: 0,
      dash: false,
      rush: 1,
      // lingering (linger.js): when next to think of it, the spot, what (1 a seat, 2 a window, 3
      // out of the rain), the leg of it (0 along their line, 1 over, 2 there, 3 back), for how
      // long, and how far down onto a seat
      whimT: 0,
      spot: { x: 0, z: 0, fx: 0, fz: 0, yaw: 0, s: 0, seat: null },
      what: 0,
      leg: 0,
      lingerT: 0,
      sit: 0,
      dog: null // (dogs.js)
    }
    if (!WARM) {
      warm(p) // (see traffic.js)
      warm(p.spot)
      WARM = true
    }
    this.character(p)
    this.outfit(p)
    p.piece = this.place(p)
    this.list.push(p)
    return p
  }
  at (p, out) {
    return ringAt(p.ring, p.s, out)
  }
  place (p) {
    ringAt(p.ring, p.s, P)
    // drifting a little from side to side as they walk (and beside whoever they walk with)
    let o = 0.12 * Math.sin(p.sway) * p.dir + p.side + p.pass
    // (stepping out to pass someone never takes them off the pavement: pedBrain.js)
    if (p.pass && kerbDist(P.x - P.hz * o, P.z + P.hx * o) > -0.5) o -= 2 * p.pass
    p.x = P.x - P.hz * o
    p.z = P.z + P.hx * o
    p.yaw = Math.atan2(-P.hz * p.dir, P.hx * p.dir)
    return P.piece
  }
  // head for (x, z) at speed v; true once there
  toward (p, x, z, v, dt) {
    const dx = x - p.x,
      dz = z - p.z,
      d = Math.sqrt(dx * dx + dz * dz)
    p.yaw = Math.atan2(-dz, dx)
    if (d <= v * dt) {
      p.x = x
      p.z = z
      return true
    }
    p.x += (dx / d) * v * dt
    p.z += (dz / d) * v * dt
    return false
  }

  // threats: the Roadster and anything it sent sliding, as { x, z, vx, vz, hx, hz, hl, hw }
  step (dt, sim, traffic, view) {
    this.clock += dt
    this.traffic = traffic
    const t = traffic.t
    const threats = this.threats
    threats.length = 0
    const pl = sim.mode === 'ground' ? sim.pos : sim.com
    let me = null
    if (sim.mode !== 'ramp' && sim.mode !== 'foot' && pl.y - (sim.floor || 0) < 2.5) {
      me = this.me
      me.x = pl.x
      me.z = pl.z
      me.vx = sim.vel.x
      me.vz = sim.vel.z
      me.hx = Math.cos(sim.yaw)
      me.hz = -Math.sin(sim.yaw)
      me.hl = sim.halfL || CAR.halfL // (its own size, a bus's: the Roadster's by default)
      me.hw = sim.halfW || CAR.halfW
      threats.push(me)
    }
    // (and any car knocked sliding)
    for (const c of traffic.loose)
      if (c.vx * c.vx + c.vz * c.vz > 4) {
        const k = threats.length
        const th = this.pool[k] || (this.pool[k] = { ...this.me })
        th.x = c.x
        th.z = c.z
        th.vx = c.vx
        th.vz = c.vz
        th.hx = c.hx
        th.hz = c.hz
        th.hl = c.len / 2
        th.hw = c.wid / 2
        threats.push(th)
      }
    this.alarms(sim, sim.mode === 'ramp' ? null : pl, traffic)
    if (traffic.exits.length) this.alight(traffic) // (out of their wrecks: alight.js)
    this.think(dt, sim, traffic, me) // (threats, the horn, the road, each other: pedBrain.js)
    // (loud: fast, or on the horn)
    const loud =
      me && (me.vx * me.vx + me.vz * me.vz > 121 || traffic.horn) ? me : null
    this.onRoad.length = 0
    this.frame++
    for (const p of this.list) {
      // (far off, out of the way, every second or fourth step)
      p.lodT += dt
      if (p.lod > 1 && (this.frame + p.i) % p.lod) {
        if (p.inRoad) this.onRoad.push(p)
        continue
      }
      this.move(p, t)
      p.lodT = 0
      this.watch(p, dt, loud)
      for (const th of threats) this.dodge(p, th)
      p.inRoad = p.state !== 'walk' && kerbDist(p.x, p.z) > -0.2
      if (p.inRoad) {
        this.onRoad.push(p)
        this.clear(p, traffic.cars)
      }
    }
    if (this.dogs.length) this.walkDogs(dt, threats, traffic.cars)
    traffic.peds = this.onRoad
    if (this.clock > 0.5) {
      this.clock = 0
      this.recycle(pl.x, pl.z, view)
    }
  }
  // (its step, p.lodT, is read from the person: a number passed in costs an allocation)
  move (p, t) {
    const dt = p.lodT
    p.t += dt
    p.hop = Math.max(0, p.hop - dt * 1.5)
    p.fright = Math.max(0, p.fright - dt * 1.2)
    this.rainy(p)
    const R = this.R
    if (p.state === 'walk') {
      // (quicker in the rain, hunched with shorter steps, or running for it: shelter.js)
      const v = p.v * p.rush
      const pace =
        p.jog || v > 2.2
          ? 1.35
          : clamp(v / 1.35, 0.7, 1.05) * (1 - 0.12 * p.hunch)
      p.gait += (pace - p.gait) * Math.min(1, dt * 3)
      const lead = p.lead
      // (whoever they walk with is crossing at this corner: over with them)
      const over = lead?.cross && !lead.jay && lead.ring === p.ring
      if (over && lead.state !== 'cross') {
        const j = lead.cross.j + (lead.cross.j < 0 ? 0.7 : -0.7)
        p.cross = { ...lead.cross, j }
        p.state = 'kerb'
        return
      }
      const paired = this.follow(p)
      if (!paired) p.s += p.dir * v * dt
      p.sway += dt * 0.7
      const piece = this.place(p)
      // round a corner: now and then over the road instead
      if (piece !== p.piece && piece % 2 === 1 && R() < 0.4 && !paired) {
        const opts = crossings(p.ring.b, (piece - 1) / 2)
        if (opts.length) {
          // (each keeps to their own line along the stripes)
          const pick = opts[Math.floor(R() * opts.length)]
          p.cross = { ...pick, j: (R() - 0.5) * 1.6 }
          p.state = 'kerb'
        }
      } else if (!paired && R() < dt * 0.006) this.jaywalk(p)
      else if (!paired && !p.jog && R() < dt * 0.004) {
        // stopping a moment: a call, a message, a look in a window
        p.state = 'idle'
        p.act = R() < 0.6 ? 1 : 0
        p.idleT = 3 + R() * 12
      }
      p.piece = piece
      if (p.state === 'walk' && !paired) this.whim(p)
    } else if (p.state === 'linger') this.linger(p)
    else if (p.state === 'idle') this.idle(p, dt)
    else if (p.state === 'down') this.lie(p, dt)
    else if (p.state === 'flee') this.flee(p, dt)
    else if (p.state === 'kerb') {
      const [fx, fz] = this.jitter(p.cross, p.cross.from)
      if (this.toward(p, fx, fz, p.v, dt)) {
        p.state = 'wait'
        p.t = 0
        p.turned = false
      }
    } else if (p.state === 'wait') {
      p.gait += (0 - p.gait) * Math.min(1, dt * 4)
      const [tx, tz] = this.jitter(p.cross, p.cross.to)
      p.yaw = Math.atan2(-(tz - p.z), tx - p.x)
      // over on the walk (not in its last half second), once nothing is on the crossing or right
      // at it (nor a police car on a call coming over the junction: traffic.urgent, calls.js)
      if (
        walkOn(p.cross.node, p.cross.axis, t) &&
        walkOn(p.cross.node, p.cross.axis, t + 0.5) &&
        this.clearOver(p.cross) &&
        !this.traffic.urgent(p.cross.node)
      ) {
        p.state = 'cross'
        p.stall = 0
        p.near = Infinity
      }
      // (given up on a light held for Autopilot: on round the block instead)
      else if (p.t > 45) this.join(p, p.ring.b)
    } else if (p.state === 'cross') {
      const v = p.v * Math.max(p.hurry || 1.08, p.rush)
      p.gait += ((v > 2.2 ? 1.35 : 1.05) - p.gait) * Math.min(1, dt * 3)
      // (round a car in the way: first a step aside, out to a line clear of it)
      if (p.aside) {
        const d = Math.hypot(p.aside[0] - p.x, p.aside[1] - p.z)
        if (d < p.near - 0.2) {
          p.near = d
          p.stall = 0
        }
        // (a step aside that gets nowhere is given up after a moment)
        if (
          this.toward(p, p.aside[0], p.aside[1], p.v, dt) ||
          (p.stall += dt) > 1.5
        ) {
          p.aside = null
          p.near = Infinity
        }
      } else {
        const [tx, tz] = this.jitter(p.cross, p.cross.to)
        if (this.toward(p, tx, tz, v, dt)) this.join(p, p.cross.block)
        else {
          // getting nowhere (a car stopped across them, waiting for them to pass): back to the
          // kerb they came from, to wait for the next walk; and if even that is blocked, over
          const d = Math.hypot(tx - p.x, tz - p.z)
          if (d < p.near - 0.3) {
            p.near = d
            p.stall = 0
          } else if ((p.stall += dt) > 8) {
            p.x = tx
            p.z = tz
            this.join(p, p.cross.block)
          } else if (p.stall > 2.5 && !p.turned) {
            p.turned = true
            p.near = Infinity
            p.cross = {
              ...p.cross,
              from: p.cross.to,
              to: p.cross.from,
              block: p.ring.b
            }
          }
        }
      }
    } else if (p.state === 'dodge') {
      p.x += p.vx * dt
      p.z += p.vz * dt
      const k = Math.exp(-dt * 3)
      p.vx *= k
      p.vz *= k
      this.unwall(p) // (a dive into a wall stops at its face)
      if (p.t > 0.7) this.goBack(p)
    } else if (p.state === 'back') {
      // hurrying back to the pavement
      p.gait += (1.4 - p.gait) * Math.min(1, dt * 3)
      ringAt(p.backRing, p.backS, P)
      if (this.toward(p, P.x, P.z, 2.6, dt)) {
        p.ring = p.backRing
        p.s = p.backS
        p.state = 'walk'
        p.piece = this.place(p)
      }
    }
    // The stride: two steps to a cycle, each as long as the legs swing (the renderer swings them
    // 0.42 rad a side at a walk, gait 1), so the feet stay planted as they go. Standing about, the
    // phase keeps time for their gestures.
    const still =
      p.state === 'wait' ||
      p.state === 'idle' ||
      p.state === 'down' ||
      (p.state === 'linger' && p.leg === 2)
    const speed = still
      ? 0
      : p.state === 'back'
      ? 2.6
      : p.state === 'cross'
      ? p.v * Math.max(p.hurry || 1.08, p.rush)
      : p.state === 'walk'
      ? p.v * p.rush
      : p.v
    const stride = 3.5 * p.tall * Math.sin(0.42 * Math.max(0.35, p.gait))
    // (sitting, the clock stops: no gestures, and no steps to be heard)
    p.phase += speed
      ? (dt * speed * Math.PI * 2) / stride
      : p.sit > 0
      ? 0
      : dt * 2
  }
  // where along the stripes this one walks, and waits (back from the kerb)
  jitter (c, [x, z]) {
    return c.axis === 1 ? standBack(c, x, z + c.j) : standBack(c, x + c.j, z)
  }
  join (p, b) {
    // (back alongside whoever they walk with, if they are over too)
    const o = p.lead
    const g =
      o && o.state === 'walk' && o.ring.b === b
        ? o.ring
        : this.lineFor(p, b, Math.floor(this.R() * LINES.length))
    p.ring = g
    p.s = nearestOn(g, p.x, p.z)
    p.state = 'walk'
    p.piece = this.place(p)
    p.cross = p.aside = null
    p.jay = false
    p.hurry = 0
  }
  // drop people far behind and fill in ahead
  recycle (x, z, view) {
    this.list = this.list.filter(p => {
      const d = Math.hypot(p.x - x, p.z - z)
      if (d > this.radius + 40) {
        p.gone = true
        if (p.spot.seat) this.leave(p, true)
        return false
      }
      const seen =
        view && (p.x - view.x) * view.fx + (p.z - view.z) * view.fz > -8
      p.lod = d < 55 || (seen && d < 100) ? 1 : seen || d < 100 ? 2 : 4
      return true
    })
    // as many as the hour, the rain and the neighbourhood draw (footfall.js): too many, and some
    // go indoors; too few, and more come out (enough at a time to keep up with a car at full speed)
    const n = this.target(x, z)
    if (this.list.length > n)
      this.indoors(x, z, view, Math.min(4, this.list.length - n))
    for (let k = 0; k < 40 && this.list.length < n; k++)
      this.spawn(x, z, 100, this.radius, view)
    this.strays()
  }
}
Object.assign(Peds.prototype, CROWD, SHELTER, LINGER, DOGS, FOOTFALL, ALIGHT, PEDBRAIN)
