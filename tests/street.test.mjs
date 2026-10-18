// Headless checks of what is underfoot in the city: the kerb's line, the surfaces and their grip,
// and the Roadster feeling the kerb and the manholes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { makeControls } from '../js/sim/constants.js'
import { kerbDist, surfaceAt, MANHOLES, DRAINS } from '../js/sim/street.js'
import {
  WALK,
  ROADS,
  PITCH,
  BLOCKS,
  CURB_R,
  ROAD_HW,
  LANE_OFF,
  PROMENADE
} from '../js/sim/city.js'

const H = 1 / 120

test('the kerb runs down each street, round each corner and along the promenade', () => {
  const c = ROADS[3]
  assert.ok(kerbDist(c + 30, LANE_OFF[1]) > 0, 'a lane is on the road')
  assert.ok(Math.abs(kerbDist(c + 30, ROAD_HW)) < 1e-9, 'the kerb at its edge')
  assert.ok(kerbDist(c + 30, ROAD_HW + 1) < 0, 'and the pavement behind it')
  assert.ok(kerbDist(c, ROADS[4]) > 5, 'the middle of a junction is road')
  // halfway round a corner's quarter circle, CURB_R from its centre
  const k = ROAD_HW + CURB_R - CURB_R / Math.SQRT2
  assert.ok(Math.abs(kerbDist(c + k, k)) < 1e-6, 'it curves round the corner')
  assert.ok(
    kerbDist(c + ROAD_HW + 0.5, ROAD_HW + 0.5) > 0,
    'so cutting the corner is still on the road'
  )
  assert.ok(
    kerbDist(ROADS[10] + ROAD_HW + 2, ROADS[4] + 1) < 0,
    'the promenade outside the ring road'
  )
})

test("surfaces: road, pavement, a park's grass, the beach's sand, the verge and the pier", () => {
  assert.equal(surfaceAt(ROADS[3] + 30, LANE_OFF[0]), 'road')
  assert.equal(surfaceAt(ROADS[3] + 30, ROAD_HW + 2), 'walk')
  const park = BLOCKS.find(b => b.kind === 'park')
  const mid = (park.x0 + park.x1) / 2
  assert.equal(surfaceAt(mid + 9, park.z0 + WALK + 9), 'grass')
  assert.equal(
    surfaceAt(park.x0 + 2, (park.z0 + park.z1) / 2),
    'walk',
    'the park has a pavement round it'
  )
  // past the promenade: the beach on the west, the verge's grass on the other three sides, and the
  // pier's planks out from the end of Wilshire
  assert.equal(surfaceAt(-PROMENADE - 5, ROADS[3]), 'sand')
  assert.equal(surfaceAt(PROMENADE + 5, 0), 'grass')
  assert.equal(surfaceAt(0, -PROMENADE - 5), 'grass')
  assert.equal(surfaceAt(ROADS[7], PROMENADE + 5), 'grass')
  assert.equal(surfaceAt(-PROMENADE - 5, 0), 'wood')
  assert.equal(surfaceAt(-650, 3), 'wood')
  // the street's ironwork stays on the road
  for (const m of MANHOLES)
    assert.ok(kerbDist(m.x, m.z) > 0.5, 'a manhole out in a lane')
  for (const d of DRAINS) {
    const k = kerbDist(d.x, d.z)
    assert.ok(k > 0 && k < 0.45, 'a drain in the gutter')
  }
})

// full throttle from rest for t seconds at { x, z, yaw }
function launch (at, t) {
  const sim = new Sim()
  sim.reset('city', at)
  const c = makeControls()
  c.throttle = 1
  for (let i = 0; i < t / H; i++) sim.step(H, c)
  return sim
}

test('the tyres grip less on sand, and the sand drags at them', () => {
  const south = -Math.PI / 2
  const road = launch({ x: ROADS[0], z: ROADS[3] + 20, yaw: south }, 2)
  const sand = launch({ x: -PROMENADE - 10, z: ROADS[3] + 20, yaw: south }, 2)
  assert.equal(sand.surface, 'sand')
  assert.equal(road.surface, 'road')
  assert.ok(
    sand.speed < 0.8 * road.speed,
    `slower off the line on sand (${sand.speed.toFixed(1)} m/s, ` +
      `${road.speed.toFixed(1)} on the road)`
  )
  // and with the throttle off it slows down sooner
  const c = makeControls()
  for (const s of [road, sand]) {
    s.vel.multiplyScalar(15 / s.speed)
    s.speed = 15
    for (let i = 0; i < 120; i++) s.step(H, c)
  }
  assert.ok(sand.speed < road.speed - 1, 'and coasts down quicker')
})

test('the Roadster feels each axle mount the kerb, and the manholes', () => {
  const sim = new Sim()
  // in the kerb lane, angled over towards the pavement
  const yaw = -0.35
  sim.reset('city', { x: ROADS[3] + 25, z: ROADS[4] + LANE_OFF[1], yaw })
  const events = []
  const c = makeControls()
  sim.vel.set(Math.cos(yaw) * 8, 0, -Math.sin(yaw) * 8)
  sim.speed = 8
  let kick = 0
  for (let i = 0; i < 120 && sim.pos.z < ROADS[4] + ROAD_HW + 3; i++) {
    sim.step(H, c)
    kick = Math.max(kick, Math.abs(sim.suspV))
    events.push(...sim.events)
    sim.events.length = 0
  }
  assert.deepEqual(
    events.filter(e => e.type === 'kerb').map(e => [e.up, e.front]),
    [
      [true, true],
      [true, false]
    ],
    'the front axle mounts the kerb, then the rear'
  )
  assert.ok(kick > 0.2, 'and the car jolts on its springs')
  // put down on the pavement, it feels no kerb until it drives off it
  sim.reset('city', { x: ROADS[3] + 25, z: ROADS[4] + ROAD_HW + 2, yaw: 0 })
  sim.step(H, c)
  assert.ok(!sim.events.some(e => e.type === 'kerb'), 'no kerb for a reset')

  // a manhole out in an east-west lane, away from the junctions: the left wheels run over it
  const off = v => Math.abs(v - Math.round(v / PITCH) * PITCH)
  const m = MANHOLES.find(
    m => off(m.z) < ROAD_HW - 1.5 && off(m.x) > 25 && Math.abs(m.z) > 50
  )
  assert.ok(m, 'there is one to drive over')
  sim.reset('city', { x: m.x - 10, z: m.z + 0.87, yaw: 0 })
  sim.vel.set(12, 0, 0)
  sim.speed = 12
  const holes = []
  for (let i = 0; i < 160; i++) {
    sim.step(H, c)
    holes.push(...sim.events.filter(e => e.type === 'manhole'))
    sim.events.length = 0
  }
  assert.equal(holes.length, 2, 'ta-dunk: the front wheel, then the rear')
})
