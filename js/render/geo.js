// Geometry helpers for the city: merging thousands of small pieces into a handful of buffers (so a
// whole district draws in a few calls), vertex tints, and instanced flat marks for road paint.
import * as THREE from 'three'

// The order the city's solid surfaces are drawn in (each mesh's renderOrder). The graphics card
// skips shading a pixel that something already drawn in front of it covers, so the city draws from
// what hides the most to what hides the least: the Roadster, the buildings, the street furniture and
// the traffic first (0), then the pavements and lots, the asphalt and the paint on it, the beach
// under it all, the sea, the hills, and last the sky, only where nothing else has been drawn.
export const LAYER = { ground: 1, road: 2, beach: 3, sea: 4, hills: 5, sky: 6 }

const ATTRS = [
  ['position', 3],
  ['normal', 3],
  ['uv', 2],
  ['color', 3]
]
// Concatenate geometries (indexed ones are expanded). Pieces without colours come out white.
export function merge (geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g))
  let n = 0
  for (const g of parts) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const [name, size] of ATTRS) {
    if (!parts.some(g => g.attributes[name])) continue
    const arr = new Float32Array(n * size)
    let o = 0
    for (const g of parts) {
      const a = g.attributes[name],
        c = g.attributes.position.count * size
      if (a) arr.set(a.array.subarray(0, c), o)
      else if (name === 'color') arr.fill(1, o, o + c)
      o += c
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  out.computeBoundingSphere()
  return out
}

// Give every vertex of g one colour.
export function tint (g, color) {
  const c = new THREE.Color(color)
  const n = g.attributes.position.count,
    arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

// A box from (x0, y0, z0) to (x1, y1, z1) as a fresh geometry.
export function box (x0, y0, z0, x1, y1, z1) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2
  )
}

// Flat marks on the ground (lane paint, crosswalk stripes, parking lines): one instance per
// { x, z, len, wid, yaw }, `len` along the yaw direction.
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _y = new THREE.Vector3(0, 1, 0)
export function marks (list, mat, y) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const m = new THREE.InstancedMesh(geo, mat, list.length)
  list.forEach((k, i) => {
    _q.setFromAxisAngle(_y, k.yaw || 0)
    m.setMatrixAt(
      i,
      _m.compose(_p.set(k.x, y, k.z), _q, _s.set(k.len, 1, k.wid))
    )
  })
  m.receiveShadow = true
  m.renderOrder = LAYER.road
  return m
}
