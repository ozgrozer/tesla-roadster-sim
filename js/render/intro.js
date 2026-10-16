// The city's opening scene: Optimus walks up to the parked Roadster from behind (the camera low at
// its heels, like the reveal's photo), the driver's door swings up, it ducks in and sits down, takes
// the yoke, and the door comes down. Any drive key skips it. While it runs it owns the camera; when
// it ends the follow camera eases in from wherever it left off.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { poseOptimus, HIP_STAND, HIP_SIT } from './optimus.js'

const T = {
  walk: 4.4, // reaches the door
  doorUp: [3.1, 4.3],
  sit: [4.5, 5.8],
  hands: [5.6, 6.3],
  doorDown: [6.4, 7.4],
  end: 7.6
}
const FROM = [-6.4, -2.05] // car-frame x, z where it starts walking
const DOORSIDE = [0.02, -1.42] // where it stands to get in
const SEAT = [-0.33, -0.36]
const STRIDE = 1.45 // m per step pair, and its pace
const SPEED = (DOORSIDE[0] - FROM[0]) / T.walk

const ease = t => t * t * (3 - 2 * t)
const span = (t, [a, b]) => ease(clamp((t - a) / (b - a), 0, 1))
const _p = new THREE.Vector3(),
  _l = new THREE.Vector3()

export class Intro {
  constructor (RS, rig) {
    this.RS = RS
    this.rig = rig
    this.active = false
    this.t = 0
    this.onDone = null
  }
  start (onDone) {
    this.active = true
    this.t = 0
    this.onDone = onDone
    this.RS.seated = false
    this.apply()
  }
  // jump to the end: seated, door shut (quiet: without the follow-on hints)
  finish (quiet = false) {
    if (!this.active) return
    if (quiet) this.onDone = null
    this.t = T.end
    this.apply()
  }
  // where Optimus is, for traffic to stop for
  where (out) {
    return this.RS.body.localToWorld(out.copy(this.RS.optimus.root.position))
  }
  update (dt) {
    if (!this.active) return
    this.t += dt
    this.apply()
  }
  apply () {
    const t = this.t,
      RS = this.RS,
      O = RS.optimus
    const walking = clamp(t / T.walk, 0, 1)
    const sit = span(t, T.sit)
    const x = FROM[0] + (DOORSIDE[0] - FROM[0]) * walking,
      z = FROM[1] + (DOORSIDE[1] - FROM[1]) * walking
    // into the seat: sideways and down, ducking under the door frame on the way
    O.root.position.set(
      x + (SEAT[0] - x) * sit,
      HIP_STAND + (HIP_SIT - HIP_STAND) * sit,
      z + (SEAT[1] - z) * sit
    )
    O.root.rotation.set(0, 0, 0)
    const stride = t < T.walk ? 1 : clamp(1 - (t - T.walk) / 0.3, 0, 1)
    poseOptimus(O, {
      walk: stride * (1 - sit),
      phase: (Math.PI * 2 * Math.min(t, T.walk) * SPEED) / STRIDE,
      sit,
      drive: span(t, T.hands),
      duck: Math.sin(Math.PI * sit) * 0.8,
      look: t < T.walk ? 0 : -0.5 * (1 - sit)
    })
    RS.door = span(t, T.doorUp) - span(t, T.doorDown)
    this.camera(t)
    if (t >= T.end) {
      this.active = false
      RS.door = 0
      RS.seated = true
      // the follow camera picks up from here
      this.rig.shot = 'intro'
      this.rig.look.copy(_l)
      this.onDone?.()
    }
  }
  // low at Optimus's heels as it walks up, then out to the side of the door to watch it get in
  camera (t) {
    const RS = this.RS,
      cam = this.rig.camera,
      car = RS.car
    car.updateMatrixWorld()
    const O = RS.optimus.root.position
    const a = [O.x - 3.1, 0.7, O.z - 1.45],
      aim = [0.4, 0.65, -0.2]
    const b = [2.9, 1.45, -5.4],
      bAim = [-0.35, 0.78, -0.55]
    const k = span(t, [3.6, 5.0])
    _p.set(...a.map((v, i) => v + (b[i] - v) * k))
    _l.set(...aim.map((v, i) => v + (bAim[i] - v) * k))
    car.localToWorld(_p)
    car.localToWorld(_l)
    cam.position.copy(_p)
    cam.fov = 44 - 6 * k
    cam.updateProjectionMatrix()
    cam.up.set(0, 1, 0)
    cam.lookAt(_l)
  }
}
