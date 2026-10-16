// Street furniture: street lights, palms on the boulevards, park trees and a signal mast on every
// corner whose red, yellow and green lamps follow the intersection's signal plan. All instanced, and
// all of it goes over when the Roadster hits it hard enough (the sim decides: breakables.js).
import * as THREE from 'three'
import { hdr, softTex } from './scene.js'
import { merge, box, tint } from './geo.js'
import { G, clamp } from '../sim/constants.js'
import {
  rng,
  NODES,
  CURB_H,
  LAMPS,
  PALMS,
  TREES,
  POLES,
  DIRS,
  RED,
  YELLOW,
  GREEN,
  ROAD_HW,
  LANE_OFF,
  signal
} from '../sim/city.js'

const R = rng(99)
const _m = new THREE.Matrix4(),
  _l = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler()
const pose = (x, y, z, yaw, sx = 1, sy = 1, sz = 1, tilt = 0, tiltDir = 0) => {
  _e.set(Math.cos(tiltDir) * tilt, yaw, Math.sin(tiltDir) * tilt, 'YXZ')
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz))
}
function instanced (geo, mat, list, place, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, list.length)
  list.forEach((it, i) => m.setMatrixAt(i, place(it, i)))
  m.castShadow = shadow
  m.receiveShadow = true
  return m
}
const metal = new THREE.MeshStandardMaterial({
  color: 0x34373c,
  roughness: 0.5,
  metalness: 0.6
})

// ---------- what goes over when it is hit: the instanced parts of each one, moved as one ----------
// A post snapped off at its foot falls like a rigid body hinged at the ground: it tips with angular
// acceleration g sin(tilt) / L, where L is the length of the pendulum it makes (about two thirds of its
// height for a pole, nearly all of it for a top-heavy tree), starting from the shove the hit gave it.
// Its foot skids on the way it was shoved until friction stops it, and it comes to rest lying down,
// or propped on its crown.
const _ax = new THREE.Vector3(),
  _tq = new THREE.Quaternion(),
  _k = new THREE.Matrix4()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
class Fallers {
  // list: the sim's LAMPS, POLES, TREES or PALMS. parts: [{ mesh, of: i => its instances in mesh,
  // dark }], dark ones (lit lenses) going out instead of falling. L, rest, h: per item, its pendulum
  // length, the tilt it comes to rest at and its height. skid: how much of the shove its foot keeps.
  constructor (kind, list, parts, { L, rest, h, skid }) {
    Object.assign(this, { kind, list, parts, L, rest, h, skid })
    this.standing = new Map() // i -> each part's instance matrices as it stood
    this.moving = []
    this.onLand = null // (x, z, faller, item): it has hit the ground
  }
  // e: the sim's 'knock' event: which one, the way it goes (dx, dz) and how fast it was shoved
  knock (e) {
    if (this.standing.has(e.i)) return
    const it = this.list[e.i]
    this.standing.set(
      e.i,
      this.parts.map(({ mesh, of, dark }) =>
        of(e.i).map(k => {
          const m = new THREE.Matrix4()
          mesh.getMatrixAt(k, m)
          if (dark) mesh.setMatrixAt(k, ZERO)
          return m
        })
      )
    )
    for (const p of this.parts)
      if (p.dark) p.mesh.instanceMatrix.needsUpdate = true
    const L = this.L(it)
    this.moving.push({
      it,
      i: e.i,
      dx: e.dx,
      dz: e.dz,
      tilt: 0.03,
      w: clamp((0.6 * e.speed) / L, 0.2, 2.5),
      s: 0,
      v: e.speed * this.skid,
      L,
      rest: this.rest(it),
      down: false
    })
  }
  update (dt) {
    if (!this.moving.length) return
    for (const f of this.moving) {
      f.w += ((G * Math.sin(f.tilt)) / f.L) * dt
      f.tilt += f.w * dt
      if (f.tilt >= f.rest) {
        f.tilt = f.rest
        f.w = f.w > 1 ? -0.15 * f.w : 0 // a small bounce off the ground
        if (!f.down) {
          f.down = true
          const r = this.h(f.it) * Math.sin(f.rest) + f.s
          this.onLand?.(f.it.x + f.dx * r, f.it.z + f.dz * r, this, f)
        }
      }
      f.v = Math.max(0, f.v - (f.down ? 7 : 2.5) * dt)
      f.s += f.v * dt
      // about its foot, then along the ground: T(foot + skid) R(tilt) T(-foot) times how it stood
      const { x, z } = f.it
      _tq.setFromAxisAngle(_ax.set(f.dz, 0, -f.dx), f.tilt)
      _k.makeRotationFromQuaternion(_tq)
      _ax.set(-x, 0, -z).applyQuaternion(_tq)
      _k.setPosition(_ax.x + x + f.dx * f.s, _ax.y, _ax.z + z + f.dz * f.s)
      const saved = this.standing.get(f.i)
      this.parts.forEach(({ mesh, of, dark }, p) => {
        if (dark) return
        of(f.i).forEach((k, j) =>
          mesh.setMatrixAt(k, _m.multiplyMatrices(_k, saved[p][j]))
        )
      })
      f.done = f.down && f.v === 0 && f.w === 0
    }
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true
    this.moving = this.moving.filter(f => !f.done)
  }
  standUp () {
    for (const [i, saved] of this.standing)
      this.parts.forEach(({ mesh, of }, p) =>
        of(i).forEach((k, j) => mesh.setMatrixAt(k, saved[p][j]))
      )
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true
    this.standing.clear()
    this.moving.length = 0
  }
}
const one = i => [i]

// ---------- street lights ----------
const lampYaw = l => Math.atan2(-l.az, l.ax)
function lamps (group) {
  const post = merge([
    new THREE.CylinderGeometry(0.075, 0.12, 8, 8).translate(0, 4, 0),
    box(0, 7.8, -0.06, 2.3, 7.92, 0.06),
    box(1.9, 7.68, -0.17, 2.7, 7.92, 0.17)
  ])
  const lens = new THREE.PlaneGeometry(0.66, 0.26)
    .rotateX(Math.PI / 2)
    .translate(2.3, 7.66, 0)
  const stand = l => pose(l.x, 0, l.z, lampYaw(l))
  const posts = instanced(post, metal, LAMPS, stand)
  LENS.color = hdr(3.2, 2.5, 1.6)
  const lenses = instanced(lens, LENS, LAMPS, stand, false)
  // at night, the light each throws on the ground under its head (on the pavement's height, so it
  // shows on the pavement as well as the road)
  const pools = instanced(
    new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2),
    POOL,
    LAMPS,
    l => pose(l.x + l.ax * 2.3, CURB_H + 0.02, l.z + l.az * 2.3, 0),
    false
  )
  pools.receiveShadow = false
  pools.visible = false
  group.add(posts, lenses, pools)
  return new Fallers(
    'lamp',
    LAMPS,
    [
      { mesh: posts, of: one },
      { mesh: lenses, of: one, dark: true },
      { mesh: pools, of: one, dark: true }
    ],
    { L: () => 5.6, rest: () => 1.53, h: () => 8, skid: 0.5 }
  )
}
const LENS = new THREE.MeshBasicMaterial({ toneMapped: false })
const POOL = new THREE.MeshBasicMaterial({
  map: softTex,
  color: new THREE.Color(1, 0.74, 0.45),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4
})

// ---------- palms: a leaning trunk and a crown of drooping fronds ----------
function frond (a, len) {
  const P = [],
    n = 6,
    ca = Math.cos(a),
    sa = Math.sin(a)
  const pt = t => {
    const r = t * len,
      w = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04
    return [r, 0.7 * t - 2.1 * t * t, w]
  }
  for (let i = 0; i < n; i++) {
    const [r0, y0, w0] = pt(i / n),
      [r1, y1, w1] = pt((i + 1) / n)
    // a shallow V across the leaf, folded along its rib
    const L = (r, y, w) => [r * ca + sa * w, y - 0.12 * w, r * sa - ca * w]
    const M = (r, y) => [r * ca, y, r * sa]
    const Rr = (r, y, w) => [r * ca - sa * w, y - 0.12 * w, r * sa + ca * w]
    P.push(
      ...L(r0, y0, w0),
      ...M(r0, y0),
      ...M(r1, y1),
      ...L(r0, y0, w0),
      ...M(r1, y1),
      ...L(r1, y1, w1),
      ...M(r0, y0),
      ...Rr(r0, y0, w0),
      ...Rr(r1, y1, w1),
      ...M(r0, y0),
      ...Rr(r1, y1, w1),
      ...M(r1, y1)
    )
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.computeVertexNormals()
  return g
}
function palms (group) {
  const trunk = new THREE.CylinderGeometry(0.15, 0.24, 1, 7).translate(
    0,
    0.5,
    0
  )
  const parts = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.3
    parts.push(
      tint(
        frond(a, 3.2 + R() * 0.9),
        new THREE.Color().setHSL(0.24 + R() * 0.05, 0.45, 0.22 + R() * 0.1)
      )
    )
  }
  parts.push(
    tint(new THREE.ConeGeometry(0.42, 1.1, 7).translate(0, -0.35, 0), 0x6b5434)
  )
  const crown = merge(parts)
  // each trunk leans a little; its crown sits where the trunk ends
  const tops = []
  const tilted = (p, i) => {
    const m = pose(p.x, 0, p.z, 0, 1, p.h, 1, R() * 0.08, R() * Math.PI * 2)
    tops[i] = new THREE.Vector3(0, 1, 0).applyMatrix4(m)
    return m
  }
  const trunks = instanced(
    trunk,
    new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.95 }),
    PALMS,
    tilted
  )
  const crowns = instanced(
    crown,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      side: THREE.DoubleSide
    }),
    PALMS,
    (p, i) => pose(tops[i].x, tops[i].y, tops[i].z, R() * Math.PI * 2)
  )
  group.add(trunks, crowns)
  // the crown is most of the weight; it comes to rest on its drooping fronds
  return new Fallers(
    'palm',
    PALMS,
    [
      { mesh: trunks, of: one },
      { mesh: crowns, of: one }
    ],
    {
      L: p => 0.85 * p.h,
      rest: p => Math.acos(1.3 / p.h),
      h: p => p.h,
      skid: 0.2
    }
  )
}

// ---------- park trees ----------
function trees (group) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 7).translate(
    0,
    1.6,
    0
  )
  const crown = new THREE.IcosahedronGeometry(2.4, 1)
    .scale(1, 0.85, 1)
    .translate(0, 4.4, 0)
  const trunks = instanced(
    trunk,
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }),
    TREES,
    t => pose(t.x, 0, t.z, 0, t.s, t.s, t.s)
  )
  const leaves = instanced(
    crown,
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    TREES,
    t => pose(t.x, 0, t.z, R() * 6, t.s, t.s, t.s)
  )
  const c = new THREE.Color()
  TREES.forEach((t, i) =>
    leaves.setColorAt(i, c.setHSL(0.25 + R() * 0.08, 0.45, 0.2 + R() * 0.1))
  )
  group.add(trunks, leaves)
  // top-heavy: it goes over almost like a weight on a stick, and comes to rest propped on its crown
  return new Fallers(
    'tree',
    TREES,
    [
      { mesh: trunks, of: one },
      { mesh: leaves, of: one }
    ],
    {
      L: t => 4 * t.s,
      rest: () => Math.acos(2.2 / 4.4),
      h: t => 4.4 * t.s,
      skid: 0.12
    }
  )
}

// ---------- signal masts ----------
// In each mast's frame +x is the direction of the traffic it faces and +z that traffic's right.
// The pole stands on the far right corner; the arm reaches back over the lanes, a head over each.
const ARM_Y = 6.3
const HEAD_Z = LANE_OFF.map(o => o - (ROAD_HW + 2.2))
const LAMP_Y = [ARM_Y - 0.4, ARM_Y - 0.76, ARM_Y - 1.12] // red, yellow, green
const ON = [hdr(7, 0.25, 0.12), hdr(7, 3.6, 0.2), hdr(0.3, 6, 3)]
const OFF = ON.map(c => c.clone().multiplyScalar(0.035))
export class Signals {
  constructor (group) {
    const parts = [
      new THREE.CylinderGeometry(0.13, 0.17, ARM_Y + 0.5, 8).translate(
        0,
        (ARM_Y + 0.5) / 2,
        0
      ),
      box(-0.08, ARM_Y - 0.08, Math.min(...HEAD_Z) - 0.6, 0.08, ARM_Y + 0.08, 0)
    ]
    for (const z of HEAD_Z) {
      parts.push(box(-0.2, ARM_Y - 1.32, z - 0.2, 0.2, ARM_Y - 0.08, z + 0.2))
      parts.push(box(0.2, ARM_Y - 1.42, z - 0.36, 0.23, ARM_Y + 0.02, z + 0.36)) // back plate
    }
    const yaw = p => Math.atan2(-DIRS[p.dir][1], DIRS[p.dir][0])
    const masts = instanced(merge(parts), metal, POLES, p =>
      pose(p.x, 0, p.z, yaw(p))
    )
    group.add(masts)
    const disc = new THREE.CircleGeometry(0.14, 14).rotateY(-Math.PI / 2)
    const n = POLES.length * HEAD_Z.length * 3
    this.lamps = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      n
    )
    let k = 0
    for (const p of POLES) {
      const base = pose(p.x, 0, p.z, yaw(p)).clone()
      for (const z of HEAD_Z)
        for (const y of LAMP_Y)
          this.lamps.setMatrixAt(
            k++,
            _l.copy(base).multiply(_m.makeTranslation(-0.21, y, z))
          )
    }
    for (let i = 0; i < n; i++) this.lamps.setColorAt(i, OFF[i % 3])
    group.add(this.lamps)
    this.state = new Int8Array(POLES.length).fill(-1)
    // a mast that is knocked down goes dark
    const per = HEAD_Z.length * 3
    this.fallers = new Fallers(
      'signal',
      POLES,
      [
        { mesh: masts, of: one },
        {
          mesh: this.lamps,
          of: i => Array.from({ length: per }, (_, j) => i * per + j),
          dark: true
        }
      ],
      { L: () => 5, rest: () => 1.5, h: () => ARM_Y, skid: 0.35 }
    )
  }
  update (t) {
    let changed = false
    POLES.forEach((p, i) => {
      const st = signal(NODES[p.node], p.dir, t)
      if (st === this.state[i]) return
      this.state[i] = st
      changed = true
      const lit = st === RED ? 0 : st === YELLOW ? 1 : st === GREEN ? 2 : -1
      for (let h = 0; h < HEAD_Z.length; h++)
        for (let j = 0; j < 3; j++)
          this.lamps.setColorAt(
            (i * HEAD_Z.length + h) * 3 + j,
            j === lit ? ON[j] : OFF[j]
          )
    })
    if (changed) this.lamps.instanceColor.needsUpdate = true
  }
}

// the street furniture, and what goes over when it is hit, by the sim's kind; night (0 to 1) lights
// the street lights up
export function buildProps (group) {
  const signals = new Signals(group)
  const fallers = {
    lamp: lamps(group),
    palm: palms(group),
    tree: trees(group),
    signal: signals.fallers
  }
  const pools = fallers.lamp.parts[2].mesh
  const night = k => {
    LENS.color.copy(hdr(3.2, 2.5, 1.6)).multiplyScalar(1 + 2 * k)
    POOL.opacity = 0.42 * k
    pools.visible = k > 0.01
  }
  return { signals, fallers, night }
}
