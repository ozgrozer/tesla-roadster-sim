// Headless checks of the GPS's routes (route.js) and of Autopilot driving to a waypoint: routes
// between random points on the lanes exist, join up turn by turn, keep off the jammed street, are
// the shortest the lane graph allows and no longer than a few blocks over the distance; the line
// drawn for them stays on the road; Autopilot gets round the gridlock to a waypoint and pulls up at
// it (also one reached while it hops a jam), and its green wave turns a light it holds whichever
// way its route now crosses it, after the other way's amber.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { JAM, JAM_AT } from '../js/sim/jam.js'
import { CityPilot } from '../js/sim/cityPilot.js'
import {
  N,
  rng,
  ROADS,
  PITCH,
  LANES,
  RED,
  GREEN,
  YELLOW,
  nodeAt,
  signal,
  ROAD_HW,
  LANE_OFF
} from '../js/sim/city.js'
import {
  snap,
  laneOf,
  routeTo,
  pathFrom,
  lengthOf,
  routeLine
} from '../js/sim/route.js'

const H = 1 / 120
const SWAP = 15 // (route.js: what a lane change counts for)
const open = LANES.filter(e => !e.closed)

// n random (lane, s) pairs from a seeded generator: where from, and a waypoint near where to
function pairs (n, seed) {
  const R = rng(seed),
    out = []
  for (let i = 0; i < n; i++) {
    const a = open[Math.floor(R() * open.length)],
      b = open[Math.floor(R() * open.length)]
    const sa = R() * a.len,
      sb = R() * b.len
    out.push({
      a,
      sa,
      goal: snap(b.x0 + b.dx * sb + R() * 8 - 4, b.z0 + b.dz * sb + R() * 8 - 4)
    })
  }
  return out
}

// the shortest way from s along lane a to any of the goal's stops, searched forwards with the same
// rules as the plan (turns at junctions, a lane change for SWAP m more), to check it against
function shortest (a, sa, goal) {
  const stop = goal.stops.get(a)
  if (stop !== undefined && sa <= stop + 1) return stop - sa
  const best = new Map(),
    todo = []
  const reach = (L, d) => {
    if (L.closed || d >= (best.get(L) ?? Infinity)) return
    best.set(L, d)
    todo.push(L)
  }
  for (const c of a.next) reach(c.next[0], a.len - sa + c.len)
  if (a.twin && !a.twin.closed)
    for (const c of a.twin.next) reach(c.next[0], a.len - sa + c.len + SWAP)
  let found = Infinity
  while (todo.length) {
    // (the nearest lane not yet looked on from: a plain Dijkstra, slow and simple)
    let k = 0
    for (let i = 1; i < todo.length; i++)
      if (best.get(todo[i]) < best.get(todo[k])) k = i
    const L = todo.splice(k, 1)[0],
      d = best.get(L)
    if (d >= found) break
    const s = goal.stops.get(L)
    if (s !== undefined) {
      found = Math.min(found, d + s)
      continue
    }
    for (const c of L.next) reach(c.next[0], d + L.len + c.len)
    if (L.twin && !L.twin.closed)
      for (const c of L.twin.next) reach(c.next[0], d + L.len + c.len + SWAP)
  }
  return found
}

// what the plan says the way from s along lane a costs
function planned (plan, a, sa) {
  const stop = plan.stops.get(a)
  if (stop !== undefined && sa <= stop + 1) return stop - sa
  const over = a.twin ? (plan.dOwn.get(a.twin) ?? Infinity) + SWAP : Infinity
  return a.len - sa + Math.min(plan.dOwn.get(a) ?? Infinity, over)
}

test('a waypoint snaps to the middle of the nearest open street, reachable both ways', () => {
  const R = rng(7)
  for (let i = 0; i < 300; i++) {
    const x = (R() - 0.5) * 1100,
      z = (R() - 0.5) * 1100
    const g = snap(x, z)
    assert.ok(g, 'there is always a street')
    // (on a road's centre line, along x or along z)
    const onX = ROADS.some(r => Math.abs(g.x - r) < 1e-6),
      onZ = ROADS.some(r => Math.abs(g.z - r) < 1e-6)
    assert.ok(onX || onZ, `in the middle of the road (${g.x}, ${g.z})`)
    assert.ok(g.street && g.area, 'named')
    assert.ok(g.stops.size === 4, 'its four lanes, two each way')
    for (const [L, s] of g.stops) {
      assert.ok(!L.closed, 'never in the jammed street')
      const px = L.x0 + L.dx * s,
        pz = L.z0 + L.dz * s
      const d = Math.hypot(px - g.x, pz - g.z)
      assert.ok(LANE_OFF.some(o => Math.abs(d - o) < 1e-6), 'beside it')
    }
  }
  // a click on the gridlock goes to the nearest street round it
  const j = snap(JAM_AT.x, JAM_AT.z)
  assert.ok([...j.stops.keys()].every(L => !JAM.includes(L)))
})

test('routes between random points join up, keep off the gridlock and get there', () => {
  for (const { a, sa, goal } of pairs(400, 11)) {
    const plan = routeTo(goal)
    const path = pathFrom(plan, a, sa)
    assert.ok(path.length > 0, 'a route')
    assert.equal(path[0].e, a, 'from the lane the car is on')
    assert.ok(Math.abs(path[0].s0 - sa) < 1e-9, '...where it is on it')
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1].e,
        q = path[i].e
      // each piece leads onto the next: a turn from this lane (or, having moved over, from the
      // lane beside it), or the lane a turn leads onto
      const ways = p.road ? [...p.next, ...(p.twin?.next || [])] : p.next
      assert.ok(ways.includes(q), `piece ${i} follows on (${p.id} > ${q.id})`)
    }
    for (const { e, s0, s1 } of path) {
      assert.ok(!e.closed && !e.next[0].closed, 'off the closed lanes')
      assert.ok(s1 >= s0 && s0 >= 0 && s1 <= e.len + 1e-9, 'within its edge')
    }
    const last = path[path.length - 1]
    assert.equal(goal.stops.get(last.e), last.s1, 'ends at the waypoint')
    // the shortest way the lane graph allows (a lane change counted at SWAP)
    const best = shortest(a, sa, goal)
    assert.ok(
      Math.abs(planned(plan, a, sa) - best) < 1e-6,
      `the shortest (${planned(plan, a, sa).toFixed(1)} vs ${best.toFixed(1)})`
    )
    // and no more than a few blocks over the distance on the grid (a waypoint just behind the car,
    // or one the far side of the gridlock, is round a block or two)
    const len = lengthOf(path)
    const grid =
      Math.abs(goal.x - (a.x0 + a.dx * sa)) +
      Math.abs(goal.z - (a.z0 + a.dz * sa))
    assert.ok(len <= grid + 5 * PITCH, `${len.toFixed(0)} m for ${grid} m`)
    assert.ok(len <= best + 1e-6, 'its length within its cost')
  }
})

test('the route line runs unbroken down its side of the road', () => {
  for (const { a, sa, goal } of pairs(120, 23)) {
    const line = routeLine(pathFrom(routeTo(goal), a, sa))
    assert.ok(line.length >= 4, 'a line')
    for (let i = 0; i < line.length; i += 2) {
      const x = line[i],
        z = line[i + 1]
      const k = Math.round(x / PITCH + N / 2),
        j = Math.round(z / PITCH + N / 2)
      const onX = Math.abs(x - ROADS[Math.max(0, Math.min(N, k))]) < ROAD_HW,
        onZ = Math.abs(z - ROADS[Math.max(0, Math.min(N, j))]) < ROAD_HW
      assert.ok(onX || onZ, `on the road at (${x.toFixed(1)}, ${z.toFixed(1)})`)
      if (i)
        assert.ok(
          Math.hypot(x - line[i - 2], z - line[i - 1]) < PITCH,
          'no jumps'
        )
    }
    const n = line.length
    assert.ok(Math.hypot(line[n - 2] - goal.x, line[n - 1] - goal.z) < 4)
  }
})

test('the GPS finds the lane the car is on, going its way', () => {
  const R = rng(5)
  for (let i = 0; i < 300; i++) {
    const e = open[Math.floor(R() * open.length)],
      s = 5 + R() * (e.len - 10)
    const at = laneOf(e.x0 + e.dx * s, e.z0 + e.dz * s, e.dx, e.dz)
    assert.equal(at.lane, e, 'its lane')
    assert.ok(Math.abs(at.s - s) < 1e-9, 'and where along it')
    // just over the line towards the lane beside it: still the lane it was on, if it was on it
    const k = 1.9 * (e.lane ? -1 : 1),
      x = e.x0 + e.dx * s - e.dz * k,
      z = e.z0 + e.dz * s + e.dx * k
    assert.equal(laneOf(x, z, e.dx, e.dz, e).lane, e, 'keeps its lane')
    assert.equal(laneOf(x, z, e.dx, e.dz).lane, e.twin, 'or the nearer')
  }
})

test('Autopilot drives round the gridlock to a waypoint and pulls up at it', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ seed: 4 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  // on Wilshire past the gridlock, at La Cienega: straight ahead, but not through the jam
  const goal = snap(ROADS[5] - 40, 0)
  pilot.goTo(routeTo(goal))
  pilot.reset()
  assert.ok(pilot.join(), 'finds its lane at the spawn point')
  assert.equal(pilot.cap[1], 'Heading for the waypoint')
  const events = []
  let jammed = false,
    t = 0
  for (; t < 150 && !pilot.arrived; t += H) {
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
    jammed ||= pilot.edge?.closed
  }
  assert.ok(pilot.arrived, `arrives (${t.toFixed(0)} s)`)
  assert.ok(!jammed && !pilot.hop, 'round the gridlock, not into it')
  const d = Math.hypot(sim.pos.x - goal.x, sim.pos.z - goal.z)
  assert.ok(d < 8, `pulls up at the waypoint (${d.toFixed(1)} m off)`)
  assert.ok(sim.groundSpeed() < 0.5, 'and stops there')
  // and holds there, the caption saying so
  for (let i = 0; i < 3 / H; i++) {
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
  }
  assert.ok(Math.hypot(sim.pos.x - goal.x, sim.pos.z - goal.z) < 8)
  assert.equal(pilot.cap[1], 'Arrived')
  const hits = events.filter(e => e.type === 'crash')
  assert.deepEqual(hits, [], 'without a crash')
  // reached and cleared: the next start heads for the gridlock again
  pilot.goTo(null, true)
  pilot.reset()
  assert.equal(pilot.cap[1], 'Heading for the gridlock')
})

test('a light Autopilot holds turns the way its route now crosses it', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  // a waypoint on La Brea, north of its junction with Santa Monica Blvd: coming along Santa Monica
  // Blvd the route turns there (the light held east-west), up La Brea it goes straight over
  // (north-south), as when a missed lane change sends Autopilot round another way
  pilot.goTo(routeTo(snap(ROADS[7], -250)))
  const J = nodeAt(7, 3)
  pilot.lights(J.inc[0][0])
  assert.equal(J.hold?.axis, 0, 'held for the way along Santa Monica Blvd')
  pilot.lights(J.inc[3][0])
  assert.equal(J.hold?.axis, 1, 'turned for the way up La Brea')
  assert.equal(signal(J, 0, tr.t), YELLOW, 'the other way on its amber first')
  assert.equal(signal(J, 3, tr.t + 1), RED, '...and an all-red')
  assert.equal(signal(J, 3, tr.t + 5), GREEN, 'then green for it')
  pilot.releaseLights()
  assert.equal(J.hold, null, 'and back on its cycle')
})

test('a waypoint reached over a jam is still where Autopilot comes down and pulls up', () => {
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  const plan = routeTo(snap(ROADS[5] - 40, 0))
  pilot.goTo(plan)
  pilot.reset()
  assert.ok(pilot.join())
  // in the air when the GPS says the waypoint is reached (the car within 15 m of it)
  pilot.hop = { to: { lane: pilot.edge } }
  pilot.goTo(null, true)
  pilot.landed()
  assert.equal(pilot.plan, plan, 'it still pulls up there')
  assert.equal(pilot.cap[1], 'Heading for the waypoint')
  // one cleared by hand over a jam is forgotten: it drives on
  pilot.goTo(plan)
  pilot.hop = { to: { lane: pilot.edge } }
  pilot.goTo(null)
  pilot.landed()
  assert.equal(pilot.plan, null, 'drives on')
  pilot.releaseLights()
})
