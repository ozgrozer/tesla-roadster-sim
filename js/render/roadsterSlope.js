// The Roadster drawn lying on the slope it drives up (the freeway's ramps, the hill road, the bridge):
// the sim climbs them as a flight of thin treads (roofs.js, plots.js ramp) and keeps the car level,
// so the model is pitched and rolled to the ground under its wheels (world.js groundHeight) and set
// on its smooth surface rather than on the tread's edge.
import * as THREE from 'three'
import { groundHeight } from '../sim/world.js'
import { CAR, AX_Z, AX_X } from '../sim/constants.js'

const EASE = 10,
  NEAR = 0.6 // (the treads' ground: not a roof far above or below it)
const _q = new THREE.Quaternion()
const S = { p: 0, r: 0, dy: 0 }

export function slopeRoadster (car, sim, dt) {
  let p = 0,
    r = 0,
    dy = 0
  if (sim.world === 'city' && sim.mode === 'ground') {
    const x = sim.pos.x,
      z = sim.pos.z,
      y = sim.pos.y,
      g = groundHeight(x, z, y + NEAR)
    if (Math.abs(g - y) < NEAR) {
      const fx = Math.cos(sim.yaw),
        fz = -Math.sin(sim.yaw),
        hl = CAR.wheelbase / 2,
        hw = 0.8,
        up = g + 1
      const f = groundHeight(x + fx * hl, z + fz * hl, up),
        b = groundHeight(x - fx * hl, z - fz * hl, up),
        rt = groundHeight(x - fz * hw, z + fx * hw, up),
        lt = groundHeight(x + fz * hw, z - fx * hw, up)
      p = Math.atan2(f - b, 2 * hl)
      r = Math.atan2(lt - rt, 2 * hw)
      dy = g - y
    }
  }
  const k = 1 - Math.exp(-dt * EASE)
  S.p += (p - S.p) * k
  S.r += (r - S.r) * k
  S.dy += (dy - S.dy) * k
  if (Math.abs(S.p) + Math.abs(S.r) + Math.abs(S.dy) < 1e-4) return
  car.position.y += S.dy
  car.quaternion.multiply(_q.setFromAxisAngle(AX_Z, S.p))
  car.quaternion.multiply(_q.setFromAxisAngle(AX_X, S.r))
}
