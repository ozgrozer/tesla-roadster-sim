import { roofAt, STEP } from './roofs.js'
import { TRACK, SOLIDS } from './track.js'
import { smooth, tyreCurve, steer, turnIn } from './tyres.js'
import { feel, gripOf, dragOf, kerbDist } from './street.js'
import { G, CAR, LIFT_ACC, clamp, wrapPi } from './constants.js'
import { collideCity, bumpCars, loadBody, storeBody } from './collide.js'
import {
  BURN_V,
  BURN_GRIP,
  trackMode,
  burnCreep,
  trackDrive,
  driftMoment
} from './drift.js'

// Planar two-axle tyre model: slip angles, a tyre curve that peaks and falls away (tyres.js),
// friction circle, AWD split, load transfer through the springs, rolling resistance, aero drag,
// coast regen, a steering rack turned at the speed of a driver's hands (tyres.js), brakes shared out
// by the load on each axle with ABS, stability control that backs the rears' brakes and regen off
// before they let go sideways and takes the power away while the fronts push wide, and an e-brake:
// pulled with the wheel straight, an emergency stop on all four wheels at their grip whatever the
// throttle is doing; turned, a handbrake on the rear wheels only, biting in a twentieth of a second
// and locking them, so they slide (at the sliding tyre's grip) the way they are going; the fronts
// still steer. Let go, and the rear wheels spin back up with the road in a few hundredths of a
// second; a car well sideways by then is past its tyres' peak and slides on until they bite, or the
// driver catches it. Track Mode's drifts, the handbrake's swing, catching a spin and the burnout's
// donut are in drift.js.

// the rear wheels spinning back up with the road after the e-brake: the share of their grip they get
// back per second
const SPIN_UP = 12
// the e-brake: pulled, it bites in EB_ON s (a quick pull on a lever, or a press of the Park
// button); let go, it lets go at once. With the wheel straight (turned no further than EB_STRAIGHT,
// a stick's small corrections) it is an emergency stop: all four wheels braked as hard as they
// grip, the rears too held at their peak by the ABS rather than locked, as a Tesla's is (a sliding
// tyre keeps only slideMu of its grip). Turned, the rears lock and slide for a handbrake turn.
const EB_ON = 0.06,
  EB_STRAIGHT = 0.1
// the share of their grip the handbrake's locked rears keep backing up (a J-turn)
const HB_GRIP_BACK = 0.4
// Stability control under braking and regen, as a Tesla's does: the rears, light as the weight goes
// onto the nose, are let off their share of the brakes and regen as their slip nears its peak (from
// ESC_CUT of the way there, all of it ESC_CUT_W further on), so that slowing in a corner at the
// limit runs a touch wide rather than swinging the tail round. (Not in Track Mode, nor on the
// handbrake.)
const ESC_CUT = 0.9,
  ESC_CUT_W = 0.5
// The shares of the tyres' grip the drive and the brakes keep, however hard they corner
const DRIVE_FLOOR = 0.12,
  BRAKE_FLOOR = 0.35
const TRANSFER = 0.09 // s: how far behind the acceleration the weight's shift onto an axle follows
const PUSH_IN = 0.08, // s: the understeer control's cut eases in, and the power back
  PUSH_OUT = 0.2,
  HELD_AT = 0.9, // the wheel held this far over (of full lock on the keys) ...
  HELD_WAIT = 0.15, // ... for longer than this (s, a tap on the keys' quick ramp is shorter) ...
  HELD_T = 0.3 // ... and over this long (s) after is a turn the understeer control tightens
const REV_MAX = 9 // m/s: as fast as the car backs up
// the share of an axle's speed into the kerb the car loses as it climbs it (a tyre meeting an 8 cm
// edge rolls over it at about 39 degrees), the most a strike takes (m/s), and the most it turns the
// car (rad/s)
const KERB_LOSS = 0.22,
  KERB_DV = 1.6,
  KERB_SPIN = 0.35
// the drive's front share in Track Mode (none: the rears take it all, or the front motor pulling on
// counter-steered wheels would drag the nose straight), and otherwise
const TRACK_FRONT = 0,
  FRONT = 0.4

// An axle mounting the kerb at speed: the wheels climb its edge and the car loses KERB_LOSS of the
// speed it had into it at that axle (at most KERB_DV m/s a strike: the body's momentum comes through
// the springs, so slamming square into a kerb costs a jolt and some speed, not most of it), and a
// wheel hitting it at an angle knocks the nose (or the tail) away from it, so a kerb clipped fast
// unsettles the car rather than being only a bump in the springs. sg: 1 the front axle, -1 the rear.
function kerb (s, sg) {
  const fx = Math.cos(s.yaw),
    fz = -Math.sin(s.yaw)
  const rx = fx * CAR.halfWB * sg,
    rz = fz * CAR.halfWB * sg
  const x = s.pos.x + rx,
    z = s.pos.z + rz
  // (the kerb's line, from how its distance changes round the axle; its normal turned to face the
  // axle as it comes, whichever side it climbs from: off the road, or up from the beach or a verge)
  const e = 0.05,
    gx = kerbDist(x + e, z) - kerbDist(x - e, z),
    gz = kerbDist(x, z + e) - kerbDist(x, z - e),
    l = Math.hypot(gx, gz)
  if (l < 1e-6) return
  let nx = gx / l,
    nz = gz / l
  const w = s.yawRate,
    vx = s.vel.x + w * rz,
    vz = s.vel.z - w * rx
  let vn = vx * nx + vz * nz
  if (vn > 0) {
    nx = -nx
    nz = -nz
    vn = -vn
  }
  // the impulse that takes that much off the axle's speed into the kerb, through the car's mass and
  // its turning inertia about its middle (as collide.js's impulse works it out)
  const cr = rz * nx - rx * nz,
    k = 1 / CAR.mass + (cr * cr) / CAR.Iz,
    j = Math.min(-vn * KERB_LOSS, KERB_DV) / k
  const b = loadBody(s)
  b.vx += (nx * j) / CAR.mass
  b.vz += (nz * j) / CAR.mass
  // (the knock to its heading no more than KERB_SPIN rad/s: the tyres give, rather than the car
  // snapping round)
  b.w += clamp((rz * nx * j - rx * nz * j) / CAR.Iz, -KERB_SPIN, KERB_SPIN)
  storeBody(s)
}

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
  // the weight thrown forward or back as the car brakes or pulls away, through the springs: it
  // follows the acceleration a moment behind (TRANSFER s), as the body pitches onto the nose or the
  // tail, rather than all at once
  const dNT = clamp(
    (m * s.accLong * CAR.comH) / CAR.wheelbase,
    -0.2 * Ntot,
    0.2 * Ntot
  )
  s.dN += (dNT - s.dN) * Math.min(1, dt / TRANSFER)
  const dN = s.dN
  const Nf = Ntot / 2 - dN,
    Nr = Ntot / 2 + dN
  // the e-brake biting (0 to 1), how straight the wheel is for an emergency stop (1: straight),
  // and the rears' grip (1: all of it): a sliding tyre's while the handbrake locks them, all of it
  // again once they have spun back up with the road
  s.ebLock = c.ebrake ? Math.min(1, s.ebLock + dt / EB_ON) : 0
  const straight = c.ebrake
    ? 1 - smooth((Math.abs(c.steer) - EB_STRAIGHT) / 0.5)
    : 0
  const locked = s.ebLock >= 1 && straight < 0.5
  s.rearLocked = locked
  // (backing up, a J-turn, they keep less again, so the tail swings round without scrubbing the
  // speed away)
  s.rearGrip = locked
    ? s.hbDir < 0
      ? HB_GRIP_BACK
      : CAR.slideMu
    : Math.min(1, s.rearGrip + dt * SPIN_UP)
  // How far the car is sliding: the rear axle's slip (rolling round a tight bend, the car's middle
  // runs at an angle to its nose, but the rear axle runs straight: only a slide moves it sideways)
  const beta = Math.atan2(w - b * r, Math.max(Math.abs(u), 2))
  trackMode(s, c, u, beta, dt)
  const track = s.track && !c.ebrake
  const FmaxF = mu * Nf,
    FmaxR = mu * CAR.rearGrip * Nr * s.rearGrip

  // the driver's hands on the wheel (tyres.js)
  const { slide, push } = steer(s, c, u, w, r, beta, FmaxF, FmaxR, track, dt)
  const cd = Math.cos(s.steerAng),
    sd = Math.sin(s.steerAng)

  // longitudinal demand at the tyres
  const au = Math.abs(u),
    su = u > 0.02 ? 1 : u < -0.02 ? -1 : 0
  // (the e-brake wins over the throttle while it is held: W held through a handbrake turn or a
  // flick into a drift picks up again as soon as it comes off)
  const throttle = c.ebrake ? 0 : c.throttle
  let Fdrive = 0
  if (throttle > 0 && u < CAR.vMax)
    Fdrive +=
      throttle * Math.min(m * CAR.driveAccelMax, CAR.powerW / Math.max(au, 1))
  // Understeer control, as a Tesla's stability control does it: while the wheel is held over, asking
  // the fronts for more than they can grip, the motors' torque is taken away, so on full lock with W
  // held the car comes round at the tyres' limit instead of piling on speed and running ever wider
  // (not in Track Mode: drifting, the driver has the power). Only while the turn is held (s.held
  // builds over HELD_T s with the wheel over HELD_AT or more, and is gone at once without): a tap of
  // the keys at speed, a lane change, is no turn to tighten, and cutting the power for it lurched
  // the car at every correction.
  s.heldT = Math.abs(c.steer) >= HELD_AT ? (s.heldT || 0) + dt : 0
  // (the wait at speed, where a tap is a correction; round a tight corner the cut comes at once)
  s.held = Math.min(1, Math.max(0, (s.heldT - HELD_WAIT * Math.min(1, au / 20)) / HELD_T))
  const pushT = push * s.held
  // (eased: the cut comes in over PUSH_IN s and the power back over PUSH_OUT s, as the motors'
  // torque is ramped, rather than switching in one step as the wheel sweeps through the band)
  s.pushF +=
    (pushT - s.pushF) * Math.min(1, dt / (pushT > s.pushF ? PUSH_IN : PUSH_OUT))
  if (!s.track) Fdrive *= 1 - s.pushF
  s.push = s.track || throttle === 0 ? 0 : s.pushF
  // (backing up, the motors ease off as the car nears its reverse limit, REV_MAX m/s)
  if (c.reverse > 0)
    Fdrive -= c.reverse * m * 5 * clamp((REV_MAX + u) / 1.5, 0, 1)
  const coasting =
    c.throttle === 0 && c.reverse === 0 && c.brake === 0 && !c.ebrake
  const Fregen = coasting
    ? m *
      CAR.regenAccel *
      clamp(au / 2.5, 0, 1) *
      Math.min(1, CAR.regenPowerW / (m * CAR.regenAccel * Math.max(au, 1)))
    : 0
  // (pulled with the wheel straight, the fronts brake as hard as the pedal would, with ABS; turned,
  // it leaves them free, so the locked rears swing the car round)
  const ebFront = s.ebLock * straight
  const Fbrake = Math.min(1, c.brake + ebFront) * m * CAR.brakeAccel
  const burn = !!c.burnout && au < BURN_V && !c.ebrake
  if (burn) {
    Fdrive = 0 // (the rears' push and the fronts' brakes, worked out as one below)
    s.track = true
    s.calm = 0
  }
  // (in Track Mode most of the drive goes to the rears)
  const front = track ? TRACK_FRONT : FRONT
  // (the brakes shared out by the load on each axle, as electronic brake-force distribution does,
  // so the rears, light under braking, are never asked for more than the fronts: a fixed split
  // would have them give up first and the tail come round)
  const bias = Nf / Ntot
  // (the rears let off their brakes and regen near their limit sideways: ESC_CUT; the rear axle's
  // slip in units of its grip over its stiffness, peaking at PEAK: tyres.js)
  const esc = !c.ebrake && !track && !burn && s.rearGrip >= 1 && au > 3
  const xR = (CAR.corneringR * Math.abs(beta)) / FmaxR
  const cut = esc ? smooth((xR - ESC_CUT) / ESC_CUT_W) : 0
  const slow = su * (Fbrake + Fregen)
  let Fxf = front * Fdrive - su * (bias * Fbrake + 0.5 * Fregen)
  let Fxr =
    (1 - front) * Fdrive - su * ((1 - bias) * Fbrake + 0.5 * Fregen) * (1 - cut)
  // traction control and ABS: the drive and the brakes get the grip the tyres aren't using to
  // corner, as the friction circle allows (the drive at least DRIVE_FLOOR of it, so a car cornering
  // at the limit still creeps on rather than stalls; the brakes at least BRAKE_FLOOR, so a corner
  // can always be braked in)
  const cap = (Fmax, Fy, Fx) =>
    Math.sqrt(
      Math.max(
        (Fx * su < 0 ? BRAKE_FLOOR : DRIVE_FLOOR) ** 2 * Fmax * Fmax,
        Fmax * Fmax - Fy * Fy
      )
    )
  const capF = cap(FmaxF, s.lastFyf, Fxf)
  const capR = cap(FmaxR, s.lastFyr, Fxr)
  // (how hard the ABS is working: the fronts asked to brake harder than they can grip)
  s.abs = Fbrake > 0 ? smooth((-su * Fxf - 0.97 * capF) / (0.06 * capF)) : 0
  Fxf = clamp(Fxf, -capF, capF)
  // In Track Mode the rears may spin (drift.js)
  let spin = 0
  if (track && Fxr > 0) {
    const td = trackDrive(s, Fxr, FmaxR, beta, Math.hypot(u, w))
    Fxr = td.Fxr
    spin = td.spin
  } else if (!c.ebrake) Fxr = clamp(Fxr, -capR, capR)
  // (the e-brake on the rears short of locking them: biting, or held at their peak by the ABS in an
  // emergency stop; their motor's share no longer reaches the road)
  else Fxr = -su * Math.min(FmaxR, s.ebLock * FmaxR + Math.max(0, -su * Fxr))
  if (burn) {
    // (the rears' push against the fronts' brakes nets out at a creep: drift.js)
    Fxf = burnCreep(c, u, FmaxF)
    Fxr = 0
    spin = 1
  }

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
  if (locked) {
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
    // (spinning, a tyre holds on sideways far less than its friction circle alone would say)
    const limR = burn
      ? BURN_GRIP * FmaxR
      : Math.sqrt(Math.max(0, FmaxR * FmaxR - Fxr2 * Fxr2)) * (1 - 0.5 * spin)
    Fyr = clamp(Fyr, -limR, limR)
    slideR = clamp(
      ((CAR.corneringR * Math.abs(alphaR)) / FmaxR - 1.4) / 0.8,
      0,
      1
    )
    // (spinning on the power, they smoke and squeal too; in a burnout, standing still)
    slideR = Math.max(
      slideR,
      spin * (burn ? 0.85 * c.throttle : clamp(au / 6, 0, 1))
    )
  }
  Fu += Fxr2 + main * CAR.mainThrust
  Fw += Fyr
  Mz -= b * Fyr
  // the drift's motors, a donut, the handbrake's swing and the spin catch (drift.js)
  Mz += driftMoment(s, c, track, throttle, burn, beta, Fyr, u, w, r, mu, dt)
  Mz += turnIn(u, r, s.steerAng, beta, mu, s.held, track || burn, c.ebrake)
  s.lastFyf = wantF
  s.lastFyr = wantR
  // stability control: when the car rotates faster than the steering asks for, brake a front wheel to
  // counter it (not in Track Mode)
  s.escActive = false
  if (!c.ebrake && !track && s.rearGrip >= 1 && au > 3) {
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
  // (and while it is letting the rears off their brakes or regen)
  if (cut > 0.3 && slow !== 0) s.escActive = true

  const spd = Math.hypot(u, w)

  // rolling resistance + aero drag oppose the motion
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
  s.drivePower = burn
    ? 0.3 * CAR.powerW * c.throttle // (the rears spinning hard against the brakes)
    : Fdrive * u - (Fregen > 0 ? Fregen * au : 0)
  s.burning = burn
  s.rearSpin = spin // (how much the driven rears spin past the road, 0 to 1: Track Mode, burnouts)
  // how fast the rear tyres' tread is spinning past the road in a burnout (m/s), for the wheels,
  // the smoke and the squeal
  s.burnSpin = burn ? 16 * c.throttle : 0
  s.regenOn = Fregen > 0
  // traction control and ABS stop wheelspin and lock-ups, so only real sliding (or the e-brake) marks the pad
  const slideF = clamp(
    ((CAR.corneringF * Math.abs(alphaF)) / FmaxF - 1.4) / 0.8,
    0,
    1
  )
  const moving = clamp(spd / 3, 0, 1)
  s.skidF = slideF * moving
  s.skidR = burn ? slideR : slideR * moving
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
    // (an axle that was on the road a step ago, not reset somewhere else, and is now up on the kerb)
    const st = s.feel,
      near = !!st && Math.hypot(s.pos.x - st.x, s.pos.z - st.z) < 3,
      wasF = near && st.kerb[0],
      wasR = near && st.kerb[1]
    feel(s) // the kerb, manholes and the surface underfoot
    if (s.floor === 0) {
      if (wasF && !st.kerb[0]) kerb(s, 1)
      if (wasR && !st.kerb[1]) kerb(s, -1)
    }
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
    } else {
      // from the street onto the foot of a ramp (the freeway's, a car park's: its first tread is
      // the only landable top this low, plots.js ramp), and on up it as onto the next roof
      const r = roofAt(s.pos.x, s.pos.z, STEP)
      if (r && r.y1 > 0) {
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
