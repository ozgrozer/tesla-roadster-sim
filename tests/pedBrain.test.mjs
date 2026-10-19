// The people's state machine and what they think (pedBrain.js): walking the pavements' graph and
// crossing on it, hit by a car too fast to dodge ('ped-hit', 'crime'), getting up and running,
// threats raised at a place, never in a building, never left in the road, not clumping, a jacked
// driver running off, and the player on foot no car to dive from. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { STATES, HIT_V } from '../js/sim/pedBrain.js'
import { footProxy } from '../js/sim/vehicleLink.js'
import { onGame, drainGame, resetGame } from '../js/sim/gameEvents.js'
import { kerbDist } from '../js/sim/street.js'
import { makeControls } from '../js/sim/constants.js'
import { LANE_OFF, COLLIDERS } from '../js/sim/city.js'

const H = 1 / 120
function world (seed = 2) {
  const sim = new Sim()
  sim.reset('city', { x: 100, z: LANE_OFF[1], yaw: 0 })
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed })
  peds.reset(sim.pos.x, sim.pos.z)
  const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
  const c = makeControls()
  c.brake = 1
  return { sim, tr, peds, view, c }
}
const inside = (x, z) =>
  COLLIDERS.some(b => b.kind === 'building' && !b.r && b.y0 < 1 && x > b.x0 + 0.3 && x < b.x1 - 0.3 && z > b.z0 + 0.3 && z < b.z1 - 0.3)

test('the states: everyone walks the pavements graph, waits at the kerb, crosses, stands about; never in a building nor left in the road', () => {
  const { sim, tr, peds, view, c } = world()
  const seen = new Set()
  let inB = 0,
    road = 0
  for (let i = 0; i < 60 / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    for (const p of peds.list) {
      seen.add(p.state)
      assert.ok(STATES.includes(p.state), p.state)
      if (i % 12) continue
      if (inside(p.x, p.z)) inB++ // (a shopfront flush with the pavement's inner edge: 0.3 m)
      if (p.roadT > 5) road++
    }
  }
  for (const s of ['walk', 'kerb', 'wait', 'cross', 'idle']) assert.ok(seen.has(s), `someone was in '${s}'`)
  assert.equal(inB, 0, 'nobody inside a building')
  assert.equal(road, 0, 'nobody stands about in the road')
})

test('nobody clumps: people on the pavement keep apart unless they walk or stand together', () => {
  const { sim, tr, peds, view, c } = world(5)
  let close = 0,
    pairs = 0
  for (let i = 0; i < 30 / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    if (i % 60) continue
    const L = peds.list.filter(p => p.lod === 1 && (p.state === 'walk' || p.state === 'wait'))
    for (let a = 0; a < L.length; a++)
      for (let b = a + 1; b < L.length; b++) {
        const p = L[a],
          o = L[b]
        if (p.lead === o || o.lead === p || p.mate || o.mate) continue
        pairs++
        if (Math.hypot(p.x - o.x, p.z - o.z) < 0.3) close++
      }
  }
  assert.ok(pairs > 1000)
  assert.ok(close / pairs < 0.002, `${close} of ${pairs} pairs on top of each other`)
})

test('a car too fast to dodge knocks someone down: ped-hit and a crime; they lie there, then get up and run', () => {
  resetGame()
  const { sim, tr, peds } = world()
  const got = []
  const off = onGame('crime', e => got.push(e))
  const p = peds.list.find(q => q.state === 'walk')
  const th = peds.me
  Object.assign(th, { x: p.x, z: p.z, vx: 14, vz: 0, hx: 1, hz: 0 })
  peds.dodge(p, th)
  off()
  assert.equal(p.state, 'down')
  const ev = drainGame()
  const hit = ev.find(e => e.type === 'ped-hit')
  assert.ok(hit && hit.by === 'player' && hit.speed > HIT_V && hit.severity >= 2)
  assert.ok(got.length === 1 && got[0].type === 'ped-hit' && got[0].pos)
  // slower than HIT_V, a car only nudges them out of the way
  const q = peds.list.find(o => o.state === 'walk' && o !== p)
  Object.assign(th, { x: q.x, z: q.z, vx: 1, vz: 0 })
  peds.dodge(q, th)
  assert.notEqual(q.state, 'down')
  // down a few seconds, then back to the pavement and off at a run
  const far = footProxy({ x: sim.pos.x, z: sim.pos.z + 30 })
  const states = new Set()
  for (let i = 0; i < 20 / H; i++) {
    peds.step(H, far, tr)
    states.add(p.state)
  }
  assert.ok(states.has('back') && (states.has('flee') || p.state === 'walk'), [...states].join())
  assert.ok(kerbDist(p.x, p.z) < 0, 'up on the pavement')
})

test('a threat raised at a place: people run from a level 2, keep their distance from a level 1', () => {
  const { sim, tr, peds, view } = world()
  const p = peds.list.find(q => q.state === 'walk' && q.lod === 1)
  peds.threat(p.x + 3, p.z, 12, 2, 1)
  const foot = footProxy(sim.pos)
  peds.step(H, foot, tr, view)
  assert.equal(p.state, 'flee')
  const { peds: P2, tr: T2, view: v2 } = world(9)
  const q = P2.list.find(o => o.state === 'idle' || o.state === 'wait') || P2.list[0]
  q.state = 'idle'
  q.idleT = 30
  const x = q.x,
    z = q.z
  P2.threat(x + 0.5, z, 10, 1, 1)
  for (let i = 0; i < 10; i++) P2.step(H, foot, T2, v2)
  assert.ok(Math.hypot(q.x - x - 0.5, q.z - z) >= 2.4, 'stepped back from it')
})

test('a jacked driver climbs out and, once on the pavement, runs off', () => {
  const { sim, tr, peds, view } = world()
  const car = tr.cars.find(c => !c.parked && !c.loose)
  tr.takeOver(car)
  tr.ejectDriver(car)
  const n = peds.list.length
  const foot = footProxy({ x: car.x, z: car.z + 40 })
  peds.step(H, foot, tr, view)
  const d = peds.list[peds.list.length - 1]
  assert.ok(peds.list.length >= n + 1 && d.jacked)
  let fled = false
  for (let i = 0; i < 15 / H && !fled; i++) {
    peds.step(H, foot, tr, view)
    fled = d.state === 'flee'
  }
  assert.ok(fled, `ran off (${d.state})`)
})

test('the player on foot: nobody dives from them, and anyone they walk into steps aside', () => {
  const { tr, peds, view } = world()
  const p = peds.list.find(q => q.state === 'walk' && q.lod === 1)
  const foot = footProxy({ x: p.x, z: p.z })
  peds.step(H, foot, tr, view)
  assert.equal(peds.threats.length, 0)
  assert.notEqual(p.state, 'dodge')
})
