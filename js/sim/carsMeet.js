// Two of the player's sims meeting: the car the player drives (drivable.js: a, its spec sp)
// against the Roadster left in the street (b). Pushed apart by mass, momentum traded, a 'bump' for
// each (heard, and the Roadster dented). Pure, for the Node tests.
import { rectRect, impulse } from './collide.js'
import { CAR } from './constants.js'

export function carsMeet (a, sp, b) {
  const A = rectOf(a, sp.halfL, sp.halfW, RA),
    Bq = rectOf(b, CAR.halfL, CAR.halfW, RB)
  const hit = rectRect(A, Bq)
  if (!hit) return
  const ma = sp.mass,
    mb = CAR.mass,
    share = mb / (ma + mb)
  const pa = a.mode === 'ground' ? a.pos : a.com,
    pb = b.mode === 'ground' ? b.pos : b.com
  pa.x += hit.nx * hit.depth * share
  pa.z += hit.nz * hit.depth * share
  pb.x -= hit.nx * hit.depth * (1 - share)
  pb.z -= hit.nz * hit.depth * (1 - share)
  const ba = body(a, ma, sp.Iz, BA),
    bb = body(b, mb, CAR.Iz, BB)
  const v = impulse(ba, bb, hit, 0.25, 0.3)
  for (const [s, q] of [
    [a, ba],
    [b, bb]
  ]) {
    s.vel.x = q.vx
    s.vel.z = q.vz
    if (s.mode === 'ground') {
      s.speed = s.vel.x * Math.cos(s.yaw) - s.vel.z * Math.sin(s.yaw)
      s.syncPose()
    }
  }
  if (v > 0.6) {
    const e = { impact: v, what: 'car', px: hit.px, pz: hit.pz, nx: hit.nx, nz: hit.nz }
    a.emit('bump', e)
    b.emit('bump', { ...e, nx: -hit.nx, nz: -hit.nz })
  }
}


const RA = { x: 0, z: 0, fx: 1, fz: 0, hl: 1, hw: 1 },
  RB = { ...RA },
  BA = { x: 0, z: 0, vx: 0, vz: 0, w: 0, m: 1, I: 1 },
  BB = { ...BA }
function rectOf (s, hl, hw, out) {
  const p = s.mode === 'ground' ? s.pos : s.com
  out.x = p.x
  out.z = p.z
  out.fx = Math.cos(s.yaw)
  out.fz = -Math.sin(s.yaw)
  out.hl = hl
  out.hw = hw
  return out
}
function body (s, m, I, out) {
  const p = s.mode === 'ground' ? s.pos : s.com
  out.x = p.x
  out.z = p.z
  out.vx = s.vel.x
  out.vz = s.vel.z
  out.w = s.mode === 'ground' ? s.yawRate : 0
  out.m = m
  out.I = I
  return out
}
