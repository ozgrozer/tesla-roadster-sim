import { roofAt, STEP } from './roofs.js'
import { feel, gripOf, dragOf } from './street.js'
import { TRACK, SOLIDS } from './track.js'
import { collideCity, bumpCars } from './collide.js'
import { G, CAR, LIFT_ACC, clamp, wrapPi } from './constants.js'

// Planar two-axle tyre model: slip angles, a tyre curve that peaks and falls away, friction circle,
// AWD split, load transfer, rolling resistance, aero drag, coast regen, a steering rack turned at the
// speed of a driver's hands, and a handbrake on the rear wheels only. Pulled, it locks the rears,
// which slide (at the sliding tyre's grip) the way they are going; the fronts still steer and the
// front motor still pulls. Let go, and the rear wheels spin back up with the road in a few
// hundredths of a second; a car well sideways by then is past its tyres' peak and slides on until
// they bite, or the driver catches it, or stability control does.

// A tyre's grip against its slip, x: the slip angle in units of its grip over its cornering
// stiffness, so that the force starts out at the stiffness times the slip. It builds like a sine to
// its peak at x = pi / 2 (about 11 degrees on the fronts), then falls away to what a sliding tyre
// keeps (CAR.slideMu), so a tyre pushed past its limit gives less, not more.
const PEAK = Math.PI / 2
export function tyreCurve (x) {
  const a = Math.abs(x)
  const f =
    a < PEAK
      ? Math.sin(a)
      : CAR.slideMu + (1 - CAR.slideMu) * Math.exp(-((a - PEAK) ** 2) / 1.2)
  return Math.sign(x) * f
}
// the steering rack: how fast hands turn the road wheels (rad/s, full lock in a third of a second),
// and the extra speed they come back to the middle at as the car rolls (the tyres' self-aligning
// torque, per m/s)
const HANDS = 1.8,
  CENTRE = 0.08
// the rear wheels spinning back up with the road after the e-brake: the share of their grip they get
// back per second
const SPIN_UP = 12

export function stepGround (s, dt, c, main, lift) {
  const m = CAR.mass,
    v = s.vel
  const Fs = s.suction * CAR.suctionG * G
  const liftA = lift * LIFT_ACC
  if (liftA > G + Fs + 0.3) {
    s.toAir(0.6)
    return
  }
  const Ntot = m * (G + Fs - liftA)
  const cy = Math.cos(s.yaw),
    sy = Math.sin(s.yaw)
  const fx = cy,
    fz = -sy,
    lx = -sy,
    lz = -cy // forward and left unit vectors
  const u = v.x * fx + v.z * fz,
    w = v.x * lx + v.z * lz,
    r = s.yawRate
  const a = CAR.halfWB,
    b = CAR.halfWB,
    mu = CAR.tireMu * gripOf(s) // (less on grass and sand: street.js)
  const dN = clamp(
    (m * s.accLong * CAR.comH) / CAR.wheelbase,
    -0.2 * Ntot,
    0.2 * Ntot
  )
  const Nf = Ntot / 2 - dN,
    Nr = Ntot / 2 + dN
  // the rears' grip (1: all of it): a sliding tyre's while the e-brake locks them, all of it again
  // once they have spun back up with the road
  s.rearGrip = c.ebrake ? CAR.slideMu : Math.min(1, s.rearGrip + dt * SPIN_UP)
  const FmaxF = mu * Nf,
    FmaxR = mu * CAR.rearGrip * Nr * s.rearGrip

  // speed-sensitive steering so a keyboard stays controllable
  const steerMax = 0.6 / (1 + (u * u) / 300)
  // the driver's feel for the limit: the fronts are turned no further than just short of their
  // peak, where they grip hardest (past it they would only scrub and push wide)
  let steerT = c.steer * steerMax
  if (!c.ebrake && u > 3) {
    const aKin = Math.atan2(w + a * r, u),
      aLim = (1.5 * FmaxF) / CAR.corneringF
    steerT = clamp(steerT, aKin - aLim, aKin + aLim)
  }
  // the rack: turned at the speed of hands, and coming back quicker the faster the car rolls
  const centring =
    Math.abs(steerT) < Math.abs(s.steerAng) && steerT * s.steerAng >= 0
  const rate = HANDS + (centring ? CENTRE * Math.abs(u) : 0)
  s.steerAng += clamp(steerT - s.steerAng, -rate * dt, rate * dt)
  const cd = Math.cos(s.steerAng),
    sd = Math.sin(s.steerAng)

  // longitudinal demand at the tyres
  const au = Math.abs(u),
    su = u > 0.02 ? 1 : u < -0.02 ? -1 : 0
  // (with the rears locked by the e-brake, only the front motor's share reaches the road)
  const throttle = c.throttle
  let Fdrive = 0
  if (throttle > 0 && u < CAR.vMax)
    Fdrive +=
      throttle * Math.min(m * CAR.driveAccelMax, CAR.powerW / Math.max(au, 1))
  if (c.reverse > 0 && u > -10) Fdrive -= c.reverse * m * 5
  const coasting =
    c.throttle === 0 && c.reverse === 0 && c.brake === 0 && !c.ebrake
  const Fregen = coasting
    ? m *
      CAR.regenAccel *
      clamp(au / 2.5, 0, 1) *
      Math.min(1, CAR.regenPowerW / (m * CAR.regenAccel * Math.max(au, 1)))
    : 0
  const Fbrake = c.brake * m * CAR.brakeAccel
  let Fxf = 0.4 * Fdrive - su * (0.6 * Fbrake + 0.5 * Fregen)
  let Fxr = 0.6 * Fdrive - su * (0.4 * Fbrake + 0.5 * Fregen)
  // traction control + ABS: keep the grip the tyres are using to corner, leave at least 35% for drive/brakes
  const capF = Math.sqrt(
    Math.max(0.1225 * FmaxF * FmaxF, FmaxF * FmaxF - s.lastFyf * s.lastFyf)
  )
  const capR = Math.sqrt(
    Math.max(0.1225 * FmaxR * FmaxR, FmaxR * FmaxR - s.lastFyr * s.lastFyr)
  )
  Fxf = clamp(Fxf, -capF, capF)
  if (!c.ebrake) Fxr = clamp(Fxr, -capR, capR)

  // front tyre, evaluated in the steered wheel frame
  const wf = w + a * r
  const uwf = u * cd + wf * sd,
    wwf = -u * sd + wf * cd
  const alphaF = Math.atan2(wwf, Math.max(Math.abs(uwf), 2))
  let Fyf = -FmaxF * tyreCurve((CAR.corneringF * alphaF) / FmaxF)
  const wantF = Fyf
  const limF = Math.sqrt(Math.max(0, FmaxF * FmaxF - Fxf * Fxf))
  Fyf = clamp(Fyf, -limF, limF)
  let Fu = Fxf * cd - Fyf * sd,
    Fw = Fxf * sd + Fyf * cd
  let Mz = a * Fw

  // rear tyre: rolling, or locked by the e-brake and sliding
  const wr = w - b * r
  let Fxr2,
    Fyr,
    slideR,
    wantR = 0
  if (c.ebrake) {
    s.slipR = Math.atan2(wr, Math.max(au, 2))
    const vr = Math.hypot(u, wr),
      k = FmaxR / Math.max(vr, 0.6) // (FmaxR is already the sliding grip)
    Fxr2 = -u * k
    Fyr = -wr * k
    slideR = clamp(vr / 3, 0, 1)
  } else {
    Fxr2 = clamp(Fxr, -FmaxR, FmaxR)
    const alphaR = Math.atan2(wr, Math.max(au, 2))
    s.slipR = alphaR
    Fyr = -FmaxR * tyreCurve((CAR.corneringR * alphaR) / FmaxR)
    wantR = Fyr
    const limR = Math.sqrt(Math.max(0, FmaxR * FmaxR - Fxr2 * Fxr2))
    Fyr = clamp(Fyr, -limR, limR)
    slideR = clamp(
      ((CAR.corneringR * Math.abs(alphaR)) / FmaxR - 1.4) / 0.8,
      0,
      1
    )
  }
  Fu += Fxr2 + main * CAR.mainThrust
  Fw += Fyr
  Mz -= b * Fyr
  s.lastFyf = wantF
  s.lastFyr = wantR
  // stability control: when the car rotates faster than the steering asks for, brake a front wheel to counter it
  s.escActive = false
  if (!c.ebrake && s.rearGrip >= 1 && au > 3) {
    const rT = clamp(
      (u * Math.tan(s.steerAng)) / CAR.wheelbase,
      (-mu * G) / au,
      (mu * G) / au
    )
    const over = r - rT
    if (Math.abs(r) > Math.abs(rT) + 0.08 && Math.sign(over) === Math.sign(r)) {
      Mz -= clamp(9000 * over, -0.45 * FmaxF, 0.45 * FmaxF)
      Fu -= Math.sign(u) * Math.min(Math.abs(over) * 2500, 0.15 * FmaxF)
      s.escActive = true
    }
  }

  // rolling resistance + aero drag oppose the motion
  const spd = Math.hypot(u, w)
  const Fres =
    (CAR.rollRes + dragOf(s)) * Ntot * Math.min(1, spd / 0.5) +
    m * CAR.dragK * spd * spd
  if (spd > 1e-4) {
    Fu -= (Fres * u) / spd
    Fw -= (Fres * w) / spd
  }

  // integrate in the world frame
  v.x += ((Fu * fx + Fw * lx) / m) * dt
  v.z += ((Fu * fz + Fw * lz) / m) * dt
  v.y = 0
  s.yawRate += (Mz / CAR.Iz) * dt
  s.yaw = wrapPi(s.yaw + s.yawRate * dt)
  // brakes, regen and rolling resistance can stop the car but never push it backwards
  const pushing = throttle > 0 || c.reverse > 0 || main > 0
  const cy2 = Math.cos(s.yaw),
    sy2 = Math.sin(s.yaw)
  let uN = v.x * cy2 - v.z * sy2
  if (!pushing && u * uN < 0) {
    v.x -= uN * cy2
    v.z += uN * sy2
    uN = 0
  }
  if (
    !pushing &&
    Math.hypot(v.x, v.z) < (c.brake > 0 || c.ebrake ? 0.35 : 0.05)
  ) {
    v.x = 0
    v.z = 0
    s.yawRate = 0
    uN = 0
  }

  s.accLong = clamp(Fu / m, -20, 20) // body-frame longitudinal accel drives load transfer
  s.latAcc = Fw / m
  s.speed = uN
  s.drivePower = Fdrive * u - (Fregen > 0 ? Fregen * au : 0)
  s.regenOn = Fregen > 0
  // traction control and ABS stop wheelspin and lock-ups, so only real sliding (or the e-brake) marks the pad
  const slideF = clamp(
    ((CAR.corneringF * Math.abs(alphaF)) / FmaxF - 1.4) / 0.8,
    0,
    1
  )
  const moving = clamp(spd / 3, 0, 1)
  s.skidF = slideF * moving
  s.skidR = slideR * moving
  s.skid = Math.max(s.skidF, s.skidR)

  const px = s.pos.x
  s.pos.x += v.x * dt
  s.pos.z += v.z * dt
  s.gLoad +=
    (Math.hypot(1 + s.susp * 0.6, s.latAcc / G, (s.accLong / G) * 0.5) -
      s.gLoad) *
    Math.min(1, dt * 10)
  s.syncPose()
  if (s.world === 'city') {
    feel(s) // the kerb, manholes and the surface underfoot
    collideCity(s)
    // on a roof: driven off its edge, down it goes; onto the next roof at about the same height (the
    // building next door, or the other half of a split block), it carries on there
    if (s.floor > 0) {
      const r = roofAt(s.pos.x, s.pos.z, s.floor + STEP)
      if (!r || r.y1 < s.floor - STEP) s.toAir(0.4)
      else if (r !== s.roof) {
        s.roof = r
        s.floor = r.y1
        s.syncPose()
      }
    }
    return
  }

  // enter the wall
  const T = TRACK,
    half = T.W / 2
  if (
    px < T.X0 &&
    s.pos.x >= T.X0 &&
    Math.abs(s.pos.z) < half - 0.5 &&
    Math.cos(s.yaw) > 0.6
  ) {
    s.setMode('ramp')
    s.s = s.pos.x - T.X0
    s.v = v.x
    s.d = s.pos.z
    s.dVel = 0
    s.yawRate = 0
    s.maxRampS = Math.max(s.maxRampS, s.s)
    s.skid = s.skidF = s.skidR = 0
    s.syncPose()
    return
  }
  // bump into the rising part of the ramp or the tower from the ground
  if (
    s.pos.x > T.X0 + 4 &&
    s.pos.x < T.towerX1 + 0.3 &&
    Math.abs(s.pos.z) < half + 1.4
  ) {
    if (Math.hypot(v.x, v.z) > 14) {
      s.toCrash('Hit the ramp')
      return
    }
    s.pos.x = px
    v.x = -v.x * 0.3
    v.z *= 0.5
    s.syncPose()
  }
  bumpCars(s, SOLIDS)
  if (s.hitSolid()) s.toCrash('Hit the tower')
}
