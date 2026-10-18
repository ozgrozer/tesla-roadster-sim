// Headless checks of the city: layout, lane graph, signals, traffic and the Roadster's collisions.
import { test } from 'node:test'
import { Sim } from '../js/sim/sim.js'
import assert from 'node:assert/strict'
import { roofAt } from '../js/sim/roofs.js'
import { Traffic } from '../js/sim/traffic.js'
import { JAM, JAM_AT, atJam } from '../js/sim/jam.js'
import { CityPilot } from '../js/sim/cityPilot.js'
import { CAR, makeControls } from '../js/sim/constants.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import {
  RED,
  WALK,
  NODES,
  EDGES,
  LANES,
  CYCLE,
  LAMPS,
  POLES,
  TREES,
  PALMS,
  BLOCKS,
  SIGNAL,
  signal,
  query,
  pointAt,
  standUp,
  BUILDINGS,
  nearestLane
} from '../js/sim/city.js'

const H = 1 / 120
// Nothing solid in a run along +x from x0 to x1, hw either side of z, below y (but what the run is
// aimed at, skip): so a test's car meets only what it is driven at.
const openRun = (x0, x1, z, hw = 1.5, y = 2) =>
  !query(x0, z - hw, x1, z + hw).some(c => c.y0 < y && c.y1 > 0)
// a steel street light along a pavement that runs along x, with nothing in the 10 m before it
const lampInTheClear = k =>
  k.az !== 0 && k.x > 0 && !k.wood && openRun(k.x - 10, k.x - 0.3, k.z, 1.2)

test('the lane graph joins up and, with lane changes, reaches every lane', () => {
  const a = {},
    b = {}
  for (const e of EDGES) {
    assert.ok(e.next.length > 0, `edge ${e.id} leads nowhere`)
    pointAt(e, e.len, a)
    for (const n of e.next) {
      pointAt(n, 0, b)
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, `gap ${e.id}->${n.id}`)
      assert.ok(a.hx * b.hx + a.hz * b.hz > 0.9999, `kink ${e.id}->${n.id}`)
    }
  }
  const seen = new Set([LANES[0]])
  const todo = [LANES[0]]
  while (todo.length) {
    const e = todo.pop()
    for (const n of e.twin ? [...e.next, e.twin] : e.next)
      if (!seen.has(n)) {
        seen.add(n)
        todo.push(n)
      }
  }
  assert.equal(seen.size, EDGES.length, 'every lane and turn is reachable')
})

test('buildings stand inside their blocks, clear of the sidewalks', () => {
  for (const b of BUILDINGS) {
    const cx = (b.x0 + b.x1) / 2,
      cz = (b.z0 + b.z1) / 2
    const blk = BLOCKS.find(
      k => cx > k.x0 && cx < k.x1 && cz > k.z0 && cz < k.z1
    )
    assert.ok(blk, 'in a block')
    for (const t of b.tiers) {
      assert.ok(t.x0 >= blk.x0 + WALK - 1e-9 && t.x1 <= blk.x1 - WALK + 1e-9)
      assert.ok(t.z0 >= blk.z0 + WALK - 1e-9 && t.z1 <= blk.z1 - WALK + 1e-9)
      assert.ok(t.y1 > t.y0)
    }
  }
})

test('crossing roads never both have a go', () => {
  for (const n of NODES)
    for (let t = 0; t < CYCLE; t += 0.25) {
      const ew = signal(n, 0, t) !== RED || signal(n, 2, t) !== RED
      const ns = signal(n, 1, t) !== RED || signal(n, 3, t) !== RED
      assert.ok(!(ew && ns), `node ${n.i} at ${t}`)
    }
})

// The Roadster parked in a park, out of everyone's way, while the traffic runs.
function runTraffic (secs) {
  const sim = new Sim()
  sim.reset('city')
  const park = BLOCKS.find(k => k.kind === 'park')
  sim.pos.set((park.x0 + park.x1) / 2, 0, (park.z0 + park.z1) / 2)
  sim.syncPose()
  const tr = new Traffic({ count: 110, radius: 300, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  let redRuns = 0,
    overlaps = 0,
    moved = 0,
    longest = 0
  const still = new Map()
  for (let i = 0; i < secs / H; i++) {
    const before = new Map(tr.cars.map(c => [c, c.edge]))
    const c = makeControls()
    c.fan = false
    sim.step(H, c)
    tr.step(H, sim)
    const driving = tr.cars.filter(c => !c.parked && !c.loose)
    for (const car of driving) {
      const was = before.get(car)
      // into an intersection on a red that was already red a yellow ago: a red-light runner (but
      // a police car on a call, which may go over on red: calls.test.mjs)
      if (
        was &&
        was.road &&
        car.edge !== was &&
        car.edge.move &&
        car.siren !== 1
      ) {
        const node = NODES[was.to]
        if (
          signal(node, was.dir, tr.t) === RED &&
          signal(node, was.dir, tr.t - SIGNAL.yellow) === RED
        )
          redRuns++
      }
      moved += car.v * H
      const t = car.v < 0.3 ? (still.get(car) || 0) + H : 0
      still.set(car, t)
      longest = Math.max(longest, t)
    }
    if (i % 30 === 0)
      for (let j = 0; j < driving.length; j++)
        for (let k = j + 1; k < driving.length; k++) {
          const p = driving[j],
            q = driving[k]
          if (Math.abs(p.x - q.x) > 14 || Math.abs(p.z - q.z) > 14) continue
          const a = { ...carRect(p) }
          if (rectRect(a, carRect(q))?.depth > 0.3) overlaps++
        }
  }
  return { tr, redRuns, overlaps, longest, meanSpeed: moved / secs / tr.n }
}

test('traffic flows, keeps its distance and stops for red lights', () => {
  const r = runTraffic(150)
  assert.equal(r.tr.n, 110, 'keeps the streets filled')
  assert.equal(r.redRuns, 0, 'no car enters a junction on red')
  assert.equal(r.overlaps, 0, 'no two cars drive through each other')
  assert.ok(r.meanSpeed > 3, `mean speed ${r.meanSpeed.toFixed(1)} m/s`)
  assert.ok(r.longest < 60, `longest wait ${r.longest.toFixed(0)} s`)
})

// Drive the Roadster from (x, z) along +x at `speed`, holding the throttle at a cruise.
function driveInto (x, z, speed, secs, setup) {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set(x, 0, z)
  sim.yaw = 0
  sim.vel.set(speed, 0, 0)
  sim.speed = speed
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(x, z)
  setup?.(sim, tr)
  const events = []
  for (let i = 0; i < secs / H; i++) {
    const c = makeControls()
    c.fan = false
    c.throttle = sim.speed < speed ? 0.3 : 0
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
  }
  return { sim, tr, events }
}
// a building with open sidewalk to its west, at street level, and nothing in the 30 m before its
// wall (no hedge, post or palm, the street and the far pavement clear)
const target = BUILDINGS.find(b => {
  const blk = BLOCKS.find(k => b.x0 === k.x0 + WALK + 0.4)
  const t = b.tiers[0],
    z = (b.z0 + b.z1) / 2
  return (
    blk &&
    t.y1 > 10 &&
    t.x0 === b.x0 &&
    t.z0 < z - 2 &&
    t.z1 > z + 2 &&
    openRun(b.x0 - 32, b.x0 - 0.05, z)
  )
})

test('the Roadster bounces off buildings, even at speed, and keeps the wheel', () => {
  const z = (target.z0 + target.z1) / 2
  const slow = driveInto(target.x0 - 6, z, 5, 3)
  assert.notEqual(slow.sim.mode, 'crash')
  assert.ok(
    slow.sim.pos.x + 2.22 < target.x0 + 0.05,
    `stays outside the wall, nose at ${(slow.sim.pos.x + 2.22).toFixed(2)}`
  )
  assert.ok(slow.events.some(e => e.type === 'bump'))
  const fast = driveInto(target.x0 - 30, z, 32, 3)
  assert.ok(
    !fast.events.some(e => e.type === 'crash'),
    'a 115 km/h hit bounces'
  )
  assert.equal(fast.sim.mode, 'ground')
  assert.ok(fast.events.some(e => e.type === 'bump' && e.impact > 20))
  assert.ok(
    fast.sim.pos.x + 2.22 < target.x0 + 0.05,
    'and stays outside the wall'
  )
})

test('flying into the side of a building bounces off without a crash', () => {
  const sim = new Sim()
  sim.reset('city')
  sim.setMode('air')
  sim.com.set(target.x0 - 20, 4, (target.z0 + target.z1) / 2)
  sim.vel.set(30, 0, 0)
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.com.x, sim.com.z)
  const events = []
  for (let i = 0; i < 2 / H; i++) {
    const c = makeControls()
    c.fan = false
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
  }
  assert.ok(
    events.some(e => e.type === 'bump' && e.impact > 20),
    'a hard hit'
  )
  assert.ok(!events.some(e => e.type === 'crash'), 'that bounces off')
  assert.equal(sim.mode, 'ground', 'and it comes down on its wheels')
  assert.ok(sim.pos.x + 2.22 < target.x0 + 0.05, 'outside the wall')
})

test('a hard hit on a car is a shove, not a crash: the Roadster stays drivable', () => {
  const lane = LANES.find(e => e.dx === 1 && e.lane === 1)
  let car
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set(lane.x0 + 5, 0, lane.z0)
  sim.yaw = 0
  sim.vel.set(33, 0, 0)
  sim.speed = 33
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  car = tr.make(0) // stopped across the Roadster's path, clipped on its corner
  car.parked = true
  car.x = lane.x0 + 40
  car.z = lane.z0 + 0.8
  tr.setYaw(car, 0)
  const events = []
  let spin = 0
  for (let i = 0; i < 3 / H; i++) {
    const c = makeControls()
    c.fan = false
    c.throttle = 1
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
    spin = Math.max(spin, Math.abs(sim.yawRate))
  }
  assert.ok(
    events.some(e => e.type === 'bump' && e.impact > 20),
    'a hard hit'
  )
  assert.ok(!events.some(e => e.type === 'crash'), 'that never crashes')
  assert.equal(sim.mode, 'ground')
  assert.ok(car.loose, 'the car is knocked loose')
  assert.ok(
    spin < 4,
    `the Roadster twitches (${spin.toFixed(1)} rad/s), no spin-out`
  )
})

test('the Roadster shunts a stopped car out of its lane', () => {
  const lane = LANES.find(e => e.dx === 1 && e.lane === 1)
  let car
  const r = driveInto(lane.x0 + 5, lane.z0, 9, 3, (sim, tr) => {
    car = tr.make(0)
    car.edge = lane
    car.s = 30
    car.v = 0
    car.v0 = 0.01
    tr.insert(lane, car)
    car.next = tr.choose(lane, car)
    tr.place(car)
    tr.n++
  })
  assert.ok(car.loose, 'knocked loose')
  assert.ok(car.x > lane.x0 + 30.5, 'pushed along')
  assert.notEqual(r.sim.mode, 'crash')
  const a = { ...carRect(car) }
  const me = {
    x: r.sim.pos.x,
    z: r.sim.pos.z,
    fx: Math.cos(r.sim.yaw),
    fz: -Math.sin(r.sim.yaw),
    hl: 2.22,
    hw: 0.99
  }
  assert.ok(!(rectRect(me, a)?.depth > 0.05), 'no overlap afterwards')
})

test('no driver honks before the Roadster has, at the gridlock', () => {
  const lane = LANES.find(e => e.dx === 1 && e.lane === 1)
  // the Roadster runs into a car ahead in its lane: a moment later its driver leans on the horn
  const honks = (quiet, horn) => {
    const r = driveInto(lane.x0 + 5, lane.z0, 15, 4, (sim, tr) => {
      const car = tr.make(0)
      car.edge = lane
      car.s = 30
      car.v = 0
      car.v0 = 0.01
      tr.insert(lane, car)
      car.next = tr.choose(lane, car)
      tr.place(car)
      tr.n++
      tr.quiet = quiet
      tr.horn = horn // the Roadster's own, sounding all the way
    })
    return r.events.filter(e => e.type === 'honk').length
  }
  assert.ok(!atJam(lane.x0 + 30, lane.z0), 'well away from the gridlock')
  assert.ok(honks(false, false) > 0, 'a knocked driver leans on the horn')
  assert.equal(honks(true, false), 0, 'but not before the Roadster has honked')
  assert.equal(honks(true, true), 0, 'and not for its horn anywhere else')
})

test('street lights fold over when the Roadster hits them hard', () => {
  // a light on a sidewalk that runs along x, with the Roadster lined up on it
  const l = LAMPS.find(lampInTheClear)
  standUp()
  const fast = driveInto(l.x - 8, l.z, 15, 2)
  assert.ok(
    fast.events.some(e => e.type === 'knock'),
    'knocked down'
  )
  assert.ok(!fast.events.some(e => e.type === 'crash'), 'without a crash')
  assert.ok(fast.sim.pos.x > l.x + 3, 'and drove on through')
  standUp()
  const slow = driveInto(l.x - 6, l.z, 2, 3)
  assert.ok(!slow.events.some(e => e.type === 'knock'), 'a nudge leaves it up')
  assert.ok(slow.sim.pos.x + 2.22 < l.x + 0.1, 'and stops the car')
})

test('the city never rides the test-site wall that shares its coordinates', () => {
  const r = driveInto(-40, 1.75, 20, 4)
  assert.ok(r.sim.pos.x > 0, 'drove on past the origin')
  assert.equal(r.sim.mode, 'ground')
})

test('Autopilot drives the city without a scrape or a red light', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  assert.ok(pilot.join(), 'finds its lane at the spawn point')
  const events = []
  let dist = 0,
    reds = 0,
    turns = 0
  for (let i = 0; i < 150 / H; i++) {
    const was = pilot.edge
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
    dist += Math.max(0, sim.speed) * H
    if (was.road && pilot.edge !== was && pilot.edge.move) {
      if (pilot.edge.move !== 'S') turns++
      const node = NODES[was.to]
      if (
        signal(node, was.dir, tr.t) === RED &&
        signal(node, was.dir, tr.t - SIGNAL.yellow) === RED
      )
        reds++
    }
  }
  const hits = events.filter(e => e.type === 'bump' || e.type === 'crash')
  assert.deepEqual(hits, [], 'touches nothing')
  assert.equal(reds, 0, 'never enters a junction on red')
  assert.ok(dist > 500, `drove ${dist.toFixed(0)} m`)
  assert.ok(turns > 0, 'takes turns as well as going straight on')
})

test('wild driving in the city never ends in NaN or inside a building', () => {
  let seed = 9
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let run = 0; run < 4; run++) {
    const sim = new Sim()
    sim.reset('city')
    const tr = new Traffic({ seed: run })
    tr.reset(sim.pos.x, sim.pos.z)
    let c = makeControls()
    for (let i = 0; i < 60 / H; i++) {
      if (i % 90 === 0) {
        // a new handful of inputs every 0.75 s: full throttle, boost, lift-offs, flips, the e-brake
        c = makeControls()
        c.fan = false
        c.throttle = rand() < 0.7 ? 1 : 0
        c.brake = rand() < 0.15 ? 1 : 0
        c.steer = rand() * 2 - 1
        c.main = rand() < 0.3 ? 1 : 0
        c.lift = rand() < 0.15 ? 1 : 0
        c.ebrake = rand() < 0.1
        c.pitch = rand() * 2 - 1
        c.roll = rand() * 2 - 1
      }
      sim.step(H, c)
      tr.step(H, sim)
      sim.events.length = 0
      if (sim.mode === 'crash' && sim.crashSettled) sim.reset('city')
    }
    const p = sim.mode === 'ground' ? sim.pos : sim.com
    assert.ok(
      Number.isFinite(p.x + p.y + p.z + sim.quat.w),
      `run ${run}: finite`
    )
    for (const b of BUILDINGS) {
      const t = b.tiers[0]
      assert.ok(
        !(
          p.x > t.x0 + 0.3 &&
          p.x < t.x1 - 0.3 &&
          p.z > t.z0 + 0.3 &&
          p.z < t.z1 - 0.3 &&
          p.y < t.y1
        ),
        `run ${run}: ended inside a building`
      )
    }
    for (const car of tr.cars)
      assert.ok(
        Number.isFinite(car.x + car.z + car.yaw),
        `run ${run}: traffic finite`
      )
  }
})

// a point on one of the jammed street's lanes
const inJam = p =>
  JAM.some(e => {
    const s = (p.x - e.x0) * e.dx + (p.z - e.z0) * e.dz
    return (
      s > 0 &&
      s < e.len &&
      Math.abs((p.z - e.z0) * e.dx - (p.x - e.x0) * e.dz) < 1
    )
  })

test('the jammed street is packed nose to tail, traffic keeps out, Autopilot joins its tail', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  const jam = tr.cars.filter(c => c.parked && inJam(c))
  assert.ok(jam.length >= 36, `${jam.length} cars in the jam`)
  for (let i = 0; i < jam.length; i++)
    for (let j = i + 1; j < jam.length; j++) {
      const a = { ...carRect(jam[i]) }
      assert.ok(!rectRect(a, carRect(jam[j])), 'no two jammed cars overlap')
    }
  // Autopilot sets off from the spawn point, which faces the jam down the avenue: it waits at the
  // light like anyone else, then pulls up behind the last car in the queue, clear of the junction
  const pilot = new CityPilot(sim, tr)
  assert.ok(pilot.join(), 'finds its lane at the spawn point')
  let entered = 0,
    queued = null
  const hits = []
  for (let i = 0; i < 90 / H; i++) {
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
    hits.push(...sim.events.filter(e => e.type === 'bump'))
    sim.events.length = 0
    for (const car of tr.cars) if (!car.parked && car.edge?.closed) entered++
    if (pilot.horn && !queued) queued = { edge: pilot.edge, s: pilot.s }
  }
  assert.equal(entered, 0, 'no traffic drives into the jammed street')
  assert.ok(queued?.edge.closed, 'Autopilot joins the queue in it')
  assert.ok(queued.s > CAR.halfL, 'with its tail clear of the junction')
  assert.deepEqual(hits, [], 'without touching the car in front')
  assert.ok(
    !inJam(nearestLane(JAM_AT.x, JAM_AT.z)),
    'a wreck in the jam is put back on an open street'
  )
})

test('Autopilot drives to the gridlock, honks, flies over it and drives on', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  assert.ok(pilot.join(), 'finds its lane at the spawn point')
  const events = []
  let honked = false,
    early = false,
    flew = false,
    maxY = 0
  for (let i = 0; i < 60 / H; i++) {
    sim.step(H, pilot.update(H))
    tr.horn = pilot.horn // (as the main loop passes it on)
    tr.step(H, sim)
    early ||= !honked && sim.events.some(e => e.type === 'honk')
    events.push(...sim.events)
    sim.events.length = 0
    honked ||= pilot.horn
    if (sim.mode === 'air') {
      flew = true
      maxY = Math.max(maxY, sim.com.y)
    }
    if (flew && sim.mode === 'ground' && !pilot.hop && sim.speed > 5) break
  }
  assert.ok(honked, 'leans on the horn in the jam')
  assert.ok(
    !early && !tr.quiet,
    'the first horn in town, after which drivers may'
  )
  assert.ok(flew && maxY > 6, `flies over it (${maxY.toFixed(1)} m up)`)
  assert.equal(sim.mode, 'ground', 'and comes down on its wheels')
  assert.ok(
    sim.pos.x > JAM_AT.x + 50 && !pilot.edge.closed,
    'past the gridlock, on an open lane'
  )
  const hits = events.filter(e => e.type === 'bump' || e.type === 'crash')
  assert.deepEqual(hits, [], 'touching nothing on the way')
})

test('a 180 km/h jump clears the jammed street', () => {
  const lane = JAM.find(e => e.dx === 1 && e.lane === 1)
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set(lane.x0 - 70, 0, lane.z0)
  sim.vel.set(50, 0, 0)
  sim.speed = 50
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const events = []
  while (sim.com.x < lane.x0 + lane.len + 5 && sim.mode !== 'crash') {
    const c = makeControls()
    c.fan = false
    // lift off 45 m short of the first car and climb to 4.5 m on the thrusters
    c.lift = (sim.mode === 'ground'
    ? sim.pos.x > lane.x0 - 45
    : sim.com.y < 4.5 && sim.vel.y >= 0)
      ? 1
      : 0
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
  }
  assert.deepEqual(
    events.filter(e => e.type === 'bump' || e.type === 'crash'),
    [],
    'touches nothing'
  )
  assert.equal(sim.mode, 'air', 'still flying past the end of the jam')
  assert.ok(!tr.cars.some(c => c.loose), 'every jammed car still in place')
})

// rooftop plant (and masts) clear of a 5 m wide run along x from x0 to x1 at z
const clearRun = (b, x0, x1, z) =>
  !b.antenna &&
  !b.plant.some(p => p.x1 > x0 && p.x0 < x1 && p.z1 > z - 2.5 && p.z0 < z + 2.5)
// run the Roadster under ctl(c) for secs, collecting its events
function drive (sim, tr, secs, ctl, events = []) {
  for (let i = 0; i < secs / H; i++) {
    const c = makeControls()
    c.fan = false
    ctl(c)
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
  }
  return events
}

test('the Roadster lands on a roof, drives on it, and drives straight off the edge', () => {
  // a single-tier roof with a clear run from its middle to its east edge, and room past the edge to
  // come down (nothing as tall as the roof in the 14 m beyond it)
  const b = BUILDINGS.find(b => {
    const t = b.tiers[0],
      cz = (t.z0 + t.z1) / 2
    return (
      b.tiers.length === 1 &&
      t.x1 - t.x0 > 20 &&
      t.z1 - t.z0 > 20 &&
      t.y1 > 15 &&
      t.y1 < 60 &&
      clearRun(b, t.x0, t.x1, cz) &&
      !query(t.x1 + 0.1, cz - 3, t.x1 + 14, cz + 3).some(c => c.y1 > t.y1 - 1)
    )
  })
  const t = b.tiers[0],
    cz = (t.z0 + t.z1) / 2
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 0 })
  tr.reset(t.x0, cz)
  sim.setMode('air')
  sim.com.set(t.x0 + 4, t.y1 + 3, cz)
  sim.vel.set(0, 0, 0)
  sim.syncPose()
  const events = drive(sim, tr, 1.5, () => {})
  assert.equal(sim.mode, 'ground', 'landed')
  assert.ok(Math.abs(sim.pos.y - t.y1) < 1e-9, 'on the roof')
  drive(sim, tr, 1, c => (c.throttle = 0.4), events)
  assert.ok(Math.abs(sim.pos.y - t.y1) < 1e-9, 'driving on the roof')
  // full throttle at the east edge: no parapet in the way, it goes right over and down
  drive(sim, tr, 6, c => (c.throttle = sim.mode === 'ground' ? 1 : 0), events)
  assert.ok(!events.some(e => e.type === 'crash'), 'no crash')
  assert.ok(
    !events.some(e => e.type === 'bump' && e.impact > 1 && sim.pos.x < t.x1),
    'nothing stopped it on the roof'
  )
  assert.equal(sim.mode, 'ground')
  assert.ok(sim.pos.x > t.x1 && sim.pos.y < t.y1, 'off the edge and down')
})

test('the Roadster drives off a tall roof onto a lower one across the alley', () => {
  // the biggest drop between single-tier roofs side by side, with a clear run across
  let best = null
  for (const A of BUILDINGS) {
    const a = A.tiers[0]
    if (A.tiers.length !== 1 || a.x1 - a.x0 < 16) continue
    for (const B of BUILDINGS) {
      const b = B.tiers[0],
        gap = b.x0 - a.x1,
        drop = a.y1 - b.y1
      if (B.tiers.length !== 1 || gap <= 0 || gap > 6 || drop < 4) continue
      if (b.x1 - b.x0 < 16 || (best && drop < best.drop)) continue
      for (
        let z = Math.max(a.z0, b.z0) + 3;
        z <= Math.min(a.z1, b.z1) - 3;
        z += 0.5
      )
        if (
          clearRun(A, a.x1 - 16, a.x1, z) &&
          clearRun(B, b.x0, b.x0 + 14, z)
        ) {
          best = { a, b, gap, drop, z }
          break
        }
    }
  }
  const { a, b, gap, drop, z } = best
  assert.ok(drop > 20, `a ${drop.toFixed(0)} m drop`)
  // just fast enough to come down well onto the far roof
  const v = (gap + 6) / Math.sqrt((2 * drop) / 9.81)
  const sim = new Sim()
  sim.reset('city', { x: a.x1 - 5, z, yaw: 0 })
  sim.floor = a.y1
  sim.roof = roofAt(a.x1 - 5, z, a.y1)
  sim.vel.set(v, 0, 0)
  sim.speed = v
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, z)
  const events = drive(sim, tr, 8, c => {
    if (sim.mode !== 'ground') return
    if (sim.floor === a.y1) c.throttle = sim.speed < v ? 0.3 : 0
    else c.brake = 1
  })
  assert.ok(!events.some(e => e.type === 'crash'), 'no crash')
  assert.ok(
    events.some(e => e.type === 'touchdown'),
    'it flew off the edge and came down'
  )
  assert.equal(sim.mode, 'ground')
  assert.ok(Math.abs(sim.pos.y - b.y1) < 1e-9, 'on the lower roof')
  assert.ok(sim.pos.x > b.x0 && sim.pos.x < b.x1, 'inside its edges')
})

// Coast at `speed` along +x from (x, z) for secs: every event, the first 'knock' and the car's speed
// just after it.
function ram (x, z, speed, secs = 1.5) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  sim.vel.set(speed, 0, 0)
  sim.speed = speed
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(x, z)
  const events = []
  let knock, after
  for (let i = 0; i < secs / H; i++) {
    const c = makeControls()
    c.fan = false
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    if (!knock && (knock = sim.events.find(e => e.type === 'knock')))
      after = Math.hypot(sim.vel.x, sim.vel.z)
    sim.events.length = 0
  }
  return { sim, events, knock, after }
}

test('a signal mast stops a slow car, and goes over when hit hard at a cost in speed', () => {
  // the mast on the far right corner for eastbound traffic, approached along the sidewalk
  const p = POLES.find(p => p.dir === 0 && p.x > 0 && p.z > 0)
  standUp()
  const slow = ram(p.x - 14, p.z, 8, 3)
  assert.ok(!slow.knock, 'a 29 km/h knock leaves it standing')
  assert.ok(slow.sim.pos.x + 2.22 < p.x, 'and stops the car')
  assert.ok(slow.events.some(e => e.type === 'bump'))
  standUp()
  const fast = ram(p.x - 14, p.z, 20)
  assert.equal(fast.knock?.kind, 'signal', 'a 72 km/h hit takes it down')
  assert.ok(!fast.events.some(e => e.type === 'crash'), 'without a crash')
  assert.ok(
    fast.after < 15 && fast.after > 8,
    `and costs speed: 20 -> ${fast.after.toFixed(1)} m/s`
  )
  assert.ok(fast.sim.pos.x > p.x + 2, 'the car drives on through')
  // a breakaway street light costs far less
  standUp()
  const l = LAMPS.find(lampInTheClear)
  const lamp = ram(l.x - 8, l.z, 20)
  assert.equal(lamp.knock?.kind, 'lamp')
  assert.ok(lamp.after > 17.5, `20 -> ${lamp.after.toFixed(1)} m/s`)
  standUp()
})

test('park trees and palms snap when hit hard, by how big they are', () => {
  // a big park tree with nothing in the way of a run at it along +x
  const t = TREES.find(t => t.s > 1.1 && openRun(t.x - 14, t.x - 0.6, t.z, 1.8))
  standUp()
  assert.ok(!ram(t.x - 12, t.z, 6, 3).knock, 'a nudge leaves it standing')
  standUp()
  const tree = ram(t.x - 12, t.z, 20)
  assert.equal(tree.knock?.kind, 'tree', 'a hard hit takes it down')
  assert.ok(!tree.events.some(e => e.type === 'crash'), 'without a crash')
  assert.ok(tree.after < 19, `20 -> ${tree.after.toFixed(1)} m/s`)
  // a tall fan palm along a boulevard's sidewalk, and a stout date palm
  for (const fan of [true, false]) {
    standUp()
    const p = PALMS.find(
      p => p.fan === fan && p.x > 0 && openRun(p.x - 11, p.x - 0.6, p.z, 1.2)
    )
    const palm = ram(p.x - 9, p.z, 22)
    assert.equal(palm.knock?.kind, 'palm', fan ? 'a fan palm' : 'a date palm')
  }
  standUp()
})

test('a car knocked loose snaps a street light it slides into', () => {
  const l = LAMPS.find(lampInTheClear)
  standUp()
  // (the Roadster parked on the road nearby: traffic far from it is cleared away)
  const sim = new Sim()
  sim.reset('city', { x: l.x - 20, z: l.z + l.az * 7.6, yaw: 0 })
  const tr = new Traffic({ count: 0 })
  tr.reset(l.x, l.z)
  const car = tr.make(0)
  Object.assign(car, { loose: true, looseT: 0, lc: 0, vx: 14, vz: 0, w: 0 })
  car.x = l.x - 6
  car.z = l.z
  tr.setYaw(car, 0)
  const events = drive(sim, tr, 1, c => (c.brake = 1))
  const k = events.find(e => e.type === 'knock')
  assert.equal(k?.by, 'traffic', 'the sliding car took it down')
  assert.ok(car.x > l.x, 'and slid on past')
  standUp()
})
