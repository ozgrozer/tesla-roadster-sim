// The interiors' view (render/city.js keeps one): every room built hidden, the one the player is in
// shown; the doors outside; the light inside (the scene's lights turned to the room's for the
// player's figure, the exposure steady, the rain left outside); the windows from the hour; and the
// camera kept inside the room's walls.
import * as THREE from 'three'
import { hemi, key, renderer, scene } from '../scene.js'
import { SITES, POCKET } from '../../sim/interiors/sites.js'
import { INTERIOR } from '../../sim/interiors/state.js'
import { buildRoom, roomMaterials } from './rooms.js'
import { buildDoors } from './doors.js'

const _day = new THREE.Color(1.1, 1.2, 1.35),
  _night = new THREE.Color(0.05, 0.06, 0.1)

export class InteriorView {
  constructor (group) {
    this.mats = roomMaterials()
    this.rooms = new Map()
    for (const s of SITES) {
      const g = buildRoom(s, this.mats)
      group.add(g)
      this.rooms.set(s.id, g)
    }
    this.doors = buildDoors(group)
    this.shown = null
    this.dark = 0
    this.t = 0
    this.rain = null
  }
  show (site) {
    if (this.shown) this.rooms.get(this.shown.id).visible = false
    this.shown = site
    if (site) this.rooms.get(site.id).visible = true
  }
  night (k) {
    this.dark = k
    this.doors.night(k)
    this.mats.pane.color.copy(_day).lerp(_night, k)
  }
  update (dt) {
    this.t += dt
    this.doors.pulse(this.t)
    // (the rain falls round the camera: not in here)
    if (this.shown) {
      if (!this.rain) {
        this.rain = []
        scene.traverse(o => o.material?.uniforms?.uCamV && this.rain.push(o))
      }
      for (const o of this.rain) o.visible = false
    }
  }
  // after the daylight has set the scene's lights for the street: the room's instead, for whoever
  // stands in it (the room itself has its light baked in)
  light () {
    if (!this.shown) return
    hemi.color.setRGB(1, 0.94, 0.85)
    hemi.groundColor.setRGB(0.35, 0.32, 0.3)
    hemi.intensity = 1.6
    key.intensity = 0.35
    key.color.setRGB(1, 0.96, 0.9)
    renderer.toneMappingExposure = 1.0
    scene.environmentIntensity = 0.35
  }
  // the camera between aim (inside) and pos pulled in to stay inside the room's walls
  clip (aim, pos) {
    const s = this.shown || (INTERIOR.site && SITES.find(t => t === INTERIOR.site))
    if (!s) return false
    const b = s.box,
      m = 0.25
    const lo = [b.x0 + m, POCKET + 0.3, b.z0 + m],
      hi = [b.x1 - m, POCKET + s.room.h - 0.2, b.z1 - m]
    const a = [aim.x, aim.y, aim.z],
      p = [pos.x, pos.y, pos.z]
    let t = 1
    for (let i = 0; i < 3; i++) {
      const d = p[i] - a[i]
      if (d > 1e-6 && p[i] > hi[i]) t = Math.min(t, (hi[i] - a[i]) / d)
      else if (d < -1e-6 && p[i] < lo[i]) t = Math.min(t, (lo[i] - a[i]) / d)
    }
    t = Math.max(0, t)
    if (t < 1) pos.lerpVectors(aim, pos, t)
    return true
  }
}
