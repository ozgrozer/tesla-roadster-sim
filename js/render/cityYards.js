// What the houses' yards are closed off with (the sim lays them out, solid: SOLIDS): clipped hedges
// along Beverly Hills' pavements, some as tall as the garage, in a leafy texture, each a shade of
// its own; low stucco garden walls; white picket fences round Venice's bungalows (cut out of a
// texture, so a fence is two quads). The hedges are one mesh a district (chunks.js).
import * as THREE from 'three'
import { SOLIDS } from '../sim/city.js'
import { canvasTex } from './scene.js'
import { Builder } from './builder.js'
import { district, DISTRICTS } from './chunks.js'

// leaves, 2 m a tile: a dark green, clumps lit on top and shaded under
function leafTex () {
  const t = canvasTex(256, (g, S) => {
    g.fillStyle = '#2e4a24'
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S,
        y = Math.random() * S,
        r = 2 + Math.random() * 5
      const v = Math.random()
      g.fillStyle = `rgba(${(40 + v * 70) | 0},${(70 + v * 80) | 0},${(28 +
        v * 40) |
        0},0.8)`
      g.beginPath()
      g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2)
      g.fill()
    }
  })
  t.repeat.set(0.5, 0.5)
  return t
}
// white pickets with gaps between, a rail across them (the gaps cut away)
function picketTex () {
  return canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S)
    g.fillStyle = '#f4f2ec'
    for (let x = 0; x < S; x += S / 8) {
      g.fillRect(x + 2, S * 0.1, S / 8 - 6, S * 0.9)
      g.beginPath()
      g.moveTo(x + 2, S * 0.1)
      g.lineTo(x + S / 16 - 1, 0)
      g.lineTo(x + S / 8 - 4, S * 0.1)
      g.fill()
    }
    g.fillRect(0, S * 0.3, S, S * 0.07)
    g.fillRect(0, S * 0.72, S, S * 0.07)
  })
}

export function buildYards (group) {
  const hedges = Array.from({ length: DISTRICTS }, () => new Builder())
  const walls = new Builder(),
    fences = new Builder()
  const c = new THREE.Color()
  const uvs = (w, h) => [0, 0, w, h]
  for (const s of SOLIDS) {
    if (s.look === 'hedge') {
      const b = hedges[district((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)]
      c.setHSL(0.27 + s.tint * 0.06, 0.35, 0.42 + s.tint * 0.12)
      // (walls and top in metres, so the leaves keep their size; rounded a touch at the top)
      b.walls(s.x0, s.x1, s.z0, s.z1, s.y0, s.y1, c, w => uvs(w, s.y1 - s.y0))
      b.top(s.x0 + 0.05, s.x1 - 0.05, s.z0 + 0.05, s.z1 - 0.05, s.y1 + 0.06, c)
    } else if (s.look === 'wall') {
      c.setHex(0xefe6d6)
      walls.cuboid(s.x0, s.x1, s.z0, s.z1, s.y0, s.y1, c)
      c.setHex(0xb5543a) // a tiled coping
      walls.cuboid(
        s.x0 - 0.06,
        s.x1 + 0.06,
        s.z0 - 0.06,
        s.z1 + 0.06,
        s.y1,
        s.y1 + 0.08,
        c
      )
    } else if (s.look === 'fence') {
      // one plane down the middle, seen from both sides
      const along = s.x1 - s.x0 > s.z1 - s.z0,
        m = along ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2
      c.setRGB(1, 1, 1)
      const len = along ? s.x1 - s.x0 : s.z1 - s.z0
      if (along)
        fences.quad(
          [s.x0, 0, m],
          [s.x1, 0, m],
          [s.x1, s.y1, m],
          [s.x0, s.y1, m],
          [0, 0, 1],
          [0, 0, len, 1],
          c
        )
      else
        fences.quad(
          [m, 0, s.z1],
          [m, 0, s.z0],
          [m, s.y1, s.z0],
          [m, s.y1, s.z1],
          [1, 0, 0],
          [0, 0, len, 1],
          c
        )
    }
  }
  const leaves = new THREE.MeshStandardMaterial({
    map: leafTex(),
    vertexColors: true,
    roughness: 0.95
  })
  for (const b of hedges) add(group, b, leaves, true, 'hedges')
  add(
    group,
    walls,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    true,
    'garden walls'
  )
  const pt = picketTex()
  pt.repeat.set(1, 1)
  add(
    group,
    fences,
    new THREE.MeshStandardMaterial({
      map: pt,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8
    }),
    false,
    'fences'
  )
}
function add (group, b, mat, cast, name) {
  if (b.empty) return
  const m = new THREE.Mesh(b.geometry(), mat)
  m.castShadow = cast
  m.receiveShadow = true
  m.name = name
  group.add(m)
}
