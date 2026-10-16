// The city view: builds the city's meshes the first time it is visited (so the test site loads as
// fast as ever), shows it in place of the test site, and keeps the traffic, signals, sky, sea and
// antenna beacons moving, and the city's long shadows up to date (sunShadow.js).
import * as THREE from 'three'
import { buildSea } from './citySea.js'
import { Sky, SUN } from './citySky.js'
import { scene, site, renderer } from './scene.js'
import { CityShadow } from './sunShadow.js'
import { raycast, BUILDINGS, OUTER } from '../sim/city.js'
import { TrafficView } from './traffic.js'
import { buildProps } from './cityProps.js'
import { buildGround } from './cityGround.js'
import { buildStreet } from './cityStreet.js'
import { buildBuildings, BEACON } from './cityBuildings.js'

export class CityView {
  constructor () {
    this.group = null
    this.on = false
    this.onLand = null
  }
  build () {
    const g = new THREE.Group()
    this.sky = new Sky(g)
    buildGround(g)
    buildStreet(g)
    this.sea = buildSea(g)
    buildBuildings(g)
    const props = buildProps(g)
    const top = Math.max(...BUILDINGS.map(b => b.h)) + 30 // (and the masts on top)
    this.shadow = new CityShadow(scene, renderer, SUN, OUTER, top)
    this.signals = props.signals
    this.fallers = props.fallers
    for (const f of Object.values(this.fallers))
      f.onLand = (x, z, faller) => {
        this.shadow.refresh()
        this.onLand?.(x, z, faller.kind)
      }
    this.falling = false
    this.cars = new TrafficView(g)
    g.visible = false
    scene.add(g)
    this.group = g
  }
  show (on) {
    if (on && !this.group) this.build()
    this.on = on
    if (this.group) this.group.visible = on
    site.visible = !on
    this.sky?.apply(on)
    this.shadow?.refresh() // (empty while the test site is shown)
  }
  // a street light, signal, tree or palm knocked down (the sim's 'knock' event), and all of them back
  // up when the city resets. onLand(x, z, kind): one of them has just hit the ground at (x, z).
  knock (e) {
    this.fallers?.[e.kind]?.knock(e)
  }
  standUp () {
    for (const f of Object.values(this.fallers || {})) f.standUp()
    this.shadow?.refresh()
  }
  // before the frame is drawn: the city's shadow map, if it is due (with the cars and hide, the
  // Roadster, left out of it)
  shadows (camera, hide) {
    this.shadow?.update(camera, [...this.cars.meshes, ...hide])
  }
  update (dt, clock, traffic, camera) {
    if (!this.on) return
    this.sky.follow(camera)
    this.sea(clock, camera)
    let falling = false
    for (const f of Object.values(this.fallers)) {
      f.update(dt)
      falling = falling || f.moving.length > 0
    }
    // once whatever was knocked down has come to rest, its shadow is drawn where it lies
    if (this.falling && !falling) this.shadow.refresh()
    this.falling = falling
    this.signals.update(traffic.t)
    this.cars.update(traffic, dt)
    const b = Math.sin(clock * 2.2) > 0.4 ? 1 : 0.08
    BEACON.color.setRGB(5 * b, 0.2 * b, 0.12 * b)
  }
}

// Pull a camera in front of any building between it and what it looks at.
export function clipCamera (aim, pos) {
  const t = raycast(aim.x, aim.y, aim.z, pos.x, pos.y, pos.z)
  if (t < 1)
    pos.lerpVectors(aim, pos, Math.max(0.05, t - 0.4 / aim.distanceTo(pos)))
}
