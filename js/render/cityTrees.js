// Palms and trees (the sim places them: PALMS, TREES; breakables.js says what snaps them). The
// palms are Los Angeles' two: the Mexican fan palm, twenty to thirty metres of thin grey trunk with
// a small round head of fan leaves over a skirt of dead fronds hanging down it, in lines down the
// boulevards and Beverly Hills' streets; and the stout Canary Island date palm, a thick trunk under
// a big crown of long arching feather fronds. Trees are round-headed, in the parks and down the
// side streets. Each kind is one instanced set (a mesh a district), each palm or tree one piece,
// trunk and head, and all of them go over when hit hard enough.
import * as THREE from 'three'
import { merge, tint } from './geo.js'
import { PALMS, TREES, rng } from '../sim/city.js'
import { Fallers, pose, instanced, one, subset } from './fallers.js'

const R = rng(99)

// a feather frond for the date palm: a shallow V folded along its rib, arching out and down
function frond (a, len) {
  const P = [],
    n = 4,
    ca = Math.cos(a),
    sa = Math.sin(a)
  const pt = t => {
    const r = t * len,
      w = 0.46 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04
    return [r, 0.9 * t - 2.3 * t * t, w]
  }
  for (let i = 0; i < n; i++) {
    const [r0, y0, w0] = pt(i / n),
      [r1, y1, w1] = pt((i + 1) / n)
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
// a fan leaf for the fan palm: a stiff pleated fan on its stalk, pointing out at angle a, tipped
// up (or drooping) by pitch
function fanLeaf (a, pitch, len) {
  const P = []
  const stalk = 0.45,
    n = 2,
    spread = 1.1
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch)
  // in the leaf's own plane: x out along the stalk, z across; then pitched and turned
  const put = (x, z, y = 0) => {
    const xr = x * cp - y * sp,
      yr = x * sp + y * cp
    return [xr * ca - z * sa, yr, xr * sa + z * ca]
  }
  const o = put(stalk, 0)
  for (let i = 0; i < n; i++) {
    const t0 = -spread / 2 + (spread * i) / n,
      t1 = -spread / 2 + (spread * (i + 1)) / n
    // (pleats: every other spoke a little raised)
    const p0 = put(
        stalk + len * Math.cos(t0),
        len * Math.sin(t0),
        i % 2 ? 0.08 : -0.04
      ),
      p1 = put(
        stalk + len * Math.cos(t1),
        len * Math.sin(t1),
        i % 2 ? -0.04 : 0.08
      )
    P.push(...o, ...p1, ...p0)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.computeVertexNormals()
  return g
}

// Each palm and each tree is one piece, trunk and head, scaled whole to its height (so one set of
// instances draws all of a kind): a fan palm 24 m tall, a date palm 10 m, a tree as a park's.
const FAN_H = 24,
  DATE_H = 10
// a fan palm: its thin grey trunk, the skirt of dead fronds under its head, and sixteen small fans
// in three rings, up, out and drooping, so the head reads round from below as well as from the side
function fanPalm () {
  const parts = [
    tint(
      new THREE.CylinderGeometry(0.12, 0.19, FAN_H, 6, 1, true).translate(
        0,
        FAN_H / 2,
        0
      ),
      0x9d9081
    ),
    tint(
      new THREE.CylinderGeometry(0.6, 0.28, 2.2, 5, 1, true).translate(
        0,
        FAN_H - 1.1,
        0
      ),
      0x6e5a40
    )
  ]
  for (let i = 0; i < 16; i++) {
    const ring = i % 3,
      a = (i / 16) * Math.PI * 2 + R() * 0.3,
      pitch = ring === 0 ? -0.75 : ring === 1 ? 0.05 : 0.85
    parts.push(
      tint(
        fanLeaf(a, pitch, 0.95 + R() * 0.3).translate(0, FAN_H, 0),
        new THREE.Color().setHSL(0.22 + R() * 0.05, 0.42, 0.22 + R() * 0.11)
      )
    )
  }
  return merge(parts)
}
// a date palm: its stout trunk, long arching fronds round a knob
function datePalm () {
  const parts = [
    tint(
      new THREE.CylinderGeometry(0.28, 0.44, DATE_H, 6, 1, true).translate(
        0,
        DATE_H / 2,
        0
      ),
      0x7d6c5a
    ),
    tint(
      new THREE.ConeGeometry(0.62, 1.2, 7).translate(0, DATE_H - 0.35, 0),
      0x6b5434
    )
  ]
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.3
    parts.push(
      tint(
        frond(a, 3.8 + R() * 1.1).translate(0, DATE_H, 0),
        new THREE.Color().setHSL(0.24 + R() * 0.05, 0.45, 0.22 + R() * 0.1)
      )
    )
  }
  return merge(parts)
}
// a round-headed tree: its trunk, and its crown faceted (each face its own normal)
function tree () {
  // (an icosahedron's triangles are its own already: their normals made each face's)
  const crown = new THREE.IcosahedronGeometry(2.4, 1)
    .scale(1, 0.85, 1)
    .translate(0, 4.4, 0)
  crown.computeVertexNormals()
  return merge([
    tint(
      new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6, 1, true).translate(
        0,
        1.6,
        0
      ),
      0x5a4632
    ),
    tint(crown, 0x4f7a3a)
  ])
}

// The palms and the trees, and what goes over when one is hit: { palm, tree } (Fallers)
export function greenery (group) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    side: THREE.DoubleSide
  })
  // (each palm leans a little, and each is turned its own way)
  const lean = p => R() * (p.fan ? 0.05 : 0.09)
  const fan = subset(PALMS, p => p.fan),
    date = subset(PALMS, p => !p.fan)
  const stand = H => p => {
    const s = p.h / H
    return pose(
      p.x,
      0,
      p.z,
      R() * Math.PI * 2,
      s,
      s,
      s,
      lean(p),
      R() * Math.PI * 2
    )
  }
  const fans = instanced(
    fanPalm(),
    mat,
    fan.items,
    stand(FAN_H),
    true,
    'fan palms'
  )
  const dates = instanced(
    datePalm(),
    mat,
    date.items,
    stand(DATE_H),
    true,
    'date palms'
  )
  const trees = instanced(
    tree(),
    mat,
    TREES,
    t => pose(t.x, 0, t.z, R() * 6, t.s, t.s, t.s),
    true,
    'trees'
  )
  // (each tree a shade of its own)
  const c = new THREE.Color()
  TREES.forEach((t, i) =>
    trees.setColorAt(
      i,
      c.setRGB(0.85 + R() * 0.3, 0.85 + R() * 0.3, 0.8 + R() * 0.25)
    )
  )
  group.add(...fans.meshes, ...dates.meshes, ...trees.meshes)
  return {
    // a palm's crown is most of its weight; it comes to rest on its fronds
    palm: new Fallers(
      'palm',
      PALMS,
      [
        { inst: fans, of: fan.of },
        { inst: dates, of: date.of }
      ],
      {
        L: p => 0.85 * p.h,
        rest: p => Math.acos((p.fan ? 1.1 : 1.3) / p.h),
        h: p => p.h,
        skid: 0.2
      }
    ),
    // a tree is top-heavy: it goes over almost like a weight on a stick, and comes to rest propped
    // on its crown
    tree: new Fallers('tree', TREES, [{ inst: trees, of: one }], {
      L: t => 4 * t.s,
      rest: () => Math.acos(2.2 / 4.4),
      h: t => 4.4 * t.s,
      skid: 0.12
    })
  }
}
