// The stadium's stands and canopy (venues.js, drawn by cityStadium.js) are solid: a car come down on
// the drum is held on the pitch by them, and the canopy is a roof to land on. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { BUILDINGS } from '../js/sim/city.js'
import { roofAt } from '../js/sim/roofs.js'
import { makeControls } from '../js/sim/constants.js'

const S = BUILDINGS.find(b => b.stadium).stadium

test("a car on the stadium's pitch is kept off the stands, and the canopy is a roof", () => {
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, 2, Math.PI]) {
    const sim = new Sim()
    sim.reset('city', { x: S.cx, z: S.cz + 3, yaw })
    sim.land(roofAt(S.cx, S.cz + 3, S.h + 0.5))
    sim.syncPose()
    const c = makeControls()
    c.throttle = 1
    c.fan = false
    let far = 0
    for (let i = 0; i < 6 * 120; i++) {
      sim.step(1 / 120, c)
      far = Math.max(
        far,
        Math.hypot((sim.pos.x - S.cx) / S.rx, (sim.pos.z - S.cz) / S.rz)
      )
    }
    assert.ok(
      far < 0.6 && sim.floor === S.h,
      `yaw ${yaw.toFixed(2)}: out to ${far.toFixed(2)}`
    )
  }
  const top = roofAt(S.cx + S.rx * 0.95, S.cz + 2, 60)
  assert.ok(top && Math.abs(top.y1 - (S.h + 23)) < 1e-9, 'the canopy')
})
