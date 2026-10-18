// Smoke, vapor and dust. Each puff is carried by the air rather than flung: it relaxes towards the air
// around it, which is a light breeze, a swirl that changes from place to place (so a cloud billows and
// curls instead of drifting off in one piece) and the wake the car drags along behind it. Hot tyre
// smoke rises and the thrusters' cold vapor sinks, each less so as it mixes with the air and comes to
// its temperature. A puff that reaches the ground spreads out across it, and every puff swells and
// thins as it mixes in. They are drawn as camera-facing billows, lit by the scene's sun and sky (bright
// at the edges against the low sun, darker on the side away from it), faded where they meet the ground
// and in the haze, and sorted far to near so the clouds layer properly.
import * as THREE from 'three'
import { TAU } from '../sim/constants.js'
import { scene, key, hemi, keyOffset } from './scene.js'
import { ENV } from '../sim/env.js'

// Kinds of smoke: colour (albedo), life (s), start and end size (m), opacity, drag towards the air
// (1/s), buoyancy (m/s^2: + rises, - sinks) and how long it lasts before the puff is at the air's
// temperature (s), the strength of the swirl (m/s) and how much of its fall a puff turns into spread
// across the ground.
export const VAPOR = {
  col: [0.93, 0.95, 0.98],
  life: [1.1, 2.6],
  s0: 0.4,
  s1: [3.2, 6],
  alpha: 0.4,
  drag: 1.9,
  buoy: -0.9,
  tau: 2.5,
  turb: 1.3,
  spread: 0.8
}
export const TYRE = {
  col: [0.84, 0.84, 0.86],
  life: [2.6, 4.6],
  s0: 0.45,
  s1: [3, 5.5],
  alpha: 0.3,
  drag: 1.3,
  buoy: 1.6,
  tau: 1.4,
  turb: 0.8,
  spread: 0.6
}
export const DUST = {
  col: [0.68, 0.64, 0.58],
  life: [1.8, 3.8],
  s0: 1,
  s1: [4.5, 7.5],
  alpha: 0.3,
  drag: 1.5,
  buoy: -0.4,
  tau: 3,
  turb: 0.7,
  spread: 0.5
}

const MAX = 6000
// what each puff carries besides its position, velocity and colour: one Float32Array apiece
const FIELDS = [
  ...['age', 'life', 's0', 's1', 'a0', 'drag', 'buoy', 'tau', 'turb'],
  ...['spread', 'floor', 'rot', 'spin', 'seed', 'cell', 'size', 'alpha']
]
const WAKE_R = 3.2 // m round the car where the air is dragged along with it
const WAKE = 0.55 // how much of the car's speed that air picks up, at the car
const rand = (a, b) => a + Math.random() * (b - a)

// Four billows in a 2x2 atlas: density in alpha, and in rgb the surface normal of a lumpy ball of
// that density (the swirls stand out from the ball, so the sun picks them out).
function atlas () {
  const S = 128,
    W = 2 * S,
    data = new Uint8Array(W * W * 4)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const lattice = new Float32Array(64 * 64).map(rnd)
  const lat = (x, y) => lattice[(y & 63) * 64 + (x & 63)]
  const noise = (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy
    const u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy)
    const a = lat(ix, iy) + (lat(ix + 1, iy) - lat(ix, iy)) * u
    const b = lat(ix, iy + 1) + (lat(ix + 1, iy + 1) - lat(ix, iy + 1)) * u
    return a + (b - a) * v
  }
  // billowy fractal noise: creased where the plain noise crosses its middle
  const billow = (x, y) => {
    let s = 0,
      a = 0.5,
      f = 1
    for (let o = 0; o < 5; o++) {
      s += a * (1 - Math.abs(2 * noise(x * f, y * f) - 1))
      a *= 0.5
      f *= 2.03
    }
    return s
  }
  const dens = new Float32Array(S * S)
  for (let c = 0; c < 4; c++) {
    const ox = 17 * c + 3,
      oy = 31 * c + 11
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 - 1,
          y = ((j + 0.5) / S) * 2 - 1
        const n = billow(x * 2.2 + ox, y * 2.2 + oy)
        // a soft ball with a ragged edge, lumpy inside
        const r = Math.hypot(x, y) + 0.32 * (n - 0.45)
        const ball = Math.max(0, 1 - r * r) ** 1.4
        dens[j * S + i] = Math.min(1, ball * (0.35 + 0.95 * n))
      }
    const bx = (c & 1) * S,
      by = (c >> 1) * S
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 - 1,
          y = ((j + 0.5) / S) * 2 - 1
        const d = (ii, jj) =>
          dens[Math.min(S - 1, Math.max(0, jj)) * S + Math.min(S - 1, ii)]
        const gx = (d(i + 1, j) - d(Math.max(0, i - 1), j)) * 0.5 * S * 0.06,
          gy = (d(i, j + 1) - d(i, j - 1)) * 0.5 * S * 0.06
        const r2 = Math.min(0.98, x * x + y * y)
        let nx = x - gx,
          ny = y - gy,
          nz = Math.sqrt(1 - r2)
        const l = Math.hypot(nx, ny, nz)
        nx /= l
        ny /= l
        nz /= l
        const k = ((by + j) * W + bx + i) * 4
        data[k] = (nx * 0.5 + 0.5) * 255
        data[k + 1] = (ny * 0.5 + 0.5) * 255
        data[k + 2] = (nz * 0.5 + 0.5) * 255
        data[k + 3] = dens[j * S + i] * 255
      }
  }
  const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

const VERT = `attribute vec3 iPos; attribute vec4 iMisc; attribute vec4 iCol;
  uniform float uRightY, uUpY;
  varying vec2 vQ; varying vec2 vCS; varying vec4 vCol; varying vec3 vPos; varying float vA, vH, vR;
  void main(){
    float r = iMisc.x * 0.5, c = cos(iMisc.z), s = sin(iMisc.z);
    vec2 q = position.xy * 2.0;
    vec2 off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * r;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vPos = mv.xyz;
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    vQ = q;
    vCS = vec2(c, s);
    vCol = iCol;
    vR = r;
    // gone when the camera is inside it
    vA = iMisc.y * smoothstep(0.35, 1.1, -vPos.z / r);
    // how far this part of the billow is above the ground under it
    vH = iPos.y + off.x * uRightY + off.y * uUpY - iMisc.w;
  }`
const FRAG = `uniform sampler2D uTex;
  uniform vec3 uSunV, uUpV, uSun, uSky, uGround, uFogCol; uniform float uFogD, uFill;
  varying vec2 vQ; varying vec2 vCS; varying vec4 vCol; varying vec3 vPos; varying float vA, vH, vR;
  void main(){
    vec2 cell = vec2(mod(vCol.w, 2.0), floor(vCol.w * 0.5)) * 0.5;
    vec4 t = texture2D(uTex, cell + (vQ * 0.5 + 0.5) * 0.5);
    float a = t.a * vA * smoothstep(0.0, 0.25 + 0.35 * vR, vH);
    if (a < 0.003) discard;
    vec3 nt = t.rgb * 2.0 - 1.0;
    vec3 n = normalize(vec3(vCS.x * nt.x - vCS.y * nt.y, vCS.y * nt.x + vCS.x * nt.y, nt.z));
    // light soaks into a cloud: wrapped diffuse, darker deep in a dense core
    float diff = clamp((dot(n, uSunV) + 0.5) / 1.5, 0.0, 1.0) * (1.0 - 0.3 * t.a);
    vec3 amb = mix(uGround, uSky, 0.5 + 0.5 * dot(n, uUpV)) * 1.4;
    vec3 col = vCol.rgb * ((uSun * diff + amb) * 0.3183 + uFill);
    // forward scattering: a thin veil glows looking towards the sun through it
    float g = 0.6, ct = dot(normalize(vPos), uSunV);
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5) * 0.0796;
    col += uSun * vCol.rgb * hg * (1.0 - 0.7 * t.a) * 0.9;
    float f = uFogD * length(vPos);
    col = mix(col, uFogCol, 1.0 - exp(-f * f));
    gl_FragColor = vec4(col, a);
  }`

class Smoke {
  constructor () {
    this.n = 0
    this.time = 0
    this.pos = new Float32Array(MAX * 3)
    this.vel = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 3)
    for (const k of FIELDS) this[k] = new Float32Array(MAX)
    this.keys = new Uint32Array(MAX)
    this.wind = new THREE.Vector3(1.2, 0, 0.5)
    this.car = new THREE.Vector3()
    this.carV = new THREE.Vector3()
    const g = new THREE.InstancedBufferGeometry()
    g.copy(new THREE.PlaneGeometry(1, 1))
    const attr = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(MAX * size),
        size
      ).setUsage(THREE.DynamicDrawUsage)
      g.setAttribute(name, a)
      return a
    }
    this.iPos = attr('iPos', 3)
    this.iMisc = attr('iMisc', 4)
    this.iCol = attr('iCol', 4)
    g.instanceCount = 0
    this.geo = g
    const v3 = () => ({ value: new THREE.Vector3() })
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: atlas() },
        uScale: { value: 600 }, // (unused: the puffs are sized in metres)
        uRightY: { value: 0 },
        uUpY: { value: 1 },
        uSunV: v3(),
        uUpV: v3(),
        uSun: v3(),
        uSky: v3(),
        uGround: v3(),
        uFogCol: v3(),
        uFogD: { value: 0 },
        uFill: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false
    })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
  }

  // P: the kind of smoke (VAPOR, TYRE, DUST). floor: the height of the ground under it (a roof, or
  // the street). size, life, drag: scale the kind's own.
  spawn (P, x, y, z, vx, vy, vz, floor = 0, size = 1, life = 1, drag = 1) {
    if (this.n >= MAX) return
    const i = this.n++,
      j = i * 3
    this.pos[j] = x
    this.pos[j + 1] = y
    this.pos[j + 2] = z
    this.vel[j] = vx
    this.vel[j + 1] = vy
    this.vel[j + 2] = vz
    const shade = 0.94 + Math.random() * 0.1
    this.col[j] = P.col[0] * shade
    this.col[j + 1] = P.col[1] * shade
    this.col[j + 2] = P.col[2] * shade
    this.age[i] = 0
    this.life[i] = rand(P.life[0], P.life[1]) * life
    this.s0[i] = P.s0 * size
    this.s1[i] = rand(P.s1[0], P.s1[1]) * size
    this.a0[i] = P.alpha * (0.8 + Math.random() * 0.4)
    this.drag[i] = P.drag * drag
    this.buoy[i] = P.buoy * (0.7 + Math.random() * 0.6)
    this.tau[i] = P.tau
    this.turb[i] = P.turb * (0.7 + Math.random() * 0.6)
    this.spread[i] = P.spread
    this.floor[i] = floor
    this.rot[i] = Math.random() * TAU
    this.spin[i] = (Math.random() - 0.5) * 1.2
    this.seed[i] = Math.random() * TAU
    this.cell[i] = Math.floor(Math.random() * 4)
    this.size[i] = this.s0[i]
    this.alpha[i] = 0
  }
  kill (i) {
    const l = --this.n
    if (i === l) return
    this.pos.copyWithin(i * 3, l * 3, l * 3 + 3)
    this.vel.copyWithin(i * 3, l * 3, l * 3 + 3)
    this.col.copyWithin(i * 3, l * 3, l * 3 + 3)
    for (const k of FIELDS) this[k][i] = this[k][l]
  }
  clear () {
    this.n = 0
    this.geo.instanceCount = 0
  }

  // Once a frame before update: the camera (to light and sort the puffs), the car (its wake) and
  // which world it is in (the breeze, and the light the floodlights add at the test site).
  track (camera, sim) {
    const p = sim.mode === 'ground' || sim.mode === 'ramp' ? sim.pos : sim.com
    this.car.set(p.x, p.y + 0.5, p.z)
    this.carV.copy(sim.vel)
    this.camera = camera
    const city = sim.world === 'city'
    // (in the city, the weather's wind: a breeze, or a storm's gale)
    if (city) {
      const w = 0.8 + 7 * ENV.wind
      this.wind.set(Math.cos(ENV.windDir) * w, 0, Math.sin(ENV.windDir) * w)
    } else this.wind.set(0.7, 0, -0.4)
    const u = this.mat.uniforms,
      inv = camera.matrixWorldInverse,
      e = camera.matrixWorld.elements
    u.uSunV.value.copy(keyOffset).normalize().transformDirection(inv)
    u.uUpV.value.set(0, 1, 0).transformDirection(inv)
    u.uRightY.value = e[1]
    u.uUpY.value = e[5]
    u.uSun.value
      .set(key.color.r, key.color.g, key.color.b)
      .multiplyScalar(key.intensity)
    u.uSky.value
      .set(hemi.color.r, hemi.color.g, hemi.color.b)
      .multiplyScalar(hemi.intensity)
    u.uGround.value
      .set(hemi.groundColor.r, hemi.groundColor.g, hemi.groundColor.b)
      .multiplyScalar(hemi.intensity)
    const fog = scene.fog
    u.uFogCol.value.set(fog.color.r, fog.color.g, fog.color.b)
    u.uFogD.value = fog.density || 0
    u.uFill.value = city ? 0 : 0.42
  }

  update (dt) {
    if (dt > 0) this.step(dt)
    this.upload()
  }
  step (dt) {
    const T = (this.time += dt),
      p = this.pos,
      v = this.vel
    const gust = 0.75 + 0.35 * Math.sin(T * 0.23) + 0.15 * Math.sin(T * 0.71)
    const wx = this.wind.x * gust,
      wz = this.wind.z * gust
    const { x: cx, y: cy, z: cz } = this.car,
      { x: cvx, y: cvy, z: cvz } = this.carV
    const R2 = WAKE_R * WAKE_R
    let i = 0
    while (i < this.n) {
      const age = (this.age[i] += dt)
      if (age >= this.life[i]) {
        this.kill(i)
        continue
      }
      const j = i * 3,
        x = p[j],
        y = p[j + 1],
        z = p[j + 2],
        ph = this.seed[i],
        tb = this.turb[i]
      // the air here: the breeze, plus a swirl in which each component varies only across the other
      // two axes (so it neither piles the smoke up nor thins it out), plus the car's wake
      let ax =
        wx +
        tb *
          (Math.sin(0.31 * y + 0.7 * T + ph) +
            0.5 * Math.sin(0.83 * z - 1.1 * T))
      let ay =
        tb *
        0.6 *
        (Math.sin(0.29 * z + 0.9 * T + ph) + 0.5 * Math.sin(0.77 * x + 1.3 * T))
      let az =
        wz +
        tb *
          (Math.sin(0.37 * x - 0.8 * T + ph) +
            0.5 * Math.sin(0.91 * y + 1.2 * T))
      const dx = x - cx,
        dy = y - cy,
        dz = z - cz,
        d2 = dx * dx + dy * dy + dz * dz
      if (d2 < R2) {
        const k = WAKE * (1 - d2 / R2)
        ax += cvx * k
        ay += cvy * k
        az += cvz * k
      }
      const f = Math.exp(-this.drag[i] * dt)
      v[j] = ax + (v[j] - ax) * f
      v[j + 1] =
        ay +
        (v[j + 1] - ay) * f +
        this.buoy[i] * Math.exp(-age / this.tau[i]) * dt
      v[j + 2] = az + (v[j + 2] - az) * f
      p[j] += v[j] * dt
      p[j + 1] += v[j + 1] * dt
      p[j + 2] += v[j + 2] * dt
      // the ground: a puff can't go through it, so what was carrying it down spreads it out instead
      const t = age / this.life[i],
        grow = (1 - Math.exp(-4 * t)) / (1 - Math.exp(-4))
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * grow
      const low = this.floor[i] + 0.2 * size
      if (p[j + 1] < low) {
        p[j + 1] = low
        if (v[j + 1] < 0) {
          const h = -v[j + 1] * this.spread[i]
          let hx = v[j],
            hz = v[j + 2]
          const hl = Math.hypot(hx, hz)
          if (hl > 0.5) {
            hx /= hl
            hz /= hl
          } else {
            const a = Math.random() * TAU
            hx = Math.cos(a)
            hz = Math.sin(a)
          }
          v[j] += hx * h
          v[j + 2] += hz * h
          v[j + 1] = 0
        }
      }
      this.size[i] = size
      // there at once (the cold jet condenses the air as it leaves the nozzle; smoke pours straight
      // out of a tyre), thinner as it spreads, and gone by the end of its life
      this.alpha[i] =
        this.a0[i] *
        Math.min(1, age / 0.04) *
        Math.pow(1 - t, 1.3) *
        Math.sqrt(this.s0[i] / size + 0.25)
      this.rot[i] += this.spin[i] * dt
      this.spin[i] *= Math.exp(-0.5 * dt)
      i++
    }
  }
  // far to near, so the clouds layer properly (the sort key packs depth over index)
  upload () {
    const n = this.n,
      cam = this.camera
    this.geo.instanceCount = n
    if (!n || !cam) return
    const e = cam.matrixWorld.elements
    const ox = e[12],
      oy = e[13],
      oz = e[14],
      fx = -e[8],
      fy = -e[9],
      fz = -e[10]
    const p = this.pos,
      keys = this.keys
    for (let i = 0; i < n; i++) {
      const d =
        (p[i * 3] - ox) * fx +
        (p[i * 3 + 1] - oy) * fy +
        (p[i * 3 + 2] - oz) * fz
      const q = Math.max(0, Math.min(65535, (d + 50) * 24)) | 0
      keys[i] = (65535 - q) * 65536 + i
    }
    const sorted = keys.subarray(0, n).sort()
    const P = this.iPos.array,
      M = this.iMisc.array,
      C = this.iCol.array
    for (let k = 0; k < n; k++) {
      const i = sorted[k] & 0xffff
      P[k * 3] = p[i * 3]
      P[k * 3 + 1] = p[i * 3 + 1]
      P[k * 3 + 2] = p[i * 3 + 2]
      M[k * 4] = this.size[i]
      M[k * 4 + 1] = this.alpha[i]
      M[k * 4 + 2] = this.rot[i]
      M[k * 4 + 3] = this.floor[i]
      C[k * 4] = this.col[i * 3]
      C[k * 4 + 1] = this.col[i * 3 + 1]
      C[k * 4 + 2] = this.col[i * 3 + 2]
      C[k * 4 + 3] = this.cell[i]
    }
    for (const [a, size] of [
      [this.iPos, 3],
      [this.iMisc, 4],
      [this.iCol, 4]
    ]) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, n * size)
      a.needsUpdate = true
    }
  }
}

export const smoke = new Smoke()
