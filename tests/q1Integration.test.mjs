// Q1 (integration) regressions: what only showed with every stream's work together in the game.
// A roadblock put down the far side of the camera's reach (policeAir.js roadblockSpot, FAR_BLOCK: 312 m
// on, when all the nearer road is in sight) was taken away the step it went down, as 'left behind'
// (police.js retire: a block over 260 m off): in the game, on a straight, no roadblock ever stood.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Traffic } from '../js/sim/traffic.js'
import { SPAWN } from '../js/sim/city.js'
import { Wanted } from '../js/sim/wanted.js'
import { Police } from '../js/sim/police.js'

const H = 1 / 60

test('three stars down a long straight in the camera: the far roadblock stays put', () => {
  const tr = new Traffic({ count: 30 })
  tr.reset(SPAWN.x, SPAWN.z)
  const pol = new Police(tr)
  const w = new Wanted()
  w.set(3, { x: SPAWN.x, z: SPAWN.z })
  const P = {
    pos: { x: SPAWN.x, y: 0, z: SPAWN.z },
    vel: { x: 20, z: 0 },
    heading: 0,
    speed: 20,
    driving: true,
    mode: 'car'
  }
  pol.blockT = 0
  let most = 0,
    far = 0
  for (let t = 0; t < 1.5; t += H) {
    tr.t += H
    P.pos.x += P.vel.x * H
    // (the camera 6 m behind, looking along the road)
    const view = { x: P.pos.x - 6, z: P.pos.z, fx: 1, fz: 0 }
    pol.step(H, { wanted: w, player: P, view })
    w.update(H, P.pos, pol.seen)
    const bs = pol.units.filter(u => u.role === 'block')
    most = Math.max(most, bs.length)
    for (const b of bs) far = Math.max(far, b.x - P.pos.x)
  }
  assert.ok(most >= 2, 'a roadblock stood (two cars across the road)')
  assert.ok(
    pol.units.filter(u => u.role === 'block').length >= 2,
    'still there 1.5 s on'
  )
  assert.ok(far > 100, 'ahead, out of sight: ' + far.toFixed(0) + ' m')
})
