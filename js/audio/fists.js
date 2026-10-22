// Fists and bodies: a punch thrown (the air it moves), one landing (a dull smack), a person hit by
// a car (the thump on the bonnet, heavier the faster), and someone landing on the road after it.
export function swingSound (sound, heavy = false) {
  if (!sound?.playing?.()) return
  sound.noise(heavy ? 0.16 : 0.11, heavy ? 0.05 : 0.035, 'bandpass', 900, 2600, 0, { verb: 0.04 })
}
export function punchSound (sound, heavy = false, pan = 0) {
  if (!sound?.playing?.()) return
  sound.play('thud', heavy ? 0.2 : 0.13, { world: true, pan, rate: heavy ? 1.05 : 1.35, verb: 0.08 })
  sound.noise(0.04, heavy ? 0.07 : 0.05, 'lowpass', 1400, 600, 0, { pan, verb: 0.05 })
}
export function bodySound (sound, speed, pan = 0) {
  if (!sound?.playing?.()) return
  const k = Math.min(1, speed / 14)
  sound.play('thud', 0.18 + 0.3 * k, { world: true, pan, rate: 0.8 - 0.15 * k, verb: 0.12 })
  if (speed > 6) sound.play('plastic', 0.2 * k, { world: true, pan, rate: 0.9, verb: 0.1 })
}
