// Particles (jet cores, sparks, leaves, chips, glass), supersonic shock-diamond jets, and what
// the car throws up: vapor, tyre smoke, dust, sand (smoke.js; spray: spray.js) and debris.
import * as THREE from 'three'
import { scene, softTex } from './scene.js'
import { TAU, clamp01 } from '../sim/constants.js'
import { PALMS, TREES } from '../sim/city.js'
import { smoke, VAPOR, TYRE, DUST } from './smoke.js'
import { emitSpray, WATER } from './spray.js'

class Particles {
  // splash: whether it skips off the ground (sparks, leaves) or is gone when it gets there (jet cores)
  constructor (
    max,
    { additive = false, colA, colB, gravity = 0, buoyancy = 0, splash = true }
  ) {
    Object.assign(this, { max, n: 0, gravity, buoyancy, splash })
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.age = new Float32Array(max)
    this.life = new Float32Array(max)
    this.s0 = new Float32Array(max)
    this.s1 = new Float32Array(max)
    this.a0 = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.floor = new Float32Array(max)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.heat = new Float32Array(max)
    const g = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(
      THREE.DynamicDrawUsage
    )
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(
      THREE.DynamicDrawUsage
    )
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(
      THREE.DynamicDrawUsage
    )
    this.aHeat = new THREE.BufferAttribute(this.heat, 1).setUsage(
      THREE.DynamicDrawUsage
    )
    g.setAttribute('position', this.aPos)
    g.setAttribute('aSize', this.aSize)
    g.setAttribute('aAlpha', this.aAlpha)
    g.setAttribute('aHeat', this.aHeat)
    g.setDrawRange(0, 0)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: softTex },
        uScale: { value: 600 },
        uColA: { value: colA },
        uColB: { value: colB }
      },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aHeat; uniform float uScale;
        varying float vA; varying float vH;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 900.0); vA = aAlpha * smoothstep(2.0, 7.0, -mv.z); vH = aHeat; }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColA; uniform vec3 uColB; varying float vA; varying float vH;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(mix(uColA, uColB, vH), t.a * vA); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.geo = g
    scene.add(this.points)
  }
  // floor: the height of the ground under it (a roof, or the street)
  spawn (x, y, z, vx, vy, vz, life, s0, s1, a0, drag, floor = 0) {
    if (this.n >= this.max) return
    const i = this.n++,
      j = i * 3
    this.pos[j] = x
    this.pos[j + 1] = y
    this.pos[j + 2] = z
    this.vel[j] = vx
    this.vel[j + 1] = vy
    this.vel[j + 2] = vz
    this.age[i] = 0
    this.life[i] = life
    this.s0[i] = s0
    this.s1[i] = s1
    this.a0[i] = a0
    this.drag[i] = drag
    this.floor[i] = floor
  }
  kill (i) {
    const l = --this.n
    if (i === l) return
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[l * 3 + k]
      this.vel[i * 3 + k] = this.vel[l * 3 + k]
    }
    this.age[i] = this.age[l]
    this.life[i] = this.life[l]
    this.s0[i] = this.s0[l]
    this.s1[i] = this.s1[l]
    this.a0[i] = this.a0[l]
    this.drag[i] = this.drag[l]
    this.floor[i] = this.floor[l]
  }
  update (dt) {
    let i = 0
    while (i < this.n) {
      this.age[i] += dt
      if (this.age[i] >= this.life[i]) {
        this.kill(i)
        continue
      }
      const j = i * 3,
        f = Math.exp(-this.drag[i] * dt)
      this.vel[j] *= f
      this.vel[j + 1] =
        this.vel[j + 1] * f + (this.buoyancy - this.gravity) * dt
      this.vel[j + 2] *= f
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      if (this.pos[j + 1] < this.floor[i] + 0.12) {
        if (!this.splash) {
          this.kill(i)
          continue
        }
        // hit the ground: spread sideways
        this.pos[j + 1] = this.floor[i] + 0.12
        if (this.vel[j + 1] < 0) {
          const h = -this.vel[j + 1] * (this.gravity ? 0.3 : 0.85),
            a = Math.random() * TAU
          this.vel[j] += Math.cos(a) * h
          this.vel[j + 2] += Math.sin(a) * h
          this.vel[j + 1] = this.gravity ? -this.vel[j + 1] * 0.3 : 0
        }
      }
      const t = this.age[i] / this.life[i]
      this.size[i] =
        this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t))
      this.alpha[i] = this.a0[i] * Math.min(1, t * 14) * Math.pow(1 - t, 1.4)
      this.heat[i] = Math.max(0, 1 - t * 3)
      i++
    }
    this.geo.setDrawRange(0, this.n)
    // (only the live part of each buffer goes up to the GPU, and nothing while there is none)
    if (!this.n) return
    for (const [a, size] of [
      [this.aPos, 3],
      [this.aSize, 1],
      [this.aAlpha, 1],
      [this.aHeat, 1]
    ]) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, this.n * size)
      a.needsUpdate = true
    }
  }
  clear () {
    this.n = 0
    this.geo.setDrawRange(0, 0)
  }
}
const jets = new Particles(1200, {
  additive: true,
  splash: false,
  colA: new THREE.Color(0.5, 0.7, 0.95),
  colB: new THREE.Color(2.4, 2.8, 3.2)
})
const sparks = new Particles(500, {
  additive: true,
  colA: new THREE.Color(2.2, 0.6, 0.12),
  colB: new THREE.Color(4, 2.4, 0.8),
  gravity: 9.81
})
// leaves shaken out of a tree that goes over: they flutter down slowly
const leaves = new Particles(900, {
  colA: new THREE.Color(0.07, 0.14, 0.04),
  colB: new THREE.Color(0.2, 0.32, 0.08),
  gravity: 9.81
})
// what a hard knock breaks off: dark chips of bumper and trim, and glass, bright specks falling
const chips = new Particles(600, {
  colA: new THREE.Color(0.035, 0.036, 0.04),
  colB: new THREE.Color(0.12, 0.12, 0.13),
  gravity: 9.81
})
const glass = new Particles(700, {
  additive: true,
  colA: new THREE.Color(0.55, 0.62, 0.7),
  colB: new THREE.Color(1.6, 1.7, 1.8),
  gravity: 9.81
})
export const ALL_PARTICLES = [smoke, jets, sparks, leaves, chips, glass]

// supersonic jets with shock diamonds, one per nozzle
const diamondGeo = new THREE.CylinderGeometry(0.028, 0.058, 1, 12, 1, true)
  .translate(0, 0.5, 0)
  .rotateX(Math.PI / 2)
export function attachDiamonds (RS) {
  for (const nz of RS.nozzles) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: 0 }, uTime: { value: 0 } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uLevel; uniform float uTime; varying vec2 vUv;
        void main(){ float y = vUv.y; float d = pow(0.5 + 0.5 * cos(y * 4.5 * 6.2831), 3.0);
          float a = uLevel * (0.25 + 0.75 * d) * (1.0 - y) * (0.85 + 0.15 * sin(uTime * 90.0 + y * 20.0));
          gl_FragColor = vec4(vec3(1.6, 2.3, 3.2) * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    })
    const mesh = new THREE.Mesh(diamondGeo, m)
    mesh.scale.set(1, 1, 0.01)
    mesh.visible = false
    nz.group.add(mesh)
    nz.diamond = mesh
    nz.level = 0
    nz.carry = 0
    nz.carryJ = 0
  }
}

const _wp = new THREE.Vector3(),
  _wd = new THREE.Vector3(),
  _wq = new THREE.Quaternion()
// Per-nozzle throttle: main and lift levels plus attitude-control pulses while flying.
export function updateNozzles (RS, sim) {
  const inAir = sim.mode === 'air',
    has = sim.air > 0.2
  const att = inAir && has ? sim.att : { pitch: 0, roll: 0, yaw: 0 }
  const L = sim.thrLift
  for (const nz of RS.nozzles) {
    let lv = 0
    if (nz.kind === 'main') lv = sim.thrMain
    else if (nz.kind === 'lift') {
      lv = L
      if (inAir) {
        lv +=
          (nz.local.x > 0 ? Math.max(0, att.pitch) : Math.max(0, -att.pitch)) *
          0.7
        lv +=
          (nz.local.z < 0 ? Math.max(0, att.roll) : Math.max(0, -att.roll)) *
          0.6
      }
    } else if (nz.kind === 'sideL')
      lv = Math.max(0, att.yaw) * 0.8 + Math.abs(att.roll) * 0.35
    else lv = Math.max(0, -att.yaw) * 0.8 + Math.abs(att.roll) * 0.35
    nz.level = clamp01(lv)
  }
}
export function emitThrusters (RS, sim, dt, clock) {
  if (dt <= 0) return
  RS.body.getWorldQuaternion(_wq)
  const vx = sim.vel.x,
    vy = sim.vel.y,
    vz = sim.vel.z
  for (const nz of RS.nozzles) {
    const lv = nz.level
    nz.diamond.visible = lv > 0.02
    nz.diamond.material.uniforms.uLevel.value = lv
    nz.diamond.material.uniforms.uTime.value = clock
    nz.diamond.scale.z = 0.5 + 1.1 * lv
    if (lv < 0.02) continue
    _wp.copy(nz.local)
    RS.body.localToWorld(_wp)
    _wd.copy(nz.dir).applyQuaternion(_wq)
    const big = nz.kind === 'main' || nz.kind === 'lift' ? 1 : 0.45
    // a downward jet close to the pad throws up a far bigger, longer-lived cloud
    const near = _wd.y < -0.5 ? clamp01(1 - (_wp.y - sim.floor) / 8) : 0
    nz.carry += 105 * lv * big * (1 + 2.4 * near) * dt
    while (nz.carry >= 1) {
      nz.carry -= 1
      // the cold jet condenses the air into vapor; fired at the ground it piles up into a cloud
      const sp = 16 + Math.random() * 18,
        j = 2.5,
        f = Math.random() * 0.6
      smoke.spawn(
        VAPOR,
        _wp.x + _wd.x * (0.6 + f),
        _wp.y + _wd.y * (0.6 + f),
        _wp.z + _wd.z * (0.6 + f),
        vx * 0.85 + _wd.x * sp + (Math.random() - 0.5) * j,
        vy * 0.85 + _wd.y * sp + (Math.random() - 0.5) * j,
        vz * 0.85 + _wd.z * sp + (Math.random() - 0.5) * j,
        sim.floor,
        big * (1 + 0.3 * near),
        1 + 0.5 * near,
        1 - 0.3 * near
      )
    }
    nz.carryJ += 150 * lv * big * dt
    while (nz.carryJ >= 1) {
      nz.carryJ -= 1
      const sp = 45 + Math.random() * 25
      jets.spawn(
        _wp.x,
        _wp.y,
        _wp.z,
        vx + _wd.x * sp,
        vy + _wd.y * sp,
        vz + _wd.z * sp,
        0.035 + Math.random() * 0.035, // the supersonic core is only a couple of metres long
        0.14 * big + 0.04,
        0.55 * big + 0.1,
        0.75,
        3.0,
        sim.floor
      )
    }
  }
}
// Tyre smoke where a tyre is sliding (e-brake drifts, lock-ups, sliding sideways). A sliding tyre
// heats its rubber in proportion to the power it rubs away, so the smoke comes thicker with how hard
// it slides and how fast; it pours out of the contact patch, hot, and climbs as it trails behind.
const _tw = new THREE.Vector3()
// sand thrown up off the tyres on the beach: low, quick puffs that fall back
const SAND = {
  ...DUST,
  col: [0.86, 0.76, 0.57],
  life: [0.8, 1.7],
  s0: 0.35,
  s1: [1.4, 2.8],
  alpha: 0.34,
  buoy: -1.4,
  spread: 0.8
}
export function emitTireSmoke (RS, sim, dt) {
  WATER.splash = 0
  if (dt <= 0 || sim.mode !== 'ground') return
  // (in a burnout the rears' tread runs past the road however slowly the car goes; the fronts are
  // held on their brakes)
  const roll = sim.groundSpeed(),
    spun = Math.max(roll, (sim.burnSpin || 0) * 0.5)
  if (spun < 2.5) return
  const wet = emitSpray(RS, sim, dt, roll, spun) // (on a wet road: spray.js)
  if (sim.surface === 'sand')
    RS.wheels.forEach(w => {
      // a rooster tail off each tyre, heavier off the driven, slipping rears
      const slip = w.front ? sim.skidF : sim.skidR
      const speed = w.front ? roll : spun
      if (speed < 2.5) return
      w.sand =
        (w.sand || 0) +
        (w.front ? 9 : 16) * Math.min(1.6, speed / 14) * (1 + 2 * slip) * dt
      while (w.sand >= 1) {
        w.sand -= 1
        w.pivot.getWorldPosition(_tw)
        smoke.spawn(
          SAND,
          _tw.x + (Math.random() - 0.5) * 0.3,
          sim.pos.y + 0.15,
          _tw.z + (Math.random() - 0.5) * 0.3,
          sim.vel.x * 0.25 + (Math.random() - 0.5) * 2,
          1 + Math.random() * 2.2,
          sim.vel.z * 0.25 + (Math.random() - 0.5) * 2,
          sim.pos.y,
          0.7 + Math.random() * 0.5
        )
      }
    })
  RS.wheels.forEach(w => {
    const amt = (w.front ? sim.skidF : sim.skidR) * (1 - 0.8 * wet) // (less on water)
    if (amt < 0.3) return
    const speed = w.front ? roll : spun
    w.smoke = (w.smoke || 0) + 46 * amt * amt * Math.min(1.3, speed / 14) * dt
    while (w.smoke >= 1) {
      w.smoke -= 1
      w.pivot.getWorldPosition(_tw)
      smoke.spawn(
        TYRE,
        _tw.x + (Math.random() - 0.5) * 0.35,
        sim.pos.y + 0.2,
        _tw.z + (Math.random() - 0.5) * 0.35,
        sim.vel.x * 0.35 + (Math.random() - 0.5) * 1.5,
        0.3 + Math.random() * 0.6,
        sim.vel.z * 0.35 + (Math.random() - 0.5) * 1.5,
        sim.pos.y,
        0.7 + 0.4 * amt
      )
    }
  })
}

// A ring of dust thrown out along the ground. y: the ground it kicks up from (a roof, or the street).
export function burst (x, z, n, speed, y = 0, size = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU,
      s = speed * (0.4 + Math.random() * 0.8)
    smoke.spawn(
      DUST,
      x + Math.cos(a) * 1.2 * size,
      y + 0.3 + Math.random() * 0.6,
      z + Math.sin(a) * 1.2 * size,
      Math.cos(a) * s,
      0.6 + Math.random() * 2.2,
      Math.sin(a) * s,
      y,
      size
    )
  }
}
// Chips and glass off a hard knock at p (impact: m/s of speed lost), thrown on with the car (vel)
export function debrisBurst (p, impact, vel, floor = 0) {
  const n = Math.min(70, Math.floor(impact * 4))
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU,
      out = 1.5 + Math.random() * impact * 0.5,
      up = 1 + Math.random() * (2 + impact * 0.25),
      kind = Math.random() < 0.55 ? chips : glass
    kind.spawn(
      p.x + (Math.random() - 0.5) * 0.6,
      Math.max(floor + 0.25, p.y),
      p.z + (Math.random() - 0.5) * 0.6,
      vel.x * 0.35 + Math.cos(a) * out,
      up,
      vel.z * 0.35 + Math.sin(a) * out,
      0.9 + Math.random() * 1.6,
      kind === chips ? 0.07 : 0.03,
      kind === chips ? 0.05 : 0.02,
      kind === chips ? 0.95 : 0.8,
      0.6,
      floor
    )
  }
}
// floor: the ground the sparks bounce on
export function sparkBurst (p, n, floor = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU,
      e = Math.random() * 1.2,
      s = 4 + Math.random() * 12
    sparks.spawn(
      p.x,
      p.y + 0.3,
      p.z,
      Math.cos(a) * Math.cos(e) * s,
      Math.sin(e) * s + 2,
      Math.sin(a) * Math.cos(e) * s,
      0.5 + Math.random() * 0.8,
      0.12,
      0.05,
      1,
      0.6,
      floor
    )
  }
}
// What flies off whatever the car snapped (the sim's 'knock' event): leaves shaken out of a tree's
// crown, sparks off a steel pole, and dust and grit from its foot, thrown the way the car was going.
export function knockFx (e) {
  const tree = e.kind === 'tree' || e.kind === 'palm'
  // (from the crown: a palm's head up its trunk, 21 to 30 m on the tall fan palms, a tree's crown)
  const top =
    e.kind === 'palm'
      ? (PALMS[e.i]?.h ?? 11) - 1
      : e.kind === 'tree'
      ? 4.4 * (TREES[e.i]?.s ?? 1)
      : 7
  const v = Math.min(20, e.impact)
  if (tree)
    for (let i = 0; i < 70 + v * 6; i++) {
      const a = Math.random() * TAU,
        r = Math.random() * 2.2,
        s = 1 + Math.random() * 3
      leaves.spawn(
        e.x + Math.cos(a) * r,
        top + (Math.random() - 0.3) * 2,
        e.z + Math.sin(a) * r,
        e.dx * v * 0.3 + Math.cos(a) * s,
        Math.random() * 3,
        e.dz * v * 0.3 + Math.sin(a) * s,
        2.5 + Math.random() * 3,
        0.16,
        0.12,
        0.95,
        3.2
      )
    }
  else sparkBurst({ x: e.x, y: 0.4, z: e.z }, 20 + v * 2)
  for (let i = 0; i < 10; i++)
    smoke.spawn(
      DUST,
      e.x + (Math.random() - 0.5),
      0.4,
      e.z + (Math.random() - 0.5),
      e.dx * v * 0.4 + (Math.random() - 0.5) * 3,
      0.5 + Math.random(),
      e.dz * v * 0.4 + (Math.random() - 0.5) * 3,
      0,
      0.5
    )
}
// A fallen pole or tree hits the ground at (x, z): a puff of dust where it lands.
export function fallFx (x, z, kind) {
  const tree = kind === 'tree' || kind === 'palm'
  burst(x, z, tree ? 16 : 10, tree ? 3 : 4, 0, tree ? 0.7 : 0.45)
}
