// Merged geometry for the city's buildings: quads pushed into flat arrays (position, normal, uv,
// colour) and made into one buffer per material, so hundreds of buildings draw in a few calls.
// Boxes, bands standing out round them (cornices, parapets, canopies), prisms on any convex plan
// (round towers, three-sided ones), their flat tops and their cornices, hip roofs over their
// eaves, and any three.js geometry put in place and tinted.
import * as THREE from 'three'

const _v = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _m3 = new THREE.Matrix3()

export class Builder {
  constructor () {
    this.p = []
    this.n = []
    this.uv = []
    this.c = []
  }
  // quad a-b-c-d counter-clockwise seen from outside; uv = [u0, v0, u1, v1] across a-b and up b-c
  quad (a, b, c, d, nrm, uv, col) {
    const [u0, v0, u1, v1] = uv
    // (two triangles, a-b-c and a-c-d)
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d)
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
    for (let i = 0; i < 6; i++) {
      this.n.push(nrm[0], nrm[1], nrm[2])
      this.c.push(col.r, col.g, col.b)
    }
  }
  // a triangle a-b-c counter-clockwise from outside, its own uv at each corner
  tri (a, b, c, nrm, uvs, col) {
    this.p.push(...a, ...b, ...c)
    this.uv.push(...uvs)
    for (let i = 0; i < 3; i++) {
      this.n.push(nrm[0], nrm[1], nrm[2])
      this.c.push(col.r, col.g, col.b)
    }
  }
  // the four walls of a box from y0 to y1; uvFn(width, side) gives each wall's uv
  walls (x0, x1, z0, z1, y0, y1, col, uvFn) {
    const P = (x, y, z) => [x, y, z]
    this.quad(
      P(x0, y0, z1),
      P(x1, y0, z1),
      P(x1, y1, z1),
      P(x0, y1, z1),
      [0, 0, 1],
      uvFn(x1 - x0, 0),
      col
    )
    this.quad(
      P(x1, y0, z0),
      P(x0, y0, z0),
      P(x0, y1, z0),
      P(x1, y1, z0),
      [0, 0, -1],
      uvFn(x1 - x0, 1),
      col
    )
    this.quad(
      P(x1, y0, z1),
      P(x1, y0, z0),
      P(x1, y1, z0),
      P(x1, y1, z1),
      [1, 0, 0],
      uvFn(z1 - z0, 2),
      col
    )
    this.quad(
      P(x0, y0, z0),
      P(x0, y0, z1),
      P(x0, y1, z1),
      P(x0, y1, z0),
      [-1, 0, 0],
      uvFn(z1 - z0, 3),
      col
    )
  }
  bottom (x0, x1, z0, z1, y, col) {
    this.quad(
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
      [0, -1, 0],
      [0, 0, 0, 0],
      col
    )
  }
  // a band standing out o m round the walls of [x0, x1] x [z0, z1], from y0 to y1, with its
  // underside: a cornice, a parapet or a shop canopy
  band (x0, x1, z0, z1, o, y0, y1, col) {
    for (const [a, b, c, d] of [
      [x0 - o, x1 + o, z0 - o, z0],
      [x0 - o, x1 + o, z1, z1 + o],
      [x0 - o, x0, z0, z1],
      [x1, x1 + o, z0, z1]
    ]) {
      this.cuboid(a, b, c, d, y0, y1, col)
      this.bottom(a, b, c, d, y0, col)
    }
  }
  top (x0, x1, z0, z1, y, col) {
    this.quad(
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
      [0, 1, 0],
      [x0 / 4, z1 / 4, x1 / 4, z0 / 4],
      col
    )
  }
  cuboid (x0, x1, z0, z1, y0, y1, col) {
    this.walls(x0, x1, z0, z1, y0, y1, col, w => [0, y0 / 4, w / 4, y1 / 4])
    this.top(x0, x1, z0, z1, y1, col)
  }

  // ---------- prisms on a plan ----------
  // The walls round a convex plan (pts: [x, z] anticlockwise seen from above) from y0 to y1; top:
  // optionally the height of the top at each point (a sloping top). smooth: shaded round, the
  // normals at each corner the mean of its walls'. uvFn(k, len, from) gives wall k's uv: len its
  // length, from how far round the plan it starts.
  prism (pts, y0, y1, col, uvFn, smooth = false, top = null) {
    const n = pts.length
    const out = (i, j) => {
      const dx = pts[j][0] - pts[i][0],
        dz = pts[j][1] - pts[i][1],
        l = Math.hypot(dx, dz) || 1
      return [-dz / l, 0, dx / l]
    }
    const norms = pts.map((_, i) => out(i, (i + 1) % n))
    let from = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        [ax, az] = pts[i],
        [bx, bz] = pts[j]
      const len = Math.hypot(bx - ax, bz - az)
      const ya = top ? top[i] : y1,
        yb = top ? top[j] : y1
      const [u0, v0, u1, v1] = uvFn(i, len, from)
      from += len
      const vb = v0 + ((v1 - v0) * (yb - y0)) / (y1 - y0),
        va = v0 + ((v1 - v0) * (ya - y0)) / (y1 - y0)
      const P = [
        [ax, y0, az],
        [bx, y0, bz],
        [bx, yb, bz],
        [ax, ya, az]
      ]
      const UV = [u0, v0, u1, v0, u1, vb, u0, va]
      let na = norms[i],
        nb = norms[i]
      if (smooth) {
        const p = norms[(i + n - 1) % n],
          q = norms[j]
        na = avg(p, norms[i])
        nb = avg(norms[i], q)
      }
      const N = [na, nb, nb, na]
      for (const k of [0, 1, 2, 0, 2, 3]) {
        this.p.push(...P[k])
        this.uv.push(UV[2 * k], UV[2 * k + 1])
        this.n.push(...N[k])
        this.c.push(col.r, col.g, col.b)
      }
    }
  }
  // the flat top of a convex plan at y (or sloping: tops, its height at each point), in a fan from
  // its middle; uv in metres over 4, as top()
  cap (pts, y, col, tops = null) {
    const n = pts.length
    let cx = 0,
      cz = 0,
      cy = 0
    pts.forEach((p, i) => {
      cx += p[0] / n
      cz += p[1] / n
      cy += (tops ? tops[i] : y) / n
    })
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a = [cx, cy, cz],
        b = [pts[i][0], tops ? tops[i] : y, pts[i][1]],
        c = [pts[j][0], tops ? tops[j] : y, pts[j][1]]
      const nrm = tops ? normalOf(a, b, c) : [0, 1, 0]
      this.tri(
        a,
        b,
        c,
        nrm,
        [a[0] / 4, a[2] / 4, b[0] / 4, b[2] / 4, c[0] / 4, c[2] / 4],
        col
      )
    }
  }
  // a band standing out o round a plan, from y0 to y1, its top and underside: a cornice
  ring (pts, o, y0, y1, col) {
    const big = grow(pts, o)
    this.prism(big, y0, y1, col, () => [0, 0, 0, 0])
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a = pts[i],
        b = pts[j],
        A = big[i],
        B = big[j]
      // top: inner edge to outer edge; underside the other way round
      this.quad(
        [b[0], y1, b[1]],
        [a[0], y1, a[1]],
        [A[0], y1, A[1]],
        [B[0], y1, B[1]],
        [0, 1, 0],
        [0, 0, 0, 0],
        col
      )
      this.quad(
        [a[0], y0, a[1]],
        [b[0], y0, b[1]],
        [B[0], y0, B[1]],
        [A[0], y0, A[1]],
        [0, -1, 0],
        [0, 0, 0, 0],
        col
      )
    }
  }

  // ---------- roofs ----------
  // A hip roof over [x0, x1] x [z0, z1] (the walls' top at y), its eaves out e past the walls, its
  // ridge rise above them along the longer side; the eaves' soffit underneath. uv in metres (u along
  // each eave, v up the slope), for tiles.
  hip (x0, x1, z0, z1, y, rise, e, col) {
    x0 -= e
    x1 += e
    z0 -= e
    z1 += e
    const alongX = x1 - x0 >= z1 - z0
    const half = (alongX ? z1 - z0 : x1 - x0) / 2,
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2
    const rl = (alongX ? x1 - x0 : z1 - z0) / 2 - half // half the ridge's length
    // (the eaves rise with the overhang: the slope runs from the walls' top)
    const slope = rise / Math.max(0.1, half - e),
      ye = y - e * slope
    const top = y + rise
    const R0 = alongX ? [cx - rl, top, cz] : [cx, top, cz - rl],
      R1 = alongX ? [cx + rl, top, cz] : [cx, top, cz + rl]
    const c00 = [x0, ye, z0],
      c10 = [x1, ye, z0],
      c11 = [x1, ye, z1],
      c01 = [x0, ye, z1]
    const run = Math.hypot(half, rise + e * slope) // m up each slope
    // the four faces, each from its eave up to the ridge: [eave from, eave to, ridge from, ridge to]
    const faces = alongX
      ? [
          [c01, c11, R1, R0],
          [c10, c00, R0, R1],
          [c11, c10, R1, R1],
          [c00, c01, R0, R0]
        ]
      : [
          [c11, c10, R0, R1],
          [c00, c01, R1, R0],
          [c01, c11, R1, R1],
          [c10, c00, R0, R0]
        ]
    for (const [a, b, r1, r0] of faces) {
      const nrm = normalOf(a, b, r1)
      const L = Math.hypot(b[0] - a[0], b[2] - a[2])
      // (u along the eave, from a; the ridge's ends where they stand over it)
      const ua = 0,
        ub = L
      const uOf = r => {
        const dx = b[0] - a[0],
          dz = b[2] - a[2]
        return ((r[0] - a[0]) * dx + (r[2] - a[2]) * dz) / (L || 1)
      }
      if (r0 === r1) this.tri(a, b, r0, nrm, [ua, 0, ub, 0, uOf(r0), run], col)
      else {
        this.tri(a, b, r1, nrm, [ua, 0, ub, 0, uOf(r1), run], col)
        this.tri(a, r1, r0, nrm, [ua, 0, uOf(r1), run, uOf(r0), run], col)
      }
    }
    this.bottom(x0, x1, z0, z1, ye, col)
  }

  // any three.js geometry, moved by matrix m and tinted col
  add (geo, m, col) {
    const g = geo.index ? geo.toNonIndexed() : geo
    const P = g.attributes.position,
      N = g.attributes.normal,
      U = g.attributes.uv
    _m3.getNormalMatrix(m)
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m)
      this.p.push(_v.x, _v.y, _v.z)
      _n.fromBufferAttribute(N, i)
        .applyMatrix3(_m3)
        .normalize()
      this.n.push(_n.x, _n.y, _n.z)
      this.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0)
      this.c.push(col.r, col.g, col.b)
    }
  }
  get empty () {
    return this.p.length === 0
  }
  geometry () {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.computeBoundingSphere()
    return g
  }
}

function avg (a, b) {
  const x = a[0] + b[0],
    z = a[2] + b[2],
    l = Math.hypot(x, z) || 1
  return [x / l, 0, z / l]
}
// the unit normal of triangle a-b-c (counter-clockwise from its front)
function normalOf (a, b, c) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2]
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2]
  const x = uy * vz - uz * vy,
    y = uz * vx - ux * vz,
    z = ux * vy - uy * vx
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}
// a convex plan grown outwards by o (each corner moved out along its walls' normals)
export function grow (pts, o) {
  const n = pts.length
  const nrm = (i, j) => {
    const dx = pts[j][0] - pts[i][0],
      dz = pts[j][1] - pts[i][1],
      l = Math.hypot(dx, dz) || 1
    return [-dz / l, dx / l]
  }
  return pts.map((p, i) => {
    const a = nrm((i + n - 1) % n, i),
      b = nrm(i, (i + 1) % n)
    const mx = a[0] + b[0],
      mz = a[1] + b[1]
    const k = o / Math.max(0.2, mx * b[0] + mz * b[1] || 1)
    return [p[0] + mx * k, p[1] + mz * k]
  })
}
