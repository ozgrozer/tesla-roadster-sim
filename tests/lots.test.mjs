// The city's look, as the sim lays it out (lots.js and the neighbourhoods' builders): Los Angeles
// low, its towers downtown and in Century City, each neighbourhood built its own way, and all of it
// clear of the streets and pavements: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onHillRoad } from '../js/sim/hillroad.js'
import { onQuay } from '../js/sim/quay.js'
import { Sim } from '../js/sim/sim.js'
import { roofAt } from '../js/sim/roofs.js'
import { Traffic } from '../js/sim/traffic.js'
import { makeControls } from '../js/sim/constants.js'
import {
  N,
  WALK,
  BLOCKS,
  BUILDINGS,
  SOLIDS,
  SIGNS,
  STALLS,
  PALMS,
  TREES,
  LAMPS,
  WIRES,
  SUPERS,
  PITCH,
  query
} from '../js/sim/city.js'

const H = 1 / 120
// (a superblock, grid.js, is one lot over its four blocks and the closed streets between: its
// north-west block stands for it, stretched over the other three)
const blockAt = (x, z) => {
  const b = BLOCKS.find(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)
  if (!b) {
    const s = SUPERS.find(s => {
      const o = BLOCKS[s.bz * N + s.bx]
      return x > o.x0 && x < o.x1 + PITCH && z > o.z0 && z < o.z1 + PITCH
    })
    return s && whole(s)
  }
  return b.super ? whole(b.super) : b
}
const whole = s => {
  const o = BLOCKS[s.bz * N + s.bx]
  return { ...o, x1: o.x1 + PITCH, z1: o.z1 + PITCH }
}
const inLot = (b, x0, x1, z0, z1, m = 1e-6) =>
  x0 >= b.x0 + WALK - m &&
  x1 <= b.x1 - WALK + m &&
  z0 >= b.z0 + WALK - m &&
  z1 <= b.z1 - WALK + m

test('the city is low, its towers downtown and in Century City', () => {
  const low = BUILDINGS.filter(b => b.h <= 19).length / BUILDINGS.length
  assert.ok(low > 0.6, `${(low * 100).toFixed(0)}% are one to four storeys`)
  for (const b of BUILDINGS)
    if (b.h > 65)
      assert.ok(
        b.area === 'downtown' || b.area === 'towers',
        `a ${b.h.toFixed(0)} m tower in ${b.area}`
      )
  const tall = BUILDINGS.filter(b => b.area === 'downtown' && b.h > 120)
  assert.ok(tall.length >= 8, `${tall.length} downtown towers over 120 m`)
  assert.ok(
    tall.some(b => b.h >= 250),
    'and the tallest over 250 m'
  )
  const cc = BUILDINGS.filter(b => b.area === 'towers' && b.h >= 80)
  assert.ok(cc.length >= 5, `${cc.length} Century City towers`)
  assert.ok(
    BUILDINGS.some(
      b => b.shafts && b.shafts.length > 2 && b.shafts.at(-1).crown
    ),
    'a stepped cylinder with a crown'
  )
  assert.ok(
    BUILDINGS.some(b => b.sail && b.spire),
    'a sail-topped tower with a spire'
  )
  assert.ok(
    BUILDINGS.filter(b => b.area === 'towers' && b.shafts?.[0].pts.length === 6)
      .length === 2,
    'a pair of three-sided towers'
  )
})

test('each neighbourhood is built its own way', () => {
  const of = area => BUILDINGS.filter(b => b.area === area)
  // Beverly Hills: houses on lawns, under tile hip roofs, behind hedges, with pools
  const bh = BLOCKS.filter(b => b.area === 'estates')
  assert.ok(
    bh.every(b => b.base === 'grass'),
    'lawns'
  )
  const houses = of('estates')
  assert.ok(
    houses.every(b => b.h < 9),
    'two storeys at most'
  )
  assert.ok(
    houses.filter(b => b.tiers.some(t => t.hip)).length > houses.length / 2,
    'mostly tile hip roofs'
  )
  assert.ok(
    houses.every(b => b.door),
    'each with a front door'
  )
  assert.ok(SOLIDS.filter(s => s.look === 'hedge').length > 100, 'hedges')
  assert.ok(
    bh.every(b => b.ground.some(g => g.k === 'pool')),
    'pools'
  )
  // Venice: one- and two-storey bungalows and shopfronts
  assert.ok(of('venice').every(b => b.h < 9))
  // Hollywood: theatres with marquees and blade signs, a motel, the round tower
  assert.equal(
    SIGNS.filter(s => s.kind === 'marquee').length,
    2,
    'two theatres'
  )
  assert.ok(
    SIGNS.some(s => s.kind === 'motel'),
    'a motel'
  )
  assert.ok(
    BUILDINGS.some(b => b.records && b.spire),
    'the round tower'
  )
  const hw = of('boulevard').filter(b => b.shop)
  assert.ok(
    hw.filter(b => b.h < 12).length > hw.length * 0.6,
    'mostly one or two storeys'
  )
  // Mid-City: strip malls in their car parks, gas stations, billboards on poles
  assert.ok(SIGNS.filter(s => s.kind === 'mall').length >= 3, 'strip malls')
  assert.equal(
    SOLIDS.filter(s => s.look === 'canopy').length,
    4,
    'four gas stations'
  )
  assert.ok(
    SIGNS.filter(s => s.kind === 'billboard' && s.pole).length >= 5,
    'billboards on poles'
  )
  // Downtown and Century City: helipads on the roofs
  assert.ok(BUILDINGS.filter(b => b.helipad).length >= 10, 'helipads')
  // palms: tall fan palms down the boulevards and Beverly Hills' streets, stout date palms
  assert.ok(PALMS.filter(p => p.fan && p.h > 20).length > 400, 'tall fan palms')
  assert.ok(PALMS.filter(p => !p.fan).length > 100, 'date palms')
})

test('everything built stands on its lot, clear of the streets and pavements', () => {
  for (const b of BUILDINGS) {
    const blk = blockAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)
    for (const t of b.tiers)
      assert.ok(
        inLot(blk, t.x0, t.x1, t.z0, t.z1),
        `a tier of a building in ${b.area}`
      )
  }
  for (const s of SOLIDS) {
    // (the freeway's deck and its parapets cross the streets on purpose, up out of the way: freeway.js)
    if (s.look === 'deck' || (s.look === 'barrier' && s.y0 > 4)) continue
    // (nor is the hill road on a lot: it runs from the ring road up into the hills, hillroad.js)
    if (onHillRoad((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, 2)) continue
    // (nor are the port's cranes, on the quay over the beach: quay.js)
    if (onQuay((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)) continue
    const blk = blockAt((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)
    assert.ok(blk && inLot(blk, s.x0, s.x1, s.z0, s.z1), `a ${s.look} on a lot`)
  }
  // palms and trees: on a lot, or in the planting line along the kerb (people walk inside it)
  for (const p of [...PALMS, ...TREES]) {
    if (p.median) continue // (down a boulevard's median: kerbside.js)
    const blk = blockAt(p.x, p.z)
    if (blk && inLot(blk, p.x, p.x, p.z, p.z)) continue
    const kerb = blk
      ? Math.min(p.x - blk.x0, blk.x1 - p.x, p.z - blk.z0, blk.z1 - p.z)
      : 1.6
    assert.ok(
      Math.abs(kerb - 1.6) < 0.01,
      `a palm or tree ${kerb.toFixed(2)} m in from the kerb`
    )
  }
})

test('the parked cars have room in their spaces, and there are as many as ever', () => {
  assert.equal(STALLS.filter(s => s.taken).length, 267)
  for (const s of STALLS) {
    const hx =
        Math.abs(Math.cos(s.yaw)) * 2.3 + Math.abs(Math.sin(s.yaw)) * 0.95,
      hz = Math.abs(Math.sin(s.yaw)) * 2.3 + Math.abs(Math.cos(s.yaw)) * 0.95
    const hit = query(s.x - hx, s.z - hz, s.x + hx, s.z + hz).filter(
      c => c.y0 < 1.5
    )
    assert.deepEqual(
      hit.map(c => c.kind),
      [],
      `a space at ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`
    )
  }
})

test('helipads are clear of rooftop plant, gas station canopies are landable', () => {
  for (const b of BUILDINGS) {
    const p = b.helipad
    if (!p) continue
    for (const c of b.plant) {
      const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1),
        dz = Math.max(c.z0 - p.z, 0, p.z - c.z1)
      assert.ok(Math.hypot(dx, dz) > p.r, 'plant off the pad')
    }
  }
  for (const c of SOLIDS.filter(s => s.look === 'canopy')) {
    const r = roofAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 20)
    assert.equal(r?.y1, c.y1, 'a canopy is a roof to land on')
  }
})

test('the power lines run from pole to pole along one side of the street', () => {
  assert.ok(WIRES.length > 50)
  for (const [i, j] of WIRES) {
    const a = LAMPS[i],
      b = LAMPS[j]
    assert.ok(a.wood && b.wood, 'wooden poles')
    assert.ok(a.ax === b.ax && a.az === b.az, 'on the same side')
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 60, 'no span too long')
  }
})

test('a tile roof is solid but no roof to land on: the Roadster slides off it', () => {
  // a two-storey house's hip roof, with lawn round it
  const b = BUILDINGS.find(
    b =>
      b.area === 'estates' &&
      b.tiers.length === 2 &&
      b.tiers[0].hip &&
      b.tiers[0].y1 > 6
  )
  const t = b.tiers[0],
    x = (t.x0 + t.x1) / 2,
    z = (t.z0 + t.z1) / 2
  assert.equal(roofAt(x, z, 20).y1, t.y1, 'the walls top out at the eaves')
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 0 })
  tr.reset(x, z)
  sim.setMode('air')
  sim.com.set(x, t.y1 + t.hip + 3, z + 0.7)
  sim.vel.set(0, 0, 0)
  sim.syncPose()
  let crashed = false,
    held = 0
  for (
    let i = 0;
    i < 8 / H && !(sim.mode === 'ground' && sim.floor === 0);
    i++
  ) {
    const c = makeControls()
    c.fan = false
    sim.step(H, c)
    tr.step(H, sim)
    crashed ||= sim.events.some(e => e.type === 'crash')
    sim.events.length = 0
    // (up on the roof: not falling, over the walls' top)
    if (sim.mode === 'air' && Math.abs(sim.vel.y) < 0.3 && sim.com.y > t.y1)
      held++
  }
  assert.ok(held > 12, `it rides the roof (${held} steps)`)
  assert.ok(!crashed, 'without a crash')
  assert.equal(sim.mode, 'ground', 'and comes down off it')
  assert.equal(sim.floor, 0, 'onto the ground, not the roof')
  const p = sim.pos
  assert.ok(
    p.x < t.x0 || p.x > t.x1 || p.z < t.z0 || p.z > t.z1,
    'beside the house'
  )
  assert.equal(BLOCKS.length, N * N)
})
