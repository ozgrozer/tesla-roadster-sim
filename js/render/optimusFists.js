// Optimus fighting (sim/melee.js): fists up in guard by the face, a jab and a cross thrown straight
// out from the shoulder with the body leaning into them, a hook swung round from the side, and a
// stamp on someone down. The hands and a foot reached for by poseOptimus's limbs (optimus.js), the
// legs keeping their stance (or the gait, stepping in).
import { poseOptimus, HIP_STAND, ANKLE_UP } from './optimus.js'
import { clamp } from '../sim/constants.js'

const lerp = (a, b, k) => a + (b - a) * k

// O at pos (the feet, drawn) facing p.heading; pp the punch (punchPose) or null (guard); amp and
// phase the gait's (a step in while punching)
export function poseFists (O, p, pos, pp, amp = 0, phase = 0) {
  const h = p.heading,
    fx = Math.cos(h),
    fz = -Math.sin(h),
    rx = -fz,
    rz = fx
  // a point f m ahead, up m over the feet, s m to the right
  const W = (f, up, s) => [pos.x + fx * f + rx * s, pos.y + up, pos.z + fz * f + rz * s]
  const elbowOut = s => [rx * s * 0.6, -1, rz * s * 0.6]
  // the guard: both fists by the chin
  const hands = [
    { at: W(0.3, 1.43, -0.14), elbow: elbowOut(-1), w: 1 },
    { at: W(0.27, 1.41, 0.15), elbow: elbowOut(1), w: 1 }
  ]
  let lean = 0.08,
    feet = null
  if (pp) {
    const sd = pp.side,
      i = sd < 0 ? 0 : 1,
      k = pp.k,
      out = Math.max(0, k)
    if (pp.name === 'hook') {
      // round from the side to the middle, the elbow up level
      const a = lerp(1.25, 0.05, clamp(k, 0, 1)) - 0.25 * Math.min(0, k)
      hands[i] = { at: W(0.15 + 0.45 * Math.cos(a), 1.4, sd * (0.08 + 0.45 * Math.sin(a))), elbow: [rx * sd, 0.2, rz * sd], w: 1 }
      lean = 0.1 + 0.12 * out
    } else if (pp.name === 'stomp') {
      // the foot up, then stamped down in front (bent over to see it)
      const up = k < 0 ? 0.3 * (-k / 0.35) + 0.1 : 0.4 * (1 - out) + 0.0
      const f = lerp(0.25, 0.48, out)
      feet = [-1, 1].map(s =>
        s === sd
          ? { at: W(f, ANKLE_UP + up, s * 0.1), knee: [fx, 0.3, fz] }
          : { at: W(-0.12, ANKLE_UP, s * 0.12), knee: [fx, 0.1, fz] }
      )
      lean = 0.3
    } else {
      // straight out from the shoulder, drawn back first
      const f = k < 0 ? 0.3 + 0.25 * k : lerp(0.3, 0.72, out)
      hands[i] = { at: W(f, 1.43 + 0.02 * out, sd * lerp(0.15, 0.05, out)), elbow: elbowOut(sd), w: 1 }
      lean = 0.08 + 0.16 * out
    }
  }
  O.root.position.y = pos.y + HIP_STAND - (feet ? 0.06 : 0.04) + (p.lift || 0) // (knees bent in the stance)
  poseOptimus(O, { walk: Math.min(amp, 0.6), phase, hands, lean, feet })
}
