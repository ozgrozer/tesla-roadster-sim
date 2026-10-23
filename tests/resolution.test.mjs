// The adaptive resolution (render/resolution.js) on a modelled GPU: each change resizes the frame's
// targets, a hitch of its own, so a ratio that couldn't hold isn't tried again every few seconds.
import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = globalThis.window || { devicePixelRatio: 2 }
let now = 0
const perf = { now: () => now }
const { Resolution } = await import('../js/render/resolution.js')

// sec s of frames, the GPU's ms a frame base at the full ratio (2) and in proportion to the pixels,
// held to a 60 Hz screen's frames; no timer query. Returns the times (s) of each change.
function run (base, sec = 300) {
  const was = globalThis.performance
  Object.defineProperty(globalThis, 'performance', { value: perf, configurable: true, writable: true })
  globalThis.document = { timeline: { currentTime: 0 } }
  const gl = { getExtension: () => null }
  const R = new Resolution({ getContext: () => gl }, { setPixelRatio () {} })
  const at = []
  let seed = 1
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let t = 0; t < sec;) {
    R.apply()
    const gpu = base * (R.ratio / 2) ** 2 * (0.95 + 0.1 * rnd())
    const frame = Math.max(16.67, Math.ceil(gpu / 16.67 - 0.02) * 16.67)
    document.timeline.currentTime = now
    R.begin()
    now += 3
    R.end()
    now = document.timeline.currentTime + frame
    R.update(frame / 1000)
    t += frame / 1000
    if (R.next !== null) at.push(t)
  }
  Object.defineProperty(globalThis, 'performance', { value: was, configurable: true, writable: true })
  return at
}

test('resolution: a step up that fails is not tried again for longer each time', () => {
  for (const base of [18, 20, 25, 30]) {
    const at = run(base)
    assert.ok(at.length <= 12, `${base} ms: ${at.length} changes`)
    // (after the first 20 s, the changes at least 25 s apart, apart from a try and its undoing)
    const late = at.filter(t => t > 20)
    const gaps = late.slice(1).map((t, i) => t - late[i]).filter(g => g > 3)
    for (const g of gaps) assert.ok(g >= 25, `${base} ms: a gap of ${g.toFixed(1)} s`)
  }
})

test('resolution: a GPU with room stays at the full ratio', () => {
  assert.equal(run(10, 60).length, 0)
})
