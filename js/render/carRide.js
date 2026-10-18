// A traffic car's body on its springs (render/traffic.js): a damped spring each for pitch and roll,
// tuned per type (a car's body bobs at about 1.5 Hz, a van's or pickup's slower, a bus's under 1 Hz
// and softer still), so a car settles back with a slight bob after it stops. Pitch follows the
// acceleration the driver asks for (the nose dips about a degree and a half under ordinary braking,
// more under hard braking, and the tail squats as it pulls away), roll the sideways acceleration
// round a corner (more for the tall ones, most for a bus), and a car knocked sliding leans into the
// way it is sliding. The front wheels steer to the curve it is on.
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
  sports: [1.9, 0.48, 0.7, 0.65]
} // per type: frequency (Hz), damping ratio, pitch and roll per m/s^2 (relative)
// (the frame's dt comes in RIDE_DT.dt rather than as an argument: a number passed costs an
// allocation)
export const RIDE_DT = { dt: 0.5 }
// car: the traffic's car; T: its type (sim/traffic.js TYPES); S: its shape's measurements
export function ride (car, T, S) {
  const dt = RIDE_DT.dt
  if (dt <= 0) return
  const [f, zeta, kp, kr] = RIDE[T.name]
  const w = 2 * Math.PI * f,
    k = w * w,
    c = 2 * zeta * w
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
    pitchT = clamp((car.acc || 0) * 0.0052 * kp, -0.06, 0.03)
    rollT = clamp(sp * (car.yr || 0) * 0.0085 * kr, -0.075, 0.075)
  }
  car.pitchV += (k * (pitchT - car.pitch) - c * car.pitchV) * h
  car.pitch += car.pitchV * h
  car.rollV += (k * (rollT - car.roll) - c * car.rollV) * h
  car.roll += car.rollV * h
  // the front wheels: to the curve it is on (from its yaw rate), eased like a driver's hands
  const wb = S.axles[0] - S.axles[1]
  const steerT =
    car.loose || Math.abs(sp) < 0.5
      ? car.steer
      : clamp(Math.atan((wb * (car.yr || 0)) / sp), -0.6, 0.6)
  car.steer += (steerT - car.steer) * Math.min(1, h * 10)
}
