// Street furniture: street lights, palms on the boulevards, park trees and a signal mast on every
// corner whose red, yellow and green lamps follow the intersection's signal plan. All instanced.
import * as THREE from 'three'
import { hdr } from './scene.js'
import { merge, box, tint } from './geo.js'
import {
  NODES,
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
  signal,
  rng
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

// ---------- street lights ----------
function lamps (group) {
  const post = merge([
    new THREE.CylinderGeometry(0.075, 0.12, 8, 8).translate(0, 4, 0),
    box(0, 7.8, -0.06, 2.3, 7.92, 0.06),
    box(1.9, 7.68, -0.17, 2.7, 7.92, 0.17)
  ])
  const lens = new THREE.PlaneGeometry(0.66, 0.26)
    .rotateX(Math.PI / 2)
    .translate(2.3, 7.66, 0)
  const stand = l => pose(l.x, 0, l.z, Math.atan2(-l.az, l.ax))
  group.add(instanced(post, metal, LAMPS, stand))
  group.add(
    instanced(
      lens,
      new THREE.MeshBasicMaterial({
        color: hdr(3.2, 2.5, 1.6),
        toneMapped: false
      }),
      LAMPS,
      stand,
      false
    )
  )
}

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
  group.add(
    instanced(
      trunk,
      new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.95 }),
      PALMS,
      tilted
    )
  )
  group.add(
    instanced(
      crown,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        side: THREE.DoubleSide
      }),
      PALMS,
      (p, i) => pose(tops[i].x, tops[i].y, tops[i].z, R() * Math.PI * 2)
    )
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
  group.add(
    instanced(
      trunk,
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }),
      TREES,
      t => pose(t.x, 0, t.z, 0, t.s, t.s, t.s)
    )
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
  group.add(leaves)
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
    group.add(
      instanced(merge(parts), metal, POLES, p => pose(p.x, 0, p.z, yaw(p)))
    )
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

export function buildProps (group) {
  lamps(group)
  palms(group)
  trees(group)
  return new Signals(group)
}
