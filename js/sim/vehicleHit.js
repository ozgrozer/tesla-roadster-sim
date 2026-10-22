// A drivable car's contacts with the city (vehicleSim.js bodies): buildings and walls stop it and
// bounce it off with its mass and its turning inertia (collide.js's impulse), street lights,
// signals and trees snap if it hits them hard enough (breakables.js); a kerb climbed at speed
// jolts the springs, costs some speed and knocks the nose or the tail off line, as the Roadster's
// does (ground.js); the traffic it hits is knocked loose by mass and momentum (wrecks.js). Every
// knock dents it where it landed (carDamage.js), and what happened goes on body.events:
//   { type: 'bump', impact, what, x, z }, { type: 'crash', impact, x, z } (hard), { type: 'kerb' },
//   { type: 'knock', ... } (a post down), { type: 'clash', impact, x, z, car } (a traffic car).
import { clamp } from './constants.js'
import { kerbDist, manholesNear, MANHOLE_R } from './street.js'
import { query, PROMENADE } from './city.js'
import { keepIn } from './edge.js'
import { snap } from './breakables.js'
import { hurt, landed, MIN_HIT } from './carDamage.js'
import { rectRect, rectPost, boxRect, impulse } from './collide.js'
import { loosen } from './wrecks.js'

export const CRASH_AT = 11 // m/s closing speed: a crash, not a bump
const KERB_LOSS = 0.2,
  KERB_DV = 1.4,
  KERB_SPIN = 0.3
const hits = []
const ME = { x: 0, z: 0, fx: 1, fz: 0, hl: 1, hw: 1 }
const FIXED = 1e5 // kg: what a wall's mass counts as for the damage
const KEEP = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }

export function rectOf (b, out = ME) {
  out.x = b.x
  out.z = b.z
  out.fx = b.hx
  out.fz = b.hz
  out.hl = b.len / 2
  out.hw = b.wid / 2
  return out
}

function damage (b, px, pz, impact, mo) {
  if (impact < MIN_HIT) return 0
  const broke = hurt(b, px, pz, impact, mo, b.t, b.tough ?? 1)
  if (b.dmg) {
    // (the player's own, tough, keeps more of its power: modest, not crippling)
    b.limp = 1 - (1 - (b.dmg.limp ?? 1)) * ((b.tough ?? 1) < 1 ? 0.6 : 1)
    if (b.dmg.wreck) b.dead = true
  }
  return broke
}

// Buildings, walls and posts (the city's colliders, and world.solids), and the map's edge
export function collideWorld (b, world) {
  const me = rectOf(b)
  const r = Math.max(b.len, b.wid)
  const list =
    world.city !== false ? query(b.x - r, b.z - r, b.x + r, b.z + r, hits) : []
  if (world.solids) for (const c of world.solids) list.push(c)
  for (const c of list) {
    if (c.down || c.kind === 'car' || c.y0 > b.y + b.hgt || c.y1 <= b.y + 0.3) continue
    // (a ramp's treads and a deck's slab, not far above: driven up onto, not hit: bodyGround.js)
    if ((c.look === 'ramp' || c.look === 'deck') && c.y1 <= b.y + 1.2) continue
    const hit = c.r ? rectPost(me, c) : rectRect(me, boxRect(c))
    if (!hit) continue
    if (c.breakAt) {
      const e = snap(b, c, hit.nx, hit.nz, b.m)
      if (e) {
        b.events.push({ type: 'knock', ...e, by: b.id })
        continue
      }
    }
    const at = c.r ? null : landed(me, boxRect(c))
    b.x += hit.nx * hit.depth
    b.z += hit.nz * hit.depth
    me.x = b.x
    me.z = b.z
    const w0 = b.w
    const impact = impulse(b, null, hit, 0.2, 0.4)
    // (the tyres give: a knock turns the car no faster than this)
    b.w = w0 + clamp(b.w - w0, -2.5, 2.5)
    const px = at ? at.x : hit.px,
      pz = at ? at.z : hit.pz
    const broke = damage(b, px, pz, impact, FIXED)
    if (impact > 0.6)
      b.events.push({ type: 'bump', impact, what: c.kind || 'wall', x: px, z: pz, broke })
    if (impact > CRASH_AT) b.events.push({ type: 'crash', impact, x: px, z: pz })
  }
  if (world.city !== false) {
    KEEP.pos.x = b.x
    KEEP.pos.z = b.z
    KEEP.vel.x = b.vx
    KEEP.vel.z = b.vz
    keepIn(KEEP)
    b.x = KEEP.pos.x
    b.z = KEEP.pos.z
    b.vx = KEEP.vel.x
    b.vz = KEEP.vel.z
  }
}

// An axle climbing a kerb at speed: the wheels climb its edge, the car loses some of its speed
// into it at that axle, the springs are jolted, and a kerb clipped at an angle knocks the nose (or
// the tail) away from it. Coming down off one only jolts the springs.
// each wheel: [along (+ front axle), across (+ left)]
const WHEELS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
]
const TRACK = 0.8 // m from the middle to a wheel, across: a share of the width
const _under = new Set()
export function kerbs (b) {
  const S = b.spec,
    sp = Math.hypot(b.vx, b.vz)
  const fx = b.hx,
    fz = b.hz,
    lx = fz,
    lz = -fx
  const tw = (b.wid / 2) * TRACK
  // (the city's own kerbs: not up on a deck or the hill road)
  const street = (b.y || 0) < 0.3 && Math.abs(b.x) <= PROMENADE && Math.abs(b.z) <= PROMENADE
  const was = b.kerbW || (b.kerbW = [null, null, null, null])
  let told = false
  for (let i = 0; i < 4; i++) {
    const [sa, ss] = WHEELS[i]
    const wx = b.x + fx * (S.wb / 2) * sa + lx * tw * ss,
      wz = b.z + fz * (S.wb / 2) * sa + lz * tw * ss
    const up = street && kerbDist(wx, wz) < 0 // (on the pavement side of the kerb line)
    const before = was[i]
    was[i] = up
    // (a body new here, taken over up on the pavement, say, feels no kerb it never crossed)
    if (before === null || up === before || sp < 0.5) continue
    // the wheel's corner of the body kicked up (or dropped): heave, and pitch and roll by where
    // that wheel is, so one wheel at a time over an angled kerb rocks it corner to corner
    const k = Math.min(1, sp * 0.07)
    b.heaveV += (up ? 0.6 : -0.4) * k
    b.pitchV += sa * (up ? -0.35 : 0.2) * k
    b.rollV += ss * (up ? 0.5 : -0.3) * k
    if (!told) b.events.push({ type: 'kerb', impact: sp, v: sp, up, x: wx, z: wz })
    told = true
    if (!up || sp < 2) continue
    // and climbing it costs that wheel some speed, square to the kerb: an angled one turns the car
    const e = 0.05,
      gx = kerbDist(wx + e, wz) - kerbDist(wx - e, wz),
      gz = kerbDist(wx, wz + e) - kerbDist(wx, wz - e),
      l = Math.hypot(gx, gz)
    if (l < 1e-6) continue
    let nx = gx / l,
      nz = gz / l
    const rx = wx - b.x,
      rz = wz - b.z
    const vx = b.vx + b.w * rz,
      vz = b.vz - b.w * rx
    let vn = vx * nx + vz * nz
    if (vn > 0) {
      nx = -nx
      nz = -nz
      vn = -vn
    }
    const cr = rz * nx - rx * nz,
      kk = 1 / b.m + (cr * cr) / b.I,
      j = Math.min(-vn * KERB_LOSS, KERB_DV) / 2 / kk
    b.vx += (nx * j) / b.m
    b.vz += (nz * j) / b.m
    b.w += clamp((rz * nx * j - rx * nz * j) / b.I, -KERB_SPIN / 2, KERB_SPIN / 2)
  }
  // a wheel dropping into a manhole's lid in the road: a knock up through that corner
  if (!street || sp < 2) return
  _under.clear()
  for (const m of manholesNear(b.x, b.z, 4))
    for (const [sa, ss] of WHEELS) {
      const wx = b.x + fx * (S.wb / 2) * sa + lx * tw * ss,
        wz = b.z + fz * (S.wb / 2) * sa + lz * tw * ss
      if (Math.hypot(wx - m.x, wz - m.z) < MANHOLE_R && !b.holes?.has(m)) {
        const k = Math.min(1, sp * 0.05)
        b.heaveV -= 0.18 * k
        b.rollV -= ss * 0.12 * k
        b.pitchV += sa * 0.08 * k
        b.events.push({ type: 'manhole', v: sp })
      }
      if (Math.hypot(wx - m.x, wz - m.z) < MANHOLE_R) _under.add(m)
    }
  if (_under.size || b.holes?.size) b.holes = new Set(_under)
}

// Two bodies (two cars each driven by a body, vehicleLink.js: the player's and a getaway's, say):
// the overlap shared by mass, momentum traded at the corner that landed (so one struck off its
// middle spins), each dented by the other's mass and told on its own events
const OTHER = { x: 0, z: 0, fx: 1, fz: 0, hl: 1, hw: 1 }
function clash (b, o, tr) {
  if (Math.abs(o.x - b.x) > 14 || Math.abs(o.z - b.z) > 14) return 0
  if ((b.y || 0) > (o.y || 0) + o.hgt || (b.y || 0) + b.hgt < (o.y || 0)) return 0
  const me = rectOf(b),
    B = rectOf(o, OTHER)
  const hit = rectRect(me, B)
  if (!hit) return 0
  const at = landed(me, B)
  const px = at ? at.x : hit.px,
    pz = at ? at.z : hit.pz
  const { nx, nz, depth } = hit
  const share = o.m / (o.m + b.m)
  b.x += nx * depth * share
  b.z += nz * depth * share
  o.x -= nx * depth * (1 - share)
  o.z -= nz * depth * (1 - share)
  const w0 = b.w,
    w1 = o.w
  const impact = impulse(b, o, { nx, nz, depth, px, pz }, 0.25, 0.3)
  b.w = w0 + clamp(b.w - w0, -2.5, 2.5)
  o.w = w1 + clamp(o.w - w1, -2.5, 2.5)
  if (impact < 0.6) return impact
  const broke = damage(b, px, pz, impact, o.m),
    hurtO = damage(o, px, pz, impact, b.m)
  b.events.push({ type: 'clash', impact, x: px, z: pz, car: o.id, broke, nx, nz })
  o.events?.push({ type: 'clash', impact, x: px, z: pz, car: b.id, broke: hurtO, nx: -nx, nz: -nz })
  if (impact > CRASH_AT) b.events.push({ type: 'crash', impact, x: px, z: pz, car: o.id })
  if (impact > 5) tr.hear?.(px, pz, 22)
  return impact
}

// The traffic (traffic.js) against body b: overlap shared out by mass, momentum traded, the car
// knocked loose and dented, its driver honking; a hard one is heard by the people and frightens the
// drivers about. skip: a traffic car that is this body itself (one the player took over).
export function collideTraffic (b, tr, skip = null) {
  const me = rectOf(b)
  for (const car of tr.cars) {
    if (car === skip) continue
    if (car.ctl) {
      // (one driven by a body of its own, the player's or a workstream's: body against body)
      // (and only while that body is what's drawn there: not one left behind when it changed hands)
      const o = car.body
      if (o && o !== b && Math.abs(o.x - car.x) + Math.abs(o.z - car.z) < 1.5) clash(b, o, tr)
      continue
    }
    if (Math.abs(car.x - b.x) > 14 || Math.abs(car.z - b.z) > 14) continue
    if (b.y > (car.y || 0) + car.hgt || b.y + b.hgt < (car.y || 0)) continue // (one on a deck above)
    const B = { x: car.x, z: car.z, fx: car.hx, fz: car.hz, hl: car.len / 2, hw: car.wid / 2 }
    const hit = rectRect(me, B)
    if (!hit) continue
    const at = landed(me, B)
    const px = at ? at.x : hit.px,
      pz = at ? at.z : hit.pz
    const { nx, nz, depth } = hit
    loosen(tr, car)
    const share = car.m / (car.m + b.m)
    b.x += nx * depth * share
    b.z += nz * depth * share
    car.x -= nx * depth * (1 - share)
    car.z -= nz * depth * (1 - share)
    me.x = b.x
    me.z = b.z
    const w0 = b.w
    const impact = impulse(b, car, { nx, nz, depth, px, pz }, 0.25, 0.3)
    b.w = w0 + clamp(b.w - w0, -2.5, 2.5)
    const broke = hurt(car, px, pz, impact, b.m, tr.t) | damage(b, px, pz, impact, car.m)
    if (impact > 0.6)
      b.events.push({ type: 'clash', impact, x: px, z: pz, car: car.id, broke, nx, nz })
    if (impact > CRASH_AT) b.events.push({ type: 'crash', impact, x: px, z: pz, car: car.id })
    if (impact > 5) tr.hear(px, pz, 22)
    if (impact > 2.5 && car.honkT <= 0 && !car.honkIn) car.honkIn = 1.2
    if (impact > 4) {
      tr.shock(car.x, car.z)
      tr.anger?.(car, impact)
    }
  }
}
