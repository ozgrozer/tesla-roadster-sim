// K16: the rain costs every car the player drives the same grip (roadGrip.js), the Roadster
// included (street.js feel through surfaceGrip), and the test site's track keeps the grip hook
import test from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { ENV } from '../js/sim/env.js'
import { roadGrip, setGripScale } from '../js/sim/roadGrip.js'
import { gripOf } from '../js/sim/street.js'
import { makeControls } from '../js/sim/constants.js'

const ROAD = { x: -128, z: 389.3 } // (the open road by the stadium, east-west)
// the Roadster from 25 m/s on the brakes on that road: metres to a stop, and its grip there
function stop () {
  const s = new Sim()
  s.reset('city')
  s.pos.set(ROAD.x, 0, ROAD.z)
  s.yaw = 0
  s.suction = 0 // (the fan off)
  s.syncPose()
  s.vel.set(25, 0, 0)
  s.speed = 25
  const c = makeControls()
  c.brake = 1
  c.fan = false
  let d = 0
  for (let t = 0; t < 10 && s.speed > 0.05; t += 1 / 120) {
    const x = s.pos.x
    s.step(1 / 120, c)
    d += Math.abs(s.pos.x - x)
  }
  return { d, grip: gripOf(s), surface: s.surface }
}

test('K16: the Roadster grips the wet road as the other cars do, and stops longer', () => {
  const was = { wet: ENV.wet, rain: ENV.rain }
  try {
    ENV.wet = ENV.rain = 0
    const dry = stop()
    assert.equal(dry.surface, 'road')
    assert.equal(dry.grip, 1)
    ENV.wet = 1
    const wet = stop()
    assert.ok(Math.abs(wet.grip - roadGrip()) < 1e-9, `${wet.grip} vs ${roadGrip()}`)
    assert.ok(wet.d > 1.2 * dry.d, `wet ${wet.d.toFixed(1)} m, dry ${dry.d.toFixed(1)} m`)
    // raining before the road has soaked: the rain's share already counts, as roadGrip's does
    ENV.wet = 0
    ENV.rain = 1
    assert.ok(Math.abs(stop().grip - roadGrip()) < 1e-9)
  } finally {
    Object.assign(ENV, was)
  }
})

test('the grip hook holds on the test site too', () => {
  const s = new Sim()
  s.reset('start')
  assert.equal(gripOf(s), 1)
  setGripScale(0.7)
  try {
    assert.equal(gripOf(s), 0.7)
  } finally {
    setGripScale(1)
  }
})
