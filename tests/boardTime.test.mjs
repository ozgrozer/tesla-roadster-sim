// Getting in and out, GTA-quick (v5: "getting in and out of the cars is very slow"): an open car in
// about a second from the door (sat in and driving as its door starts to shut), out onto the
// pavement in well under a second; a move key or the throttle skips the rest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOARD, hurry } from '../js/sim/boarding.js'

const sum = (...k) => k.reduce((s, x) => s + BOARD[x], 0)

test('in at about a second, out in well under one', () => {
  const open = sum('open', 'slide') // (sat in: the door shuts as the car moves off)
  assert.ok(open >= 0.6 && open <= 1.0, `open car: sat in after ${open} s`)
  assert.ok(open + BOARD.close <= 1.2, 'and its door shut by 1.2 s')
  assert.ok(sum('jimmy', 'open', 'slide') < 2, 'a parked car broken into in under 2 s')
  assert.ok(sum('open', 'pull', 'slide') < 2, 'a driver hauled out in under 2 s')
  const out = sum('open', 'outSlide')
  assert.ok(out >= 0.5 && out <= 0.8, `out: on the ground after ${out} s`)
  assert.ok(BOARD.roadIn <= 1.2 && BOARD.roadOut <= 0.9, 'the Roadster as quick')
})

test('a move key hurries the rest: straight to sat in, or the feet on the ground', () => {
  const a = { dir: 'in', how: 'open', phase: 'open', t: 0.1 }
  assert.deepEqual(hurry(a), ['seated'])
  assert.equal(a.phase, 'close')
  assert.deepEqual(hurry(a), [], 'only once')
  const j = { dir: 'in', how: 'jack', phase: 'open', t: 0 }
  assert.deepEqual(hurry(j), ['pulled', 'seated'], 'a driver still hauled out first')
  const late = { dir: 'in', how: 'jack', phase: 'pull', t: BOARD.pullAt + 0.01 }
  assert.deepEqual(hurry(late), ['seated'])
  assert.deepEqual(hurry({ dir: 'in', how: 'theft', phase: 'jimmy', t: 0 }), [], 'not the break-in')
  assert.deepEqual(hurry({ dir: 'in', how: 'roadster', phase: 'roadster', t: 0 }), [])
  const o = { dir: 'out', how: 'open', phase: 'open', t: 0 }
  assert.deepEqual(hurry(o), ['out'])
  assert.equal(o.phase, 'close')
})
