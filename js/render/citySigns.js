// The signs (the sim lays them out: SIGNS, and the solid things on the lots: SOLIDS). Billboards on
// poles and on roofs, two-faced, with a catwalk under each and lamps over it; signs up on poles for
// the motel, the fast-food stands, the strip malls and the gas prices; a theatre's marquee over the
// pavement, its bulbs underneath, and its name up a blade sign; old hotels' names in letters on
// frames along their roofs; murals on the walls; a helipad's markings and edge lights on a roof; a
// gas station's canopy (its fascia in the brand's colours, its ceiling lit), pumps and columns; a
// giant donut. Three meshes for all of it: what is lit (the atlas is its own glow: signTex.js), what
// is painted on, and the steel and concrete that holds it up.
import * as THREE from 'three'
import { SIGNS, SOLIDS, BUILDINGS, BLOCKS, CURB_H } from '../sim/city.js'
import { Builder } from './builder.js'
import { CELLS, signAtlas } from './signTex.js'
import { softTex } from './scene.js'

const FACE = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
]
const _v = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _b = new THREE.Vector3()
const white = new THREE.Color(1, 1, 1)
const steel = new THREE.Color(0.24, 0.25, 0.27),
  paint = new THREE.Color(0.85, 0.86, 0.85)

// A frame at (x, 0, z) facing side s: local x across the face (left to right seen from the front),
// y up, z out of it
const frameAt = (x, z, s) =>
  new THREE.Matrix4()
    .makeRotationY(Math.atan2(FACE[s][0], FACE[s][1]))
    .setPosition(x, 0, z)
// a quad in frame M, corners a-b-c-d anticlockwise from its front, the atlas rect uv across it
function quad (out, M, a, b, c, d, uv, col) {
  const P = [a, b, c, d].map(p =>
    _v
      .set(...p)
      .applyMatrix4(M)
      .toArray()
  )
  _a.set(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2])
  _b.set(P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2])
  const n = _a
    .cross(_b)
    .normalize()
    .toArray()
  out.quad(P[0], P[1], P[2], P[3], n, uv || [0, 0, 0, 0], col)
}
// A box in frame M; uvs: { front, back, left, right, top, bottom } atlas rects for faces drawn lit
// (into lit), the rest into rest (unless skip lists it)
function box (
  lit,
  rest,
  M,
  x0,
  x1,
  y0,
  y1,
  z0,
  z1,
  uvs = {},
  col = steel,
  skip = ''
) {
  const F = {
    front: [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    back: [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0]
    ],
    right: [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1]
    ],
    left: [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0]
    ],
    top: [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0]
    ],
    bottom: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1]
    ]
  }
  for (const [k, c] of Object.entries(F)) {
    if (skip.includes(k)) continue
    if (uvs[k]) quad(lit, M, ...c, uvs[k], white)
    else quad(rest, M, ...c, null, col)
  }
}
const cell = (kind, i) => {
  const list = CELLS[kind]
  return list[((i % list.length) + list.length) % list.length].uv
}
const pickOf = (kind, k) => Math.floor(k * CELLS[kind].length)

// ---------- each kind of sign ----------
function billboard (L, S, s) {
  const M = frameAt(s.x, s.z, s.face),
    w = s.w / 2,
    d = s.d / 2,
    k = pickOf('billboard', s.k)
  box(L, S, M, -w, w, s.y, s.y + s.h, -d, d, {
    front: cell('billboard', k),
    back: cell('billboard', k + 3)
  })
  // a catwalk along its foot, three lamps on arms over its top
  box(L, S, M, -w, w, s.y - 0.25, s.y - 0.15, d, d + 0.8)
  for (const x of [-w * 0.66, 0, w * 0.66]) {
    box(L, S, M, x - 0.05, x + 0.05, s.y + s.h, s.y + s.h + 0.08, d, d + 1.3)
    box(
      L,
      S,
      M,
      x - 0.25,
      x + 0.25,
      s.y + s.h - 0.12,
      s.y + s.h,
      d + 1.1,
      d + 1.45,
      { bottom: cell('light', 0) }
    )
  }
  if (!s.pole)
    // (on a roof: legs down to it)
    for (const x of [-w * 0.6, w * 0.6])
      box(L, S, M, x - 0.12, x + 0.12, s.y - 1.6, s.y, -0.12, 0.12)
}
// a sign up on its pole, both faces lit
function pylon (L, S, s, kind) {
  const M = frameAt(s.x, s.z, s.face),
    w = s.w / 2,
    d = s.d / 2,
    k = pickOf(kind, s.k)
  box(L, S, M, -w, w, s.y, s.y + s.h, -d, d, {
    front: cell(kind, k),
    back: cell(kind, k)
  })
}
function marquee (L, S, s) {
  const M = frameAt(s.x, s.z, s.face),
    w = s.w / 2,
    k = pickOf('marquee', s.k)
  const m = cell('marquee', k)
  box(
    L,
    S,
    M,
    -w,
    w,
    s.y,
    s.y + s.h,
    0,
    s.d,
    { front: m, left: m, right: m, bottom: cell('bulbs', 0) },
    steel,
    'back'
  )
}
function blade (L, S, s) {
  const M = frameAt(s.x, s.z, s.face),
    d = s.d / 2
  // the theatres' signs are the atlas's first four, the shops' the rest
  const k = s.w > 2 ? pickOf('blade', s.k * 0.4) : 4 + Math.floor(s.k * 6)
  const c = cell('blade', k)
  box(
    L,
    S,
    M,
    -d,
    d,
    s.y,
    s.y + s.h,
    0.3,
    0.3 + s.w,
    { left: c, right: c },
    steel,
    'back'
  )
  box(L, S, M, -0.06, 0.06, s.y + s.h * 0.4, s.y + s.h * 0.4 + 0.12, 0, 0.3)
}
// an old hotel's name in letters along its roof, on a frame of steel
function hotelSign (L, S, s) {
  const M = frameAt(s.x, s.z, s.face),
    w = s.w / 2
  quad(
    L,
    M,
    [-w, s.y, 0.1],
    [w, s.y, 0.1],
    [w, s.y + s.h, 0.1],
    [-w, s.y + s.h, 0.1],
    cell('hotel', pickOf('hotel', s.k)),
    white
  )
  for (const y of [s.y + 0.3, s.y + s.h - 0.3])
    box(L, S, M, -w, w, y - 0.07, y + 0.07, -0.25, -0.1)
  for (let x = -w; x <= w + 0.01; x += Math.max(2, s.w / 6))
    box(L, S, M, x - 0.07, x + 0.07, s.y - 1, s.y + s.h, -0.25, -0.1)
}
function mural (P, s) {
  const M = frameAt(s.x, s.z, s.face),
    w = s.w / 2
  quad(
    P,
    M,
    [-w, s.y, 0.05],
    [w, s.y, 0.05],
    [w, s.y + s.h, 0.05],
    [-w, s.y + s.h, 0.05],
    cell('mural', pickOf('mural', s.k)),
    white
  )
}
// a helipad's markings on the roof, lights round its edge
function helipad (L, P, S, h) {
  const { x, z, r } = h,
    y = h.y + 0.04
  P.quad(
    [x - r, y, z + r],
    [x + r, y, z + r],
    [x + r, y, z - r],
    [x - r, y, z - r],
    [0, 1, 0],
    cell('helipad', 0),
    white
  )
  const I = new THREE.Matrix4()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      lx = x + Math.cos(a) * (r + 0.4),
      lz = z + Math.sin(a) * (r + 0.4)
    box(L, S, I, lx - 0.1, lx + 0.1, h.y, h.y + 0.18, lz - 0.1, lz + 0.1, {
      top: cell('green', 0)
    })
  }
}
// a gas station's canopy: its fascia in the brand's colours, its ceiling lit
function canopy (L, S, c) {
  const I = new THREE.Matrix4(),
    f = cell('fascia', c.brand)
  box(
    L,
    S,
    I,
    c.x0,
    c.x1,
    c.y0,
    c.y1,
    c.z0,
    c.z1,
    { front: f, back: f, left: f, right: f },
    paint,
    'bottom'
  )
  // (the ceiling in panels, each a cell of lights)
  const nx = 4,
    nz = 2,
    p = cell('panel', 0)
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x0 = c.x0 + ((c.x1 - c.x0) * i) / nx,
        x1 = c.x0 + ((c.x1 - c.x0) * (i + 1)) / nx
      const z0 = c.z0 + ((c.z1 - c.z0) * j) / nz,
        z1 = c.z0 + ((c.z1 - c.z0) * (j + 1)) / nz
      L.quad(
        [x0, c.y0, z0],
        [x1, c.y0, z0],
        [x1, c.y0, z1],
        [x0, c.y0, z1],
        [0, -1, 0],
        p,
        white
      )
    }
}
const BRAND = [0x0b4ea2, 0xd1202f, 0xf2b705, 0x138a52]
const cyl = (r, h, n) =>
  new THREE.CylinderGeometry(r, r, h, n, 1, true).translate(0, h / 2, 0)

export function buildSigns (group) {
  const L = new Builder(), // lit
    P = new Builder(), // painted on
    S = new Builder() // steel and concrete
  for (const s of SIGNS) {
    if (s.kind === 'billboard') billboard(L, S, s)
    else if (s.kind === 'marquee') marquee(L, S, s)
    else if (s.kind === 'blade') blade(L, S, s)
    else if (s.kind === 'hotel') hotelSign(L, S, s)
    else if (s.kind === 'mural') mural(P, s)
    else pylon(L, S, s, s.kind) // motel, food, mall, price
  }
  const I = new THREE.Matrix4(),
    T = new THREE.Matrix4()
  for (const c of SOLIDS) {
    if (c.look === 'canopy') canopy(L, S, c)
    else if (c.look === 'pump') {
      box(
        L,
        S,
        I,
        c.x0,
        c.x1,
        c.y0,
        c.y1,
        c.z0,
        c.z1,
        {},
        new THREE.Color().setHex(BRAND[c.brand])
      )
      // (its lit screens, either side)
      const x = (c.x0 + c.x1) / 2,
        s = cell('light', 0)
      box(L, S, I, x - 0.2, x + 0.2, 1.1, 1.4, c.z0 - 0.02, c.z1 + 0.02, {
        front: s,
        back: s
      })
    } else if (c.look === 'island')
      box(L, S, I, c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, {}, paint)
    else if (c.look === 'column')
      S.add(cyl(c.r, c.y1, 10), T.makeTranslation(c.x, 0, c.z), paint)
    else if (c.look === 'pole')
      S.add(cyl(c.r, c.y1, 8), T.makeTranslation(c.x, 0, c.z), steel)
  }
  // the pools and fountains: water in its coping, on the lot
  const y = CURB_H + 0.012
  for (const blk of BLOCKS)
    for (const g of blk.ground)
      if (g.k === 'pool')
        P.quad(
          [g.x0, y, g.z1],
          [g.x1, y, g.z1],
          [g.x1, y, g.z0],
          [g.x0, y, g.z0],
          [0, 1, 0],
          cell('pool', 0),
          white
        )
  for (const b of BUILDINGS) {
    if (b.door) {
      // a front door, on the wall facing the street
      const M = frameAt(b.door.x, b.door.z, b.door.face)
      quad(
        P,
        M,
        [-0.55, CURB_H, 0.04],
        [0.55, CURB_H, 0.04],
        [0.55, 2.35, 0.04],
        [-0.55, 2.35, 0.04],
        cell('door', pickOf('door', b.door.k)),
        white
      )
    }
    if (b.helipad) helipad(L, P, S, b.helipad)
    if (b.donut) {
      const d = b.donut
      const M = frameAt(d.x, d.z, d.face).multiply(
        T.makeTranslation(0, d.y + d.r + 1.6, 0)
      )
      S.add(
        new THREE.TorusGeometry(d.r, 1.6, 10, 28),
        M,
        new THREE.Color(0.62, 0.36, 0.16)
      )
      S.add(
        new THREE.TorusGeometry(d.r, 1.62, 10, 28, Math.PI),
        M,
        new THREE.Color(0.86, 0.45, 0.62)
      )
      for (const x of [-2, 2])
        box(
          L,
          S,
          frameAt(d.x, d.z, d.face),
          x - 0.2,
          x + 0.2,
          d.y,
          d.y + 1.7,
          -0.2,
          0.2
        )
    }
  }
  const atlas = signAtlas()
  const lit = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: 0xffffff,
    emissiveIntensity: 0.14,
    roughness: 0.5,
    alphaTest: 0.5
  })
  const painted = new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.88,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
  const struct = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.3
  })
  for (const [b, m, cast, name] of [
    [L, lit, true, 'signs'],
    [P, painted, false, 'murals and markings'],
    [S, struct, true, 'sign frames']
  ]) {
    if (b.empty) continue
    const mesh = new THREE.Mesh(b.geometry(), m)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    mesh.name = name
    group.add(mesh)
  }
  const pools = glow()
  group.add(pools)
  // night (0 to 1): every sign lit up, the billboards under their lamps, the light under a gas
  // station's canopy and a theatre's marquee spilling on the ground
  return {
    night (k) {
      lit.emissiveIntensity = 0.14 + 0.72 * k
      pools.material.opacity = 0.55 * k
      pools.visible = k > 0.01
    }
  }
}

// the light thrown on the ground at night under each gas station's canopy and in front of each
// marquee: soft pools, added onto whatever is there
function glow () {
  const G = new Builder(),
    y = CURB_H + 0.03,
    I = new THREE.Matrix4()
  const pool = (M, x0, x1, z0, z1) =>
    quad(
      G,
      M,
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
      [0, 0, 1, 1],
      white
    )
  for (const c of SOLIDS)
    if (c.look === 'canopy') pool(I, c.x0 - 4, c.x1 + 4, c.z0 - 4, c.z1 + 4)
  for (const s of SIGNS)
    if (s.kind === 'marquee')
      pool(frameAt(s.x, s.z, s.face), -s.w / 2 - 3, s.w / 2 + 3, -1, s.d + 7)
  const m = new THREE.Mesh(
    G.geometry(),
    new THREE.MeshBasicMaterial({
      map: softTex,
      color: new THREE.Color(1, 0.9, 0.75),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })
  )
  m.name = 'canopy light'
  m.visible = false
  return m
}
