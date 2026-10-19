// The camera's side of the cars the player drives that aren't the Roadster (camera.js, follow.js):
// how big the car is, so the follow arm sits back and up far enough to see over a van or a bus
// (armScale, armRise), the Hood camera (the Cockpit's place in V's cycle for a car without a
// cabin to sit in: just over the bonnet at the foot of the windscreen, or at the windscreen of a
// cab-forward van, bus or truck, riding the body's pitch and roll), and the walls' clip eased back
// out rather than snapping (smoothClip: in at once, out over a moment, as the traffic's is).
import * as THREE from 'three'
import { TYPES } from '../sim/carTypes.js'
import { clamp } from '../sim/constants.js'

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
// The eye, in the car's frame from its middle on the road (x forward, y up), from its shape
// (carBody.js: ws, the windscreen's foot, and top(x), the centre line's height over the top): just over the
// bonnet ahead of the windscreen; on a cab-forward van, bus or truck, at the windscreen, at the
// driver's height. Kept per shape.
const EYES = new WeakMap()
function eyeOf (S) {
  let e = EYES.get(S)
  if (e) return e
  // (S.top: the centre line's height at x, carBody.js; S.L: half the length)
  const y = S.top(S.ws),
    nose = S.L ?? 2.3
  let roof = 0
  for (let x = -nose; x <= nose; x += 0.25) roof = Math.max(roof, S.top(x))
  const cab = nose - S.ws < 0.9
  e = cab ? [S.ws - 0.5, Math.max(y + 0.4, 0.6 * roof)] : [S.ws + 0.12, y + 0.3]
  EYES.set(S, e)
  return e
}
const _e = new THREE.Euler(0, 0, 0, 'YXZ'),
  _q = new THREE.Quaternion(),
  _f = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _r = new THREE.Vector3(),
  _t = new THREE.Vector3()

// how far out the follow arm sits for a car of type t (a traffic type index; null: the Roadster)
export function armScale (t) {
  const T = TYPES[t]
  return T ? clamp(0.55 + T.len / 8.5, 1, 2.1) : 1
}
// and how much higher it rides over a tall one (m)
export function armRise (t) {
  const T = TYPES[t]
  return T ? Math.max(0, T.hgt - 1.35) * 0.85 : 0
}

// The Hood camera for the traffic car the player drives (car: drawn pose, x z yaw pitch roll lift
// steer; S: its shape, traffic.js types[].S): rig.pos, rig.aim and rig.camUp set; returns the field
// of view
export function hoodSeat (rig, dt, car, S) {
  const E = eyeOf(S),
    f = rig.f
  f.idle += dt
  if (f.idle > 1.5 && !rig.drag) {
    const k = lerpK(2, dt)
    f.yawOff -= f.yawOff * k
    f.pitchOff -= f.pitchOff * k
  }
  _e.set(car.roll || 0, car.yaw, car.pitch || 0)
  _q.setFromEuler(_e)
  _f.set(1, 0, 0).applyQuaternion(_q)
  _u.set(0, 1, 0).applyQuaternion(_q)
  _t.set(E[0], E[1] + (car.lift || 0), 0).applyQuaternion(_q)
  rig.pos.set(car.x + _t.x, _t.y, car.z + _t.z)
  rig.camUp.copy(_u)
  // looking along the car a touch down at the road, into the turn, turned with the mouse; looking
  // back, straight back over the roof
  const back = rig.behind
  const yaw = f.yawOff + (car.steer || 0) * 0.4 + (back ? Math.PI : 0),
    pitch = (back ? -0.04 : -0.07) - f.pitchOff * 0.6
  _t.copy(_f).applyAxisAngle(_u, yaw)
  _r.crossVectors(_t, _u).normalize()
  _t.applyAxisAngle(_r, pitch)
  if (back) rig.pos.addScaledVector(_u, 0.6)
  rig.aim.copy(rig.pos).addScaledVector(_t, 10)
  return 70
}

// The city's clip (render/city.js clipCamera) pulls the camera in front of a wall at once; let back
// out it eases over a moment, so a lamp post or a corner flicking past doesn't jerk the picture.
// rig.wallReach: how far from the aim the walls let it be, eased (Infinity: nothing in the way)
const _was = new THREE.Vector3()
export function smoothClip (rig, clip, aim, pos, dt) {
  _was.copy(pos)
  clip(aim, pos)
  const full = _was.distanceTo(aim)
  if (full < 0.3) return
  const got = pos.distanceTo(aim)
  if (got < (rig.wallReach ?? Infinity) - 1e-3) rig.wallReach = got
  else if (rig.wallReach < full) rig.wallReach += (got - rig.wallReach) * lerpK(2.2, dt)
  if (!(rig.wallReach < full - 0.01)) rig.wallReach = Infinity
  else pos.lerpVectors(aim, _was, rig.wallReach / full)
}
