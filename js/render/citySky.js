// The city's sky, through the day and the weather (daylight.js works out its colours from the
// clock and the weather each frame and hands them over in SKY, the uniforms everything that draws
// the sky shares). Clear, it is deep blue overhead and paler down to the horizon, gold toward a
// low sun and pink-violet away from it as it sets, with the smog's warm haze in a band low round
// the horizon that the far hills and the city fade into; then the blue hour, and night: deep blue
// with stars, a full moon opposite the sun, and the city's orange glow along the horizon,
// everywhere but out over the sea. Clouds drift over it with the wind: a few long streaks of high
// cloud on a clear evening, broken cumulus on a cloudy day, a low grey deck when it is overcast or
// raining, lit gold at their edges by a low sun and orange from below by the city at night, and
// lit from inside by the lightning in a storm. The mountains ring the horizon: the San Gabriels
// high in the north and north-east behind the hills, the Santa Monica Mountains running down into
// the sea in the north-west, Palos Verdes and Catalina low across the bay to the south-west, the
// open sea west. A matching environment map for reflections, drawn again as the sky changes; and
// the switch between the night test site and the city's light.
import * as THREE from 'three'
import { LAYER } from './geo.js'
import { rng } from '../sim/city.js'
import { scene, pmrem, renderer, hemi, key, keyOffset } from './scene.js'
import { aerialFog } from './aerialFog.js'

aerialFog() // (the haze thinning with height: before any material is compiled)

const v3 = () => ({ value: new THREE.Vector3() })
const c3 = () => ({ value: new THREE.Color() })
// The sky's uniforms, shared by the dome, its reflection, the sea (citySea.js), the mountains and
// the far shaders that light themselves (the freeway's traffic, the sprawl): toward the sun and
// the moon; the colours overhead, part way up, on the horizon toward the sun and away from it, of
// the haze band
// either side, of the sun's glow; the sun's light and the sky's for the shaders that light
// themselves; the fog's colour; how night it is, the cloud cover, the rain, the fog, the lightning
export const SKY = {
  uSun: v3(),
  uMoon: v3(),
  uZenith: c3(),
  uMid: c3(),
  uHorizon: c3(),
  uAway: c3(),
  uHaze: c3(),
  uHazeAway: c3(),
  uGlow: c3(),
  uSunCol: c3(),
  uAmb: c3(),
  uFogCol: c3(),
  uNight: { value: 0 },
  uClouds: { value: 0 },
  uRain: { value: 0 },
  uFog: { value: 0 },
  uFlash: { value: 0 },
  uTime: { value: 0 },
  uDrift: { value: new THREE.Vector2() }
}

// The sky's colour in direction d (a unit vector), without the sun's disc, the clouds and the stars:
// shared with the sea (citySea.js), which mirrors it.
export const SKY_GLSL = `
  uniform vec3 uSun, uMoon, uZenith, uMid, uHorizon, uAway, uHaze, uHazeAway, uGlow, uFogCol;
  uniform float uNight, uClouds, uRain, uFog, uFlash;
  float skyAz (vec3 d) {
    return dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0)),
      normalize(vec3(uSun.x, 0.0, uSun.z) + vec3(1e-5, 0.0, 0.0)));
  }
  vec3 hazeAt (vec3 d) {
    float t = smoothstep(-0.25, 1.0, skyAz(d));
    return mix(uHazeAway, uHaze, t * t);
  }
  vec3 skyBase (vec3 d) {
    float h = d.y, s = max(dot(d, uSun), 0.0), az = skyAz(d);
    // the horizon's colour toward the sun and away from it, up to the blue overhead
    vec3 low = mix(uAway, uHorizon, smoothstep(-0.2, 1.0, az));
    vec3 col = mix(low, uMid, smoothstep(0.03, 0.28, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.8, h));
    // the smog: a band low along the horizon, and below it nothing but haze
    col = mix(col, hazeAt(d), exp(-max(h, 0.0) * 16.0) * 0.9);
    col = mix(col, hazeAt(d) * 0.92, smoothstep(0.0, -0.06, h));
    // the sun's glow round it (none through a grey sky)
    float grey = smoothstep(0.55, 1.0, uClouds);
    col += uGlow * (pow(s, 5.0) * 0.3 + pow(s, 48.0) * 0.5) * (1.0 - grey);
    // at night the city's orange glow low down, from every side but the sea's (west)
    float land = smoothstep(-0.75, 0.2, d.x / max(length(d.xz), 1e-4));
    col += vec3(0.24, 0.12, 0.05) * exp(-max(h, 0.0) * 11.0) * mix(0.18, 1.0, land) * uNight;
    // a grey sky over it all when the cloud closes in, darker in the rain
    vec3 deck = uFogCol * mix(1.08, 0.82, smoothstep(0.0, 0.6, h)) * (1.0 - 0.25 * uRain);
    col = mix(col, deck, grey * 0.85);
    // fog: the horizon gone in it
    col = mix(col, uFogCol, uFog * (1.0 - smoothstep(-0.05, 0.6, h)));
    return col;
  }`

// The clouds in direction d: their colour (rgb) and how much of the sky they hide (a). A layer of
// cloud on a plane overhead, its noise thresholded by the cover so that a little cover is a few
// thin streaks and broken cloud, and full cover a deck; lit by the sun at the edges and on the
// side toward it, darker underneath where it is thick, orange from below by the city at night.
const CLOUD_GLSL = `
  uniform vec3 uSunCol, uAmb; uniform float uTime; uniform vec2 uDrift;
  float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm (vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  vec4 clouds (vec3 d) {
    float h = d.y;
    if (h <= 0.0) return vec4(0.0);
    vec2 uv = d.xz / (h + 0.12) + uDrift;
    // high streaks: always a few on a clear evening, as on the old sky
    float streak = smoothstep(0.57, 0.84, fbm(uv * vec2(0.9, 3.2) + vec2(4.0, 1.0)));
    streak *= (1.0 - smoothstep(0.35, 0.6, h)) * (1.0 - smoothstep(0.4, 0.8, uClouds));
    // the cloud layer: broken at a little cover, a deck at full
    float n = fbm(uv * 0.55 + vec2(1.7, 9.2)) * 0.72 + fbm(uv * 1.9 + vec2(-3.1, 2.2)) * 0.28;
    float thr = 0.98 - uClouds * 0.62;
    float c = smoothstep(thr - 0.03, thr + 0.1, n) + smoothstep(0.75, 1.0, uClouds);
    c = min(c, 1.0);
    float thick = smoothstep(thr, thr + 0.3, n);
    float a = max(c, streak * 0.75) * smoothstep(0.03, 0.12, h);
    float s = max(dot(d, uSun), 0.0);
    // lit at the edges and toward the sun, shaded underneath where thick
    vec3 lit = uSunCol * (0.85 + 0.9 * pow(s, 6.0)) + uAmb * 0.95;
    vec3 shade = uAmb * 0.7 + uSunCol * 0.12;
    vec3 col = mix(lit, shade, thick * (0.35 + 0.55 * uClouds));
    // (the streaks are as the old sky had them: gold on the sun's side, pink away from it)
    vec3 high = mix(vec3(0.86, 0.62, 0.6), vec3(1.05, 0.78, 0.5), pow(s, 2.0)) * (uSunCol.r + uAmb.r) * 0.55;
    col = mix(col, high, streak * (1.0 - c));
    // at night: dark, lit from below by the city's orange glow
    vec3 nite = vec3(0.035, 0.034, 0.045) + vec3(0.13, 0.065, 0.03) * (1.0 - smoothstep(0.0, 0.5, h)) * (0.4 + 0.6 * uClouds);
    col = mix(col, nite, uNight);
    col *= 1.0 - 0.45 * uRain;
    // lightning lights the cloud from within
    col += uFlash * vec3(0.75, 0.8, 1.0) * (0.6 + 2.0 * thick);
    return vec4(col, a);
  }`

// far: the dome seen from the city, pushed out to the far plane so it is drawn last, and only where
// nothing else is (the one in the environment map's scene stays where it is)
function skyMaterial (far = false) {
  return new THREE.ShaderMaterial({
    uniforms: SKY,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p;
        ${far ? 'gl_Position.z = gl_Position.w;' : ''} }`,
    fragmentShader: `varying vec3 vDir;
      ${SKY_GLSL}
      ${CLOUD_GLSL}
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = skyBase(d);
        // the sun's disc, gold; the moon's, cold, and its halo
        float s = dot(d, uSun), m = dot(d, uMoon);
        col += vec3(1.0, 0.86, 0.62) * smoothstep(0.9994, 0.9998, s) * 4.0 * (1.0 - uNight) * step(0.0, h)
          * (1.0 - smoothstep(0.55, 1.0, uClouds));
        col += vec3(0.6, 0.65, 0.8) * pow(max(m, 0.0), 300.0) * 0.25 * uNight;
        col += vec3(1.6, 1.62, 1.7) * smoothstep(0.99985, 0.99992, m) * uNight;
        // the stars, where the sky is clear and dark
        vec3 sc = d * 420.0, cell = floor(sc);
        float star = step(0.9972, hash3(cell)) * smoothstep(0.45, 0.0, length(fract(sc) - 0.5));
        star *= (0.4 + 0.6 * hash3(cell + 3.1)) * smoothstep(0.08, 0.25, h) * smoothstep(0.5, 0.95, uNight);
        vec4 cl = clouds(d);
        col += vec3(0.8, 0.85, 1.0) * star * 1.4 * (1.0 - cl.a) * (1.0 - uClouds) * (1.0 - uFog);
        col = mix(col, cl.rgb, cl.a);
        // (the fog has the last word, low down)
        col = mix(col, uFogCol, uFog * (1.0 - smoothstep(-0.05, 0.45, h)) * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  })
}

// ---------- the mountains round the horizon ----------
// Each range: its middle and half-width (degrees round from east, through south: atan2(z, x)), its
// height (m, on the ring), how jagged it is, and how far off (0 near, 1 lost in the haze).
const RANGES = [
  { at: 296, w: 62, h: 330, rough: 0.35, far: 0.25 }, // the San Gabriels
  { at: 352, w: 30, h: 70, rough: 0.25, far: 0.75 }, // the low hills far off east
  { at: 216, w: 34, h: 190, rough: 0.3, far: 0.3 }, // the Santa Monica Mountains, down to the sea
  { at: 101, w: 10, h: 48, rough: 0.15, far: 0.6 }, // Palos Verdes
  { at: 121, w: 7, h: 34, rough: 0.2, far: 0.85 } // Catalina
]
const RING = 1450
function farHeight (deg, R) {
  let h = -30
  for (const r of RANGES) {
    let d = Math.abs(((((deg - r.at) % 360) + 540) % 360) - 180) / r.w
    if (d >= 1) continue
    const shape = Math.pow(Math.cos((d * Math.PI) / 2), 0.7)
    h = Math.max(h, r.h * shape * (1 - r.rough + r.rough * R(deg)))
  }
  return h
}
// The ring of ridges, coloured as the sky is: the rock blue-grey against the sun and a warm dusty
// rose where a low sun lights it, both hazier the further off they are, their feet lost in the
// haze; dark at night (each vertex carries how far off its range is, and whether it is the ridge)
function mountains () {
  const R = rng(5),
    n = 360,
    pos = [],
    far = []
  // a jagged line: smoothed random heights, a value a degree
  const jag = []
  let j = 0.5
  for (let i = 0; i <= n; i++) {
    j = 0.6 * j + 0.4 * R()
    jag.push(i === n ? jag[0] : j)
  }
  const heights = jag.map((_, i) => farHeight(i, d => jag[Math.round(d) % n]))
  for (let i = 0; i < n; i++)
    for (const [k, y] of [
      [i, 0],
      [i + 1, 0],
      [i + 1, 1],
      [i, 0],
      [i + 1, 1],
      [i, 1]
    ]) {
      const a = (k / n) * Math.PI * 2,
        h = heights[k]
      pos.push(Math.cos(a) * RING, y ? h : -40, Math.sin(a) * RING)
      const r = RANGES.reduce(
        (best, g) => {
          const d = Math.abs(((((k - g.at) % 360) + 540) % 360) - 180) / g.w
          return d < best.d ? { d, g } : best
        },
        { d: 9, g: RANGES[0] }
      ).g
      far.push(r.far, y)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aFar', new THREE.Float32BufferAttribute(far, 2))
  return new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: SKY,
      vertexShader: `attribute vec2 aFar; varying vec2 vFar; varying vec3 vDir;
        void main(){ vFar = aFar; vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vFar; varying vec3 vDir;
        ${SKY_GLSL}
        uniform vec3 uSunCol, uAmb;
        void main(){
          vec3 d = normalize(vDir);
          vec3 haze = hazeAt(vec3(d.x, 0.0, d.z));
          haze = mix(haze, uFogCol, smoothstep(0.55, 1.0, uClouds) * 0.85);
          // lit by a low sun behind the camera, against the light toward it
          float lit = smoothstep(-0.4, 0.9, -skyAz(d));
          vec3 rock = vec3(0.36, 0.38, 0.47) * (uAmb * 0.9 + 0.1)
            + vec3(0.7, 0.55, 0.52) * uSunCol * 0.3 * lit;
          rock = mix(rock, vec3(0.02, 0.022, 0.04), uNight);
          vec3 top = mix(rock, haze, 0.25 + 0.6 * vFar.x);
          vec3 col = mix(haze * 0.96, top, vFar.y);
          col = mix(col, uFogCol, uFog);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.DoubleSide,
      fog: false
    })
  )
}

// The environment map: the sky drawn into a small cube and filtered for reflections into one
// target kept for good (the same size each time, so no material has to be compiled again for it)
const ENV_SIZE = 128
export class Sky {
  constructor (group) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      skyMaterial(true)
    )
    this.dome.renderOrder = LAYER.sky
    this.dome.frustumCulled = false
    this.hills = mountains()
    // (behind the near hills, cityHills.js, and the sea; before the sky)
    this.hills.renderOrder = LAYER.hills + 0.5
    this.hills.frustumCulled = false
    group.add(this.dome, this.hills)
    // reflections come from the same sky (the dome's material, without the push to the far plane)
    this.envScene = new THREE.Scene()
    this.envScene.add(
      new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial())
    )
    this.cube = new THREE.WebGLCubeRenderTarget(ENV_SIZE, {
      type: THREE.HalfFloatType
    })
    this.cubeCam = new THREE.CubeCamera(0.1, 200, this.cube)
    this.envTarget = null
    this.on = false
    this.saved = null
    this.drawEnv()
  }
  get env () {
    return this.envTarget.texture
  }
  // draw the environment map again from the sky as it is now
  drawEnv () {
    this.cubeCam.update(renderer, this.envScene)
    this.envTarget = pmrem.fromCubemap(this.cube.texture, this.envTarget)
    if (this.on) scene.environment = this.envTarget.texture
  }
  follow (camera) {
    this.dome.position.copy(camera.position)
    this.hills.position.set(camera.position.x, 0, camera.position.z)
  }
  // switch the scene's light between the night test site and the city's (daylight.js sets the
  // city's from the clock and the weather each frame)
  apply (on) {
    if (on && !this.saved)
      this.saved = {
        background: scene.background,
        fog: scene.fog,
        env: scene.environment,
        envI: scene.environmentIntensity,
        exposure: renderer.toneMappingExposure,
        hemi: [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity],
        key: [key.color.clone(), key.intensity],
        offset: keyOffset.clone()
      }
    this.on = on
    if (on) {
      scene.background = new THREE.Color()
      scene.fog = new THREE.FogExp2(new THREE.Color(), 0.00086)
      scene.environment = this.env
    } else if (this.saved) {
      const s = this.saved
      scene.background = s.background
      scene.fog = s.fog
      scene.environment = s.env
      scene.environmentIntensity = s.envI
      renderer.toneMappingExposure = s.exposure
      hemi.color.copy(s.hemi[0])
      hemi.groundColor.copy(s.hemi[1])
      hemi.intensity = s.hemi[2]
      key.color.copy(s.key[0])
      key.intensity = s.key[1]
      keyOffset.copy(s.offset)
      this.saved = null
    }
  }
}
