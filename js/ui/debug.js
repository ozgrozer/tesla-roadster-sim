// The developer's switch: ?debug=1 in the address turns on the keys and the pause menu's DEBUG tab
// that a player has no use for (the test site, slow motion, Autopilot, the clock and the weather
// on a key, the suction fan, the test site's start spots). Without it they do nothing, as in GTA.
// The Roadster's stunt keys (fly, flips) are a setting (options.js stunts), on by default, and on
// with debug too.
import { OPTS } from './options.js'

const query = () => {
  try {
    return new URLSearchParams(globalThis.location?.search || '')
  } catch {
    return new URLSearchParams('')
  }
}
export const DEBUG = { on: query().get('debug') === '1' }
// whether the Roadster's stunt keys (G fly, X and K flips) work
export const stuntKeys = () => DEBUG.on || !!OPTS.stunts
