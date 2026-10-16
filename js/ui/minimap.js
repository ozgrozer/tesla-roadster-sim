// GTA-style radar for the city: the street map turns under a fixed arrow, heading-up with the
// camera, zooming out with speed; traffic shows as dots, wrecks in amber, the jammed street as a
// gold blip.
import { JAM_AT } from '../sim/jam.js'
import {
  BLOCKS,
  BUILDINGS,
  HALF,
  ROAD_HW,
  BARRIER,
  CURB_R
} from '../sim/city.js'

export class Minimap {
  constructor (canvas) {
    this.cv = canvas
    this.g = canvas.getContext('2d')
    this.map = null
    this.clock = 0
    this.zoom = 1.2
  }
  // the whole city drawn once at 1 px per metre
  drawMap () {
    const ext = Math.ceil(BARRIER + 20),
      cv = document.createElement('canvas')
    cv.width = cv.height = ext * 2
    const g = cv.getContext('2d')
    g.translate(ext, ext)
    g.fillStyle = '#2c3127'
    g.fillRect(-ext, -ext, ext * 2, ext * 2)
    const r = HALF + ROAD_HW
    g.fillStyle = '#8a9099'
    g.fillRect(-r, -r, r * 2, r * 2)
    for (const b of BLOCKS) {
      g.fillStyle =
        b.kind === 'park'
          ? '#3f6440'
          : b.kind === 'parking'
          ? '#454b54'
          : '#3a4049'
      g.beginPath()
      g.roundRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0, CURB_R)
      g.fill()
    }
    g.fillStyle = '#4c535e'
    for (const b of BUILDINGS) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0)
    this.map = cv
    this.ext = ext
  }
  // heading: the camera's yaw, so the map turns with the view
  update (dt, sim, traffic, heading) {
    this.clock += dt
    if (this.clock < 1 / 30) return
    this.clock = 0
    if (!this.map) this.drawMap()
    const cv = this.cv,
      dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = Math.round(cv.clientWidth * dpr)
    if (!size) return
    if (cv.width !== size) cv.width = cv.height = size
    const g = this.g,
      c = size / 2
    const p = sim.mode === 'ground' ? sim.pos : sim.com
    const want = (size / 172) * (1.5 - Math.min(0.9, sim.groundSpeed() / 70))
    this.zoom += (want - this.zoom) * 0.15
    g.clearRect(0, 0, size, size)
    g.save()
    g.beginPath()
    g.arc(c, c, c - 1, 0, Math.PI * 2)
    g.clip()
    g.translate(c, c * 1.18) // a little more road ahead than behind
    g.rotate(heading - Math.PI / 2)
    g.scale(this.zoom, this.zoom)
    g.translate(-p.x, -p.z)
    g.drawImage(this.map, -this.ext, -this.ext)
    const reach = (c * 1.4) / this.zoom
    for (const car of traffic.cars) {
      if (Math.abs(car.x - p.x) > reach || Math.abs(car.z - p.z) > reach)
        continue
      g.fillStyle = car.loose ? '#e0a92a' : car.parked ? '#6d747e' : '#d6dbe2'
      g.fillRect(car.x - 1.8, car.z - 1.8, 3.6, 3.6)
    }
    g.restore()
    // the jammed street: a gold blip with a jump chevron, held on the rim while it is off the map
    const k = size / 172,
      ang = heading - Math.PI / 2,
      dx = JAM_AT.x - p.x,
      dz = JAM_AT.z - p.z
    let bx = (dx * Math.cos(ang) - dz * Math.sin(ang)) * this.zoom,
      by = (dx * Math.sin(ang) + dz * Math.cos(ang)) * this.zoom + c * 0.18
    const rim = c - 12 * k,
      d = Math.hypot(bx, by)
    if (d > rim) {
      bx *= rim / d
      by *= rim / d
    }
    g.save()
    g.translate(c + bx, c + by)
    g.fillStyle = '#d6a84e'
    g.strokeStyle = 'rgba(10,12,18,0.9)'
    g.lineWidth = 1.5 * k
    g.beginPath()
    g.arc(0, 0, 6.5 * k, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(-3 * k, 1.8 * k)
    g.lineTo(0, -1.6 * k)
    g.lineTo(3 * k, 1.8 * k)
    g.stroke()
    g.restore()
    // the Roadster: an arrow at the centre, turned by how far it points from the camera
    const yaw = Math.atan2(-sim.fwd().z, sim.fwd().x)
    g.save()
    g.translate(c, c * 1.18)
    g.rotate(heading - yaw)
    g.fillStyle = '#ff3b3b'
    g.strokeStyle = '#fff'
    g.lineWidth = 1.5 * (size / 172)
    const a = 8 * (size / 172)
    g.beginPath()
    g.moveTo(0, -a)
    g.lineTo(a * 0.7, a * 0.8)
    g.lineTo(0, a * 0.4)
    g.lineTo(-a * 0.7, a * 0.8)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()
    // north marker on the rim
    const n = heading - Math.PI / 2 - Math.PI / 2
    const nx = c + Math.cos(n) * (c - 11 * (size / 172)),
      ny = c + Math.sin(n) * (c - 11 * (size / 172))
    g.fillStyle = 'rgba(10,12,18,0.85)'
    g.beginPath()
    g.arc(nx, ny, 8 * (size / 172), 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#eef0f2'
    g.font = `600 ${10 * (size / 172)}px "JetBrains Mono", monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('N', nx, ny + 0.5)
  }
}
