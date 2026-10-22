// Optimus's gaits on foot, over poseOptimus's walk cycle (optimus.js): a walk, a jog and a sprint,
// each with its own stride so the planted foot moves back at the pace the body goes forward (no
// sliding): the walk cycle swings each leg 0.36 rad a side per unit of `walk`, so a leg 0.85 m long
// sweeps the ground at 0.85 * 0.36 * amp * 2π / stride m per m walked; one at mid-stance makes the
// stride 1.92 m per unit of amp. Running, the elbows bend and pump, the knees lift, the body leans
// in and bobs over each step (the flight between them); the gait's own share (player.run: 0 walk,
// 0.5 jog, 1 sprint) blends them.
import { poseOptimus } from './optimus.js'
import { clamp } from '../sim/constants.js'

export const STRIDE_PER_AMP = 1.92 // m a cycle (two steps) per unit of the swing
const lerp = (a, b, k) => a + (b - a) * k

// the swing for a speed (m/s): a walk's short steps at a shuffle, longer to a brisk walk at 2 m/s,
// to the jog's at 4.5 and the sprint's at 7
export function ampFor (v) {
  if (v <= 2) return 0.85 * clamp(v / 2, 0, 1)
  if (v <= 4.5) return lerp(0.85, 1.45, (v - 2) / 2.5)
  return lerp(1.45, 1.85, clamp((v - 4.5) / 2.5, 0, 1))
}
// m a cycle for a swing (never under a short one's: standing still, the phase barely turns)
export const strideFor = amp => STRIDE_PER_AMP * Math.max(0.35, amp)

// Pose O mid-gait: amp the swing, phase the cycle, run the gait's share (0 walk to 1 sprint), extra
// for poseOptimus (look, hands)
export function poseGait (O, amp, phase, run, extra = null) {
  const r = clamp((run - 0.15) / 0.85, 0, 1) // (how much of a run it is)
  poseOptimus(O, { walk: amp, phase, lean: 0.06 * amp * r + 0.12 * r, ...(extra || {}) })
  if (r <= 0) return
  // the flight between steps: up at each push off, down at each landing
  O.hips.position.y += r * (0.035 * Math.abs(Math.sin(phase)) - 0.04)
  // knees lifted through the swing
  for (const L of O.legs) {
    const p = phase + (L.s < 0 ? 0 : Math.PI)
    const lift = Math.max(0, Math.cos(p)) * 0.55 * r
    L.kn.rotation.z -= lift
    L.ank.rotation.z += lift * 0.6
  }
  // elbows bent near a right angle, pumping fore and aft with the opposite leg
  const sw = Math.sin(phase)
  for (const A of O.arms) {
    if (extra?.hands) continue
    const k = A.s < 0 ? -sw : sw
    A.sh.rotation.z = lerp(A.sh.rotation.z, 0.55 * k * (0.6 + 0.4 * r) + 0.15, r)
    A.el.rotation.z = lerp(A.el.rotation.z, 1.45 + 0.25 * Math.max(0, k), r)
  }
}
