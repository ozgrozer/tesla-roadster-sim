// The wall ride at the test site: the car on the curved wall, held on by its tyres and the suction
// fan (with the 2 G fan it hangs upside down at the top), driven, braked and backed down it, and
// thrown off into the air past its lip or off its sides. sim.js runs it while s.mode is 'ramp'.
import { TRACK } from './track.js'
import { G, CAR, clamp, LIFT_ACC } from './constants.js'

export function stepRamp (s, dt, c, main, lift) {
  const m = CAR.mass,
    T = TRACK
  const th = T.theta(s.s),
    k = T.kappa(s.s)
  const Fs = s.suction * CAR.suctionG * G
  const liftA = lift * LIFT_ACC
  let v = s.v
  const N = v * v * k + G * Math.cos(th) + Fs - liftA // contact normal accel
  if (N < 0) {
    leaveRamp(s)
    s.toAir(0.4)
    return
  }
  const grip = CAR.tireMu * N
  const gT = -G * Math.sin(th)
  let a = gT
  const driveMax = Math.min(
    CAR.driveAccelMax,
    CAR.powerW / (m * Math.max(Math.abs(v), 1)),
    grip
  )
  if (c.throttle > 0) a += c.throttle * driveMax
  if (c.reverse > 0 && v > -10) a -= c.reverse * Math.min(5, grip)
  a += (main * CAR.mainThrust) / m
  const av = Math.abs(v),
    coasting =
      c.throttle === 0 &&
      main === 0 &&
      c.brake === 0 &&
      !c.ebrake &&
      !c.reverse
  const regen = coasting ? CAR.regenAccel * clamp(av / 2.5, 0, 1) : 0
  a -=
    Math.sign(v) *
    (CAR.rollRes * N * Math.min(1, av / 0.5) + CAR.dragK * v * v + regen)
  s.drivePower = (c.throttle * driveMax * v - regen * av) * m
  s.regenOn = regen > 0
  const brk = Math.max(c.brake, c.ebrake ? 1 : 0)
  if (brk > 0) {
    const bmax = brk * Math.min(CAR.brakeAccel, grip)
    if (Math.abs(v) <= 0.3 && c.throttle === 0 && main === 0 && !c.reverse) {
      // static hold: tires can resist gravity along the slope
      if (Math.abs(gT) <= bmax) {
        a = 0
        v = 0
      } else a = gT - Math.sign(gT) * bmax
    } else a -= Math.sign(v) * bmax
  }
  v += a * dt
  s.accLong = a
  s.v = v
  s.s += v * dt
  s.dVel = -c.steer * Math.abs(v) * 0.1
  s.d += s.dVel * dt
  s.steerAng += (c.steer * 0.25 - s.steerAng) * Math.min(1, dt * 8)
  s.maxRampS = Math.max(s.maxRampS, s.s)
  s.gLoad +=
    ((v * v * k + G * Math.cos(th) + liftA) / G - s.gLoad) *
    Math.min(1, dt * 12)
  if (Math.cos(th) < -0.5) s.invertedTime += dt
  if (!s.topAwarded && s.s > T.lipStart) {
    s.topAwarded = true
    s.emit('trick', { text: 'Inverted at 170°', pts: 600 })
  }

  if (s.s < 0) {
    leaveRamp(s)
    s.setMode('ground')
    s.pos.x = T.X0 + s.s
    s.pos.z = s.d
    s.yaw = 0
    s.yawRate = 0
    s.speed = v
    s.vel.set(v, 0, 0)
    s.syncPose()
    return
  }
  if (Math.abs(s.d) > T.W / 2 - 0.45) {
    s.syncPose()
    leaveRamp(s)
    s.toAir(0.5)
    return
  }
  if (s.s >= T.L) {
    s.syncPose()
    leaveRamp(s)
    s.toAir(0.5)
    return
  }
  s.syncPose()
}

function leaveRamp (s) {
  if (s.invertedTime > 1.5)
    s.emit('trick', {
      text: `Inverted hold ${s.invertedTime.toFixed(1)} s`,
      pts: Math.round(s.invertedTime * 120)
    })
  s.invertedTime = 0
}
