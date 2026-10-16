// Lofted bodies: a half section swept through stations along x and mirrored to both sides, with
// normals smoothed across gentle bends and kept sharp at creases, so a body reads as smooth panels
// with crisp character lines. Used for the Roadster and the traffic cars.
import * as THREE from 'three'

// Sweep a half section (z >= 0, from the bottom centre line round to the top one) through stations
// ({ x, p: [[z, y], ...] }, all with the same number of points) along x, mirrored to both sides.
// keyFor(j, xA, xB, side) picks a bucket (usually a material) for segment j between two stations on
// one side (1 or -1), or null to leave it out. Without capKey the ends stay open. Returns
// Map(key -> BufferGeometry), normals creased at `crease` degrees.
export function loftGeos (stations, keyFor, capKey, crease = 32) {
  const buckets = new Map()
  const push = (key, ...v) => {
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(...v)
  }
  for (let k = 0; k < stations.length - 1; k++) {
    const A = stations[k],
      B = stations[k + 1]
    for (let j = 0; j < A.p.length - 1; j++)
      for (const sg of [1, -1]) {
        const key = keyFor(j, A.x, B.x, sg)
        if (key === null) continue
        const a = [A.x, A.p[j][1], sg * A.p[j][0]],
          b = [A.x, A.p[j + 1][1], sg * A.p[j + 1][0]]
        const c = [B.x, B.p[j][1], sg * B.p[j][0]],
          d = [B.x, B.p[j + 1][1], sg * B.p[j + 1][0]]
        if (sg > 0) push(key, ...a, ...c, ...b, ...c, ...d, ...b)
        else push(key, ...a, ...b, ...c, ...c, ...b, ...d)
      }
  }
  const cap = (S, front) => {
    const ringPts = [
      ...S.p.map(([z, y]) => [z, y]),
      ...S.p
        .slice(1, -1)
        .reverse()
        .map(([z, y]) => [-z, y])
    ]
    const cy = S.p.reduce((s, p) => s + p[1], 0) / S.p.length
    for (let i = 0; i < ringPts.length; i++) {
      const p = ringPts[i],
        q = ringPts[(i + 1) % ringPts.length]
      const O = [S.x, cy, 0],
        P1 = [S.x, p[1], p[0]],
        P2 = [S.x, q[1], q[0]]
      if (front) push(capKey, ...O, ...P2, ...P1)
      else push(capKey, ...O, ...P1, ...P2)
    }
  }
  if (capKey !== undefined) {
    cap(stations[0], false)
    cap(stations[stations.length - 1], true)
  }
  const out = new Map()
  for (const [key, arr] of buckets) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    creaseNormals(g, crease)
    out.set(key, g)
  }
  return out
}

// The same, as a group of meshes: keyFor returns the material for each segment.
export function loft (stations, matFor, capMat, crease) {
  const group = new THREE.Group()
  for (const [mat, g] of loftGeos(stations, matFor, capMat, crease)) {
    const m = new THREE.Mesh(g, mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  return group
}

// Vertex normals for a non-indexed geometry: each corner averages the faces that meet it whose
// normals lie within `angle` degrees of its own face's, so bends smooth over and creases stay sharp.
export function creaseNormals (geo, angle = 32) {
  const pos = geo.attributes.position.array,
    nTri = pos.length / 9
  const fn = new Float32Array(nTri * 3)
  for (let t = 0; t < nTri; t++) {
    const o = t * 9
    const ux = pos[o + 3] - pos[o],
      uy = pos[o + 4] - pos[o + 1],
      uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o],
      vy = pos[o + 7] - pos[o + 1],
      vz = pos[o + 8] - pos[o + 2]
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    fn[t * 3] = nx / l
    fn[t * 3 + 1] = ny / l
    fn[t * 3 + 2] = nz / l
  }
  const at = new Map()
  for (let v = 0; v < nTri * 3; v++) {
    const k = `${Math.round(pos[v * 3] * 1e4)},${Math.round(
      pos[v * 3 + 1] * 1e4
    )},${Math.round(pos[v * 3 + 2] * 1e4)}`
    const list = at.get(k)
    if (list) list.push(v)
    else at.set(k, [v])
  }
  const cos = Math.cos((angle * Math.PI) / 180),
    nrm = new Float32Array(pos.length)
  for (const list of at.values())
    for (const v of list) {
      const t = (v / 3) | 0
      let sx = 0,
        sy = 0,
        sz = 0
      for (const w of list) {
        const u = (w / 3) | 0
        const d =
          fn[t * 3] * fn[u * 3] +
          fn[t * 3 + 1] * fn[u * 3 + 1] +
          fn[t * 3 + 2] * fn[u * 3 + 2]
        if (d < cos) continue
        sx += fn[u * 3]
        sy += fn[u * 3 + 1]
        sz += fn[u * 3 + 2]
      }
      const l = Math.hypot(sx, sy, sz) || 1
      nrm[v * 3] = sx / l
      nrm[v * 3 + 1] = sy / l
      nrm[v * 3 + 2] = sz / l
    }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  return geo
}

// The same stations with more inserted at xs (each a straight blend of its neighbours, so the shape
// is unchanged), for panel cuts that fall between stations.
export function withStations (stations, xs) {
  const out = stations.slice()
  for (const x of xs) {
    const p = stations[0].p.map((_, k) => at(stations, x, k))
    out.push({ x, p })
  }
  return out.sort((a, b) => a.x - b.x)
}

// [z, y] of profile point k at x, linear between the stations either side
export function at (stations, x, k) {
  let i = 0
  while (i < stations.length - 2 && stations[i + 1].x < x) i++
  const A = stations[i],
    B = stations[i + 1]
  const t = (x - A.x) / (B.x - A.x)
  return [0, 1].map(n => A.p[k][n] + (B.p[k][n] - A.p[k][n]) * t)
}

// A thin dark line across the surface at x, along section points k0..k1 on both sides, standing just
// proud of the panels so it never z-fights them.
export function seam (stations, x, k0, k1, mat, w = 0.008, lift = 0.0025) {
  const pos = []
  for (let k = k0; k < k1; k++) {
    const P = at(stations, x, k),
      Q = at(stations, x, k + 1)
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1
    const nz = ((Q[1] - P[1]) / len) * lift,
      ny = (-(Q[0] - P[0]) / len) * lift
    for (const sg of [1, -1]) {
      const v = (x2, [z, y]) => [x2, y + ny, sg * (z + nz)]
      const a = v(x - w / 2, P),
        b = v(x + w / 2, P),
        c = v(x - w / 2, Q),
        d = v(x + w / 2, Q)
      pos.push(...a, ...b, ...c, ...c, ...b, ...d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return new THREE.Mesh(g, mat)
}
