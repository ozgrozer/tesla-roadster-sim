// Headless checks of the police (police.js, policeUnit.js, policeAir.js): units are put down on the
// lane graph off-screen and facing the player, as many as the stars call for, with their light bars
// on; they find a player standing in the street and come for them, see them, and arrest a player at
// a standstill; at three stars a roadblock goes across the road ahead; at four the helicopter comes
// and sees them; the roles at each level; and once the stars clear the units leave and are gone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Traffic } from '../js/sim/traffic.js'
import { LANES, SPAWN, rng } from '../js/sim/city.js'
import { Wanted } from '../js/sim/wanted.js'
import { Police, UNITS, spawnPoint, inView, SPAWN_MIN, SPAWN_MAX } from '../js/sim/police.js'
import { roleFor } from '../js/sim/policeUnit.js'

const H = 1 / 60
const player = (x = SPAWN.x, z = SPAWN.z, vx = 0) => ({
  pos: { x, y: 0, z },
  vel: { x: vx, z: 0 },
  heading: 0,
  speed: Math.abs(vx),
  driving: true,
  mode: 'car'
})
function world (stars) {
  const tr = new Traffic({ count: 30 })
  tr.reset(SPAWN.x, SPAWN.z)
  const pol = new Police(tr)
  const w = new Wanted()
  if (stars) w.set(stars, { x: SPAWN.x, z: SPAWN.z })
  return { tr, pol, w }
}
function run (o, P, sec, view = null) {
  for (let t = 0; t < sec; t += H) {
    o.tr.t += H
    P.pos.x += P.vel.x * H
    o.pol.step(H, { wanted: o.w, player: P, view })
    o.w.update(H, P.pos, o.pol.seen)
  }
}

test('spawn points: on a lane, off-screen, in range, facing the player', () => {
  const R = rng(5)
  const view = { x: SPAWN.x, z: SPAWN.z, fx: 1, fz: 0 }
  for (let i = 0; i < 20; i++) {
    const at = spawnPoint(SPAWN.x, SPAWN.z, view, R)
    assert.ok(at, 'found a place')
    assert.ok(LANES.includes(at.lane))
    const d = Math.hypot(at.x - SPAWN.x, at.z - SPAWN.z)
    assert.ok(d >= SPAWN_MIN && d <= SPAWN_MAX, `d ${d}`)
    assert.equal(inView(view, at.x, at.z), false)
  }
})

test('as many units as the stars call for, light bars on; they come and see the player', () => {
  const o = world(2)
  const P = player()
  run(o, P, 30)
  const units = o.pol.units.filter(u => u.role === 'pursuit')
  assert.equal(units.length, UNITS[2])
  for (const u of units) {
    assert.equal(u.car.siren, 1)
    assert.equal(u.car.ctl, 'police')
    assert.ok(o.tr.cars.includes(u.car))
  }
  assert.ok(o.pol.nearest < 60, `nearest ${o.pol.nearest.toFixed(0)} m`)
  assert.equal(o.w.seen, true)
  assert.ok(o.pol.chase.on) // (its siren heard: audio/siren.js)
})

test('a player standing still is arrestable once a unit pulls up beside them', () => {
  const o = world(1)
  const P = player()
  let bust = 0
  for (let t = 0; t < 45 && !bust; t += 1) {
    run(o, P, 1)
    bust = o.pol.bustable
  }
  assert.ok(bust > 0, 'a unit stopped beside them')
})

test('roles: tail at one or two stars, ram at three, box in at four', () => {
  assert.equal(roleFor(1, 0), 'tail')
  assert.equal(roleFor(2, 1), 'tail')
  assert.equal(roleFor(3, 1), 'ram')
  assert.equal(roleFor(4, 0), 'ram')
  assert.equal(roleFor(4, 1), 'box')
})

test('three stars: a roadblock across the road ahead of a moving player', () => {
  const o = world(3)
  // eastbound along the central avenue
  const P = player(SPAWN.x, SPAWN.z, 20)
  o.pol.blockT = 0
  run(o, P, 1)
  const blocks = o.pol.units.filter(u => u.role === 'block')
  assert.ok(blocks.length >= 2, 'two cars across the road')
  for (const b of blocks) {
    assert.ok(b.x > P.pos.x + 60, 'ahead')
    assert.ok(Math.abs(b.z - P.pos.z) < 16, 'on its road')
  }
})

test('four stars: the helicopter comes and sees the player', () => {
  const o = world(4)
  const P = player()
  run(o, P, 25)
  assert.ok(o.pol.heli.on)
  assert.ok(o.pol.heli.sees)
  assert.ok(Math.hypot(o.pol.heli.spot.x - P.pos.x, o.pol.heli.spot.z - P.pos.z) < 15)
})

test('stars cleared: the units switch off their lights, leave, and are taken away', () => {
  const o = world(2)
  const P = player()
  run(o, P, 20)
  o.w.set(0)
  run(o, P, 2)
  for (const u of o.pol.units) assert.equal(u.car.siren, 0)
  run(o, P, 45)
  assert.equal(o.pol.units.length, 0)
  assert.equal(o.tr.cars.filter(c => c.ctl === 'police').length, 0)
})
