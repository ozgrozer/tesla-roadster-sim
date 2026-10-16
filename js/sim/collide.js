// Contacts in the ground plane: oriented boxes (cars, building footprints) and posts (lamps, palms,
// signal masts), resolved with impulses (restitution, friction, spin) so cars bounce off each other
// and off the city. A hard enough hit hands the Roadster over to the tumbling crash model.
import { CAR, clamp } from './constants.js'
import { query, OUTER } from './city.js'

export const CRASH_SPEED = 20 // m/s into something solid before the Roadster tumbles
// The most yaw rate (rad/s) a knock adds on the ground: the tyres on the road soak up the rest, so a
// clipped car or wall corner twitches the Roadster instead of spinning it out of the driver's hands.
const KNOCK_SPIN = 1.8
export const KNOCK_SPEED = 3 // m/s into a street light to knock it flat
const NAMES = {
  building: 'Hit a building',
  lamp: 'Hit a street light',
  palm: 'Hit a palm tree',
  tree: 'Hit a tree',
  signal: 'Hit a traffic light',
  barrier: 'Hit the barrier',
  car: 'Hit a car'
}
export const crashName = kind => NAMES[kind] || 'Crashed'

// Rectangles are { x, z, fx, fz, hl, hw }: centre, unit forward axis, half length and half width.
// The side axis is (-fz, fx).
function extent (r, ax, az) {
  return (
    r.hl * Math.abs(r.fx * ax + r.fz * az) +
    r.hw * Math.abs(r.fx * az - r.fz * ax)
  )
}
// the corner of r furthest along (dx, dz)
function support (r, dx, dz, out) {
  const sl = r.fx * dx + r.fz * dz >= 0 ? 1 : -1
  const sw = r.fx * dz - r.fz * dx >= 0 ? 1 : -1
  out.px = r.x + r.fx * r.hl * sl - r.fz * r.hw * sw
  out.pz = r.z + r.fz * r.hl * sl + r.fx * r.hw * sw
}
const _hit = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 }
// Separating-axis test. On overlap returns the normal pointing from b to a, the depth and a contact point.
export function rectRect (a, b, out = _hit) {
  const dx = a.x - b.x,
    dz = a.z - b.z
  let best = Infinity,
    nx = 0,
    nz = 0,
    onB = false
  for (let k = 0; k < 4; k++) {
    const r = k < 2 ? a : b
    const ax = k & 1 ? -r.fz : r.fx,
      az = k & 1 ? r.fx : r.fz
    const d = dx * ax + dz * az
    const o = extent(a, ax, az) + extent(b, ax, az) - Math.abs(d)
    if (o <= 0) return null
    if (o < best) {
      best = o
      nx = d >= 0 ? ax : -ax
      nz = d >= 0 ? az : -az
      onB = k >= 2
    }
  }
  out.nx = nx
  out.nz = nz
  out.depth = best
  // a's deepest corner against b's face, or b's deepest corner against a's
  if (onB) support(a, -nx, -nz, out)
  else support(b, nx, nz, out)
  return out
}
// Rectangle a against a post p ({ x, z, r }); the normal points from the post to a.
export function rectPost (a, p, out = _hit) {
  const dx = p.x - a.x,
    dz = p.z - a.z
  const lf = dx * a.fx + dz * a.fz,
    ls = dz * a.fx - dx * a.fz
  const cf = clamp(lf, -a.hl, a.hl),
    cs = clamp(ls, -a.hw, a.hw)
  const qx = a.x + a.fx * cf - a.fz * cs,
    qz = a.z + a.fz * cf + a.fx * cs
  let nx = qx - p.x,
    nz = qz - p.z
  const d = Math.hypot(nx, nz)
  if (d >= p.r) return null
  if (d > 1e-6) {
    nx /= d
    nz /= d
    out.depth = p.r - d
  } else {
    // the post's centre is inside the box: leave by the nearer side
    const ef = a.hl - Math.abs(lf),
      es = a.hw - Math.abs(ls)
    const sg = (ef < es ? lf : ls) >= 0 ? -1 : 1
    nx = ef < es ? a.fx * sg : -a.fz * sg
    nz = ef < es ? a.fz * sg : a.fx * sg
    out.depth = Math.min(ef, es) + p.r
  }
  out.nx = nx
  out.nz = nz
  out.px = qx
  out.pz = qz
  return out
}
const _box = { x: 0, z: 0, fx: 1, fz: 0, hl: 0, hw: 0 }
export function boxRect (c, out = _box) {
  out.x = (c.x0 + c.x1) / 2
  out.z = (c.z0 + c.z1) / 2
  out.hl = (c.x1 - c.x0) / 2
  out.hw = (c.z1 - c.z0) / 2
  return out
}

// a traffic car's footprint ({ x, z, hx, hz, len, wid }) as a rectangle
const _car = { x: 0, z: 0, fx: 1, fz: 0, hl: 0, hw: 0 }
export function carRect (car, out = _car) {
  out.x = car.x
  out.z = car.z
  out.fx = car.hx
  out.fz = car.hz
  out.hl = car.len / 2
  out.hw = car.wid / 2
  return out
}

function apply (a, b, jx, jz, rax, raz, rbx, rbz) {
  a.vx += jx / a.m
  a.vz += jz / a.m
  a.w += (raz * jx - rax * jz) / a.I
  if (!b) return
  b.vx -= jx / b.m
  b.vz -= jz / b.m
  b.w -= (rbz * jx - rbx * jz) / b.I
}
// Impulse between bodies { x, z, vx, vz, w (yaw rate), m, I } at contact c (normal from b to a).
// b is null for something fixed. Returns the closing speed at the contact (0 if separating).
export function impulse (a, b, c, e, mu) {
  const rax = c.px - a.x,
    raz = c.pz - a.z
  const rbx = b ? c.px - b.x : 0,
    rbz = b ? c.pz - b.z : 0
  let vx = a.vx + a.w * raz,
    vz = a.vz - a.w * rax
  if (b) {
    vx -= b.vx + b.w * rbz
    vz -= b.vz - b.w * rbx
  }
  const vn = vx * c.nx + vz * c.nz
  if (vn >= 0) return 0
  // effective mass along a direction, spin included
  const k = (ux, uz) => {
    const ca = raz * ux - rax * uz,
      cb = rbz * ux - rbx * uz
    return 1 / a.m + (ca * ca) / a.I + (b ? 1 / b.m + (cb * cb) / b.I : 0)
  }
  const j = (-(1 + e) * vn) / k(c.nx, c.nz)
  apply(a, b, c.nx * j, c.nz * j, rax, raz, rbx, rbz)
  // friction against the sliding along the contact, at most mu times the normal impulse
  const tx = vx - vn * c.nx,
    tz = vz - vn * c.nz,
    vt = Math.hypot(tx, tz)
  if (vt > 1e-4) {
    const ux = tx / vt,
      uz = tz / vt
    const jt = Math.min(mu * j, vt / k(ux, uz))
    apply(a, b, -ux * jt, -uz * jt, rax, raz, rbx, rbz)
  }
  return -vn
}

// ---------- the Roadster against the city ----------
const ME = { x: 0, z: 0, fx: 1, fz: 0, hl: CAR.halfL, hw: CAR.halfW }
export const BODY = { x: 0, z: 0, vx: 0, vz: 0, w: 0, m: CAR.mass, I: CAR.Iz }
// The Roadster's footprint: heading from the yaw on the ground, from the body when airborne.
export function playerRect (s) {
  const onGround = s.mode === 'ground'
  const p = onGround ? s.pos : s.com
  let fx = Math.cos(s.yaw),
    fz = -Math.sin(s.yaw)
  if (!onGround) {
    const f = s.fwd(),
      l = Math.hypot(f.x, f.z)
    if (l > 0.2) {
      fx = f.x / l
      fz = f.z / l
    }
  }
  ME.x = p.x
  ME.z = p.z
  ME.fx = fx
  ME.fz = fz
  return ME
}
export function loadBody (s) {
  const p = s.mode === 'ground' ? s.pos : s.com
  BODY.x = p.x
  BODY.z = p.z
  BODY.vx = s.vel.x
  BODY.vz = s.vel.z
  BODY.w = s.mode === 'ground' ? s.yawRate : 0
  return BODY
}
export function storeBody (s, w0 = s.yawRate) {
  s.vel.x = BODY.vx
  s.vel.z = BODY.vz
  if (s.mode !== 'ground') return
  s.yawRate = w0 + clamp(BODY.w - w0, -KNOCK_SPIN, KNOCK_SPIN)
  s.speed = s.vel.x * Math.cos(s.yaw) - s.vel.z * Math.sin(s.yaw)
}
export function nudge (s, dx, dz) {
  const p = s.mode === 'ground' ? s.pos : s.com
  p.x += dx
  p.z += dz
}

// Over it goes: a hop and a tumble away from whatever the car hit, then the crash model takes over.
export function crashInto (s, hit, impact, reason) {
  const f = playerRect(s)
  const nF = hit.nx * f.fx + hit.nz * f.fz,
    nS = hit.nz * f.fx - hit.nx * f.fz
  const k = clamp(impact * 0.12, 1, 4)
  s.vel.y = Math.max(s.vel.y, Math.min(6, impact * 0.18))
  s.omega.set(-nS * k, s.mode === 'ground' ? s.yawRate : s.omega.y, nF * k)
  s.toCrash(reason)
}

const hits = []
// Ground mode: keep the Roadster out of buildings, posts and the barrier.
export function collideCity (s) {
  const me = playerRect(s)
  query(me.x - 4, me.z - 4, me.x + 4, me.z + 4, hits)
  for (const c of hits) {
    if (c.y0 > 1.2 || c.down) continue // upper storeys are out of reach from the street
    const hit = c.r ? rectPost(me, c) : rectRect(me, boxRect(c))
    if (!hit) continue
    if (
      c.kind === 'lamp' &&
      knock(s, c, -(s.vel.x * hit.nx + s.vel.z * hit.nz))
    )
      continue
    nudge(s, hit.nx * hit.depth, hit.nz * hit.depth)
    me.x = s.pos.x
    me.z = s.pos.z
    const impact = impulse(loadBody(s), null, hit, 0.2, 0.35)
    storeBody(s)
    if (impact > 0.6) s.emit('bump', { impact, what: c.kind })
    if (impact > CRASH_SPEED) {
      s.syncPose()
      crashInto(s, hit, impact, crashName(c.kind))
      return
    }
  }
  // the open ground ends a little way past the city's barrier
  for (const k of ['x', 'z'])
    if (Math.abs(s.pos[k]) > OUTER) {
      s.pos[k] = Math.sign(s.pos[k]) * OUTER
      if (s.vel[k] * s.pos[k] > 0) s.vel[k] = 0
    }
  s.syncPose()
}

// A street light hit hard enough snaps at the base and falls the way the car was going; the car
// barely notices. Returns whether it went down.
export function knock (s, c, impact) {
  if (impact < KNOCK_SPEED) return false
  c.down = true
  s.vel.x *= 0.9
  s.vel.z *= 0.9
  s.emit('knock', { i: c.i, x: c.x, z: c.z, dx: s.vel.x, dz: s.vel.z, impact })
  return true
}

// A tumbling or airborne body whose centre is inside a building: lift it out by the nearest face.
export function pushOut (s, b, margin = 1.3) {
  const p = s.com,
    v = s.vel
  const opts = [
    [b.x0 - margin - p.x, 'x', -1],
    [b.x1 + margin - p.x, 'x', 1],
    [b.z0 - margin - p.z, 'z', -1],
    [b.z1 + margin - p.z, 'z', 1],
    [b.y1 + 0.6 - p.y, 'y', 1]
  ]
  let best = opts[0]
  for (const o of opts) if (Math.abs(o[0]) < Math.abs(best[0])) best = o
  const [d, k, sg] = best
  p[k] += d
  if (v[k] * sg < 0) v[k] *= -0.3
}
// Crash mode: the tumbling Roadster bounces off buildings instead of passing through them.
export function bounceCity (s) {
  const p = s.com
  query(p.x - 3, p.z - 3, p.x + 3, p.z + 3, hits)
  for (const c of hits) {
    if (c.r) continue
    if (
      p.x > c.x0 - 1 &&
      p.x < c.x1 + 1 &&
      p.z > c.z0 - 1 &&
      p.z < c.z1 + 1 &&
      p.y > c.y0 - 1 &&
      p.y < c.y1 + 0.5
    )
      pushOut(s, c, 1)
  }
}
