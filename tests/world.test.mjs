// The grown world: its query API (world.js), the freeway and the hill road driven, the districts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { makeControls } from '../js/sim/constants.js'
import { N, PITCH, HALF, BLOCKS, LANES, query, superOf } from '../js/sim/city.js'
import {
  groundHeight,
  groundNormal,
  districtAt,
  parkingNear,
  pavementNear,
  pavementGraph,
  spawnPoints,
  onHillRoad,
  inTunnel,
  FWY,
  HILL_ROAD,
  LOOKOUT
} from '../js/sim/world.js'
import { RAMPS } from '../js/sim/lots.js'
import { naturalHill } from '../js/sim/hills.js'
import { hillHeight } from '../js/sim/hillroad.js'
import { keepIn } from '../js/sim/edge.js'
import '../js/sim/breakables.js'

const H = 1 / 120

test('the map is 18 blocks a side, 3.24 times the first city, with lanes all over it', () => {
  assert.equal(N, 18)
  assert.equal(2 * HALF, 18 * PITCH)
  assert.ok(((2 * HALF) / (10 * PITCH)) ** 2 > 3.2)
  assert.equal(BLOCKS.length, N * N)
  const east = LANES.filter(e => e.x0 > HALF - PITCH).length
  assert.ok(east > 50, `${east} lanes in the far east`)
})

test('groundHeight: the street, the freeway deck over it, a ramp part way up, the hills', () => {
  const x = (FWY.x0 + FWY.x1) / 2
  assert.equal(groundHeight(x, FWY.z, 0), 0, 'under the deck: the street (asked from below)')
  assert.equal(groundHeight(x, FWY.z), FWY.y, 'on top: the deck')
  const r = FWY.ramps[0],
    mid = groundHeight((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)
  assert.ok(Math.abs(mid - FWY.y / 2) < 0.2, `half way up a ramp (${mid.toFixed(2)})`)
  assert.equal(groundHeight(0, 0), 0)
  const hz = -HALF - 300
  assert.ok(groundHeight(-200, hz) > 20, 'up in the hills')
  const n = groundNormal(0, 0)
  assert.ok(Math.abs(n.y - 1) < 1e-9, 'flat in the street')
  const s = groundNormal((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)
  assert.ok(s.y < 1 && s.y > 0.95, 'tipped on a ramp')
})

test('districtAt names the new districts', () => {
  const at = (bx, bz) => districtAt((bx - N / 2 + 0.5) * PITCH, (bz - N / 2 + 0.5) * PITCH)
  assert.equal(at(1, 15).kind, 'port')
  assert.equal(at(15, 12).kind, 'industrial')
  assert.equal(at(8, 13).kind, 'stadium')
  assert.equal(at(5, 15).kind, 'suburb')
  assert.equal(at(3, 3).key !== null, true)
  const h = HILL_ROAD[4]
  assert.equal(districtAt((h.x0 + h.x1) / 2, h.z0).street, 'Santa Fe Canyon Rd')
})

test('spawn points: free parking bays and pavement points, none inside a building', () => {
  const free = parkingNear(-300, 300, 120)
  assert.ok(free.length > 10, `${free.length} free bays`)
  assert.ok(free.every(s => !s.taken))
  const sp = spawnPoints(200, -600, 80)
  assert.ok(sp.cars.length > 0 && sp.people.length > 20)
  for (const p of sp.people) {
    const solid = query(p.x - 0.2, p.z - 0.2, p.x + 0.2, p.z + 0.2).filter(
      c => c.kind === 'building' && c.y0 === 0 && c.look !== 'ramp' && c.look !== 'deck'
    )
    assert.equal(solid.length, 0, `a person at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} in a building`)
  }
  assert.ok(pavementNear(0, 0, 50).length > 10)
})

test('the pavement graph: four corners a block, joined round it and over every street', () => {
  const g = pavementGraph()
  assert.equal(g.nodes.length, 4 * N * N)
  // (every corner reaches every other: one walk across the whole city; but the superblocks', whose
  // pavements run through the stadium bowl and the container stacks, are cut off: nobody walks there)
  const open = g.nodes.filter(n => !superOf(n.block.bx, n.block.bz)).length
  const seen = new Set([0]),
    todo = [0]
  while (todo.length) {
    const i = todo.pop()
    for (const e of g.adj[i]) {
      const j = e.a === i ? e.b : e.a
      if (!seen.has(j)) {
        seen.add(j)
        todo.push(j)
      }
    }
  }
  assert.equal(seen.size, open, 'all connected')
  const over = g.edges.filter(e => e.cross)
  assert.ok(over.every(e => e.len > 10 && e.len < 25), 'crossings a street wide')
})

// drive by pursuit through the points, at about v m/s; the sim each second into log
function drive (sim, pts, v, secs) {
  const c = makeControls()
  let k = 0
  for (let i = 0; i < secs / H && k < pts.length; i++) {
    const [tx, tz] = pts[k]
    const dx = tx - sim.pos.x,
      dz = tz - sim.pos.z
    if (Math.hypot(dx, dz) < 4) {
      k++
      continue
    }
    let e = Math.atan2(-dz, dx) - sim.yaw
    while (e > Math.PI) e -= 2 * Math.PI
    while (e < -Math.PI) e += 2 * Math.PI
    c.steer = Math.max(-1, Math.min(1, e * 2))
    const sp = Math.hypot(sim.vel.x, sim.vel.z)
    c.throttle = sp < v ? 0.5 : 0
    c.brake = sp > v + 3 ? 0.3 : 0
    sim.step(H, c)
    sim.events.length = 0
  }
  return k
}

test('the freeway: up an on-ramp onto the deck, 6.5 m up, and along it over the streets', () => {
  const r = FWY.ramps.find(r => r.on && r.h0 === 0)
  const z = (r.z0 + r.z1) / 2
  const sim = new Sim()
  sim.reset('city', { x: r.x0 - 30, z, yaw: 0 })
  const k = drive(sim, [[r.x0 - 5, z], [r.x1 + 2, z], [r.x1 + 40, FWY.z + 6], [r.x1 + 200, FWY.z + 6]], 12, 40)
  assert.equal(k, 4, `got along it (${k}: ${sim.pos.x.toFixed(1)}, ${sim.pos.y.toFixed(2)}, ${sim.pos.z.toFixed(1)})`)
  assert.ok(Math.abs(sim.pos.y - FWY.y) < 0.1, `on the deck (${sim.pos.y.toFixed(2)} m)`)
})

test('the hill road: from the ring road up the switchbacks, through the tunnel and over the bridge to the lookout', () => {
  const s0 = HILL_ROAD[0]
  const sim = new Sim()
  sim.reset('city', { x: s0.x0, z: s0.z0 + 20, yaw: Math.PI / 2 })
  const pts = [...HILL_ROAD.map(s => [s.x1, s.z1]), [(LOOKOUT.x0 + LOOKOUT.x1) / 2, s0.z0 - 118]]
  const k = drive(sim, pts, 9, 150)
  assert.equal(k, pts.length, 'got to the lookout')
  assert.ok(Math.abs(sim.pos.y - LOOKOUT.y) < 0.1, `up at ${sim.pos.y.toFixed(1)} m`)
  assert.ok(LOOKOUT.y > 60, 'well up in the hills')
})

test('the hills are cut to the hill road, piled over its tunnel, and keepIn leaves a car on it alone', () => {
  for (const s of HILL_ROAD) {
    const x = (s.x0 + s.x1) / 2,
      z = (s.z0 + s.z1) / 2,
      y = (s.h0 + s.h1) / 2
    if (s.kind === 'tunnel') {
      assert.ok(inTunnel(x, z))
      assert.ok(hillHeight(x, z) > y + 6, 'the ridge over the tunnel')
    } else if (s.kind === 'road' && z < -HALF - 25) {
      assert.ok(Math.abs(hillHeight(x, z) - (y - 0.15)) < 0.01, 'the ground cut to the road')
      assert.ok(Math.abs(groundHeight(x, z) - y) < 0.3, 'groundHeight: the road')
    } else if (s.kind === 'bridge')
      assert.ok(hillHeight(x, z) < y - 4, `the canyon under the bridge (${hillHeight(x, z).toFixed(1)} under ${y.toFixed(1)})`)
    assert.ok(onHillRoad(x, z))
  }
  // (away from it the hills are as they were)
  assert.equal(hillHeight(-300, -HALF - 200), naturalHill(-300, -HALF - 200))
  const sim = new Sim()
  sim.reset('city')
  const s = HILL_ROAD[5]
  sim.pos.set((s.x0 + s.x1) / 2, 30, s.z0)
  const before = sim.pos.z
  keepIn(sim)
  assert.equal(sim.pos.z, before, 'not put back on the verge')
  for (const r of RAMPS) assert.ok(r.x1 > r.x0 && r.z1 > r.z0)
})
