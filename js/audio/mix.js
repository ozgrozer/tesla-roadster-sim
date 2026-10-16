// What the sound engine hears each frame, from where the camera is: the Roadster's drive state, how
// loud and how far left or right things are, and the moving cars nearest the camera, with doppler.
import * as THREE from 'three'
import { camera } from '../render/scene.js'
import { clamp } from '../sim/constants.js'

// how loud something at (x, z) sounds from the camera, 0 to 1
export const hearing = (x, z) =>
  clamp(
    1.4 / (1 + Math.hypot(camera.position.x - x, camera.position.z - z) / 14),
    0,
    1
  )
// where (x, z) sits left to right from the camera, -0.85 to 0.85
const _right = new THREE.Vector3()
export function panOf (x, z) {
  _right.setFromMatrixColumn(camera.matrixWorld, 0)
  const dx = x - camera.position.x,
    dz = z - camera.position.z
  return clamp(
    ((dx * _right.x + dz * _right.z) / (Math.hypot(dx, dz) || 1)) * 0.85,
    -0.85,
    0.85
  )
}
// the moving cars within earshot, nearest first: distance, pan, doppler, speed
const _cars = [],
  NONE = []
function nearCars (traffic, sim) {
  _cars.length = 0
  const cp = camera.position,
    v = sim.vel
  for (const c of traffic.cars) {
    if (c.parked) continue
    const dx = c.x - cp.x,
      dz = c.z - cp.z,
      d = Math.hypot(dx, dz)
    if (d > 45) continue
    const vx = c.loose ? c.vx : c.hx * c.v,
      vz = c.loose ? c.vz : c.hz * c.v
    // how fast it is drawing away along the line between them (the camera rides with the Roadster)
    const vr = ((vx - v.x) * dx + (vz - v.z) * dz) / (d || 1)
    _cars.push({
      d,
      pan: panOf(c.x, c.z),
      doppler: clamp(343 / (343 + vr), 0.8, 1.25),
      v: Math.hypot(vx, vz),
      big: c.big
    })
  }
  return _cars.sort((a, b) => a.d - b.d)
}

export function mixSound (sound, app, traffic, dt, clock) {
  const sim = app.sim
  const gs =
    sim.mode === 'ground'
      ? Math.abs(sim.speed)
      : sim.mode === 'ramp'
      ? Math.abs(sim.v)
      : 0
  app.wheelAudio =
    sim.mode === 'air' || sim.mode === 'crash'
      ? app.wheelAudio * Math.exp(-dt * 0.8)
      : gs
  const city = app.world === 'city'
  sound.update({
    volume:
      0.85 *
      clamp(1.7 / (1 + camera.position.distanceTo(sim.pos) / 16), 0.22, 1),
    pitch: 0.55 + 0.45 * app.timeScale,
    wheelSpeed: app.wheelAudio,
    throttle: app.lastCtl.throttle,
    regen: sim.regenOn,
    grounded: sim.mode === 'ground' || sim.mode === 'ramp' ? 1 : 0,
    airspeed: sim.vel.length(),
    skid: sim.skid,
    main: sim.thrMain,
    lift: sim.thrLift,
    side: sim.thrSide,
    suction: sim.suction,
    city,
    cars: city && sound.enabled ? nearCars(traffic, sim) : NONE,
    dt,
    t: clock
  })
}
