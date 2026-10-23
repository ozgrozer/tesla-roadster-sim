// The city's light through the day and the weather: each frame the clock and the weather (ENV,
// sim/env.js) are turned into the sky's colours (citySky.js), the sun's or the moon's light and
// where it comes from, the sky's light, the fog, the exposure, how dark the shadows are, and how
// far into the evening the city's own lights are (its windows, signs and street lights). The
// colours are worked out from how high the sun is, between keyframes: noon's white sun in a clear
// blue sky over a pale brown haze; the golden hour the city was built in (the sun 14 degrees up,
// as it is at five o'clock, is exactly the look it always had); the sun going down red into a
// pink-violet sky; the blue hour; night under the moon. The weather lays its grey over that: the
// sun and the shadows fade as the cloud closes in, the sky's light grows flat and grey, the fog
// thickens in the rain and the marine layer, and a lightning flash lights everything for an
// instant. The picture is graded to suit (post.js): warm and rich by day, warmer still in the
// golden hour, deep and saturated at night so the lights sing, flatter and cooler under cloud and
// in the rain. The city's shadows are aimed again as the sun moves (a whole city's shadow map is
// under a millisecond to draw), and the reflections' environment map drawn again as the sky
// changes, each only when it has changed enough to see.
import { OPTS, DRAW_FOG, motionFx } from '../ui/options.js'
import * as THREE from 'three'
import { ENV } from '../sim/env.js'
import { SKY } from './citySky.js'
import { GRADE } from './post.js'
import { WET } from './wet.js'
import { CANYON } from './canyon.js'
import { NightLights } from './nightLights.js'
import { WIND } from './treeWind.js'
import { scene, renderer, camera, hemi, key, keyOffset } from './scene.js'

const DEG = 180 / Math.PI
// a light touch of the GTA look over it all (the gameplay workstream): a little more colour and
// punch, and a thin warm haze by day that gives the long avenues their depth; ?look=0 for without
export const LOOK = {
  on: typeof location === 'undefined' || !/[?&]look=0/.test(location.search),
  sat: 1.07,
  contrast: 1.04,
  haze: 0.00014
}
// keyframes by the sun's height (degrees): [height, value...]
const K = (...rows) => rows
const ZENITH = K(
  [-12, 0.004, 0.008, 0.026],
  [-6, 0.015, 0.03, 0.09],
  [-2, 0.04, 0.08, 0.2],
  [0, 0.06, 0.13, 0.32],
  [3, 0.08, 0.18, 0.43],
  [7, 0.09, 0.21, 0.5],
  [14, 0.1, 0.23, 0.55],
  [25, 0.11, 0.27, 0.62],
  [40, 0.12, 0.3, 0.68]
)
const MID = K(
  [-12, 0.008, 0.012, 0.04],
  [-6, 0.03, 0.05, 0.13],
  [-2, 0.1, 0.13, 0.28],
  [0, 0.18, 0.26, 0.5],
  [3, 0.24, 0.38, 0.68],
  [7, 0.28, 0.45, 0.78],
  [14, 0.3, 0.5, 0.82],
  [25, 0.32, 0.54, 0.86],
  [40, 0.34, 0.57, 0.88]
)
const HORIZON = K(
  [-12, 0.02, 0.021, 0.034],
  [-6, 0.12, 0.08, 0.1],
  [-2, 0.45, 0.2, 0.12],
  [0, 0.95, 0.42, 0.16],
  [3, 1.0, 0.55, 0.26],
  [7, 0.98, 0.66, 0.38],
  [14, 0.95, 0.74, 0.48],
  [25, 0.86, 0.8, 0.68],
  [40, 0.76, 0.8, 0.84]
)
const AWAY = K(
  [-12, 0.02, 0.021, 0.034],
  [-6, 0.05, 0.06, 0.12],
  [-2, 0.2, 0.17, 0.28],
  [0, 0.42, 0.34, 0.45],
  [3, 0.52, 0.48, 0.6],
  [7, 0.58, 0.6, 0.72],
  [14, 0.6, 0.66, 0.77],
  [25, 0.62, 0.71, 0.83],
  [40, 0.64, 0.74, 0.87]
)
const HAZE = K(
  [-12, 0.026, 0.024, 0.032],
  [-6, 0.1, 0.07, 0.07],
  [-2, 0.5, 0.25, 0.14],
  [0, 0.95, 0.48, 0.22],
  [3, 1.0, 0.56, 0.28],
  [7, 1.0, 0.62, 0.33],
  [14, 1.0, 0.66, 0.36],
  [25, 0.92, 0.76, 0.56],
  [40, 0.82, 0.78, 0.7]
)
const HAZE_AWAY = K(
  [-12, 0.026, 0.024, 0.032],
  [-6, 0.07, 0.06, 0.08],
  [-2, 0.28, 0.2, 0.22],
  [0, 0.5, 0.36, 0.36],
  [3, 0.62, 0.45, 0.38],
  [7, 0.68, 0.5, 0.39],
  [14, 0.72, 0.52, 0.39],
  [25, 0.74, 0.62, 0.5],
  [40, 0.74, 0.68, 0.6]
)
const GLOW = K(
  [-6, 0, 0, 0],
  [-2, 0.5, 0.18, 0.06],
  [0, 1.0, 0.45, 0.15],
  [7, 1.0, 0.52, 0.2],
  [14, 1.0, 0.55, 0.22],
  [25, 0.9, 0.65, 0.4],
  [40, 0.7, 0.62, 0.5]
)
const FOG = K(
  [-12, 0.026, 0.024, 0.032],
  [-6, 0.07, 0.06, 0.08],
  [-2, 0.3, 0.21, 0.2],
  [0, 0.55, 0.37, 0.3],
  [7, 0.7, 0.5, 0.4],
  [14, 0.76, 0.56, 0.43],
  [25, 0.78, 0.68, 0.58],
  [40, 0.76, 0.74, 0.7]
)
// the sun's light: its colour and strength
const SUN_LIGHT = K(
  [-1, 1.0, 0.3, 0.08, 0],
  [0, 1.0, 0.38, 0.12, 1.2],
  [3, 1.0, 0.52, 0.26, 2.6],
  [7, 1.0, 0.62, 0.36, 3.8],
  [14, 1.0, 0.71, 0.46, 4.6],
  [25, 1.0, 0.83, 0.66, 4.7],
  [40, 1.0, 0.92, 0.82, 4.6]
)
// the sky's light: its colour and strength, and the ground's bounce
const SKY_LIGHT = K(
  [-12, 0.18, 0.22, 0.36, 0.2],
  [-6, 0.25, 0.3, 0.5, 0.3],
  [-2, 0.45, 0.45, 0.65, 0.6],
  [0, 0.6, 0.6, 0.8, 0.65],
  [7, 0.68, 0.72, 0.92, 0.7],
  [14, 0.7, 0.76, 0.94, 0.7],
  [25, 0.72, 0.8, 0.98, 0.75],
  [40, 0.74, 0.82, 1.0, 0.8]
)
const BOUNCE = K(
  [-12, 0.06, 0.05, 0.045],
  [-2, 0.18, 0.14, 0.12],
  [0, 0.26, 0.2, 0.17],
  [14, 0.36, 0.3, 0.26],
  [40, 0.4, 0.37, 0.33]
)
// the exposure, the environment map's strength and the fog's density
const EXPOSURE = K(
  [-12, 0.96, 0.6, 0.0011],
  [-6, 1.06, 0.7, 0.0011],
  [-2, 1.14, 0.65, 0.001],
  [0, 1.12, 0.6, 0.0009],
  [7, 1.06, 0.52, 0.00088],
  [14, 1.05, 0.5, 0.00086],
  [25, 0.98, 0.5, 0.00078],
  [40, 0.93, 0.5, 0.0007]
)

// the grade: saturation, contrast, the shadows' tint and the highlights' (r, g, b each), vignette
const GRADING = K(
  [-12, 1.16, 0.36, -0.01, -0.004, 0.026, 0.0, 0.0, 0.0, 0.32],
  [-4, 1.12, 0.22, -0.012, 0.0, 0.03, 0.02, 0.006, -0.01, 0.3],
  [2, 1.12, 0.2, -0.012, 0.004, 0.022, 0.035, 0.014, -0.016, 0.28],
  [14, 1.1, 0.2, -0.012, 0.004, 0.02, 0.03, 0.012, -0.014, 0.26],
  [30, 1.07, 0.18, -0.008, 0.002, 0.016, 0.018, 0.01, -0.006, 0.24]
)
// the white balance, before the tone mapping (so it moves the exposure's colour, not its blacks):
// cool under the moon, rose in the blue hour, warm through the golden hours, near neutral at noon
// (the looks from mrdoob/slop-newyork js/post-processing.js, MIT, (c) 2026 Mr.doob)
const BALANCE = K(
  [-12, 0.985, 1.0, 1.035],
  [-4, 1.025, 0.995, 1.015],
  [2, 1.045, 1.0, 0.955],
  [14, 1.045, 1.0, 0.955],
  [30, 1.015, 1.0, 0.985]
)
// how damp the streets are in dry weather (wet.js, roadSurface.js): the night's dew and the
// sprinklers' run-off, mostly gone by the middle of the day
const DAMP = K([-12, 0.58], [-6, 0.55], [-2, 0.46], [2, 0.3], [7, 0.2], [14, 0.16], [25, 0.06], [40, 0.03])
const DULL = [0.86, 0.1, -0.006, 0.002, 0.012, 0.0, 0.0, 0.004, 0.28] // under cloud and rain

// the row of values at height a (degrees), between the keyframes either side, into out
function at (rows, a, out) {
  let i = 0
  while (i < rows.length - 1 && rows[i + 1][0] <= a) i++
  const r0 = rows[i],
    r1 = rows[Math.min(i + 1, rows.length - 1)]
  const t =
    r1 === r0 ? 0 : Math.min(1, Math.max(0, (a - r0[0]) / (r1[0] - r0[0])))
  for (let k = 1; k < r0.length; k++) out[k - 1] = r0[k] + (r1[k] - r0[k]) * t
  return out
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const _v = [0, 0, 0, 0],
  _g = [0, 0, 0, 0, 0, 0, 0, 0, 0],
  _c = new THREE.Color(),
  _grey = new THREE.Color(),
  _dir = new THREE.Vector3(),
  _aimed = new THREE.Vector3(),
  _envSun = new THREE.Vector3()
const set = (c, rows, a) => {
  at(rows, a, _v)
  return c.setRGB(_v[0], _v[1], _v[2])
}
// (the keyOffset's length: how far toward the sun the car's shadow light sits)
const KEY_REACH = 77

export class Daylight {
  constructor (city) {
    this.city = city // the CityView: its sky, its shadow, its lights' dark
    this.shadowT = 0
    this.envT = 0
    this.envWas = null // the sky the environment map was last drawn from
    this.darkWas = -1
    this.lit = false // the moon (not the sun) gives the light
    this.lamps = new NightLights(city.group) // (real lights where the camera is, at night)
  }
  // once a frame in the city (dt: real seconds)
  update (dt, clock) {
    const e = ENV,
      city = this.city,
      a = e.sunAlt * DEG
    const o = smooth(0.55, 1, e.clouds), // overcast
      rain = e.rain,
      fog = e.fog
    // ---- the sky's colours
    set(SKY.uZenith.value, ZENITH, a)
    set(SKY.uMid.value, MID, a)
    set(SKY.uHorizon.value, HORIZON, a)
    set(SKY.uAway.value, AWAY, a)
    set(SKY.uHaze.value, HAZE, a)
    set(SKY.uHazeAway.value, HAZE_AWAY, a)
    set(SKY.uGlow.value, GLOW, a).multiplyScalar(1 - 0.85 * o)
    // the fog's colour: the haze, greying as the cloud closes in, pale in the marine layer
    const fogCol = set(SKY.uFogCol.value, FOG, a)
    const light = 0.2 + 0.8 * smooth(-0.12, 0.25, e.sun.y)
    _grey.setRGB(0.6, 0.62, 0.66).multiplyScalar(light * (1 - 0.3 * rain))
    fogCol.lerp(_grey, Math.max(0.8 * o, 0.9 * fog))
    SKY.uSun.value.set(e.sun.x, e.sun.y, e.sun.z)
    SKY.uMoon.value.set(e.moon.x, e.moon.y, e.moon.z)
    SKY.uNight.value = e.night
    SKY.uClouds.value = e.clouds
    SKY.uRain.value = rain
    SKY.uFog.value = fog
    // (a lightning flash a third as bright with reduced motion: no full-screen strobe: options.js)
    const flash = e.flash * (motionFx() ? 1 : 0.3)
    SKY.uFlash.value = flash
    SKY.uTime.value = clock
    // (the clouds drift with the wind, and the palms and trees sway in it: treeWind.js)
    const drift = SKY.uDrift.value,
      w = 0.004 + 0.02 * e.wind
    drift.x += Math.cos(e.windDir) * w * dt
    drift.y += Math.sin(e.windDir) * w * dt
    WIND.strength.value = Math.min(1, 1.15 * e.wind)
    WIND.dir.value.set(Math.cos(e.windDir), Math.sin(e.windDir))
    // ---- the sun's light, or the moon's
    at(SUN_LIGHT, a, _v)
    // (none of it direct once the sky is grey: no glint off the glass, no shadow)
    const sunK = _v[3] * (1 - 0.97 * o) * (1 - 0.5 * fog)
    const moonK =
      0.26 *
      smooth(0.0, 0.25, e.moon.y) *
      e.night *
      (1 - 0.9 * o) *
      (1 - 0.5 * fog)
    const moon = e.sun.y < -0.02
    if (moon) {
      _dir.set(e.moon.x, e.moon.y, e.moon.z)
      key.color.setRGB(0.62, 0.7, 0.95)
      key.intensity = moonK
    } else {
      _dir.set(e.sun.x, e.sun.y, e.sun.z)
      key.color.setRGB(_v[0], _v[1], _v[2]).lerp(_grey.setRGB(0.9, 0.92, 1), o)
      key.intensity = sunK
    }
    // (the light from straight over the horizon would skim the ground: never lower than 4 degrees)
    if (_dir.y < 0.07) {
      _dir.y = 0.07
      _dir.normalize()
    }
    keyOffset.copy(_dir).multiplyScalar(KEY_REACH)
    SKY.uSunCol.value
      .copy(key.color)
      .multiplyScalar(moon ? moonK : sunK / 4.6)
    // the shadows soften and go as the cloud closes in (and with the light's strength at dusk)
    // (none at all with the shadows off: options.js; the maps aren't redrawn then either)
    const shade = (1 - 0.9 * o) * (1 - 0.6 * fog) * (OPTS.shadows === 'on' ? 1 : 0)
    renderer.shadowMap.autoUpdate = OPTS.shadows === 'on'
    key.shadow.intensity = shade
    if (city.shadow) city.shadow.light.shadow.intensity = shade
    // ---- the sky's light: flat and grey under cloud, cold in a lightning flash
    at(SKY_LIGHT, a, _v)
    hemi.color.setRGB(_v[0], _v[1], _v[2])
    let hk = _v[3]
    const day = smooth(-0.1, 0.2, e.sun.y)
    hemi.color.lerp(_grey.setRGB(0.78, 0.8, 0.84), o * 0.8)
    hk *= 1 + 0.55 * o * day
    hk *= 1 - 0.35 * rain * day
    hk += flash * 2.4
    hemi.intensity = hk
    if (flash > 0) hemi.color.lerp(_c.setRGB(0.75, 0.8, 1), flash)
    set(hemi.groundColor, BOUNCE, a).multiplyScalar(1 - 0.35 * o * day)
    SKY.uAmb.value.copy(hemi.color).multiplyScalar(hk)
    // (the sunlit walls' warm light bounced down into the streets between them: canyon.js)
    CANYON.uCanyonOn.value = LOOK.on ? 1 : 0
    CANYON.uBounce.value
      .copy(key.color)
      .multiplyScalar(moon ? 0 : 0.05 * key.intensity * day * (1 - 0.8 * o))
    // ---- the fog, the exposure, the reflections' strength
    at(EXPOSURE, a, _v)
    renderer.toneMappingExposure = _v[0] + 0.12 * o * day + 0.08 * fog
    scene.environmentIntensity = _v[1] * (1 - 0.3 * o * day)
    if (scene.fog) {
      scene.fog.color.copy(fogCol)
      scene.fog.density =
        _v[2] + 0.0014 * o + 0.0035 * rain + 0.011 * fog * fog + (LOOK.on ? LOOK.haze * day : 0)
      // (the draw distance: nearer, the haze closes in, and the streaming leaves out what it hides)
      scene.fog.density = Math.max(scene.fog.density, DRAW_FOG[OPTS.draw] || 0)
    }
    if (scene.background?.isColor) scene.background.copy(fogCol)
    // ---- the grade, duller and cooler as the cloud and the rain and the fog come in
    at(GRADING, a, _g)
    const dull = Math.max(o * (0.6 + 0.4 * day), fog, rain)
    for (let i = 0; i < _g.length; i++) _g[i] += (DULL[i] - _g[i]) * dull
    GRADE.uSat.value = _g[0]
    GRADE.uContrast.value = _g[1]
    if (LOOK.on) {
      GRADE.uSat.value *= LOOK.sat
      GRADE.uContrast.value *= LOOK.contrast
    }
    GRADE.uShadow.value.set(_g[2], _g[3], _g[4])
    GRADE.uHigh.value.set(_g[5], _g[6], _g[7])
    GRADE.uVignette.value = _g[8]
    at(BALANCE, a, _v)
    const keep = LOOK.on ? 1 - dull : 0
    GRADE.uBalance.value.set(1 + (_v[0] - 1) * keep, 1 + (_v[1] - 1) * keep, 1 + (_v[2] - 1) * keep)
    // ---- the ground in the rain (wet.js)
    WET.uWet.value = e.wet
    WET.uPool.value = e.pool
    WET.uRain.value = rain
    WET.uRainT.value += dt
    at(DAMP, a, _v)
    WET.uDamp.value = LOOK.on ? _v[0] * (1 - 0.5 * fog) : 0
    // ---- how dark it is for the city's own lights, and the real ones near the camera
    this.lamps.update(dt, camera, e.dark, LOOK.on)
    if (Math.abs(e.dark - this.darkWas) > 0.004) {
      this.darkWas = e.dark
      city.setDark(e.dark)
    }
    // ---- the city's shadows from where the light now is, once it has moved a tenth of a degree
    // (every second or so at the clock's pace; twenty times a second as it runs on fast, L)
    this.shadowT -= dt
    if (city.shadow && this.shadowT <= 0) {
      this.shadowT = 0.05
      if (_dir.angleTo(_aimed) > 0.0015 || this.lit !== moon) {
        _aimed.copy(_dir)
        this.lit = moon
        city.shadow.aim(_dir)
      }
    }
    // ---- the environment map, once the sky has changed enough to see in a reflection (at most
    // four times a second)
    this.envT -= dt
    if (city.sky && this.envT <= 0) {
      this.envT = 0.25
      const was = this.envWas
      _envSun.set(e.sun.x, e.sun.y, e.sun.z)
      if (
        !was ||
        _envSun.angleTo(was.sun) > 0.02 ||
        Math.abs(e.clouds - was.clouds) > 0.03 ||
        Math.abs(e.rain - was.rain) > 0.05 ||
        Math.abs(e.fog - was.fog) > 0.05 ||
        Math.abs(e.night - was.night) > 0.03
      ) {
        this.envWas = {
          sun: _envSun.clone(),
          clouds: e.clouds,
          rain: e.rain,
          fog: e.fog,
          night: e.night
        }
        city.sky.drawEnv()
      }
    }
  }
}
