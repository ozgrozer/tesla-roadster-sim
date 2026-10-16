// Headless checks of the city: layout, lane graph, signals, traffic and the Roadster's collisions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { makeControls } from '../js/sim/constants.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { Traffic } from '../js/sim/traffic.js'
import { CityPilot } from '../js/sim/cityPilot.js'
import {
  RED,
  WALK,
  NODES,
  EDGES,
  LANES,
  BLOCKS,
  SIGNAL,
  CYCLE,
  BUILDINGS,
  signal,
  pointAt
} from '../js/sim/city.js'

const H = 1 / 120

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
      // into an intersection on a red that was already red a yellow ago: a red-light runner
      if (was && was.road && car.edge !== was && car.edge.move) {
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
// a building with open sidewalk to its west, at street level
const target = BUILDINGS.find(b => {
  const blk = BLOCKS.find(k => b.x0 === k.x0 + WALK + 0.4)
  return blk && b.tiers[0].y1 > 10
})

test('the Roadster bounces off buildings, and crashes into them at speed', () => {
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
    fast.events.some(e => e.type === 'crash' && e.reason === 'Hit a building'),
    'a 115 km/h hit crashes'
  )
  assert.ok(fast.sim.com.x < target.x0, 'and the wreck stays outside')
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
