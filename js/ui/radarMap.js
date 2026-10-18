// The radar's map (minimap.js). The city inside the ring road is drawn once, a pixel a metre: the
// streets, the blocks, parks and car parks, the buildings (lighter the taller). What lies round it is
// drawn as shapes every time, so it stays sharp at any zoom, as the edges of the map are built
// (sim/edge.js): the beach and the ocean to the west with the pier's deck and its big wheel, the
// verges out to the walls on the other three sides, the hills past the north wall, the freeways past
// the east and south walls, and more city out of reach beyond them.
import {
  N,
  HALF,
  EDGE,
  WALK,
  PITCH,
  CURB_R,
  BLOCKS,
  ROAD_HW,
  BUILDINGS
} from '../sim/city.js'
import { COAST, HILLS, LANDMARKS } from '../sim/areas.js'
import { WALL, SHORE, PIER } from '../sim/edge.js'

export const MAP = {
  road: '#9ba1a9',
  block: '#4a4f58',
  park: '#4f7048',
  lot: '#555b64',
  low: '#575d67', // buildings by height
  mid: '#626873',
  tall: '#6e7581',
  far: '#7d838b', // the city out of reach: its streets and blocks
  farBlock: '#474c54',
  hills: '#4b573f',
  contour: 'rgba(170, 192, 140, 0.3)',
  sand: '#bba97d',
  water: '#3f7197',
  deep: '#365f83',
  pier: '#8f8068',
  verge: '#56654a',
  wall: '#c9ccd1',
  freeway: '#8a9099',
  lane: 'rgba(240, 242, 245, 0.35)'
}
// a lot's ground on the map, by what it is (city.js's blocks: plots.js)
const GROUND = { grass: MAP.park, asphalt: MAP.lot, pool: MAP.water }
const FAR = 6000 // m: how far the shapes reach (well past anything the radar shows)
// the four sides, as the way out from the middle
const OUT = { east: [1, 0], south: [0, 1], west: [-1, 0], north: [0, -1] }
const angleOf = side => Math.atan2(OUT[side][1], OUT[side][0])

// the city inside the ring road's outer pavement, once: { canvas, ext } (ext: m from the middle)
export function cityMap () {
  const ext = Math.ceil(EDGE + 1),
    cv = document.createElement('canvas')
  cv.width = cv.height = ext * 2
  const g = cv.getContext('2d')
  g.translate(ext, ext)
  g.fillStyle = MAP.block // (the ring road's outer pavement)
  g.fillRect(-EDGE, -EDGE, EDGE * 2, EDGE * 2)
  const r = HALF + ROAD_HW
  g.fillStyle = MAP.road
  g.fillRect(-r, -r, r * 2, r * 2)
  for (const b of BLOCKS) {
    g.fillStyle =
      b.kind === 'park' ? MAP.park : b.kind === 'parking' ? MAP.lot : MAP.block
    g.beginPath()
    g.roundRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0, CURB_R)
    g.fill()
    // (on a lot: its lawns, car parks and pools, inside the pavement round the block)
    const lot =
      b.base === 'grass' ? MAP.park : b.base === 'asphalt' ? MAP.lot : 0
    if (lot && b.kind !== 'park') {
      g.fillStyle = lot
      g.fillRect(
        b.x0 + WALK,
        b.z0 + WALK,
        b.x1 - b.x0 - 2 * WALK,
        b.z1 - b.z0 - 2 * WALK
      )
    }
    for (const r of b.ground || []) {
      const c = GROUND[r.k]
      if (!c) continue
      g.fillStyle = c
      g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0)
    }
  }
  for (const b of BUILDINGS) {
    g.fillStyle = b.h < 15 ? MAP.low : b.h < 45 ? MAP.mid : MAP.tall
    g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0)
  }
  return { canvas: cv, ext }
}

// the shoreline and the hills' contours, made once, drawn as if the coast were west and the hills
// north (drawSurroundings turns them to where they are)
let SEA = null,
  CONTOURS = null
function shapes () {
  SEA = new Path2D()
  SEA.moveTo(-FAR, -FAR)
  for (let z = -FAR; z <= FAR; z += 25)
    SEA.lineTo(-SHORE + 2.5 * Math.sin(z / 37) + 1.5 * Math.sin(z / 11), z)
  SEA.lineTo(-FAR, FAR)
  SEA.closePath()
  CONTOURS = new Path2D()
  for (const d of [45, 100, 170, 250, 340, 450, 580, 730]) {
    for (let x = -FAR; x <= FAR; x += 30) {
      const z =
        -WALL -
        d +
        (8 + d * 0.05) * Math.sin(x / 170 + d) +
        (3 + d * 0.02) * Math.sin(x / 61 + 2 * d)
      if (x === -FAR) CONTOURS.moveTo(x, z)
      else CONTOURS.lineTo(x, z)
    }
  }
}

// what lies round the city, under the map. The canvas is in world metres (minimap.js); p: the
// middle of the view, reach: as far from it as the radar sees (m), px: metres a screen pixel
export function drawSurroundings (g, p, reach, px) {
  if (!SEA) shapes()
  // more city all round, out of reach: its streets, and its blocks near the view
  g.fillStyle = MAP.far
  g.fillRect(p.x - reach, p.z - reach, reach * 2, reach * 2)
  g.fillStyle = MAP.farBlock
  const i0 = Math.floor((p.x - reach + HALF) / PITCH),
    i1 = Math.ceil((p.x + reach + HALF) / PITCH),
    j0 = Math.floor((p.z - reach + HALF) / PITCH),
    j1 = Math.ceil((p.z + reach + HALF) / PITCH),
    w = PITCH - 2 * ROAD_HW
  g.beginPath()
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      if (i >= 0 && i < N && j >= 0 && j < N) continue // (the city's own, on the map)
      g.roundRect(
        i * PITCH - HALF + ROAD_HW,
        j * PITCH - HALF + ROAD_HW,
        w,
        w,
        CURB_R
      )
    }
  g.fill()
  // the freeways behind the sound walls, their decks with a line down each carriageway
  for (const f of LANDMARKS.freeways || []) {
    g.strokeStyle = MAP.freeway
    g.lineWidth = 28
    g.beginPath()
    g.moveTo(f.x0, f.z0)
    g.lineTo(f.x1, f.z1)
    g.stroke()
    g.strokeStyle = MAP.lane
    g.lineWidth = 1.2 * px
    g.stroke()
  }
  // the verges out to the walls, and the walls
  g.fillStyle = MAP.verge
  g.fillRect(-WALL, -WALL, WALL * 2, WALL * 2)
  g.strokeStyle = MAP.wall
  g.lineWidth = Math.max(1.5, 1.6 * px)
  g.beginPath()
  g.moveTo(-EDGE, -WALL)
  g.lineTo(WALL, -WALL)
  g.lineTo(WALL, WALL)
  g.lineTo(-EDGE, WALL)
  g.stroke()
  // the hills, with their contours
  g.save()
  g.rotate(angleOf(HILLS) - angleOf('north'))
  g.fillStyle = MAP.hills
  g.fillRect(-FAR, -FAR, FAR * 2, FAR - WALL - 1)
  g.strokeStyle = MAP.contour
  g.lineWidth = 1.3 * px
  g.stroke(CONTOURS)
  g.restore()
  // the beach and the ocean, deeper further out
  g.save()
  g.rotate(angleOf(COAST) - angleOf('west'))
  g.fillStyle = MAP.sand
  g.fillRect(-FAR, -WALL, FAR - EDGE, WALL * 2)
  g.fillStyle = MAP.water
  g.fill(SEA)
  g.fillStyle = MAP.deep
  g.fillRect(-FAR, -FAR, FAR - SHORE - 140, FAR * 2)
  g.restore()
  pier(g)
}

// the pier's deck, out from the promenade into the sea, and its big wheel
function pier (g) {
  if (!PIER?.deck) return
  g.fillStyle = MAP.pier
  for (const d of PIER.deck) g.fillRect(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0)
  if (PIER.wheel) {
    g.strokeStyle = MAP.wall
    g.lineWidth = 2.5
    g.beginPath()
    g.arc(PIER.wheel.x, PIER.wheel.z, 7, 0, Math.PI * 2)
    g.stroke()
  }
}
