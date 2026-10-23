// The graphics presets and Auto: a first guess from the graphics card's name, a step down when
// frames stay slow, one step back up when they have time to spare, and never a swing back and forth.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS, AutoQuality, guessTier, TIERS } from '../js/render/quality.js'

test('presets: each turns more off than the one above it', () => {
  for (let i = 1; i < TIERS.length; i++) {
    const lo = PRESETS[TIERS[i - 1]],
      hi = PRESETS[TIERS[i]]
    for (const k of ['px', 'msaa', 'shadow', 'lamps', 'rain']) assert.ok(lo[k] <= hi[k], k)
  }
  assert.equal(PRESETS.low.msaa, 0)
  assert.equal(PRESETS.low.lamps + PRESETS.low.shops, 0)
  assert.equal(PRESETS.medium.mirror, 0)
  assert.equal(PRESETS.high.shadow, 3072)
})

test('guess: software GL low, laptop chips medium, the rest high', () => {
  assert.equal(guessTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'), 'low')
  assert.equal(guessTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'medium')
  assert.equal(guessTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)'), 'high')
  assert.equal(guessTier('Apple M2'), 'high')
  assert.equal(guessTier('Adreno (TM) 740'), 'medium')
  assert.equal(guessTier('', true), 'medium')
})

const res = (ms, o = {}) => ({ frames: Array(90).fill(ms), pace: 0, ratio: 1, max: 2, ...o })
const run = (a, r, s) => {
  const out = []
  for (let t = 0; t < s; t += 1 / 60) {
    const to = a.update(1 / 60, r)
    if (to) out.push(to)
  }
  return out
}

test('auto: slow frames take it down a preset at a time, never below low', () => {
  const a = new AutoQuality('high')
  assert.deepEqual(run(a, res(40), 7), [], 'not while the shaders compile')
  assert.deepEqual(run(a, res(40), 30), ['medium', 'low'])
  assert.equal(a.tier, 'low')
})

test('auto: a browser holding 30 fps is not slow; quick frames go back up once', () => {
  const a = new AutoQuality('high')
  assert.deepEqual(run(a, res(33.3, { pace: 33.3 }), 30), [])
  const b = new AutoQuality('medium')
  assert.deepEqual(run(b, res(8, { ratio: 2 }), 60), ['high'])
  assert.deepEqual(run(b, res(30), 9), ['medium'])
  assert.deepEqual(run(b, res(8, { ratio: 2 }), 60), [], 'no swing back up')
})

test('auto: frames the resolution cannot help (it is still at the top) wait twice as long', () => {
  const a = new AutoQuality('high')
  run(a, res(16), 8)
  const t = (r) => {
    const b = new AutoQuality('high')
    b.wait = 0
    let s = 0
    while (!b.update(1 / 60, r)) s += 1 / 60
    return s
  }
  assert.ok(t(res(40, { ratio: 2 })) > 1.8 * t(res(40, { ratio: 1 })))
})
