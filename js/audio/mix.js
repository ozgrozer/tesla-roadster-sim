// What the sound engine hears each frame, from where the camera is: the Roadster's drive state, how
// loud and how far left or right things are, the moving cars nearest the camera, with doppler, the
// walls either side and how near the sea is; and the one-shots the street makes: posts, trees and
// cars rushing past the Roadster close by, and buses' air brakes as they pull up.
import * as THREE from 'three'
import { camera } from '../render/scene.js'
import { clamp } from '../sim/constants.js'
import { OUTER, query, raycast } from '../sim/city.js'

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
      big: c.big,
      ev: !c.big && (c.paint * 3.7) % 1 < 0.3 // about a third of the cars are electric
    })
  }
  return _cars.sort((a, b) => a.d - b.d)
}

// the nearest wall to the camera's left and right (m), along the line across its view
const RANGE = 70
const WALLS = { left: Infinity, right: Infinity }
function walls () {
  _right.setFromMatrixColumn(camera.matrixWorld, 0)
  const p = camera.position,
    l = Math.hypot(_right.x, _right.z) || 1
  for (const side of [-1, 1]) {
    const x = p.x + ((side * _right.x) / l) * RANGE,
      z = p.z + ((side * _right.z) / l) * RANGE
    const t = raycast(p.x, p.y, p.z, x, p.y, z)
    WALLS[side < 0 ? 'left' : 'right'] = t < 1 ? t * RANGE : Infinity
  }
  return WALLS
}

// Things the Roadster passes close and fast: the moment each one is abeam (it stops closing and
// starts drawing away), a rush of air from its side. last: each thing's closing rate last frame.
const last = new Map(),
  seen = new Set(),
  _near = []
function passBy (sound, sim, traffic) {
  const p = sim.mode === 'ground' ? sim.pos : sim.com,
    v = sim.vel
  seen.clear()
  const check = (key, x, z, vx, vz, reach, big) => {
    const rx = x - p.x,
      rz = z - p.z,
      wx = vx - v.x,
      wz = vz - v.z
    const closing = rx * wx + rz * wz,
      w = Math.hypot(wx, wz)
    seen.add(key)
    const before = last.get(key)
    last.set(key, closing)
    const d = Math.hypot(rx, rz)
    if (before < 0 && closing >= 0 && w > 10 && d < reach)
      sound.whoosh(w, panOf(x, z), big, d)
  }
  if (p.y < 8)
    for (const c of query(p.x - 8, p.z - 8, p.x + 8, p.z + 8, _near))
      if (c.r && !c.down) check(c, c.x, c.z, 0, 0, 4.5, false)
  if (p.y < 3.5)
    for (const c of traffic.cars) {
      if (Math.abs(c.x - p.x) > 12 || Math.abs(c.z - p.z) > 12) continue
      const vx = c.loose ? c.vx : c.hx * c.v,
        vz = c.loose ? c.vz : c.hz * c.v
      check(c, c.x, c.z, vx, vz, 6, true)
    }
  for (const k of last.keys()) if (!seen.has(k)) last.delete(k)
}
// a bus coming to a stop lets its air brakes go
function busBrakes (sound, traffic) {
  for (const c of traffic.cars) {
    if (!c.big || c.parked) continue
    if (c.sndV > 0.8 && c.v < 0.25) {
      const k = hearing(c.x, c.z)
      if (k > 0.05) sound.airbrake(0.3 * k, panOf(c.x, c.z))
    }
    c.sndV = c.v
  }
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
  const on = city && sound.enabled
  if (on) {
    passBy(sound, sim, traffic)
    busBrakes(sound, traffic)
  }
  const w = on ? walls() : null
  // how shut in by walls the camera is, for the reverb
  const shut = w
    ? (clamp(1 - w.left / 45, 0, 1) + clamp(1 - w.right / 45, 0, 1)) / 2
    : 1
  const was = app.enclosed ?? 1
  app.enclosed = was + (shut - was) * clamp(dt * 2, 0, 1)
  const cp = camera.position,
    shore = OUTER + 3 - Math.max(Math.abs(cp.x), Math.abs(cp.z))
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
    honks: !traffic.quiet, // (not until the Roadster has honked at the gridlock)
    cars: on ? nearCars(traffic, sim) : NONE,
    walls: w,
    enclosed: app.enclosed,
    sea: city ? clamp(1 - shore / 140, 0, 1) : 0,
    surface: sim.mode === 'ground' && city ? sim.surface : null,
    dt,
    t: clock
  })
}
