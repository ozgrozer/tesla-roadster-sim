// Kerb and bump metrics for a drivable body (vehicleHit.js kerbs, bodyGround.js): one driven at v
// m/s onto the pavement at ang rad to the kerb line, and off it again. Peak heave, pitch and roll
// the kerb kicked into the springs, the speed it cost, the yaw it knocked in, how high the body sits
// up on the pavement, and the kerb events told. Used by physKerb.test.mjs; run directly for a table.
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'
import { PITCH, ROAD_HW } from '../js/sim/grid.js'
import { kerbDist } from '../js/sim/street.js'

const H = 1 / 120
export function kerb (kind, v, ang, { down = false } = {}) {
  const kx = PITCH + ROAD_HW // (the kerb line, x: road to its west, pavement east)
  const b = createVehicleBody(kind, { x: 0, z: 0 })
  const yaw = down ? Math.PI + ang : -ang
  const x0 = down ? kx + 2.6 : kx - 4,
    z0 = PITCH * 0.5
  Object.assign(b, { x: x0, z: z0, yaw, hx: Math.cos(yaw), hz: -Math.sin(yaw) })
  b.vx = b.hx * v
  b.vz = b.hz * v
  b.u = v
  const inp = Object.assign(makeVehicleInput(), { throttle: 0.25 })
  const world = { city: true, t: 0 }
  let peak = { heave: 0, pitch: 0, roll: 0, w: 0 },
    kerbs = 0,
    v0 = -1,
    vMin = Infinity,
    yUp = 0,
    tc = null
  for (let t = 0; t < 1.2; t += H) {
    world.t = t
    b.events.length = 0
    stepVehicle(b, inp, H, world)
    kerbs += b.events.filter(e => e.type === 'kerb').length
    if (b.events.some(e => e.type === 'bump' || e.type === 'knock')) break // (a post or a wall beyond)
    const sp = Math.hypot(b.vx, b.vz)
    const crossed = down ? kerbDist(b.x, b.z) > -1 : kerbDist(b.x, b.z) < 1
    if (crossed && t < (tc ??= t) + 0.5) {
      if (v0 < 0) v0 = sp
      vMin = Math.min(vMin, sp)
      peak.heave = Math.max(peak.heave, Math.abs(b.heave))
      peak.pitch = Math.max(peak.pitch, Math.abs(b.pitch))
      peak.roll = Math.max(peak.roll, Math.abs(b.roll))
      peak.w = Math.max(peak.w, Math.abs(b.w))
    }
    if (kerbDist(b.x, b.z) < -1.5) yUp = Math.max(yUp, b.y)
  }
  return { ...peak, loss: v0 > 0 ? v0 - vMin : 0, kerbs, yUp }
}
if (process.argv[1]?.endsWith('physKerb.mjs')) {
  const f = (x, n = 3) => x.toFixed(n)
  console.log('case                  heave  pitch  roll   yaw/s  dv    kerbs yUp')
  for (const [n, k, v, a, o] of [
    ['sedan up 8 square', 'sedan', 8, 0, {}],
    ['sedan up 8 at 30deg', 'sedan', 8, 0.52, {}],
    ['sedan up 15 at 30deg', 'sedan', 15, 0.52, {}],
    ['sports up 12 at 20deg', 'sports', 12, 0.35, {}],
    ['truck up 8 at 30deg', 'truck', 8, 0.52, {}],
    ['sedan down 8 at 30deg', 'sedan', 8, 0.52, { down: true }]
  ]) {
    const r = kerb(k, v, a, o)
    console.log(n.padEnd(21), f(r.heave), f(r.pitch), f(r.roll), f(r.w).padStart(6), f(r.loss, 2), String(r.kerbs).padStart(5), f(r.yUp))
  }
}
