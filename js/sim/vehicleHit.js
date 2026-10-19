// A drivable car's contacts with the city (vehicleSim.js bodies): buildings and walls stop it and
// bounce it off with its mass and its turning inertia (collide.js's impulse), street lights,
// signals and trees snap if it hits them hard enough (breakables.js); a kerb climbed at speed
// jolts the springs, costs some speed and knocks the nose or the tail off line, as the Roadster's
// does (ground.js); the traffic it hits is knocked loose by mass and momentum (wrecks.js). Every
// knock dents it where it landed (carDamage.js), and what happened goes on body.events:
//   { type: 'bump', impact, what, x, z }, { type: 'crash', impact, x, z } (hard), { type: 'kerb' },
//   { type: 'knock', ... } (a post down), { type: 'clash', impact, x, z, car } (a traffic car).
import { clamp } from './constants.js'
import { query } from './city.js'
import { kerbDist } from './street.js'
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
  const broke = hurt(b, px, pz, impact, mo, b.t)
  if (b.dmg) {
    b.limp = b.dmg.limp ?? 1
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
export function kerbs (b) {
  const S = b.spec
  for (const sg of [1, -1]) {
    const ax = b.x + b.hx * (S.wb / 2) * sg,
      az = b.z + b.hz * (S.wb / 2) * sg
    const up = kerbDist(ax, az) < 0 // (on the pavement side of the kerb line)
    const was = sg > 0 ? b.kerbF : b.kerbR
    if (sg > 0) b.kerbF = up
    else b.kerbR = up
    if (up === was) continue
    const sp = Math.hypot(b.vx, b.vz)
    b.heaveV += (up ? 1 : -0.6) * Math.min(1.2, sp * 0.08)
    b.pitchV += sg * (up ? -1 : 0.5) * Math.min(0.6, sp * 0.03)
    if (!up || sp < 2) continue
    const e = 0.05,
      gx = kerbDist(ax + e, az) - kerbDist(ax - e, az),
      gz = kerbDist(ax, az + e) - kerbDist(ax, az - e),
      l = Math.hypot(gx, gz)
    if (l < 1e-6) continue
    let nx = gx / l,
      nz = gz / l
    const rx = ax - b.x,
      rz = az - b.z
    const vx = b.vx + b.w * rz,
      vz = b.vz - b.w * rx
    let vn = vx * nx + vz * nz
    if (vn > 0) {
      nx = -nx
      nz = -nz
      vn = -vn
    }
    const cr = rz * nx - rx * nz,
      k = 1 / b.m + (cr * cr) / b.I,
      j = Math.min(-vn * KERB_LOSS, KERB_DV) / k
    b.vx += (nx * j) / b.m
    b.vz += (nz * j) / b.m
    b.w += clamp((rz * nx * j - rx * nz * j) / b.I, -KERB_SPIN, KERB_SPIN)
    b.events.push({ type: 'kerb', impact: -vn, x: ax, z: az })
  }
}

// The traffic (traffic.js) against body b: overlap shared out by mass, momentum traded, the car
// knocked loose and dented, its driver honking; a hard one is heard by the people and frightens the
// drivers about. skip: a traffic car that is this body itself (one the player took over).
export function collideTraffic (b, tr, skip = null) {
  const me = rectOf(b)
  for (const car of tr.cars) {
    if (car === skip || car.ctl) continue
    if (Math.abs(car.x - b.x) > 14 || Math.abs(car.z - b.z) > 14) continue
    if (b.y > car.hgt) continue
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
