// Round 2 physics, cars against cars (physCrash.mjs): momentum traded by mass, no overlap left, an
// offset hit spinning the struck car, two cars each driven by a body (the player's against a
// getaway's, vehicleLink.js) meeting instead of passing through each other. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crash, bodyCrash } from './physCrash.mjs'

test('car into a traffic car: momentum kept, mass decides who gives, nothing left overlapping', () => {
  const even = crash('sedan', 'sedan', 15)
  assert.ok(Math.abs(even.keep - 1) < 0.1, `momentum kept ${even.keep}`)
  assert.ok(even.vc1 > even.vb1, 'the struck car moves off faster than the striker (a little bounce)')
  assert.ok(even.over < 0.02, `overlap ${even.over}`)
  const truck = crash('truck', 'sedan', 15),
    small = crash('sedan', 'truck', 15)
  assert.ok(truck.vb1 > 10 && small.vb1 < 0, 'a truck ploughs on; a sedan into a truck bounces back')
  assert.ok(small.harmB > small.harmC * 2, 'the lighter one takes the worse of it')
})

test('an offset hit spins the struck car; a square one does not', () => {
  assert.ok(crash('sedan', 'sedan', 15, { dz: 1.2 }).spinMax > 1, 'offset: spins')
  assert.ok(crash('sedan', 'sedan', 15).spinMax < 0.1, 'square: straight on')
})

test('two bodies (the player against a driven car) collide, not pass through', () => {
  for (const [k, t, o] of [['sedan', 'sedan', {}], ['sedan', 'sedan', { dz: 1.2 }], ['sports', 'suv', { side: true }]]) {
    const r = bodyCrash(k, t, 15, o)
    assert.ok(r.impact > 10, `${k}->${t}: impact ${r.impact}`)
    assert.ok(r.over < 0.05, `${k}->${t}: overlap ${r.over}`)
    assert.ok(r.pushed > 2, `${k}->${t}: pushed ${r.pushed}`)
    assert.ok(r.harmB > 0.3 && r.harmC > 0.3, 'both dented')
  }
  assert.ok(bodyCrash('sedan', 'sedan', 15, { dz: 1.2 }).spinMax > 1, 'offset: the struck body spins')
})

test('progressive damage: gentle knocks, each too soft to break anything, add up to a lost lamp and crazed glass', async () => {
  const { hurt, LAMPS, PANE, paneOf } = await import('../js/sim/carDamage.js')
  const car = { x: 0, z: 0, hx: 1, hz: 0, len: 4.6, wid: 1.9, m: 1500 }
  const seen = []
  for (let i = 0; i < 8; i++) {
    hurt(car, 2.3, -0.9, 4.5, 1500, i * 2) // (nose, left corner, 16 km/h: below a lamp's own break)
    seen.push([car.dmg.lamps, paneOf(car.dmg, PANE.front)])
  }
  assert.equal(seen[0][0], 0, 'the first knock: lamp whole')
  assert.ok(seen.findIndex(s => s[0] & LAMPS.FL) > 0, 'a few knocks on: the left headlight gone')
  assert.ok(seen[7][1] >= 2, 'the nose crumpled in: the windscreen crazed')
  assert.ok(!car.dmg.wreck, 'and still a car')
})
