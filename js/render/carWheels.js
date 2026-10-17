// The traffic's wheels: a tyre with rounded shoulders and bulging sidewalls round a rim set back
// inside it. The rim's face is drawn once per kind: a five-spoke alloy over the dark brake disc, or a
// pressed steel wheel with round vents (cabs, vans and buses). Radius 1 and width 1 along z, scaled
// per type; instanced, with each car's rims in their own finish (silver, graphite or black alloys).
import * as THREE from 'three'
import { merge } from './geo.js'

// tyre cross-section (radius, axial), revolved: bead, sidewall, shoulder, tread
// prettier-ignore
const PROFILE = [
  [0.64, -0.44], [0.78, -0.5], [0.9, -0.49], [0.97, -0.43], [1.0, -0.3],
  [1.0, 0.3], [0.97, 0.43], [0.9, 0.49], [0.78, 0.5], [0.64, 0.44]
].map(([r, z]) => new THREE.Vector2(r, z))
const FACE_R = 0.67
const FACE_Z = 0.41

export const RIM_FINISH = {
  alloy: [
    new THREE.Color(1, 1, 1),
    new THREE.Color(0.42, 0.44, 0.47),
    new THREE.Color(0.14, 0.14, 0.15),
    new THREE.Color(0.75, 0.76, 0.78)
  ],
  steel: [new THREE.Color(0.95, 0.95, 0.95), new THREE.Color(0.7, 0.71, 0.72)]
}

// the tyre, its sidewalls and the dark well inside the bead (the rim faces go over it)
export function tyreGeometry () {
  const g = new THREE.LatheGeometry(PROFILE, 16).rotateX(Math.PI / 2)
  g.computeVertexNormals()
  return g
}
// A wheel seen from far off (beyond NEAR in traffic.js): the tyre with eight sides and a plainer
// section, and both rim faces as flat grey discs, in vertex colours: about a third of the
// triangles of a near wheel with its rims, drawn in one call for all of them.
export function farWheelGeometry () {
  const tyre = new THREE.LatheGeometry(
    [
      [0.64, -0.44],
      [0.95, -0.48],
      [1.0, -0.3],
      [1.0, 0.3],
      [0.95, 0.48],
      [0.64, 0.44]
    ].map(([r, z]) => new THREE.Vector2(r, z)),
    8
  ).rotateX(Math.PI / 2)
  tyre.computeVertexNormals()
  const face = z =>
    new THREE.CircleGeometry(FACE_R, 8)
      .rotateY(z > 0 ? 0 : Math.PI)
      .translate(0, 0, z)
  const colour = (g, c) => {
    const n = (g.index ? g.index.count : g.attributes.position.count)
    const col = new THREE.Color(c),
      arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3)
    const flat = g.index ? g.toNonIndexed() : g
    flat.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return flat
  }
  return merge([
    colour(tyre, 0x17181a),
    colour(face(FACE_Z), 0x9a9da2),
    colour(face(-FACE_Z), 0x9a9da2)
  ])
}

// both faces of the rim, each looking out of its own side of the wheel
export function rimGeometry () {
  return merge([
    new THREE.CircleGeometry(FACE_R, 16).translate(0, 0, FACE_Z),
    new THREE.CircleGeometry(FACE_R, 16)
      .rotateY(Math.PI)
      .translate(0, 0, -FACE_Z)
  ])
}

// a rim's face, as a colour map (finish applied per car on top) and a roughness/metalness map
function faceMaps (kind) {
  const S = 256,
    c = S / 2
  const draw = rm => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    const g = cv.getContext('2d')
    // rm: green is roughness, blue metalness
    const col = (paint, rough, metal) =>
      rm ? `rgb(0,${(rough * 255) | 0},${(metal * 255) | 0})` : paint
    const disc = (r, fill) => {
      g.fillStyle = fill
      g.beginPath()
      g.arc(c, c, r * c, 0, Math.PI * 2)
      g.fill()
    }
    const at = (a, r) => [c + Math.cos(a) * r * c, c + Math.sin(a) * r * c]
    g.fillStyle = col('#ffffff', 0.5, 0.5)
    g.fillRect(0, 0, S, S)
    if (kind === 'alloy') {
      disc(1, col('#151619', 0.7, 0.3)) // the barrel and the dark behind the spokes
      // the brake disc and its hub, seen between the spokes
      disc(0.78, col('#5d6064', 0.45, 0.8))
      disc(0.42, col('#2a2c30', 0.6, 0.5))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        // a spoke, narrow at the hub and fanning out to the rim, with a lit edge on one side
        g.fillStyle = col('#cfd2d6', 0.32, 0.85)
        g.beginPath()
        g.moveTo(...at(a - 0.2, 0.22))
        g.lineTo(...at(a - 0.17, 0.92))
        g.lineTo(...at(a + 0.17, 0.92))
        g.lineTo(...at(a + 0.2, 0.22))
        g.closePath()
        g.fill()
        g.fillStyle = col('#eef0f2', 0.25, 0.9)
        g.beginPath()
        g.moveTo(...at(a + 0.14, 0.24))
        g.lineTo(...at(a + 0.13, 0.9))
        g.lineTo(...at(a + 0.17, 0.92))
        g.lineTo(...at(a + 0.2, 0.22))
        g.closePath()
        g.fill()
      }
      // the rim's lip, the hub and its centre cap, the wheel nuts
      g.lineWidth = 0.09 * c
      g.strokeStyle = col('#dcdfe3', 0.28, 0.9)
      g.beginPath()
      g.arc(c, c, 0.94 * c, 0, Math.PI * 2)
      g.stroke()
      disc(0.27, col('#c5c8cc', 0.32, 0.85))
      disc(0.12, col('#3a3c40', 0.4, 0.6))
      for (let i = 0; i < 5; i++) {
        const [x, y] = at((i / 5) * Math.PI * 2 + 0.63, 0.19)
        g.fillStyle = col('#7a7d82', 0.35, 0.9)
        g.beginPath()
        g.arc(x, y, 0.035 * c, 0, Math.PI * 2)
        g.fill()
      }
    } else {
      // pressed steel: a dished disc with round vents and a raised ring round the hub
      disc(1, col('#9ea2a7', 0.45, 0.7))
      g.lineWidth = 0.08 * c
      g.strokeStyle = col('#c4c7cb', 0.4, 0.75)
      g.beginPath()
      g.arc(c, c, 0.93 * c, 0, Math.PI * 2)
      g.stroke()
      for (let i = 0; i < 8; i++) {
        const [x, y] = at((i / 8) * Math.PI * 2, 0.62)
        g.fillStyle = col('#141518', 0.8, 0.2)
        g.beginPath()
        g.arc(x, y, 0.1 * c, 0, Math.PI * 2)
        g.fill()
      }
      g.lineWidth = 0.05 * c
      g.strokeStyle = col('#b7bbc0', 0.4, 0.75)
      g.beginPath()
      g.arc(c, c, 0.4 * c, 0, Math.PI * 2)
      g.stroke()
      disc(0.22, col('#6c7075', 0.4, 0.7))
      disc(0.1, col('#2c2e32', 0.5, 0.5))
    }
    const t = new THREE.CanvasTexture(cv)
    if (!rm) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  return { map: draw(false), rm: draw(true) }
}

export function rimMaterial (kind) {
  const { map, rm } = faceMaps(kind)
  return new THREE.MeshStandardMaterial({
    map,
    roughnessMap: rm,
    metalnessMap: rm,
    roughness: 1,
    metalness: 1
  })
}
