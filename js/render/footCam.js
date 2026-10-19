// The camera on foot: GTA's third-person orbit over the player's shoulder. The mouse (the pointer
// locked to the picture: a click) or a gamepad's right stick swings it round and up and down; the
// wheel brings it in or lets it out. It follows the player smoothly, keeps out of buildings
// (clip: render/city.js clipCamera) and, taking over from the car's camera, eases from wherever that
// left it rather than cutting.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'

const HEAD = 1.55 // m: what it looks at, over the feet
const BLEND = 0.9 // s easing over from the previous camera
const _f = new THREE.Vector3()
const lerpK = (k, dt) => 1 - Math.exp(-k * dt)

export class FootCam {
  constructor (camera, clip = null) {
    this.camera = camera
    this.clip = clip
    this.yaw = 0 // looking along (cos yaw, -sin yaw), as the player's heading
    this.pitch = 0.22 // up over the player (rad)
    this.dist = 4.2
    this.target = new THREE.Vector3()
    this.look = new THREE.Vector3()
    this.pos = new THREE.Vector3()
    this.from = new THREE.Vector3()
    this.fromLook = new THREE.Vector3()
    this.blend = 1
    this.init = false
    this.idle = 0
  }
  // a mouse's movement (px) or a stick's (scaled the same)
  turn (dx, dy) {
    this.yaw -= dx * 0.0026
    this.pitch = clamp(this.pitch + dy * 0.0022, -0.45, 1.15)
    this.idle = 0
  }
  zoom (out) {
    this.dist = clamp(this.dist * (out ? 1.1 : 0.9), 2.2, 9)
  }
  // take over from wherever the camera is now, turned the way it faces
  begin (focus) {
    const cam = this.camera
    cam.getWorldDirection(_f)
    if (Math.hypot(_f.x, _f.z) > 0.1) this.yaw = Math.atan2(-_f.z, _f.x)
    this.pitch = clamp(-Math.asin(clamp(_f.y, -1, 1)) + 0.05, -0.2, 0.8)
    this.from.copy(cam.position)
    this.fromLook.copy(cam.position).addScaledVector(_f, 6)
    this.target.set(focus.x, focus.y + HEAD, focus.z)
    this.blend = 0
    this.init = true
  }
  // each frame: focus the player's feet ({ x, y, z }), heading theirs (it drifts round behind
  // them as they walk, once the mouse has been left alone a while)
  update (dt, focus, heading = null, moving = false) {
    const cam = this.camera
    if (!this.init) {
      this.target.set(focus.x, focus.y + HEAD, focus.z)
      if (heading !== null) this.yaw = heading
      this.init = true
    }
    this.idle += dt
    if (moving && heading !== null && this.idle > 2.5) {
      let d = heading - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.yaw += d * lerpK(0.6, dt)
    }
    const t = this.target
    t.x += (focus.x - t.x) * lerpK(14, dt)
    t.z += (focus.z - t.z) * lerpK(14, dt)
    t.y += (focus.y + HEAD - t.y) * lerpK(8, dt)
    const c = Math.cos(this.pitch)
    this.pos.set(
      t.x - Math.cos(this.yaw) * c * this.dist,
      t.y + Math.sin(this.pitch) * this.dist,
      t.z + Math.sin(this.yaw) * c * this.dist
    )
    // (over the right shoulder a little, as GTA's)
    const sx = Math.sin(this.yaw) * 0.35,
      sz = Math.cos(this.yaw) * 0.35
    this.look.set(t.x + sx, t.y, t.z + sz)
    this.pos.x += sx
    this.pos.z += sz
    if (this.pos.y < focus.y + 0.3) this.pos.y = focus.y + 0.3
    if (this.clip) this.clip(this.look, this.pos)
    this.blend = Math.min(1, this.blend + dt / BLEND)
    const e = this.blend * this.blend * (3 - 2 * this.blend)
    cam.position.lerpVectors(this.from, this.pos, e)
    _f.lerpVectors(this.fromLook, this.look, e)
    cam.up.set(0, 1, 0)
    cam.fov += (55 - cam.fov) * lerpK(4, dt)
    cam.updateProjectionMatrix()
    cam.lookAt(_f)
  }
}
