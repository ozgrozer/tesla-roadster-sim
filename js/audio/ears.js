// How something in the world sounds from where the camera is: how loud, how far left or right,
// whether a building stands in the way, and how dull the distance and the walls make it.
import * as THREE from 'three'
import { camera } from '../render/scene.js'
import { clamp } from '../sim/constants.js'
import { query, raycast } from '../sim/city.js'

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
// the first building the segment a -> b hits, as a share of its length (1: clear)
const _rays = []
export const ray = (ax, ay, az, bx, by, bz) =>
  raycast(
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    query(
      Math.min(ax, bx),
      Math.min(az, bz),
      Math.max(ax, bx),
      Math.max(az, bz),
      _rays
    )
  )
// whether a building stands between the camera and (x, z), 0 or 1
export function blocked (x, z, y = 1.2) {
  const p = camera.position
  return ray(p.x, Math.max(1, p.y), p.z, x, y, z) < 0.98 ? 1 : 0
}
// how dull something at (x, z) sounds (a lowpass, Hz): the air over the distance, and a building
// in the way
export function dullness (x, z) {
  const d = Math.hypot(camera.position.x - x, camera.position.z - z)
  return (
    clamp(20000 * Math.exp(-d / 90), 2000, 20000) * (blocked(x, z) ? 0.12 : 1)
  )
}

// something heard at (x, z): how loud, which side, how dull (one object, reused)
const AT = { k: 0, pan: 0, lp: 20000 }
export function placeOf (x, z) {
  AT.k = hearing(x, z)
  AT.pan = panOf(x, z)
  AT.lp = dullness(x, z)
  return AT
}
