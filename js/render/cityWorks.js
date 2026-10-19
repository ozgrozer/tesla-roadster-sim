// The new districts' working things (the sim lays them out: PROPS, DECKS, RAMPS and the SOLIDS'
// looks): the port's container stacks and the yards' trailers, loading docks down the sheds' sides,
// water towers on the Arts District's roofs, factory chimneys and tanks, chain-link fences, the
// freeway's deck with its lanes painted on and its concrete barriers, the ramps up to it and up a
// garage, bus shelters, the parks' hoops, bleachers and floodlight masts, the suburbs' bushes. All
// of it static: merged a district at a time (chunks.js), so the view and the car's shadow camera
// leave out what is not near; the containers and the bushes, by the thousand, are instanced.
import * as THREE from 'three'
import { SOLIDS } from '../sim/city.js'
import { PROPS, DECKS, RAMPS } from '../sim/lots.js'
import { FWY } from '../sim/freeway.js'
import { TUNNELS, HILL_HW } from '../sim/hillroad.js'
import { canvasTex } from './scene.js'
import { Builder } from './builder.js'
import { district, DISTRICTS, Instances } from './chunks.js'

// the boxes' colours (works.js BOXES): the shipping lines' blues, reds, greens, a rust, greys
const BOX = [
  0x2a5a9c, 0xb8332b, 0x2f7d4f, 0xd27a2c, 0x8f8f8a, 0xe6e2d6, 0x1d3b63,
  0x8a4b2e, 0x3f8f95, 0xc9a227
]
const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k)
const CONCRETE = C(0xbdb7ab),
  ASPHALT = C(0x4b4c50),
  STEEL = C(0x8d949a),
  DARK = C(0x2a2b2e),
  WOOD = C(0x7b5a3c),
  WHITE = C(0xeeeeea),
  YELLOW = C(0xe2b53a),
  DOOR = C(0x8296a3),
  GLASS = C(0x6f8794)
const UNIT = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0)
const CONE = new THREE.ConeGeometry(1, 1, 12, 1).translate(0, 0.5, 0)
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)
const M = new THREE.Matrix4(),
  Q = new THREE.Quaternion(),
  V = new THREE.Vector3(),
  S = new THREE.Vector3(),
  UP = new THREE.Vector3(0, 1, 0)

// geo placed with its base at (x, y, z), scaled (sx, sy, sz) and turned yaw about its middle
function put (B, geo, x, y, z, sx, sy, sz, yaw, col) {
  Q.setFromAxisAngle(UP, yaw)
  M.compose(V.set(x, y, z), Q, S.set(sx, sy, sz))
  B.add(geo, M, col)
}
// a box from y0 to y1, its middle at local (u, w) from (x, z) turned yaw: u along the facing, w across
function box (B, x, z, yaw, u, w, su, sw, y0, y1, col) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw)
  put(B, UNIT, x + u * c + w * s, (y0 + y1) / 2, z - u * s + w * c, su, y1 - y0, sw, yaw, col)
}
const cyl = (B, x, y, z, r, h, col, geo = CYL) => put(B, geo, x, y, z, r, h, r, 0, col)

// chain-link: wire diamonds on the clear, a rail along the top
function chainTex () {
  const t = canvasTex(64, (g, s) => {
    g.clearRect(0, 0, s, s)
    g.strokeStyle = 'rgba(170,176,180,0.95)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(s, s)
    g.moveTo(s, 0)
    g.lineTo(0, s)
    g.stroke()
    g.fillStyle = '#9aa1a6'
    g.fillRect(0, 0, s, 4)
  })
  return t
}
// a fence's mesh, one plane down its middle; posts every 3 m
function chain (F, B, s) {
  const along = s.x1 - s.x0 > s.z1 - s.z0,
    m = along ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2
  const len = along ? s.x1 - s.x0 : s.z1 - s.z0,
    h = s.y1
  const uv = [0, 0, len / 0.6, h / 0.6]
  if (along) F.quad([s.x0, 0, m], [s.x1, 0, m], [s.x1, h, m], [s.x0, h, m], [0, 0, 1], uv, WHITE)
  else F.quad([m, 0, s.z1], [m, 0, s.z0], [m, h, s.z0], [m, h, s.z1], [1, 0, 0], uv, WHITE)
  for (let u = 0; u <= len + 0.01; u += Math.max(1, len / Math.ceil(len / 3))) {
    const x = along ? s.x0 + u : m,
      z = along ? m : s.z0 + u
    cyl(B, x, 0, z, 0.04, h + 0.05, STEEL)
  }
}

// a ramp's slope and its sides down to the ground, its edges painted
function slope (B, r) {
  const { x0, x1, z0, z1, h0, h1 } = r
  if (r.axis === 'x') {
    const n = new THREE.Vector3(h0 - h1, x1 - x0, 0).normalize().toArray()
    // (a car park's upper ramp is a slab, open under it: garage.js)
    const b0 = r.open ? h0 - 0.6 : 0,
      b1 = r.open ? h1 - 0.6 : 0
    B.quad([x0, h0, z1], [x1, h1, z1], [x1, h1, z0], [x0, h0, z0], n, [0, 0, 1, 1], ASPHALT)
    B.quad([x0, b0, z1], [x1, b1, z1], [x1, h1, z1], [x0, h0, z1], [0, 0, 1], [0, 0, 1, 1], CONCRETE)
    B.quad([x1, b1, z0], [x0, b0, z0], [x0, h0, z0], [x1, h1, z0], [0, 0, -1], [0, 0, 1, 1], CONCRETE)
    if (r.open) B.quad([x0, b0, z0], [x1, b1, z0], [x1, b1, z1], [x0, b0, z1], [0, -1, 0], [0, 0, 1, 1], CONCRETE)
    for (const z of [z0 + 0.5, z1 - 0.5])
      B.quad([x0, h0 + 0.03, z + 0.08], [x1, h1 + 0.03, z + 0.08], [x1, h1 + 0.03, z - 0.08], [x0, h0 + 0.03, z - 0.08], n, [0, 0, 1, 1], WHITE)
  } else {
    const n = new THREE.Vector3(0, z1 - z0, h0 - h1).normalize().toArray()
    B.quad([x0, h1, z1], [x1, h1, z1], [x1, h0, z0], [x0, h0, z0], n, [0, 0, 1, 1], ASPHALT)
    B.quad([x1, 0, z1], [x1, 0, z0], [x1, h0, z0], [x1, h1, z1], [1, 0, 0], [0, 0, 1, 1], CONCRETE)
    B.quad([x0, 0, z0], [x0, 0, z1], [x0, h1, z1], [x0, h0, z0], [-1, 0, 0], [0, 0, 1, 1], CONCRETE)
    for (const x of [x0 + 0.5, x1 - 0.5])
      B.quad([x - 0.08, h1 + 0.03, z1], [x + 0.08, h1 + 0.03, z1], [x + 0.08, h0 + 0.03, z0], [x - 0.08, h0 + 0.03, z0], n, [0, 0, 1, 1], WHITE)
  }
}
// a deck: its slab, the asphalt on top, and on the freeway's its lanes (along x)
function deck (B, d) {
  B.walls(d.x0, d.x1, d.z0, d.z1, d.y0, d.y1, CONCRETE, w => [0, 0, w / 4, 1])
  B.bottom(d.x0, d.x1, d.z0, d.z1, d.y0, CONCRETE)
  B.top(d.x0, d.x1, d.z0, d.z1, d.y1, ASPHALT)
  if (!FWY || Math.abs(d.y1 - FWY.y) > 0.01 || d.z0 > FWY.z || d.z1 < FWY.z) return
  const y = d.y1 + 0.02
  const line = (z, w, col, dash) => {
    for (let x = d.x0; x < d.x1; x += dash ? 12 : d.x1 - d.x0) {
      const e = Math.min(d.x1, x + (dash ? 4 : d.x1 - d.x0))
      B.top(x, e, z - w, z + w, y, col)
    }
  }
  const hw = (d.z1 - d.z0) / 2
  for (const s of [-1, 1]) {
    line(FWY.z + s * 0.9, 0.08, YELLOW, false)
    line(FWY.z + s * (hw - 1.2), 0.08, WHITE, false)
    for (const k of [1, 2]) line(FWY.z + s * (0.9 + ((hw - 2.1) * k) / 3), 0.07, WHITE, true)
  }
}

// the hill road's tunnel (hillroad.js): its lining, its roof, lamps down the middle and a concrete
// portal at each end, set into the ridge
function tunnel (B, lit, t) {
  const W = HILL_HW,
    zc = (t.z0 + t.z1) / 2
  const lo = Math.min(t.h0, t.h1) - 1,
    top = t.y1 - 0.5
  const LINING = C(0xc9c3b4)
  B.quad([t.x0, lo, zc - W], [t.x1, lo, zc - W], [t.x1, top, zc - W], [t.x0, top, zc - W], [0, 0, 1], [0, 0, 1, 1], LINING)
  B.quad([t.x1, lo, zc + W], [t.x0, lo, zc + W], [t.x0, top, zc + W], [t.x1, top, zc + W], [0, 0, -1], [0, 0, 1, 1], LINING)
  B.quad([t.x0, top, zc - W], [t.x0, top, zc + W], [t.x1, top, zc + W], [t.x1, top, zc - W], [0, -1, 0], [0, 0, 1, 1], C(0x8b877e))
  for (let x = t.x0 + 5; x < t.x1; x += 10) lit.cuboid(x - 1.2, x + 1.2, zc - 0.25, zc + 0.25, top - 0.15, top, WHITE)
  for (const [x, h, o] of [
    [t.x0, t.h0, -1],
    [t.x1, t.h1, 1]
  ]) {
    const a = Math.min(x, x + o),
      b = Math.max(x, x + o)
    const y0 = h - 1,
      y1 = h + (t.y1 - Math.max(t.h0, t.h1)) + 8
    B.cuboid(a, b, zc - W - 12, zc - W, y0, y1, CONCRETE)
    B.cuboid(a, b, zc + W, zc + W + 12, y0, y1, CONCRETE)
    B.cuboid(a, b, zc - W, zc + W, h + t.y1 - Math.max(t.h0, t.h1) - 0.5, y1, CONCRETE)
    B.cuboid(a - 0.3, b + 0.3, zc - W - 12.3, zc + W + 12.3, y1, y1 + 0.5, C(0xa9a397))
  }
}

// one of each prop kind, into the builders
function propOf (B, p) {
  const { x, z } = p
  switch (p.kind) {
    case 'trailer': {
      const yaw = p.yaw,
        L = p.cab ? 18.5 : 13.6,
        col = C(BOX[p.c], 1.05)
      const tu = p.cab ? -L / 2 + 6.8 : 0
      box(B, x, z, yaw, tu, 0, 13.6, 2.5, 1.2, 4, col)
      box(B, x, z, yaw, tu - 4.5, 0, 3.4, 2.2, 0.3, 1.2, DARK) // (the wheels at the back)
      box(B, x, z, yaw, tu + 6.4, 0, 0.4, 2, 0, 1.2, STEEL) // (its legs)
      if (p.cab) {
        box(B, x, z, yaw, L / 2 - 2, 0, 3.4, 2.4, 0.5, 3.4, C(BOX[(p.c + 3) % 10], 1.1))
        box(B, x, z, yaw, L / 2 - 4.6, 0, 1.6, 2.2, 0.3, 1.1, DARK)
      }
      break
    }
    case 'dock': {
      const yaw = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][p.face]
      box(B, x, z, yaw, 0.06, 0, 0.12, p.w, 1.2, 1.2 + p.h, DOOR)
      box(B, x, z, yaw, 0.12, 0, 0.24, p.w + 0.6, 0.9, 1.2, DARK)
      box(B, x, z, yaw, 0.05, 0, 0.1, p.w + 0.5, 1.2 + p.h, 1.5 + p.h, STEEL)
      break
    }
    case 'watertower': {
      const { y, r, h, legs } = p
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4
        cyl(B, x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8, 0.12, legs, STEEL)
      }
      cyl(B, x, y + legs * 0.5, z, r * 0.85, 0.12, STEEL)
      cyl(B, x, y + legs, z, r, h, WOOD)
      cyl(B, x, y + legs + h, z, r * 1.05, r * 0.6, C(0x5b4a3a), CONE)
      break
    }
    case 'stack': {
      cyl(B, x, 0, z, p.r, p.h, C(0x9a5844))
      if (p.bands) for (const k of [0.82, 0.9]) cyl(B, x, p.h * k, z, p.r + 0.03, p.h * 0.04, k > 0.85 ? WHITE : C(0xb8332b))
      cyl(B, x, p.h, z, p.r + 0.08, 0.4, DARK)
      break
    }
    case 'tank': {
      const col = C(0xd8d6d0, 0.75 + 0.25 * p.c)
      cyl(B, x, 0, z, p.r, p.h, col)
      put(B, DOME, x, p.h, z, p.r, p.r * 0.35, p.r, 0, col)
      break
    }
    case 'hoop': {
      const yaw = p.yaw
      box(B, x, z, yaw, -0.6, 0, 0.14, 0.14, 0, 3.4, STEEL)
      box(B, x, z, yaw, -0.2, 0, 0.9, 0.1, 3.2, 3.3, STEEL)
      box(B, x, z, yaw, 0.25, 0, 0.05, 1.8, 2.9, 3.95, WHITE)
      box(B, x, z, yaw, 0.5, 0, 0.45, 0.45, 3.04, 3.07, C(0xd2552a))
      break
    }
    case 'bleachers': {
      const { x0, x1, z0, z1, h, face } = p
      const rows = 5
      for (let i = 0; i < rows; i++) {
        const k = i / rows,
          y = (h * (i + 1)) / rows
        if (face === 3) B.cuboid(x0 + (x1 - x0) * k, x1, z0, z1, 0, y, i % 2 ? STEEL : C(0x9aa3a8))
        else B.cuboid(x0, x1 - (x1 - x0) * k, z0, z1, 0, y, i % 2 ? STEEL : C(0x9aa3a8))
      }
      break
    }
    case 'mast': {
      const r = p.big ? 0.6 : 0.25
      cyl(B, x, 0, z, r, p.h, STEEL)
      box(B, x, z, 0, 0, 0, p.big ? 1.2 : 0.8, p.big ? 6 : 3, p.h, p.h + (p.big ? 3.5 : 1.6), C(0xe8e6da))
      break
    }
    case 'shelter': {
      const yaw = p.yaw
      for (const w of [-1.7, 1.7]) box(B, x, z, yaw, -0.6, w, 0.1, 0.1, 0, 2.5, STEEL)
      box(B, x, z, yaw, -0.2, 0, 1.6, 3.8, 2.5, 2.62, STEEL)
      box(B, x, z, yaw, -0.65, 0, 0.05, 3.4, 0.3, 2.4, GLASS)
      box(B, x, z, yaw, -0.6, -1.68, 0.8, 0.05, 0.3, 2.4, GLASS)
      box(B, x, z, yaw, -0.35, 0, 0.4, 2.2, 0.45, 0.5, WOOD) // (the bench)
      box(B, x, z, yaw, -0.6, 1.9, 0.08, 1.2, 0.4, 2.4, C(0xf2efe2, 1.3)) // (its ad panel)
      break
    }
  }
}

export function buildWorks (group) {
  const solid = Array.from({ length: DISTRICTS }, () => new Builder())
  const mesh = Array.from({ length: DISTRICTS }, () => new Builder())
  const at = (x, z) => district(x, z)
  for (const s of SOLIDS) {
    const d = at((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)
    if (s.look === 'chain') chain(mesh[d], solid[d], s)
    else if (s.look === 'parapet' || s.look === 'barrier') {
      solid[d].cuboid(s.x0, s.x1, s.z0, s.z1, s.y0, s.y1, CONCRETE)
    }
  }
  for (const k of DECKS) deck(solid[at((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2)], k)
  for (const r of RAMPS) slope(solid[at((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)], r)
  const boxes = [],
    bushes = []
  for (const p of PROPS) {
    if (p.kind === 'container') {
      for (let i = 0; i < p.n; i++) boxes.push({ ...p, i })
    } else if (p.kind === 'bush') bushes.push(p)
    else propOf(solid[at(p.x, p.z)], p)
  }
  const lit = new Builder()
  for (const t of TUNNELS) tunnel(solid[at((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2)], lit, t)
  add(group, lit, new THREE.MeshBasicMaterial({ color: 0xfff1cf }), false, 'tunnel lamps')
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
  for (const b of solid) add(group, b, mat, true, 'works')
  const chainMat = new THREE.MeshStandardMaterial({
    map: chainTex(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.3
  })
  for (const b of mesh) add(group, b, chainMat, false, 'chain-link')
  // the containers: one box each, ribbed by a texture-free shade, instanced
  const col = new THREE.Color()
  if (boxes.length) {
    const I = new Instances(UNIT, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), boxes.length, i => boxes[i], { far: 1000 })
    boxes.forEach((p, i) => {
      const along = p.yaw === 0
      Q.setFromAxisAngle(UP, 0)
      M.compose(V.set(p.x, 1.295 + p.i * 2.59, p.z), Q, S.set(along ? p.L - 0.05 : 2.42, 2.55, along ? 2.42 : p.L - 0.05))
      I.setMatrixAt(i, M)
      I.setColorAt(i, col.setHex(BOX[p.c[p.i]]))
    })
    for (const m of I.bounds().meshes) {
      m.name = 'containers'
      group.add(m)
    }
  }
  if (bushes.length) {
    const geo = new THREE.IcosahedronGeometry(1, 1)
    const I = new Instances(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), bushes.length, i => bushes[i], { cast: false, far: 450 })
    bushes.forEach((p, i) => {
      M.compose(V.set(p.x, p.r * 0.6, p.z), Q.identity(), S.set(p.r, p.r * 0.8, p.r))
      I.setMatrixAt(i, M)
      I.setColorAt(i, col.setHSL(0.26 + ((i * 37) % 10) * 0.006, 0.38, 0.26 + ((i * 53) % 7) * 0.012))
    })
    for (const m of I.bounds().meshes) {
      m.name = 'bushes'
      group.add(m)
    }
  }
}
function add (group, b, mat, cast, name) {
  if (b.empty) return
  const m = new THREE.Mesh(b.geometry(), mat)
  m.castShadow = cast
  m.receiveShadow = true
  m.name = name
  group.add(m)
}
