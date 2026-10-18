import { roofAt, STEP } from './roofs.js'
import { feel, gripOf, dragOf } from './street.js'
import { TRACK, SOLIDS } from './track.js'
import { collideCity, bumpCars } from './collide.js'
import { G, CAR, LIFT_ACC, clamp, wrapPi } from './constants.js'

// Planar two-axle tyre model: slip angles, a tyre curve that peaks and falls away, friction circle,
// AWD split, load transfer, rolling resistance, aero drag, coast regen, a steering rack turned at the
// speed of a driver's hands, brakes shared out by the load on each axle with ABS, stability control
// that backs the rears' brakes and regen off before they let go sideways, and an e-brake: pulled
// with the wheel straight, an emergency stop on all four wheels at their grip whatever the throttle
// is doing; turned, a handbrake on the rear wheels only, biting in a twentieth of a second and
// locking them, so they slide (at the sliding tyre's grip) the way they are going; the fronts still
// steer. Let go, and the rear wheels spin back up with the road in a few hundredths of a second; a
// car well sideways by then is past its tyres' peak and slides on until they bite, or the driver
// catches it.
// Track Mode: pulled at speed, the handbrake also has traction and stability control stand back
// and the drive shift to the rears, as in a Tesla's Track Mode with its balance set to the rear, so
// the throttle holds a drift: on the power the driven rears spin up and slide, and the two rear
// motors, one to each wheel, share the torque out between them to hold the drift at the angle the
// driver asks for: steering into the turn holds it or takes it deeper, leaving the wheel be lets it
// slowly unwind (a small flick is a short slide, a big one a long drift), and steering out of it
// unwinds it fast; held there with the power on, the car swings on through straight into a drift
// the other way (a linked drift); lift off and the rears grip and the car straightens. Held in a
// drift, the throttle keeps the pace the drift began at rather than piling on speed, as a drifter
// feathers it, so the tyres' grip carries the car round the corner instead of out wide. Once it is
// lined up again the electronics are back.
// Three GTA-style touches on top: the handbrake with the wheel turned swings the car round at once,
// a car spinning faster than its tyres could carry it is caught once the handbrake is let go, and
// the throttle and brake together at a crawl are a burnout (steered, a donut).

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
// the e-brake: pulled, it bites in EB_ON s (a quick pull on a lever, or a press of the Park
// button); let go, it lets go at once. With the wheel straight (turned no further than EB_STRAIGHT,
// a stick's small corrections) it is an emergency stop: all four wheels braked as hard as they
// grip, the rears too held at their peak by the ABS rather than locked, as a Tesla's is (a sliding
// tyre keeps only slideMu of its grip). Turned, the rears lock and slide for a handbrake turn.
const EB_ON = 0.06,
  EB_STRAIGHT = 0.1
// Stability control under braking and regen, as a Tesla's does: the rears, light as the weight goes
// onto the nose, are let off their share of the brakes and regen as their slip nears its peak (from
// ESC_CUT of the way there, all of it ESC_CUT_W further on), so that slowing in a corner at the
// limit runs a touch wide rather than swinging the tail round. (Not in Track Mode, nor on the
// handbrake.)
const ESC_CUT = 0.9,
  ESC_CUT_W = 0.5
const LOCK = 0.62 // the road wheels' full lock (rad)
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
// Track Mode: the e-brake at more than this speed (m/s) switches it on, and it switches itself off
// once the rear axle has run within this much slip (rad) of straight for CALM s; the drive's front
// share meanwhile (none: the rears take it all, or the front motor pulling on counter-steered wheels
// would drag the nose straight)
const TRACK_IN = 5,
  TRACK_STRAIGHT = 0.09,
  CALM = 0.4,
  TRACK_FRONT = 0
// The handbrake pulled with the wheel turned, GTA-style: the locked rears step out at once rather
// than waiting for the fronts to drag the car round. The yaw moment it adds (N m at full lock, from
// a jog upwards, fading out as the car comes round past HB_FADE rad so it doesn't spin on its own)
const HB_YAW = 7000,
  HB_FADE = 0.9
// Catching a spin, as a driver's hands and GTA's forgiving cars do: off the handbrake, a car turning
// faster than its tyres could carry it round (its grip over its speed, or what the wheel asks for,
// and SPIN_OK rad/s to spare) is eased back, SPIN_K N m per rad/s too fast, at most SPIN_MAX, so a
// handbrake turn stops swinging soon after the handbrake is let go instead of spinning on round.
const SPIN_OK = 0.35,
  SPIN_K = 11000,
  SPIN_MAX = 13000
// A burnout, GTA-style: the throttle and the brake together under BURN_V m/s, the fronts held on
// their brakes and the rears spinning against them in a cloud of smoke; turn the wheel and the rears
// swing out round the fronts, the car turning at up to BURN_R rad/s on full lock (the rears' push
// worked out as a moment of at most BURN_YAW N m, BURN_K N m per rad/s short of it) while it creeps
// forward at up to BURN_CREEP m/s: a donut. Let go of the brake and it leaves on spinning rears, in
// Track Mode.
export const BURN_V = 6
const BURN_R = 2.6,
  BURN_K = 14000,
  BURN_YAW = 17000,
  BURN_CREEP = 1.6,
  BURN_GRIP = 0.15 // the share of their grip spinning rears keep sideways
// the drift the rear motors hold (rad, at most DRIFT_MAX_A), and how it changes (rad/s): deeper
// steering into the turn, unwinding slowly with the wheel left alone and fast steering out; and how
// hard they work at it: N m per rad off, N m per rad/s it is swinging, and at most N m (all of one
// rear tyre's grip against none of the other's, across the track)
const DRIFT_MAX_A = 0.7,
  DRIFT_INTO = 0.5,
  DRIFT_UNWIND = 0.3,
  DRIFT_OUT = 1.2,
  DRIFT_K = 40000,
  DRIFT_D = 9000,
  DRIFT_MAX = 15000
// The drift's pace: held in a drift, the rears get DRIFT_PUSH of their drive at the pace it began
// at, more below it and none DRIFT_BAND m/s or so above (the pace creeping up by DRIFT_GAIN m/s each
// second the power stays on, and coming down to wherever the brakes take it). As the car comes
// round further than asked, the rears are spun less (all of it DRIFT_EASE rad further round), so
// they bite and bring it back; and it hands back to the electronics once it is within DRIFT_END rad
// of straight, not while it is still well sideways (the rears gripping at once would snap it round).
// Steering out with the power on, the drift links: swung DRIFT_LINK rad the other way, it is a drift
// that way.
const DRIFT_PUSH = 0.3,
  DRIFT_BAND = 2,
  DRIFT_GAIN = 0.3,
  DRIFT_EASE = 0.3,
  DRIFT_END = 0.2,
  DRIFT_LINK = 0.15

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
  // the e-brake biting (0 to 1), how straight the wheel is for an emergency stop (1: straight),
  // and the rears' grip (1: all of it): a sliding tyre's while the handbrake locks them, all of it
  // again once they have spun back up with the road
  s.ebLock = c.ebrake ? Math.min(1, s.ebLock + dt / EB_ON) : 0
  const straight = c.ebrake
    ? 1 - smooth((Math.abs(c.steer) - EB_STRAIGHT) / 0.5)
    : 0
  const locked = s.ebLock >= 1 && straight < 0.5
  s.rearLocked = locked
  s.rearGrip = locked ? CAR.slideMu : Math.min(1, s.rearGrip + dt * SPIN_UP)
  // How far the car is sliding: the rear axle's slip (rolling round a tight bend, the car's middle
  // runs at an angle to its nose, but the rear axle runs straight: only a slide moves it sideways)
  const beta = Math.atan2(w - b * r, Math.max(Math.abs(u), 2))
  // Track Mode (s.track): on with the handbrake at speed, off once the car runs straight again
  if (c.ebrake && Math.abs(u) > TRACK_IN) {
    if (!s.track) s.emit('track')
    s.track = true
    s.calm = 0
  } else if (s.track) {
    const straight = Math.abs(beta) < TRACK_STRAIGHT || Math.abs(u) < 3
    s.calm = straight ? s.calm + dt : 0
    // (over once the car has run straight a moment, or swung on through straight: the electronics
    // catch whatever comes next, unless the driver is linking it into a drift the other way)
    const through = s.driftDir && s.driftDir * beta > 0.03
    if ((s.calm > CALM || through) && !s.linking) s.track = false
  }
  const track = s.track && !c.ebrake
  const FmaxF = mu * Nf,
    FmaxR = mu * CAR.rearGrip * Nr * s.rearGrip

  // speed-sensitive steering so a keyboard stays controllable
  const steerMax = 0.6 / (1 + (u * u) / 300)
  // the driver's feel for the limit: the fronts are turned no further than just short of their
  // peak, where they grip hardest (past it they would only scrub and push wide). Sliding, the front
  // wheels follow the slide (the caster: let go of the wheel and they swing round to point the way
  // the car is going, as a real car's do), and the driver steers from there: no input lets the slide
  // run out (hands off, a touch of counter-steer catching the car as it swings further round, as a
  // driver's would), the way into the turn holds it (less, the further round the car is, so it
  // doesn't spin) and the other way catches it.
  let steerT = c.steer * steerMax,
    slide = 0
  if (u > 3) {
    const aKin = Math.atan2(w + a * r, u),
      aLim = (1.5 * FmaxF) / CAR.corneringF,
      ab = Math.abs(beta)
    slide = smooth((ab - 0.1) / 0.14)
    const into =
      c.steer * beta < 0 ? 1 - smooth((ab - 0.35) / 0.4) * 0.9 : 1,
      // (rad/s it is swinging further round)
      grow = (ab - (s.driftA ?? ab)) / dt,
      catchIt =
        c.steer === 0 ? Math.sign(beta) * clamp(grow / 1.2, 0, 1) * 0.8 : 0
    const slid = aKin + (c.steer * into + catchIt) * aLim
    if (c.ebrake) {
      // (handbrake held: the wheel is the driver's, but let go of it, it follows the slide)
      if (c.steer === 0) steerT = aKin * slide
    } else
      steerT =
        clamp(steerT, aKin - aLim, aKin + aLim) * (1 - slide) + slid * slide
    steerT = clamp(steerT, -LOCK, LOCK)
  }
  // the rack: turned at the speed of hands, and coming back quicker the faster the car rolls (or
  // spinning through them as the wheels follow a slide)
  const centring =
    Math.abs(steerT) < Math.abs(s.steerAng) && steerT * s.steerAng >= 0
  const rate =
    HANDS * (1 + 2 * slide) + (centring ? CENTRE * Math.abs(u) : 0)
  s.steerAng += clamp(steerT - s.steerAng, -rate * dt, rate * dt)
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
  if (c.reverse > 0 && u > -10) Fdrive -= c.reverse * m * 5
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
  const front = track ? TRACK_FRONT : 0.4
  // (the brakes shared out by the load on each axle, as electronic brake-force distribution does,
  // so the rears, light under braking, are never asked for more than the fronts: a fixed split
  // would have them give up first and the tail come round)
  const bias = Nf / Ntot
  // (the rears let off their brakes and regen near their limit sideways: ESC_CUT; the rear axle's
  // slip in units of its grip over its stiffness, peaking at PEAK)
  const esc = !c.ebrake && !track && !burn && s.rearGrip >= 1 && au > 3
  const xR = (CAR.corneringR * Math.abs(beta)) / FmaxR
  const cut = esc ? smooth((xR - ESC_CUT) / ESC_CUT_W) : 0
  const slow = su * (Fbrake + Fregen)
  let Fxf = front * Fdrive - su * (bias * Fbrake + 0.5 * Fregen)
  let Fxr =
    (1 - front) * Fdrive - su * ((1 - bias) * Fbrake + 0.5 * Fregen) * (1 - cut)
  // traction control + ABS: keep the grip the tyres are using to corner, leave at least 35% for drive/brakes
  const capF = Math.sqrt(
    Math.max(0.1225 * FmaxF * FmaxF, FmaxF * FmaxF - s.lastFyf * s.lastFyf)
  )
  const capR = Math.sqrt(
    Math.max(0.1225 * FmaxR * FmaxR, FmaxR * FmaxR - s.lastFyr * s.lastFyr)
  )
  // (how hard the ABS is working: the fronts asked to brake harder than they can grip)
  s.abs = Fbrake > 0 ? smooth((-su * Fxf - 0.97 * capF) / (0.06 * capF)) : 0
  Fxf = clamp(Fxf, -capF, capF)
  // In Track Mode the rears may spin: driven harder than they can grip, they transmit most of it
  // and slide sideways, the spin easing in rather than all at once (spin: how much they spin)
  let spin = 0
  if (track && Fxr > 0) {
    // (and past fifty degrees round, the drive to them fades, so they grip and catch it)
    Fxr *= 1 - smooth((Math.abs(beta) - 0.85) / 0.45)
    spin = clamp(Fxr / FmaxR - 0.6, 0, 1)
    Fxr = 0.95 * FmaxR * Math.tanh(Fxr / FmaxR)
    // (in a drift: spun less the further round it is than asked, and no faster than its pace)
    if (s.driftDir) {
      spin *= 1 - smooth((Math.abs(beta) - s.driftWant - 0.05) / DRIFT_EASE)
      Fxr *= clamp(
        DRIFT_PUSH + (s.driftV - Math.hypot(u, w)) / DRIFT_BAND,
        0,
        1
      )
    }
  } else if (!c.ebrake) Fxr = clamp(Fxr, -capR, capR)
  // (the e-brake on the rears short of locking them: biting, or held at their peak by the ABS in an
  // emergency stop; their motor's share no longer reaches the road)
  else Fxr = -su * Math.min(FmaxR, s.ebLock * FmaxR + Math.max(0, -su * Fxr))
  if (burn) {
    // the rears' push against the fronts' brakes nets out at a creep, quicker on full lock
    const creep =
      BURN_CREEP * (0.3 + 0.7 * Math.abs(c.steer)) * c.throttle
    Fxf = clamp(m * 3 * (creep - u), -FmaxF, FmaxF)
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
  // drift control: the rear motors' torque split taking on the rear tyres' own pull straight and
  // turning the car towards the drift angle asked for, the way the drift began (never flicking the
  // car over into one the other way); steering out of the drift, they let it go once it is nearly
  // straight
  const ab = Math.abs(beta),
    swing = (ab - (s.driftA ?? ab)) / dt,
    d = -Math.sign(beta), // 1: the car rotated left of where it is going
    into = c.steer * d
  s.driftA = ab
  if (!track) s.driftDir = 0
  else if (!s.driftDir && ab > 0.15) {
    s.driftDir = d
    s.driftWant = Math.min(ab, DRIFT_MAX_A)
    s.driftV = Math.hypot(u, w)
  }
  // (the angle asked for, from where the drift began: deeper, unwinding, or unwinding fast)
  if (s.driftDir && !c.ebrake) {
    const k =
      into > 0
        ? DRIFT_INTO * into
        : into < 0
        ? DRIFT_OUT * into
        : -DRIFT_UNWIND
    s.driftWant = clamp(s.driftWant + k * dt, 0, DRIFT_MAX_A)
  } else if (s.driftDir)
    s.driftWant = Math.max(s.driftWant, Math.min(ab, DRIFT_MAX_A))
  // (the pace: creeping up on the power, down to wherever the brakes take it)
  if (s.driftDir) {
    if (throttle > 0.2) s.driftV += DRIFT_GAIN * dt
    if (c.brake > 0) s.driftV = Math.min(s.driftV, Math.hypot(u, w))
  }
  const letGo = s.driftWant < 0.08 && ab < 0.15
  // (steering out of it with the power on: linking it into a drift the other way, once the car has
  // swung through)
  s.linking =
    track && !!s.driftDir && throttle > 0.5 && c.steer * s.driftDir < -0.5
  if (s.linking && d === -s.driftDir && ab > DRIFT_LINK) {
    s.driftDir = d
    s.driftWant = Math.min(ab, DRIFT_MAX_A)
    s.linking = false
  }
  // (unwound all the way and nearly straight, the drift is over: the electronics are back to catch
  // what is left of it)
  if (
    s.driftDir &&
    !c.ebrake &&
    !s.linking &&
    s.driftWant < 0.03 &&
    ab < DRIFT_END
  )
    s.track = false
  if (burn)
    Mz += clamp(
      BURN_K * (c.steer * c.throttle * BURN_R - r),
      -BURN_YAW,
      BURN_YAW
    )
  else if (track && s.driftDir === d && !letGo && throttle > 0.2 && au > 4) {
    const want = s.driftWant * clamp((throttle - 0.2) / 0.5, 0, 1)
    const hold = 0.75 * b * Math.abs(Fyr) // (most of the rear tyres' pull straight)
    Mz +=
      d *
      clamp(
        hold + DRIFT_K * (want - ab) - DRIFT_D * swing,
        -DRIFT_MAX,
        DRIFT_MAX
      )
  }
  // (going forwards only, and fading as the car comes round from the way it is travelling: the
  // rear axle's slip comes back towards nothing once the car is going backwards)
  if (c.ebrake && c.steer !== 0 && u > 2)
    Mz +=
      c.steer *
      HB_YAW *
      s.ebLock *
      smooth((u - 2) / 8) *
      (1 - smooth((Math.abs(Math.atan2(w, u)) - HB_FADE) / 0.6))
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
  if (!c.ebrake && !burn && spd > 4) {
    const rOk =
      Math.max(
        Math.abs(u * Math.tan(s.steerAng)) / CAR.wheelbase,
        (1.1 * mu * G) / spd
      ) + SPIN_OK
    if (Math.abs(r) > rOk)
      Mz -= Math.sign(r) * Math.min(SPIN_K * (Math.abs(r) - rOk), SPIN_MAX)
  }

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
