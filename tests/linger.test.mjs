// Headless checks of more life on the pavement (linger.js, dogs.js): people sitting on the bus
// benches, one to a seat, and walking on after; stopping at a shop window, facing it; standing
// talking in threes; pairs walking with the companion on the inside; and dogs walked on a lead,
// beside their owners on the pavement, over the road with them, clear of the Roadster and of
// the traffic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { kerbDist } from '../js/sim/street.js'
import { CAR, wrapPi, makeControls } from '../js/sim/constants.js'
import { DECOR, LANE_OFF, ROADS, ROAD_HW } from '../js/sim/city.js'

const H = 1 / 120
const BENCHES = DECOR.filter(d => d.kind === 'bench')
// is (x, z) inside the rectangle of something at (o.x, o.z) heading (hx, hz), with a margin?
const under = (x, z, o, hl, hw, m = 0) => {
  const dx = x - o.x,
    dz = z - o.z
  return (
    Math.abs(dx * o.hx + dz * o.hz) < hl + m &&
    Math.abs(dz * o.hx - dx * o.hz) < hw + m
  )
}
// the city round (x, z) with its traffic and people, stepped t seconds, the car held on its brakes
function city (x, z, seed, t, each) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  const tr = new Traffic({ seed: 3 })
  tr.reset(x, z)
  const peds = new Peds({ seed })
  peds.reset(x, z)
  const view = { x, z, fx: 1, fz: 0 }
  const c = makeControls()
  c.brake = 1
  for (let i = 0; i < t / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
    each(i, peds, tr)
  }
  return peds
}

test('people sit on the benches, one to a seat, then get up and walk on', () => {
  const sat = new Set(),
    rose = new Set()
  let shared = 0,
    astray = 0,
    most = 0
  city(-330, ROADS[3] + LANE_OFF[1], 2, 120, (i, peds) => {
    if (i % 12) return
    const seated = peds.list.filter(p => p.sit > 0.99)
    most = Math.max(most, seated.length)
    for (const p of seated) {
      sat.add(p)
      // on a seat: half a metre either side of a bench's middle, a little back from its front
      const ok = BENCHES.some(b => Math.hypot(b.x - p.x, b.z - p.z) < 0.62)
      if (!ok) astray++
      for (const q of seated)
        if (q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 0.6) shared++
    }
    for (const p of sat) if (p.state === 'walk') rose.add(p)
  })
  assert.ok(most >= 3, `${most} sitting at once`)
  assert.equal(astray, 0, 'each on a bench')
  assert.equal(shared, 0, 'one to a seat')
  assert.ok(rose.size >= 2, `${rose.size} got up and walked on`)
})

test('some stop at a shop window for a few seconds, facing it, under the canopy', () => {
  const looking = new Map() // (how long each has stood at a window this time)
  let wrong = 0,
    stops = 0,
    long = 0
  city(30, ROADS[1] + LANE_OFF[1], 3, 90, (i, peds) => {
    for (const p of peds.list) {
      const at = p.state === 'linger' && p.what === 2 && p.leg === 2
      if (!at) {
        looking.delete(p)
        continue
      }
      if (!looking.has(p)) stops++
      const t = (looking.get(p) || 0) + H
      looking.set(p, t)
      long = Math.max(long, t)
      if (i % 30) continue
      const d = -kerbDist(p.x, p.z)
      if (d < 3.3 || d > 4.4) wrong++
      // (facing into the block, square to the kerb: away from the road once turned)
      const fx = Math.cos(p.yaw),
        fz = -Math.sin(p.yaw),
        k = kerbDist(p.x + fx * 0.3, p.z + fz * 0.3)
      if (t > 1 && k > kerbDist(p.x, p.z) - 0.25) wrong++
    }
  })
  assert.ok(stops >= 4, `${stops} looked in a window`)
  assert.equal(wrong, 0, 'at the window, facing it')
  assert.ok(long < 10, `a few seconds (the longest ${long.toFixed(1)} s)`)
})

test('three stand talking, facing their middle; pairs walk with the companion inside', () => {
  const peds = new Peds({ seed: 2 })
  peds.reset(100, LANE_OFF[1])
  const chat = peds.list.filter(p => p.state === 'idle' && p.act === 2)
  let threes = 0
  for (const p of chat) {
    const near = chat.filter(
      q => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 1.2
    )
    if (near.length !== 2) continue
    threes++
    const g = [p, ...near]
    const cx = g.reduce((a, o) => a + o.x, 0) / 3,
      cz = g.reduce((a, o) => a + o.z, 0) / 3
    const off = wrapPi(Math.atan2(-(cz - p.z), cx - p.x) - p.yaw)
    assert.ok(Math.abs(off) < 0.05, 'facing the middle')
  }
  assert.ok(threes >= 3, `${threes / 3} groups of three`)
  // walking pairs: the companion on the middle line's inside, out of the palms and benches
  const mates = peds.list.filter(p => p.lead && p.state === 'walk')
  assert.ok(mates.length > 10, `${mates.length} walking with someone`)
  for (const q of mates) {
    if (q.piece % 2) continue
    const d = -kerbDist(q.x, q.z)
    assert.ok(d > 3.1 && d < 3.9, `${d.toFixed(2)} m in from the kerb`)
  }
})

test('dogs walk beside their owners, on the pavement, over the road with them', () => {
  let near = 0,
    far = 0,
    off = 0,
    crossed = 0,
    hit = 0,
    count = 0
  const peds = city(100, LANE_OFF[1], 2, 150, (i, peds, tr) => {
    if (i % 6) return
    for (const d of peds.dogs) {
      const o = d.owner
      count++
      if (Math.hypot(d.x - o.x, d.z - o.z) < 1.4) near++
      else far++
      const k = kerbDist(d.x, d.z)
      // (out in the road only with its owner crossing, or diving clear)
      if (o.state === 'cross' && k > 0 && tr.peds.includes(d)) crossed++
      const out =
        o.state === 'cross' ||
        o.state === 'dodge' ||
        o.state === 'back' ||
        d.dash > 0
      if (k > -0.2 && !out) off++
      for (const c of tr.cars)
        if (Math.abs(c.x - d.x) < 8 && Math.abs(c.z - d.z) < 8)
          if (under(d.x, d.z, c, c.len / 2, c.wid / 2, 0.05)) hit++
    }
  })
  assert.ok(peds.dogs.length >= 3, `${peds.dogs.length} dogs out`)
  assert.ok(near > 20 * far, `beside their owners (${near} near, ${far} not)`)
  assert.equal(off, 0, 'on the pavement')
  assert.ok(crossed > 0, 'over the road with them, one for traffic to stop for')
  assert.equal(hit, 0, 'no car runs into a dog')
  for (const d of peds.dogs) assert.equal(d.owner.dog, d)
})

test('a dog dives clear of the Roadster with its owner, and is never under it', () => {
  // (the car along the pavement over the line the dogs walk, inside their owners)
  const sim = new Sim()
  const z = ROAD_HW + 3.1
  sim.reset('city', { x: ROADS[3] + 12, z: ROAD_HW + 3.4, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 6, count: 0 })
  // dog walkers on the pavement ahead of the car (anyone else who turns up sent away again)
  for (let k = 0; k < 4000 && peds.dogs.length < 4; k++) {
    const n = peds.list.length,
      m = peds.dogs.length
    const p = peds.spawn(sim.pos.x + 40, z, 0, 40)
    const ok =
      p &&
      Math.abs(p.z - z) < 1.8 &&
      p.x > sim.pos.x + 10 &&
      p.state === 'walk' &&
      !p.lead &&
      !p.mate
    if (ok && !p.dog) peds.adopt(p)
    else if (!ok) {
      peds.list.length = n
      peds.dogs.length = m
    }
  }
  assert.ok(peds.dogs.length >= 2, 'dogs on the pavement ahead')
  sim.vel.set(14, 0, 0)
  sim.speed = 14
  const c = makeControls()
  c.throttle = 0.15
  let below = 0,
    dashed = 0
  for (let i = 0; i < 4 / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr)
    tr.step(H, sim)
    const me = {
      x: sim.pos.x,
      z: sim.pos.z,
      hx: Math.cos(sim.yaw),
      hz: -Math.sin(sim.yaw)
    }
    for (const d of peds.dogs) {
      if (d.dash > 0.55) dashed++
      if (under(d.x, d.z, me, CAR.halfL, CAR.halfW)) below++
    }
  }
  assert.ok(dashed > 0, 'dived clear')
  assert.equal(below, 0, 'never under the car')
})
