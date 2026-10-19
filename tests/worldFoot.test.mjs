// On foot on the grown world: the feet (player.js floorAt) stand where groundHeight (world.js) says
// the ground is: on the hill road and in its tunnel (not on the hill over it), on the bridge and the
// lookout, on the freeway's deck, on the quay; and nothing stands in the way along the road.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { floorAt, blockedAt } from '../js/sim/player.js'
import { groundHeight, HILL_ROAD, LOOKOUT, FWY } from '../js/sim/world.js'
import { QUAY } from '../js/sim/quay.js'
import '../js/sim/breakables.js'

// the floor for feet at the height of the ground (world.js) there
function feet (x, z, y) {
  const g = groundHeight(x, z, y)
  return { g, f: floorAt(x, z, g + 0.05) }
}

test('on foot along the hill road, through the tunnel and over the bridge, the floor is the road', () => {
  for (const s of HILL_ROAD) {
    // (a little off the middle: not on the line between two of a ramp's treads)
    const u = 0.4637
    const x = s.x0 + (s.x1 - s.x0) * u,
      z = s.z0 + (s.z1 - s.z0) * u,
      y = s.h0 + (s.h1 - s.h0) * u
    const { g, f } = feet(x, z, y + 0.5)
    assert.ok(Math.abs(g - y) < 0.4, `${s.kind}: groundHeight ${g.toFixed(2)} at the road ${y.toFixed(2)}`)
    assert.ok(Math.abs(f - g) < 0.35, `${s.kind}: feet at ${f.toFixed(2)}, ground ${g.toFixed(2)}`)
    assert.equal(blockedAt(x, z, f), false, `${s.kind}: room to stand at (${x.toFixed(0)}, ${z.toFixed(0)})`)
  }
  const lx = (LOOKOUT.x0 + LOOKOUT.x1) / 2,
    lz = (LOOKOUT.z0 + LOOKOUT.z1) / 2
  assert.ok(Math.abs(feet(lx, lz, LOOKOUT.y + 0.5).f - LOOKOUT.y) < 0.35, 'up on the lookout')
})

test('on foot on the freeway deck and on the quay', () => {
  const x = (FWY.x0 + FWY.x1) / 2
  const d = feet(x, FWY.z + 6, FWY.y + 0.5)
  assert.ok(Math.abs(d.f - FWY.y) < 0.35, `on the deck (${d.f.toFixed(2)})`)
  const q = feet((QUAY.x0 + QUAY.x1) / 2, (QUAY.z0 + QUAY.z1) / 2, 1)
  assert.ok(q.f >= 0 && q.f < 0.5, `on the quay (${q.f.toFixed(2)})`)
})
