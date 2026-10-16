// The city view: builds the city's meshes the first time it is visited (so the test site loads as
// fast as ever), shows it in place of the test site, and keeps the traffic, signals, sky and
// antenna beacons moving.
import * as THREE from 'three'
import { Sky } from './citySky.js'
import { scene, site } from './scene.js'
import { raycast } from '../sim/city.js'
import { TrafficView } from './traffic.js'
import { buildProps } from './cityProps.js'
import { buildGround } from './cityGround.js'
import { buildBuildings, BEACON } from './cityBuildings.js'

export class CityView {
  constructor () {
    this.group = null
    this.on = false
  }
  build () {
    const g = new THREE.Group()
    this.sky = new Sky(g)
    buildGround(g)
    buildBuildings(g)
    this.signals = buildProps(g)
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
  }
  update (dt, clock, traffic, camera) {
    if (!this.on) return
    this.sky.follow(camera)
    this.signals.update(traffic.t)
    this.cars.update(traffic)
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
