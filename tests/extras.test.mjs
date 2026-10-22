// The explorables (sim/extras.js, sim/tokens.js): the alleys and what stands in them, the street
// furniture, the lookout's and promenade's benches, and the thirty hidden tokens
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { ALLEYS, EXTRAS } = await import('../js/sim/world.js')
const T = await import('../js/sim/tokens.js')
const { query, BLOCKS, onRoad } = await import('../js/sim/city.js')
const { ringOf, ringAt, LINES } = await import('../js/sim/pavement.js')
const { SITES, POCKET } = await import('../js/sim/interiors/sites.js')

const MINE = new Set([
  'dumpster',
  'bin',
  'crate',
  'escape',
  'news',
  'meter',
  'mailbox',
  'scope',
  'bench'
])
const mine = (x0, z0, x1, z1, y0 = 0, y1 = 2) =>
  query(x0, z0, x1, z1, []).filter(
    c => MINE.has(c.look) && c.y0 < y1 && c.y1 > y0
  )

test('alleys: found in the old gaps, dressed, and nothing of theirs in the street', () => {
  assert.ok(ALLEYS.length >= 40, `${ALLEYS.length} alleys`)
  const kinds = {}
  for (const e of EXTRAS) kinds[e.kind] = (kinds[e.kind] || 0) + 1
  for (const k of [
    'dumpster',
    'lamp',
    'escape',
    'news',
    'meter',
    'mailbox',
    'bench',
    'scope'
  ])
    assert.ok(kinds[k] > 0, k)
  for (const e of EXTRAS) {
    if (e.x === undefined || e.y > 0.5) continue
    assert.ok(
      !onRoad(e.x, e.z),
      `${e.kind} on the road at ${e.x.toFixed(1)}, ${e.z.toFixed(1)}`
    )
  }
})

test('alleys: their mouths are open to walk in', () => {
  for (const a of ALLEYS) {
    const along = a.axis === 'z'
    // the 2.5 m nearest the street
    const m = along
      ? a.open < 0
        ? [a.x0, a.z0, a.x1, a.z0 + 2.5]
        : [a.x0, a.z1 - 2.5, a.x1, a.z1]
      : a.open < 0
      ? [a.x0, a.z0, a.x0 + 2.5, a.z1]
      : [a.x1 - 2.5, a.z0, a.x1, a.z1]
    assert.equal(
      mine(...m).length,
      0,
      `alley mouth blocked at ${m.map(v => v.toFixed(1))}`
    )
  }
})

test("street furniture keeps off the pavement walking lines and the interiors' doors", () => {
  const P = {}
  let n = 0
  for (const b of BLOCKS)
    for (let i = 0; i < LINES.length; i++) {
      const g = ringOf(b, i)
      for (let s = 0; s < g.len; s += 1) {
        ringAt(g, s, P)
        n++
        const hit = mine(P.x - 0.2, P.z - 0.2, P.x + 0.2, P.z + 0.2)
        assert.equal(
          hit.length,
          0,
          `${hit[0]?.look} on walking line ${i} at ${P.x.toFixed(
            1
          )}, ${P.z.toFixed(1)}`
        )
      }
    }
  assert.ok(n > 10000)
  for (const s of SITES)
    assert.equal(
      mine(s.out.x - 2, s.out.z - 2, s.out.x + 2, s.out.z + 2).length,
      0,
      s.id
    )
})

test('every solid of the extras is drawn', () => {
  const drawn = EXTRAS.filter(e => e.x !== undefined)
  for (const c of query(-2000, -2000, 2000, 2000, []).filter(c =>
    MINE.has(c.look)
  )) {
    const cx = (c.x0 + c.x1) / 2,
      cz = (c.z0 + c.z1) / 2
    const near = drawn.some(
      e => Math.abs(e.x - cx) < 5 && Math.abs(e.z - cz) < 5
    )
    assert.ok(
      near,
      `${c.look} at ${cx.toFixed(1)}, ${cz.toFixed(1)} has nothing drawn`
    )
  }
})

test('thirty tokens, each standing somewhere clear to reach', () => {
  assert.equal(T.TOKENS.length, T.TOTAL)
  assert.equal(T.TOTAL, 30)
  assert.equal(new Set(T.TOKENS.map(t => t.id)).size, 30)
  const inside = T.TOKENS.filter(t => t.y < POCKET + 5)
  assert.equal(inside.length, SITES.length, 'one in each interior')
  for (const t of T.TOKENS) {
    assert.ok(Number.isFinite(t.x + t.y + t.z), t.where)
    if (t.y < POCKET + 5) continue
    const block = query(t.x - 0.4, t.z - 0.4, t.x + 0.4, t.z + 0.4, []).filter(
      c => !c.down && c.y0 < t.y + 1.8 && c.y1 > t.y + 0.3
    )
    assert.equal(
      block.length,
      0,
      `${t.where} token ${t.id} is inside ${block[0]?.kind}`
    )
  }
})

test('tokens: taken within reach, counted, remembered', () => {
  T.loadFound('')
  const t = T.TOKENS[7]
  assert.equal(T.tokenAt({ x: t.x + 3, y: t.y, z: t.z }), null)
  assert.equal(T.tokenAt({ x: t.x + 1, y: t.y, z: t.z }), t)
  assert.equal(T.tokenAt({ x: t.x + 3, y: t.y, z: t.z }, true), t)
  assert.equal(T.tokenAt({ x: t.x, y: t.y + 6, z: t.z }), null)
  assert.equal(T.take(t), 1)
  assert.equal(T.tokenAt({ x: t.x, y: t.y, z: t.z }), null)
  const s = T.saveFound()
  T.loadFound('')
  assert.equal(T.found(), 0)
  T.loadFound(s + ',99,x')
  assert.equal(T.found(), 1)
  T.loadFound('')
})
