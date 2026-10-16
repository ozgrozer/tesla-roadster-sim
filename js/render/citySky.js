// The city's evening: a sunset sky dome with streaky cloud, hazy hills round the horizon, a matching
// environment map for reflections, and the switch between the night test site and the city's light.
import * as THREE from 'three'
import { rng } from '../sim/city.js'
import { scene, pmrem, renderer, hemi, key, keyOffset } from './scene.js'

export const SUN = new THREE.Vector3(-66, 30, 28) // where the low sun sits relative to the car
const HAZE = new THREE.Color(0.86, 0.6, 0.48)

function skyMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone().normalize() } },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vDir;
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
        gl_FragColor = vec4(col, 1.0);
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
    const mat = skyMaterial()
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat)
    this.dome.renderOrder = -1
    this.dome.frustumCulled = false
    this.hills = hills()
    group.add(this.dome, this.hills)
    // reflections come from the same sky, rendered once into an environment map
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat))
    this.env = pmrem.fromScene(envScene, 0.02, 0.1, 200).texture
    this.saved = null
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
    if (on) {
      scene.background = HAZE.clone()
      scene.fog = new THREE.FogExp2(HAZE.clone().multiplyScalar(0.92), 0.00105)
      // a strong, warm low sun, and the shade lit only by the cooler sky (the whole city throws its
      // shadows now: sunShadow.js), for golden hour's contrast
      scene.environment = this.env
      scene.environmentIntensity = 0.5
      renderer.toneMappingExposure = 1.05
      hemi.color.setRGB(0.72, 0.76, 0.92)
      hemi.groundColor.setRGB(0.36, 0.3, 0.26)
      hemi.intensity = 0.7
      key.color.setRGB(1, 0.72, 0.48)
      key.intensity = 4.6
      keyOffset.copy(SUN)
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
