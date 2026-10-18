// The traffic's wheels: a low-profile tyre with rounded shoulders, and a rim whose face is set in a
// shallow dish, standing just proud of the tyre's bead. All the rims are one instanced mesh: their
// faces come from one atlas of eight designs (a ten-spoke alloy, ten slim spokes with machined
// faces, an aero wheel, a five-spoke, a police car's black steel wheel with a chrome cap, a van's
// steel wheel, a bus's polished aluminium, a pickup's six-spoke), each car's chosen per instance
// (aRim) and sized to its tyre (carPaint.js RIMS), in its own finish (silver, graphite or black).
// Radius 1 and width 1 along z, scaled per type.
import * as THREE from 'three'
import { merge } from './geo.js'

// tyre cross-section (radius, axial), revolved: bead, sidewall, shoulder, tread
// prettier-ignore
const PROFILE = [
  [0.56, -0.4], [0.7, -0.45], [0.84, -0.49], [0.94, -0.47], [1.0, -0.33],
  [1.0, 0.33], [0.94, 0.47], [0.84, 0.49], [0.7, 0.45], [0.56, 0.4]
].map(([r, z]) => new THREE.Vector2(r, z))
const FACE_Z = 0.47 // the rim's face, a hair proud of the sidewall where it meets it
const DISH = 0.14 // how far in its middle is set

export const RIM_FINISH = [
  new THREE.Color(1, 1, 1),
  new THREE.Color(0.95, 0.96, 0.98),
  new THREE.Color(0.4, 0.42, 0.45),
  new THREE.Color(0.13, 0.13, 0.14)
]
// the designs that take a finish (the others keep their own colours)
export const ALLOY = new Set([0, 1, 2, 3, 7])

// the tyre, its sidewalls and the dark well inside the bead (the rim faces go over it)
export function tyreGeometry () {
  const g = new THREE.LatheGeometry(PROFILE, 18).rotateX(Math.PI / 2)
  g.computeVertexNormals()
  return g
}
// A wheel seen from far off (beyond NEAR in traffic.js): the tyre with eight sides and a plainer
// section, and both rim faces as flat grey discs, in vertex colours: about a third of the
// triangles of a near wheel with its rims, drawn in one call for all of them.
export function farWheelGeometry () {
  const tyre = new THREE.LatheGeometry(
    [
      [0.56, -0.4],
      [0.92, -0.48],
      [1.0, -0.3],
      [1.0, 0.3],
      [0.92, 0.48],
      [0.56, 0.4]
    ].map(([r, z]) => new THREE.Vector2(r, z)),
    8
  ).rotateX(Math.PI / 2)
  tyre.computeVertexNormals()
  const face = z =>
    new THREE.CircleGeometry(0.7, 8)
      .rotateY(z > 0 ? 0 : Math.PI)
      .translate(0, 0, z)
  const colour = (g, c) => {
    const n = g.index ? g.index.count : g.attributes.position.count
    const col = new THREE.Color(c),
      arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3)
    const flat = g.index ? g.toNonIndexed() : g
    flat.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return flat
  }
  return merge([
    colour(tyre, 0x17181a),
    colour(face(FACE_Z), 0x8f9297),
    colour(face(-FACE_Z), 0x8f9297)
  ])
}

// both faces of the rim (radius 1), each looking out of its own side of the wheel, dished
export function rimGeometry () {
  const face = () => {
    const g = new THREE.CircleGeometry(1, 20)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i))
      p.setZ(i, -DISH * Math.max(0, 1 - r * 1.15))
    }
    g.computeVertexNormals()
    return g
  }
  return merge([
    face().translate(0, 0, FACE_Z),
    face()
      .rotateY(Math.PI)
      .translate(0, 0, -FACE_Z)
  ])
}

// The rims' faces: eight designs in a 4 x 2 atlas, as a colour map (a finish multiplies it) and a
// roughness (green) and metalness (blue) map
const CELL = 256
function atlas (rm) {
  const cv = document.createElement('canvas')
  cv.width = CELL * 4
  cv.height = CELL * 2
  const g = cv.getContext('2d')
  g.fillStyle = rm ? 'rgb(0,128,128)' : '#202124'
  g.fillRect(0, 0, cv.width, cv.height)
  for (let k = 0; k < 8; k++) {
    g.save()
    // (a texture's rows run bottom up: design k's row from the bottom)
    g.translate(
      (k % 4) * CELL + CELL / 2,
      (1 - Math.floor(k / 4)) * CELL + CELL / 2
    )
    design(g, k, rm, CELL * 0.47)
    g.restore()
  }
  const t = new THREE.CanvasTexture(cv)
  if (!rm) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
// design k, centred, radius R
function design (g, k, rm, R) {
  const col = (paint, rough, metal) =>
    rm ? `rgb(0,${(rough * 255) | 0},${(metal * 255) | 0})` : paint
  const disc = (r, fill) => {
    g.fillStyle = fill
    g.beginPath()
    g.arc(0, 0, r * R, 0, Math.PI * 2)
    g.fill()
  }
  const ring = (r, w, stroke) => {
    g.lineWidth = w * R
    g.strokeStyle = stroke
    g.beginPath()
    g.arc(0, 0, r * R, 0, Math.PI * 2)
    g.stroke()
  }
  const at = (a, r) => [Math.cos(a) * r * R, Math.sin(a) * r * R]
  const poly = (pts, fill) => {
    g.fillStyle = fill
    g.beginPath()
    g.moveTo(...pts[0])
    for (const p of pts.slice(1)) g.lineTo(...p)
    g.closePath()
    g.fill()
  }
  // spokes: n of them, each from the hub (r0, half angle w0) out to the rim (r1, w1)
  const spokes = (n, r0, w0, r1, w1, fill, lit, a0 = 0) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2
      poly(
        [at(a - w0, r0), at(a - w1, r1), at(a + w1, r1), at(a + w0, r0)],
        fill
      )
      if (lit)
        poly(
          [
            at(a + w0 * 0.3, r0),
            at(a + w1 * 0.4, r1),
            at(a + w1, r1),
            at(a + w0, r0)
          ],
          lit
        )
    }
  }
  const nuts = (n, r, size, fill) => {
    for (let i = 0; i < n; i++) {
      const [x, y] = at((i / n) * Math.PI * 2 + 0.3, r)
      g.fillStyle = fill
      g.beginPath()
      g.arc(x, y, size * R, 0, Math.PI * 2)
      g.fill()
    }
  }
  const SILVER = col('#cdd0d4', 0.3, 0.85),
    LIT = col('#eef0f2', 0.22, 0.9),
    DARK = col('#141518', 0.7, 0.3),
    BRAKE = col('#5a5d61', 0.45, 0.8)
  if (k <= 3 || k === 7) {
    // alloys: the dark barrel, the brake disc and its caliper between the spokes
    disc(1, DARK)
    disc(0.8, BRAKE)
    disc(0.45, col('#2a2c30', 0.6, 0.5))
    poly(
      [at(-0.5, 0.82), at(-0.15, 0.82), at(-0.15, 0.55), at(-0.5, 0.55)],
      col('#33363b', 0.5, 0.4)
    )
  }
  if (k === 0) spokes(10, 0.24, 0.07, 0.93, 0.06, SILVER, LIT)
  else if (k === 1) {
    // ten slim spokes, painted dark grey with bright machined faces
    spokes(10, 0.24, 0.09, 0.93, 0.07, col('#45484d', 0.4, 0.6))
    spokes(10, 0.26, 0.045, 0.9, 0.035, col('#e4e6e8', 0.18, 0.95))
  } else if (k === 2) {
    // an aero wheel: a closed face with five curved slots
    disc(0.95, col('#b9bcc0', 0.35, 0.75))
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      poly(
        [
          at(a, 0.42),
          at(a + 0.28, 0.62),
          at(a + 0.42, 0.86),
          at(a + 0.3, 0.88),
          at(a + 0.12, 0.64),
          at(a - 0.08, 0.44)
        ],
        DARK
      )
    }
    ring(0.86, 0.04, col('#d8dadd', 0.25, 0.85))
  } else if (k === 3) spokes(5, 0.22, 0.2, 0.93, 0.17, SILVER, LIT)
  else if (k === 7)
    spokes(6, 0.24, 0.17, 0.93, 0.15, col('#b4b8bd', 0.3, 0.85), LIT)
  else if (k === 4) {
    // black steel, round holes, a small chrome cap
    disc(1, col('#101113', 0.55, 0.4))
    ring(0.9, 0.08, col('#1c1d20', 0.5, 0.4))
    nuts(8, 0.66, 0.08, col('#050506', 0.8, 0.1))
    disc(0.3, col('#1a1b1e', 0.5, 0.4))
    disc(0.2, col('#d6d9dc', 0.15, 1))
  } else if (k === 5) {
    // a van's steel wheel: slots, a raised ring round the hub, the nuts
    disc(1, col('#8e9297', 0.45, 0.7))
    ring(0.92, 0.08, col('#b4b8bd', 0.4, 0.75))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      poly(
        [
          at(a - 0.12, 0.55),
          at(a - 0.1, 0.78),
          at(a + 0.1, 0.78),
          at(a + 0.12, 0.55)
        ],
        col('#121315', 0.8, 0.2)
      )
    }
    ring(0.42, 0.05, col('#a7abb0', 0.4, 0.75))
    disc(0.3, col('#6a6e73', 0.4, 0.7))
    nuts(6, 0.2, 0.035, col('#3a3c40', 0.4, 0.8))
  } else if (k === 6) {
    // a bus's polished aluminium: hand holes, a big hub, ten nuts
    disc(1, col('#dfe2e5', 0.12, 1))
    ring(0.93, 0.06, col('#f2f3f4', 0.08, 1))
    for (let i = 0; i < 8; i++) {
      const [x, y] = at((i / 8) * Math.PI * 2, 0.7)
      g.fillStyle = col('#0e0f11', 0.8, 0.2)
      g.beginPath()
      g.ellipse(x, y, 0.1 * R, 0.16 * R, (i / 8) * Math.PI * 2, 0, Math.PI * 2)
      g.fill()
    }
    disc(0.42, col('#9aa0a6', 0.3, 0.9))
    nuts(10, 0.33, 0.04, col('#c9ccd0', 0.2, 1))
    disc(0.2, col('#4a4d52', 0.4, 0.7))
  }
  if (k <= 3 || k === 7) {
    // the rim's lip and the centre cap
    ring(0.95, 0.07, col('#dcdfe2', 0.25, 0.9))
    disc(0.24, k === 1 ? col('#3c3f44', 0.4, 0.6) : SILVER)
    disc(0.12, col('#2a2c30', 0.35, 0.6))
  }
}

// The rims' material: the atlas, each instance's design (aRim) picking its cell
export function rimMaterial () {
  const map = atlas(false),
    rm = atlas(true)
  const m = new THREE.MeshStandardMaterial({
    map,
    roughnessMap: rm,
    metalnessMap: rm,
    roughness: 1,
    metalness: 1
  })
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRim;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec2 ruv = (vec2(mod(aRim, 4.0), floor(aRim / 4.0)) + 0.03 + uv * 0.94) / vec2(4.0, 2.0);
          vMapUv = ruv;
          vRoughnessMapUv = ruv;
          vMetalnessMapUv = ruv;
        }`
      )
  }
  m.customProgramCacheKey = () => 'traffic rims'
  return m
}
