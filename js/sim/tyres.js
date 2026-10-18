// The tyres and the driver's hands on the wheel: a tyre's grip against its slip, how far the keys
// turn the road wheels at speed, and the steering itself: the feel for the limit (the fronts turned
// no further than where they grip hardest), the front wheels following a slide on their caster,
// steering into a slide to hold it or out of it to catch it, unwinding the opposite lock as the car
// swings back, and the rack turned at the speed of hands. ground.js runs it every step on the road.
import { CAR, clamp } from './constants.js'

export const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

// A tyre's grip against its slip, x: the slip angle in units of its grip over its cornering
// stiffness, so that the force starts out at the stiffness times the slip. It builds like a sine to
// its peak at x = pi / 2 (about 12 degrees, CAR.corneringF and R), then falls away to what a sliding
// tyre keeps (CAR.slideMu), so a tyre pushed past its limit gives less, not more.
export const PEAK = Math.PI / 2
export function tyreCurve (x) {
  const a = Math.abs(x)
  const f =
    a < PEAK
      ? Math.sin(a)
      : CAR.slideMu + (1 - CAR.slideMu) * Math.exp(-((a - PEAK) ** 2) / 1.2)
  return Math.sign(x) * f
}

// Speed-sensitive steering, so a keyboard stays controllable: how far full lock on the keys turns the
// road wheels at u m/s (rad)
export const steerMax = u => 0.6 / (1 + (u * u) / 300)
const LOCK = 0.62 // the road wheels' full lock (rad)
// the steering rack: how fast hands turn the road wheels (rad/s, full lock in a third of a second),
// and the extra speed they come back to the middle at as the car rolls (the tyres' self-aligning
// torque, per m/s)
const HANDS = 1.8,
  CENTRE = 0.08
// The understeer control (ground.js) starts taking the power away once the wheel asks the fronts for
// PUSH_0 of the slip they grip hardest at, and has all of it PUSH_W further on
const PUSH_0 = 0.85,
  PUSH_W = 0.35
const UNWIND = 0.3 // s: how far ahead a driver unwinds the opposite lock out of a slide

// The driver's feel for the limit: the fronts are turned no further than just short of their peak,
// where they grip hardest (past it they would only scrub and push wide). Sliding, the front wheels
// follow the slide (the caster: let go of the wheel and they swing round to point the way the car is
// going, as a real car's do), and the driver steers from there: no input lets the slide run out
// (hands off, a touch of counter-steer catching the car as it swings further round, as a driver's
// would), the way into the turn holds it (less, the further round the car is, so it doesn't spin)
// and the other way catches it, the opposite lock unwound as the car swings back towards straight.
// u, w: the car's speed along and across itself (m/s), r its yaw rate, beta the rear axle's slip,
// FmaxF and FmaxR the fronts' and the rears' grip (N), track: Track Mode. Turns s.steerAng and returns how far the car is
// sliding (0 to 1) in out.slide, and the understeer control's cue in out.push: how far past the
// fronts' grip the wheel asks them to go (0 to 1).
const _out = { slide: 0, push: 0 }
export function steer (s, c, u, w, r, beta, FmaxF, FmaxR, track, dt) {
  let steerT = c.steer * steerMax(u),
    slide = 0,
    push = 0
  if (u > 3) {
    const aKin = Math.atan2(w + CAR.halfWB * r, u),
      aLim = (1.5 * FmaxF) / CAR.corneringF,
      ab = Math.abs(beta)
    slide = smooth((ab - 0.1) / 0.14)
    // (the understeer control's cue, but not in a real slide: the rears past the slip they grip
    // hardest at, not merely cornering hard on them)
    push =
      smooth((Math.abs(steerT - aKin) / aLim - PUSH_0) / PUSH_W) *
      (1 - smooth((ab - (PEAK * FmaxR) / CAR.corneringR) / 0.14))
    const into = c.steer * beta < 0 ? 1 - smooth((ab - 0.35) / 0.4) * 0.9 : 1,
      // (rad/s it is swinging further round)
      grow = (ab - (s.driftA ?? ab)) / dt,
      catchIt =
        c.steer === 0 ? Math.sign(beta) * clamp(grow / 1.2, 0, 1) * 0.8 : 0,
      // (steering out of it, the opposite lock is unwound as the car swings back towards straight,
      // all of it once it will be there within UNWIND s: held on, the fronts would swing it on
      // through and over into a slide the other way)
      out = c.steer * beta > 0 ? 1 - smooth((-grow * UNWIND - ab) / 0.08) : 1
    const slid = aKin + (c.steer * into * out + catchIt) * aLim
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
  const rate = HANDS * (1 + 2 * slide) + (centring ? CENTRE * Math.abs(u) : 0)
  s.steerAng += clamp(steerT - s.steerAng, -rate * dt, rate * dt)
  _out.slide = slide
  _out.push = push
  return _out
}
