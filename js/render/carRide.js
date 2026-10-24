// A traffic car's body on its springs (render/traffic.js): a damped spring each for pitch and roll,
// tuned per type (a car's body bobs at about 1.5 Hz, a van's or pickup's slower, a bus's under 1 Hz
// and softer still), so a car settles back with a slight bob after it stops. Pitch follows the
// acceleration the driver asks for (the nose dips about a degree and a half under ordinary braking,
// more under hard braking, and the tail squats as it pulls away), roll the sideways acceleration
// round a corner (more for the tall ones, most for a bus), and a car knocked sliding leans into the
// way it is sliding. The front wheels steer to the curve it is on. And a lowrider stopped a moment
// at the lights, about half of them, hits its switches: its hydraulics throw the front, the back or
// one side and then the other up off its wheels every second or so, and the body comes down
// bouncing on its springs (car.lift: how far the body is raised, about the wheels that stay down).
import { clamp } from '../sim/constants.js'

const RIDE = {
  sedan: [1.55, 0.42, 1, 1],
  hatch: [1.6, 0.42, 1, 1],
  taxi: [1.5, 0.4, 1, 1.05],
  suv: [1.35, 0.4, 1.15, 1.3],
  pickup: [1.25, 0.38, 1.1, 1.3],
  van: [1.15, 0.38, 0.9, 1.5],
  bus: [0.9, 0.32, 0.55, 1.7],
  police: [1.4, 0.42, 1.05, 1.2],
  sports: [1.9, 0.48, 0.7, 0.65],
  ambulance: [1.15, 0.36, 0.95, 1.6],
  fire: [0.95, 0.34, 0.6, 1.4],
  truck: [1.05, 0.34, 0.8, 1.65],
  lowrider: [1.2, 0.3, 1.2, 1.4],
  limo: [1.3, 0.38, 0.9, 1.1]
} // per type: frequency (Hz), damping ratio, pitch and roll per m/s^2 (relative)
const HOP = { f: 2.4, zeta: 0.16, after: 1.2 } // the hydraulics: bouncier, and s stopped first
// (the frame's dt comes in RIDE_DT.dt rather than as an argument: a number passed costs an
// allocation)
export const RIDE_DT = { dt: 0.5 }
// car: the traffic's car; T: its type (sim/traffic.js TYPES); S: its shape's measurements
export function ride (car, T, S) {
  const dt = RIDE_DT.dt
  if (dt <= 0) return
  let [f, zeta, kp, kr] = RIDE[T.name]
  const h = Math.min(dt, 1 / 30)
  let pitchT, rollT, sp
  if (car.loose) {
    sp = Math.hypot(car.vx, car.vz)
    // sliding sideways the tyres scrub, and the body leans the way it slides
    const side = -car.vx * car.hz + car.vz * car.hx
    pitchT = 0
    rollT = clamp(side * 0.012 * kr, -0.08, 0.08)
  } else {
    sp = car.v
    pitchT = clamp((car.acc || 0) * 0.007 * kp, -0.08, 0.045)
    rollT = clamp(sp * (car.yr || 0) * 0.011 * kr, -0.1, 0.1)
  }
  // a lowrider hitting its switches: each pump of the hydraulics throws the front up (or the back,
  // or one side, then the other), and lets it drop
  const low = T.name === 'lowrider'
  if (low) {
    const on =
      !car.loose &&
      !car.pull &&
      car.v < 0.05 &&
      car.still > HOP.after &&
      (car.paint * 7.9) % 1 < 0.55
    car.hop += ((on ? 1 : 0) - car.hop) * Math.min(1, h * 2.5)
    if (on) {
      const P = 0.85 + 0.5 * ((car.paint * 31.3) % 1),
        u = (car.still - HOP.after) / P,
        up = u % 1 < 0.22,
        mode = Math.floor(((car.paint * 23.7) % 1) * 3)
      f = HOP.f
      zeta = HOP.zeta
      if (mode === 2) rollT = up ? (Math.floor(u) % 2 ? 0.1 : -0.1) : 0
      else pitchT = up ? (mode ? -0.15 : 0.17) : 0
    }
  }
  const w = 2 * Math.PI * f,
    k = w * w,
    c = 2 * zeta * w
  car.pitchV += (k * (pitchT - car.pitch) - c * car.pitchV) * h
  car.pitch += car.pitchV * h
  car.rollV += (k * (rollT - car.roll) - c * car.rollV) * h
  car.roll += car.rollV * h
  if (low) {
    // (raised about the wheels that stay down: the back axle as the nose goes up, the front as the
    // tail does, the low side's wheels as it rolls)
    const p = car.pitch,
      up = p > 0 ? -S.axles[1] * Math.sin(p) : S.axles[0] * Math.sin(-p)
    car.lift = car.hop * (up + S.track * Math.abs(Math.sin(car.roll)))
  }
  // the front wheels: to the curve it is on (from its yaw rate), eased like a driver's hands
  const wb = S.axles[0] - S.axles[1]
  const steerT =
    car.loose || Math.abs(sp) < 0.5
      ? car.steer
      : clamp(Math.atan((wb * (car.yr || 0)) / sp), -0.6, 0.6)
  car.steer += (steerT - car.steer) * Math.min(1, h * 10)
}
