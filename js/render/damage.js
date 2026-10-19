// Body damage, GTA-style: a knock dents the Roadster's panels where it landed, deeper and wider the
// harder the hit, the metal crumpling (each dent a little uneven, its facets catching the light)
// rather than sinking in smooth; dents add up, to a limit, and a reset puts the car back as new.
// The panels are the lofted body's (roadster.js marks them userData.dent): their vertices are moved
// in place, each by a function of where it started, so the triangles that share a corner stay
// joined. A hard knock also breaks the lamps on its side (the headlight or the tail light goes
// dark and smashed, and the light it threw goes with it) and crazes the glass of the face it lands
// on (sim/carDamage.js Wear keeps which): the lamps' and the glass's own shaders draw it from a few
// uniforms, so none of it costs a draw call or a new shader, and a reset mends it with the dents.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { carFrame } from '../sim/collide.js'
import { CRACKS } from './carDents.js'
import { Wear, LAMPS, PANE, paneOf } from '../sim/carDamage.js'

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
    // the lamps and glass: which are broken (Wear), each end's lamps dark on a broken side (x the
    // left, y the right), the glass crazed (front, rear, left, right, 0 to 1), the headlights'
    // light as built, and their beams in the rain (found once there are some: beams.js)
    this.wear = new Wear()
    this.out = {
      front: { value: new THREE.Vector2() },
      rear: { value: new THREE.Vector2() }
    }
    this.crazed = { value: new THREE.Vector4() }
    this.light = RS.headlights.intensity
    this.cones = null
    const lamps = new Set()
    RS.car.traverse(o => {
      const end = o.isMesh && o.material.userData.lamp
      if (!end || lamps.has(o.material)) return
      lamps.add(o.material)
      breakable(o.material, this.out[end])
    })
    for (const P of this.panels)
      if (P.glass) {
        const at = P.mesh.parent
        const side = at === RS.doors[1] ? 1 : at === RS.doors[-1] ? -1 : 0
        P.mesh.material = crazing(P.mesh, this.crazed, side)
      }
  }

  // A 'bump' event from the sim: where it landed in the car's own frame at that moment ({ lx, ly,
  // lz, lnx, lny, lnz }: collide.js), or failing that ({ px, pz, nx, nz }, in the world) on the car
  // as it is now (sim). What it broke on the Roadster goes on the event (e.mine: carDamage.js
  // BROKE's bits), for its sound and its debris (events.js).
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
    e.mine = this.wear.hit(_frame.l.x, _frame.l.z, e.impact, sim.time)
    if (e.mine) this.show()
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
    // and the lamps and glass on that face go (on its roof, all the glass over it)
    if (_d.y < -0.5) this.wear.roof(impact)
    else this.wear.crash(_a.x, _a.z, impact)
    this.show()
  }

  // the lamps and glass as the Wear has them: dark lamps, the headlights' light and their beams
  // (as many as still work), crazed glass
  show () {
    const L = this.wear.lamps,
      W = this.wear
    const f = this.out.front.value,
      r = this.out.rear.value
    f.set(L & LAMPS.FL ? 1 : 0, L & LAMPS.FR ? 1 : 0)
    r.set(L & LAMPS.RL ? 1 : 0, L & LAMPS.RR ? 1 : 0)
    this.RS.headlights.intensity = (this.light * (2 - f.x - f.y)) / 2
    if (!this.cones?.length)
      this.cones = this.RS.body.children.filter(o => o.material?.uniforms?.uI)
    for (const c of this.cones)
      c.scale.setScalar((c.position.z < 0 ? f.x : f.y) ? 0 : 1)
    const p = k => paneOf(W, k) / 6
    const front = p(PANE.front),
      rear = p(PANE.rear)
    this.crazed.value.set(front, rear, p(PANE.left), p(PANE.right))
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
    this.wear.repair()
    this.show()
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

// A lamp's material m (a plain one, lit by its colour), dark and smashed on a side whose lamp is
// broken (out: { value: (left, right) }, 1 broken), told apart by which side of the car each bit of
// it lies on (the light bars across the nose and the tail go out at their middle)
function breakable (m, out) {
  m.onBeforeCompile = shader => {
    shader.uniforms.uLampOut = out
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampP;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLampP = position;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec2 uLampOut;\nvarying vec3 vLampP;'
      )
      .replace(
        '#include <opaque_fragment>',
        `${SMASHED}\n#include <opaque_fragment>`
      )
  }
  m.customProgramCacheKey = () => 'roadster lamp'
}
const SMASHED = `if ((vLampP.z < 0.0 ? uLampOut.x : uLampOut.y) > 0.5) {
    vec2 b = floor(vLampP.xy * 120.0 + vLampP.zz * 37.0);
    outgoingLight = vec3(0.016, 0.017, 0.02)
      * (0.6 + 0.8 * fract(sin(dot(b, vec2(12.9898, 78.233))) * 43758.5453));
  }`

// A copy of the glass's material m on mesh o (on the canopy, side 0, the crazing told by where on
// it: the windscreen, the rear glass, the roof's sides; or on a door's pane, side -1 the left, 1
// the right), crazed as crazed has it (front, rear, left, right, 0 to 1): a web of fine pale cracks
// over the bronze round the middle of each pane, running further and milkier the worse it is
function crazing (o, crazed, side) {
  const c = o.material.clone()
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
  const { min, max } = o.geometry.boundingBox
  // (where each web starts: on the canopy, the windscreen's and the rear glass's middles along it,
  // and the roof's sides'; on a door's pane, its middle)
  const web = side
    ? new THREE.Vector4((min.x + max.x) / 2, (min.y + max.y) / 2, 0, 0)
    : new THREE.Vector4(
        0.3 + (max.x - 0.3) / 2,
        (min.x - 0.62) / 2,
        max.z * 0.7,
        -0.16
      )
  c.onBeforeCompile = shader => {
    shader.uniforms.uCrazed = crazed
    shader.uniforms.uPane = { value: side }
    shader.uniforms.uWeb = { value: web }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrazeP;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCrazeP = position;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uCrazed, uWeb;
        uniform float uPane;
        varying vec3 vCrazeP;
        ${CRACKS}`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `${CRAZED}\n#include <normal_fragment_begin>`
      )
  }
  c.customProgramCacheKey = () => 'roadster glass'
  return c
}
const CRAZED = `{
    vec3 p = vCrazeP;
    float lv;
    vec2 q = p.xz, c;
    if (uPane != 0.0) {
      lv = uPane < 0.0 ? uCrazed.z : uCrazed.w;
      q = p.xy;
      c = uWeb.xy;
    } else if (p.x > 0.3) {
      lv = uCrazed.x;
      c = vec2(uWeb.x, 0.0);
    } else if (p.x < -0.62) {
      lv = uCrazed.y;
      c = vec2(uWeb.y, 0.0);
    } else {
      lv = p.z < 0.0 ? uCrazed.z : uCrazed.w;
      c = vec2(uWeb.w, p.z < 0.0 ? -uWeb.z : uWeb.z);
    }
    if (lv > 0.0) {
      float crack = glassWeb(q, c, lv, 1.3);
      float haze = lv * (1.0 - smoothstep(0.1, 0.3 + lv * 0.2, length(q - c)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.56), max(crack, 0.25 * haze));
      diffuseColor.a = mix(diffuseColor.a, 1.0, 0.8 * crack);
      metalnessFactor *= 1.0 - max(crack, 0.3 * haze);
      roughnessFactor = mix(roughnessFactor + 0.12 * haze, 0.5, crack);
    }
  }`
