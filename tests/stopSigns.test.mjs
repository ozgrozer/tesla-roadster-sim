// The all-way stops' signs (sim/stopSigns.js): one at every approach of each of them, on the
// pavement just in from the kerb before the line, facing the drivers, nothing in the way
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { SIGNS, LEGENDS, SIGN } = await import('../js/sim/world.js')
const { STOPS } = await import('../js/sim/trafficStop.js')
const { NODES, onRoad, query } = await import('../js/sim/city.js')
const { ROAD_HW, STOP } = await import('../js/sim/grid.js')
const { ringOf, ringAt, LINES } = await import('../js/sim/pavement.js')
const { BLOCKS } = await import('../js/sim/city.js')

test('a stop sign on every approach of every all-way stop', () => {
  assert.equal(STOPS.length, 21)
  const approaches = STOPS.reduce((a, n) => a + n.inc.filter(Boolean).length, 0)
  assert.equal(SIGNS.length, approaches)
  assert.equal(LEGENDS.length, approaches * 2)
  for (const s of SIGNS) {
    const n = NODES[s.node]
    assert.ok(!onRoad(s.x, s.z), `sign at ${s.x}, ${s.z} is in the road`)
    // before the line, and facing back along the way the drivers come
    const along = -((s.x - n.x) * s.fx + (s.z - n.z) * s.fz)
    assert.ok(along < -STOP, `sign ${s.node}/${s.dir} past its line`)
    const side = Math.hypot(s.x - n.x, s.z - n.z) ** 2 - along ** 2
    assert.ok(Math.abs(Math.sqrt(side) - SIGN.out) < 0.01)
    assert.ok(SIGN.out > ROAD_HW && SIGN.out < ROAD_HW + 1)
    const others = query(s.x - 0.3, s.z - 0.3, s.x + 0.3, s.z + 0.3, []).filter(
      c => c !== s.c && c.y1 > 0.3
    )
    assert.equal(
      others.length,
      0,
      `sign at ${s.x}, ${s.z} stands in ${others[0]?.kind}`
    )
  }
  for (const l of LEGENDS) assert.ok(onRoad(l.x, l.z))
})

test('the signs keep off the pavement walking lines', () => {
  const P = {}
  const near = b => SIGNS.some(sg => sg.x > b.x0 - 15 && sg.x < b.x1 + 15 && sg.z > b.z0 - 15 && sg.z < b.z1 + 15)
  for (const b of BLOCKS.filter(near))
    for (let i = 0; i < LINES.length; i++) {
      const g = ringOf(b, i)
      for (let s = 0; s < g.len; s += 0.5) {
        ringAt(g, s, P)
        for (const sg of SIGNS)
          assert.ok(
            Math.hypot(P.x - sg.x, P.z - sg.z) > 0.25,
            `sign on walking line ${i}`
          )
      }
    }
})
