// Graphics presets and the Auto one. Each preset is what the frame is allowed: the pixels to a
// point (px, the adaptive resolution steps down from there), the MSAA samples, the car's sun shadow
// map, the real point lights kept at night (nightLights.js), the street's reflection in the wet
// (mirror: its share of the frame's size, 0 for none: it isn't drawn at all) and the share of the
// rain's drops. What a preset turns off is skipped, not just made invisible: no mirror pass, no
// multisampled targets, no hidden lights in the shaders' loops.
//
// Auto starts from a guess at the graphics card (its WebGL renderer string: software ones Low,
// laptop and phone chips Medium, the rest High) and then goes by the frame times it measures: frames
// slower than it can keep up with for a few seconds, once the adaptive resolution has already
// stepped down, take it a preset down (never below Low); frames with plenty of time to spare for
// long enough take it back up, once (so it doesn't swing back and forth).
export const PRESETS = {
  high: { px: 2, msaa: 4, shadow: 3072, lamps: 6, shops: 4, mirror: 0.5, rain: 1 },
  medium: { px: 1.5, msaa: 2, shadow: 2048, lamps: 4, shops: 0, mirror: 0, rain: 0.65 },
  low: { px: 1, msaa: 0, shadow: 1024, lamps: 0, shops: 0, mirror: 0, rain: 0.35 }
}
export const TIERS = ['low', 'medium', 'high']

// a first guess at the preset from the WebGL renderer's name (and the screen)
export function guessTier (name = '', mobile = false) {
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return 'low'
  if (mobile || /intel|mali|adreno|powervr|videocore|apple gpu|uhd|iris/i.test(name))
    return 'medium'
  return 'high'
}

// the graphics card's name, where the browser gives it ('' where not)
export function gpuName (renderer) {
  try {
    const gl = renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '')
  } catch (e) {
    return ''
  }
}

const SLOW_MS = 24 // frames slower than this (under ~42 fps) ...
const SLOW_S = 3 // ... for this long take Auto a preset down
const FAST_MS = 10.5 // frames this quick (with no browser pace) ...
const FAST_S = 20 // ... for this long take it back up, once
const SETTLE_S = 5 // after a change (shaders compiled, targets made, the resolution settled)

const median = a => {
  const s = a.slice().sort((x, y) => x - y)
  return s.length ? s[s.length >> 1] : 0
}

export class AutoQuality {
  constructor (tier) {
    this.tier = tier
    this.top = tier // the highest it may go back up to
    this.wait = SETTLE_S + 3 // (the first seconds: the shaders still compiling)
    this.slow = 0
    this.fast = 0
    this.ups = 0
    this.downs = 0
  }

  // once a frame, dt real s; res: the adaptive resolution (its frame times, pace and ratio).
  // Returns the preset to switch to, or null.
  update (dt, res) {
    if ((this.wait -= dt) > 0 || res.frames.length < 45) return null
    const ms = median(res.frames.slice(-45)),
      pace = res.pace || 0,
      i = TIERS.indexOf(this.tier)
    // slow: slower than the bar, and than any pace the browser keeps (a 30 Hz cap isn't the GPU)
    // (the resolution steps down first; frames it can't help, the CPU's, wait twice as long)
    const slow = ms > Math.max(SLOW_MS, pace * 1.2)
    this.slow = slow ? this.slow + dt * (res.ratio < res.max * 0.9 ? 1 : 0.5) : 0
    this.fast = !pace && ms < FAST_MS && res.ratio >= res.max - 1e-3 ? this.fast + dt : 0
    let to = null
    if (this.slow > SLOW_S && i > 0) {
      to = TIERS[i - 1]
      this.downs++
    } else if (this.fast > FAST_S && this.ups < 1 && this.downs < 2 && i < 2) {
      to = TIERS[i + 1]
      this.ups++
    }
    if (!to) return null
    this.tier = to
    this.slow = this.fast = 0
    this.wait = SETTLE_S
    return to
  }
}
