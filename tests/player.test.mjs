// The player on foot, the vehicles registry, boarding and the drivable adapter: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

const P = await import('../js/sim/player.js')
const { vehicles, layoutFor } = await import('../js/sim/vehicles.js')
const { Traffic } = await import('../js/sim/traffic.js')
const { Sim } = await import('../js/sim/sim.js')
const B = await import('../js/sim/boarding.js')
const D = await import('../js/sim/drivable.js')
const { CAR, makeControls } = await import('../js/sim/constants.js')
const { onGame, emitGame, drainGame, resetGame } = await import('../js/sim/gameEvents.js')
const { SPAWN } = await import('../js/sim/city.js')

const H = 1 / 120
// an open, flat world with a wall box and a car
const box = { x0: 5, x1: 7, z0: -10, z1: 10, y0: 0, y1: 4, kind: 'building' }
const step = { x0: -5, x1: -3, z0: -10, z1: 10, y0: 0, y1: 0.3, kind: 'hedge' }
const flat = (extra = {}) => ({
  solids: () => [box, step],
  base: () => 0,
  cars: [],
  ...extra
})
const fresh = () => {
  const p = structuredClone(P.player)
  p.mode = 'foot'
  P.placePlayer(0, 0, 0, 0, p)
  return p
}

test('moveDir is camera relative', () => {
  const d = P.moveDir(0, 1, 0)
  assert.ok(Math.abs(d.x - 1) < 1e-9 && Math.abs(d.z) < 1e-9, 'W along the view')
  const r = P.moveDir(0, 0, 1)
  assert.ok(Math.abs(r.z - 1) < 1e-9, 'D to the right of it (+z facing +x)')
  const q = P.moveDir(Math.PI / 2, 1, 0)
  assert.ok(Math.abs(q.z + 1) < 1e-9, 'turned a quarter: along -z')
  assert.equal(P.moveDir(0, 1, 1).mag, 1, 'diagonals no faster')
})

test('walking accelerates smoothly, sprinting is faster, and it stops', () => {
  const p = fresh(),
    w = flat()
  const ctl = { x: 0, z: 1, mag: 1, run: false, jump: false }
  P.stepFoot(p, H, ctl, w)
  assert.ok(p.speed > 0 && p.speed < P.FOOT.walk, 'eases up to speed')
  for (let i = 0; i < 120; i++) P.stepFoot(p, H, ctl, w)
  assert.ok(Math.abs(p.speed - P.FOOT.walk) < 0.05, 'walking pace')
  ctl.run = true
  for (let i = 0; i < 120; i++) P.stepFoot(p, H, ctl, w)
  assert.ok(Math.abs(p.speed - P.FOOT.run) < 0.1, 'sprinting pace')
  assert.ok(Math.abs(p.heading + Math.PI / 2) < 0.05, 'faces the way it goes')
  for (let i = 0; i < 120; i++) P.stepFoot(p, H, null, w)
  assert.ok(p.speed < 0.01, 'stops when let go')
})

test('walls stop it, a low step is walked onto, a jump lands', () => {
  const p = fresh(),
    w = flat()
  const ctl = { x: 1, z: 0, mag: 1, run: true, jump: false }
  for (let i = 0; i < 400; i++) P.stepFoot(p, H, ctl, w)
  assert.ok(p.pos.x <= 5 - P.FOOT.radius + 1e-6, 'held at the wall')
  assert.ok(p.pos.x > 4, 'right up against it')
  const q = fresh()
  ctl.x = -1
  for (let i = 0; i < 300; i++) P.stepFoot(q, H, ctl, w)
  assert.ok(q.pos.x < -4, 'over the step')
  // (on it, or past it and back down)
  assert.ok(q.grounded, 'on the ground, never floating')
  const j = fresh()
  P.stepFoot(j, H, { x: 0, z: 0, mag: 0, jump: true }, w)
  assert.ok(!j.grounded && j.vel.y > 0, 'off the ground')
  let top = 0
  for (let i = 0; i < 240; i++) {
    P.stepFoot(j, H, null, w)
    top = Math.max(top, j.pos.y)
  }
  assert.ok(top > 0.4 && top < 1.2, `a jump of ${top.toFixed(2)} m`)
  assert.ok(j.grounded && j.pos.y === 0, 'back on the ground')
})

test('cars are solid, and a free spot is found beside one', () => {
  const car = { x: 0, z: 3, fx: 1, fz: 0, hl: 2.3, hw: 0.95, top: 1.45 }
  const w = flat({ cars: [car] })
  const p = fresh()
  for (let i = 0; i < 300; i++)
    P.stepFoot(p, H, { x: 0, z: 1, mag: 1, run: false }, w)
  assert.ok(p.pos.z <= 3 - 0.95 - P.FOOT.radius + 1e-6, 'stopped by the car')
  assert.ok(P.blockedAt(0, 3, 0, w), 'inside the car is blocked')
  const s = P.freeSpot([{ x: 0, z: 3 }, { x: 0, z: 1 }], w)
  assert.deepEqual([s.x, s.z], [0, 1], 'the first spot clear of it')
  // stuck inside a wall to start with: pushed out, not left stuck
  const q = fresh()
  P.placePlayer(5.5, 0, 0, 0, q)
  P.stepFoot(q, H, null, w)
  assert.ok(q.pos.x < 5 - 0.3 || q.pos.x > 7 + 0.3, 'out of the wall')
})

test('the city: a stroll from the spawn never sinks or floats', () => {
  const p = fresh()
  P.placePlayer(SPAWN.x, SPAWN.z + 6, 0, null, p)
  const ctl = { x: 0, z: 1, mag: 1, run: true }
  for (let i = 0; i < 1200; i++) {
    P.stepFoot(p, H, ctl, P.CITY_WORLD)
    if (i % 300 === 0) ctl.x = -ctl.x || 1
  }
  assert.ok(p.grounded, 'on the ground')
  assert.ok(Math.abs(p.pos.y - p.floor) < 1e-6, 'at the floor')
})

test('the registry covers the Roadster, parked cars and traffic, with seats', () => {
  vehicles.reset()
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 30 })
  tr.reset(sim.pos.x, sim.pos.z)
  const list = vehicles.sync(tr, sim)
  assert.equal(list.length, tr.cars.length + 1)
  assert.equal(list[0].kind, 'roadster')
  assert.equal(vehicles.roadster, list[0])
  const parked = list.find(e => e.kind === 'parked')
  const moving = list.find(e => e.kind === 'traffic' && !e.car.jam)
  assert.ok(parked && moving, 'both kinds')
  assert.equal(parked.occupant, null)
  assert.equal(parked.locked, true, 'parked cars are locked')
  assert.equal(moving.occupant, 'npc')
  assert.equal(vehicles.of(parked.car), parked, 'entries are stable')
  // a door point is outside the body, on the driver's (left) side
  for (const e of [list[0], parked, moving]) {
    const d = vehicles.toWorld(e, e.door.x, e.door.z)
    assert.ok(vehicles.gap(e, d.x, d.z) > 0.3, `${e.type} door outside`)
    const l = vehicles.toLocal(e, d.x, d.z)
    assert.ok(Math.abs(l.x - e.door.x) < 1e-9 && l.z < 0, 'round trip, left side')
  }
  const near = vehicles.nearest(parked.pos, 0.5)
  assert.equal(near, parked, 'nearest finds the car it is on')
  assert.equal(vehicles.nearest({ x: 1e5, z: 1e5 }, 3), null)
  const bus = layoutFor('bus', 11.6, 2.55, 3.15)
  assert.ok(bus.seat.x > 4 && bus.seat.y > 1, 'a bus driver sits up front, high')
})

test('how to get in: the Roadster, a locked car, an empty one, a driver', () => {
  const e = (o) => ({ kind: 'parked', occupant: null, locked: true, speed: 0, ...o })
  assert.equal(B.howToEnter(e({ kind: 'roadster', occupant: null })), 'roadster')
  assert.equal(B.howToEnter(e({})), 'theft')
  assert.equal(B.howToEnter(e({ locked: false })), 'open')
  assert.equal(B.howToEnter(e({ kind: 'traffic', occupant: 'npc', locked: false })), 'jack')
  assert.equal(B.howToEnter(e({ kind: 'traffic', occupant: 'npc', speed: 10 })), null)
  assert.equal(B.howToEnter(e({ occupant: 'player' })), null)
})

test('a break-in walks round to the door, takes its time and ends seated', () => {
  vehicles.reset()
  const tr = new Traffic({ count: 30 })
  tr.reset(SPAWN.x, SPAWN.z)
  vehicles.sync(tr, null)
  const e = vehicles.list.find(v => v.kind === 'parked')
  const p = fresh()
  // (start on the far side)
  const s = vehicles.toWorld(e, 0, e.wid / 2 + 1)
  P.placePlayer(s.x, s.z, 0, 0, p)
  const rect = vehicles.rect(e)
  rect.ignore = true
  const w = flat({ solids: () => [], cars: [rect] })
  const a = B.startEnter(e, 'theft', p, () => 0.1) // (smash and alarm)
  const seen = []
  let t = 0
  while (!a.done && t < 30) {
    seen.push(...B.stepBoard(a, H, p, w))
    t += H
  }
  assert.ok(a.done, 'finished')
  assert.deepEqual(seen, ['arrived', 'smash', 'alarm', 'seated'])
  assert.ok(t > B.BOARD.jimmy + B.BOARD.open, `took ${t.toFixed(1)} s`)
  const out = B.startExit(e, flat({ solids: () => [] }))
  const ev = []
  while (!out.done) ev.push(...B.stepBoard(out, H, p, w))
  assert.deepEqual(ev, ['out', 'closed'])
  assert.ok(vehicles.gap(e, out.spot.x, out.spot.z) > 0.2, 'out beside it')
})

test('a car taken over drives on its own body and goes back to the traffic parked', () => {
  vehicles.reset()
  const tr = new Traffic({ count: 30 })
  tr.reset(SPAWN.x, SPAWN.z)
  vehicles.sync(tr, null)
  const e = vehicles.list.find(v => v.kind === 'parked')
  const d = new D.Drivable()
  d.board(e, tr)
  assert.ok(e.car.player && e.car.ctl === 'player' && e.car.parked, 'out of the traffic\'s hands')
  const c = { ...makeControls(), throttle: 1, main: 1, lift: 1 }
  let top = 0
  for (let i = 0; i < 240; i++) {
    d.step(H, c)
    d.traffic(p => tr.step(H, p, null))
    top = Math.max(top, d.sim.groundSpeed())
  }
  assert.equal(d.sim.mode, 'ground', 'no lift thrusters')
  assert.ok(top > 3 && top < 30, `${top.toFixed(1)} m/s after 2 s`)
  assert.ok(Math.hypot(e.car.x - e.pos.x, e.car.z - e.pos.z) > 3, 'the car moved with it')
  const left = d.leave()
  assert.ok(left.abandoned && !left.ctl && !left.player && !d.active)
})

test('game events go on the shared bus', () => {
  resetGame()
  const got = []
  const off = onGame('car-stolen', e => got.push(e))
  emitGame('car-stolen', { vehicle: 'car1' })
  off()
  emitGame('car-stolen', { vehicle: 'car2' })
  assert.equal(got.length, 1)
  assert.equal(got[0].vehicle, 'car1')
  // a crime keeps its own type ({ type, pos, severity }, for the police)
  emitGame('crime', { type: 'carjack', pos: { x: 1, z: 2 }, severity: 2 })
  const q = drainGame()
  assert.equal(q.length, 3)
  assert.equal(q[2].type, 'carjack')
})
