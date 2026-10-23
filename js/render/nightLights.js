// Real lights at night where the camera is (the pooled lights after mrdoob/slop-newyork's
// js/street-lights.js, MIT, (c) 2026 Mr.doob): a fixed handful of point lights, never more or fewer
// (so no shader is compiled again at dusk), handed each few frames to the street lights and lit
// shops nearest the point a little ahead of the camera, faded out of one and into the next so none
// pops. The street lights' pools on the ground are worked out in its shaders (lampLight.js), so the
// first LAMP_POOL lights (the street lights') are skipped there and light only what the ground's
// shaders don't (walls, poles, trees, the props); the shops' light falls on everything near them,
// the cars and the people going by included. By day they are hidden, not just put out (a hidden
// light costs the shaders nothing; warm.js compiles both), and the graphics quality keeps fewer
// of them (render/quality.js: setCount).
import * as THREE from 'three'
import { LAMPS } from '../sim/city.js'
import { LAMP_POOL, lampUp } from './lampLight.js'
import { SHOP_SPOTS } from './shopfronts.js'

const SHOPS = 4 // lights for the shops (after the LAMP_POOL for the street lights)
const LAMP = { colour: 0xffc785, power: 220, reach: 30 } // (as lampLight.js's, nine metres up)
const SHOP = { colour: 0xffd9a8, power: 7, reach: 11 }
const _f = new THREE.Vector3()

export class NightLights {
  constructor (scene) {
    this.lights = []
    for (let i = 0; i < LAMP_POOL + SHOPS; i++) {
      const k = i < LAMP_POOL ? LAMP : SHOP
      const l = new THREE.PointLight(k.colour, 0, k.reach, 2)
      l.userData = { spot: -1, next: -1, level: 0, power: k.power }
      l.visible = false
      scene.add(l)
      this.lights.push(l)
    }
    this.t = 0
    this.lit = false // shown (at night)
    this.nLamp = LAMP_POOL // how many of each the quality keeps
    this.nShop = SHOPS
  }

  // how many street lights' and shops' lights are kept (the rest hidden)
  setCount (lamps, shops) {
    this.nLamp = Math.max(0, Math.min(LAMP_POOL, lamps))
    this.nShop = Math.max(0, Math.min(SHOPS, shops))
    this.out()
    this.show(this.lit)
  }

  // the kept lights shown (on) or hidden
  show (on) {
    this.lights.forEach((l, i) => {
      l.visible = on && (i < LAMP_POOL ? i < this.nLamp : i - LAMP_POOL < this.nShop)
    })
  }

  // every light put out and taken off its spot
  out () {
    for (const l of this.lights) {
      l.intensity = 0
      Object.assign(l.userData, { level: 0, spot: -1, next: -1 })
    }
  }

  // the n spots nearest (x, z) that are lit (ok), as indices
  static nearest (spots, x, z, n, ok) {
    const best = []
    if (n <= 0) return best
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i],
        d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d > 4900 || (best.length === n && d >= best[n - 1][0]) || !ok(i)) continue
      best.push([d, i])
      best.sort((a, b) => a[0] - b[0])
      if (best.length > n) best.pop()
    }
    return best.map(b => b[1])
  }

  // camera: where it looks from; dark: the city's dark (0 by day, 1 at night); on: in the city
  update (dt, camera, dark, on) {
    const ls = this.lights
    if (!on || dark < 0.02) {
      if (this.lit) this.show((this.lit = false))
      this.out()
      return
    }
    if (!this.lit) this.show((this.lit = true))
    this.t -= dt
    if (this.t <= 0) {
      this.t = 0.2
      camera.getWorldDirection(_f)
      const len = Math.hypot(_f.x, _f.z) || 1,
        x = camera.position.x + (_f.x / len) * 10,
        z = camera.position.z + (_f.z / len) * 10
      const nl = this.nLamp,
        ns = this.nShop
      this.assign(ls.slice(0, nl), NightLights.nearest(LAMPS, x, z, nl, lampUp))
      this.assign(
        ls.slice(LAMP_POOL, LAMP_POOL + ns),
        NightLights.nearest(SHOP_SPOTS, x, z, ns, () => true)
      )
    }
    for (let i = 0; i < ls.length; i++) {
      const u = ls[i].userData,
        want = u.next === u.spot && u.spot >= 0 ? 1 : 0
      u.level += Math.max(-dt * 4, Math.min(dt * 2, want - u.level))
      if (u.level <= 0 && u.next !== u.spot) this.place(ls[i], i < LAMP_POOL, u.next)
      ls[i].intensity = u.level * u.power * dark
    }
  }

  // each light kept on its spot if that is still wanted, the others given the spots left over
  assign (ls, want) {
    const left = want.filter(s => !ls.some(l => l.userData.spot === s))
    for (const l of ls) {
      const u = l.userData
      u.next = want.includes(u.spot) ? u.spot : left.shift() ?? -1
    }
  }

  place (l, lamp, i) {
    const u = l.userData
    u.spot = i
    if (i < 0) return
    if (lamp) {
      const s = LAMPS[i],
        reach = s.wood ? 2.07 : 2.39
      l.position.set(s.x + s.ax * reach, s.wood ? 7.9 : 8.7, s.z + s.az * reach)
    } else {
      const s = SHOP_SPOTS[i]
      l.position.set(s.x, s.y, s.z)
    }
  }
}
