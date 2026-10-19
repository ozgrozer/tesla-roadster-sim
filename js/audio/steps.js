// The player's footsteps on foot (onFoot.js): Optimus's tread from the sample bank (buffers.js), its
// colour by what is underfoot (a hard heel on the road and the pavement, a hollow knock on the
// pier's planks, a soft swish through grass, a crunch in the sand, a ring off a roof's metal), heavier
// running, with the faint whirr of its actuators; a landing from a jump; a window broken in a theft.
const R = Math.random
// per surface: the tread's level and pitch, and the texture laid over it ([sample, level, rate])
const TREAD = {
  road: [0.13, 0.95, null],
  walk: [0.12, 1, null],
  roof: [0.12, 1.08, ['clank', 0.025, 1.6]],
  wood: [0.1, 0.75, ['wood', 0.05, 1.9]],
  grass: [0.05, 0.7, ['leaves', 0.06, 1.5]],
  sand: [0.04, 0.6, ['sand', 0.09, 1.3]]
}

// one footfall: k how loud (0 to 1, by distance and pace), pan left to right, run sprinting
export function footstep (sound, surface, k, pan = 0, run = false) {
  if (!sound?.playing?.() || k < 0.02) return
  const [lv, rate, tex] = TREAD[surface] || TREAD.walk
  const v = k * (run ? 1.4 : 1)
  const o = { world: true, pan, rate: rate * (0.94 + 0.12 * R()), verb: 0.12 }
  sound.play('step', lv * v, o)
  if (run) sound.play('thud', 0.025 * v, { world: true, pan, rate: 1.6, verb: 0.05 })
  if (tex)
    sound.play(tex[0], tex[1] * v, {
      world: true,
      pan,
      rate: tex[2] * (0.9 + 0.2 * R()),
      verb: 0.08
    })
  // (a robot's joints: the faintest servo whirr with each step)
  sound.tone(380, 560, 0.12, 'sawtooth', 0.003 * v, 0.015, {
    pan,
    verb: 0.05,
    attack: 0.03,
    filter: ['bandpass', 1100, 2]
  })
}
// coming down from a jump or a fall (v: m/s down)
export function landing (sound, surface, v, pan = 0) {
  if (!sound?.playing?.()) return
  const k = Math.min(1, v / 6)
  sound.play('thud', 0.08 * k, { world: true, pan, rate: 1.1, verb: 0.15 })
  footstep(sound, surface, 0.6 * k, pan, true)
}
// a car window broken in to steal it, and the door's lock forced
export function smashWindow (sound, pan = 0) {
  if (!sound?.playing?.()) return
  sound.play('glass', 0.5, { world: true, pan, rate: 1.1, verb: 0.3 })
  sound.play('thud', 0.06, { world: true, pan, rate: 1.4, verb: 0.1 })
}
export function forceLock (sound, pan = 0) {
  if (!sound?.playing?.()) return
  sound.play('clank', 0.05, { world: true, pan, rate: 1.8, verb: 0.1 })
  sound.noise(0.06, 0.05, 'bandpass', 2400, 1800, 0.12, { pan, verb: 0.1 })
}
// a car door opening and shutting (car: the door's latch and its weight)
export function doorSound (sound, shut, pan = 0) {
  if (!sound?.playing?.()) return
  if (shut) {
    sound.play('thud', 0.09, { world: true, pan, rate: 0.9, verb: 0.15 })
    sound.noise(0.03, 0.06, 'highpass', 2600, 2400, 0, { pan, verb: 0.1 })
  } else sound.noise(0.05, 0.05, 'bandpass', 1800, 1200, 0, { pan, verb: 0.1 })
}
