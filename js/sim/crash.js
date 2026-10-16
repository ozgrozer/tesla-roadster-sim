// Crashes: a rigid box tumbling on the ground with impulse-based contact and friction, and getting
// back on the road afterwards, GTA-style.
import * as THREE from 'three'
import { G, TAU, CAR, AX_Y, CORNERS, clamp } from './constants.js'
import { pushOut, bounceCity } from './collide.js'

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3()
const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion()

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
  s.righting = null
  s.man = null
  s.stunt = null
  s.crashReason = reason
  s.crashTime = 0
  s.crashSettled = false
  s.emit('crash', { reason, speed: s.vel.length() })
}

// c: the driver's controls. Once the wreck is down on the road and no longer whirling, a wreck on
// its wheels drives on with any drive key, still moving; one on its side or roof rolls back onto
// them when the driver steers, once it has slowed (A one way, D the other; from its side it always
// goes the short way). The autopilots never steer a wreck: they restart.
export function stepCrash (s, dt, c) {
  s.crashTime += dt
  if (s.righting) return stepRighting(s, dt)
  if (c && s.crashTime > 0.4 && s.com.y < 1.4 && s.omegaW.length() < 3) {
    if (s.up(_a).y > 0.9) {
      if (c.throttle || c.brake || c.reverse || c.steer) return recover(s, true)
    } else if (c.steer && s.vel.length() < 5)
      return startRighting(s, -Math.sign(c.steer))
  }
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

// Roll the wreck over about its long axis (dir +1 clockwise seen from behind, -1 the other way)
// with a little hop, onto its wheels, facing the way it points.
function startRighting (s, dir) {
  const f = s.fwd(_a),
    u = s.up(_b)
  let hx = f.x,
    hz = f.z
  if (Math.hypot(hx, hz) < 0.3) {
    hx = Math.cos(s.yaw)
    hz = -Math.sin(s.yaw)
  }
  // the roll that brings the roof up (none if the car stands on its nose or tail: it just tips)
  let roll = 0
  if (Math.abs(f.y) < 0.8) {
    const py = _c.set(0, 1, 0).addScaledVector(f, -f.y)
    roll = Math.atan2(_d.copy(u).cross(py).dot(f), u.dot(py))
    if (Math.abs(roll) > 2.6 && Math.sign(roll) !== dir)
      roll -= Math.sign(roll) * TAU // on its roof: the way the player steered
  }
  const q0 = s.quat.clone(),
    axis = f.clone()
  const level = new THREE.Quaternion().setFromAxisAngle(
    AX_Y,
    Math.atan2(-hz, hx)
  )
  // what the roll alone leaves over (a nose a little up or down), eased out along the way
  const fix = level.multiply(
    _q.setFromAxisAngle(axis, roll).multiply(q0).invert()
  )
  const k = Math.abs(roll) / Math.PI
  s.righting = {
    t: 0,
    dur: 0.55 + 0.3 * k,
    hop: 0.9 + 0.5 * k,
    y0: s.com.y,
    roll,
    axis,
    q0,
    fix
  }
  s.vel.set(0, 0, 0)
  s.omegaW.set(0, 0, 0)
}
function stepRighting (s, dt) {
  const r = s.righting
  r.t += dt
  const u = Math.min(1, r.t / r.dur),
    e = u * u * (3 - 2 * u)
  _q.setFromAxisAngle(r.axis, r.roll * e).multiply(r.q0)
  s.quat.copy(_q2.identity().slerp(r.fix, e)).multiply(_q)
  s.com.y = r.y0 + (CAR.comH - r.y0) * e + r.hop * Math.sin(Math.PI * u)
  s.pos.copy(s.com).sub(s.up(_a).multiplyScalar(CAR.comH))
  if (u >= 1) recover(s)
}
// Back on the road where the wreck lies: at a standstill, or still sliding along (moving).
function recover (s, moving = false) {
  const f = s.fwd(_a)
  s.yaw = Math.atan2(-f.z, f.x)
  s.pos.set(s.com.x, 0, s.com.z)
  s.yawRate = moving ? clamp(s.omegaW.y, -2, 2) : 0
  if (moving) s.vel.y = 0
  else s.vel.set(0, 0, 0)
  s.omega.set(0, 0, 0)
  s.omegaW.set(0, 0, 0)
  s.speed = s.vel.x * Math.cos(s.yaw) - s.vel.z * Math.sin(s.yaw)
  s.steerAng = s.accLong = s.latAcc = 0
  s.righting = null
  s.crashSettled = false
  s.setMode('ground')
  s.suspV = -1.2
  s.syncPose()
  // at the test site, clear of the parked lineup and the tower it may have come to rest against
  for (let i = 0; i < 3 && s.world === 'site'; i++) {
    const b = s.hitSolid()
    if (!b) break
    s.pos.x =
      s.pos.x > (b.x0 + b.x1) / 2 ? b.x1 + CAR.halfL + 0.3 : b.x0 - CAR.halfL - 0.3
    s.syncPose()
  }
  s.emit('righted')
}
