// The Roadster against a car driven by a body of its own (a getaway's: ambient.js, vehicleLink.js):
// it no longer drives through it; the two meet by mass (wrecks.js collidePlayer -> clashBody).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { makeControls } from '../js/sim/constants.js'
import { bodyFromTraffic } from '../js/sim/vehicleLink.js'
import { LANES } from '../js/sim/city.js'

const H = 1 / 60
// the Roadster coasting at v m/s along a straight lane into a body-driven car of mass m standing on it
function crash (m, v = 14) {
  const e = LANES.find(l => l.road && !l.closed && l.len > 60 && Math.abs(l.dz) < 0.01 && l.dx > 0)
  const sim = new Sim()
  const x0 = e.x0 + 4,
    z0 = e.z0
  sim.reset('city', { x: x0, z: z0, yaw: 0 })
  const tr = new Traffic({ seed: 2, count: 0 })
  tr.reset(x0, z0)
  const car = tr.make(0, false, () => 0.5)
  car.parked = true
  car.x = x0 + 16
  car.z = z0
  tr.setYaw(car, 0)
  tr.cars.push(car)
  tr.takeOver(car, 'getaway')
  const b = bodyFromTraffic(car)
  b.m = m
  b.events = []
  sim.vel.x = v
  sim.vel.z = 0
  const bx0 = b.x
  let minGap = Infinity
  for (let i = 0; i < 2 / H; i++) {
    sim.step(H, makeControls())
    tr.step(H, sim)
    car.x = b.x
    car.z = b.z
    minGap = Math.min(minGap, b.x - sim.pos.x)
    sim.events.length = 0
  }
  return { sim, b, car, moved: b.x - bx0, minGap, clashed: b.events.some(ev => ev.type === 'clash') }
}

test('the Roadster meets a body-driven car: no passing through, pushed by mass, both told', () => {
  const light = crash(900),
    heavy = crash(4000)
  for (const r of [light, heavy]) {
    assert.ok(r.minGap > 2.5, `never through it (closest centres ${r.minGap.toFixed(2)} m)`)
    assert.ok(r.sim.pos.x < r.b.x, 'still behind it')
    assert.ok(r.clashed, 'the body heard the knock')
    assert.ok(r.moved > 0.2, `it was shoved (${r.moved.toFixed(2)} m)`)
  }
  assert.ok(light.moved > heavy.moved * 1.5, `the light one goes further (${light.moved.toFixed(2)} vs ${heavy.moved.toFixed(2)} m)`)
})

test('two police bodies (or a unit and the player’s body) share an overlap by mass', async () => {
  const { bodies } = await import('../js/sim/police.js')
  const { createVehicleBody } = await import('../js/sim/vehicleSim.js')
  const a = createVehicleBody('police', { x: 0, z: 0, yaw: 0 }),
    b = createVehicleBody('police', { x: 3, z: 0, yaw: 0 })
  for (const o of [a, b]) {
    o.hx = 1
    o.hz = 0
  }
  a.m = 1500
  b.m = 4500
  bodies(a, b)
  const da = Math.hypot(a.x - 0, a.z),
    db = Math.hypot(b.x - 3, b.z)
  assert.ok(da > 0 && db > 0, 'pushed apart')
  assert.ok(Math.abs(da / db - 3) < 0.01, `the light one moves 3x as far (${da.toFixed(3)} vs ${db.toFixed(3)})`)
})
