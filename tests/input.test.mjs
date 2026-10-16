// Keyboard mapping checks, against stand-ins for the browser's window and document: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

const on = {}
globalThis.window = { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document = { querySelectorAll: () => [] }
const { Input } = await import('../js/ui/input.js')
const { Sim } = await import('../js/sim/sim.js')

const H = 1 / 120
const down = code => on.keydown({ code, repeat: false, preventDefault () {} })
const up = code => on.keyup({ code })

test('W held through a lift-off only pitches once it is pressed again', () => {
  const input = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('lineup')
  sim.pos.x = -60
  sim.syncPose()
  down('KeyW')
  down('ShiftLeft')
  let c
  while (sim.speed < 50) sim.step(H, (c = input.controls(sim, 'auto')))
  assert.equal(c.throttle, 1, 'W is the throttle on the ground')
  down('Space')
  while (sim.mode !== 'air') sim.step(H, input.controls(sim, 'auto'))
  for (let i = 0; i < 60; i++) {
    c = input.controls(sim, 'auto')
    assert.equal(c.pitch, 0, 'still held from the run-up: no pitch')
    sim.step(H, c)
  }
  assert.ok(
    Math.abs(sim.fwd().y) < 0.02,
    'the car rises level instead of nosing into the pad'
  )
  up('KeyW')
  down('KeyW')
  assert.equal(
    input.controls(sim, 'auto').pitch,
    -1,
    'pressed again: nose down'
  )
})
