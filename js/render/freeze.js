// Fewer draw calls for a model built from many small pieces: every mesh that never moves on its own
// is baked into one buffer per material (and per shadow setting), in the root's frame, so the
// Roadster, about 230 meshes as built, is drawn (and drawn again into the shadow map) in a few dozen
// calls. Whatever moves (doors, wing, fans, the driver, the yoke) or is changed on its own (the
// panels that dent) is left as it is, and so are the groups the pieces hung off, so anything that
// reads their positions (the thruster nozzles) still finds them.
import * as THREE from 'three'
import { merge } from './geo.js'

const _m = new THREE.Matrix4()
const ATTRS = ['position', 'normal', 'uv', 'color']

// root: the group to bake into; keep: objects whose whole subtree moves and must stay as it is.
// Returns how many meshes went into how many.
export function freeze (root, keep) {
  const skip = new Set(keep)
  root.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map()
  const walk = o => {
    if (skip.has(o)) return
    for (const c of o.children) walk(c)
    if (!o.isMesh || o === root) return
    const g = o.geometry,
      mat = o.material
    if (
      o.isInstancedMesh ||
      o.isSkinnedMesh ||
      Array.isArray(mat) ||
      o.userData.dent ||
      !o.visible ||
      o.renderOrder !== 0 ||
      o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
      Object.keys(g.morphAttributes).length > 0 ||
      !g.attributes.normal
    )
      return
    // (only what is seen the same from every parent up to the root: a hidden group's pieces stay)
    for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return
    const sig = [
      mat.uuid,
      o.castShadow,
      o.receiveShadow,
      !!g.attributes.uv,
      !!g.attributes.color
    ].join()
    if (!buckets.has(sig)) buckets.set(sig, { mat, o, parts: [] })
    buckets.get(sig).parts.push(o)
  }
  walk(root)
  let from = 0,
    to = 0
  for (const b of buckets.values()) {
    // (a material used by one piece only gains nothing)
    if (b.parts.length < 2) continue
    const geos = b.parts.map(o => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      for (const name of Object.keys(g.attributes))
        if (!ATTRS.includes(name)) g.deleteAttribute(name)
      _m.multiplyMatrices(inv, o.matrixWorld)
      g = g.applyMatrix4(_m)
      // (a mirrored piece's triangles turn inside out once baked: wind them back)
      if (_m.determinant() < 0) flip(g)
      return g
    })
    const mesh = new THREE.Mesh(merge(geos), b.mat)
    mesh.castShadow = b.o.castShadow
    mesh.receiveShadow = b.o.receiveShadow
    root.add(mesh)
    for (const o of b.parts) o.parent.remove(o)
    from += b.parts.length
    to++
  }
  return { from, to }
}

// reverse each triangle's winding (swap its second and third corners)
function flip (g) {
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize,
      arr = a.array
    for (let i = 0; i < a.count; i += 3)
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k]
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k]
        arr[(i + 2) * n + k] = t
      }
  }
}
