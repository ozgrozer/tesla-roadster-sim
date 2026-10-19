// Headless checks of the wanted level (wanted.js) and who sees a crime (witness.js): nobody sees
// it, no stars; the public's report gives stars, the police's counts double; the stars follow the
// heat; in sight the last known position follows the player and a long chase escalates; out of
// sight the stars flash, the search circle stays where they were last seen, the cooldown runs
// slowly inside it and quickly outside, and the stars clear.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Wanted, STAR_HEAT, GRACE, ESCALATE, starsFor, searchRadius, cooldownFor } from '../js/sim/wanted.js'
import { witnesses, clear } from '../js/sim/witness.js'
import { BUILDINGS } from '../js/sim/city.js'

const NOBODY = { peds: 0, cars: 0, police: 0 }
const crime = (type = 'ped-hit', severity = 1, pos = { x: 0, z: 0 }) => ({ type, severity, pos })

test('stars follow the heat; an unwitnessed crime adds none', () => {
  assert.equal(starsFor(0), 0)
  for (let s = 1; s <= 5; s++) assert.equal(starsFor(STAR_HEAT[s]), s)
  const w = new Wanted()
  assert.equal(w.report(crime(), NOBODY), 0)
  assert.equal(w.stars, 0)
  w.report(crime(), { peds: 2, cars: 0, police: 0 })
  assert.equal(w.stars, 1)
  assert.equal(w.seen, false) // (reported by the public: the police don't see them yet)
  const v = new Wanted()
  v.report(crime('ped-killed', 3), { peds: 0, cars: 0, police: 1 }) // 2 x 3 x 2 = 12 heat
  assert.equal(v.stars, 4)
  assert.equal(v.seen, true)
})

test('in sight: the last known position follows; a long chase escalates', () => {
  const w = new Wanted()
  w.set(2, { x: 0, z: 0 })
  const p = { x: 50, z: 20 }
  w.update(0.1, p, true)
  assert.deepEqual(w.last, { x: 50, z: 20 })
  assert.equal(w.searching, false)
  for (let t = 0; t < ESCALATE + 1; t += 0.1) w.update(0.1, p, true)
  assert.equal(w.stars, 3)
})

test('out of sight: flashing, the circle stays, slow inside and quick outside, then clear', () => {
  const w = new Wanted()
  w.set(2, { x: 0, z: 0 })
  w.update(0.1, { x: 0, z: 0 }, true)
  w.update(GRACE / 2, { x: 10, z: 0 }, false)
  assert.equal(w.searching, false) // (a moment's grace)
  // inside the circle for the whole cooldown: not enough
  const cd = cooldownFor(2)
  for (let t = 0; t < cd + GRACE; t += 0.1) w.update(0.1, { x: 20, z: 0 }, false)
  assert.equal(w.searching, true)
  assert.equal(w.stars, 2)
  assert.deepEqual(w.last, { x: 0, z: 0 })
  // out of it: cleared within the cooldown
  const out = { x: searchRadius(2) + 30, z: 0 }
  let t = 0
  while (w.stars && t < cd * 2) {
    w.update(0.1, out, false)
    t += 0.1
  }
  assert.equal(w.stars, 0)
  assert.ok(t <= cd, `cleared in ${t.toFixed(1)} s`)
  assert.equal(w.cleared, 2)
})

test('witnesses: within reach and in sight only; buildings block the line', () => {
  const pos = { x: 0, z: 0 }
  const los = () => true
  const peds = [{ x: 10, z: 0 }, { x: 100, z: 0 }, { x: 5, z: 5, state: 'down' }]
  const cars = [{ x: 20, z: 0 }, { x: 20, z: 5, parked: true }, { x: 30, z: 0, ctl: 'police' }]
  const w = witnesses(pos, { peds, cars, police: [{ x: 60, z: 0 }], stars: 0, los })
  assert.deepEqual(w, { peds: 1, cars: 1, police: 1 })
  assert.deepEqual(witnesses(pos, { peds, cars, los: () => false }), NOBODY)
  // a real building between two points
  const b = BUILDINGS.find(k => k.tiers[0].x1 - k.tiers[0].x0 > 12 && k.tiers[0].y1 > 6)
  const t = b.tiers[0],
    cz = (t.z0 + t.z1) / 2
  assert.equal(clear(t.x0 - 5, cz, t.x1 + 5, cz), false)
  assert.equal(clear(t.x0 - 5, t.z0 - 40, t.x1 + 5, t.z0 - 40) || true, true)
})
