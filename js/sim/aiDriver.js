// A driver at the wheel of a drivable body (vehicleSim.js) for the game's own cars: the police on a
// chase (police.js) and the cars in the street events (ambient.js). It follows the lane graph to a
// goal (route.js: the plan worked out once for every lane, so it reads the way on from wherever it
// has got to), steering by pure pursuit at a point a little ahead on the route, or straight at a
// point when it is close and has it in sight (the player, a suspect), slowing for the corners and
// round anything in front, and backing out when it is stuck against a wall. Pure maths: no DOM.
import { clamp } from './constants.js'
import { snap, routeTo, pathFrom, laneOf, lanePoint } from './route.js'
import { pointAt } from './city.js'

const _p = { x: 0, z: 0, hx: 1, hz: 0 }

// the angle from body b's nose to (x, z): positive to its left (b.yaw's convention: nose (cos, -sin))
export function bearing (b, x, z) {
  const dx = x - b.x,
    dz = z - b.z
  const fx = Math.cos(b.yaw),
    fz = -Math.sin(b.yaw)
  return Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)
}

// A plan to a goal (x, z), shared by every driver going there (route.js routeTo); re-planned only
// once the goal has moved more than `slack` m
export class Planner {
  constructor (slack = 25) {
    this.slack = slack
    this.plans = []
  }
  get (x, z) {
    for (const p of this.plans)
      if (Math.hypot(p.x - x, p.z - z) < this.slack) {
        p.used = true
        return p.plan
      }
    const goal = snap(x, z)
    if (!goal) return null
    const plan = routeTo(goal)
    if (this.plans.length > 6) this.plans.shift()
    this.plans.push({ x, z, plan, used: true })
    return plan
  }
}

// The way a driver works its pedals and wheel to (tx, tz) at up to vWant m/s, into inp
// (makeVehicleInput's shape). Returns the bearing to the point.
export function steerTo (b, inp, tx, tz, vWant, { stopAt = 0 } = {}) {
  const err = bearing(b, tx, tz)
  const d = Math.hypot(tx - b.x, tz - b.z)
  inp.steer = clamp(err * 2.4, -1, 1)
  // round a sharp bend slower, and for a point to stop at, the speed it can stop from in time
  let v = vWant * (1 - Math.min(0.7, Math.abs(err) / 1.4))
  if (stopAt > 0) v = Math.min(v, Math.sqrt(Math.max(0, 2 * 5 * (d - stopAt))))
  const u = b.u
  inp.handbrake = false
  if (Math.abs(err) > 2.2 && u < 4) {
    // behind it: back round in a turn
    inp.throttle = 0
    inp.brake = u > 0.6 ? 1 : 0.8
    inp.steer = -Math.sign(err)
    return err
  }
  inp.throttle = clamp((v - u) * 0.35, 0, 1)
  inp.brake = u > v + 1.5 ? clamp((u - v) * 0.25, 0, 1) : 0
  if (inp.brake > 0) inp.throttle = 0
  return err
}

// A driver following the lane graph: route(b, plan) gives the point to steer for, `look` m on
// along the route from where the body is (null off the graph, or with no plan)
export class Follower {
  constructor () {
    this.at = { lane: null, s: 0 }
    this.pieces = []
    this.t = 0
    this.pt = { x: 0, z: 0 }
    this.far = { x: 0, z: 0 }
  }
  // (laneOf is a look over every lane: done a few times a second)
  point (b, plan, dt, look = 12) {
    if (!plan) return null
    this.t -= dt
    if (this.t <= 0 || !this.at.lane) {
      this.t = 0.25
      const fx = Math.cos(b.yaw),
        fz = -Math.sin(b.yaw)
      laneOf(b.x, b.z, fx, fz, this.at.lane, this.at)
      if (!this.at.lane) return null
      pathFrom(plan, this.at.lane, this.at.s, this.pieces)
    } else {
      // carried along the lane since the last look
      const e = this.at.lane
      this.at.s = clamp((b.x - e.x0) * e.dx + (b.z - e.z0) * e.dz, 0, e.len)
      const first = this.pieces[0]
      if (first && first.e === e) first.s0 = Math.min(first.s1, this.at.s)
    }
    const pt = this.along(look, this.pt)
    if (pt) {
      // (and a point further on, to slow for the corner coming up: cornerV)
      const f = this.along(look + 12 + 1.1 * Math.abs(b.u), this.far)
      if (!f) Object.assign(this.far, pt)
    }
    return pt
  }
  // the point `look` m along the route's pieces (into out)
  along (look, out = this.pt) {
    let left = look
    for (const p of this.pieces) {
      const len = p.s1 - p.s0
      if (left <= len || p === this.pieces[this.pieces.length - 1]) {
        const s = Math.min(p.s1, p.s0 + left)
        if (p.e.kind === 0) lanePoint(p.e, s, out)
        else {
          pointAt(p.e, s, _p)
          out.x = _p.x
          out.z = _p.z
        }
        return out
      }
      left -= len
    }
    return null
  }
  left () {
    let n = 0
    for (const p of this.pieces) n += p.s1 - p.s0
    return n
  }
}

// how fast to go for the corner coming up on the route (f.far: Follower.point's), from vWant
export function cornerV (b, f, vWant) {
  const a = Math.abs(bearing(b, f.far.x, f.far.z))
  return a < 0.2 ? vWant : Math.max(8, vWant * (1 - Math.min(0.75, a / 1.5)))
}

// What is in front of body b among cars (each { x, z, len }): the nearest within `ahead` m and
// `wide` m either side of its line, as { d, side } (side: +1 it is to the left), or null
export function blocker (b, cars, ahead = 26, wide = 2.6, skip = null) {
  const fx = Math.cos(b.yaw),
    fz = -Math.sin(b.yaw)
  let best = null,
    bd = ahead
  for (const c of cars) {
    if (c === skip || c.ctl === b.tag) continue
    const dx = c.x - b.x,
      dz = c.z - b.z
    if (Math.abs(dx) > ahead || Math.abs(dz) > ahead) continue
    const along = dx * fx + dz * fz
    if (along < 1 || along > bd) continue
    const lat = dx * fz - dz * fx
    if (Math.abs(lat) > wide + (c.wid || 2) / 2) continue
    bd = along
    best = { d: along - (c.len || 4.5) / 2 - b.len / 2, side: lat >= 0 ? 1 : -1, v: c.v || 0 }
  }
  return best
}

// Stuck against something (barely moving with the throttle down for a while): back out for a
// moment, wheel turned the other way. Returns whether it is backing out now (inp set).
export function unstick (u, b, inp, dt) {
  if (u.revT > 0) {
    u.revT -= dt
    inp.throttle = 0
    inp.brake = 1
    inp.steer = u.revSteer
    inp.handbrake = false
    return true
  }
  if (inp.throttle > 0.3 && Math.abs(b.u) < 0.8) u.stuckT += dt
  else u.stuckT = Math.max(0, u.stuckT - dt * 2)
  if (u.stuckT > 1.4) {
    u.stuckT = 0
    u.revT = 1.3
    u.revSteer = -Math.sign(inp.steer || 1)
    u.unsticks = (u.unsticks || 0) + 1
  }
  return false
}
