// What the traffic's trim and lamps (carTrim.js, carExtras.js, carRigs.js, carClassics.js,
// carLamps.js) are made of: pieces in vertex colours, each vertex tagged with what it is (aLamp: a
// lamp to light, chrome, gloss black or brushed aluminium to shine, a roller door to roll up), as
// boxes, flat rounded pieces and discs on a car's faces, bands along its sections, and strips laid
// on its surface and wrapped round its rounded corners.
import * as THREE from 'three'
import { at, seam } from './loft.js'
import { sideAt, lerp } from './carBody.js'

// what each piece is (aLamp), and how it lights (carLamps.js lampMaterial)
export const LAMP = {
  none: 0,
  head: 1,
  tail: 2,
  stop: 3,
  left: 4,
  right: 5,
  reverse: 6,
  route: 7,
  taxi: 8,
  drl: 9,
  barRed: 10,
  barBlue: 11,
  markFront: 12,
  markRear: 13,
  barWhite: 14,
  barAmber: 15,
  clearFront: 16, // (a truck's clearance lamps, high up: amber in front, red behind)
  clearRear: 17,
  chrome: 20,
  gloss: 21,
  door: 22, // (a box truck's roller door: its opening's top in the fraction, carLamps.js)
  satin: 23,
  shutter: 24
}
// each lens's own coloured glass, unlit
export const LENS = {
  [LAMP.head]: 0xc4ccd4,
  [LAMP.drl]: 0xe8ecf0,
  [LAMP.tail]: 0x7a0a0e,
  [LAMP.stop]: 0x6a080b,
  [LAMP.left]: 0xb8701a,
  [LAMP.right]: 0xb8701a,
  [LAMP.reverse]: 0xc9ccd0,
  [LAMP.route]: 0x15110a,
  [LAMP.taxi]: 0xf2ead0,
  [LAMP.barRed]: 0x4a0709,
  [LAMP.barBlue]: 0x0a1650,
  [LAMP.markFront]: 0xa8641a,
  [LAMP.markRear]: 0x6a0a0c,
  [LAMP.barWhite]: 0xb8bcc0,
  [LAMP.barAmber]: 0x8a4a0c,
  [LAMP.clearFront]: 0xa8641a,
  [LAMP.clearRear]: 0x6a0a0c
}
// (one export each: the bundler takes a declaration's first name only)
export const BLACK = 0x0d0e10
export const GLOSS = 0x060708
export const CHROME = 0xd4d8dc
export const SATIN = 0xa9adb2

// colour and lamp tag on every vertex of g
export function paint (g, color, lamp = LAMP.none) {
  const n = g.attributes.position.count,
    c = new THREE.Color(color),
    col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute(
    'aLamp',
    new THREE.BufferAttribute(new Float32Array(n).fill(lamp), 1)
  )
  g.deleteAttribute('uv')
  return g
}

// a box from (x0, y0, z0) to (x1, y1, z1)
export const box = (x0, y0, z0, x1, y1, z1) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2
  )
// a plain rectangle w x h, flat, facing +z (two triangles), and a disc of radius r
export const quad = (w, h) => new THREE.PlaneGeometry(w, h)
export const disc = (r, segs = 8) => new THREE.CircleGeometry(r, segs)

// A rounded rectangle w x h (corner radius r), flat, facing +z
export function rounded (w, h, r, segs = 2) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2
  r = Math.min(r, w / 2, h / 2)
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(s, segs)
}
// a flat piece facing out along +x or -x (on a car's nose or tail), +z or -z (its side) or up
export function piece (geo, face, x, y, z, color, lamp = LAMP.none) {
  if (face === 'x+') geo.rotateY(Math.PI / 2)
  else if (face === 'x-') geo.rotateY(-Math.PI / 2)
  else if (face === 'z-') geo.rotateY(Math.PI)
  else if (face === 'y+') geo.rotateX(-Math.PI / 2)
  geo.translate(x, y, z)
  return paint(geo, color, lamp)
}

// A band along section point k (towards point k2) from x0 to x1, both sides: a window surround
export function band (st, k, k2, x0, x1, w, lift = 0.004) {
  const pos = []
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 0.25))
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n,
      xb = x0 + ((x1 - x0) * (i + 1)) / n
    const edge = x => {
      const A = at(st, x, k),
        B = at(st, x, k2)
      const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
      const u = [(B[0] - A[0]) / l, (B[1] - A[1]) / l]
      const o = [u[1] * lift, -u[0] * lift]
      const ww = Math.min(w, l)
      return [
        [A[0] + o[0], A[1] + o[1]],
        [A[0] + u[0] * ww + o[0], A[1] + u[1] * ww + o[1]]
      ]
    }
    const [a, b] = edge(xa),
      [c, d] = edge(xb)
    for (const sg of [1, -1]) {
      const v = (x, [z, y]) => [x, y, sg * z]
      pos.push(...v(xa, a), ...v(xb, c), ...v(xa, b))
      pos.push(...v(xb, c), ...v(xb, d), ...v(xa, b))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
// a band across the body at x, from section point k0 to k1, both sides: a shut line, a pillar
export const across = (st, x, k0, k1, w, lift = 0.004) =>
  seam(st, x, k0, k1, null, w, lift).geometry

// A strip on the body's surface round one end (f: 1 the nose, -1 the tail), along a path from z0 on
// the end face out to its edge, round the corner and back along the side to d from the end; or,
// with z1, along the face from z0 to z1 only (at x, if given: a face set back from the very end,
// as a cab's behind its bumper); or, with side: [xa, xb], along the side only. Each part [u0, u1,
// colour, lamp] covers that share of the path, between heights yb(u) and yt(u), lifted off the
// surface. Both sides (lamp 'ind': each side's indicator), or one with mirror false.
export function wrap (st, f, o, parts, lift, out, mirror = true) {
  const E = o.x ?? st[f > 0 ? st.length - 1 : 0].x
  const yb = u => lerp(o.yb[0], o.yb[1], u),
    yt = u => lerp(o.yt[0], o.yt[1], u)
  const ym = (yb(0.5) + yt(0.5)) / 2
  const nodes = []
  if (o.side)
    for (const x of between(st, o.side[0], o.side[1]))
      nodes.push(sideNode(st, x))
  else {
    nodes.push({ x: E, z: () => o.z0 })
    if (o.z1 !== undefined) nodes.push({ x: E, z: () => o.z1 })
    else {
      nodes.push(sideNode(st, E))
      for (const x of between(st, E, E - f * o.d).slice(1))
        nodes.push(sideNode(st, x))
    }
  }
  const s = [0]
  for (let i = 1; i < nodes.length; i++)
    s.push(
      s[i - 1] +
        Math.hypot(
          nodes[i].x - nodes[i - 1].x,
          nodes[i].z(ym) - nodes[i - 1].z(ym)
        )
    )
  const total = s[s.length - 1] || 1
  // a column of the strip at u: where it is, and which way is out (in plan)
  const column = u => {
    const at = u * total
    let i = 0
    while (i < nodes.length - 2 && s[i + 1] < at) i++
    const a = nodes[i],
      b = nodes[i + 1]
    const t = Math.min(1, Math.max(0, (at - s[i]) / (s[i + 1] - s[i] || 1)))
    const tx = b.x - a.x,
      tz = b.z(ym) - a.z(ym),
      l = Math.hypot(tx, tz) || 1
    // (round the corner the path turns; on the face it points straight out)
    let nx = (f * tz) / l,
      nz = (-f * tx) / l
    if (o.side) {
      nx = 0
      nz = 1
    }
    const x = lerp(a.x, b.x, t)
    const z = y => lerp(a.z(y), b.z(y), t)
    return { x, z, nx, nz }
  }
  const us = s.map(v => v / total)
  for (const [u0, u1, color, lamp] of parts) {
    const cols = [
      u0,
      ...us.filter(u => u > u0 + 1e-4 && u < u1 - 1e-4),
      u1
    ].map(u => ({ u, ...column(u) }))
    for (const side of mirror ? [1, -1] : [1]) {
      const pos = [],
        nrm = []
      for (const c of cols)
        for (const y of [yb(c.u), yt(c.u)]) {
          pos.push(c.x + c.nx * lift, y, side * (c.z(y) + c.nz * lift))
          nrm.push(c.nx, 0, side * c.nz)
        }
      const idx = []
      for (let i = 0; i < cols.length - 1; i++) {
        const a = i * 2,
          b = a + 1,
          c = a + 2,
          d = a + 3
        idx.push(...facing(pos, nrm, a, c, b), ...facing(pos, nrm, c, d, b))
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
      g.setIndex(idx)
      const tag = lamp === 'ind' ? (side > 0 ? LAMP.right : LAMP.left) : lamp
      out.push(paint(g, color ?? LENS[tag], tag))
    }
  }
}
const sideNode = (st, x) => ({ x, z: y => sideAt(st, x, y) })
// x from a to b, with every station in between
function between (st, a, b) {
  const lo = Math.min(a, b),
    hi = Math.max(a, b)
  const xs = st.map(p => p.x).filter(x => x > lo + 1e-4 && x < hi - 1e-4)
  return [a, ...(a < b ? xs : xs.reverse()), b]
}
// a triangle wound to face along the vertices' normal
function facing (pos, nrm, a, b, c) {
  const v = k => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]
  const A = v(a),
    B = v(b),
    C = v(c)
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]],
    w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
  const n = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0]
  ]
  const d = n[0] * nrm[a * 3] + n[1] * nrm[a * 3 + 1] + n[2] * nrm[a * 3 + 2]
  return d >= 0 ? [a, b, c] : [a, c, b]
}

// A flat piece lying on the body's top between xa and xb along its middle (z from -w to w): the
// high stop lamp at the top of a rear window
export function onTop (B, xa, xb, w, lift, color, lamp) {
  const ya = B.top(xa),
    yb = B.top(xb)
  const dx = xb - xa,
    dy = yb - ya,
    l = Math.hypot(dx, dy)
  // (lifted along the surface's normal, up and out)
  let nx = dy / l,
    ny = -dx / l
  if (ny < 0) {
    nx = -nx
    ny = -ny
  }
  const pos = [],
    nrm = []
  for (const [x, y] of [
    [xa, ya],
    [xb, yb]
  ])
    for (const z of [-w, w]) {
      pos.push(x + nx * lift, y + ny * lift, z)
      nrm.push(nx, ny, 0)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex([...facing(pos, nrm, 0, 1, 2), ...facing(pos, nrm, 1, 3, 2)])
  return paint(g, color, lamp)
}
