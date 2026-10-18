// The street trees' shapes (cityTrees.js plants them, treeWind.js moves them), each in two: the
// full one for those near the camera and a cheap one for the rest, alike in outline and colour so
// that one hands over to the other unseen. Near, a trunk that forks at head height into four limbs
// reaching up into the crown, and the crown eight overlapping clumps of leaf cards (each a spray of
// leaves cut out of the foliage sheet, treeTex.js), darker inside and underneath, lit as one
// rounded mass; far off, the trunk and a dozen big cards of dense leaf round the crown's middle.
// And what the palms (palmShapes.js) are built with too: Shape, an indexed geometry put together a
// vertex at a time with the shader's own attribute; a tube along a path, for trunks and limbs; and
// a card.
import * as THREE from 'three'
import { SHEET, SIZE } from './treeTex.js'
import { rng } from '../sim/city.js'
import { TAU } from '../sim/constants.js'

// What each part is (the shader's vPart): bark; a palm's leaf (glossy, paler underneath); something
// dead (a date palm's dead fronds are trimmed off some palms); a fan palm's skirt (stretched to its
// own length); a street tree's leaves (lit by the crown's normals).
export const PART = { bark: 0, leaf: 1, dead: 2, skirt: 3, foliage: 4 }

// The street trees' kinds, in the order their pictures lie on the sheet: a ficus, dark and dense,
// its bark smooth and grey; a plane (a sycamore), lighter, its leaves big and lobed, its bark
// mottled pale; a jacaranda, feathery, its bark dark, and its flowers. (Bark: what the bark
// texture is multiplied by; leaves and flowers: their colours, which the sheet's greys shade.)
export const KINDS = [
  { bark: new THREE.Color(1.15, 1.15, 1.2), leaf: new THREE.Color(0x6f9c50) },
  { bark: new THREE.Color(1.35, 1.3, 1.12), leaf: new THREE.Color(0x98b65a) },
  {
    bark: new THREE.Color(0.75, 0.66, 0.6),
    leaf: new THREE.Color(0x86b064),
    bloom: new THREE.Color(0xa58fe6)
  }
]
export const FORK = 2.1 // m up, as built: where a street tree's trunk forks
export const CROWN = 4.7 // m up: the middle of its crown

// ---------- building ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
export const norm = a => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1))

// Geometry put together a vertex at a time: each vertex's normal, its place on a texture, its
// colour, and how it moves in the wind (aSway: how far up the tree it hangs, as a share of the
// height its crown is at, 1 for all of the crown; how freely it moves, 0 where a leaf is held to 1
// at its tip; a phase of its own; and its PART).
export class Shape {
  constructor () {
    this.pos = []
    this.nrm = []
    this.uv = []
    this.col = []
    this.sway = []
    this.idx = []
    this.n = 0
  }
  // a vertex at p, lit by normal nm, at (u, v) on its texture, coloured c, swaying as s: its index
  vert (p, nm, u, v, c, s) {
    const k = 1 / (Math.hypot(nm[0], nm[1], nm[2]) || 1)
    this.pos.push(p[0], p[1], p[2])
    this.nrm.push(nm[0] * k, nm[1] * k, nm[2] * k)
    this.uv.push(u, v)
    this.col.push(c.r, c.g, c.b)
    this.sway.push(s[0], s[1], s[2], s[3])
    return this.n++
  }
  // a triangle and a quad, counter-clockwise seen from their fronts
  tri (a, b, c) {
    this.idx.push(a, b, c)
  }
  quad (a, b, c, d) {
    this.idx.push(a, b, c, a, c, d)
  }
  geometry () {
    const g = new THREE.BufferGeometry()
    const set = (name, a, n) =>
      g.setAttribute(name, new THREE.Float32BufferAttribute(a, n))
    set('position', this.pos, 3)
    set('normal', this.nrm, 3)
    set('uv', this.uv, 2)
    set('color', this.col, 3)
    set('aSway', this.sway, 4)
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

// A tube along path (points [x, y, z]), radii[i] round at each, sides round. Its texture
// coordinates: uv(u, i, m), u from 0 to 1 round it at ring i, m along it; ring i is coloured col(i)
// and sways as sway(i).
export function tube (sh, path, radii, sides, uv, col, sway) {
  let u = null,
    along = 0
  const rings = path.map((p, i) => {
    const t = norm(
      sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)])
    )
    // (the frame round it carried on from the last ring, so the tube doesn't twist)
    if (!u) u = norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    else u = norm(sub(u, scale(t, dot(u, t))))
    const w = cross(t, u)
    if (i) along += Math.hypot(...sub(p, path[i - 1]))
    const ring = []
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU,
        d = add(scale(u, Math.cos(a)), scale(w, Math.sin(a)))
      const [tu, tv] = uv(k / sides, i, along)
      ring.push(sh.vert(add(p, scale(d, radii[i])), d, tu, tv, col(i), sway(i)))
    }
    return ring
  })
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1],
      b = rings[i]
    for (let k = 0; k < sides; k++) sh.quad(a[k], a[k + 1], b[k + 1], b[k])
  }
}
// bark: once round, repeating every tile m along
export const barkUV = tile => (u, i, m) => [u, m / tile]

// A square card w m across, its middle at c, facing n (its picture's top as near the sky as it can
// be), showing the square [x, y, s] of the sheet; each corner p lit by nrm(p), coloured col(p) and
// swaying as sway(p).
export function card (sh, c, n, w, [x, y, s], nrm, col, sway) {
  const right = norm(cross(Math.abs(n[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0], n))
  const up = cross(n, right)
  const k = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1]
  ].map(([a, b]) => {
    const p = add(c, add(scale(right, (a * w) / 2), scale(up, (b * w) / 2)))
    const u = (x + ((a + 1) / 2) * s) / SIZE,
      v = (y + ((1 - b) / 2) * s) / SIZE
    return sh.vert(p, nrm(p), u, v, col(p), sway(p))
  })
  sh.quad(k[3], k[2], k[1], k[0])
}

// ---------- the street tree ----------
const MID = [0, CROWN, 0]
// the crown's clumps of leaves near: [x, y, z, radius]; and the limbs reaching into them
const CLUMPS = [
  [0, 5.6, 0, 1.45],
  [1.35, 4.6, 0.35, 1.25],
  [-0.55, 4.8, 1.3, 1.2],
  [-1.3, 4.5, -0.45, 1.25],
  [0.45, 4.7, -1.3, 1.2],
  [0.95, 3.75, 0.85, 1.05],
  [-0.8, 3.7, -0.55, 1.05],
  [0.15, 3.85, -0.35, 0.9]
]
const LIMBS = [
  [1.15, 4.4, 0.25],
  [-0.45, 4.6, 1.1],
  [-1.1, 4.3, -0.4],
  [0.35, 5.4, -0.9]
]
// how a point of the crown is lit and shaded: its normal from the crown's middle (and the clump's),
// darker inside and underneath, and how freely it moves (more out at the edge)
const out = p => Math.min(1, Math.hypot(...sub(p, MID)) / 2.6)
const crownNormal = (p, at) =>
  add(scale(norm(sub(p, MID)), 0.65), scale(norm(sub(p, at)), 0.35))
const crownShade = (p, c, k) => {
  const up = Math.max(-1, Math.min(1, (p[1] - CROWN) / 2.2))
  const v = Math.min(1.05, 0.38 + 0.3 * (0.5 + 0.5 * up) + 0.37 * out(p)) * k
  return c.setRGB(v, v, v)
}

// A street tree, as built: 4.7 m to the middle of its crown (scaled per tree, and its crown drawn
// tall or wide, by the shader).
export function broadleaf (near) {
  const R = rng(near ? 3101 : 3102)
  const sh = new Shape()
  const c = new THREE.Color()
  const bark = i => c.setRGB(...(i ? [1, 1, 1] : [0.68, 0.66, 0.64])),
    white = () => c.setRGB(1, 1, 1)
  // (the bark bends with the trunk, up to just under the crown, which turns as a whole)
  const hang = p => i => [Math.min(0.99, p[i][1] / CROWN), 0, 0, PART.bark]
  // the trunk, flared at its foot, and (near) its limbs
  const trunk = near
    ? [
        [0, 0, 0],
        [0, 0.3, 0],
        [0.03, 1.1, 0],
        [0, FORK, 0.02]
      ]
    : [
        [0, 0, 0],
        [0, FORK + 1.5, 0]
      ]
  tube(
    sh,
    trunk,
    near ? [0.3, 0.22, 0.19, 0.17] : [0.24, 0.1],
    near ? 7 : 4,
    barkUV(1.5),
    bark,
    hang(trunk)
  )
  if (near)
    for (const end of LIMBS) {
      const from = [0, FORK - 0.15, 0],
        mid = add(add(from, scale(sub(end, from), 0.45)), [0, 0.35, 0]),
        path = [from, mid, end]
      tube(sh, path, [0.12, 0.08, 0.035], 5, barkUV(1.5), white, hang(path))
    }
  // the crown
  const [lx, ly, ls] = SHEET.leaves,
    [kx, ky] = SHEET.clump
  if (near) {
    // (each clump's cards out round its surface, all of them drawn outermost first: those further
    // in are mostly behind them, and their hidden pixels are left out before they are shaded)
    const cards = []
    for (const [x, y, z, r] of CLUMPS) {
      const at = [x, y, z]
      for (let i = 0; i < 6; i++) {
        const d = norm([R() - 0.5, R() - 0.5, R() - 0.5]),
          o = add(at, scale(d, r * (0.45 + 0.4 * R()))),
          facing = norm(add(d, [R() - 0.5, R() - 0.4, R() - 0.5]))
        cards.push({ at, o, facing, r, phase: R(), k: 0.9 + 0.2 * R() })
      }
    }
    const far = q => Math.hypot(...sub(q.o, MID))
    cards.sort((a, b) => far(b) - far(a))
    for (const { at, o, facing, r, phase, k } of cards)
      card(
        sh,
        o,
        facing,
        r * 1.55,
        [lx, ly, ls],
        p => crownNormal(p, at),
        p => crownShade(p, c, k),
        p => [1, 0.35 + 0.65 * out(p), phase, PART.foliage]
      )
  } else {
    // (round the crown's middle where an icosahedron's corners would be, facing out)
    const g = (1 + Math.sqrt(5)) / 2
    for (const [a, b] of [
      [1, g],
      [1, -g],
      [-1, g],
      [-1, -g]
    ])
      for (const d of [
        [0, a, b],
        [a, b, 0],
        [b, 0, a]
      ]) {
        const n = norm(d),
          o = add(MID, [n[0] * 1.5, n[1] * 1.1 - 0.25, n[2] * 1.5])
        const phase = R()
        card(
          sh,
          o,
          n,
          3,
          [kx, ky, ls],
          p => crownNormal(p, MID),
          p => crownShade(p, c, 1),
          p => [1, 0.6, phase, PART.foliage]
        )
      }
  }
  return sh.geometry()
}
