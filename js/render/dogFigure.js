// The figure every dog is drawn from (dogs.js), standing facing +x with its right side to +z, a
// medium dog half a metre high at the shoulder (each is scaled to its own size): a body lofted
// through rings from the rump to a deeper chest, a neck up to a head with a muzzle and ears, a
// tail, four legs with their paws, and its lead, a thin strip from 0 to 1 along x that the shader
// stretches from the collar to its owner's hand. Each piece is tagged with what it is (aPart),
// which decides how it moves and its colour. A few hundred triangles, all the dogs in one draw.
import * as THREE from 'three'

export const DOG = {
  BODY: 0,
  HEAD: 1,
  TAIL: 2,
  LEG_FL: 3,
  LEG_FR: 4,
  LEG_BL: 5,
  LEG_BR: 6,
  LEAD: 7,
  EAR: 8
}
// where its legs meet its body (they swing from there), and its collar (the lead's end)
export const HIPS = { front: 0.17, back: -0.24, y: 0.4, z: 0.065 }
export const COLLAR = [0.28, 0.58, 0]

// A tube along x through rings [x, y, half height, half width], n round, its ends closed
function along (list, n) {
  const pos = [],
    idx = []
  for (const [x, y, ry, rz] of list)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pos.push(x, y + ry * Math.cos(a), rz * Math.sin(a))
    }
  for (let j = 0; j < list.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i,
        b = j * n + ((i + 1) % n)
      idx.push(a, b, a + n, b, b + n, a + n)
    }
  // (each end closed by a fan to its middle)
  for (const [j, flip] of [
    [0, true],
    [list.length - 1, false]
  ]) {
    const o = pos.length / 3
    pos.push(list[j][0], list[j][1], 0)
    for (let i = 0; i < n; i++) {
      const a = j * n + i,
        b = j * n + ((i + 1) % n)
      if (flip) idx.push(b, a, o)
      else idx.push(a, b, o)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function dogFigure () {
  const parts = []
  const put = (g, part) => {
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()])
    g.deleteAttribute('uv')
    if (!g.attributes.normal) g.computeVertexNormals()
    g.setAttribute(
      'aPart',
      new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count).fill(part),
        1
      )
    )
    parts.push(g)
  }
  // the body: the rump, the waist, the chest deeper, up to the shoulders
  // prettier-ignore
  put(along([
    [-0.35, 0.43, 0.05, 0.045], [-0.31, 0.43, 0.105, 0.09], [-0.16, 0.42, 0.115, 0.095],
    [0.0, 0.42, 0.105, 0.09], [0.14, 0.43, 0.13, 0.105], [0.25, 0.45, 0.12, 0.1],
    [0.3, 0.47, 0.07, 0.065]
  ], 8), DOG.BODY)
  // the neck up to the head, the head, its muzzle and nose
  // prettier-ignore
  put(along([[0.22, 0.48, 0.078, 0.066], [0.29, 0.54, 0.074, 0.063], [0.35, 0.6, 0.066, 0.058]], 6), DOG.HEAD)
  put(
    new THREE.SphereGeometry(1, 8, 6)
      .scale(0.095, 0.088, 0.078)
      .translate(0.4, 0.64, 0),
    DOG.HEAD
  )
  // prettier-ignore
  put(along([[0.45, 0.625, 0.05, 0.048], [0.52, 0.61, 0.04, 0.038], [0.57, 0.6, 0.03, 0.028]], 6), DOG.HEAD)
  // the ears, pricked up (the shader folds a floppy-eared dog's down)
  for (const s of [-1, 1]) {
    const ear = [0.36, 0.69, 0.03, 0.41, 0.69, 0.06, 0.37, 0.77, 0.06]
    for (let i = 2; i < 9; i += 3) ear[i] *= s
    put(
      new THREE.BufferGeometry()
        .setAttribute('position', new THREE.Float32BufferAttribute(ear, 3))
        .setIndex([0, 1, 2]),
      DOG.EAR
    )
  }
  // the tail, up and back from the rump, thinning to its tip
  // prettier-ignore
  put(along([[-0.33, 0.47, 0.024, 0.024], [-0.42, 0.53, 0.018, 0.018], [-0.5, 0.6, 0.01, 0.01]], 4), DOG.TAIL)
  // the legs, each from the body down to its paw (the hind legs thicker at the top)
  const legs = [
    [HIPS.front, -HIPS.z, DOG.LEG_FL],
    [HIPS.front, HIPS.z, DOG.LEG_FR],
    [HIPS.back, -HIPS.z, DOG.LEG_BL],
    [HIPS.back, HIPS.z, DOG.LEG_BR]
  ]
  for (const [x, z, part] of legs) {
    const r = x < 0 ? 0.058 : 0.047
    put(
      new THREE.CylinderGeometry(r, 0.031, 0.42, 6, 2).translate(x, 0.23, z),
      part
    )
    put(
      new THREE.SphereGeometry(1, 5, 3)
        .scale(0.045, 0.025, 0.034)
        .translate(x + 0.02, 0.022, z),
      part
    )
  }
  // the lead: two thin strips crossed, so it shows from any side, 0 to 1 along x
  const lead = [],
    li = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    lead.push(t, 0.006, 0, t, -0.006, 0, t, 0, 0.006, t, 0, -0.006)
  }
  for (let i = 0; i < 8; i++) {
    const a = i * 4
    li.push(a, a + 4, a + 1, a + 1, a + 4, a + 5)
    li.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7)
  }
  put(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(lead, 3))
      .setIndex(li),
    DOG.LEAD
  )
  return merge(parts)
}

// merge the pieces, keeping their indices: position, normal, aPart
function merge (parts) {
  let n = 0
  for (const g of parts) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['aPart', 1]
  ]) {
    const arr = new Float32Array(n * size)
    let o = 0
    for (const g of parts) {
      arr.set(g.attributes[name].array, o)
      o += g.attributes.position.count * size
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  const idx = []
  let o = 0
  for (const g of parts) {
    for (const i of g.index.array) idx.push(i + o)
    o += g.attributes.position.count
  }
  out.setIndex(idx)
  return out
}
