// One kind of palm or tree in its two shapes (palmShapes.js, treeShapes.js): far off, the cheap
// shape, all of them in one instanced mesh a district (chunks.js); near the camera, the full shape,
// in one instanced mesh holding only those within reach, filled again as the camera moves. The
// shader (treeWind.js) leaves out of each mesh the ones the other draws, and between the two
// distances each draws its share of the pixels, so one shape gives way to the other unseen. Each
// one's few numbers of its own (treeWind.js) ride in its instance colour. A Grove stands in for a
// set of Instances where Fallers knocks one over (setMatrixAt, getMatrixAt, refit, bounds).
import * as THREE from 'three'
import { Instances } from './chunks.js'
import { LOD } from './treeWind.js'

const REACH = LOD.far + 4 // m: the near mesh holds every one within this of where it was filled
const MOVE = 2 // m the camera may move before the near mesh is filled again

export class Grove {
  // list: where each stands ({ x, z }); place(item, i): its matrix; look(item, i, c): its numbers
  // into the colour c. far: { geo, mat, depth } and near: { geo, mat } (its materials,
  // treeWind.js); cap: how many the near mesh holds at most.
  constructor (list, place, look, { far, near, cap, name }) {
    const n = (this.n = list.length)
    this.mats = new Float32Array(n * 16) // every one's matrix, where it stands (or lies)
    this.looks = new Float32Array(n * 3)
    this.far = new Instances(far.geo, far.mat, n, i => list[i])
    const c = new THREE.Color()
    list.forEach((it, i) => {
      this.setMatrixAt(i, place(it, i))
      look(it, i, c)
      this.far.setColorAt(i, c)
      c.toArray(this.looks, i * 3)
    })
    this.far.bounds()
    for (const m of this.far.meshes) {
      m.name = name
      m.customDepthMaterial = far.depth
    }
    const m = (this.near = new THREE.InstancedMesh(near.geo, near.mat, cap))
    const looks = new Float32Array(cap * 3)
    m.instanceColor = new THREE.InstancedBufferAttribute(looks, 3)
    m.instanceColor.setUsage(THREE.DynamicDrawUsage)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.count = 0
    // (the shadows are all the far meshes': treeWind.js)
    m.castShadow = false
    m.receiveShadow = true
    m.frustumCulled = false // (it is always round the camera)
    m.name = name + ' near'
    this.cap = cap
    this.meshes = [...this.far.meshes, m]
    this.from = new THREE.Vector3(Infinity, 0, 0) // where it was last filled from
    this.dirty = true
  }
  setMatrixAt (i, m) {
    m.toArray(this.mats, i * 16)
    this.far.setMatrixAt(i, m)
    this.dirty = true
  }
  getMatrixAt (i, m) {
    m.fromArray(this.mats, i * 16)
  }
  refit (i) {
    this.far.refit(i)
  }
  bounds () {
    this.far.bounds()
    this.dirty = true
    return this
  }
  // the near mesh: every one within reach of the camera at eye (when it has moved far enough, or
  // one has moved)
  update (eye) {
    if (!this.dirty && this.from.distanceToSquared(eye) < MOVE * MOVE) return
    this.dirty = false
    this.from.copy(eye)
    const { mats, looks, near, cap } = this,
      to = near.instanceMatrix.array,
      tc = near.instanceColor.array
    let k = 0
    for (let i = 0; i < this.n && k < cap; i++) {
      const o = i * 16,
        dx = mats[o + 12] - eye.x,
        dy = mats[o + 13] - eye.y,
        dz = mats[o + 14] - eye.z
      if (dx * dx + dy * dy + dz * dz > REACH * REACH) continue
      for (let j = 0; j < 16; j++) to[k * 16 + j] = mats[o + j]
      for (let j = 0; j < 3; j++) tc[k * 3 + j] = looks[i * 3 + j]
      k++
    }
    near.count = k
    near.visible = k > 0
    upload(near.instanceMatrix, k)
    upload(near.instanceColor, k)
  }
}
// (only the part of a buffer in use goes up to the GPU)
function upload (a, k) {
  a.clearUpdateRanges()
  a.addUpdateRange(0, Math.max(1, k) * a.itemSize)
  a.needsUpdate = true
}
