// The sign on the hills above Hollywood: LOS ANGELES in white sheet-metal letters twelve metres tall,
// standing in a line across the face of the slope at the head of La Brea (LANDMARKS.sign), each a
// little out of true with its neighbours, held up from behind by a steel frame dug into the hill; lit
// by floodlights at night. The letters are drawn here (no fonts): a tall, plain sans.
import * as THREE from 'three'
import { merge, box, tint } from './geo.js'
import { glowMaterial, glowPoints } from './cityGlow.js'
import { LANDMARKS } from '../sim/areas.js'
import { hillHeight } from '../sim/edge.js'
import { rng } from '../sim/city.js'

const H = 12 // the letters' height, m
const T = 0.2 // their strokes' width (of the height)
const DEPTH = 0.35 // the sheet metal and its framing, front to back
const GAP = 0.18 // between letters (of the height)
const R = rng(1923)

// a stroke along a smooth line through pts (in letter units), w wide: an outline to fill
function stroke (pts, w = T) {
  const curve = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(...p)))
  const line = curve.getPoints(48),
    left = [],
    right = []
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)],
      b = line[Math.min(line.length - 1, i + 1)]
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy)
    left.push(
      new THREE.Vector2(p.x - (dy / l) * (w / 2), p.y + (dx / l) * (w / 2))
    )
    right.push(
      new THREE.Vector2(p.x + (dy / l) * (w / 2), p.y - (dx / l) * (w / 2))
    )
  })
  return new THREE.Shape([...left, ...right.reverse()])
}
const poly = pts => new THREE.Shape(pts.map(p => new THREE.Vector2(...p)))
// an elliptical ring, centre (cx, cy), radii outside (rx, ry), the stroke w
function ring (cx, cy, rx, ry, w = T) {
  const s = new THREE.Shape()
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absellipse(cx, cy, rx - w, ry - w * 0.8, 0, Math.PI * 2, true)
  s.holes.push(hole)
  return s
}
// each letter: its shapes and its width (the height is 1)
const GLYPHS = {
  L: {
    w: 0.56,
    shapes: () => [
      poly([
        [0, 0],
        [0.56, 0],
        [0.56, T],
        [T, T],
        [T, 1],
        [0, 1]
      ])
    ]
  },
  O: { w: 0.66, shapes: () => [ring(0.33, 0.5, 0.33, 0.5)] },
  S: {
    w: 0.62,
    shapes: () => [
      stroke([
        [0.56, 0.84],
        [0.36, 0.91],
        [0.14, 0.86],
        [0.1, 0.68],
        [0.3, 0.53],
        [0.5, 0.42],
        [0.53, 0.2],
        [0.33, 0.09],
        [0.07, 0.15]
      ])
    ]
  },
  A: {
    w: 0.74,
    shapes: () => {
      const a = poly([
        [0, 0],
        [0.21, 0],
        [0.28, 0.26],
        [0.46, 0.26],
        [0.53, 0],
        [0.74, 0],
        [0.47, 1],
        [0.27, 1]
      ])
      const hole = new THREE.Path(
        [
          [0.32, 0.42],
          [0.42, 0.42],
          [0.37, 0.64]
        ].map(p => new THREE.Vector2(...p))
      )
      a.holes.push(hole)
      return [a]
    }
  },
  N: {
    w: 0.64,
    shapes: () => [
      poly([
        [0, 0],
        [0.19, 0],
        [0.19, 0.6],
        [0.45, 0],
        [0.64, 0],
        [0.64, 1],
        [0.45, 1],
        [0.45, 0.4],
        [0.19, 1],
        [0, 1]
      ])
    ]
  },
  G: {
    w: 0.66,
    shapes: () => {
      const arc = []
      for (let i = 0; i <= 12; i++) {
        const a = 0.75 + (i / 12) * (Math.PI * 2 - 1.4)
        arc.push([0.34 + Math.cos(a) * 0.24, 0.5 + Math.sin(a) * 0.4])
      }
      return [
        stroke(arc),
        poly([
          [0.36, 0.34],
          [0.66, 0.34],
          [0.66, 0.5],
          [0.36, 0.5]
        ]),
        poly([
          [0.5, 0.14],
          [0.66, 0.14],
          [0.66, 0.42],
          [0.5, 0.42]
        ])
      ]
    }
  },
  E: {
    w: 0.56,
    shapes: () => [
      poly([
        [0, 0],
        [0.56, 0],
        [0.56, T],
        [T, T],
        [T, 0.41],
        [0.48, 0.41],
        [0.48, 0.59],
        [T, 0.59],
        [T, 0.8],
        [0.56, 0.8],
        [0.56, 1],
        [0, 1]
      ])
    ]
  }
}

export function buildSign (group) {
  const text = 'LOS ANGELES'
  let width = -GAP
  for (const ch of text) width += (ch === ' ' ? 0.42 : GLYPHS[ch].w) + GAP
  const letters = [],
    frame = [],
    lamps = []
  let cursor = LANDMARKS.sign.x - (width * H) / 2
  const z0 = LANDMARKS.sign.z
  for (const ch of text) {
    if (ch === ' ') {
      cursor += (0.42 + GAP) * H
      continue
    }
    const gl = GLYPHS[ch],
      w = gl.w * H
    // stood on the slope: its foot a little over the ground under its front, a little out of line
    const x = cursor,
      z = z0 + (R() - 0.5) * 1.6
    const y =
      Math.max(hillHeight(x + w * 0.2, z), hillHeight(x + w * 0.8, z)) +
      0.6 +
      R() * 0.8
    const g = new THREE.ExtrudeGeometry(gl.shapes(), {
      depth: DEPTH,
      bevelEnabled: false,
      curveSegments: 10
    })
    g.scale(H, H, 1)
      .rotateZ((R() - 0.5) * 0.03)
      .rotateY((R() - 0.5) * 0.06)
      .translate(x, y, z - DEPTH)
    letters.push(tint(g, 0xf4f3ef))
    // the frame behind: posts down into the hill, struts back up the slope
    for (const f of [0.15, 0.5, 0.85]) {
      const px = x + w * f,
        pz = z - DEPTH - 0.4,
        top = y + H * 0.92
      const foot = hillHeight(px, pz) - 0.5
      frame.push(
        tint(
          box(px - 0.12, foot, pz - 0.12, px + 0.12, top, pz + 0.12),
          0x5d5a55
        )
      )
      const back = pz - 5,
        bf = hillHeight(px, back) - 0.4
      const len = Math.hypot(top - 1 - bf, pz - back)
      const strut = box(-0.09, 0, -0.09, 0.09, len, 0.09)
        .rotateX(Math.atan2(pz - back, top - 1 - bf))
        .translate(px, bf, back)
      frame.push(tint(strut, 0x5d5a55))
    }
    for (const f of [0.25, 0.75]) {
      const lx = x + w * f
      lamps.push({
        x: lx,
        y: hillHeight(lx, z + 2.5) + 0.5,
        z: z + 2.5,
        color: 0xfff3dc,
        size: 2.6,
        k: 1.3
      })
    }
    cursor += w + GAP * H
  }
  const white = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55
  })
  const sign = new THREE.Mesh(merge(letters), white)
  const steel = new THREE.Mesh(
    merge(frame),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.3
    })
  )
  group.add(sign, steel)
  const glow = glowMaterial({ haze: 0.35 })
  const pts = glowPoints(lamps, glow)
  pts.visible = false
  group.add(pts)
  return {
    night (k) {
      white.emissive.setRGB(0.62, 0.6, 0.55).multiplyScalar(k)
      glow.uniforms.uOn.value = k
      pts.visible = k > 0.01
    }
  }
}
