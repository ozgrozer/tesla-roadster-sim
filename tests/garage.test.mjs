// The multi-storey car parks (garage.js): driven up from the ground floor to the first deck and on
// up to the roof, by a car the player drives (vehicleSim.js) and by the Roadster; a car parked on
// each level. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKS, STALLS } from '../js/sim/city.js'
import { RAMPS } from '../js/sim/lots.js'
import { groundHeight } from '../js/sim/world.js'
import { LEVEL } from '../js/sim/garage.js'
import {
  createVehicleBody,
  stepVehicle,
  makeVehicleInput
} from '../js/sim/vehicleSim.js'
import { Sim } from '../js/sim/sim.js'
import { makeControls } from '../js/sim/constants.js'

// each car park's two ramps: the first up east from the ground, the second up west from the first deck
const UP = RAMPS.filter(r => r.h0 === 0 && r.h1 === LEVEL)
const ON = RAMPS.filter(r => r.h0 === 2 * LEVEL && r.h1 === LEVEL)

test('every car park has its levels, its ramps and spaces on each floor', () => {
  assert.ok(UP.length >= 2 && UP.length === ON.length, `${UP.length} car parks`)
  for (const r of UP) {
    const x = (r.x0 + r.x1) / 2,
      z = r.z1 + 20 // (over the middle)
    assert.equal(groundHeight(x, z, 1), 0)
    assert.equal(groundHeight(x, z, LEVEL + 1), LEVEL)
    assert.equal(groundHeight(x, z), 2 * LEVEL)
    for (const y of [0, LEVEL, 2 * LEVEL])
      assert.ok(
        STALLS.some(
          s =>
            (s.y || 0) === y && Math.abs(s.x - x) < 40 && Math.abs(s.z - z) < 40
        ),
        `spaces at ${y} m`
      )
  }
  assert.ok(BLOCKS.length)
})

function drive (r, yaw, from) {
  const z = (r.z0 + r.z1) / 2
  const b = createVehicleBody('sedan', { x: from, z, yaw })
  b.y = groundHeight(from, z, 10)
  if (yaw) b.y = LEVEL
  const inp = Object.assign(makeVehicleInput(), { throttle: 0.45 })
  for (let t = 0; t < 12; t += 1 / 60)
    stepVehicle(b, inp, 1 / 60, { city: true, t })
  return b
}

test('a car the player drives goes up the first ramp onto the first deck, and up the second onto the roof', () => {
  for (const r of UP) {
    const b = drive(r, 0, r.x0 - 6)
    assert.ok(
      b.x > r.x1 && Math.abs(b.y - LEVEL) < 0.1,
      `on the first deck (${b.x.toFixed(0)}, ${b.y.toFixed(2)})`
    )
  }
  for (const r of ON) {
    const b = drive(r, Math.PI, r.x1 + 6)
    assert.ok(
      b.x < r.x0 && Math.abs(b.y - 2 * LEVEL) < 0.1,
      `on the roof (${b.x.toFixed(0)}, ${b.y.toFixed(2)})`
    )
  }
})

test('the Roadster drives up the first ramp too', () => {
  const r = UP[0]
  const sim = new Sim()
  sim.reset('city', { x: r.x0 - 6, z: (r.z0 + r.z1) / 2, yaw: 0 })
  const c = makeControls()
  c.throttle = 0.4
  c.fan = false
  for (let i = 0; i < 10 * 120; i++) sim.step(1 / 120, c)
  assert.ok(
    sim.pos.x > r.x1 && Math.abs(sim.floor - LEVEL) < 0.2,
    `(${sim.pos.x.toFixed(0)}, ${sim.floor.toFixed(2)})`
  )
})
