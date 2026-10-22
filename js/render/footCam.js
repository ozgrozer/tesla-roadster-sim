// The camera on foot: GTA's third-person orbit over the player's shoulder. The mouse (the pointer
// locked to the picture: a click) or a gamepad's right stick swings it round and up and down; the
// wheel brings it in or lets it out. It follows the player smoothly, keeps out of buildings
// (clip: render/city.js clipCamera) and, taking over from the car's camera, eases from wherever that
// left it rather than cutting. The walls' clip is a fat ray (the middle and four round it, the
// width of the picture's near corners), so a wall alongside can't slice into the view; it pulls
// the camera in at once and lets it back out over a moment, and the camera never goes under the
// ground (the hills) beneath it.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { groundBase } from '../sim/player.js'

const HEAD = 1.55 // m: what it looks at, over the feet
const BLEND = 0.9 // s easing over from the previous camera
const _f = new THREE.Vector3()
const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
const FAT = 0.28 // m: how far round the middle ray the others run
const OUT_K = 2.5 // per s: how fast the camera eases back out once a wall is out of the way
const _a = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _r = new THREE.Vector3(),
  _u = new THREE.Vector3()
// how far from aim towards pos (a share, 0 to 1) the walls let the camera be: the shortest of
// five rays, clip(a, p) pulling each p in front of the first wall (render/city.js clipCamera)
export function clipShare (clip, aim, pos) {
  const full = aim.distanceTo(pos)
  if (full < 0.3) return 1
  _r.subVectors(pos, aim).normalize()
  _u.set(-_r.z, 0, _r.x).normalize() // (across the view, level)
  let best = 1
  for (let k = 0; k < 5; k++) {
    const sx = k === 1 ? 1 : k === 2 ? -1 : 0,
      sy = k === 3 ? 1 : k === 4 ? -1 : 0
    _a.copy(aim)
    _p.copy(pos)
    _p.addScaledVector(_u, sx * FAT)
    _p.y += sy * FAT * 0.7
    _a.addScaledVector(_u, sx * FAT * 0.3)
    const len = _a.distanceTo(_p)
    clip(_a, _p)
    best = Math.min(best, _a.distanceTo(_p) / len)
  }
  return best
}

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
    this.reach = 1 // the share of the arm the walls let it have, eased back out
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
    if (this.clip) {
      // (in at once, back out over a moment)
      const got = clipShare(this.clip, this.look, this.pos)
      if (got < this.reach) this.reach = got
      else this.reach += (got - this.reach) * lerpK(OUT_K, dt)
      if (this.reach < 0.999) this.pos.lerpVectors(this.look, this.pos, Math.max(0.05, this.reach))
    }
    // (never under the ground: a hill rising behind; not in a room under the city, where the
    // street's ground would lift it out through the ceiling: the room's own clip keeps it in)
    const gy = groundBase(this.pos.x, this.pos.z) + 0.35
    if (this.pos.y < gy && focus.y > gy - 10) this.pos.y = gy
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
