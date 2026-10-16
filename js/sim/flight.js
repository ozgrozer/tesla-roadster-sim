// Free flight: gravity, cold-gas thrust, attitude control (manoeuvres + stability assist) and contacts.
import * as THREE from 'three'
import { TRACK } from './track.js'
import {
  G,
  CAR,
  AX_X,
  AX_Y,
  AX_Z,
  clamp,
  CORNERS,
  LIFT_ACC
} from './constants.js'

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3()
const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion()

export function stepAir (s, dt, c, main, lift) {
  const m = CAR.mass,
    q = s.quat
  const f = _a.copy(AX_X).applyQuaternion(q)
  const u = _b.copy(AX_Y).applyQuaternion(q)
  // forces
  const acc = _d.set(0, -G, 0)
  acc
    .addScaledVector(f, (main * CAR.mainThrust) / m)
    .addScaledVector(u, lift * LIFT_ACC)
  acc.addScaledVector(s.vel, -CAR.dragK * s.vel.length())
  s.vel.addScaledVector(acc, dt)
  s.com.addScaledVector(s.vel, dt)
  s.gLoad += ((lift * LIFT_ACC) / G - s.gLoad) * Math.min(1, dt * 10)

  // attitude
  const cmd = _c.set(c.roll, c.yaw, c.pitch)
  const w = s.omega
  if (s.man) {
    const ax = s.man.axis // 'x' roll, 'z' pitch, 'y' yaw
    const dir = Math.sign(s.man.target)
    const wAx = w[ax]
    s.man.acc += wAx * dt
    const rem = Math.abs(s.man.target) - dir * s.man.acc
    const aMax =
      ax === 'z' ? CAR.pitchAcc : ax === 'x' ? CAR.rollAcc : CAR.yawAcc
    const wMax = ax === 'z' ? 6.6 : ax === 'x' ? 8.5 : 5
    const wDes =
      dir * Math.min(wMax, Math.sqrt(2 * aMax * 0.85 * Math.max(rem, 0)))
    cmd.set(0, 0, 0)
    cmd[ax] = clamp((wDes - wAx) * 2.0, -1, 1)
    for (const o of ['x', 'y', 'z'])
      if (o !== ax) cmd[o] = clamp(-w[o] * 1.5, -1, 1)
    if (rem < 0.04 || (rem < 0.25 && Math.abs(wAx) < 0.3)) s.man = null
  } else if (c.assist && Math.abs(c.pitch) < 0.05 && Math.abs(c.roll) < 0.05) {
    // stability assist: level the car, keep heading, optional flare pitch
    let hx = f.x,
      hz = f.z
    if (Math.hypot(hx, hz) < 0.25) {
      hx = s.vel.x
      hz = s.vel.z
    }
    if (u.y < 0) {
      hx = -hx
      hz = -hz
    }
    const yawD = Math.atan2(-hz, hx)
    _q.setFromAxisAngle(AX_Y, yawD)
    _q2.setFromAxisAngle(AX_Z, c.flare || 0)
    _q.multiply(_q2)
    if (c.latHold) {
      // bank like a drone to hold the lane centre (z = 0 along the runway)
      const zx = Math.sin(yawD),
        zz = Math.cos(yawD)
      const vLat = s.vel.x * zx + s.vel.z * zz,
        eLat = s.com.x * zx * 0 + s.com.z * zz
      const bank = clamp(-0.07 * (vLat + 0.6 * eLat), -0.25, 0.25)
      _q.multiply(_q2.setFromAxisAngle(AX_X, bank))
    } // desired
    _q2.copy(q).invert()
    _q.multiply(_q2) // error = desired * inv(current)
    if (_q.w < 0) {
      _q.x = -_q.x
      _q.y = -_q.y
      _q.z = -_q.z
      _q.w = -_q.w
    }
    const sinH = Math.sqrt(1 - Math.min(1, _q.w * _q.w))
    const ang = 2 * Math.acos(Math.min(1, _q.w))
    const e =
      sinH > 1e-6
        ? _a.set(_q.x / sinH, _q.y / sinH, _q.z / sinH).multiplyScalar(ang)
        : _a.set(0, 0, 0)
    _q2.copy(q).invert()
    e.applyQuaternion(_q2) // error in body frame
    const kp = 26,
      kd = 9.5
    cmd.x = clamp((kp * e.x - kd * w.x) / CAR.rollAcc, -1, 1)
    cmd.z = clamp((kp * e.z - kd * w.z) / CAR.pitchAcc, -1, 1)
    if (Math.abs(c.yaw) < 0.05) cmd.y = clamp(-w.y * 1.2, -1, 1)
  }
  s.att.roll = cmd.x
  s.att.yaw = cmd.y
  s.att.pitch = cmd.z
  const hasAir = s.air > 0.2
  const k = hasAir ? 1 : 0.05
  w.x += (cmd.x * CAR.rollAcc * k - w.x * 0.15) * dt
  w.y += (cmd.y * CAR.yawAcc * k - w.y * 0.25) * dt
  w.z += (cmd.z * CAR.pitchAcc * k - w.z * 0.15) * dt
  const wl = w.length()
  if (wl > 1e-6) {
    _q.setFromAxisAngle(_a.copy(w).divideScalar(wl), wl * dt)
    q.multiply(_q).normalize()
  }
  if (s.stunt) {
    s.stunt.pitch += w.z * dt
    s.stunt.roll += w.x * dt
    s.stunt.yaw += w.y * dt
    s.stunt.t += dt
  }
  s.syncPose()

  // ground contact
  let minY = Infinity
  for (const p of CORNERS) {
    _a.set(p.x, p.y - CAR.comH, p.z)
      .applyQuaternion(q)
      .add(s.com)
    if (_a.y < minY) minY = _a.y
  }
  if (minY <= 0) {
    const upY = s.up(_b).y
    if (upY > 0.72 && s.vel.y > -13) s.land()
    else
      s.toCrash(upY <= 0.72 ? 'Landed on its side' : 'Hit the ground too hard')
    return
  }
  if (s.hitSolid()) {
    s.toCrash('Mid-air collision')
    return
  }
  checkRampContact(s)
}

export function checkRampContact (s) {
  if (s.attachCooldown > 0) return
  const T = TRACK,
    p = s.com
  if (
    Math.abs(p.z) > T.W / 2 + 0.3 ||
    p.x < T.lip.x - 3 ||
    p.x > T.maxX + 1 ||
    p.y > T.lip.y + 2
  )
    return
  // nearest sample on the profile
  let best = -1,
    bd = Infinity
  for (let i = 0; i < T.n; i += 3) {
    const dx = p.x - T.xs[i],
      dy = p.y - T.ys[i],
      d2 = dx * dx + dy * dy
    if (d2 < bd) {
      bd = d2
      best = i
    }
  }
  for (let i = Math.max(0, best - 3); i <= Math.min(T.n - 1, best + 3); i++) {
    const dx = p.x - T.xs[i],
      dy = p.y - T.ys[i],
      d2 = dx * dx + dy * dy
    if (d2 < bd) {
      bd = d2
      best = i
    }
  }
  const sAt = best * T.ds
  if (sAt < 4.5 || sAt > T.L - 0.3) return
  const th = T.theta(sAt),
    nx = -Math.sin(th),
    ny = Math.cos(th)
  const dn = (p.x - T.xs[best]) * nx + (p.y - T.ys[best]) * ny
  if (dn > CAR.comH + 0.05 || dn < -1.2) return
  const u = s.up(_b)
  const align = u.x * nx + u.y * ny
  if (dn > 0 && align > 0.82) {
    // caught the wall: stick to it
    const tx = Math.cos(th),
      ty = Math.sin(th)
    const f = s.fwd(_a)
    if (f.x * tx + f.y * ty < 0.5) {
      s.toCrash('Hit the wall')
      return
    }
    s.setMode('ramp')
    s.s = sAt
    s.v = s.vel.x * tx + s.vel.y * ty
    s.d = p.z
    s.dVel = 0
    s.man = null
    s.stunt = null
    s.syncPose()
    s.emit('trick', { text: 'Wall catch', pts: 1000 })
  } else s.toCrash('Hit the wall')
}
