// The street's details: cast-iron manhole lids out in the lanes, drain grates in the gutters by the
// corners (both laid out by the sim, street.js, which feels the lids under the wheels), and the
// arrows painted in each lane before the stop line, showing the moves the lane graph allows from it
// (straight on and left from the inner lane, straight on and right from the kerb lane, and whatever
// is left at the city's corners); and the stars set in Hollywood Boulevard's pavements. Paint, iron
// and terrazzo are flat instanced quads with alpha-cut textures.
import * as THREE from 'three'
import { marks } from './geo.js'
import { LANES, ROADS, ROAD_HW, CURB_H, BLOCKS, N, rng } from '../sim/city.js'
import { MANHOLES, DRAINS, MANHOLE_R } from '../sim/street.js'

const R = rng(808)
const tex = (w, h, draw) => {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// a lid: a cast rim round a raised grid, worn shiny where the tyres run over it
function lidTexture () {
  return tex(128, 128, (g, S) => {
    const c = S / 2
    g.fillStyle = '#4b4c4f'
    g.beginPath()
    g.arc(c, c, c - 1, 0, Math.PI * 2)
    g.fill()
    g.save()
    g.beginPath()
    g.arc(c, c, c - 12, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = '#2c2d30'
    g.fillRect(0, 0, S, S)
    g.strokeStyle = '#5c5e62'
    g.lineWidth = 3
    for (let v = 8; v < S; v += 11) {
      g.beginPath()
      g.moveTo(v, 0)
      g.lineTo(v, S)
      g.moveTo(0, v)
      g.lineTo(S, v)
      g.stroke()
    }
    const gr = g.createRadialGradient(c - 10, c + 6, 4, c, c, c)
    gr.addColorStop(0, 'rgba(150,150,150,0.25)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, S, S)
    g.restore()
    g.strokeStyle = '#1d1e20'
    g.lineWidth = 2
    g.beginPath()
    g.arc(c, c, c - 12, 0, Math.PI * 2)
    g.stroke()
  })
}
// a grate: bars across a dark slot, in an iron frame
function grateTexture () {
  return tex(128, 64, (g, W, H) => {
    g.fillStyle = '#3d3e41'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#08090a'
    for (let x = 10; x < W - 10; x += 9) g.fillRect(x, 9, 5, H - 18)
  })
}
// the arrow for a lane's moves (any of S, L, R), pointing along +u: the car's left is up the texture
function arrowTexture (moves) {
  return tex(256, 96, (g, W, H) => {
    const y = H / 2
    g.fillStyle = g.strokeStyle = '#fff'
    g.lineWidth = 10
    g.lineCap = 'butt'
    const head = (x, yy, dx, dy, w = 20) => {
      g.beginPath()
      g.moveTo(x + dx * 30, yy + dy * 30)
      g.lineTo(x - dy * w, yy + dx * w)
      g.lineTo(x + dy * w, yy - dx * w)
      g.closePath()
      g.fill()
    }
    const turn = moves.includes('S') ? 120 : 200 // where a turn leaves the shaft
    g.beginPath()
    g.moveTo(8, y)
    g.lineTo(moves.includes('S') ? 200 : turn - 50, y)
    g.stroke()
    if (moves.includes('S')) head(200, y, 1, 0)
    for (const [m, sg] of [
      ['L', -1],
      ['R', 1]
    ])
      if (moves.includes(m)) {
        g.beginPath()
        g.moveTo(turn - 52, y)
        g.quadraticCurveTo(turn, y, turn, y + sg * 16)
        g.stroke()
        head(turn, y + sg * 14, 0, sg, 17)
      }
    // worn: the paint scuffed away in flecks
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(0,0,0,${R() * 0.6})`
      g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 2)
    }
  })
}

// a star on the Walk of Fame: a coral terrazzo star edged in brass on a charcoal square, the
// emblem in its middle
function starTexture () {
  return tex(64, 64, (g, S) => {
    g.fillStyle = '#3b3436'
    g.fillRect(0, 0, S, S)
    g.strokeStyle = '#b08d4a'
    g.lineWidth = 2
    g.strokeRect(1, 1, S - 2, S - 2)
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? S * 0.2 : S * 0.44
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r)
    }
    g.closePath()
    g.fillStyle = '#d98a8a'
    g.fill()
    g.stroke()
    g.fillStyle = '#b08d4a'
    g.beginPath()
    g.arc(S / 2, S / 2 + 4, 5, 0, Math.PI * 2)
    g.fill()
  })
}
// The stars along both pavements of Hollywood Boulevard through Hollywood, down the middle of the
// pavement (inside the palms' line), every 2 m (the corners left plain)
function walkOfFame () {
  const list = []
  const c = ROADS[1] // (Hollywood Boulevard: areas.js)
  for (let j = 0; j < N; j++) {
    const blk = BLOCKS[j]
    if (blk.area !== 'boulevard') continue
    for (let x = ROADS[j] + 13; x < ROADS[j + 1] - 13; x += 2)
      for (const side of [-1, 1])
        list.push({
          x,
          z: c + side * (ROAD_HW + 2.6),
          len: 1,
          wid: 1,
          yaw: side > 0 ? 0 : Math.PI
        })
  }
  return list
}

export function buildStreet (group) {
  const iron = (map, rough) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: rough,
      metalness: 0.55,
      alphaTest: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
  const d = MANHOLE_R * 2
  group.add(
    marks(
      walkOfFame(),
      new THREE.MeshStandardMaterial({
        map: starTexture(),
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      }),
      CURB_H + 0.006
    )
  )
  group.add(
    marks(
      MANHOLES.map(m => ({ ...m, len: d, wid: d, yaw: R() * Math.PI })),
      iron(lidTexture(), 0.42),
      0.013
    ),
    marks(
      DRAINS.map(m => ({ ...m, len: 0.9, wid: 0.42 })),
      iron(grateTexture(), 0.6),
      0.013
    )
  )
  // an arrow 7 m before the end of every open lane, one batch per set of moves
  const byMoves = new Map()
  for (const e of LANES) {
    if (e.closed) continue
    const moves = ['S', 'L', 'R'].filter(m => e.next.some(c => c.move === m))
    const key = moves.join('')
    if (!byMoves.has(key)) byMoves.set(key, [])
    const s = e.len - 7
    byMoves.get(key).push({
      x: e.x0 + e.dx * s,
      z: e.z0 + e.dz * s,
      len: 5,
      wid: 1.875,
      yaw: Math.atan2(-e.dz, e.dx)
    })
  }
  for (const [moves, list] of byMoves)
    group.add(
      marks(
        list,
        new THREE.MeshStandardMaterial({
          map: arrowTexture(moves),
          color: 0xdedbd2,
          roughness: 0.7,
          alphaTest: 0.4,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        }),
        0.012
      )
    )
}
