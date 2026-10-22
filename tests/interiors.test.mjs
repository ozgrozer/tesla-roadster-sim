// The interiors (sim/interiors): the sites found on the city's buildings, the doors' offers, the fade
// and the swap in and out, the room's world for the feet, and letting go of a player put elsewhere
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { SITES, POCKET } = await import('../js/sim/interiors/sites.js')
const S = await import('../js/sim/interiors/state.js')
const M = await import('../js/sim/interiors/modshop.js')
const P = await import('../js/sim/player.js')
const { ROOMS } = await import('../js/sim/interiors/rooms.js')
const { query, BUILDINGS } = await import('../js/sim/city.js')

const H = 1 / 120
const fresh = (mode = 'foot') => {
  const p = structuredClone(P.player)
  p.mode = mode
  p.wanted = 0
  return p
}
// run the transition to its end; the number of swaps seen
function run (p, world) {
  let swaps = 0
  for (let i = 0; i < 400 && S.busy(); i++) {
    const ev = S.stepTransition(H)
    if (ev === 'swap') {
      swaps++
      if (S.INTERIOR.act === 'enter') S.swapIn(S.INTERIOR.target, p)
      else if (S.INTERIOR.act === 'exit') S.swapOut(p)
    }
  }
  return swaps
}

test('interiors: every site is on a building of the layout, its door on the wall, out on open ground', () => {
  assert.ok(SITES.length >= 3, 'at least three interiors')
  const kinds = new Set(SITES.map(s => s.kind))
  for (const k of ['store', 'workshop', 'diner']) assert.ok(kinds.has(k), k)
  for (const s of SITES) {
    assert.ok(BUILDINGS.includes(s.building), s.id)
    const b = s.building
    const onWall = (Math.abs(s.face.x - b.x0) < 1e-6 || Math.abs(s.face.x - b.x1) < 1e-6 || Math.abs(s.face.z - b.z0) < 1e-6 || Math.abs(s.face.z - b.z1) < 1e-6)
    assert.ok(onWall, `${s.id}: its door on the building's wall`)
    // the spot in front of the door is clear of every collider at body height (no wall in the way)
    const hits = query(s.out.x - 0.3, s.out.z - 0.3, s.out.x + 0.3, s.out.z + 0.3).filter(c => !c.down && c.y0 < 1.7 && c.y1 > 0.45)
    assert.equal(hits.length, 0, `${s.id}: in front of its door is open (${hits.map(c => c.look || c.kind)})`)
    // the room's colliders never in the city's grid
    for (const c of s.solids) assert.ok(c.y1 <= POCKET + s.room.h + 1e-6)
  }
})

test('interiors: walk up to a door, E, fade, inside facing in, the room solid round you; out by the same door', () => {
  const p = fresh()
  const s = SITES[0]
  P.placePlayer(s.out.x, s.out.z, s.yawIn, 0.08, p)
  const o = S.offerAt(p)
  assert.equal(o?.act, 'enter')
  assert.equal(o.site, s)
  assert.ok(S.begin(o))
  assert.ok(S.busy())
  assert.equal(S.offerAt(p), null, 'nothing offered mid-fade')
  // (the fade reaches black before the swap)
  let black = false
  let swaps = 0
  for (let i = 0; i < 400 && S.busy(); i++) {
    const ev = S.stepTransition(H)
    if (ev === 'swap') {
      black = S.INTERIOR.fade === 1
      S.swapIn(S.INTERIOR.target, p)
      swaps++
    }
  }
  assert.equal(swaps, 1)
  assert.ok(black, 'swapped under the black')
  assert.equal(S.INTERIOR.fade, 0)
  assert.ok(S.inside())
  assert.equal(p.pos.y, POCKET)
  assert.ok(Math.abs(p.heading - s.yawIn) < 1e-9)
  // walk into the room for 6 s straight in, then sideways: never through a wall
  const world = S.roomWorld(s)
  const b = s.box
  for (const [f, r] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
    const dir = P.moveDir(s.yawIn, f, r)
    for (let i = 0; i < 720; i++) {
      P.stepFoot(p, H, dir, world)
      assert.ok(p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1, `inside the walls (${p.pos.x}, ${p.pos.z})`)
      assert.ok(Math.abs(p.pos.y - POCKET) < 1.5)
    }
  }
  assert.equal(world.cars.length, 0, 'no cars in the room')
  // back by the door: Exit on offer, and out onto the street where the player went in
  P.placePlayer(s.inner.x, s.inner.z, s.yawOut, POCKET, p)
  const x = S.offerAt(p)
  assert.equal(x?.act, 'exit')
  S.begin(x)
  assert.equal(run(p), 1)
  assert.ok(!S.inside())
  assert.ok(Math.hypot(p.pos.x - s.out.x, p.pos.z - s.out.z) < 1e-6, 'out by the same door')
  assert.ok(p.pos.y >= 0 && p.pos.y < 0.5, 'on the pavement')
  assert.ok(Math.abs(p.heading - s.yawOut) < 1e-9, 'facing away from the door')
})

test('interiors: wanted, no way in; in a car, no door; the body shop serves a car stopped in its bay', () => {
  S.clearInterior()
  const p = fresh()
  const s = SITES[0]
  P.placePlayer(s.out.x, s.out.z, 0, 0.08, p)
  p.wanted = 2
  const o = S.offerAt(p)
  assert.ok(o?.why, 'lose the cops first')
  assert.equal(S.begin(o), false)
  p.wanted = 0
  p.mode = 'car'
  assert.equal(S.offerAt(p), null, 'no door from the driver\'s seat')
  const shop = SITES.find(t => t.drive)
  assert.ok(shop, 'a body shop with a bay')
  const d = shop.drive
  p.pos.x = (d.x0 + d.x1) / 2
  p.pos.z = (d.z0 + d.z1) / 2
  assert.equal(S.offerAt(p, 8)?.why, 'Stop in the bay')
  const sv = S.offerAt(p, 0.2)
  assert.equal(sv?.act, 'service')
  assert.ok(!sv.why)
  assert.ok(S.begin(sv))
  run(p)
  assert.ok(!S.inside(), 'a service never takes the player into a room')
  // the price, the colours
  assert.equal(M.canPay({ cash: M.PRICE - 1 }), false)
  assert.equal(M.canPay({ cash: M.PRICE }), true)
  const a = M.nextColour(),
    b = M.nextColour()
  assert.notEqual(a.hex, b.hex, 'a different colour each time')
  const k = M.repaintKey(0.2, 0)
  assert.ok(k >= 0 && k < 1 && Math.abs(k - 0.2) > 0.1)
})

test('interiors: a player put somewhere else (a reset, a respawn) is let go of', () => {
  S.clearInterior()
  const p = fresh()
  const s = SITES[1]
  S.swapIn(s, p)
  assert.ok(S.inside())
  assert.equal(S.strayed(p), false)
  P.placePlayer(0, 0, 0, null, p)
  assert.equal(S.strayed(p), true)
  S.clearInterior()
  S.swapIn(s, p)
  p.mode = 'car'
  assert.equal(S.strayed(p), true, 'back in a car')
  S.clearInterior()
  assert.ok(!S.inside() && !S.busy())
})

test('interiors: rooms are sized and lit, their furniture inside their walls', () => {
  for (const [k, R] of Object.entries(ROOMS)) {
    assert.ok(R.w >= 8 && R.d >= 8 && R.h >= 3, k)
    assert.ok(R.lamps.length > 0, k)
    assert.ok(Math.abs(R.door) < R.w / 2 - 0.7, `${k}: the door on its wall`)
    for (const [x0, x1, z0, z1, y0, y1] of R.boxes) {
      assert.ok(x0 >= -R.w / 2 - 0.05 && x1 <= R.w / 2 + 0.05 && z0 >= -0.05 && z1 <= R.d + 0.05, `${k}: a box in the room`)
      assert.ok(y0 >= 0 && y1 <= R.h + 1e-6, `${k}: under the ceiling`)
    }
    // the way in from the door is clear for a few metres
    for (const [x0, x1, z0, z1, y0, y1, , what] of R.boxes)
      if (what === 's' || what === 'x')
        assert.ok(!(x0 < R.door + 0.5 && x1 > R.door - 0.5 && z0 < 1.8 && y1 > 0.4 && y0 < 1.7), `${k}: nothing in the doorway`)
  }
})
