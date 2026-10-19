// One police car's mind (police.js keeps the force): a traffic car of the police type taken over
// (handover.js takeOver, tag 'police'), driven by a 'police' handling-class body (vehicleSim.js)
// through aiDriver.js. On a chase it routes along the lane graph to where the player is (or was
// last seen); close and in sight it drives straight at them: tailing them at one or two stars,
// ramming at three, and at four or more every other car pulls alongside to box them in. Lost from
// sight, it searches the circle round the last known position; with the stars cleared it switches
// its lights off and drives away. Pure: no DOM.
import { clamp } from './constants.js'
import { steerTo, blocker, unstick, cornerV, Follower } from './aiDriver.js'
import { makeVehicleInput } from './vehicleSim.js'
import { bodyFromTraffic } from './vehicleLink.js'

export const CHASE_V = 40 // m/s on the open road on a chase
export const SEARCH_V = 20
export const DIRECT = 55 // m: closer than this, in sight, it drives straight at its target
export const ROLES = ['tail', 'ram', 'box']

let IDS = 0
export function makeUnit (traffic, at, R, role = 'pursuit') {
  const car = traffic.make(traffic.police, false, R)
  car.parked = true // (so takeOver keeps the traffic's count straight)
  car.x = at.x
  car.z = at.z
  traffic.setYaw(car, at.yaw)
  traffic.takeOver(car, 'police')
  car.siren = role === 'scene' || role === 'pursuit' || role === 'block' || role === 'npc' ? 1 : 0
  const body = bodyFromTraffic(car)
  const v0 = at.v ?? 0
  body.vx = Math.cos(at.yaw) * v0
  body.vz = -Math.sin(at.yaw) * v0
  return {
    id: IDS++,
    car,
    body,
    inp: makeVehicleInput(),
    role, // 'pursuit' | 'block' (a roadblock) | 'npc' (chasing a suspect) | 'scene' (parked at one)
    state: role === 'pursuit' ? 'chase' : role,
    follow: new Follower(),
    target: null, // ('npc': what it chases, { x, z, vx, vz })
    sees: false,
    seeT: 0,
    stuckT: 0,
    revT: 0,
    revSteer: 0,
    age: 0,
    leaveT: 0,
    wpt: null,
    wptT: 0,
    slot: 0,
    x: at.x,
    z: at.z
  }
}

// What a unit chasing the player does at this many stars: 'tail' (follow, pull up beside them when
// they stop), 'ram' or 'box' (alongside, to pin them)
export function roleFor (stars, slot) {
  if (stars >= 4 && slot % 2 === 1) return 'box'
  if (stars >= 3) return 'ram'
  return 'tail'
}

// Where to aim at a target p ({ x, z }) moving at v ({ x, z }), heading h, for a role, from unit u
export function aimAt (u, p, v, h, role, slot = 0) {
  const b = u.body
  const d = Math.hypot(p.x - b.x, p.z - b.z)
  const sp = Math.hypot(v.x, v.z)
  const lead = clamp(d / Math.max(8, Math.abs(b.u)), 0, role === 'tail' ? 0.6 : 1.4)
  const fx = Math.cos(h),
    fz = -Math.sin(h)
  let x = p.x + v.x * lead,
    z = p.z + v.z * lead
  if (role === 'tail' && sp > 3) {
    x -= fx * 7
    z -= fz * 7
  } else if (role === 'box' && sp > 3) {
    const side = slot % 4 < 2 ? 1 : -1
    x += fx * 5 + fz * 3.6 * side
    z += fz * 5 - fx * 3.6 * side
  }
  return { x, z, d, sp }
}

// One step of a unit's mind into its inputs (u.inp). ctx: { stars, seen (anyone has the player in
// sight), player ({ pos, vel, heading, speed }), last ({ x, z }: last known position), radius (the
// search circle's), plan (planner.get), R, cars (the traffic's), grip }
export function think (u, ctx, dt) {
  const b = u.body,
    inp = u.inp
  u.age += dt
  if (u.role === 'block' || u.role === 'scene') {
    inp.throttle = inp.steer = 0
    inp.brake = 1
    inp.handbrake = true
    return
  }
  if (unstick(u, b, inp, dt)) return
  const P = ctx.player
  let tx, tz, v, stopAt = 0
  let direct = false
  if (u.role === 'npc') {
    const t = u.target
    if (!t) return idle(inp)
    const a = aimAt(u, t, { x: t.vx || 0, z: t.vz || 0 }, Math.atan2(-(t.vz || 0), t.vx || 1), 'tail')
    direct = a.d < DIRECT
    tx = a.x
    tz = a.z
    v = Math.min(CHASE_V * 0.85, a.sp + 9)
    if (!direct) ({ tx, tz } = route(u, ctx.plan(t.x, t.z), dt, tx, tz))
  } else if (ctx.stars === 0) {
    u.state = 'leave'
    u.car.siren = 0
    u.leaveT += dt
    if (!u.wpt) {
      // away from the player, a good way off
      const dx = b.x - P.pos.x,
        dz = b.z - P.pos.z,
        l = Math.hypot(dx, dz) || 1
      u.wpt = { x: b.x + (dx / l) * 300, z: b.z + (dz / l) * 300 }
    }
    v = 14
    ;({ tx, tz } = route(u, ctx.plan(u.wpt.x, u.wpt.z), dt, u.wpt.x, u.wpt.z))
  } else if (ctx.seen) {
    u.state = 'chase'
    u.car.siren = 1
    u.wpt = null
    // (on foot: every car pulls up beside them, an officer out to make the arrest)
    const role = P.driving === false ? 'tail' : roleFor(ctx.stars, u.slot)
    const a = aimAt(u, P.pos, P.vel, P.heading, role, u.slot)
    direct = a.d < DIRECT && u.sees
    tx = a.x
    tz = a.z
    // (to a standstill beside a player who has stopped: the bust; ramming at three stars)
    v = role === 'tail' ? Math.min(CHASE_V, a.sp + 10) : CHASE_V * 1.15
    if (P.driving === false && a.d < 40) stopAt = 5
    else if (a.sp < 3 && role === 'tail') stopAt = 4.5
    if (a.sp < 3 && role !== 'tail') stopAt = 2.5
    if (!direct) {
      v = CHASE_V
      ;({ tx, tz } = route(u, ctx.plan(P.pos.x, P.pos.z), dt, tx, tz))
    }
  } else {
    // the search: one point after another inside the circle round the last known position
    u.state = 'search'
    u.car.siren = 1
    u.wptT -= dt
    const L = ctx.last
    if (
      !u.wpt ||
      u.wptT <= 0 ||
      Math.hypot(u.wpt.x - b.x, u.wpt.z - b.z) < 18 ||
      Math.hypot(u.wpt.x - L.x, u.wpt.z - L.z) > ctx.radius
    ) {
      const a = ctx.R() * Math.PI * 2,
        r = Math.sqrt(ctx.R()) * ctx.radius * 0.8
      u.wpt = { x: L.x + Math.cos(a) * r, z: L.z + Math.sin(a) * r }
      u.wptT = 20
    }
    v = SEARCH_V
    ;({ tx, tz } = route(u, ctx.plan(u.wpt.x, u.wpt.z), dt, u.wpt.x, u.wpt.z))
  }
  if (!direct && _t.vmax < Infinity) v = Math.min(v, _t.vmax)
  _t.vmax = Infinity
  v *= ctx.grip ?? 1
  // round what is in front of it (unless it is ramming its way through to the player)
  const ramming = direct && ctx.stars >= 3
  if (!ramming && ctx.cars) {
    const blk = blocker(b, ctx.cars, 26, 2.4, u.car)
    if (blk && blk.d < 16) {
      const fx = Math.cos(b.yaw),
        fz = -Math.sin(b.yaw)
      // (round it on the other side: left of the nose is (fz, -fx))
      tx -= fz * blk.side * 3.4
      tz += fx * blk.side * 3.4
      if (blk.d < 6) v = Math.min(v, blk.v + 2)
    }
  }
  steerTo(b, inp, tx, tz, v, { stopAt })
}
function idle (inp) {
  inp.throttle = inp.steer = 0
  inp.brake = 1
}
// the point to steer for along the route (the plan's), or (fx, fz) straight off it
const _t = { tx: 0, tz: 0, vmax: Infinity }
function route (u, plan, dt, fx, fz) {
  _t.vmax = Infinity
  const look = 10 + 0.55 * Math.abs(u.body.u)
  const pt = u.follow.point(u.body, plan, dt, look)
  // (nearly there, or lost to the graph: straight at it)
  if (!pt || u.follow.left() < 25) {
    _t.tx = fx
    _t.tz = fz
  } else {
    _t.tx = pt.x
    _t.tz = pt.z
    _t.vmax = cornerV(u.body, u.follow, 60)
  }
  return _t
}
