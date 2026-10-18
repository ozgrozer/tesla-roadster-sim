// Spray off a wet road (ENV.wet, sim/env.js): each of the Roadster's tyres throws up a fine mist on
// a wet road, more the faster it turns, and a sheet of water through a puddle (wet.js's puddleAt,
// the same water the road's shader draws); and the traffic near the camera throws it up behind
// it. All of it is smoke.js's, a kind of its own: light, quick, hanging a moment in the air.
import * as THREE from 'three'
import { ENV } from '../sim/env.js'
import { TYPES } from '../sim/traffic.js'
import { puddleAt } from './wet.js'
import { smoke, DUST } from './smoke.js'

// spray off a wet road: a fine mist thrown up and back off the tyres, hanging for a moment
const SPRAY = {
  ...DUST,
  col: [0.8, 0.82, 0.85],
  life: [0.5, 1.3],
  s0: 0.3,
  s1: [1.4, 3],
  alpha: 0.2,
  drag: 2.6,
  buoy: -0.25,
  tau: 1,
  turb: 0.9,
  spread: 0.7
}
// How much water the Roadster's tyres are going through this frame (0 to 1, by the puddles' depth
// and the speed), for the splash's sound (audio/rain.js)
export const WATER = { splash: 0 }

const _tw = new THREE.Vector3()
// Off the Roadster's tyres this step (roll, spun: how fast the fronts and the rears turn, m/s);
// returns how wet the road under it is (0 to 1: on a roof, off the city's ground, none)
export function emitSpray (RS, sim, dt, roll, spun) {
  const wet = sim.world === 'city' && sim.floor === 0 ? ENV.wet : 0
  if (wet > 0.05 && sim.surface !== 'sand')
    RS.wheels.forEach(w => {
      const speed = w.front ? roll : spun
      if (speed < 4) return
      w.pivot.getWorldPosition(_tw)
      const pud = Math.min(1, puddleAt(_tw.x, _tw.z, ENV.pool) * 8)
      if (pud > 0)
        WATER.splash = Math.max(WATER.splash, pud * Math.min(1, speed / 15))
      w.spray =
        (w.spray || 0) +
        (26 * wet + 120 * pud) * Math.min(1.5, (speed - 4) / 18) * dt
      while (w.spray >= 1) {
        w.spray -= 1
        w.pivot.getWorldPosition(_tw)
        smoke.spawn(
          SPRAY,
          _tw.x + (Math.random() - 0.5) * 0.3,
          sim.pos.y + 0.12,
          _tw.z + (Math.random() - 0.5) * 0.3,
          sim.vel.x * 0.45 + (Math.random() - 0.5) * (1.5 + 3 * pud),
          0.6 + Math.random() * (1.4 + 3 * pud),
          sim.vel.z * 0.45 + (Math.random() - 0.5) * (1.5 + 3 * pud),
          sim.pos.y,
          0.6 + 0.5 * Math.min(1, speed / 25) + 0.5 * pud
        )
      }
    })
  return wet
}

// Spray behind the traffic near the camera on a wet road: off the back of each moving car within
// SPRAY_R m (the near ones, so the far ones don't fill the smoke's pool). (How much each car has
// built up is kept here, not on the car: the drivers' cars keep one shape: sim/traffic.js warm.)
const SPRAY_R = 45
const owed = new WeakMap()
export function emitTrafficSpray (traffic, camera, dt) {
  const wet = ENV.wet
  if (dt <= 0 || wet < 0.05) return
  const cp = camera.position
  for (const c of traffic.cars) {
    if (c.parked || c.loose) continue
    const v = c.v || 0
    if (v < 5) continue
    const dx = c.x - cp.x,
      dz = c.z - cp.z
    if (dx * dx + dz * dz > SPRAY_R * SPRAY_R) continue
    let n = (owed.get(c) || 0) + 22 * wet * Math.min(1.3, (v - 5) / 12) * dt
    const back = (TYPES[c.type]?.len || 4.6) * 0.4
    for (; n >= 1; n--) {
      const side = Math.random() < 0.5 ? -0.8 : 0.8
      smoke.spawn(
        SPRAY,
        c.x - c.hx * back - c.hz * side,
        0.14,
        c.z - c.hz * back + c.hx * side,
        c.hx * v * 0.45 + (Math.random() - 0.5) * 1.2,
        0.5 + Math.random() * 1.2,
        c.hz * v * 0.45 + (Math.random() - 0.5) * 1.2,
        0,
        0.55 + 0.4 * Math.min(1, v / 15)
      )
    }
    owed.set(c, n)
  }
}
