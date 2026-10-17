// Headless checks of the traffic's car shapes: every type has its lamps (to be lit per car), and
// stays within its triangle budget.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TYPES } from '../js/sim/traffic.js'
import { LAMP } from '../js/render/carLamps.js'
import { carShape } from '../js/render/carShapes.js'

const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3

test('every car type has its headlights, tail lights, indicators and reversing lamps', () => {
  for (const T of TYPES) {
    const sh = carShape(T)
    const tags = sh.trim.attributes.aLamp
    assert.ok(tags, `${T.name}: lamps tagged`)
    assert.equal(tags.count, sh.trim.attributes.position.count, 'a tag for every vertex')
    const has = new Set(tags.array)
    for (const k of ['head', 'tail', 'left', 'right', 'reverse'])
      assert.ok(has.has(LAMP[k]), `${T.name}: ${k}`)
    if (T.name === 'taxi') assert.ok(has.has(LAMP.taxi), 'a taxi has its roof sign')
    if (T.name === 'bus') assert.ok(has.has(LAMP.route), 'a bus has its route board')
    if (T.name !== 'sedan' && T.name !== 'taxi')
      assert.ok(has.has(LAMP.stop), `${T.name}: a high stop lamp`)
    // headlights at the front, tail lights at the back
    const pos = sh.trim.attributes.position
    for (let i = 0; i < tags.count; i++) {
      if (tags.array[i] === LAMP.head) assert.ok(pos.getX(i) > T.len / 2 - 0.05)
      if (tags.array[i] === LAMP.tail) assert.ok(pos.getX(i) < -T.len / 2 + 0.05)
    }
    const n = tris(sh.paint) + tris(sh.glass) + tris(sh.trim)
    assert.ok(n < 1600, `${T.name}: ${n} triangles`)
  }
})
