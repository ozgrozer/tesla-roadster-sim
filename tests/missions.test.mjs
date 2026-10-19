// Headless checks of the missions' state machine (missions/manager.js, objectives.js, spots.js):
// every mission's marker is on a street; driving into one starts it (not too fast, not while
// wanted); goto, checkpoints (with time back), wanted then evade, steal then deliver, and pickup
// then dropoff each run through to a pass with the pay on the cash; the clock runs out, busted ends
// one; a marker waits for the player to drive out of it before it starts again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MissionManager, START_R } from '../js/sim/missions/manager.js'
import { MISSIONS, missionById } from '../js/sim/missions/index.js'
import { spot, bounds } from '../js/sim/missions/spots.js'
import { onRoad, BLOCKS } from '../js/sim/city.js'
import { Wanted } from '../js/sim/wanted.js'

const view = (x = 0, z = 0, speed = 0, vehicle = { id: 'roadster', model: 'roadster', stolen: false }) => ({
  pos: { x, y: 0, z },
  vel: { x: 0, z: 0 },
  speed,
  driving: !!vehicle,
  vehicle
})
const ctx = (P, wanted = new Wanted(), events = []) => ({ player: P, wanted, events })
const at = (P, p) => {
  P.pos.x = p.x
  P.pos.z = p.z
}

test('at least five missions, each start a spot on a street inside the map', () => {
  assert.ok(MISSIONS.length >= 5)
  const b = bounds()
  for (const d of MISSIONS) {
    const s = spot(...d.start)
    assert.ok(onRoad(s.x, s.z), `${d.id} on a road`)
    assert.ok(s.x >= b.x0 - 10 && s.x <= b.x1 + 10 && s.z >= b.z0 - 10 && s.z <= b.z1 + 10)
  }
  for (const id of ['drive', 'race', 'escape', 'deliver', 'taxi', 'getaway', 'valet', 'trial']) assert.ok(missionById(id))
})

test('driving into a marker starts it; too fast or wanted, it does not', () => {
  const M = new MissionManager()
  const s = M.startOf(missionById('drive'))
  const P = view(s.x + START_R + 5, s.z)
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  at(P, s)
  P.speed = 30
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  P.speed = 5
  const w = new Wanted()
  w.set(1, P.pos)
  M.update(0.1, ctx(P, w))
  assert.equal(M.state, 'idle')
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'running')
  assert.equal(M.active.id, 'drive')
  assert.equal(M.markers()[0].kind, 'target')
})

test('goto: stop at the destination, pass, paid; the marker waits until left', () => {
  const M = new MissionManager()
  const P = view()
  M.start('drive')
  const tgt = M.st.target
  at(P, tgt)
  P.speed = 6
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'running') // (it wants a stop)
  P.speed = 0
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  assert.equal(M.cash, missionById('drive').reward)
  assert.ok(M.passed.has('drive'))
  // back in its start marker: it waits for them to leave it first
  const s = M.startOf(missionById('drive'))
  at(P, s)
  M.hold = { id: 'drive', x: s.x, z: s.z }
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  P.pos.x += 40
  M.update(0.1, ctx(P))
  at(P, s)
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'running')
})

test('checkpoints in order, time back for each; and the clock running out fails it', () => {
  const M = new MissionManager()
  const P = view()
  M.start('race')
  const clock0 = M.timer
  const n = M.st.points.length
  at(P, M.st.points[0])
  M.update(1, ctx(P))
  assert.ok(M.timer > clock0 - 1, 'time back')
  assert.equal(M.status().progress, `1/${n}`)
  for (let i = 1; i < n; i++) {
    at(P, M.st.points[i])
    M.update(0.1, ctx(P))
  }
  assert.equal(M.state, 'idle')
  assert.ok(M.cash >= missionById('race').reward)
  M.start('race')
  P.pos.x = P.pos.z = 9999
  for (let t = 0; t < 120 && M.state === 'running'; t += 1) M.update(1, ctx(P))
  assert.equal(M.state, 'idle')
  assert.equal(M.msgs.at(-1).why, 'Out of time')
})

test('escape: three stars, then lose them; busted fails it', () => {
  const M = new MissionManager()
  const w = new Wanted()
  const P = view()
  M.on.start = d => w.set(d.wanted, P.pos)
  M.start('escape')
  assert.equal(w.stars, 1)
  M.update(0.1, ctx(P, w))
  assert.equal(M.objective.type, 'wanted')
  w.set(3)
  M.update(0.1, ctx(P, w))
  assert.equal(M.objective.type, 'evade')
  w.set(0)
  M.update(0.1, ctx(P, w))
  assert.equal(M.state, 'idle')
  assert.equal(M.cash, missionById('escape').reward)
  M.start('escape')
  M.update(0.1, ctx(P, w, [{ type: 'busted' }]))
  assert.equal(M.state, 'idle')
  assert.equal(M.msgs.at(-1).why, 'Busted')
})

test('deliver: steal the model (car-stolen), bring it to the garage in it', () => {
  const M = new MissionManager()
  const P = view()
  M.start('deliver')
  M.update(0.1, ctx(P, undefined, [{ type: 'car-stolen', model: 'sedan' }]))
  assert.equal(M.objective.type, 'steal')
  M.update(0.1, ctx(P, undefined, [{ type: 'car-stolen', model: 'sports', vehicle: 7 }]))
  assert.equal(M.objective.type, 'deliver')
  at(P, M.st.target)
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'running') // (not in the sports car)
  assert.equal(M.status().wrong, true)
  P.vehicle = { id: 7, model: 'sports', stolen: true }
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  assert.equal(M.cash, missionById('deliver').reward)
})

test('taxi: pick up (a wait at a standstill), drop off, tip for time to spare; on foot, failed', () => {
  const M = new MissionManager()
  const P = view()
  M.start('taxi')
  at(P, M.st.target)
  M.update(0.5, ctx(P))
  assert.equal(M.objective.type, 'pickup')
  M.update(1.2, ctx(P))
  assert.equal(M.objective.type, 'dropoff')
  at(P, M.st.target)
  M.update(0.6, ctx(P))
  M.update(0.6, ctx(P))
  assert.equal(M.state, 'idle')
  assert.ok(M.cash > missionById('taxi').reward, 'a tip')
  M.start('taxi')
  at(P, M.st.target)
  M.update(2, ctx(P))
  P.vehicle = null
  M.update(0.1, ctx(P))
  assert.equal(M.state, 'idle')
  assert.match(M.msgs.at(-1).why, /passenger/)
})

test('getaway: two stars on starting, the safehouse before its clock, then lie low', () => {
  const M = new MissionManager()
  const w = new Wanted()
  const P = view()
  M.on.start = d => d.wanted && w.set(d.wanted, P.pos)
  M.start('getaway')
  assert.equal(w.stars, 2)
  assert.equal(M.objective.type, 'goto')
  at(P, M.st.target)
  M.update(0.1, ctx(P, w))
  assert.equal(M.objective.type, 'evade')
  w.set(0)
  M.update(0.1, ctx(P, w))
  assert.equal(M.state, 'idle')
  assert.ok(M.passed.has('getaway'))
  // too slow to the safehouse: failed
  M.start('getaway')
  P.pos.x = P.pos.z = 9999
  for (let t = 0; t < 90 && M.state === 'running'; t++) M.update(1, ctx(P, w))
  assert.equal(M.msgs.at(-1).why, 'Out of time')
})

test('valet: the pickup is in the car park, then dinner on time with a tip', () => {
  const M = new MissionManager()
  const P = view()
  M.start('valet')
  const lot = BLOCKS.find(k => k.kind === 'parking')
  const t = M.st.target
  if (lot) assert.ok(t.x > lot.x0 && t.x < lot.x1 && t.z > lot.z0 && t.z < lot.z1, 'inside the car park')
  at(P, t)
  M.update(1, ctx(P))
  M.update(1.2, ctx(P))
  assert.equal(M.objective.type, 'dropoff')
  at(P, M.st.target)
  M.update(0.6, ctx(P))
  M.update(0.6, ctx(P))
  assert.equal(M.state, 'idle')
  assert.ok(M.cash > missionById('valet').reward)
})

test('time trial: no time back for its checkpoints; all of them in time passes', () => {
  const M = new MissionManager()
  const P = view()
  M.start('trial')
  const n = M.st.points.length
  assert.ok(n >= 6)
  const clock0 = M.timer
  at(P, M.st.points[0])
  M.update(1, ctx(P))
  assert.ok(M.timer <= clock0 - 1 + 1e-9, 'no time back')
  for (let i = 1; i < n; i++) {
    at(P, M.st.points[i])
    M.update(0.1, ctx(P))
  }
  assert.equal(M.state, 'idle')
  assert.equal(M.cash, missionById('trial').reward)
})
