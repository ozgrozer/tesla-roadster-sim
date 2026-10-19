// What goes over when the Roadster hits it (the sim decides: breakables.js): the instanced parts of
// each street light, signal mast, tree and palm, moved as one as it falls. Shared by the street
// furniture's builders (cityProps.js, cityTrees.js).
import * as THREE from 'three'
import { Instances } from './chunks.js'
import { G, clamp } from '../sim/constants.js'

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler()
// a matrix standing something at (x, y, z), turned yaw, scaled and tipped tilt towards tiltDir
export const pose = (
  x,
  y,
  z,
  yaw,
  sx = 1,
  sy = 1,
  sz = 1,
  tilt = 0,
  tiltDir = 0
) => {
  _e.set(Math.cos(tiltDir) * tilt, yaw, Math.sin(tiltDir) * tilt, 'YXZ')
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz))
}
// One instanced set a district for the items of list, each placed by place(item, i). (Those that
// cast no shadow are small: one mesh for the city.) name: what its meshes are called (to tell
// them apart when counting what a frame draws)
const FAR = 650 // m: past this a district's posts, bins and benches are left out
export function instanced (geo, mat, list, place, shadow = true, name = '') {
  const m = new Instances(geo, mat, list.length, i => list[i], {
    cast: shadow,
    split: shadow,
    far: FAR // (streamed: chunks.js)
  })
  list.forEach((it, i) => m.setMatrixAt(i, place(it, i)))
  for (const mesh of m.meshes) mesh.name = name
  return m.bounds()
}
export const one = i => [i]
// For a set of instances that holds only some of a list's items: the items, where each came from in
// the list (src), which instance each item of the list is (idx, or -1), and its of() for Fallers
export function subset (list, keep) {
  const idx = new Int32Array(list.length).fill(-1),
    items = [],
    src = []
  list.forEach((it, i) => {
    if (!keep(it)) return
    idx[i] = items.push(it) - 1
    src.push(i)
  })
  return { items, src, idx, of: i => (idx[i] < 0 ? [] : [idx[i]]) }
}

// A post snapped off at its foot falls like a rigid body hinged at the ground: it tips with angular
// acceleration g sin(tilt) / L, where L is the length of the pendulum it makes (about two thirds of its
// height for a pole, nearly all of it for a top-heavy tree), starting from the shove the hit gave it.
// Its foot skids on the way it was shoved until friction stops it, and it comes to rest lying down,
// or propped on its crown.
const _ax = new THREE.Vector3(),
  _tq = new THREE.Quaternion(),
  _k = new THREE.Matrix4()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
export class Fallers {
  // list: the sim's LAMPS, POLES, TREES or PALMS. parts: [{ inst, of: i => its instances in inst,
  // dark }], dark ones (lit lenses) going out instead of falling. L, rest, h: per item, its pendulum
  // length, the tilt it comes to rest at and its height. skid: how much of the shove its foot keeps.
  constructor (kind, list, parts, { L, rest, h, skid }) {
    Object.assign(this, { kind, list, parts, L, rest, h, skid })
    this.standing = new Map() // i -> each part's instance matrices as it stood
    this.moving = []
    this.onLand = null // (x, z, faller, item): it has hit the ground
    this.onKnock = null // (i): it has been knocked (the wires it carried come down)
    this.onStandUp = null
  }
  // e: the sim's 'knock' event: which one, the way it goes (dx, dz) and how fast it was shoved
  knock (e) {
    if (this.standing.has(e.i)) return
    const it = this.list[e.i]
    this.standing.set(
      e.i,
      this.parts.map(({ inst, of, dark }) =>
        of(e.i).map(k => {
          const m = new THREE.Matrix4()
          inst.getMatrixAt(k, m)
          if (dark) inst.setMatrixAt(k, ZERO)
          return m
        })
      )
    )
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
    this.onKnock?.(e.i)
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
      this.parts.forEach(({ inst, of, dark }, p) => {
        if (dark) return
        const ks = of(f.i)
        if (!ks.length) return
        ks.forEach((k, j) =>
          inst.setMatrixAt(k, _m.multiplyMatrices(_k, saved[p][j]))
        )
        inst.refit(ks[0]) // (its district's bounds follow it, so it isn't culled)
      })
      f.done = f.down && f.v === 0 && f.w === 0
    }
    this.moving = this.moving.filter(f => !f.done)
  }
  standUp () {
    for (const [i, saved] of this.standing)
      this.parts.forEach(({ inst, of }, p) =>
        of(i).forEach((k, j) => inst.setMatrixAt(k, saved[p][j]))
      )
    if (this.standing.size) for (const p of this.parts) p.inst.bounds()
    this.standing.clear()
    this.moving.length = 0
    this.onStandUp?.()
  }
}
