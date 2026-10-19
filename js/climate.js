// The clock and the weather in the city, run once a frame from the main loop (main.js): the clock
// and the weather moving on (sim/env.js), L running the clock on fast to the next time of day and O
// bringing in the next weather, the light following them (render/daylight.js, through the city
// view), the rain round the camera and the street's reflection in the wet (render/rain.js,
// mirror.js), the headlights' beams in the rain and the fog (beams.js), the Roadster's headlights
// coming on with everyone else's and its paint glossier in the wet, the street lights on its body
// at night (lampLight.js), and the graphics quality (the reflection's size, how many drops, the
// frame's pixels), remembered.
import * as THREE from 'three'
import { Rain } from './render/rain.js'
import { hemi, renderer, scene, camera } from './render/scene.js'
import { Beams } from './render/beams.js'
import { Mirror } from './render/mirror.js'
import { lampLit } from './render/lampLight.js'
import { recall, remember } from './ui/prefs.js'
import { OPTS } from './ui/options.js'
import { ENV, stepEnv, setHour, setWeather, WEATHERS } from './sim/env.js'

// L: the times of day the clock runs on to, and the s it takes to run on to the next
const TIMES = [
  [8, 'Morning'],
  [12.5, 'Midday'],
  [17, 'Golden hour'],
  [18.25, 'Sunset'],
  [22, 'Night']
]
const LAPSE_S = 3
// O: the weathers it brings in, in turn (and after the last, the weather as it comes)
const WEATHER_ORDER = ['clear', 'cloudy', 'overcast', 'rain', 'storm', 'fog']
// Graphics quality: high has everything; medium a smaller reflection in the wet, fewer drops and at
// most one and a half pixels to a point; low no reflection, a third of the drops and one pixel to a
// point (and the adaptive resolution steps down from there if it must)
export const QUALITY = {
  high: { mirror: 0.5, rain: 1, px: 2 },
  medium: { mirror: 0.35, rain: 0.65, px: 1.5 },
  low: { mirror: 0, rain: 0.35, px: 1 }
}

export class Climate {
  // app (its world, night and quality), hud (for the hints), RS (the Roadster), the city view (for
  // the light) and the adaptive resolution (for the quality)
  constructor ({ app, hud, RS, cityView, resolution }) {
    Object.assign(this, { app, hud, RS, cityView, camera, resolution })
    this.mirror = new Mirror(renderer, scene, camera) // the street's reflection in the wet
    this.rain = new Rain(scene) // the rain and its splashes
    this.beams = new Beams(RS.body) // the headlights' beams in the rain and the fog
    this.lapse = null // the clock running on fast (L)
    this.paints = null // the Roadster's clear-coated materials (gathered the first time)
    this.paintWet = -1 // how wet its paint was last made to look
    this.light = new THREE.Color()
    this.glow = new THREE.Color()
    // (the Roadster lit by the street lights it passes under at night, as the ground is)
    const lit = new Set()
    RS.car.traverse(o => {
      for (const m of [].concat(o.material || []))
        if (m.isMeshStandardMaterial && !lit.has(m)) lit.add(lampLit(m, true))
    })
    this.quality(recall('quality', 'high'))
  }
  // the graphics quality ('high', 'medium' or 'low'), remembered
  quality (q) {
    const name = QUALITY[q] ? q : 'high',
      s = QUALITY[name],
      r = this.resolution
    this.app.quality = name
    this.mirror.scale = s.mirror
    this.rain.share = s.rain
    // (the player's own resolution, if not Auto: options.js)
    r.max = OPTS.px === 'auto' ? Math.min(window.devicePixelRatio || 1, s.px) : OPTS.px
    r.min = Math.min(r.max, 0.6)
    if (r.ratio > r.max) r.set(r.max, 2)
    remember('quality', name)
  }
  // L: the clock runs on fast (a few seconds) to the next time of day
  skipTime () {
    if (this.app.world !== 'city')
      return this.hud.popup(
        'The clock runs in the city · <b>C</b> to go there',
        1800,
        'hint'
      )
    const h = ENV.hour
    const [to, name] =
      TIMES.find(([t]) => t > h + 0.2) || TIMES.find(([t]) => t + 24 > h + 0.2)
    const ahead = (to - h + 24) % 24
    this.lapse = { left: ahead, rate: ahead / LAPSE_S }
    this.hud.popup(`${name} · <b>L</b> for the next`, 2200, 'hint')
  }
  // O: the next weather (and after the last, the weather changing on its own again)
  nextWeather () {
    const hud = this.hud
    if (this.app.world !== 'city')
      return hud.popup(
        'The weather is in the city · <b>C</b> to go there',
        1800,
        'hint'
      )
    const i = ENV.auto ? -1 : WEATHER_ORDER.indexOf(ENV.weather)
    if (i === WEATHER_ORDER.length - 1) {
      ENV.auto = true
      return hud.popup(
        'Weather: as it comes · <b>O</b> to choose',
        2000,
        'hint'
      )
    }
    const name = WEATHER_ORDER[i + 1]
    ENV.auto = false
    setWeather(name, { quick: true })
    hud.popup(`${WEATHERS[name].name} · <b>O</b> for the next`, 2000, 'hint')
  }
  // Once a frame: dt the real s, world the world's (slow motion slows it), clock the s since the
  // start; city: whether the car is in the city (the clock and the weather only run there)
  update (dt, world, clock, city) {
    const { RS, app, rain, beams } = this
    if (!city) {
      rain.update(0)
      beams.update(false)
      return
    }
    const l = this.lapse
    if (l) {
      const h = Math.min(l.left, l.rate * world)
      l.left -= h
      setHour(ENV.hour + h)
      if (l.left <= 1e-6) this.lapse = null
    }
    stepEnv(world)
    this.wetPaint(ENV.wet)
    app.night = ENV.night > 0.5
    // the Roadster's headlights come on with everyone else's (a little later, a little earlier off)
    const on = RS.headlights.visible
    if (on ? ENV.headlights < 0.35 : ENV.headlights > 0.6)
      RS.headlights.visible = !on
    // the light, from the clock and the weather (render/daylight.js)
    this.cityView.light(dt, clock)
    // the rain round the camera, lit by the sky (and the city's glow at night) and the headlights
    this.light
      .copy(hemi.color)
      .multiplyScalar(hemi.intensity)
      .add(this.glow.setRGB(0.14, 0.11, 0.08).multiplyScalar(ENV.dark))
    rain.update(
      ENV.rain,
      this.camera,
      world,
      ENV,
      this.light,
      RS.headlights.visible ? RS.headlights : null
    )
    beams.update(RS.headlights.visible, Math.max(ENV.rain, ENV.fog), ENV.dark)
  }
  // the clock set to hour h, and a weather brought in (the debugging hook's, for checks)
  setHour (h) {
    setHour(h)
  }
  setWeather (name, opts) {
    ENV.auto = false
    setWeather(name, opts)
  }
  // into the city (w 'city') or out to the test site: the headlights as the hour has them, and the
  // test site dry
  world (w) {
    this.RS.headlights.visible = w === 'city' && ENV.headlights > 0.5
    if (w !== 'city') this.wetPaint(0)
  }
  // just before the frame is drawn: the street's reflection, while it is wet (off the city, and
  // dry, nothing)
  reflect (city) {
    this.mirror.render(city ? ENV.wet : 0)
  }
  // The Roadster's paint glossier in the wet: its clear coat (every material on it that has one)
  // thicker and smoother as the rain soaks it, and back as it dries (the test site is dry: 0)
  wetPaint (wet) {
    if (!this.paints) {
      this.paints = new Set()
      this.RS.car.traverse(o => {
        for (const m of [].concat(o.material || []))
          if (m.clearcoat > 0.3) this.paints.add(m)
      })
    }
    if (Math.abs(wet - this.paintWet) < 0.01) return
    this.paintWet = wet
    for (const m of this.paints) {
      m.clearcoat = 0.35 + 0.55 * wet
      m.clearcoatRoughness = 0.28 - 0.2 * wet
    }
  }
}
