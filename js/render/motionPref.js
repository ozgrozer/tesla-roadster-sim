// Reduced motion, for the camera's shakes and trembles (camera.js): off by default, on if the
// browser asks for it (prefers-reduced-motion) or the player has turned it on (the settings,
// remembered as 'reducedMotion': ui/prefs.js). MOTION.shake scales every camera shake (0.25 with
// reduced motion: a knock is still felt, barely). The settings menu (the UX workstream) calls
// setReducedMotion(on) and it sticks.
import { recall, remember } from '../ui/prefs.js'

export const MOTION = { reduced: false, shake: 1 }
function apply (on) {
  MOTION.reduced = !!on
  MOTION.shake = on ? 0.25 : 1
}
export function setReducedMotion (on, keep = true) {
  apply(on)
  if (keep) remember('reducedMotion', on ? '1' : '0')
}
// (at load: the remembered choice, else the browser's)
function initial () {
  const r = recall('reducedMotion', '')
  if (r) return r === '1'
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
apply(typeof window === 'undefined' ? false : initial())
