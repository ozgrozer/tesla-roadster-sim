// A car's turn on the road (yaw about y) and its lie on a slope (gp, its nose up the slope, about
// its z; gr, its right side down, about its x): into quaternion q, field by field (no allocation).
// For the traffic and the cars the player drives up a ramp, the freeway or the hill road
// (hwDrive.js, drivable.js).
import * as THREE from 'three'

const _z = new THREE.Quaternion(),
  _x = new THREE.Quaternion()

export function slopeTo (q, yaw, gp = 0, gr = 0) {
  q._x = q._z = 0
  q._y = Math.sin(yaw / 2)
  q._w = Math.cos(yaw / 2)
  if (!gp && !gr) return q
  _z._x = _z._y = 0
  _z._z = Math.sin(gp / 2)
  _z._w = Math.cos(gp / 2)
  _x._y = _x._z = 0
  _x._x = Math.sin(gr / 2)
  _x._w = Math.cos(gr / 2)
  return q.multiply(_z).multiply(_x)
}
