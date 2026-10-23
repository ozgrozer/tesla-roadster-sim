// Keyboard mapping checks, against stand-ins for the browser's window and document: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

// (Node 20 has no navigator: the gamepad tests hang a getGamepads on one, as a browser has)
globalThis.navigator ??= {}

const on = {}
globalThis.window = { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document = { querySelectorAll: () => [] }
const { Input } = await import('../js/ui/input.js')
const { Sim } = await import('../js/sim/sim.js')
const { setOption, resetOptions } = await import('../js/ui/options.js')

const H = 1 / 120
const down = code => on.keydown({ code, repeat: false, preventDefault () {} })
const up = code => on.keyup({ code })

test('W held through a lift-off only pitches once it is pressed again', () => {
  setOption('stunts', true) // (G flies with the stunt keys on, or ?debug=1)
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
  down('KeyG')
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
  up('KeyW')
  up('KeyG')
  up('ShiftLeft')
  resetOptions()
})

test('GTA V keys: Space the handbrake, G flies only with the stunt keys, F/E/H are commands', () => {
  const pressed = [],
    released = [],
    driven = []
  const input = new Input({
    onDrive: code => driven.push(code),
    onCommand: code => pressed.push(code),
    onRelease: code => released.push(code)
  })
  const sim = new Sim()
  sim.reset('lineup')
  down('Space')
  let c = input.controls(sim, 'auto')
  assert.equal(c.ebrake, true, 'Space holds the handbrake')
  assert.equal(c.lift, 0, 'and no longer fires the lift thrusters')
  up('Space')
  down('KeyG')
  assert.equal(input.controls(sim, 'auto').lift, 0, 'G does nothing without the stunt keys')
  up('KeyG')
  setOption('stunts', true)
  down('KeyG')
  c = input.controls(sim, 'auto')
  assert.equal(c.lift, 1, 'G fires the lift thrusters with them on')
  assert.equal(c.ebrake, false)
  up('KeyG')
  resetOptions()
  for (const k of ['KeyF', 'KeyE']) {
    down(k)
    up(k)
  }
  assert.ok(driven.includes('KeyF') && driven.includes('KeyE'), 'F (enter, exit) and E (horn, interact) reach onDrive')
  down('KeyH')
  assert.ok(pressed.includes('KeyH'), 'H (headlights) is a command, not a drive key')
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
  pad.buttons[5].pressed = true
  input.poll()
  assert.equal(input.controls(sim, 'auto').ebrake, true, 'RB holds the handbrake (GTA V)')
  pad.buttons[5].pressed = false
  pad.buttons[7].value = 0
  pad.buttons[6].value = 0.7
  input.poll()
  c = input.controls(sim, 'auto')
  assert.equal(c.reverse, 0.7, 'stopped, the left trigger reverses')
  // full throttle and boost to take-off speed, the stick held over to the left, then lift off
  pad.buttons[6].value = 0
  pad.buttons[7].value = 1
  pad.buttons[0].pressed = true // A: boost
  pad.axes[0] = -0.8
  input.poll()
  while (sim.speed < 40) sim.step(H, input.controls(sim, 'auto'))
  assert.equal(input.controls(sim, 'auto').brake, 0)
  setOption('stunts', true)
  pad.buttons[12].pressed = true // D-pad up: lift (a stunt key)
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
  resetOptions()
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
    tap > 0.3 && tap < 0.65,
    `at 100 km/h a tap is a correction, not full lock (${tap.toFixed(2)})`
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
  assert.ok(c.burnout, 'a burnout at a standstill, at once')
  assert.equal(c.reverse, 0, 'not reversing')
  // (the throttle pedal goes down over a fifth of a second)
  for (let i = 0; i < 30; i++) {
    sim.time += H
    c = input.controls(sim, 'off')
  }
  assert.ok(c.burnout && c.throttle === 1, 'on full throttle a moment later')
  sim.vel.set(25, 0, 0)
  sim.speed = 25
  c = input.controls(sim, 'off')
  assert.ok(!c.burnout && c.brake > 0, 'at speed, the brake')
  up('KeyW')
  up('KeyS')
})

// The brake key from 100 km/h on open ground: S held from `from` s to `to` s (a moment in, so the
// input has run a frame first); each frame's controls, and the sim after `secs` s
function brakeKey (from, to, secs) {
  const input = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-100, 0, 300)
  sim.suction = 0
  sim.syncPose()
  sim.vel.set(100 / 3.6, 0, 0)
  sim.speed = 100 / 3.6
  const log = []
  let t = 0,
    c
  while (t < secs) {
    if (t >= from && t - H < from) down('KeyS')
    if (t >= to && t - H < to) up('KeyS')
    c = input.controls(sim, 'off')
    log.push({ t, brake: c.brake, reverse: c.reverse, v: sim.speed })
    sim.step(H, c)
    t += H
  }
  up('KeyS')
  return { sim, log }
}

test('the brake key stamps on the pedal: a tap is a short sharp brake, holding it is a full stop', () => {
  // a tenth of a second's tap at 100 km/h: the full bite almost at once (v6: GTA-quick, fully on
  // in 0.06 s), yet only a few km/h off
  const tap = brakeKey(0.1, 0.2, 1)
  const coast = brakeKey(9, 9, 1) // (the same second without it: regen slows the car too)
  const lost = (coast.sim.speed - tap.sim.speed) * 3.6
  assert.ok(
    tap.log.find(l => l.brake === 1)?.t < 0.18,
    'a tap is on full within 0.1 s'
  )
  assert.ok(lost < 6, `a tap takes ${lost.toFixed(1)} km/h off`)
  // held, the brakes are fully on within a fifth of a second, and the car stops from 100 km/h in
  // about what a good car's tyres allow (a hard stop's bite building as the pedal goes down)
  const held = brakeKey(0.1, 9, 4)
  const full = held.log.find(l => l.brake === 1)
  assert.ok(
    full && full.t < 0.27,
    `full braking after ${(full?.t - 0.1).toFixed(2)} s`
  )
  const stop = held.log.find(l => l.v <= 0)
  assert.ok(
    stop.t > 2.1 && stop.t < 2.9,
    `stopped in ${(stop.t - 0.1).toFixed(2)} s`
  )
})

test('S held through a stop holds the car before it backs up, and pressed at a standstill reverses', () => {
  const r = brakeKey(0.1, 9, 5)
  const stop = r.log.find(l => l.v <= 0)
  const back = r.log.find(l => l.reverse > 0)
  assert.ok(
    back.t - stop.t > 0.25 && back.t - stop.t < 0.45,
    `held ${(back.t - stop.t).toFixed(2)} s at a standstill before reversing`
  )
  // (and the reverse eases in from there)
  assert.ok(back.reverse < 0.1, 'the motor eases into reverse')
  assert.ok(r.sim.speed < -1, 'then it backs up')
  // let go and press it again at a standstill: it reverses at once
  const input = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('start')
  down('KeyS')
  sim.step(H, input.controls(sim, 'off'))
  const c = input.controls(sim, 'off')
  up('KeyS')
  assert.ok(
    c.reverse > 0 && c.brake === 0,
    'pressed at a standstill, it reverses'
  )
})

test("a gamepad in use buzzes with the tyres sliding or spinning, not cruising, and never over a knock's rumble", () => {
  const felt = []
  const pad = {
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: {
      playEffect: (type, e) => {
        felt.push(e)
        return Promise.resolve()
      }
    }
  }
  navigator.getGamepads = () => [pad]
  const input = new Input({ onDrive () {}, onCommand () {} })
  // `secs` s from kmh on open ground, the pad set by set(t): the most each motor was asked for
  function run (kmh, secs, set) {
    const sim = new Sim()
    sim.reset('start')
    sim.pos.set(-100, 0, 300)
    sim.suction = 0
    sim.syncPose()
    sim.vel.set(kmh / 3.6, 0, 0)
    sim.speed = kmh / 3.6
    felt.length = 0
    for (let t = 0; t < secs; t += H) {
      set(t)
      input.poll()
      sim.step(H, input.controls(sim, 'off'))
      sim.events.length = 0
    }
    pad.axes[0] = 0
    pad.buttons[5].pressed = pad.buttons[6].value = pad.buttons[7].value = 0
    input.poll()
    return {
      strong: Math.max(0, ...felt.map(e => e.strongMagnitude)),
      weak: Math.max(0, ...felt.map(e => e.weakMagnitude))
    }
  }
  // cruising on the throttle: nothing
  const cruise = run(80, 2, () => (pad.buttons[7].value = 0.3))
  assert.ok(cruise.weak < 0.02 && cruise.strong < 0.02, 'cruising: still')
  // the e-brake (A) with the stick over: the rears slide, and it buzzes
  const turn = run(60, 1.5, t => {
    pad.axes[0] = -1
    pad.buttons[5].pressed = t < 0.6
  })
  assert.ok(turn.weak > 0.2, `a handbrake turn: ${turn.weak.toFixed(2)}`)
  // a burnout (both triggers at a crawl): the rears spinning rumble
  const burn = run(0, 1.5, () => {
    pad.buttons[7].value = 1
    pad.buttons[6].value = 1
  })
  assert.ok(burn.strong > 0.25, `a burnout: ${burn.strong.toFixed(2)}`)
  // and a knock's rumble plays out rather than being cut short by the tyres' buzz
  felt.length = 0
  input.pad.rumble(1, 1, 500)
  input.pad.feel(0.5, 0.5)
  input.pad.feel(0.03, 0.28, 40) // (Botts' dots: events.js)
  assert.equal(felt.length, 1, "the knock's rumble only")
  input.pad.busy = 0 // (once it has played out)
  input.pad.feel(0.03, 0.28, 40)
  assert.equal(felt[1]?.duration, 40, 'then the dots')
  // a pad plugged in but left alone, the car driven on the keys: it stays still
  const keys = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-100, 0, 300)
  sim.suction = 0
  sim.syncPose()
  sim.vel.set(60 / 3.6, 0, 0)
  sim.speed = 60 / 3.6
  felt.length = 0
  down('KeyA')
  down('Space')
  for (let i = 0; i < 120; i++) {
    keys.poll()
    sim.step(H, keys.controls(sim, 'off'))
    sim.events.length = 0
  }
  up('Space')
  up('KeyA')
  assert.ok(sim.skidR > 0.3, 'the rears sliding')
  assert.equal(felt.length, 0, 'an idle pad stays still')
  navigator.getGamepads = undefined
})
