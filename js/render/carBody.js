// The traffic's car bodies, lofted like the Roadster's (loft.js) but from lines drawn along the car
// the way a designer draws one (each type's are in carSpecs.js): the centre line over the top
// (nose, hood, windscreen, roof, rear window, deck or tailgate), the beltline, the underside, the
// roof's side, and the plan, rounded at both ends and, on a sports car, swelling over the rear
// wheels, or (a truck's cab ahead of its box) narrower over part of its length. Each station's half
// section runs from under the sill up the rocker, out to the widest point of the lower body, in
// again at a crisp character line, over the shoulder to the beltline, then up the glass (leaning
// in) to the roof's side and over to its crown; ahead of the windscreen and behind the rear window,
// across the hood or the deck instead. Which piece is glass, pillar or roof falls out of where it
// lies. The geometry is indexed, its normals smooth across each panel and sharp along the character
// line, the beltline and the edges of the glass, and across the car where a box's face meets its
// sides (breaks).
import * as THREE from 'three'
import { at } from './loft.js'

export const lerp = (a, b, t) => a + (b - a) * t

// A line through knots [[x, y], ...]: straight between them, level past the ends
export function line (knots) {
  const k = knots.slice().sort((a, b) => a[0] - b[0])
  return x => {
    if (x <= k[0][0]) return k[0][1]
    for (let i = 1; i < k.length; i++)
      if (x <= k[i][0])
        return lerp(
          k[i - 1][1],
          k[i][1],
          (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
        )
    return k[k.length - 1][1]
  }
}

// which point of a section is which (from 0, under the middle, round to 10, the crown)
export const P = {
  sill: 2,
  wide: 4,
  crease: 5,
  shoulder: 6,
  belt: 7,
  rail: 8,
  edge: 9,
  crown: 10
}

const DEFAULTS = {
  beltIn: 0.085, // how far in from the widest point the glass's foot is
  edgeIn: 0.09, // and the roof's edge from its side
  edgeUp: 0.8, // how far up from the side to the crown the roof's edge is
  panel: 0.7, // across a hood or deck, where its crown begins
  nose: [0.5, 0.62], // plan: how far back the rounding of the nose goes, and how wide its end is
  tail: [0.34, 0.8],
  wIn: 0.012, // (the body a little inside the sim's width)
  breaks: [] // where the normals break across the car (a box's front face, say)
}

// The lines of a body, from its spec S (carSpecs.js SPECS) and type T (sim/traffic.js TYPES)
export function bodyLines (S, T) {
  const L = T.len / 2
  const B = { ...DEFAULTS, ...S, L, name: T.name }
  B.W = T.wid / 2 - B.wIn
  B.top = line(S.top)
  B.belt = line(S.belt)
  B.bot = line(S.bot)
  B.railY = typeof S.rail === 'number' ? () => S.rail : line(S.rail)
  B.glass = S.glass || [S.cp, S.ws]
  B.knots = [...S.top, ...S.belt]
  // (how far in the lower body and the beltline are at x: a cab narrower than its box)
  B.inset = S.inset ? line(S.inset) : () => 0
  return B
}

// the plan: the body's width at x as a share of its full width, rounding off at the ends
export function plan (B, x) {
  let c, s, u
  if (x > B.L - B.nose[0]) {
    ;[c, s] = B.nose
    u = (x - B.L + c) / c
  } else if (x < -B.L + B.tail[0]) {
    ;[c, s] = B.tail
    u = (-B.L + c - x) / c
  } else return 1
  u = Math.min(1, u)
  return s + (1 - s) * Math.sqrt(1 - u * u)
}
// how much wider than the rest the lower body is at x (a sports car's haunches)
function bulge (B, x) {
  if (!B.haunch) return 0
  const [a, xc, w] = B.haunch
  return a * Math.exp(-(((x - xc) / w) ** 2))
}

// The half section at x: 11 points [z, y]
export function sectionAt (B, x) {
  const s = plan(B, x),
    inset = B.inset(x),
    Wl = B.W + bulge(B, x) - inset
  const bot = B.bot(x),
    belt = B.belt(x),
    top = Math.max(B.top(x), belt)
  // (squeezed up together where the body is low, at a nose or a tail)
  const y6 = belt - 0.055,
    y5 = Math.min(B.crease, y6 - 0.05),
    y2 = Math.max(B.sill, bot + 0.03),
    y4 = Math.max(Math.min(B.mid, y5 - 0.08), y2 + 0.06),
    y3 = Math.min(Math.max(B.sill + 0.09, y2 + 0.03), y4 - 0.03)
  const z7 = B.W - B.beltIn - inset
  const p = [
    [0, bot],
    [Wl - 0.17, bot],
    [Wl - 0.065, y2],
    [Wl - 0.022, y3],
    [Wl, y4],
    [Wl - 0.01, y5],
    [lerp(Wl - 0.01, z7, 0.45), y6],
    [z7, belt],
    ...upper(B, x, z7, belt, top)
  ]
  for (const q of p) q[0] *= s
  return p
}
// above the beltline: the glass's top at the side (up the A-pillar, along the roof's side, down the
// back of the side windows), the roof's edge (or the windscreen's, or the rear window's) and the
// crown; or across the hood or deck
function upper (B, x, ez, ey, top) {
  const { ws, rf, rr, rw, cp, dTop, roofW, edgeIn, edgeUp, panel } = B
  if (x > ws + 1e-6 || x < rw - 1e-6) {
    const h = top - ey
    return [
      [ez * 0.95, ey + h * 0.5],
      [ez * panel, ey + h * 0.92],
      [0, top]
    ]
  }
  const rail = B.railY(x)
  let p8
  if (x >= rf) {
    const t = (ws - x) / (ws - rf)
    p8 = [lerp(ez, roofW, t), lerp(ey, rail, t)]
  } else if (x >= dTop) p8 = [roofW, rail]
  else if (x > cp) {
    const t = (dTop - x) / (dTop - cp)
    p8 = [lerp(roofW, ez, t), lerp(rail, ey, t)]
  } else p8 = [ez, ey]
  let p9
  if (x >= rr) {
    const t = x >= rf ? (ws - x) / (ws - rf) : 1
    p9 = [lerp(ez * panel, roofW - edgeIn, t), lerp(p8[1], top, edgeUp)]
  } else {
    // the rear window's edge, from the roof's edge down to the deck's
    const t = (rr - x) / (rr - rw)
    const d0 = (1 - edgeUp) * (B.top(rr) - B.railY(rr)),
      d1 = 0.08 * (B.top(rw) - B.belt(rw))
    p9 = [lerp(roofW - edgeIn, ez * panel, t), top - lerp(d0, d1, t)]
  }
  return [p8, p9, [0, top]]
}

// The stations along the car: at every knot of its lines, every boundary between its pieces, and
// round each rounded end (each marked where the normals break across the car)
export function stationsOf (B) {
  const { L } = B
  const edges = [B.ws, B.rf, B.rr, B.rw, B.cp, B.dTop, ...B.glass, ...B.breaks]
  const xs = [-L, L, ...edges]
  for (const [x] of B.knots) xs.push(x)
  for (const a of [0, 0.6, 0.92]) {
    xs.push(L - B.nose[0] + B.nose[0] * a)
    xs.push(-L + B.tail[0] - B.tail[0] * a)
  }
  const keep = []
  const sorted = [...new Set(xs.map(x => Math.round(x * 1000) / 1000))]
    .filter(x => x >= -L && x <= L)
    .sort((a, b) => a - b)
  const must = new Set([-L, L, ...edges].map(x => Math.round(x * 1000) / 1000))
  for (const x of sorted) {
    const near = keep.length && x - keep[keep.length - 1] < 0.035
    if (!near) keep.push(x)
    else if (must.has(x)) keep[keep.length - 1] = x
  }
  const sharp = new Set(B.breaks.map(x => Math.round(x * 1000) / 1000))
  return keep.map(x => ({ x, p: sectionAt(B, x), sharp: sharp.has(x) }))
}

// Which piece segment j (between points j and j + 1) is, between stations at xa and xb: 'paint',
// 'glass', 'dark' (black trim), or null (left out)
export function pieceOf (B) {
  return (j, xa, xb) => {
    const x = (xa + xb) / 2
    if (j === 0) return null // (the underside: never seen)
    if (j < P.belt) return 'paint'
    if (B.bed && x < B.rw) return null // (an open pickup bed)
    if (x > B.ws || x < B.rw) return 'paint' // hood, deck
    if (j === P.belt) {
      if (x > B.glass[0] && x < B.glass[1]) return 'glass'
      return x < B.cp ? null : 'paint' // (behind the side windows it has no height)
    }
    if (x > B.rf) return 'glass' // the windscreen
    if (j === P.rail + 1 && x < B.rr) return 'glass' // the rear window
    if (x < B.dTop && B.darkPillar) return 'dark'
    return 'paint'
  }
}

const tri = (pos, a, b, c) => {
  const ux = pos[b * 3] - pos[a * 3],
    uy = pos[b * 3 + 1] - pos[a * 3 + 1],
    uz = pos[b * 3 + 2] - pos[a * 3 + 2]
  const vx = pos[c * 3] - pos[a * 3],
    vy = pos[c * 3 + 1] - pos[a * 3 + 1],
    vz = pos[c * 3 + 2] - pos[a * 3 + 2]
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
}

// Sweep the stations into indexed geometries by piece, mirrored to both sides, with each end closed
// by a flat cap in capKey. Normals are smooth within a piece except along the section points in
// sharp, and across the car at the stations marked sharp, where they break.
export function loftIx (
  st,
  keyFor,
  capKey = 'paint',
  sharp = [P.crease, P.belt, P.rail]
) {
  const n = st[0].p.length
  const grp = [],
    across = []
  for (let j = 0, g = 0; j < n - 1; j++) {
    if (j && sharp.includes(j)) g++
    grp.push(g)
  }
  for (let i = 0, g = 0; i < st.length; i++) across.push((g += st[i].sharp))
  const buckets = new Map()
  const get = key => {
    let b = buckets.get(key)
    if (!b)
      buckets.set(key, (b = { pos: [], idx: [], ids: new Map(), nrm: null }))
    return b
  }
  const vert = (b, i, j, sg, g, a) => {
    const [z, y] = st[i].p[j]
    const side = Math.abs(z) < 1e-6 ? 0 : sg
    const id = `${i},${j},${g},${side},${a}`
    let v = b.ids.get(id)
    if (v === undefined) {
      v = b.pos.length / 3
      b.pos.push(st[i].x, y, side * z)
      b.ids.set(id, v)
    }
    return v
  }
  for (let i = 0; i < st.length - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const key = keyFor(j, st[i].x, st[i + 1].x)
      if (key === null) continue
      const b = get(key),
        g = grp[j],
        x = across[i]
      for (const sg of [1, -1]) {
        const a = vert(b, i, j, sg, g, x),
          c = vert(b, i + 1, j, sg, g, x),
          bb = vert(b, i, j + 1, sg, g, x),
          d = vert(b, i + 1, j + 1, sg, g, x)
        const t = sg > 0 ? [a, c, bb, c, d, bb] : [a, bb, c, c, bb, d]
        for (let k = 0; k < 6; k += 3)
          if (tri(b.pos, t[k], t[k + 1], t[k + 2]) > 1e-7)
            b.idx.push(t[k], t[k + 1], t[k + 2])
      }
    }
  const out = new Map()
  for (const [key, b] of buckets) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    g.setIndex(b.idx)
    g.computeVertexNormals()
    out.set(key, g)
  }
  if (capKey !== null) {
    const caps = [cap(st[0], -1), cap(st[st.length - 1], 1)]
    out.set(capKey, mergeIx([out.get(capKey), ...caps].filter(Boolean)))
  }
  return out
}
// an end of the body closed flat: a fan from the middle of its section, facing out along x
function cap (S, f) {
  const ring = [
    ...S.p.map(([z, y]) => [z, y]),
    ...S.p
      .slice(1, -1)
      .reverse()
      .map(([z, y]) => [-z, y])
  ]
  const cy = S.p.reduce((s, p) => s + p[1], 0) / S.p.length
  const pos = [S.x, cy, 0],
    idx = []
  for (const [z, y] of ring) pos.push(S.x, y, z)
  for (let i = 0; i < ring.length; i++) {
    const a = i + 1,
      b = ((i + 1) % ring.length) + 1
    if (f > 0) idx.push(0, b, a)
    else idx.push(0, a, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const nrm = new Float32Array(pos.length)
  for (let i = 0; i < nrm.length; i += 3) nrm[i] = f
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setIndex(idx)
  return g
}

// Merge geometries keeping their indices (so shared corners stay shared): position, normal, and
// colour and lamp tags where any of them has them (white and 0 where one hasn't)
export function mergeIx (geos) {
  let n = 0
  for (const g of geos) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  const idx = []
  const attrs = [
    ['position', 3, 0],
    ['normal', 3, 0],
    ['color', 3, 1],
    ['aLamp', 1, 0]
  ]
  for (const [name, size, fill] of attrs) {
    if (!geos.some(g => g.attributes[name])) continue
    const arr = new Float32Array(n * size)
    let o = 0
    for (const g of geos) {
      const a = g.attributes[name],
        c = g.attributes.position.count * size
      if (a) arr.set(a.array.subarray(0, c), o)
      else if (fill) arr.fill(fill, o, o + c)
      o += c
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  let o = 0
  for (const g of geos) {
    const count = g.attributes.position.count
    if (g.index) for (const i of g.index.array) idx.push(i + o)
    else for (let i = 0; i < count; i++) idx.push(i + o)
    o += count
  }
  out.setIndex(idx)
  out.computeBoundingSphere()
  return out
}

// The body's side at x and height y (on the +z side): its z, straight between stations
export function sideAt (st, x, y, j0 = 1, j1 = P.belt) {
  let prev = at(st, x, j0)
  if (y <= prev[1]) return prev[0]
  for (let j = j0 + 1; j <= j1; j++) {
    const p = at(st, x, j)
    if (y <= p[1])
      return lerp(prev[0], p[0], (y - prev[1]) / (p[1] - prev[1] || 1))
    prev = p
  }
  return prev[0]
}
