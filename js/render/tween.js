// Drawing between physics steps. The sim runs at a fixed 120 Hz and the screen at whatever rate it
// likes (60, 120, 144 Hz, never quite even), so a frame lands part of the way through a step. Drawn
// as the last step left it, the car (and the traffic, and the camera chasing the car) moves on by 0,
// 1 or 2 steps from one frame to the next: a judder that reads as shaking, worst at speed and in the
// air. So for each frame the sim is put that fraction of the way from the step before to the last
// one, drawn, and put back exactly as it was before the next step.
import * as THREE from 'three'
import { wrapPi } from '../sim/constants.js'

const FAR = 25 // m², a jump further than this in one step is a reset: no blending across it

export class Tween {
  constructor (sim, traffic) {
    this.sim = sim
    this.traffic = traffic
    this.prev = {
      pos: new THREE.Vector3(),
      com: new THREE.Vector3(),
      quat: new THREE.Quaternion()
    }
    this.cur = {
      pos: new THREE.Vector3(),
      com: new THREE.Vector3(),
      quat: new THREE.Quaternion()
    }
    this.on = false
    this.cars = false
  }
  // just before each physics step: where everything is now
  before (city) {
    const s = this.sim,
      p = this.prev
    p.pos.copy(s.pos)
    p.com.copy(s.com)
    p.quat.copy(s.quat)
    if (city)
      for (const c of this.traffic.cars) {
        c.px = c.x
        c.pz = c.z
        c.pyaw = c.yaw
        c.podo = c.odo
      }
  }
  // for drawing: alpha of the way from the step before to the last one
  apply (alpha, city) {
    const s = this.sim,
      p = this.prev,
      q = this.cur
    q.pos.copy(s.pos)
    q.com.copy(s.com)
    q.quat.copy(s.quat)
    if (p.pos.distanceToSquared(q.pos) > FAR) return
    this.on = true
    s.pos.lerpVectors(p.pos, q.pos, alpha)
    s.com.lerpVectors(p.com, q.com, alpha)
    s.quat.slerpQuaternions(p.quat, q.quat, alpha)
    this.cars = city
    if (city)
      for (const c of this.traffic.cars) {
        c.cx = c.x
        c.cz = c.z
        c.cyaw = c.yaw
        c.codo = c.odo
        if (c.px === undefined || (c.x - c.px) ** 2 + (c.z - c.pz) ** 2 > FAR)
          continue
        c.x = c.px + (c.x - c.px) * alpha
        c.z = c.pz + (c.z - c.pz) * alpha
        c.yaw = c.pyaw + wrapPi(c.yaw - c.pyaw) * alpha
        c.odo = c.podo + (c.odo - c.podo) * alpha
      }
  }
  // back to exactly where the last step left everything
  restore () {
    if (!this.on) return
    this.on = false
    const s = this.sim,
      q = this.cur
    s.pos.copy(q.pos)
    s.com.copy(q.com)
    s.quat.copy(q.quat)
    if (this.cars)
      for (const c of this.traffic.cars) {
        if (c.cx === undefined) continue
        c.x = c.cx
        c.z = c.cz
        c.yaw = c.cyaw
        c.odo = c.codo
      }
  }
}
