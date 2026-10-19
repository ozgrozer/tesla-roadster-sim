// The pause menu's map, drawn (map.js says when, and from where): the whole city north up, at any
// zoom, with the radar's own drawing (radarMap.js) of the blocks and the streets, the beach and the
// sea, the pier, the hills and the freeways; the streets' names along them once it is zoomed in far
// enough for them to fit, the neighbourhoods' across them, the sea, the beach, the hills and the
// freeways named; blips for the pier, the sign, the observatory and the gridlock, labelled; the GPS
// route and the waypoint (gps.js); and the Roadster's arrow, pointing the way it faces.
import { JAM_AT } from '../sim/jam.js'
import { WALL, SHORE } from '../sim/edge.js'
import { N, HALF, EDGE, PITCH, ROADS, STOP } from '../sim/city.js'
import { drawCity, drawSurroundings } from './radarMap.js'
import { COLOR, GLYPHS, blip, arrow, routeLine } from './blips.js'
import {
  AREAS,
  areaOf,
  LANDMARKS,
  STREETS_EW,
  STREETS_NS
} from '../sim/areas.js'

const FONT = '"Saira Semi Condensed", "Arial Narrow", sans-serif'
// GTA's map spaces its capitals out (a hair space between the letters)
const spaced = text => text.split('').join('\u200a')
const STREET_K = 0.85 // px a metre from which the streets are named
const ROUTE_W = 5 // px wide, the GPS line
// the places named on the map, with their blips (and the gridlock's), each named to one side
const place = (at, name, glyph, side = 'right') => ({
  ...at,
  name,
  glyph,
  side
})
const PLACES = [
  place(LANDMARKS.pier, 'Santa Monica Pier', 'pier', 'left'),
  place(LANDMARKS.sign, 'Los Angeles Sign', 'sign'),
  place(LANDMARKS.observatory, 'Observatory', 'observatory', 'below'),
  place(JAM_AT, 'Gridlock', 'jam', 'below')
]
const SIDES = {
  left: [-12, 0, 'right'],
  right: [12, 0, 'left'],
  below: [0, 17, 'center']
}
// What lies round the city (as areas.js lays it out: the sea west, the hills north, the freeways
// east and south), named where it is: { name, x, z, up (written along z), sea (in the sea's blue),
// small }
const BEACH = -(EDGE + SHORE) / 2,
  [EAST, SOUTH] = LANDMARKS.freeways
const REGIONS = [
  { name: 'Pacific Ocean', x: -860, z: 220, sea: true },
  { name: 'Santa Monica Beach', x: BEACH, z: 230, up: true, small: true },
  { name: 'Hollywood Hills', x: -150, z: -WALL - 150 },
  { name: 'Freeway', x: EAST.x0, z: 280, up: true, small: true },
  { name: 'Freeway', x: 120, z: SOUTH.z0, small: true }
]
// each neighbourhood's middle (the mean of its blocks' middles, moved to the middle of the block
// it falls in, so its name sits on a block rather than along a street), for its name
const block = v => (Math.round((v + HALF) / PITCH - 0.5) + 0.5) * PITCH - HALF
const AREA_AT = (() => {
  const at = {}
  for (let bz = 0; bz < N; bz++)
    for (let bx = 0; bx < N; bx++) {
      const a = (at[areaOf(bx, bz)] ||= { x: 0, z: 0, n: 0 })
      a.x += (bx + 0.5) * PITCH - HALF
      a.z += (bz + 0.5) * PITCH - HALF
      a.n++
    }
  return Object.entries(at).map(([key, a]) => ({
    name: AREAS[key].name.toUpperCase(),
    x: block(a.x / a.n),
    z: block(a.z / a.n)
  }))
})()

// v: the view { x, z (the middle, m), k (CSS px a metre), W, H (CSS px), dpr }; s: what is on it
// { car: { x, z, a } or null (a: radians clockwise from north), line, goal, cursor }
export function drawMap (g, v, s) {
  const { k, W, H, dpr } = v
  const sx = x => W / 2 + (x - v.x) * k,
    sy = z => H / 2 + (z - v.z) * k
  // the map, in world metres
  g.setTransform(dpr * k, 0, 0, dpr * k, dpr * sx(0), dpr * sy(0))
  const reach = Math.hypot(W, H) / k
  drawSurroundings(g, v, reach, 1 / k)
  drawCity(g)
  routeLine(g, s.line, ROUTE_W / k)
  // the rest in CSS pixels
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  if (k >= STREET_K) streets(g, k, sx, sy, W, H)
  areas(g, k, sx, sy)
  regions(g, k, sx, sy)
  for (const p of PLACES) {
    const x = sx(p.x),
      y = sy(p.z)
    blip(g, x, y, 1.15, COLOR[p.glyph] || '#f2f2f2', GLYPHS[p.glyph])
    const [dx, dy, align] = SIDES[p.side]
    label(g, p.name, x + dx, y + dy, 12, align)
  }
  if (s.goal) {
    const x = sx(s.goal.x),
      y = sy(s.goal.z)
    blip(g, x, y, 1.35, COLOR.waypoint, GLYPHS.waypoint)
  }
  s.overlay?.(g, sx, sy, k) // (the police, the search, the missions: crimeMap.js)
  if (s.car) arrow(g, sx(s.car.x), sy(s.car.z), s.car.a, 1.35)
  if (s.cursor) crosshair(g, W / 2, H / 2)
}

// a name in white with a dark edge, readable over anything
function label (g, text, x, y, size, align = 'center', weight = 600) {
  g.font = `${weight} ${size}px ${FONT}`
  g.textAlign = align
  g.lineWidth = 3
  g.strokeStyle = 'rgba(8, 10, 14, 0.85)'
  g.strokeText(text, x, y)
  g.fillStyle = '#f4f5f6'
  g.fillText(text, x, y)
  g.textAlign = 'center'
}

// The streets' names, in the road between the junctions, a block apart or more, as far apart as
// they need to be to fit (and staggered street to street, so they don't line up in columns), and
// not where a place's blip is.
function streets (g, k, sx, sy, W, H) {
  const size = Math.min(13, 6.5 + 4.5 * k),
    room = (PITCH - 2 * STOP) * k - 8,
    step = k >= 2.2 ? 1 : k >= 1.3 ? 2 : 3
  g.font = `600 ${size}px ${FONT}`
  g.fillStyle = '#20242b'
  for (let j = 0; j <= N; j++)
    for (const along of [true, false]) {
      const name = along ? STREETS_EW[j] : STREETS_NS[j]
      if (g.measureText(name).width > room) continue
      for (let i = (j * 2) % step; i < N; i += step) {
        // (mid-block: along x for an east-west street, along z for a north-south one)
        const m = ROADS[i] + PITCH / 2
        const x = along ? sx(m) : sx(ROADS[j]),
          y = along ? sy(ROADS[j]) : sy(m)
        if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue
        const near = p => Math.hypot(sx(p.x) - x, sy(p.z) - y) < 40
        if (PLACES.some(near)) continue
        g.save()
        g.translate(x, y)
        if (!along) g.rotate(-Math.PI / 2)
        g.fillText(name, 0, 0.5)
        g.restore()
      }
    }
}

// the neighbourhoods' names, big and spaced (closer, on a small map), fading a little as the map
// zooms in on the streets
function areas (g, k, sx, sy) {
  const size = Math.max(9, Math.min(22, 26 * k))
  g.globalAlpha = k > 2 ? 0.55 : 0.9
  for (const a of AREA_AT) {
    const name = k < 0.35 ? a.name : spaced(a.name)
    label(g, name, sx(a.x), sy(a.z), size, 'center', 800)
  }
  g.globalAlpha = 1
}

// the sea, the beach, the hills and the freeways
function regions (g, k, sx, sy) {
  for (const r of REGIONS) {
    const x = sx(r.x),
      y = sy(r.z)
    g.save()
    g.translate(x, y)
    if (r.up) g.rotate(-Math.PI / 2)
    if (r.sea) {
      g.font = `italic 600 ${Math.max(13, Math.min(20, 30 * k))}px ${FONT}`
      g.fillStyle = 'rgba(205, 226, 245, 0.8)'
      g.fillText(spaced(r.name.toUpperCase()), 0, 0)
    } else label(g, r.name, 0, 0, r.small ? 11 : 14)
    g.restore()
  }
}

// where the keyboard puts a waypoint: the middle of the map
function crosshair (g, x, y) {
  g.beginPath()
  g.moveTo(x - 14, y)
  g.lineTo(x - 4, y)
  g.moveTo(x + 4, y)
  g.lineTo(x + 14, y)
  g.moveTo(x, y - 14)
  g.lineTo(x, y - 4)
  g.moveTo(x, y + 4)
  g.lineTo(x, y + 14)
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(0, 0, 0, 0.7)'
  g.lineWidth = 4
  g.stroke()
  g.strokeStyle = '#fff'
  g.lineWidth = 2
  g.stroke()
}
