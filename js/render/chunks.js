// The city's static meshes split by district. three.js skips any mesh whose bounds lie outside a
// camera's view, and that includes the sun's shadow camera round the car, but a mesh that spans the
// whole city is never outside anything: the street lights and palms of every district were drawn
// into the car's shadow map on every frame, though it covers only sixty metres round the car. Split
// three ways across the city each way, the shadow map round the car takes in one district, or two
// or four where they meet, and the view leaves out whatever districts are behind it.
import * as THREE from 'three'
import { HALF } from '../sim/city.js'

const CUT = HALF / 3 // m from the middle to where the districts meet
const MARGIN = 12 // m added round each district's bounds (and they are fitted again as things fall)
export const DISTRICTS = 9

const fit = m => {
  m.computeBoundingSphere()
  m.boundingSphere.radius += MARGIN
}

// the district a point on the ground is in: 0 to 8
export function district (x, z) {
  const k = v => (v < -CUT ? 0 : v < CUT ? 1 : 2)
  return k(x) + 3 * k(z)
}

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
    { cast = true, receive = true, split = true } = {}
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
    for (const m of this.meshes) m.visible = v
  }
  set receiveShadow (v) {
    for (const m of this.meshes) m.receiveShadow = v
  }
  // once every instance is placed: each district's bounds, with room for things knocked over
  bounds () {
    for (const m of this.meshes) fit(m)
    return this
  }
  // the bounds of instance i's district again, after it has moved (something knocked over slides
  // and falls further than the margin)
  refit (i) {
    fit(this.byDistrict[this.which[i]])
  }
}
