// Round 2 physics, kerbs (physKerb.mjs): a car up onto the pavement sits on it, each wheel over an
// angled kerb rocks the body corner by corner, costs a little speed, tells the sound each time, and
// a car that starts up on the pavement feels no kerb it never crossed. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kerb } from './physKerb.mjs'

test('up a kerb: the body sits on the pavement, jolted, a little slower, each wheel told', () => {
  const sq = kerb('sedan', 8, 0),
    ang = kerb('sedan', 8, 0.52)
  assert.ok(sq.yUp > 0.06, `on the pavement at ${sq.yUp}`)
  assert.ok(sq.heave > 0.02 && sq.pitch > 0.02, 'jolted and pitched')
  assert.ok(sq.loss > 0.3 && sq.loss < 1.5, `speed lost ${sq.loss}`)
  assert.ok(ang.roll > 0.015, `angled: rolled ${ang.roll}`)
  assert.equal(ang.kerbs, 4, 'angled: a thud per wheel')
  assert.ok(ang.w < 0.3, 'knocked off line a little, not spun')
})

test('down off a kerb: started up on the pavement, only the drops are felt', () => {
  const r = kerb('sedan', 8, 0.52, { down: true })
  assert.equal(r.kerbs, 4)
  assert.ok(r.heave < 0.06)
})
