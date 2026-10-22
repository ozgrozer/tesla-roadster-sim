// Track Mode and its drifts, and the GTA-style moves on the ground: the handbrake's swing, catching
// a spin, and the burnout's donut. ground.js asks it each step for the rears' drive and the yaw
// moment these add.
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
import { G, CAR, clamp } from './constants.js'
import { smooth } from './tyres.js'

// Track Mode: the e-brake at more than this speed (m/s) switches it on, and it switches itself off
// once the rear axle has run within this much slip (rad) of straight for CALM s
const TRACK_IN = 5,
  TRACK_STRAIGHT = 0.09,
  CALM = 0.4
// The handbrake pulled with the wheel turned, GTA-style: the locked rears step out at once rather
// than waiting for the fronts to drag the car round. The yaw moment it adds (N m at full lock, from
// a jog upwards, fading out as the car comes round past HB_FADE rad so it doesn't spin on its own)
const HB_YAW = 7000,
  HB_FADE = 0.9,
  J_TURN = 2.8 // (backing up, the J-turn's swing: times HB_YAW)
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
  BURN_CREEP = 1.6
export const BURN_GRIP = 0.15 // the share of their grip spinning rears keep sideways
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

// Track Mode (s.track) on with the handbrake at speed, off once the car runs straight again. u: the
// car's speed along itself (m/s), beta: the rear axle's slip (rad)
export function trackMode (s, c, u, beta, dt) {
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
}

// In Track Mode the rears may spin: driven harder than they can grip (Fxr against FmaxR, N), they
// transmit most of it and slide sideways, the spin easing in rather than all at once. Returns the
// drive they put down, and how much they spin (0 to 1) in out.spin. spd: the car's speed (m/s)
const _drive = { Fxr: 0, spin: 0 }
export function trackDrive (s, Fxr, FmaxR, beta, spd) {
  // (and past fifty degrees round, the drive to them fades, so they grip and catch it)
  Fxr *= 1 - smooth((Math.abs(beta) - 0.85) / 0.45)
  let spin = clamp(Fxr / FmaxR - 0.6, 0, 1)
  Fxr = 0.95 * FmaxR * Math.tanh(Fxr / FmaxR)
  // (in a drift: spun less the further round it is than asked, and no faster than its pace)
  if (s.driftDir) {
    spin *= 1 - smooth((Math.abs(beta) - s.driftWant - 0.05) / DRIFT_EASE)
    Fxr *= clamp(DRIFT_PUSH + (s.driftV - spd) / DRIFT_BAND, 0, 1)
  }
  _drive.Fxr = Fxr
  _drive.spin = spin
  return _drive
}

// a burnout's creep: the rears' push against the fronts' brakes nets out at a walking pace, quicker
// on full lock; the fronts' force (N) to hold it there
export function burnCreep (c, u, FmaxF) {
  const creep = BURN_CREEP * (0.3 + 0.7 * Math.abs(c.steer)) * c.throttle
  return clamp(CAR.mass * 3 * (creep - u), -FmaxF, FmaxF)
}

// The yaw moment (N m) the drift's motors, a burnout's donut, the handbrake's swing and the spin
// catch add. track: Track Mode with the handbrake off; throttle: the throttle reaching the motors;
// burn: a burnout; beta: the rear axle's slip; Fyr: the rears' grip sideways (N); u, w: the car's
// speed along and across itself, r its yaw rate; mu: the tyres' grip
export function driftMoment (
  s,
  c,
  track,
  throttle,
  burn,
  beta,
  Fyr,
  u,
  w,
  r,
  mu,
  dt
) {
  let Mz = 0
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
      into > 0 ? DRIFT_INTO * into : into < 0 ? DRIFT_OUT * into : -DRIFT_UNWIND
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
  const au = Math.abs(u)
  if (burn)
    Mz += clamp(
      BURN_K * (c.steer * c.throttle * BURN_R - r),
      -BURN_YAW,
      BURN_YAW
    )
  else if (track && s.driftDir === d && !letGo && throttle > 0.2 && au > 4) {
    const want = s.driftWant * clamp((throttle - 0.2) / 0.5, 0, 1)
    const hold = 0.75 * CAR.halfWB * Math.abs(Fyr) // (most of the rear tyres' pull straight)
    Mz +=
      d *
      clamp(
        hold + DRIFT_K * (want - ab) - DRIFT_D * swing,
        -DRIFT_MAX,
        DRIFT_MAX
      )
  }
  // the handbrake's swing (going forwards only, and fading as the car comes round from the way it
  // is travelling: the rear axle's slip comes back towards nothing once the car is going backwards)
  if (c.ebrake && c.steer !== 0 && u > 2)
    Mz +=
      c.steer *
      HB_YAW *
      s.ebLock *
      smooth((u - 2) / 8) *
      (1 - smooth((Math.abs(Math.atan2(w, u)) - HB_FADE) / 0.6))
  // backing up, the J-turn (its way latched as the handbrake is pulled: s.hbDir): the swing takes
  // the nose on round until the car is going forwards again, nose first
  const spd = Math.hypot(u, w)
  if (!c.ebrake) s.hbDir = 0
  else if (!s.hbDir) s.hbDir = u > 0.5 ? 1 : u < -0.5 ? -1 : 0
  if (c.ebrake && c.steer !== 0 && s.hbDir < 0 && spd > 2)
    Mz -=
      c.steer *
      HB_YAW *
      J_TURN *
      s.ebLock *
      smooth((spd - 2) / 5) *
      smooth((Math.abs(Math.atan2(w, u)) - 0.45) / 0.6)
  // and the spin catch, off the handbrake
  if (!c.ebrake && !burn && spd > 4) {
    const rOk =
      Math.max(
        Math.abs(u * Math.tan(s.steerAng)) / CAR.wheelbase,
        (1.1 * mu * G) / spd
      ) + SPIN_OK
    if (Math.abs(r) > rOk)
      Mz -= Math.sign(r) * Math.min(SPIN_K * (Math.abs(r) - rOk), SPIN_MAX)
  }
  return Mz
}
