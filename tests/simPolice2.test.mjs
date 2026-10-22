// Round 2, S3: the police. Crimes reported as the witnesses ring them in (wantedReports.js), the
// people's calls (living/pedLife.js) holding the report; the stars decaying one at a time while
// evading, the search told to the maps ('police-search'); the description lost on changing cars
// unseen; the escalation (units, roadblocks at three, ramming at four); and nothing put down in the
// camera's view, units on the lane graph with their own physics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { Sim } from '../js/sim/sim.js'
import { LANES, SPAWN, ROADS, WILSHIRE, ROAD_HW, rng } from '../js/sim/city.js'
import { makeControls } from '../js/sim/constants.js'
import { Wanted, cooldownFor, searchRadius, LOST_SIGHT, GRACE } from '../js/sim/wanted.js'
import { Reports, DRIVER_CALL } from '../js/sim/wantedReports.js'
import { Police, UNITS, ROADBLOCK_STARS, inView } from '../js/sim/police.js'
import { roadblockSpot } from '../js/sim/policeAir.js'
import { roleFor } from '../js/sim/policeUnit.js'
import { witnesses } from '../js/sim/witness.js'
import { onGame } from '../js/sim/gameEvents.js'
import { ENV } from '../js/sim/env.js'

const H = 1 / 60
const crime = (x = 0, z = 0) => ({ type: 'carjack', pos: { x, z }, severity: 2 })

test('reports: the police at once; a call when it is made; a driver later; a stopped caller, none', () => {
  const W = new Wanted(),
    R = new Reports()
  assert.equal(R.add(crime(), { peds: 0, cars: 0, police: 1 }, null, W), 'now')
  assert.ok(W.stars > 0, 'seen by the police: stars at once')
  // a person's call: nothing till it goes through
  const W2 = new Wanted(),
    call = { state: 'calling' }
  assert.equal(R.add(crime(), { peds: 2, cars: 0, police: 0 }, call, W2), 'later')
  for (let t = 0; t < 5; t += 0.1) R.step(0.1, W2)
  assert.equal(W2.stars, 0, 'not yet: still on the phone')
  call.state = 'done'
  R.step(0.1, W2)
  assert.ok(W2.stars > 0, 'the call went through')
  // the caller stopped and nobody else: never reported
  const W3 = new Wanted(),
    c3 = { state: 'calling' }
  R.add(crime(), { peds: 1, cars: 0, police: 0 }, c3, W3)
  c3.state = 'failed'
  for (let t = 0; t < 30; t += 0.1) R.step(0.1, W3)
  assert.equal(W3.stars, 0)
  assert.equal(R.pending.length, 0)
  // ... but a driver who saw it too rings it in a little later
  const W4 = new Wanted(),
    c4 = { state: 'calling' }
  R.add(crime(), { peds: 1, cars: 1, police: 0 }, c4, W4)
  c4.state = 'failed'
  let t = 0
  while (!W4.stars && t < 30) {
    R.step(0.1, W4)
    t += 0.1
  }
  assert.ok(W4.stars > 0 && t >= DRIVER_CALL - 0.2, `a driver's call after ${t.toFixed(1)} s`)
  // nobody at all: nothing
  assert.equal(R.add(crime(), { peds: 0, cars: 0, police: 0 }, null, new Wanted()), null)
})

test('a crime on a busy pavement: no stars until someone has rung it in', () => {
  ENV.hour = 13
  const x = ROADS[6] + 14,
    z = ROADS[WILSHIRE] + ROAD_HW + 2.2
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(x, z)
  const peds = new Peds({ seed: 6 })
  peds.reset(x, z)
  const step = () => {
    sim.step(H, makeControls())
    peds.step(H, sim, tr, null)
    tr.step(H, sim)
    sim.events.length = 0
  }
  for (let i = 0; i < 60; i++) step()
  const W = new Wanted(),
    R = new Reports()
  const reported = []
  const off = onGame('crime-reported', e => reported.push(e))
  const c = crime(sim.pos.x, sim.pos.z)
  const w = witnesses(c.pos, { peds: peds.list, cars: tr.cars, police: [] })
  assert.ok(w.peds > 0, 'people saw it')
  const how = R.add(c, w, peds.witnessCrime(c), W)
  assert.equal(how, 'later')
  assert.equal(W.stars, 0, 'nobody has rung yet')
  // (the player off out of the way)
  sim.reset('city', { x: x + 150, z: z + 0.01, yaw: 0 })
  let t = 0
  while (!W.stars && t < 25) {
    step()
    R.step(H, W)
    t += H
  }
  off()
  assert.ok(W.stars > 0, 'reported in the end')
  assert.ok(t > 2, `after ${t.toFixed(1)} s on the phone`)
  assert.equal(reported[0].by, 'ped')
})

test('evading: the stars go one at a time, the search circle told to the maps as it shrinks, then its end', () => {
  const heard = []
  const off = onGame('police-search', e => heard.push(e))
  const W = new Wanted()
  W.set(3, { x: 0, z: 0 })
  W.update(0.1, { x: 0, z: 0 }, true)
  const far = { x: 900, z: 0 }
  const seenStars = []
  for (let t = 0; t < 120 && W.stars; t += 0.1) {
    W.update(0.1, far, false)
    if (seenStars[seenStars.length - 1] !== W.stars) seenStars.push(W.stars)
  }
  W.update(0.1, far, false)
  off()
  assert.deepEqual(seenStars, [3, 2, 1, 0], 'one star at a time')
  const radii = heard.map(e => e.radius)
  assert.equal(radii[0], searchRadius(3), 'the search starts at three stars’ circle')
  assert.ok(radii.includes(searchRadius(2)) && radii.includes(searchRadius(1)), 'and shrinks')
  assert.equal(radii[radii.length - 1], 0, 'then ends')
  assert.deepEqual(heard[0].pos, { x: 0, z: 0 })
})

test('changing cars unseen: the description is lost (shorter sight, quicker cooldown); seen, it is not', () => {
  const W = new Wanted()
  W.set(2, { x: 0, z: 0 })
  W.update(0.1, { x: 0, z: 0 }, true)
  assert.equal(W.changeVehicle(false), false, 'still in their sight a moment ago: they saw the swap')
  for (let t = 0; t < GRACE + 0.5; t += 0.1) W.update(0.1, { x: 500, z: 0 }, false)
  assert.equal(W.changeVehicle(true), false, 'a unit watching: they saw')
  assert.equal(W.changeVehicle(false), true)
  assert.equal(W.sight, LOST_SIGHT)
  // the cooldown goes quicker without a description
  const A = new Wanted(),
    B = new Wanted()
  for (const w of [A, B]) {
    w.set(1, { x: 0, z: 0 })
    w.update(0.1, { x: 0, z: 0 }, true)
  }
  for (let t = 0; t < GRACE + 0.2; t += 0.1) for (const w of [A, B]) w.update(0.1, { x: 500, z: 0 }, false)
  B.changeVehicle(false)
  let ta = 0,
    tb = 0
  while (A.stars && ta < 60) (A.update(0.1, { x: 500, z: 0 }, false), (ta += 0.1))
  while (B.stars && tb < 60) (B.update(0.1, { x: 500, z: 0 }, false), (tb += 0.1))
  assert.ok(tb < ta * 0.8, `lost description cleared in ${tb.toFixed(1)} s, not ${ta.toFixed(1)}`)
  // spotted again: they know them
  W.update(0.1, { x: 0, z: 0 }, true)
  assert.equal(W.sight, 1)
})

test('police sight: a unit that sees the player at 54 m does not once the description is lost', () => {
  const tr = new Traffic({ count: 0 })
  tr.reset(SPAWN.x, SPAWN.z)
  const pol = new Police(tr)
  const W = new Wanted()
  W.set(2, { x: SPAWN.x, z: SPAWN.z })
  // a unit 70 m down the street from the player, parked
  const e = LANES.find(l => !l.closed && l.road && l.len > 70 && Math.abs(l.dz) < 0.01 && Math.hypot(l.x0 - SPAWN.x, l.z0 - SPAWN.z) < 300)
  const P = { pos: { x: e.x0 + e.dx * 62, y: 0, z: e.z0 + e.dz * 62 }, vel: { x: 0, z: 0 }, heading: 0, speed: 0, driving: true, mode: 'car' }
  const u = pol.add({ x: e.x0 + e.dx * 8, z: e.z0 + e.dz * 8, yaw: Math.atan2(-e.dz, e.dx), v: 0 })
  u.seeT = 0
  pol.step(H, { wanted: W, player: P, view: null })
  assert.equal(u.sees, true, 'in sight, described')
  W.described = false
  u.seeT = 0
  pol.step(H, { wanted: W, player: P, view: null })
  assert.ok(54 > 99 * LOST_SIGHT)
  assert.equal(u.sees, false, 'not known for who they are at 54 m')
})

test('escalation: more units with the stars, roadblocks from three, ramming only from four', () => {
  for (let s = 1; s < 5; s++) assert.ok(UNITS[s + 1] > UNITS[s])
  assert.equal(ROADBLOCK_STARS, 3)
  for (let k = 0; k < 4; k++) {
    assert.notEqual(roleFor(3, k), 'ram')
    assert.notEqual(roleFor(2, k), 'ram')
  }
  assert.ok([0, 1, 2, 3].some(k => roleFor(4, k) === 'ram'))
  assert.ok([0, 1, 2, 3].some(k => roleFor(5, k) === 'ram'))
})

test('roadblocks are never put down in the camera’s view', () => {
  const R = rng(9)
  let n = 0
  for (const e of LANES.filter(l => l.road && !l.closed && l.len > 50).filter((l, i) => i % 7 === 0).slice(0, 40)) {
    const x = e.x0 + e.dx * 20,
      z = e.z0 + e.dz * 20
    const player = { pos: { x, z }, vel: { x: e.dx * 25, z: e.dz * 25 }, speed: 25 }
    // (the chase camera behind them, looking the way they go)
    const view = { x: x - e.dx * 8, z: z - e.dz * 8, fx: e.dx, fz: e.dz }
    const spot = roadblockSpot(player, view, R)
    if (!spot) continue
    n++
    const sx = spot.e.x0 + spot.e.dx * spot.s,
      sz = spot.e.z0 + spot.e.dz * spot.s
    assert.equal(inView(view, sx, sz), false, `a roadblock in view at ${sx.toFixed(0)}, ${sz.toFixed(0)}`)
  }
  assert.ok(n >= 10, `${n} roadblocks placed`)
})

test('units: on the lane graph, out of view, driven by their own physics', () => {
  const tr = new Traffic({ count: 20 })
  tr.reset(SPAWN.x, SPAWN.z)
  const pol = new Police(tr)
  const W = new Wanted()
  W.set(4, { x: SPAWN.x, z: SPAWN.z })
  const P = { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, vel: { x: 0, z: 0 }, heading: 0, speed: 0, driving: true, mode: 'car' }
  const view = { x: SPAWN.x - 8, z: SPAWN.z, fx: 1, fz: 0 }
  const born = new Map()
  let moved = 0
  for (let t = 0; t < 20; t += H) {
    tr.t += H
    pol.step(H, { wanted: W, player: P, view })
    W.update(H, P.pos, pol.seen)
    for (const u of pol.units) {
      if (!born.has(u)) {
        born.set(u, { x: u.body.x, z: u.body.z })
        if (u.role === 'pursuit') assert.equal(inView(view, u.body.x, u.body.z), false, 'appeared in view')
      }
    }
  }
  for (const [u, at] of born) if (Math.hypot(u.body.x - at.x, u.body.z - at.z) > 20) moved++
  assert.ok(born.size >= UNITS[4], `${born.size} units`)
  assert.ok(moved >= 3, `${moved} drove`)
  for (const u of pol.units) assert.ok(Number.isFinite(u.body.u) && 'w' in u.body, 'a vehicle body')
})
