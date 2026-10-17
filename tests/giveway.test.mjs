// Headless checks of the corners where traffic, people and Autopilot wait on each other: nobody
// waits forever, nobody stands in the road waiting to cross, a car over the line is driven round,
// a stopped Roadster or a wreck is gone round, and a reset is not a landing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { CityPilot } from '../js/sim/cityPilot.js'
import { Peds, walkOn } from '../js/sim/peds.js'
import { kerbDist } from '../js/sim/street.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { makeControls } from '../js/sim/constants.js'
import { NODES, LANES, BLOCKS, holdLight, releaseLight } from '../js/sim/city.js'

const H = 1 / 120
const PARK = BLOCKS.find(k => k.kind === 'park')
// an eastbound lane (in lane l) on the street along the park's north side
const laneByPark = l =>
  LANES.find(
    e =>
      !e.closed &&
      e.dir === 0 &&
      e.lane === l &&
      Math.abs(e.z0 - PARK.z0) < 12 &&
      e.x0 < PARK.x1 &&
      e.x0 + e.len > PARK.x0
  )
const brake = () => {
  const c = makeControls()
  c.fan = false
  c.brake = 1
  return c
}
// a car of the given type at s along lane e, moving at v, going straight on
function put (tr, e, s, v = 0, type = 0) {
  const car = tr.make(type)
  car.edge = e
  car.s = s
  car.v = v
  tr.insert(e, car)
  car.next = e.next.find(o => o.move === 'S') || e.next[0]
  tr.place(car)
  tr.n++
  return car
}
// the Roadster standing at s along lane e, facing along it
function standing (e, s) {
  const sim = new Sim()
  sim.reset('city', { x: e.x0 + e.dx * s, z: e.z0 + e.dz * s, yaw: Math.atan2(-e.dz, e.dx) })
  return sim
}

test('Autopilot waiting to turn left goes another way when the oncoming traffic never clears', () => {
  const e = LANES.find(
    l => l.road && !l.closed && l.next.some(c => c.move === 'L') && l.next.some(c => c.move === 'S') &&
      Math.abs(NODES[l.to].x - PARK.x1) < 60 && Math.abs(NODES[l.to].z - PARK.z0) < 60
  )
  const sim = standing(e, e.len - 30)
  const tr = new Traffic({ seed: 2, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.oncoming = () => true // (someone over there who never goes)
  const pilot = new CityPilot(sim, tr)
  pilot.plan = null // (past the gridlock, driving about)
  assert.ok(pilot.join(), 'finds its lane')
  pilot.next = e.next.find(c => c.move === 'L')
  let took = null,
    waited = 0
  for (let i = 0; i < 40 / H && !took; i++) {
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
    sim.events.length = 0
    if (Math.abs(sim.speed) < 0.3) waited += H
    if (pilot.edge !== e) took = pilot.edge
  }
  pilot.releaseLights()
  assert.ok(took, 'it got through the junction')
  assert.notEqual(took.move, 'L', 'not across the oncoming traffic')
  assert.ok(waited > 8, `after giving way a while (${waited.toFixed(1)} s)`)
})

test('while a light is held for Autopilot, people still cross the street it holds at red', () => {
  const node = NODES.find(n => n.inc.every(Boolean))
  holdLight(node, 0, 0) // east-west green
  let red = 0,
    green = 0
  for (let t = 5; t < 60; t += 0.1) {
    if (walkOn(node, 1, t)) red++
    if (walkOn(node, 0, t)) green++
  }
  releaseLight(node, 60)
  node.hold = null
  assert.ok(red > 20, 'over the north-south street, now and then')
  assert.equal(green, 0, 'never over the street with the green')
})

test('people waiting to cross stand back on the pavement, not in the road', () => {
  const sim = standing(laneByPark(1), 30)
  const tr = new Traffic({ seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 9 })
  peds.reset(sim.pos.x, sim.pos.z)
  let waits = 0,
    worst = -Infinity,
    inRoad = 0
  for (let i = 0; i < 90 / H; i++) {
    sim.step(H, brake())
    peds.step(H, sim, tr)
    tr.step(H, sim)
    sim.events.length = 0
    if (i % 30) continue
    for (const p of peds.list)
      if (p.state === 'wait') {
        waits++
        worst = Math.max(worst, kerbDist(p.x, p.z))
      }
    for (const p of tr.peds) if (p.state === 'wait' || p.state === 'kerb') inRoad++
  }
  assert.ok(waits > 50, `people waited to cross (${waits})`)
  assert.ok(worst < -0.45, `back from the kerb (${worst.toFixed(2)} m)`)
  assert.equal(inRoad, 0, 'none of them taken for someone in the road')
})

test('cars held up behind the Roadster stopped in their lane pull out and go round it', () => {
  const e = laneByPark(1)
  const sim = standing(e, 60)
  const tr = new Traffic({ seed: 3, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const cars = [put(tr, e, 30, 8), put(tr, e, 18, 8)]
  for (let i = 0; i < 40 / H; i++) {
    sim.step(H, brake())
    tr.step(H, sim)
    sim.events.length = 0
  }
  for (const c of cars) {
    const along = (c.x - sim.pos.x) * e.dx + (c.z - sim.pos.z) * e.dz
    assert.ok(c.edge !== e && along > 0, `#${c.id} went by (${along.toFixed(1)} m on)`)
  }
})

test('a car held up behind a wreck turned across its lane goes round it', () => {
  const e = laneByPark(1)
  const sim = standing(laneByPark(0), 5)
  const tr = new Traffic({ seed: 5, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const wreck = put(tr, e, 45)
  tr.detach(wreck)
  wreck.loose = true
  wreck.vx = wreck.vz = wreck.w = 0
  wreck.looseT = 5
  tr.setYaw(wreck, wreck.yaw + 1.2) // (too far round to drive on)
  const car = put(tr, e, 15, 7)
  let by = null
  for (let i = 0; i < 30 / H && by === null; i++) {
    sim.step(H, brake())
    tr.step(H, sim)
    sim.events.length = 0
    if ((car.x - wreck.x) * e.dx + (car.z - wreck.z) * e.dz > 5) by = tr.t
  }
  assert.ok(by !== null, 'went round')
  assert.ok(by < 20, `soon (${by.toFixed(1)} s)`)
  assert.equal(tr.cars.filter(c => c !== wreck && c.loose).length, 0, 'without touching it')
})

test('a car stopped at a red with its nose over the line is driven round, never through', () => {
  // (an eastbound lane into a crossroads by the park, the Roadster parked in the park)
  const mx = (PARK.x0 + PARK.x1) / 2,
    mz = (PARK.z0 + PARK.z1) / 2
  const e = LANES.find(
    l => l.road && !l.closed && l.dir === 0 && NODES[l.to].inc.every(Boolean) &&
      Math.hypot(NODES[l.to].x - mx, NODES[l.to].z - mz) < 120
  )
  const node = NODES[e.to]
  const sim = new Sim()
  sim.reset('city', { x: mx, z: mz, yaw: 0 })
  const tr = new Traffic({ seed: 5, count: 0 })
  let worst = 0
  for (const dir of [1, 3])
    for (const lane of [0, 1]) {
      tr.reset(sim.pos.x, sim.pos.z)
      holdLight(node, 1, -10) // north-south green: red for the bus
      const bus = put(tr, e, e.len - 0.3, 0, 6)
      const c = node.inc[dir][lane]
      const car = put(tr, c, c.len - 30, 9)
      let went = false
      for (let i = 0; i < 8 / H; i++) {
        sim.step(H, brake())
        tr.step(H, sim)
        sim.events.length = 0
        const h = rectRect({ ...carRect(bus) }, carRect(car))
        if (h) worst = Math.max(worst, h.depth)
        if (car.edge.move) went = true
      }
      assert.ok(bus.s + bus.len / 2 > e.len + 5, 'the bus is still over the line')
      assert.ok(went && tr.cars.includes(car), 'the cross traffic drove on into the junction')
    }
  node.hold = null
  assert.equal(worst, 0, `no car into the bus (${worst.toFixed(2)} m deep)`)
})

test('a reset mid-air is not a landing, and a landing on a roof scares nobody in the street', () => {
  const e = laneByPark(1)
  const sim = standing(e, 40)
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 4 })
  peds.reset(sim.pos.x, sim.pos.z)
  sim.mode = 'air'
  peds.step(H, sim, tr)
  tr.step(H, sim)
  // R pressed in the air: back on the road
  const at = { x: sim.pos.x + 30, z: sim.pos.z, yaw: sim.yaw }
  sim.reset('city', at)
  tr.reset(sim.pos.x, sim.pos.z)
  peds.reset(sim.pos.x, sim.pos.z)
  for (let i = 0; i < 30; i++) {
    sim.step(H, brake())
    peds.step(H, sim, tr)
    tr.step(H, sim)
    sim.events.length = 0
  }
  assert.equal(peds.panic, 0, 'nobody runs')
  assert.equal(tr.cars.filter(c => c.panic > 0).length, 0, 'nobody brakes hard')
  // down on a roof
  peds.wasAir = true
  sim.pos.y = 9
  peds.alarms(sim, sim.pos, tr)
  assert.equal(peds.panic, 0, 'nobody runs from a landing on a roof')
})
