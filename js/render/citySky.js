// The city's evening: a sunset sky dome with streaky cloud, hazy hills round the horizon, a matching
// environment map for reflections, and the switch between the night test site and the city's light.
// At night (L), the same dome turns deep blue with stars, a moon low where the sun was (so the city's
// shadows still fall the same way, only faintly), and the city's own glow along the horizon.
import * as THREE from 'three'
import { rng } from '../sim/city.js'
import { scene, pmrem, renderer, hemi, key, keyOffset } from './scene.js'

export const SUN = new THREE.Vector3(-66, 30, 28) // where the low sun sits relative to the car
const HAZE = new THREE.Color(0.86, 0.6, 0.48)
const NIGHT_HAZE = new THREE.Color(0.035, 0.04, 0.065)

function skyMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone().normalize() }, uNight: { value: 0 } },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uNight; varying vec3 vDir;
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 horizon = vec3(1.0, 0.56, 0.32), mid = vec3(0.62, 0.42, 0.52), zenith = vec3(0.13, 0.2, 0.42);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, h));
        col = mix(col, zenith, smoothstep(0.12, 0.62, h));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.5, 0.2) * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 0.8);
        col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9994, 0.9998, s) * 6.0;
        // long thin cloud streaks, lit from below by the low sun
        vec2 uv = d.xz / max(h + 0.12, 0.05);
        float c = smoothstep(0.52, 0.8, fbm(uv * vec2(0.9, 3.2) + vec2(4.0, 1.0)));
        c *= smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.35, 0.6, h));
        vec3 cloud = mix(vec3(0.55, 0.32, 0.38), vec3(1.0, 0.62, 0.42), pow(s, 2.0));
        col = mix(col, cloud, c * 0.8);
        col = mix(col, vec3(${HAZE.r}, ${HAZE.g}, ${HAZE.b}) * 0.8, smoothstep(0.0, -0.08, h));
        // night: deep blue overhead, the city's glow along the horizon, stars, the moon and its halo,
        // the clouds dark against the sky but for where the moon is behind them
        vec3 night = mix(vec3(0.05, 0.046, 0.062), vec3(0.004, 0.008, 0.024), smoothstep(0.0, 0.45, h));
        night += vec3(0.2, 0.11, 0.06) * exp(-max(h, 0.0) * 16.0) * 0.5;
        vec3 sc = d * 420.0, cell = floor(sc);
        float star = step(0.9972, hash3(cell)) * smoothstep(0.45, 0.0, length(fract(sc) - 0.5));
        star *= (0.4 + 0.6 * hash3(cell + 3.1)) * smoothstep(0.06, 0.2, h) * (1.0 - c);
        night += vec3(0.8, 0.85, 1.0) * star * 1.4;
        night += vec3(0.6, 0.65, 0.8) * (pow(s, 300.0) * 0.25 + pow(s, 30.0) * 0.05);
        night += vec3(1.6, 1.62, 1.7) * smoothstep(0.99985, 0.99992, s);
        night = mix(night, vec3(0.03, 0.03, 0.045) + vec3(0.12, 0.12, 0.14) * pow(s, 12.0), c * 0.75);
        night = mix(night, vec3(${NIGHT_HAZE.r}, ${NIGHT_HAZE.g}, ${NIGHT_HAZE.b}), smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(mix(col, night, uNight), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  })
}

// hills: a ring of jagged ridges, darker on the sunward side
function hills () {
  const R = rng(5),
    n = 220,
    pos = [],
    col = []
  const sun = Math.atan2(SUN.z, SUN.x)
  let h0 = 0
  const heights = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    h0 = 0.75 * h0 + 0.25 * (40 + R() * 110 + 70 * Math.sin(a * 3 + 1))
    heights.push(i === n ? heights[0] : h0)
  }
  for (let i = 0; i < n; i++) {
    for (const [k, y] of [
      [i, 0],
      [i + 1, 0],
      [i + 1, 1],
      [i, 0],
      [i + 1, 1],
      [i, 1]
    ]) {
      const a = (k / n) * Math.PI * 2,
        r = 1450
      pos.push(Math.cos(a) * r, y * heights[k] - 10, Math.sin(a) * r)
      const toward = 0.5 + 0.5 * Math.cos(a - sun)
      const c = new THREE.Color(0.5, 0.4, 0.5).lerp(
        new THREE.Color(0.27, 0.2, 0.27),
        toward
      )
      if (!y) c.lerp(HAZE, 0.5)
      col.push(c.r, c.g, c.b)
    }
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
    const mat = (this.mat = skyMaterial())
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat)
    this.dome.renderOrder = -1
    this.dome.frustumCulled = false
    this.hills = hills()
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
    this.hills.material.color.setRGB(...(night ? [0.03, 0.035, 0.06] : [1, 1, 1]))
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
      scene.fog = new THREE.FogExp2(HAZE.clone().multiplyScalar(0.92), 0.00105)
      // a strong, warm low sun, and the shade lit only by the cooler sky (the whole city throws its
      // shadows now: sunShadow.js), for golden hour's contrast
      scene.environment = this.env
      scene.environmentIntensity = 0.5
      renderer.toneMappingExposure = 1.05
      hemi.color.setRGB(0.72, 0.76, 0.92)
      hemi.intensity = 0.7
      key.color.setRGB(1, 0.72, 0.48)
      key.intensity = 4.6
      return
    }
    // night: a cold, faint moon and a dark sky; the light is the city's own
    scene.background = NIGHT_HAZE.clone()
    scene.fog = new THREE.FogExp2(NIGHT_HAZE.clone(), 0.0013)
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
