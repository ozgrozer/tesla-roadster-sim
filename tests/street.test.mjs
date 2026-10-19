// Headless checks of what is underfoot in the city: the kerb's line, the surfaces and their grip,
// and the Roadster feeling the kerb, the manholes and the Botts' dots.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { CAR, makeControls } from '../js/sim/constants.js'
import {
  feel,
  kerbDist,
  surfaceAt,
  MANHOLES,
  DRAINS
} from '../js/sim/street.js'
import { dotted, eachMarker } from '../js/sim/botts.js'
import {
  WALK,
  STOP,
  ROADS,
  PITCH,
  BLOCKS,
  CURB_R,
  LANE_W,
  ROAD_HW,
  LANE_OFF,
  PROMENADE,
  N,
  OLD,
  WILSHIRE
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
    kerbDist(ROADS[N] + ROAD_HW + 2, ROADS[4] + 1) < 0,
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
  // (the pier at the end of Wilshire, moved with the first city: grid.js OLD)
  const W = ROADS[WILSHIRE]
  assert.equal(surfaceAt(-PROMENADE - 5, W), 'wood')
  assert.equal(surfaceAt(-650 + OLD, W + 3), 'wood')
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
  // (in a lane: Ocean Avenue's middle is its median now, palms on it)
  const road = launch(
    { x: ROADS[0] + LANE_OFF[1], z: ROADS[3] + 20, yaw: south },
    2
  )
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

// Eastbound along Wilshire (road 5, at z = 0) from (x, z) at kmh, the throttle holding the pace and
// the wheel at steer(t): each step's speed, yaw rate and accelerations, and the dots struck (each
// with where along the road the wheel that struck it was)
function along (x, z, kmh, secs, steer = () => 0) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  sim.vel.set(kmh / 3.6, 0, 0)
  sim.speed = kmh / 3.6
  const c = makeControls(),
    log = [],
    dots = []
  for (let t = 0; t < secs; t += H) {
    c.steer = steer(t)
    c.throttle = sim.speed < kmh / 3.6 ? 0.3 : 0
    sim.step(H, c)
    for (const e of sim.events)
      if (e.type === 'dot') {
        const fx = Math.cos(sim.yaw),
          fz = -Math.sin(sim.yaw)
        const a = CAR.halfWB * (e.front ? 1 : -1),
          b = 0.87 * (e.left ? 1 : -1)
        dots.push({ ...e, x: sim.pos.x + fx * a + fz * b })
      }
    sim.events.length = 0
    log.push([sim.speed, sim.yawRate, sim.latAcc, sim.accLong])
  }
  return { log, dots }
}

test("Botts' dots drum under the wheels that run over them, where they are drawn, at the rate they pass", () => {
  // the left wheels along the lane line between Wilshire's eastbound lanes, by the beach (Santa
  // Monica has them): each wheel knocks on every dome and reflector, four 0.9 m apart and the
  // reflector, the group every 7.3 m
  const kmh = 50,
    v = kmh / 3.6
  assert.ok(dotted(5, 0, false), 'by the beach')
  assert.ok(!dotted(5, 8, false), 'not downtown')
  const { dots } = along(ROADS[0] + 20, ROADS[5] + LANE_W + 0.87, kmh, 3)
  const fl = dots.filter(e => e.front && e.left),
    rl = dots.filter(e => !e.front && e.left)
  assert.ok(dots.every(e => e.left), 'only the wheels on the line')
  assert.ok(fl.length > 25, `${fl.length} knocks`)
  assert.ok(Math.abs(fl.length - rl.length) <= 2, 'front and rear alike')
  // (where the drawing puts them, cityGround.js: each knock within a step's travel of a marker)
  const at = []
  eachMarker(ROADS[0] + STOP, ROADS[1] - STOP, u => at.push(u))
  for (const e of fl) {
    const near = Math.min(...at.map(u => Math.abs(u - e.x)))
    assert.ok(near < v * H + 0.05, `a knock ${near.toFixed(2)} m from a marker`)
  }
  // (in runs of five, a dome's gap apart, a run every 7.3 m)
  const gaps = fl.slice(1).map((e, i) => e.t - fl[i].t)
  const close = gaps.filter(g => g < 0.15),
    runs = fl.filter((e, i) => i > 0 && gaps[i - 1] >= 0.15)
  for (const g of close)
    assert.ok(Math.abs(g - 0.9 / v) < 0.012, `${g.toFixed(3)} s apart`)
  for (let i = 1; i < runs.length; i++)
    assert.ok(
      Math.abs(runs[i].t - runs[i - 1].t - 7.3 / v) < 0.02,
      'a run every 7.3 m'
    )
  assert.ok(close.length >= 4 * runs.length, 'five to a run')

  // in the middle of a lane, nothing; changing lanes across the line, a few knocks
  const mid = along(ROADS[0] + 20, LANE_OFF[1], kmh, 3).dots
  assert.equal(mid.length, 0, 'mid-lane')
  const change = t => (t < 0.3 ? 0 : t < 0.75 ? 0.3 : t < 1.2 ? -0.3 : 0)
  const n = along(ROADS[0] + 20, LANE_OFF[1], kmh, 2.5, change).dots.length
  assert.ok(n >= 1 && n <= 10, `${n} knocks crossing it`)
})

test("Botts' dots are heard and felt but never in the handling: the car drives over them as over paint", () => {
  // the same weave along Wilshire's lane line by the beach, over the dots, and downtown, over a
  // painted line: the speed, the yaw rate and the accelerations the same at every step
  const weave = t => 0.15 * Math.sin(t * 4)
  const z = ROADS[5] + LANE_W + 0.87
  const dots = along(ROADS[0] + 20, z, 80, 2, weave),
    paint = along(ROADS[8] + 20, z, 80, 2, weave)
  assert.ok(dots.dots.length > 20, `${dots.dots.length} knocks over the dots`)
  assert.equal(paint.dots.length, 0, 'none over the paint')
  for (let i = 0; i < dots.log.length; i++)
    for (let k = 0; k < 4; k++)
      assert.ok(
        Math.abs(dots.log[i][k] - paint.log[i][k]) < 1e-9,
        `step ${i}: the same`
      )
})

test("each wheel knocks once on every Botts' dot it runs over: none missed or doubled at speed or backing up, none from the air", () => {
  // (along the lane line by the beach: each knock the left wheels take, against the markers
  // between where each wheel was after the first step and where it ended up)
  const at = []
  eachMarker(ROADS[0] + STOP, ROADS[1] - STOP, u => at.push(u))
  const z = ROADS[5] + LANE_W + 0.87
  for (const [x, kmh, secs] of [
    [ROADS[0] + 15, 150, 1.6],
    [ROADS[0] + 75, -30, 2]
  ]) {
    const sim = new Sim()
    sim.reset('city', { x, z, yaw: 0 })
    sim.vel.set(kmh / 3.6, 0, 0)
    sim.speed = kmh / 3.6
    const c = makeControls(),
      knocks = [0, 0],
      from = [],
      to = []
    for (let t = 0; t < secs; t += H) {
      sim.step(H, c)
      for (const e of sim.events)
        if (e.type === 'dot') {
          assert.ok(e.left, 'the left wheels only')
          knocks[e.front ? 0 : 1]++
        }
      sim.events.length = 0
      for (const k of [0, 1]) {
        const wx =
          sim.pos.x + (k === 0 ? 1 : -1) * CAR.halfWB * Math.cos(sim.yaw)
        if (!from[k]) from[k] = wx
        to[k] = wx
      }
    }
    for (const k of [0, 1]) {
      const lo = Math.min(from[k], to[k]),
        hi = Math.max(from[k], to[k])
      const want = at.filter(u => u > lo && u <= hi).length
      assert.ok(want > 5, `${want} markers passed`)
      assert.equal(
        knocks[k],
        want,
        `${kmh} km/h, ${k ? 'rear' : 'front'}: each once`
      )
    }
  }
  // a hop: a step, then the car back on the ground 2.4 m on after a third of a second in the air
  // (feel isn't asked while it flies): no knocks for the dots it flew over, then on again
  const s = {
    pos: { x: ROADS[0] + 11 + 3 - 1 - CAR.halfWB, z },
    yaw: 0,
    speed: 20,
    floor: 0,
    time: 0,
    suspV: 0,
    n: 0,
    emit (type) {
      if (type === 'dot') this.n++
    }
  }
  const go = (dx, dt) => {
    s.pos.x += dx
    s.time += dt
    s.n = 0
    feel(s)
    return s.n
  }
  go(0, 0)
  assert.equal(go(0.3, H), 0, 'short of the first dome')
  assert.equal(go(2.4, 0.33), 0, 'none for the dots flown over')
  assert.equal(go(0.3, H), 1, 'and the next one, back on the ground')
})
