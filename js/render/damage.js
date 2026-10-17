// Body damage, GTA-style: a knock dents the Roadster's panels where it landed, deeper and wider the
// harder the hit, the metal crumpling (each dent a little uneven, its facets catching the light)
// rather than sinking in smooth; dents add up, to a limit, and a reset puts the car back as new.
// The panels are the lofted body's (roadster.js marks them userData.dent): their vertices are moved
// in place, each by a function of where it started, so the triangles that share a corner stay
// joined.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { carFrame } from '../sim/collide.js'

const MIN_HIT = 2.5 // m/s closing speed below which a knock leaves no mark
const DEPTH = 0.011 // m of dent per m/s past MIN_HIT
const MAX_DEPTH = 0.1 // m, the deepest one knock goes
const MAX_TOTAL = 0.16 // m, the furthest a panel is ever pushed in from where it started
const _inv = new THREE.Matrix4(),
  _p = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _q = new THREE.Quaternion()
const _frame = { l: new THREE.Vector3(), n: new THREE.Vector3() }

// a repeatable roughness for a point on the panel, 0.55 to 1.15: the same corner, the same value
// (hashed from its millimetres, so a corner two meshes share, a hair apart in floating point, gets
// the same value in both)
const rough = (x, y, z) => {
  let h =
    (Math.round(x * 1000) * 73856093) ^
    (Math.round(y * 1000) * 19349663) ^
    (Math.round(z * 1000) * 83492791)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return 0.55 + 0.6 * ((h >>> 0) / 4294967296)
}

export class Damage {
  // RS: the Roadster (roadster.js)
  constructor (RS) {
    this.RS = RS
    this.panels = []
    const seen = new Set()
    RS.car.traverse(o => {
      if (!o.isMesh || !o.userData.dent || seen.has(o.geometry)) return
      seen.add(o.geometry)
      const g = o.geometry
      // (where its own frame sits in the car's: the doors hang off their hinges. The roughness is
      // worked out in the car's frame, so a door's edge and the body's beside it dent alike.)
      o.updateWorldMatrix(true, false)
      _inv.copy(RS.car.matrixWorld).invert().multiply(o.matrixWorld)
      this.panels.push({
        mesh: o,
        g,
        glass: o.userData.dent === 'glass', // (moves with the panels round it, shaded smooth)
        off: new THREE.Vector3().setFromMatrixPosition(_inv),
        pos0: g.attributes.position.array.slice(),
        nrm0: g.attributes.normal.array.slice()
      })
    })
    this.amount = 0 // how battered it is, 0 (as new) up
    this.dirty = false
  }

  // A 'bump' event from the sim: where it landed in the car's own frame at that moment ({ lx, ly,
  // lz, lnx, lny, lnz }: collide.js), or failing that ({ px, pz, nx, nz }, in the world) on the car
  // as it is now (sim)
  hit (e, sim) {
    if (!(e.impact > MIN_HIT)) return
    if (e.lx !== undefined) {
      _frame.l.set(e.lx, e.ly, e.lz)
      _frame.n.set(e.lnx, e.lny, e.lnz)
    } else if (e.px !== undefined) carFrame(sim, e.px, e.pz, e.nx, e.nz, _frame)
    else return
    const depth = Math.min(MAX_DEPTH, (e.impact - MIN_HIT) * DEPTH + 0.012)
    const R = clamp(0.28 + e.impact * 0.03, 0.3, 0.8)
    // (pushed in the way the car was knocked: along the normal, into the body)
    this.blow(_frame.l, _frame.n, R, depth)
  }

  // A crash: the car comes down on its side or roof, so whichever side faces the ground (q: the
  // car's attitude) takes the blow, by its speed (m/s); one still upright when it crashed (into a
  // tower, a wall, the ramp) takes it on the face it was going towards (vel).
  crash (q, speed, vel) {
    _q.copy(q).invert()
    _d.set(0, -1, 0).applyQuaternion(_q) // (the way down, in the car's frame)
    if (_d.y < -0.7 && Math.hypot(vel.x, vel.z) > 1)
      _d.set(vel.x, 0, vel.z).normalize().applyQuaternion(_q)
    const impact = Math.min(18, 6 + speed * 0.4)
    const depth = Math.min(MAX_DEPTH, (impact - MIN_HIT) * DEPTH + 0.012)
    const R = clamp(0.28 + impact * 0.035, 0.3, 0.9)
    // (the middle of the face it lands on: half the car's height up or down, its half-length or
    // half-width out)
    _a.set(_d.x * 2.2, 0.6 + _d.y * 0.62, _d.z * 1.0)
    this.blow(_a, _d.negate(), R, depth)
  }

  // dent every panel round point at (in the car's frame), in along dir, R wide and depth deep
  blow (at, dir, R, depth) {
    this.amount += depth
    for (const P of this.panels) {
      const m = P.mesh
      m.updateWorldMatrix(true, false)
      _inv.copy(m.matrixWorld).invert().multiply(this.RS.car.matrixWorld)
      _p.copy(at).applyMatrix4(_inv)
      _b.copy(dir).transformDirection(_inv)
      this.dent(P, _p, _b, R, depth)
    }
  }

  // push the panel's vertices within R of p in along d, up to depth at the middle
  dent (P, p, d, R, depth) {
    const pos = P.g.attributes.position,
      a = pos.array,
      a0 = P.pos0,
      o0 = P.off,
      R2 = R * R
    let moved = false
    for (let i = 0; i < a.length; i += 3) {
      const dx = a0[i] - p.x,
        dy = (a0[i + 1] - p.y) * 1.4, // (a dent spreads along the body more than up it)
        dz = a0[i + 2] - p.z,
        q = (dx * dx + dy * dy + dz * dz) / R2
      if (q >= 1) continue
      const k =
        (1 - q) *
        (1 - q) *
        depth *
        rough(a0[i] + o0.x, a0[i + 1] + o0.y, a0[i + 2] + o0.z)
      let x = a[i] + d.x * k,
        y = a[i + 1] + d.y * k * 0.4,
        z = a[i + 2] + d.z * k
      // never further in than MAX_TOTAL from where it started
      const ox = x - a0[i],
        oy = y - a0[i + 1],
        oz = z - a0[i + 2],
        o = Math.hypot(ox, oy, oz)
      if (o > MAX_TOTAL) {
        const s = MAX_TOTAL / o
        x = a0[i] + ox * s
        y = a0[i + 1] + oy * s
        z = a0[i + 2] + oz * s
      }
      a[i] = x
      a[i + 1] = y
      a[i + 2] = z
      moved = true
    }
    if (!moved) return
    pos.needsUpdate = true
    if (!P.glass) this.shade(P)
    this.dirty = true
  }

  // the dented triangles take on their own facets' normals, the more the deeper they went in, so
  // the crumpled metal catches the light; the rest keep the body's smooth shading
  shade (P) {
    const a = P.g.attributes.position.array,
      a0 = P.pos0,
      n0 = P.nrm0,
      nrm = P.g.attributes.normal,
      n = nrm.array
    for (let i = 0; i < a.length; i += 9) {
      let off = 0
      for (let j = i; j < i + 9; j += 3)
        off = Math.max(
          off,
          Math.abs(a[j] - a0[j]) +
            Math.abs(a[j + 1] - a0[j + 1]) +
            Math.abs(a[j + 2] - a0[j + 2])
        )
      if (off < 1e-4) continue
      _a.fromArray(a, i)
      _b.fromArray(a, i + 3).sub(_a)
      _c.fromArray(a, i + 6).sub(_a)
      _n.crossVectors(_b, _c).normalize()
      const k = clamp(off / 0.03, 0, 0.85)
      for (let j = i; j < i + 9; j += 3) {
        // (facing the same side as the panel's own normal)
        const s = _n.x * n0[j] + _n.y * n0[j + 1] + _n.z * n0[j + 2] < 0 ? -1 : 1
        const x = n0[j] + (s * _n.x - n0[j]) * k,
          y = n0[j + 1] + (s * _n.y - n0[j + 1]) * k,
          z = n0[j + 2] + (s * _n.z - n0[j + 2]) * k,
          l = Math.hypot(x, y, z) || 1
        n[j] = x / l
        n[j + 1] = y / l
        n[j + 2] = z / l
      }
    }
    nrm.needsUpdate = true
  }

  // as new
  repair () {
    if (!this.dirty) return
    for (const P of this.panels) {
      P.g.attributes.position.array.set(P.pos0)
      P.g.attributes.normal.array.set(P.nrm0)
      P.g.attributes.position.needsUpdate = true
      P.g.attributes.normal.needsUpdate = true
    }
    this.amount = 0
    this.dirty = false
  }
}
