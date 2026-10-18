// The rain: streaks falling through a box of air round the camera, and splashes where they land.
// Each drop has its own place in the box and falls through it on the wind, wrapping round, so the
// rain stays put in the world as the camera moves through it (driving into it, it comes at the
// windscreen; the streaks are drawn along the drop's way past the camera, each as long as it travels
// in a camera's exposure, so at speed they slant in at the car). They are lit by the sky and, at
// night, mostly where the headlights catch them, and fade off with distance, with the camera's
// nearest few faded out too so none smears across the picture. The splashes are little crowns of
// water thrown up on the ground (road or pavement, at its height) all round the camera, each at a
// new spot every time it lands. All in two instanced draws; how many drops, by the rain's strength
// and the graphics quality. The ground's own wet look is wet.js's.
import * as THREE from 'three'
import { GROUND } from './mirror.js'
import { LAMP, LAMP_FIELD_GLSL } from './lampLight.js'
import { HALF, PITCH, ROAD_HW, CURB_H } from '../sim/city.js'

const MAX = 9000 // streaks at the heaviest rain (high quality)
const SPLASHES = 1400
const BOX = new THREE.Vector3(44, 24, 44) // m: the air round the camera the rain falls through
const SPLASH_R = 26 // m round the camera the splashes land in
const f = v => v.toFixed(3)

const STREAK_V = `
  attribute vec4 aSeed;
  uniform vec3 uCam, uCamV, uBox, uHeadP, uHeadD;
  uniform vec2 uWind;
  uniform float uTime, uFall, uShutter, uHeadOn;
  varying float vA, vLit, vAlong;
  varying vec3 vLamp;
  ${LAMP_FIELD_GLSL}
  void main(){
    vec3 vel = vec3(uWind.x, -uFall * (0.8 + 0.4 * aSeed.w), uWind.y);
    vec3 o = vec3(uCam.x, max(-1.0, uCam.y - 6.0), uCam.z) - vec3(uBox.x, 0.0, uBox.z) * 0.5;
    vec3 p = o + mod(aSeed.xyz * uBox + vel * uTime - o, uBox);
    // along the drop's way past the camera, as long as it goes in the exposure
    vec3 rel = vel - uCamV;
    float sp = length(rel);
    vec3 dir = rel / max(sp, 1e-3);
    float len = clamp(sp * uShutter, 0.25, 3.0);
    vec3 toCam = uCam - p;
    float dist = length(toCam);
    // (across the streak, wound to face the camera)
    vec3 side = normalize(cross(toCam / max(dist, 1e-3), dir));
    // (a little wider far off, so a drop never thins to nothing between pixels)
    float wide = 0.0035 + dist * 0.0007;
    vec3 w = p + side * position.x * wide - dir * position.y * len;
    // faded far off, at the box's edges, close to the camera, and under the ground; and the longer
    // the streak, the fainter (the same drop drawn out over more of the picture)
    vA = smoothstep(${f(BOX.x / 2)}, ${f(BOX.x / 2 - 8)}, dist) * smoothstep(2.5, 7.0, dist) * step(0.0, w.y)
      * clamp(0.5 / len, 0.3, 1.0);
    // lit where the headlights reach it
    vec3 hd = p - uHeadP;
    float hl = length(hd);
    vLit = uHeadOn * smoothstep(0.86, 0.96, dot(hd / max(hl, 1e-3), uHeadD)) * smoothstep(30.0, 4.0, hl);
    // and glittering in the street lights
    vLamp = lampGlow(p);
    vAlong = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`
const STREAK_F = `
  uniform vec3 uLight;
  uniform float uAlpha;
  varying float vA, vLit, vAlong;
  varying vec3 vLamp;
  void main(){
    float a = vA * uAlpha * (1.0 - 0.6 * vAlong);
    if (a < 0.003) discard;
    float glint = min(1.0, dot(vLamp, vec3(0.33)) * 0.6);
    vec3 col = uLight + vec3(1.0, 0.96, 0.9) * vLit * 1.6 + vLamp * 0.5;
    gl_FragColor = vec4(col, a * (1.0 + vLit * 2.0 + glint * 1.5));
  }`

// a splash's crown: a ring thrown out from where the drop landed, and a few droplets inside it
const SPLASH_V = `
  attribute vec3 aSeed;
  uniform vec3 uCam;
  uniform float uTime;
  varying vec2 vQ;
  varying float vPh, vNear;
  float sHash (vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  void main(){
    float cyc = uTime * (2.2 + 1.3 * aSeed.z) + aSeed.z * 17.0;
    float n = floor(cyc);
    vPh = fract(cyc);
    // a new spot round the camera each landing
    float a = 6.2832 * sHash(aSeed.xy + n * 0.37), r = ${f(
      SPLASH_R
    )} * sqrt(sHash(aSeed.yx + n * 0.71));
    vec2 at = uCam.xz + vec2(cos(a), sin(a)) * r;
    // the ground's height there: the pavement is up on its kerb, the road (inside the ring road's
    // outer edge) isn't
    vec2 u = abs(at - floor(at / ${f(PITCH)} + 0.5) * ${f(PITCH)});
    float road = step(min(u.x, u.y), ${f(ROAD_HW)})
      * step(max(abs(at.x), abs(at.y)), ${f(HALF + ROAD_HW)});
    float y = mix(${f(CURB_H + 0.012)}, 0.012, road);
    float s = 0.03 + 0.09 * vPh;
    // (none right under the camera, where one would be a big ring on the screen)
    vNear = smoothstep(2.5, 7.0, length(vec3(at.x, y, at.y) - uCam));
    vQ = position.xz * 2.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(at.x + position.x * s * 2.0, y, at.y + position.z * s * 2.0, 1.0);
  }`
const SPLASH_F = `
  uniform vec3 uLight;
  uniform float uAlpha;
  varying vec2 vQ;
  varying float vPh, vNear;
  void main(){
    float r = length(vQ);
    float ring = smoothstep(0.3, 0.0, abs(r - 0.6)) * (1.0 - vPh);
    float a = ring * uAlpha * (1.0 - vPh) * vNear;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uLight * 1.2, a);
  }`

export class Rain {
  constructor (scene) {
    // streaks: a thin quad, x across the streak (-1 to 1), y from its head (0) to its tail (1)
    const q = new THREE.InstancedBufferGeometry()
    q.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0],
        3
      )
    )
    const seed = new Float32Array(MAX * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    q.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
    q.instanceCount = 0
    const v3 = () => ({ value: new THREE.Vector3() })
    this.u = {
      ...LAMP,
      uCam: v3(),
      uCamV: v3(),
      uBox: { value: BOX.clone() },
      uHeadP: v3(),
      uHeadD: v3(),
      uWind: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uFall: { value: 9 },
      uShutter: { value: 1 / 40 },
      uHeadOn: { value: 0 },
      uLight: v3(),
      uAlpha: { value: 0 }
    }
    this.streaks = new THREE.Mesh(
      q,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        vertexShader: STREAK_V,
        fragmentShader: STREAK_F,
        transparent: true,
        depthWrite: false
      })
    )
    // splashes: a flat quad each
    const sq = new THREE.InstancedBufferGeometry()
    sq.copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
    const ss = new Float32Array(SPLASHES * 3)
    for (let i = 0; i < ss.length; i++) ss[i] = Math.random() * 100
    sq.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 3))
    sq.instanceCount = 0
    this.su = {
      uCam: this.u.uCam,
      uTime: this.u.uTime,
      uLight: this.u.uLight,
      uAlpha: { value: 0 }
    }
    this.splashes = new THREE.Mesh(
      sq,
      new THREE.ShaderMaterial({
        uniforms: this.su,
        vertexShader: SPLASH_V,
        fragmentShader: SPLASH_F,
        transparent: true,
        depthWrite: false
      })
    )
    for (const m of [this.streaks, this.splashes]) {
      m.frustumCulled = false
      m.renderOrder = 3
      m.visible = false
      scene.add(m)
    }
    // (neither is in the street's reflection)
    this.streaks.layers.set(GROUND)
    this.splashes.layers.set(GROUND)
    this.camLast = new THREE.Vector3()
    this.camV = new THREE.Vector3()
    this.share = 1 // the graphics quality's share of the drops
  }
  // once a frame. rain: how hard (0 to 1); camera; dt: real s; env: wind and light (ENV);
  // light: the sky's light colour (rgb, scaled); head: the Roadster's headlights, if on
  update (rain, camera, dt, env, light, head) {
    const on = rain > 0.005
    this.streaks.visible = this.splashes.visible = on
    if (!on) return
    const u = this.u
    u.uTime.value += dt
    const p = camera.position
    // the camera's own velocity (smoothed), which slants the streaks
    if (dt > 0) {
      const k = Math.min(1, dt * 6)
      const vx = (p.x - this.camLast.x) / dt,
        vy = (p.y - this.camLast.y) / dt,
        vz = (p.z - this.camLast.z) / dt
      if (Math.hypot(vx, vy, vz) < 150)
        u.uCamV.value.lerp(this.camV.set(vx, vy, vz), k)
    }
    this.camLast.copy(p)
    u.uCam.value.copy(p)
    const wind = 1.5 + 9 * env.wind
    u.uWind.value.set(
      Math.cos(env.windDir) * wind,
      Math.sin(env.windDir) * wind
    )
    u.uFall.value = 8.5 + 1.5 * rain
    u.uLight.value.set(light.r, light.g, light.b).multiplyScalar(0.9)
    u.uAlpha.value = 0.12 + 0.2 * rain
    this.su.uAlpha.value = 0.18 + 0.24 * rain
    this.streaks.geometry.instanceCount = Math.round(
      MAX * this.share * Math.min(1, 0.15 + rain)
    )
    this.splashes.geometry.instanceCount = Math.round(
      SPLASHES * this.share * Math.min(1, 0.1 + rain)
    )
    if (head) {
      u.uHeadOn.value = 1
      head.getWorldPosition(u.uHeadP.value)
      head.target.getWorldPosition(u.uHeadD.value)
      u.uHeadD.value.sub(u.uHeadP.value).normalize()
    } else u.uHeadOn.value = 0
  }
}
