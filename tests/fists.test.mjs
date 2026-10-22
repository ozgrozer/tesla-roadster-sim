// The player's fists and the car as a weapon (melee.js, brawl.js, pedBrain.js): a combo of three
// lands on someone in front, soft-locked; the first blow is an assault the public rings in (one
// star); beaten down and on, they die (a killing: more heat); run over above KILL_V they die,
// thrown; below MAYBE_V they live; the dead lie there, then are cleared once the player is far
// off. And the paces on foot. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Melee, COMBO, MELEE } from '../js/sim/melee.js'
import { KILL_V, MAYBE_V } from '../js/sim/pedBrain.js'
import { BRAWL } from '../js/sim/brawl.js'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { Wanted, CRIMES, STAR_HEAT } from '../js/sim/wanted.js'
import { Reports } from '../js/sim/wantedReports.js'
import { witnesses } from '../js/sim/witness.js'
import { onGame, drainGame, resetGame } from '../js/sim/gameEvents.js'
import { makeControls } from '../js/sim/constants.js'
import { footProxy } from '../js/sim/vehicleLink.js'
import { ROADS, WILSHIRE, ROAD_HW } from '../js/sim/city.js'
import { ENV } from '../js/sim/env.js'
import { TYPES } from '../js/sim/carTypes.js'
import { DOORS, DOOR_SIDE, layoutFor } from '../js/sim/vehicles.js'

const H = 1 / 120
const player = (x = 0, z = 0, heading = 0) => ({ pos: { x, z }, heading, grounded: true, down: 0 })

test('a combo of three: jab, cross, hook, each landing at its hit time; soft-aim turns to the target', () => {
  const m = new Melee()
  const p = player(0, 0, 0.6) // (facing off to one side: soft-aim turns them)
  const q = { x: 1.1, z: 0, state: 'walk' }
  const landed = []
  for (let n = 0; n < 3; n++) {
    m.press()
    for (let t = 0; t < 0.8 && (n === 0 || landed.length <= n); t += H) {
      const o = m.step(H, p, [q])
      for (const h of o.hits) landed.push(h.move.name)
      if (!m.busy && landed.length > n) break
    }
  }
  assert.deepEqual(landed, COMBO.map(c => c.name))
  assert.ok(Math.abs(p.heading) < 0.05, `turned to face them: ${p.heading}`)
  assert.ok(COMBO[2].knock && COMBO[2].dmg > COMBO[0].dmg, 'the hook hits hardest, and knocks down')
  // nobody there: a whiff, and the combo starts over
  const w = new Melee()
  w.press()
  let hits = 0
  for (let t = 0; t < 0.6; t += H) hits += w.step(H, player(), []).hits.length
  assert.equal(hits, 0)
  assert.equal(w.next, 0)
  // someone off at 3 m in front: lunged at, and hit
  const l = new Melee(),
    lp = player()
  const far = { x: 2.6, z: 0, state: 'walk' }
  l.press()
  let lunge = 0
  hits = 0
  for (let t = 0; t < 0.5; t += H) {
    const o = l.step(H, lp, [far])
    if (o.ctl) {
      lunge = Math.max(lunge, o.ctl.pace)
      lp.pos.x += o.ctl.x * o.ctl.pace * H
    }
    hits += o.hits.length
  }
  assert.ok(lunge > 0 && lunge <= MELEE.lunge, `lunged at ${lunge}`)
  assert.equal(hits, 1)
})

function street (seed = 6) {
  ENV.hour = 13
  const x = ROADS[6] + 14,
    z = ROADS[WILSHIRE] + ROAD_HW + 2.2
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(x, z)
  const peds = new Peds({ seed })
  peds.reset(x, z)
  for (let i = 0; i < 60; i++) {
    sim.step(H, makeControls())
    peds.step(H, sim, tr, null)
    tr.step(H, sim)
    sim.events.length = 0
  }
  return { sim, tr, peds, x, z }
}
// the crimes told to the game, each seen and rung in, until reported (or 30 s)
function report (peds, tr, crimes, W, step) {
  const R = new Reports()
  for (const c of crimes) R.add(c, witnesses(c.pos, { peds: peds.list, cars: tr.cars, police: [] }), peds.witnessCrime(c), W)
  for (let t = 0; t < 30 && R.pending.length; t += H) {
    step()
    R.step(H, W)
  }
}

test('punching someone: an assault (one star once rung in); beaten to death: a killing, more stars', () => {
  resetGame()
  const { sim, tr, peds } = street()
  const crimes = []
  const off = onGame('crime', c => crimes.push(c))
  const p = peds.list.filter(q => q.state === 'walk' || q.state === 'idle').sort((a, b) => Math.hypot(a.x - sim.pos.x, a.z - sim.pos.z) - Math.hypot(b.x - sim.pos.x, b.z - sim.pos.z))[0]
  assert.ok(p, 'someone about')
  const blow = (move, dx = 1, dz = 0) => peds.punched(p, { move, dx, dz })
  assert.equal(blow(COMBO[0]), 'stagger')
  assert.equal(p.state, 'brawl')
  assert.ok(peds.healthOf(p) < 1)
  assert.equal(blow(COMBO[1]), 'stagger')
  assert.equal(crimes.filter(c => c.type === 'assault').length, 1, 'one assault for a flurry')
  assert.equal(crimes[0].severity, 1)
  // the assault rung in by someone who saw it: one star (public: 1.2 heat)
  const W = new Wanted()
  const step = () => {
    sim.step(H, makeControls())
    peds.step(H, footProxy({ x: sim.pos.x + 25, z: sim.pos.z }), tr)
    tr.step(H, sim)
  }
  report(peds, tr, crimes.splice(0), W, step)
  assert.equal(W.stars, 1, `one star for an assault (heat ${W.heat})`)
  // then the hook (down), and a stamp on them down there: dead
  const q = peds.list.find(o => (o.state === 'walk' || o.state === 'idle') && o !== p)
  const r1 = peds.punched(q, { move: COMBO[2], dx: 1, dz: 0 })
  assert.equal(r1, 'down')
  let r = null
  for (let i = 0; i < 6 && r !== 'dead'; i++) r = peds.punched(q, { move: COMBO[2], dx: 1, dz: 0 })
  assert.equal(r, 'dead')
  assert.ok(q.dead && q.state === 'down')
  const ev = drainGame()
  assert.ok(ev.some(e => e.type === 'ped-hit' && e.dead && e.how === 'beaten'))
  assert.ok(crimes.some(c => c.type === 'ped-killed'))
  off()
  // a killing is worth more than an assault: the police seeing it, 3+ stars
  const V = new Wanted()
  V.report(crimes.find(c => c.type === 'ped-killed'), { peds: 1, cars: 0, police: 1 })
  assert.ok(V.stars >= 3, `${V.stars} stars for a killing the police saw`)
  assert.ok(CRIMES['ped-killed'] * 1.5 > CRIMES.assault)
  assert.ok(STAR_HEAT[1] <= CRIMES.assault && STAR_HEAT[2] > CRIMES.assault, 'an assault alone: one star')
})

test('run over: above KILL_V dead and thrown; below MAYBE_V knocked down alive; the body lies, then is cleared far off', () => {
  resetGame()
  const { sim, tr, peds } = street(8)
  const crimes = []
  const off = onGame('crime', c => crimes.push(c))
  const th = peds.me
  const walkers = peds.list.filter(q => q.state === 'walk' || q.state === 'idle')
  const a = walkers[0],
    b = walkers[1]
  Object.assign(th, { x: a.x, z: a.z, vx: KILL_V + 3, vz: 0, hx: 1, hz: 0 })
  peds.dodge(a, th)
  assert.equal(a.state, 'down')
  assert.equal(a.dead, true)
  assert.ok(a.airV > 4, 'thrown up over the bonnet')
  Object.assign(th, { x: b.x, z: b.z, vx: MAYBE_V - 1, vz: 0 })
  peds.dodge(b, th)
  assert.equal(b.state, 'down')
  assert.equal(b.dead, false)
  // flown up over the bonnet, tumbling, and landed
  let maxAir = 0
  const by = footProxy({ x: a.x + 6, z: a.z })
  for (let t = 0; t < 3; t += H) {
    peds.step(H, by, tr)
    maxAir = Math.max(maxAir, a.air || 0)
  }
  assert.ok(maxAir > 0.8, `thrown ${maxAir.toFixed(2)} m up`)
  assert.ok(a.air < 0.05 && a.spin > 0, 'landed, having turned over')
  const ev = drainGame()
  const hits = ev.filter(e => e.type === 'ped-hit')
  assert.ok(hits[0].dead && hits[0].how === 'car' && hits[0].severity === 3)
  assert.deepEqual(crimes.map(c => c.type), ['ped-killed', 'ped-hit'])
  off()
  // seen by people and rung in: stars, more for the killing than for the knock-down
  const W = new Wanted()
  const step = () => {
    sim.step(H, makeControls())
    peds.step(H, footProxy({ x: sim.pos.x + 25, z: sim.pos.z }), tr)
    tr.step(H, sim)
  }
  report(peds, tr, crimes.slice(0, 1), W, step)
  assert.ok(W.stars >= 2, `the killing rung in: ${W.stars} stars`)
  // the body lying there (never getting up)
  const near = footProxy({ x: a.x + 5, z: a.z })
  for (let t = 0; t < 12; t += H) peds.step(H, near, tr)
  assert.ok(peds.list.includes(a) && a.dead && a.state === 'down', 'still lying there')
  // the player close by: it stays; gone far off past BRAWL.bodyT, it is cleared
  for (let t = 0; t < BRAWL.bodyT; t += H) peds.step(H, near, tr)
  assert.ok(peds.list.includes(a), 'not cleared under the player’s nose')
  const far = footProxy({ x: a.x + BRAWL.bodyFar + 10, z: a.z })
  for (let t = 0; t < 3; t += H) peds.step(H, far, tr)
  assert.ok(!peds.list.includes(a) && a.gone, 'cleared once out of the way')
})

test('every kind of car has its driver door: on the body, ahead of the stand point, the seat in reach', () => {
  for (const T of TYPES) {
    assert.ok(DOORS[T.name], `${T.name} has a door`)
    const l = layoutFor(T.name, T.len, T.wid, T.hgt)
    const [x0, x1] = l.doorSpan
    assert.ok(x0 > -T.len / 2 && x1 < T.len / 2 && x1 - x0 > 0.6, `${T.name}: door [${x0}, ${x1}] on a ${T.len} m body`)
    assert.equal(l.doorSide, DOOR_SIDE[T.name] || -1)
    assert.ok(l.door.x < x0 && l.door.z * l.doorSide > T.wid / 2, `${T.name}: stood behind the door's back edge, outside`)
    assert.ok(Math.abs(l.seat.x - (x0 + x1) / 2) < 2.2, `${T.name}: the seat by the door`)
  }
})
