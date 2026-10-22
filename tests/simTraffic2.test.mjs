// Round 2 traffic (sim workstream): lane changes on the freeway (laneChangeFwy.js), all-way stops at
// the quiet junctions (trafficStop.js) and the stuck watchdog (trafficStuck.js). npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { makeControls } from '../js/sim/constants.js'
import { NODES, LANES, signal, RED } from '../js/sim/city.js'
import { BLVD_EW, BLVD_NS } from '../js/sim/grid.js'
import { SIDES, RANK } from '../js/sim/laneChangeFwy.js'
import { STOPS } from '../js/sim/trafficStop.js'
import { STUCK_LINE } from '../js/sim/trafficStuck.js'
import { busy } from '../js/sim/conditions.js'
import * as HWMOD from '../js/sim/highway.js'
import '../js/sim/breakables.js'

const H = 1 / 120

function run (x, z, secs, each, { px = x, pz = z, count = 110, radius = 300 } = {}) {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set(px, 0, pz)
  sim.syncPose()
  const tr = new Traffic({ count, radius, seed: 7 })
  tr.reset(x, z)
  const c = makeControls()
  c.fan = false
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, c)
    tr.step(H, sim)
    sim.events.length = 0
    each(tr, i)
  }
  return tr
}

test('the freeway lanes know their neighbours: inner, through and outer, each way', () => {
  assert.ok(SIDES.size >= 4, `${SIDES.size} freeway lanes with a neighbour`)
  const ranks = new Set(RANK.values())
  for (const k of [0, 1, 2]) assert.ok(ranks.has(k), `a lane of rank ${k}`)
  for (const [, s] of SIDES) {
    if (s.left) assert.ok(SIDES.get(s.left.id)?.right, 'left and right agree')
    if (s.right) assert.ok(SIDES.get(s.right.id)?.left, 'right and left agree')
  }
})

test('on the freeway drivers change lanes (overtaking, merging, keeping right), smoothly and without a touch', () => {
  let left = 0,
    right = 0,
    touch = 0,
    jump = 0
  const was = new Map()
  const tr = run(0, 170, 150, (tr, i) => {
    for (const c of tr.cars) {
      if (c.parked || !c.edge?.hw || c.edge.road) continue
      if (c.lc > 0 && c.lc < 0.02 && !was.has(c.id + ':' + c.edge.id)) {
        was.set(c.id + ':' + c.edge.id, 1)
        if (c.lat0 < 0) right++
        else left++
      }
    }
    if (i % 12) return
    const fw = tr.cars.filter(c => !c.parked && c.edge?.hw && !c.edge.road)
    for (const c of fw) {
      const p = c.prevX === undefined ? null : Math.hypot(c.x - c.prevX, c.z - c.prevZ)
      if (p !== null && p > c.v * 0.1 + 1.5) jump++
      c.prevX = c.x
      c.prevZ = c.z
    }
    for (let a = 0; a < fw.length; a++)
      for (let b = a + 1; b < fw.length; b++) {
        const p = fw[a],
          q = fw[b]
        const dx = p.x - q.x,
          dz = p.z - q.z
        if (Math.abs(dx) > 12 || Math.abs(dz) > 12) continue
        const along = Math.abs(dx * p.hx + dz * p.hz),
          side = Math.abs(dx * p.hz - dz * p.hx)
        if (along < (p.len + q.len) / 2 - 0.4 && side < (p.wid + q.wid) / 2 - 0.4) touch++
      }
  })
  assert.ok(tr.fwyChanges > 15, `${tr.fwyChanges} lane changes on the freeway`)
  assert.ok(left > 3 && right > 3, `both ways (${left} left, ${right} right)`)
  assert.equal(touch, 0, 'no two cars overlap')
  assert.equal(jump, 0, 'nobody jumps sideways')
  const stuck = tr.cars.filter(c => c.edge?.hw && !c.parked && c.still > 20)
  assert.equal(stuck.length, 0, 'nobody stuck on it')
})

test('all-way stops at the quiet junctions: flashing red, everyone stops, nobody left there', () => {
  assert.ok(STOPS.length >= 6, `${STOPS.length} all-way stops`)
  for (const n of STOPS) assert.ok(!BLVD_EW.has(n.iz) && !BLVD_NS.has(n.ix), 'never on a boulevard')
  const n0 = STOPS.find(n => n.ix === 7 && n.iz === 14) || STOPS[0]
  const seen = new Set()
  for (let t = 0; t < 2.4; t += 0.1) seen.add(signal(n0, 0, t))
  assert.ok(seen.has(RED) && seen.size === 2, 'the heads flash red')
  const minV = new Map(),
    over = new Map()
  const tr = run(n0.x, n0.z, 150, tr => {
    for (const c of tr.cars) {
      if (c.parked || !c.edge) continue
      const e = c.edge
      if (e.road && NODES[e.to].stop && e.len - c.s - c.len / 2 < 3)
        minV.set(c.id, Math.min(minV.get(c.id) ?? 99, c.v))
      if (e.move && NODES[e.node].stop && c.s < 1 && !over.has(c.id)) over.set(c.id, minV.get(c.id) ?? 99)
    }
  }, { px: n0.x + 40, pz: n0.z + 40, radius: 250 })
  const v = [...over.values()]
  assert.ok(v.length > 30, `${v.length} cars through all-way stops`)
  assert.equal(v.filter(x => x > 1.5).length, 0, 'every one stopped (or all but, a bold one) at the line')
  const left = tr.cars.filter(c => !c.parked && c.edge?.move && NODES[c.edge.node].stop && c.still > 15)
  assert.equal(left.length, 0, 'nobody stuck in one')
})

test('stuck: a left turn waiting forever goes another way; one stuck out of sight is taken off', () => {
  const tr = new Traffic({ count: 1, radius: 100, seed: 3 })
  tr.clear()
  const e = LANES.find(L => L.road && !L.closed && L.next.some(o => o.move === 'L') && L.next.some(o => o.move === 'S'))
  const car = tr.make(0)
  car.edge = e
  car.s = e.len - 3
  car.next = e.next.find(o => o.move === 'L')
  tr.insert(e, car)
  tr.n++
  car.still = STUCK_LINE + 1
  assert.equal(tr.unstuck(car, 30, true), false)
  assert.notEqual(car.next.move, 'L', 'rerouted')
  assert.equal(tr.stuckN.reroute, 1)
  car.still = 40
  assert.equal(tr.unstuck(car, 30, true), false, 'not in sight of the player')
  assert.equal(tr.unstuck(car, 90, false), true, 'out of sight: off the road')
})

test('density by the hour (rush vs night) and parked cars along the kerbs and in the lots', () => {
  assert.ok(busy(3) < busy(8) * 0.7, 'the small hours are quiet')
  const tr = new Traffic({ count: 90, radius: 270, seed: 7 })
  tr.reset(0, 0)
  assert.ok(tr.cars.filter(c => c.parked).length > 20, 'parked cars')
  const styles = new Set(tr.cars.filter(c => !c.parked).map(c => c.style))
  assert.equal(styles.size, 3, 'cautious, normal and aggressive drivers')
})

test('a car stopped in a freeway lane: the traffic behind pulls out round it, nobody left queueing', () => {
  const { HW } = HWMOD
  const thru = HW.find(e => RANK.get(e.id) === 1 && e.dx > 0)
  const s0 = thru.len * 0.55
  const x = thru.x0 + thru.dx * s0,
    z = thru.z0 + thru.dz * s0
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  sim.floor = sim.pos.y = 6.5 // (up on the deck, stopped in the through lane)
  sim.syncPose()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(x, z)
  const c = makeControls()
  c.fan = false
  c.brake = 1
  const by = new Set()
  for (let i = 0; i < 90 / H; i++) {
    sim.step(H, c)
    tr.step(H, sim)
    sim.events.length = 0
    for (const o of tr.cars)
      if (!o.parked && o.edge?.hw && Math.abs(o.z - z) < 12 && o.x > x + 8 && o.x < x + 20 && o.hx > 0.9) by.add(o.id)
  }
  assert.ok(Math.hypot(sim.pos.x - x, sim.pos.z - z) < 1, 'the Roadster stayed put')
  assert.ok(by.size >= 6, `${by.size} cars got by it`)
  const queue = tr.cars.filter(o => !o.parked && o.edge === thru && o.s < s0 && o.still > 15)
  assert.equal(queue.length, 0, 'nobody left queueing behind it')
})

test('freeway lane changes at a coarse step, several seeds: never two cars in one place', async () => {
  const { FWY } = await import('../js/sim/world.js')
  for (const seed of [2, 5, 8]) {
    const tr = new Traffic({ seed })
    tr.reset(0, FWY.z)
    const sim = new Sim()
    sim.reset('city', { x: 0, z: FWY.z + 200, yaw: 0 })
    const view = { x: 0, z: FWY.z, fx: 1, fz: 0 }
    for (let i = 0; i < 30 * 150; i++) {
      tr.step(1 / 30, sim, view)
      if (i % 10) continue
      const deck = tr.cars.filter(c => c.edge?.hw && c.edge.vk >= 1)
      for (let a = 0; a < deck.length; a++)
        for (let b = a + 1; b < deck.length; b++)
          assert.ok(Math.hypot(deck[a].x - deck[b].x, deck[a].z - deck[b].z) > 2.5, `seed ${seed}: two cars in one place at ${deck[a].x.toFixed(0)}, ${deck[a].z.toFixed(1)}`)
    }
    assert.ok(tr.fwyChanges > 40, `seed ${seed}: ${tr.fwyChanges} lane changes`)
  }
})
