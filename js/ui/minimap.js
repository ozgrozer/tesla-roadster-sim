// GTA V-style radar for the city: a rounded rectangle, the map turning under the car's arrow
// (heading-up, with the camera), zooming out with speed and with height; traffic as dots, wrecks in
// amber, the jammed street as a gold blip, the landmarks (the pier, the sign) as blips held on the
// rim while they are off the map, and the north marker on the rim. The map itself: radarMap.js.
import { JAM_AT } from '../sim/jam.js'
import { LANDMARKS } from '../sim/areas.js'
import { cityMap, drawSurroundings } from './radarMap.js'

const TAU = Math.PI * 2
const REF_H = 150 // CSS px: the radar height its marks are sized for (they scale with it)
const AHEAD = 0.66 // the arrow sits this far down: more road ahead than behind
const SPAN = 170 // m the radar's height covers at a standstill...
const SPAN_V = 250 // ...this much more at speed (from 45 m/s)...
const SPAN_UP = 320 // ...and up to this much more the higher the car flies
const RIM = 11 // px in from the edge that a blip off the map is held at
const DOTS = [
  { color: '#2f343b', r: 2, is: car => !car.loose && !!car.parked },
  { color: '#f1f3f5', r: 2.3, is: car => !car.loose && !car.parked },
  { color: '#f0a12a', r: 2.7, is: car => !!car.loose }
]
// a blip's glyph, drawn round (0, 0) at scale k
const GLYPHS = {
  // the gridlock: a jump
  jam (g, k) {
    g.moveTo(-3 * k, 1.8 * k)
    g.lineTo(0, -1.6 * k)
    g.lineTo(3 * k, 1.8 * k)
  },
  // the pier: its big wheel
  pier (g, k) {
    const r = 3.3 * k
    g.moveTo(r, 0)
    g.arc(0, 0, r, 0, TAU)
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r)
    }
  },
  // the sign on the hills: the peaks it stands on
  sign (g, k) {
    g.moveTo(-4 * k, 2.6 * k)
    g.lineTo(-1.2 * k, -2 * k)
    g.lineTo(0.6 * k, 0.6 * k)
    g.lineTo(1.9 * k, -0.9 * k)
    g.lineTo(4 * k, 2.6 * k)
  }
}
const COLOR = { jam: '#f0c24b' }

// this frame's view: the middle of the map (px, pz), the turn and zoom (c, s), the arrow's place
// (cx, cy), the radar's size (W, H) and the rim a blip is held at (m), all in device pixels
const V = { px: 0, pz: 0, c: 0, s: 0, cx: 0, cy: 0, W: 0, H: 0, m: 0 }
// where (x, z) in the world goes on the radar: where it is, or on the rim towards it while that is
// off the map (along the line from the arrow)
const _b = { x: 0, y: 0 }
function toRadar (x, z) {
  const dx = x - V.px,
    dz = z - V.pz
  const vx = dx * V.c - dz * V.s,
    vy = dx * V.s + dz * V.c
  const bx = V.cx + vx,
    by = V.cy + vy
  let t = 1
  if (bx < V.m) t = Math.min(t, (V.m - V.cx) / vx)
  if (bx > V.W - V.m) t = Math.min(t, (V.W - V.m - V.cx) / vx)
  if (by < V.m) t = Math.min(t, (V.m - V.cy) / vy)
  if (by > V.H - V.m) t = Math.min(t, (V.H - V.m - V.cy) / vy)
  _b.x = V.cx + vx * t
  _b.y = V.cy + vy * t
  return _b
}

function blip (g, x, y, k, fill, glyph) {
  g.save()
  g.translate(x, y)
  g.beginPath()
  g.arc(0, 0, 6.5 * k, 0, TAU)
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 1.5 * k
  g.strokeStyle = 'rgba(10, 12, 18, 0.9)'
  g.stroke()
  if (glyph) {
    g.beginPath()
    glyph(g, k)
    g.stroke()
  }
  g.restore()
}

export class Minimap {
  constructor (canvas) {
    this.cv = canvas
    this.g = canvas.getContext('2d')
    this.map = null
    this.clock = 0
    this.zoom = 0
  }

  // heading: the camera's yaw, so the map turns with the view
  update (dt, sim, traffic, heading) {
    this.clock += dt
    if (this.clock < 1 / 30) return
    dt = this.clock
    this.clock = 0
    const cv = this.cv,
      dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.round(cv.clientWidth * dpr),
      H = Math.round(cv.clientHeight * dpr)
    if (!W || !H) return
    if (cv.width !== W || cv.height !== H) {
      cv.width = W
      cv.height = H
    }
    if (!this.map) this.map = cityMap()
    const g = this.g,
      k = H / REF_H
    const p = sim.mode === 'ground' ? sim.pos : sim.com
    // (a block and a half at a standstill, more at speed, more again in the air)
    const up = sim.mode === 'ground' ? 0 : Math.max(0, p.y - (sim.floor || 0))
    const span =
      SPAN +
      Math.min(1, sim.groundSpeed() / 45) * SPAN_V +
      Math.min(SPAN_UP, up * 3)
    const want = H / span
    this.zoom = this.zoom
      ? this.zoom + (want - this.zoom) * Math.min(1, dt * 3)
      : want
    const z = this.zoom,
      ang = heading - Math.PI / 2
    V.px = p.x
    V.pz = p.z
    V.c = Math.cos(ang) * z
    V.s = Math.sin(ang) * z
    V.cx = W / 2
    V.cy = H * AHEAD
    V.W = W
    V.H = H
    V.m = RIM * k
    g.save()
    g.beginPath()
    g.roundRect(0, 0, W, H, 9 * dpr)
    g.clip()
    // the map, in world metres: turned so the camera's view is up
    g.translate(V.cx, V.cy)
    g.rotate(ang)
    g.scale(z, z)
    g.translate(-p.x, -p.z)
    drawSurroundings(g, p, Math.hypot(W, H) / z, 1 / z)
    g.drawImage(this.map.canvas, -this.map.ext, -this.map.ext)
    // the rest in screen pixels
    g.setTransform(1, 0, 0, 1, 0, 0)
    this.dots(g, traffic, k)
    // the landmarks and the gridlock, held on the rim while they are off the map
    for (const name in LANDMARKS) {
      const at = toRadar(LANDMARKS[name].x, LANDMARKS[name].z)
      blip(g, at.x, at.y, k, COLOR[name] || '#f2f2f2', GLYPHS[name])
    }
    const jam = toRadar(JAM_AT.x, JAM_AT.z)
    blip(g, jam.x, jam.y, k, COLOR.jam, GLYPHS.jam)
    this.arrow(g, sim, heading, k)
    this.north(g, k)
    g.restore()
  }

  // traffic: parked cars, moving ones, then wrecks on top, one colour at a time
  dots (g, traffic, k) {
    const { px, pz, c, s, cx, cy, W, H } = V
    g.lineWidth = k
    g.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    for (const kind of DOTS) {
      const r = kind.r * k
      g.fillStyle = kind.color
      g.beginPath()
      for (const car of traffic.cars) {
        if (!kind.is(car)) continue
        const dx = car.x - px,
          dz = car.z - pz
        const x = cx + dx * c - dz * s,
          y = cy + dx * s + dz * c
        if (x < -r || y < -r || x > W + r || y > H + r) continue
        g.moveTo(x + r, y)
        g.arc(x, y, r, 0, TAU)
      }
      g.fill()
      g.stroke()
    }
  }

  // the Roadster: a white arrow at the middle, turned by how far it points from the camera
  arrow (g, sim, heading, k) {
    const f = sim.fwd(),
      yaw = Math.atan2(-f.z, f.x)
    g.save()
    g.translate(V.cx, V.cy)
    g.rotate(heading - yaw)
    const a = 7.5 * k
    g.beginPath()
    g.moveTo(0, -a)
    g.lineTo(a * 0.72, a * 0.85)
    g.lineTo(0, a * 0.42)
    g.lineTo(-a * 0.72, a * 0.85)
    g.closePath()
    g.fillStyle = '#fff'
    g.fill()
    g.lineWidth = 1.6 * k
    g.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    g.stroke()
    g.restore()
  }

  // north, on the rim
  north (g, k) {
    const n = toRadar(V.px, V.pz - 1e5)
    g.beginPath()
    g.arc(n.x, n.y, 7 * k, 0, TAU)
    g.fillStyle = 'rgba(10, 12, 18, 0.88)'
    g.fill()
    g.fillStyle = '#f2f2f2'
    if (this.fontK !== k) {
      this.fontK = k
      this.font = `800 ${10 * k}px "Saira Semi Condensed", sans-serif`
    }
    g.font = this.font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('N', n.x, n.y + 0.5 * k)
  }
}
