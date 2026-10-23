// The city's static meshes split by district. three.js skips any mesh whose bounds lie outside a
// camera's view, and that includes the sun's shadow camera round the car, but a mesh that spans the
// whole city is never outside anything: the street lights and palms of every district were drawn
// into the car's shadow map on every frame, though it covers only sixty metres round the car. Split
// three ways across the city each way, the shadow map round the car takes in one district, or two
// or four where they meet, and the view leaves out whatever districts are behind it.
// On the grown map (eighteen blocks a side) the districts are a six by six grid, each three blocks
// across; and they are streamed (stream): small things (signs, bins, bushes, lamps) are left out
// past their own distance, and everything past where the fog has swallowed it.
import * as THREE from 'three'
import { HALF } from '../sim/city.js'

const GRID = 6 // districts a side
const SIZE = (2 * HALF) / GRID // m across a district
const MARGIN = 12 // m added round each district's bounds (and they are fitted again as things fall)
export const DISTRICTS = GRID * GRID
const FOGGED = 2.2 // fog density times distance where the fog has all but swallowed it (e^-4.8)

const fit = m => {
  m.computeBoundingSphere()
  m.boundingSphere.radius += MARGIN
}

// the district a point on the ground is in: 0 to DISTRICTS - 1 (past the edges, the edge's)
export function district (x, z) {
  const k = v => Math.max(0, Math.min(GRID - 1, Math.floor((v + HALF) / SIZE) || 0))
  return k(x) + GRID * k(z)
}

// The streamed meshes: { m, far } each, shown only within far m of the camera (and the fog's reach)
const STREAM = []
// Details left out past their own distance, by the name their meshes go by (m from the camera to
// a district's bounds, which reach 240 m or so out from its middle). In clear weather the fog only
// swallows the city some 2 km off, past the whole of it, so without these every district's
// ledges and trees ahead were drawn however far: at the spawn some 30 calls for each of them and a
// few hundred thousand triangles, for ledges under a pixel high and trees a few pixels across.
// (Roofs, facades and the ground are never left out: from the hills or the air they are the city.)
export const DETAIL_FAR = {
  cornices: 520, // ledges 0.3 to 0.6 m: under a pixel at 1080p past 600 m
  trees: 900,
  'date palms': 900,
  'fan palms': 1150 // (the skyline's palms: their crowns still read at a kilometre)
}
// and every other instanced detail by its own size (after mrdoob/slop-newyork js/scene-culling.js,
// MIT, (c) 2026 Mr.doob): left out once a typical instance of it (the 90th percentile of their
// middle and largest sides, s m) would be under a few pixels, past s * PER_M m; never nearer than
// MIN_FAR, and kept however far once that is past MAX_FAR. Lit-up things (unlit materials: lamp
// heads, lenses) are seen three times as far.
const PER_M = 1100,
  MIN_FAR = 300,
  MAX_FAR = 2000
const _c = new THREE.Vector3()
const _s = new THREE.Vector3()
export function sizeFar (m) {
  if (!m.isInstancedMesh || !m.count) return Infinity
  const g = m.geometry
  if (!g.boundingBox) g.computeBoundingBox()
  g.boundingBox.getSize(_s)
  const e = m.instanceMatrix.array,
    step = Math.max(1, Math.floor(m.count / 256)),
    sizes = []
  for (let i = 0; i < m.count; i += step) {
    const o = i * 16,
      d = [
        Math.hypot(e[o], e[o + 1], e[o + 2]) * _s.x,
        Math.hypot(e[o + 4], e[o + 5], e[o + 6]) * _s.y,
        Math.hypot(e[o + 8], e[o + 9], e[o + 10]) * _s.z
      ].sort((p, q) => p - q)
    sizes.push(Math.sqrt(d[1] * d[2]))
  }
  sizes.sort((p, q) => p - q)
  const glow = m.material?.isMeshBasicMaterial ? 3 : 1,
    far = Math.max(MIN_FAR, (sizes[Math.floor(sizes.length * 0.9)] || 0) * PER_M * glow)
  return far > MAX_FAR ? Infinity : far
}
// stream mesh m: left out past far m (Infinity: only once the fog has it); bounds fitted if not yet
export function streamed (m, far = Infinity) {
  if (m.userData.streamed) return
  m.userData.streamed = true
  m.userData.on ??= m.visible
  STREAM.push({ m, far })
}
// Before a frame: each streamed mesh shown or not, by how far its bounds are from the camera
// against its own distance and the fog's (density: scene.fog's, 0 for none). Returns how many shown.
export function stream (camera, density = 0) {
  const fog = density > 0 ? FOGGED / density : Infinity
  let n = 0
  for (const e of STREAM) {
    // (each detail's own distance taken the first time: names are given after the mesh is made)
    if (!e.named) {
      e.named = true
      e.far = Math.min(e.far, DETAIL_FAR[e.m.name] ?? sizeFar(e.m))
    }
    const { m, far } = e
    const b = m.isInstancedMesh ? m.boundingSphere : m.geometry.boundingSphere
    if (!b) {
      m.visible = m.userData.on
      continue
    }
    _c.copy(b.center).applyMatrix4(m.matrixWorld)
    const d = camera.position.distanceTo(_c) - b.radius
    m.visible = m.userData.on && d < Math.min(far, fog)
    if (m.visible) n++
  }
  return n
}
// every streamed mesh shown as it would be but for the distance (for a pass that sees it all: the
// city's shadow map)
export function streamAll () {
  for (const e of STREAM) {
    e.was = e.m.visible
    e.m.visible = e.m.userData.on
  }
}
// and back as the last stream() left them, once that pass is drawn (else the frame's own view draws
// the whole city too: some 110 calls more on every frame the shadow map is drawn again)
export function streamBack () {
  for (const e of STREAM) if (e.was !== undefined) e.m.visible = e.was
}
// how many meshes are streamed (for the perf report)
export const streamCount = () => STREAM.length

// One instanced mesh per district for a set of instances, addressed as one: at(i) is where instance
// i stands ({ x, z }), and the instances keep their numbers whichever district's mesh they are in.
// split: false keeps them all in one mesh (for small things that cast no shadow, where a draw a
// district would cost more than leaving out the districts out of view saves).
export class Instances {
  constructor (
    geo,
    mat,
    n,
    at,
    { cast = true, receive = true, split = true, far = Infinity } = {}
  ) {
    this.which = new Uint8Array(n)
    this.local = new Uint32Array(n)
    const counts = new Array(DISTRICTS).fill(0)
    for (let i = 0; i < n; i++) {
      const p = at(i),
        d = split ? district(p.x, p.z) : 0
      this.which[i] = d
      this.local[i] = counts[d]++
    }
    this.byDistrict = counts.map(c => {
      if (!c) return null
      const m = new THREE.InstancedMesh(geo, mat, c)
      m.castShadow = cast
      m.receiveShadow = receive
      return m
    })
    this.far = split ? far : Infinity
    this.meshes = this.byDistrict.filter(Boolean)
  }
  setMatrixAt (i, m) {
    const mesh = this.byDistrict[this.which[i]]
    mesh.setMatrixAt(this.local[i], m)
    mesh.instanceMatrix.needsUpdate = true
  }
  getMatrixAt (i, m) {
    this.byDistrict[this.which[i]].getMatrixAt(this.local[i], m)
  }
  setColorAt (i, c) {
    const mesh = this.byDistrict[this.which[i]]
    mesh.setColorAt(this.local[i], c)
    mesh.instanceColor.needsUpdate = true
  }
  set visible (v) {
    for (const m of this.meshes) m.visible = m.userData.on = v
  }
  set receiveShadow (v) {
    for (const m of this.meshes) m.receiveShadow = v
  }
  // once every instance is placed: each district's bounds, with room for things knocked over
  bounds () {
    for (const m of this.meshes) {
      fit(m)
      if (this.far < Infinity) streamed(m, this.far)
    }
    return this
  }
  // the bounds of instance i's district again, after it has moved (something knocked over slides
  // and falls further than the margin)
  refit (i) {
    fit(this.byDistrict[this.which[i]])
  }
}
