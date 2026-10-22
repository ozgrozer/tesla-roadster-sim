// Round 2, S2: who the people on foot are (living/pedProfile.js), what they do on seeing a crime
// and ringing the police (living/pedLife.js), gathering round a street performer (pedPoi.js), and
// anyone stuck put back on their way.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { makeControls } from '../js/sim/constants.js'
import { kerbDist } from '../js/sim/street.js'
import { ROADS, WILSHIRE, ROAD_HW, BLOCKS } from '../js/sim/city.js'
import { onGame } from '../js/sim/gameEvents.js'
import { PROF, PROFILES, TRAITS, pick, mixAt } from '../js/sim/living/pedProfile.js'
import { layPois, SLOTS, free } from '../js/sim/living/pedPoi.js'
import { ENV } from '../js/sim/env.js'

const H = 1 / 60
const W = ROADS[WILSHIRE]
function world (x, z, seed = 6) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(x, z)
  const peds = new Peds({ seed })
  peds.reset(x, z)
  return { sim, tr, peds }
}
function run ({ sim, tr, peds }, sec, view = null, each) {
  for (let i = 0; i < sec / H; i++) {
    sim.step(H, makeControls())
    peds.step(H, sim, tr, view)
    tr.step(H, sim)
    sim.events.length = 0
    if (each && each(i * H)) return true
  }
  return false
}
const share = (kind, h, k) => {
  const c = new Array(PROFILES.length).fill(0)
  for (let i = 0; i < 4000; i++) c[pick(kind, h, (i * 0.6180339887) % 1)]++
  return c[k] / 4000
}

test('profiles: the mix follows the neighbourhood and the hour, and each walks at its own pace', () => {
  assert.equal(PROFILES.length, 6)
  assert.ok(share('downtown', 8, PROF.commuter) > 0.45, 'downtown at the rush: commuters')
  assert.ok(share('industrial', 11, PROF.worker) > 0.45, 'the docks and warehouses: workers')
  assert.ok(share('beach', 14, PROF.tourist) > 0.3, 'the beach: tourists')
  assert.ok(share('suburb', 3, PROF.loiterer) > share('suburb', 14, PROF.loiterer) * 1.5, 'more loiterers at night')
  assert.ok(share('beach', 2, PROF.tourist) < share('beach', 14, PROF.tourist), 'fewer tourists at night')
  assert.ok(mixAt('nowhere', 12).length === 6)
  ENV.hour = 13
  const { peds } = world(ROADS[6] + 14, W + ROAD_HW + 2.2)
  const seen = new Set()
  for (const p of peds.list) {
    assert.ok(p.liv, 'everyone has a profile')
    seen.add(p.liv.prof)
    const T = TRAITS[p.liv.prof]
    if (p.lead || p.mate) continue // (a pair keeps one pace)
    assert.ok(p.v0 >= T.pace[0] - 0.01 && p.v0 <= T.pace[1] + 0.01, `${PROFILES[p.liv.prof]} at ${p.v0}`)
    assert.equal(p.jog, p.liv.prof === PROF.jogger)
  }
  assert.ok(seen.size >= 4, `${seen.size} kinds of people about`)
})

test('a crime seen: people run, freeze or watch, one rings the police (and down or scared off, no call)', () => {
  ENV.hour = 13
  const g = world(ROADS[6] + 14, W + ROAD_HW + 2.2)
  run(g, 2)
  const seen = [],
    called = []
  const offs = [onGame('crime-witnessed', e => seen.push(e)), onGame('crime-called', e => called.push(e))]
  const pos = { x: g.sim.pos.x, z: g.sim.pos.z }
  const call = g.peds.witnessCrime({ type: 'carjack', pos, severity: 2 })
  assert.equal(seen.length, 1)
  assert.ok(seen[0].peds >= 3, `${seen[0].peds} saw it`)
  const reacting = g.peds.list.filter(p => p.state === 'flee' || p.liv.cowerT > 0 || p.state === 'idle').length
  assert.ok(reacting >= 3, `${reacting} ran, froze or stood watching`)
  assert.ok(call, 'someone rings it in')
  // (the player off out of the way: the caller gets on the phone, and through)
  g.sim.reset('city', { x: pos.x + 120, z: pos.z + 0.01, yaw: 0 })
  const done = run(g, 25, null, () => call.state !== 'pending' && call.state !== 'calling')
  assert.ok(done && call.state === 'done', `the call ${call.state}`)
  assert.equal(called.length, 1)
  assert.equal(called[0].type, 'carjack')
  // a second: the player goes right up to the caller, who runs and never gets through
  g.sim.reset('city', { x: pos.x, z: pos.z, yaw: 0 })
  run(g, 1)
  const c2 = g.peds.witnessCrime({ type: 'assault', pos: { x: g.sim.pos.x, z: g.sim.pos.z }, severity: 1.5 })
  assert.ok(c2)
  const who = g.peds.list.find(p => p.i === c2.who)
  g.sim.reset('city', { x: who.x + 60, z: who.z, yaw: 0 })
  run(g, 14, null, () => c2.state === 'calling')
  assert.equal(c2.state, 'calling')
  g.sim.reset('city', { x: who.x + 1.5, z: who.z, yaw: 0 })
  run(g, 1)
  assert.equal(c2.state, 'failed')
  assert.equal(who.state, 'flee', 'the caller runs from the player')
  for (const f of offs) f()
})

test('street performers draw a few watchers a while, never a lasting crowd', () => {
  const pois = layPois()
  assert.ok(pois.length >= 8, `${pois.length} places`)
  for (const q of pois) {
    assert.ok(free(q.x, q.z))
    assert.ok(q.slots.length >= 3 && q.slots.length <= SLOTS)
    for (const sl of q.slots) assert.ok(kerbDist(sl.x, sl.z) < -0.4, 'watchers stand on the pavement')
  }
  ENV.hour = 14
  // (the busiest: a boulevard or downtown place)
  const poi = pois.find(q => q.b.area === 'downtown' || q.b.area === 'boulevard') || pois[0]
  const g = world(poi.x + 45, poi.z + 0.5, 9)
  let most = 0,
    over = false,
    performed = false
  run(g, 240, null, () => {
    const n = poi.slots.filter(sl => sl.who).length
    most = Math.max(most, n)
    if (poi.perf) performed = true
    if (!poi.open) over = true
    assert.ok(n <= SLOTS)
    return false
  })
  assert.ok(performed, 'a performer turned up')
  assert.ok(most >= 2, `${most} watched at once`)
  assert.ok(over || poi.shows > 0, 'and the show ended')
  assert.ok(g.peds.gathered >= 3, `${g.peds.gathered} stopped to watch`)
})

test('stuck: someone getting nowhere is put back on their way, and out of sight taken off', () => {
  const g = world(ROADS[6] + 14, W + ROAD_HW + 2.2)
  run(g, 1)
  const me = g.sim.pos
  const p = g.peds.list.find(o => o.state === 'walk' && !o.lead && !o.mate && !o.dog && Math.hypot(o.x - me.x, o.z - me.z) > 15 && o.lod === 1)
  // (frozen to the spot where they walk)
  p.v = 0
  p.v0 = 0
  const before = g.peds.unstuckN || 0
  run(g, 8, null, () => false)
  assert.ok((g.peds.unstuckN || 0) > before, 'noticed')
  run(g, 20)
  assert.ok(p.gone && !g.peds.list.includes(p), 'and taken off, out of sight')
})

test('far off, people move less often (the cheaper level of detail)', () => {
  const g = world(ROADS[6] + 14, W + ROAD_HW + 2.2)
  run(g, 2)
  const lods = new Set(g.peds.list.map(p => p.lod))
  assert.ok(lods.has(1) && (lods.has(2) || lods.has(4)))
  assert.ok(BLOCKS.length > 0)
})
