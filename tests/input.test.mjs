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
  down('KeyF')
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

test('Space is the e-brake, F the lift thrusters and H the horn', () => {
  const pressed = [],
    released = []
  const input = new Input({
    onDrive () {},
    onCommand: code => pressed.push(code),
    onRelease: code => released.push(code)
  })
  const sim = new Sim()
  sim.reset('lineup')
  down('Space')
  let c = input.controls(sim, 'auto')
  assert.equal(c.ebrake, true, 'Space holds the e-brake')
  assert.equal(c.lift, 0, 'and no longer fires the lift thrusters')
  up('Space')
  down('KeyF')
  c = input.controls(sim, 'auto')
  assert.equal(c.lift, 1, 'F fires the lift thrusters')
  assert.equal(c.ebrake, false)
  up('KeyF')
  down('KeyH')
  assert.deepEqual(pressed, ['KeyH'], 'H is a command, not a drive key')
  up('KeyH')
  assert.ok(released.includes('KeyH'), 'and letting go of it is reported')
})

test('a gamepad is analog, and a stick held through a lift-off waits', () => {
  const pad = {
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  }
  navigator.getGamepads = () => [pad]
  const driven = []
  const input = new Input({
    onDrive: code => driven.push(code),
    onCommand () {}
  })
  const sim = new Sim()
  sim.reset('lineup')
  sim.pos.x = -60
  sim.syncPose()
  pad.buttons[7].value = 0.5
  pad.axes[0] = 1
  input.poll()
  let c = input.controls(sim, 'auto')
  assert.equal(c.throttle, 0.5, 'half the right trigger is half throttle')
  assert.ok(c.steer < -0.99, 'the stick right over steers right')
  assert.ok(driven.includes('Pad'), 'and touching them takes the wheel')
  pad.axes[0] = 0
  pad.buttons[0].pressed = true
  input.poll()
  assert.equal(input.controls(sim, 'auto').ebrake, true, 'A holds the e-brake')
  pad.buttons[0].pressed = false
  pad.buttons[7].value = 0
  pad.buttons[6].value = 0.7
  input.poll()
  c = input.controls(sim, 'auto')
  assert.equal(c.reverse, 0.7, 'stopped, the left trigger reverses')
  // full throttle and boost to take-off speed, the stick held over to the left, then lift off
  pad.buttons[6].value = 0
  pad.buttons[7].value = 1
  pad.buttons[5].pressed = true
  pad.axes[0] = -0.8
  input.poll()
  while (sim.speed < 40) sim.step(H, input.controls(sim, 'auto'))
  assert.equal(input.controls(sim, 'auto').brake, 0)
  pad.buttons[4].pressed = true // LB: lift
  input.poll()
  while (sim.mode !== 'air') sim.step(H, input.controls(sim, 'auto'))
  for (let i = 0; i < 30; i++) {
    c = input.controls(sim, 'auto')
    assert.equal(c.roll, 0, 'still held over from the run-up: no roll')
    sim.step(H, c)
  }
  pad.axes[0] = 0
  input.poll()
  input.controls(sim, 'auto')
  pad.axes[0] = 1
  input.poll()
  assert.ok(
    input.controls(sim, 'auto').roll > 0.99,
    'back through the middle, it rolls'
  )
  navigator.getGamepads = undefined
})

test('the steering keys ease the wheel over: gently at speed, quickly parking or with the handbrake', () => {
  const input = new Input({ onDrive () {}, onCommand () {} })
  // steer after A has been held for t s, at v m/s (with the handbrake: Space)
  const after = (t, v, space = false) => {
    const sim = new Sim()
    sim.reset('start')
    sim.pos.set(-100, 0, 300)
    sim.suction = 0
    sim.vel.set(v, 0, 0)
    sim.speed = v
    sim.syncPose()
    input.keySteer = 0
    input.lastT = sim.time
    if (space) down('Space')
    down('KeyA')
    let c
    for (let i = 0; i < t / H; i++) {
      sim.time += H // (the controls only, at a steady speed)
      c = input.controls(sim, 'off')
    }
    up('KeyA')
    if (space) up('Space')
    return c.steer
  }
  assert.ok(after(0.08, 0) > 0.7, 'a tap at a standstill is most of full lock')
  const tap = after(0.08, 100 / 3.6)
  assert.ok(
    tap > 0.1 && tap < 0.3,
    `at 100 km/h a tap is a small correction (${tap.toFixed(2)})`
  )
  assert.ok(after(0.6, 100 / 3.6) === 1, 'held, it is full steering')
  assert.ok(
    after(0.08, 100 / 3.6, true) > 0.7,
    'with the handbrake pulled, at once'
  )
  // and let go, it comes back to the middle faster than it went over
  const sim = new Sim()
  sim.reset('start')
  sim.speed = 100 / 3.6
  sim.vel.set(sim.speed, 0, 0)
  input.keySteer = 1
  input.lastT = sim.time
  let c
  for (let i = 0; i < 0.2 / H; i++) {
    sim.time += H
    c = input.controls(sim, 'off')
  }
  assert.equal(c.steer, 0, 'back to the middle in a fifth of a second')
})

test('W and S together at a crawl are a burnout; at speed S still brakes', () => {
  const input = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-100, 0, 300)
  sim.syncPose()
  down('KeyW')
  down('KeyS')
  let c = input.controls(sim, 'off')
  assert.ok(c.burnout && c.throttle === 1, 'a burnout at a standstill')
  assert.equal(c.reverse, 0, 'not reversing')
  sim.vel.set(25, 0, 0)
  sim.speed = 25
  c = input.controls(sim, 'off')
  assert.ok(!c.burnout && c.brake === 1, 'at speed, the brake')
  up('KeyW')
  up('KeyS')
})
