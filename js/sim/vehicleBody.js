// A drivable body's springs (vehicleSim.js): the body pitching under braking and pulling away,
// rolling in a corner and bouncing over kerbs, each a damped spring at the class's bounce
// frequency, within its travel. Stepped in short sub-steps (semi-implicit: the velocity first, then
// the pose from it), so a long frame (a dt spike, a slow machine's 2 fps) can't wind it up: the
// pose stays within its travel and settles as it would at 120 Hz. And the gravity of a slope along
// and across the car (bodyGround.js's gp, gr), so a hill slows it climbing and speeds it down.
import { G, clamp } from './constants.js'

const MAX_H = 1 / 120 // s: the longest sub-step the springs take
const PITCH_MAX = 0.12, // rad either way the body can pitch, and roll
  ROLL_MAX = 0.15

// the springs through dt (any length)
export function springs (b, dt) {
  const S = b.spec,
    om = 2 * Math.PI * S.suspHz,
    k = om * om,
    c = 2 * S.damp * om
  const pT = clamp((-b.accLong / G) * S.pitchK, -PITCH_MAX, PITCH_MAX),
    rT = clamp((b.latAcc / G) * S.rollK, -ROLL_MAX, ROLL_MAX)
  const n = Math.max(1, Math.ceil(dt / MAX_H - 1e-9)),
    h = dt / n
  for (let i = 0; i < n; i++) {
    b.pitchV += (-k * (b.pitch - pT) - c * b.pitchV) * h
    b.pitch += b.pitchV * h
    b.rollV += (-k * (b.roll - rT) - c * b.rollV) * h
    b.roll += b.rollV * h
    b.heaveV += (-k * b.heave - c * b.heaveV) * h
    b.heave += b.heaveV * h
    // (at the end of its travel the body stops on the bump stops)
    if (Math.abs(b.heave) > S.travel) {
      b.heave = Math.sign(b.heave) * S.travel
      b.heaveV *= -0.2
    }
    if (Math.abs(b.pitch) > PITCH_MAX * 1.5) {
      b.pitch = Math.sign(b.pitch) * PITCH_MAX * 1.5
      b.pitchV *= -0.2
    }
    if (Math.abs(b.roll) > ROLL_MAX * 1.5) {
      b.roll = Math.sign(b.roll) * ROLL_MAX * 1.5
      b.rollV *= -0.2
    }
  }
}

// gravity along the slope the body lies on: [along the car (+ forwards), across it (+ to the
// left)], N, into out
export function slopeForce (b, out) {
  const W = b.m * G
  out[0] = -W * Math.sin(b.gp || 0)
  out[1] = -W * Math.sin(b.gr || 0)
  return out
}
