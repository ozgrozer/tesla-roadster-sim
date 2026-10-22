// The player: one state for whoever the game is following, on foot or at the wheel, and the
// third-person on-foot movement (walk, run, jump, collision with buildings, posts, cars and kerbs).
// Pure maths on plain objects (no DOM, no three.js), so it runs headless in Node for tests. Everyone
// else READS `player`; only this module and the foot glue (onFoot.js) write it.
//
//   player.mode     'car' at the wheel, 'foot' walking, 'entering' / 'exiting' a car (boarding.js)
//   player.pos      { x, y, z }: the feet on foot, the car's position at the wheel (y the floor)
//   player.heading  rad, the game's yaw convention: facing (cos h, -sin h) in x, z (as sim.yaw and
//                   a traffic car's yaw)
//   player.vehicle  the vehicles.js entry being driven, entered or left (null on foot)
//   player.wanted   0 to 5 (the crime workstream sets it)
import { query, CURB_H, OUTER, PROMENADE } from './city.js'
import { kerbDist, surfaceAt } from './street.js'
import { WALL, onDeck, hillHeight } from './edge.js'
import { clamp, wrapPi } from './constants.js'
import { inTunnel } from './hillroad.js'

// How a person moves: m/s walking (Caps Lock, or the stick part way), jogging (the default, as
// GTA's) and sprinting (Shift), how hard they get up to speed and stop (m/s²),
// steering in the air, how fast they turn to face the way they go (rad/s), the jump's take-off
// speed and the game's gravity (stronger than the world's, as games' are, for a snappy jump), the
// body's radius and height, the most it steps up (a kerb, a low step) without a jump and how far
// down it keeps to the ground walking off one, and how long a knock down lasts.
export const FOOT = {
  walk: 2.0,
  jog: 4.5,
  run: 7.0, // (the sprint)
  accel: 22,
  decel: 26,
  airAccel: 3,
  turn: 14,
  jumpV: 4.6,
  gravity: 16,
  radius: 0.32,
  height: 1.75,
  stepUp: 0.42,
  stepDown: 0.45,
  downT: 1.6
}

export const player = {
  mode: 'car',
  pos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  heading: 0,
  vehicle: null,
  wanted: 0,
  grounded: true,
  speed: 0, // m/s over the ground
  run: 0, // 0 walking, 0.5 jogging, 1 sprinting, eased (the animation's gait)
  dist: 0, // m walked on the ground (footsteps, the stride's phase)
  surface: 'walk',
  floor: 0, // the height of what the feet stand on
  down: 0, // s left lying down after being knocked over
  airT: 0, // s since the feet left the ground
  lift: 0 // m the drawn body is still below the feet after a step up (eased away: footView.js)
}

export const isOnFoot = (p = player) => p.mode === 'foot'
export const isDriving = (p = player) => p.mode === 'car'
// between modes: walking up to a car and getting in, or getting out
export const isBoarding = (p = player) =>
  p.mode === 'entering' || p.mode === 'exiting'

export function setMode (mode, vehicle = player.vehicle, p = player) {
  p.mode = mode
  p.vehicle = vehicle
}
// stand the player at (x, z), facing heading, on the ground there (or at y)
export function placePlayer (x, z, heading = 0, y = null, p = player) {
  p.pos.x = x
  p.pos.z = z
  p.pos.y = y ?? groundBase(x, z)
  p.vel.x = p.vel.y = p.vel.z = 0
  p.heading = heading
  p.grounded = true
  p.speed = p.run = p.airT = p.down = p.lift = 0
  p.floor = p.pos.y
}

// The ground under (x, z) before anything stands on it: the road, the pavement and lots a kerb up
// from it, the hills north of the wall.
export function groundBase (x, z) {
  const inside = Math.abs(x) <= PROMENADE && Math.abs(z) <= PROMENADE
  const kerb = inside && kerbDist(x, z) <= 0 ? CURB_H : 0
  // (in the hill road's tunnel the hill over it is no floor: its road's treads are, as solids)
  return Math.max(kerb, z < -WALL && !inTunnel(x, z) ? hillHeight(x, z) : 0)
}

// The camera-relative move: forward and right (-1 to 1 each, a key or a stick) with the camera
// looking along yaw camYaw, as a direction in the world and how much of the full pace it asks for.
export function moveDir (camYaw, fwd, right, out = { x: 0, z: 0, mag: 0 }) {
  const fx = Math.cos(camYaw),
    fz = -Math.sin(camYaw)
  // (right of the facing (fx, fz) is (-fz, fx))
  let x = fx * fwd - fz * right,
    z = fz * fwd + fx * right
  const l = Math.hypot(x, z)
  out.mag = Math.min(1, l)
  if (l > 1e-6) {
    x /= l
    z /= l
  }
  out.x = x
  out.z = z
  return out
}

// The world the feet move in: the city's colliders, the ground, and cars as oriented rectangles
// ({ x, z, fx, fz, hl, hw, top }). Tests hand in their own.
const _near = []
export const CITY_WORLD = {
  solids: (x0, z0, x1, z1) => query(x0, z0, x1, z1, _near),
  base: groundBase,
  cars: []
}

// (x, z) against a box, as the push out of it for a circle of radius r (null: clear)
const _push = { x: 0, z: 0 }
function pushBox (x, z, r, c) {
  if (c.r) {
    const dx = x - c.x,
      dz = z - c.z,
      d = Math.hypot(dx, dz),
      m = c.r + r
    if (d >= m) return null
    if (d < 1e-6) return ((_push.x = m), (_push.z = 0), _push)
    _push.x = (dx / d) * (m - d)
    _push.z = (dz / d) * (m - d)
    return _push
  }
  const qx = clamp(x, c.x0, c.x1),
    qz = clamp(z, c.z0, c.z1)
  const dx = x - qx,
    dz = z - qz,
    d = Math.hypot(dx, dz)
  if (d >= r) return null
  if (d > 1e-6) {
    _push.x = (dx / d) * (r - d)
    _push.z = (dz / d) * (r - d)
    return _push
  }
  // inside it: out by the nearest side
  const l = x - c.x0 + r,
    rr = c.x1 - x + r,
    b = z - c.z0 + r,
    t = c.z1 - z + r
  const m = Math.min(l, rr, b, t)
  _push.x = m === l ? -l : m === rr ? rr : 0
  _push.z = m === b ? -b : m === t ? t : 0
  return _push
}
// the same against a car's oriented rectangle
function pushRect (x, z, r, c) {
  const dx = x - c.x,
    dz = z - c.z
  const lf = dx * c.fx + dz * c.fz,
    ls = dz * c.fx - dx * c.fz
  const cf = clamp(lf, -c.hl, c.hl),
    cs = clamp(ls, -c.hw, c.hw)
  let nf = lf - cf,
    ns = ls - cs
  const d = Math.hypot(nf, ns)
  if (d >= r) return null
  let k
  if (d > 1e-6) k = (r - d) / d
  else {
    const ef = c.hl - Math.abs(lf),
      es = c.hw - Math.abs(ls)
    if (ef < es) {
      nf = Math.sign(lf || 1)
      ns = 0
      k = ef + r
    } else {
      nf = 0
      ns = Math.sign(ls || 1)
      k = es + r
    }
  }
  nf *= k
  ns *= k
  _push.x = c.fx * nf - c.fz * ns
  _push.z = c.fz * nf + c.fx * ns
  return _push
}
const inRect = (x, z, c) => {
  const dx = x - c.x,
    dz = z - c.z
  return (
    Math.abs(dx * c.fx + dz * c.fz) < c.hl &&
    Math.abs(dz * c.fx - dx * c.fz) < c.hw
  )
}
// a box or post at body height for feet at y: a wall to push out of (anything lower is stepped onto)
const walls = (c, y) =>
  !c.down && c.y0 < y + FOOT.height && c.y1 > y + FOOT.stepUp

// The highest thing the feet at height y can stand on at (x, z): the ground, or the top of a box,
// post or car under them no more than a step up.
export function floorAt (x, z, y, world = CITY_WORLD) {
  let f = world.base(x, z)
  for (const c of world.solids(x - 0.1, z - 0.1, x + 0.1, z + 0.1)) {
    if (c.down || c.y1 > y + FOOT.stepUp || c.y1 <= f) continue
    const over = c.r
      ? Math.hypot(x - c.x, z - c.z) < c.r
      : x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1
    if (over) f = c.y1
  }
  for (const c of world.cars)
    if (c.top <= y + FOOT.stepUp && c.top > f && inRect(x, z, c)) f = c.top
  return f
}

// Whether someone standing at (x, z) with their feet at y would be inside something.
export function blockedAt (x, z, y, world = CITY_WORLD, r = FOOT.radius) {
  for (const c of world.solids(x - r, z - r, x + r, z + r))
    if (walls(c, y) && pushBox(x, z, r, c)) return true
  for (const c of world.cars)
    if (!c.ignore && c.top > y + FOOT.stepUp && pushRect(x, z, r, c))
      return true
  return false
}

// Push the body at p out of everything at its height; returns how many contacts there were
function resolve (p, world) {
  const r = FOOT.radius,
    pos = p.pos
  let n = 0
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const c of world.solids(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
      if (!walls(c, pos.y)) continue
      const q = pushBox(pos.x, pos.z, r, c)
      if (!q) continue
      pos.x += q.x
      pos.z += q.z
      cancel(p.vel, q)
      moved = true
      n++
    }
    for (const c of world.cars) {
      if (c.top <= pos.y + FOOT.stepUp || c.ignore) continue
      const q = pushRect(pos.x, pos.z, r, c)
      if (!q) continue
      pos.x += q.x
      pos.z += q.z
      cancel(p.vel, q)
      moved = true
      n++
    }
    if (!moved) break
  }
  return n
}
// take the part of v going into the surface whose push out is q
function cancel (v, q) {
  const l = Math.hypot(q.x, q.z)
  if (l < 1e-9) return
  const nx = q.x / l,
    nz = q.z / l,
    vn = v.x * nx + v.z * nz
  if (vn < 0) {
    v.x -= vn * nx
    v.z -= vn * nz
  }
}
// the map's edges: the sea (but for the pier), and the walls north, east and south
function keepOnMap (pos, v) {
  if (pos.x < -OUTER && !onDeck(pos.x, pos.z)) {
    pos.x = -OUTER
    if (v.x < 0) v.x = 0
  }
  const W = WALL - 1
  if (pos.x > W) {
    pos.x = W
    if (v.x > 0) v.x = 0
  }
  if (Math.abs(pos.z) > W) {
    pos.z = Math.sign(pos.z) * W
    if (v.z * pos.z > 0) v.z = 0
  }
}

// The pace asked for: ctl.walk (walking held or toggled, or the stick only part way over), ctl.run
// (sprinting), else a jog; mag scales it within its gait. Returns m/s.
export function paceOf (ctl) {
  const mag = ctl ? ctl.mag : 0
  if (mag <= 0.02) return 0
  if (ctl.pace != null) return mag * ctl.pace // (a pace of its own: a lunge at someone, melee.js)
  if (ctl.run) return mag * FOOT.run
  if (ctl.walk || mag < 0.55) return Math.min(1, mag / 0.55) * FOOT.walk
  return FOOT.walk + ((mag - 0.55) / 0.45) * (FOOT.jog - FOOT.walk)
}
// the gait's share (0 walk, 0.5 jog, 1 sprint) for a speed over the ground
export const gaitOf = v =>
  v <= FOOT.walk
    ? 0
    : v <= FOOT.jog
      ? (0.5 * (v - FOOT.walk)) / (FOOT.jog - FOOT.walk)
      : Math.min(1, 0.5 + (0.5 * (v - FOOT.jog)) / (FOOT.run - FOOT.jog))

// One step of walking: ctl { x, z, mag } the way to go (moveDir), walk (walk held), run (sprint
// held), jump (pressed this step). Returns what happened worth a sound or a camera's notice: { landed (the speed coming
// down, m/s, or 0), jumped, stepped (m stepped up) }.
// A long step (a dt spike) is taken as short ones, so nothing is walked through.
const _out = { landed: 0, jumped: false, stepped: 0 }
const MAX_STEP = 1 / 60
const LIFT_EASE = 14 // per s: how fast the drawn body catches up a step it went up
export function stepFoot (p, dt, ctl, world = CITY_WORLD) {
  const out = _out
  out.landed = 0
  out.jumped = false
  out.stepped = 0
  if (!(dt > 0)) return out
  const n = Math.min(30, Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9))),
    h = dt / n
  let landed = 0,
    jumped = false,
    stepped = 0
  for (let i = 0; i < n; i++) {
    footStep(p, h, ctl, world, out)
    landed = Math.max(landed, out.landed)
    jumped = jumped || out.jumped
    if (out.stepped > 0.04) stepped += out.stepped // (a step, not a slope's rise)
    if (out.jumped && ctl) ctl = { ...ctl, jump: false } // (one jump per press)
  }
  out.landed = landed
  out.jumped = jumped
  out.stepped = stepped
  // (the body drawn easing up a step rather than popping up it)
  p.lift = Math.max(-FOOT.stepUp, (p.lift || 0) - stepped) * Math.exp(-LIFT_EASE * dt)
  if (Math.abs(p.lift) < 1e-3) p.lift = 0
  return out
}
function footStep (p, dt, ctl, world, out) {
  out.landed = 0
  out.jumped = false
  out.stepped = 0
  const v = p.vel,
    pos = p.pos
  if (p.down > 0) {
    p.down = Math.max(0, p.down - dt)
    ctl = null // (lying in the road: no say over it for a moment)
  }
  const mag = ctl ? ctl.mag : 0
  const pace = paceOf(ctl)
  // (the gait eased to the pace actually made over the ground: no running on the spot at a wall)
  const ground = Math.min(pace, Math.hypot(v.x, v.z) + 0.5)
  p.run += (gaitOf(ground) - p.run) * Math.min(1, dt * 6)
  const tx = mag > 0.02 ? ctl.x * pace : 0,
    tz = mag > 0.02 ? ctl.z * pace : 0
  // up to speed and to a stop, on the ground; only a little steering in the air
  const dvx = tx - v.x,
    dvz = tz - v.z,
    dv = Math.hypot(dvx, dvz)
  const a = p.grounded ? (pace > 0.1 ? FOOT.accel : FOOT.decel) : FOOT.airAccel
  if (dv > 1e-6) {
    const k = Math.min(1, (a * dt) / dv)
    v.x += dvx * k
    v.z += dvz * k
  }
  // facing the way it goes (or the way it is asked to, setting off)
  if (mag > 0.1 && p.down <= 0) {
    const want = Math.atan2(-ctl.z, ctl.x),
      d = wrapPi(want - p.heading)
    p.heading = wrapPi(
      p.heading + clamp(d, -FOOT.turn * dt, FOOT.turn * dt)
    )
  }
  if (ctl?.jump && p.grounded && p.down <= 0) {
    v.y = FOOT.jumpV
    p.grounded = false
    out.jumped = true
  }
  const x0 = pos.x,
    z0 = pos.z
  pos.x += v.x * dt
  pos.z += v.z * dt
  keepOnMap(pos, v)
  resolve(p, world)
  // down onto the ground, a kerb or a step up, or falling off an edge
  const f = floorAt(pos.x, pos.z, pos.y, world)
  if (p.grounded) {
    if (f > pos.y) {
      out.stepped = f - pos.y
      pos.y = f // (up a step: no more than stepUp, or it would have been a wall)
    } else if (pos.y - f <= FOOT.stepDown) pos.y = f
    else p.grounded = false // (walked off an edge)
    v.y = 0
  }
  if (!p.grounded) {
    p.airT += dt
    v.y -= FOOT.gravity * dt
    pos.y += v.y * dt
    if (pos.y <= f) {
      out.landed = -v.y
      pos.y = f
      v.y = 0
      p.grounded = true
      p.airT = 0
    }
  }
  p.floor = f
  const moved = Math.hypot(pos.x - x0, pos.z - z0)
  p.speed = moved / dt
  if (p.grounded) p.dist += moved
  p.surface = f > world.base(pos.x, pos.z) + 0.3 ? 'roof' : surfaceAt(pos.x, pos.z)
  return out
}

// Knocked over (a car, a fall): thrown along (vx, vz), lying there FOOT.downT s
export function knockDown (p, vx, vz) {
  p.down = FOOT.downT
  p.vel.x = vx
  p.vel.z = vz
  p.vel.y = Math.min(4, Math.hypot(vx, vz) * 0.3)
  p.grounded = false
}

// The first free spot of a list of candidates ({ x, z }) for someone to stand on (null: none).
export function freeSpot (spots, world = CITY_WORLD) {
  for (const s of spots) {
    const y = floorAt(s.x, s.z, world.base(s.x, s.z) + FOOT.stepUp, world)
    if (!blockedAt(s.x, s.z, y, world)) return { x: s.x, z: s.z, y }
  }
  return null
}
