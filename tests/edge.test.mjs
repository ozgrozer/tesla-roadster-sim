// Headless checks of the map's edges (edge.js): the pier is driven onto and kept to, the sea puts
// a car back on the beach, the walls stop it, and the hills hold up a car flown into them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { makeControls, CAR } from '../js/sim/constants.js'
import { surfaceAt } from '../js/sim/street.js'
import { LANDMARKS } from '../js/sim/areas.js'
import { WALL, RAILS, onDeck, hillHeight, PIER_HOUSES } from '../js/sim/edge.js'
import {
  OUTER,
  LANES,
  ROADS,
  PROMENADE,
  query,
  COLLIDERS,
  OLD,
  WILSHIRE
} from '../js/sim/city.js'

// (the pier stands where it did by the first city, moved with it: grid.js OLD; W is Wilshire's
// centre line, where z was 0)
const O = OLD,
  W = ROADS[WILSHIRE]

const H = 1 / 120
function run (sim, t, set = () => {}) {
  const events = []
  for (let i = 0; i < t / H; i++) {
    const c = makeControls()
    c.fan = false
    set(c, sim)
    sim.step(H, c)
    events.push(...sim.events)
    sim.events.length = 0
  }
  return events
}

test('the pier runs out from the promenade at the end of Wilshire, and is drawn where it is solid', () => {
  const [main] = LANDMARKS.pier.deck
  assert.equal(main.x1, -PROMENADE, 'its deck starts at the promenade')
  assert.ok(main.z0 < W && main.z1 > W, 'in line with Wilshire')
  assert.ok(
    onDeck(-600 + O, W) && !onDeck(-600 + O, W - 30) && !onDeck(-800 + O, W)
  )
  // every railing is on the deck's edge, with deck on one side and none on the other
  for (const r of RAILS) {
    const mx = (r.x0 + r.x1) / 2,
      mz = (r.z0 + r.z1) / 2
    assert.ok(onDeck(mx - r.nx * 0.2, mz - r.nz * 0.2), 'deck inside')
    assert.ok(!onDeck(mx + r.nx * 0.2, mz + r.nz * 0.2), 'water outside')
  }
  // its buildings stand on it
  for (const b of PIER_HOUSES)
    assert.ok(onDeck(b.x0 + 0.1, b.z0 + 0.1) && onDeck(b.x1 - 0.1, b.z1 - 0.1))
  // and nothing out here gets in the way of the streets: no new collider on a lane or the promenade
  for (const e of LANES)
    for (let s = 0; s <= e.len; s += 4) {
      const x = e.x0 + e.dx * s,
        z = e.z0 + e.dz * s
      for (const c of query(x - 1, z - 1, x + 1, z + 1))
        assert.ok(c.kind !== 'wall', `a wall across the lane at ${x}, ${z}`)
    }
  const walls = COLLIDERS.filter(c => c.kind === 'wall')
  for (const c of walls)
    assert.ok(
      c.x1 <= -PROMENADE ||
        c.x0 >= PROMENADE ||
        c.z1 <= -PROMENADE ||
        c.z0 >= PROMENADE,
      'past the promenade'
    )
})

test('driving west down Wilshire, onto the pier and out over the sea on its planks', () => {
  const sim = new Sim()
  sim.reset('city', { x: ROADS[0] + 50, z: W - 2, yaw: Math.PI })
  let out = 0,
    surf = new Set()
  run(sim, 14, (c, s) => {
    c.throttle = s.pos.x > -560 + O ? 0.5 : 0
    c.brake = s.pos.x < -620 + O ? 1 : 0
    surf.add(s.surface)
    out = Math.min(out, s.pos.x)
  })
  assert.ok(out < -600 + O, `out along the pier (to x ${out.toFixed(0)})`)
  assert.ok(sim.pos.x < -OUTER - 40, 'past where the beach meets the sea')
  assert.ok(onDeck(sim.pos.x, sim.pos.z), 'and still on the deck')
  assert.ok(surf.has('wood') && sim.surface === 'wood', 'on its planks')
  assert.ok(!surf.has('sand'), 'never on the sand on the way')
})

test('the railings keep the car on the deck, and the sea sends it back to the beach', () => {
  const sim = new Sim()
  // on the deck between two kiosks, heading straight for the north railing at 15 m/s
  sim.reset('city', { x: -645 + O, z: W + 2, yaw: Math.PI / 2 })
  sim.vel.set(0, 0, -15)
  sim.speed = 15
  const events = run(sim, 2)
  assert.ok(
    events.some(e => e.type === 'bump' && e.what === 'wall'),
    'it hits it'
  )
  assert.ok(sim.pos.z > W - 9 + CAR.halfW - 0.3, 'and stays inside it')
  assert.ok(onDeck(sim.pos.x, sim.pos.z), 'on the deck')
  assert.ok(Math.abs(sim.pos.x + 645 - O) < 3, 'where it was')
  // come down in the sea (flown out there): back on the beach
  sim.reset('city', { x: -640 + O, z: W + 200, yaw: 0 })
  run(sim, 0.1)
  assert.ok(Math.abs(sim.pos.x + OUTER) < 0.5, 'at the edge of the sand')
  assert.equal(sim.surface, 'sand')
})

test('the walls stop the car north, east and south, and put back a car come down past them', () => {
  for (const [x, z, yaw, k, sg] of [
    [ROADS[3], -WALL + 12, Math.PI / 2, 'z', -1],
    [WALL - 12, ROADS[6], 0, 'x', 1],
    [ROADS[8], WALL - 12, -Math.PI / 2, 'z', 1]
  ]) {
    const sim = new Sim()
    sim.reset('city', { x, z, yaw })
    run(sim, 3, c => (c.throttle = 1))
    assert.ok(
      sim.pos[k] * sg < WALL - CAR.halfL + 0.2,
      `stopped by the wall (${k} ${sim.pos[k].toFixed(1)})`
    )
    assert.equal(surfaceAt(sim.pos.x, sim.pos.z), 'grass', 'on the verge')
  }
  const sim = new Sim()
  sim.reset('city', { x: 100, z: -WALL - 60, yaw: 0 })
  run(sim, 0.1)
  assert.ok(sim.pos.z > -WALL, 'back in front of the wall')
})

test('a car flown into the hills is held up by them, and slides back down', () => {
  const sim = new Sim()
  sim.reset('city')
  sim.setMode('air')
  sim.com.set(ROADS[4], 20, -WALL + 10)
  sim.vel.set(0, 2, -25)
  sim.syncPose()
  let deepest = 0,
    north = 0
  run(sim, 10, (c, s) => {
    if (s.mode !== 'air') return
    const under = hillHeight(s.com.x, s.com.z)
    deepest = Math.max(deepest, under - (s.com.y - CAR.comH))
    north = Math.min(north, s.com.z)
  })
  assert.ok(north < -WALL - 10, 'it got in among the hills')
  assert.ok(deepest < 0.9, `never inside them (${deepest.toFixed(2)} m)`)
  assert.ok(sim.pos.z > -WALL, 'and came back down onto the verge')
})
