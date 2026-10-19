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
const _c = new THREE.Vector3()
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
  for (const { m, far } of STREAM) {
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
  for (const { m } of STREAM) m.visible = m.userData.on
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
