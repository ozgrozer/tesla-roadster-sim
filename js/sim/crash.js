// Crashes: a rigid box tumbling on the ground with impulse-based contact and friction.
import * as THREE from 'three'
import { G, CAR, CORNERS } from './constants.js'
import { pushOut, bounceCity } from './collide.js'

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3()
const _q = new THREE.Quaternion()

export function enterCrash (s, reason) {
  if (s.mode === 'crash') return
  if (s.mode !== 'air') {
    s.syncPose()
    s.com.copy(s.pos).add(s.up(_a).multiplyScalar(CAR.comH))
  }
  const hit = s.hitSolid()
  s.omegaW.copy(s.omega).applyQuaternion(s.quat)
  if (hit && s.world === 'city') pushOut(s, hit)
  else if (hit) {
    s.vel.x *= -0.25
    s.vel.z *= 0.5
    s.vel.y = Math.max(s.vel.y, 2.5)
    s.omegaW.add(
      _a.set(
        Math.random() * 4 - 2,
        Math.random() * 3 - 1.5,
        Math.random() * 4 - 2
      )
    )
    // push out of the obstacle along x
    const cx = (hit.x0 + hit.x1) / 2
    s.com.x = s.com.x > cx ? hit.x1 + 1.3 : hit.x0 - 1.3
  }
  s.setMode('crash')
  s.man = null
  s.stunt = null
  s.crashReason = reason
  s.crashTime = 0
  s.crashSettled = false
  s.emit('crash', { reason, speed: s.vel.length() })
}

export function stepCrash (s, dt) {
  s.crashTime += dt
  s.vel.y -= G * dt
  s.com.addScaledVector(s.vel, dt)
  s.omegaW.multiplyScalar(1 - 0.3 * dt)
  const wl = s.omegaW.length()
  if (wl > 1e-6) {
    _q.setFromAxisAngle(_a.copy(s.omegaW).divideScalar(wl), wl * dt)
    s.quat.premultiply(_q).normalize()
  }
  const m = CAR.mass,
    I = m * 1.1,
    e = 0.28,
    mu = 0.6
  let deepest = null,
    dy = 0
  for (const p of CORNERS) {
    const r = _b.set(p.x, p.y - CAR.comH, p.z).applyQuaternion(s.quat)
    const y = s.com.y + r.y
    if (y < dy) {
      dy = y
      deepest = r.clone()
    }
  }
  if (deepest) {
    s.com.y -= dy * 0.9
    const r = deepest
    const vp = _c
      .copy(s.omegaW)
      .cross(r)
      .add(s.vel)
    if (vp.y < 0) {
      const rn = _d.set(0, 1, 0).cross(r) // n x r, |r x n|^2 same
      const j = (-(1 + e) * vp.y) / (1 / m + rn.lengthSq() / I)
      s.vel.y += j / m
      s.omegaW.add(
        _a
          .copy(r)
          .cross(_d.set(0, j, 0))
          .divideScalar(I)
      )
      const vt = _c
        .copy(s.omegaW)
        .cross(r)
        .add(s.vel)
      vt.y = 0
      const vtl = vt.length()
      if (vtl > 1e-4) {
        const jt = Math.min(mu * j, vtl / (1 / m + r.lengthSq() / I))
        const imp = vt.multiplyScalar(-jt / vtl)
        s.vel.addScaledVector(imp, 1 / m)
        s.omegaW.add(
          _a
            .copy(r)
            .cross(imp)
            .divideScalar(I)
        )
      }
    }
  }
  if (s.world === 'city') bounceCity(s)
  s.pos.copy(s.com).sub(s.up(_a).multiplyScalar(CAR.comH))
  s.gLoad += (0 - s.gLoad) * Math.min(1, dt * 4)
  if (s.crashTime > 1.2 && s.vel.length() < 0.8 && s.omegaW.length() < 0.8)
    s.crashSettled = true
}
