// The city's evening, Los Angeles at golden hour: a clean sky, deep blue overhead and gold toward the
// sun as it goes down over the Pacific, a few streaks of high cloud lit from below, and the smog's
// warm haze in a band low round the horizon (golden on the sun's side, a dusty brown-pink away from
// it) that the far hills and the city fade into. The mountains ring the horizon: the San Gabriels high
// in the north and north-east behind the hills, the Santa Monica Mountains running down into the sea
// in the north-west, Palos Verdes and Catalina low across the bay to the south-west, the open sea
// west under the sun. A matching environment map for reflections, and the switch between the night
// test site and the city's light. At night (L) the same dome turns deep blue with stars, a moon low
// where the sun was (so the city's shadows still fall the same way, only faintly), and the city's
// orange glow along the horizon, everywhere but out over the sea.
import * as THREE from 'three'
import { LAYER } from './geo.js'
import { rng } from '../sim/city.js'
import { scene, pmrem, renderer, hemi, key, keyOffset } from './scene.js'

export const SUN = new THREE.Vector3(-66, 30, 28) // where the low sun sits relative to the car
const SUN_DIR = SUN.clone().normalize()
const v3 = c => `vec3(${c.map(n => n.toFixed(3)).join(', ')})`
// the haze low on the horizon, away from the sun and toward it (and the fog: the two blended)
const HAZE_AWAY = [0.72, 0.52, 0.39],
  HAZE_SUN = [1.0, 0.66, 0.36]
const HAZE = new THREE.Color(0.76, 0.56, 0.43)
const NIGHT_HAZE = new THREE.Color(0.04, 0.038, 0.06)

// The sky's colour in direction d (a unit vector), without the sun's disc, the clouds and the stars:
// shared with the sea (citySea.js), which mirrors it. sun: toward the sun; night: 0 to 1.
export const SKY_GLSL = `
  vec3 hazeAt (vec3 d, vec3 sun) {
    float az = dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0)), normalize(vec3(sun.x, 0.0, sun.z)));
    return mix(${v3(HAZE_AWAY)}, ${v3(
  HAZE_SUN
)}, smoothstep(-0.25, 1.0, az) * smoothstep(-0.25, 1.0, az));
  }
  vec3 skyBase (vec3 d, vec3 sun, float night) {
    float h = d.y, s = max(dot(d, sun), 0.0);
    float az = dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0)), normalize(vec3(sun.x, 0.0, sun.z)));
    // blue overhead, paler down toward the horizon and warmer on the sun's side
    vec3 low = mix(vec3(0.6, 0.66, 0.77), vec3(0.95, 0.74, 0.48), smoothstep(-0.2, 1.0, az));
    vec3 col = mix(low, vec3(0.3, 0.5, 0.82), smoothstep(0.03, 0.28, h));
    col = mix(col, vec3(0.1, 0.23, 0.55), smoothstep(0.22, 0.8, h));
    // the smog: a warm band low along the horizon, and below it nothing but haze
    col = mix(col, hazeAt(d, sun), exp(-max(h, 0.0) * 16.0) * 0.9);
    col = mix(col, hazeAt(d, sun) * 0.92, smoothstep(0.0, -0.06, h));
    // the low sun's glow, gold rather than white
    col += vec3(1.0, 0.55, 0.22) * (pow(s, 5.0) * 0.3 + pow(s, 48.0) * 0.5);
    // night: deep blue overhead; low down the city's orange glow, from every side but the sea's (west)
    float land = smoothstep(-0.75, 0.2, d.x / max(length(d.xz), 1e-4));
    vec3 n = mix(vec3(0.034, 0.036, 0.062), vec3(0.004, 0.008, 0.026), smoothstep(0.0, 0.45, h));
    n += vec3(0.24, 0.12, 0.05) * exp(-max(h, 0.0) * 11.0) * mix(0.18, 1.0, land);
    n += vec3(0.6, 0.65, 0.8) * pow(s, 30.0) * 0.05;
    n = mix(n, vec3(${NIGHT_HAZE.r}, ${NIGHT_HAZE.g}, ${
  NIGHT_HAZE.b
}) + vec3(0.12, 0.06, 0.025) * land, smoothstep(0.0, -0.06, h));
    return mix(col, n, night);
  }`

// far: the dome seen from the city, pushed out to the far plane so it is drawn last, and only where
// nothing else is (the one in the environment map's scene stays where it is)
function skyMaterial (uniforms, far = false) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p;
        ${far ? 'gl_Position.z = gl_Position.w;' : ''} }`,
    fragmentShader: `uniform vec3 uSun; uniform float uNight; varying vec3 vDir;
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      ${SKY_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y, s = max(dot(d, uSun), 0.0);
        vec3 col = skyBase(d, uSun, 0.0);
        col += vec3(1.0, 0.86, 0.62) * smoothstep(0.9994, 0.9998, s) * 7.0;
        // a few long streaks of high cloud, lit gold from below on the sun's side, pink away from it
        vec2 uv = d.xz / max(h + 0.12, 0.05);
        float c = smoothstep(0.57, 0.84, fbm(uv * vec2(0.9, 3.2) + vec2(4.0, 1.0)));
        c *= smoothstep(0.03, 0.12, h) * (1.0 - smoothstep(0.35, 0.6, h));
        vec3 cloud = mix(vec3(0.86, 0.62, 0.6), vec3(1.05, 0.78, 0.5), pow(s, 2.0));
        col = mix(col, cloud, c * 0.75);
        // night: the stars, the moon and its halo, the clouds dark but for where the moon is behind them
        vec3 night = skyBase(d, uSun, 1.0);
        vec3 sc = d * 420.0, cell = floor(sc);
        float star = step(0.9972, hash3(cell)) * smoothstep(0.45, 0.0, length(fract(sc) - 0.5));
        star *= (0.4 + 0.6 * hash3(cell + 3.1)) * smoothstep(0.08, 0.25, h) * (1.0 - c);
        night += vec3(0.8, 0.85, 1.0) * star * 1.4;
        night += vec3(0.6, 0.65, 0.8) * pow(s, 300.0) * 0.25;
        night += vec3(1.6, 1.62, 1.7) * smoothstep(0.99985, 0.99992, s);
        night = mix(night, vec3(0.03, 0.03, 0.045) + vec3(0.12, 0.12, 0.14) * pow(s, 12.0), c * 0.7 * step(0.0, h));
        gl_FragColor = vec4(mix(col, night, uNight), 1.0);
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
function mountains () {
  const R = rng(5),
    n = 360,
    pos = [],
    col = []
  const sunDeg = (Math.atan2(SUN.z, SUN.x) * 180) / Math.PI
  // a jagged line: smoothed random heights, a value a degree
  const jag = []
  let j = 0.5
  for (let i = 0; i <= n; i++) {
    j = 0.6 * j + 0.4 * R()
    jag.push(i === n ? jag[0] : j)
  }
  const heights = jag.map((_, i) => farHeight(i, d => jag[Math.round(d) % n]))
  const haze = (deg, far) => {
    const az = Math.cos(((deg - sunDeg) * Math.PI) / 180)
    const t = THREE.MathUtils.smoothstep(az, -0.25, 1) ** 2
    const c = new THREE.Color(...HAZE_AWAY).lerp(
      new THREE.Color(...HAZE_SUN),
      t
    )
    return { c, far, az }
  }
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
      // the ridges: blue-grey against the sun, a warm dusty rose lit by it, both hazier the further
      // off they are; their feet lost in the haze
      const r = RANGES.reduce(
        (best, g) => {
          const d = Math.abs(((((k - g.at) % 360) + 540) % 360) - 180) / g.w
          return d < best.d ? { d, g } : best
        },
        { d: 9, g: RANGES[0] }
      ).g
      const { c, az } = haze(k, r.far)
      const lit = new THREE.Color(0.36, 0.38, 0.47).lerp(
        new THREE.Color(0.7, 0.55, 0.52),
        THREE.MathUtils.smoothstep(-az, -0.4, 0.9)
      )
      const top = lit.lerp(c, 0.25 + 0.6 * r.far)
      const out = y ? top : c.clone().multiplyScalar(0.96)
      col.push(out.r, out.g, out.b)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      side: THREE.DoubleSide
    })
  )
}

export class Sky {
  constructor (group) {
    const uniforms = {
      uSun: { value: SUN_DIR.clone() },
      uNight: { value: 0 }
    }
    const mat = (this.mat = skyMaterial(uniforms))
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      skyMaterial(uniforms, true)
    )
    this.dome.renderOrder = LAYER.sky
    this.dome.frustumCulled = false
    this.hills = mountains()
    // (behind the near hills, cityHills.js, and the sea; before the sky)
    this.hills.renderOrder = LAYER.hills + 0.5
    this.hills.frustumCulled = false
    group.add(this.dome, this.hills)
    // reflections come from the same sky, rendered once into an environment map (and once more at
    // night, the first time it falls)
    this.envScene = new THREE.Scene()
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat))
    this.env = pmrem.fromScene(this.envScene, 0.02, 0.1, 200).texture
    this.envNight = null
    this.night = false
    this.on = false
    this.saved = null
  }
  // golden hour or night (in the city; the test site keeps its own night)
  setNight (night) {
    this.night = night
    if (night && !this.envNight) {
      this.mat.uniforms.uNight.value = 1
      this.envNight = pmrem.fromScene(this.envScene, 0.02, 0.1, 200).texture
    }
    this.mat.uniforms.uNight.value = night ? 1 : 0
    this.hills.material.color.setRGB(
      ...(night ? [0.02, 0.022, 0.04] : [1, 1, 1])
    )
    if (this.on) this.light()
  }
  follow (camera) {
    this.dome.position.copy(camera.position)
    this.hills.position.set(camera.position.x, 0, camera.position.z)
  }
  // switch the scene's light between the night test site and the city's evening
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
    if (on) this.light()
    else if (this.saved) {
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
  // the city's light: golden hour, or night
  light () {
    keyOffset.copy(SUN)
    hemi.groundColor.setRGB(0.36, 0.3, 0.26)
    if (!this.night) {
      scene.background = HAZE.clone()
      scene.fog = new THREE.FogExp2(HAZE.clone(), 0.00086)
      // a strong, warm low sun, and the shade lit only by the cooler sky (the whole city throws its
      // shadows now: sunShadow.js), for golden hour's contrast
      scene.environment = this.env
      scene.environmentIntensity = 0.5
      renderer.toneMappingExposure = 1.05
      hemi.color.setRGB(0.7, 0.76, 0.94)
      hemi.intensity = 0.7
      key.color.setRGB(1, 0.71, 0.46)
      key.intensity = 4.6
      return
    }
    // night: a cold, faint moon and a dark sky; the light is the city's own
    scene.background = NIGHT_HAZE.clone()
    scene.fog = new THREE.FogExp2(NIGHT_HAZE.clone(), 0.0011)
    scene.environment = this.envNight
    scene.environmentIntensity = 0.9
    renderer.toneMappingExposure = 1.2
    hemi.color.setRGB(0.18, 0.22, 0.36)
    hemi.groundColor.setRGB(0.06, 0.05, 0.045)
    hemi.intensity = 0.45
    key.color.setRGB(0.62, 0.7, 0.95)
    key.intensity = 0.45
  }
}
