// Headless checks of the traffic's car shapes: every type has its lamps (to be lit per car) where
// they belong, a police car its light bar, the wheels fill their arches inside the body, and each
// type stays within its triangle budget.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TYPES } from '../js/sim/traffic.js'
import { LAMP } from '../js/render/carLamps.js'
import { carShape } from '../js/render/carShapes.js'

const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3

test('every car type has its headlights, tail lights, indicators, reversing and stop lamps', () => {
  for (const T of TYPES) {
    const sh = carShape(T)
    const tags = sh.trim.attributes.aLamp
    assert.ok(tags, `${T.name}: lamps tagged`)
    assert.equal(
      tags.count,
      sh.trim.attributes.position.count,
      'a tag for every vertex'
    )
    const has = new Set(tags.array)
    for (const k of [
      'head',
      'drl',
      'tail',
      'left',
      'right',
      'reverse',
      'stop',
      'markFront',
      'markRear'
    ])
      assert.ok(has.has(LAMP[k]), `${T.name}: ${k}`)
    if (T.name === 'taxi')
      assert.ok(has.has(LAMP.taxi), 'a taxi has its roof sign')
    if (T.name === 'bus')
      assert.ok(has.has(LAMP.route), 'a bus has its route board')
    if (T.name === 'police')
      assert.ok(
        has.has(LAMP.barRed) && has.has(LAMP.barBlue),
        'a police car has its light bar'
      )
    // headlights and front markers at the front (round its corners), tail lights at the back
    const L = T.len / 2,
      pos = sh.trim.attributes.position
    for (let i = 0; i < tags.count; i++) {
      const x = pos.getX(i),
        t = tags.array[i]
      if (t === LAMP.head || t === LAMP.markFront)
        assert.ok(x > L * 0.6, `${T.name}: a front lamp at ${x.toFixed(2)}`)
      if (t === LAMP.tail || t === LAMP.markRear)
        assert.ok(x < -L * 0.6, `${T.name}: a rear lamp at ${x.toFixed(2)}`)
    }
  }
})

test('the wheels fill their arches and stay inside the body', () => {
  for (const T of TYPES) {
    const { S, arch } = carShape(T)
    assert.ok(
      arch.r > S.r && arch.r < S.r + 0.08,
      `${T.name}: the arch ${arch.r} round a wheel of ${S.r}`
    )
    assert.ok(
      S.track + S.tyre / 2 <= T.wid / 2,
      `${T.name}: the tyres inside the body`
    )
    assert.ok(
      arch.wellIn < S.track - S.tyre / 2,
      `${T.name}: the arch open over the whole tyre`
    )
    const wb = S.axles[0] - S.axles[1]
    assert.ok(
      wb > T.len * 0.45 && wb < T.len * 0.7,
      `${T.name}: a wheelbase of ${wb.toFixed(2)} m`
    )
  }
})

test('every car type stays within its triangle budget', () => {
  for (const T of TYPES) {
    const sh = carShape(T)
    const n = tris(sh.paint) + tris(sh.glass) + tris(sh.trim)
    assert.ok(n < 1600, `${T.name}: ${n} triangles`)
  }
})
