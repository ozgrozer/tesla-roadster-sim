// The pause menu's MAP tab: the whole city (mapDraw.js draws it), dragged to pan, zoomed with the
// wheel, a pinch or the buttons, and a click or a tap on a street sets the waypoint there (gps.js:
// snapped to the nearest lane), or clears it if it was the waypoint that was clicked. From the
// keyboard: the arrows pan, + and - zoom, Enter sets (or clears) the waypoint under the crosshair in
// the middle, Delete clears it and C finds the car again. A box over the map says where the
// waypoint is and how far, and the street under the pointer; a legend explains the marks. It is
// drawn only while the menu shows it, and only when something on it has changed.
import { gps } from './gps.js'
import { drawMap } from './mapDraw.js'
import { whereIs, LANDMARKS } from '../sim/areas.js'
import { WALL, SHORE, onDeck } from '../sim/edge.js'
import { onQuay } from '../sim/quay.js'
import { onHillRoad, inTunnel } from '../sim/hillroad.js'

// what fits in the window to begin with: the city from the beach to the walls, and the hill road
const FIT = { x0: -SHORE - 40, x1: WALL + 40, z0: -WALL - 160, z1: WALL + 40 }
const K_MAX = 8 // px a metre, zoomed right in
const PICK = 16 // px from the waypoint that a click counts as on it
const DRAG = 6 // px a press has to move to be a drag rather than a click
const NONE = [] // (no route: at the test site, the car isn't in the city)

// what lies round the city under the pointer (null: in the city, where whereIs names the street)
function around (x, z) {
  if (onDeck(x, z)) return 'Santa Monica Pier'
  if (onQuay(x, z)) return 'Port of Los Angeles'
  if (onHillRoad(x, z)) return inTunnel(x, z) ? 'Santa Fe Canyon Tunnel' : 'Santa Fe Canyon Rd'
  if (x < -SHORE) return 'Pacific Ocean'
  if (z < -WALL) return 'Hollywood Hills'
  if (x <= WALL && z <= WALL) return null
  // (out past the sound walls: the freeways, and more city out of reach)
  const on = f => (f.x0 === f.x1 ? Math.abs(x - f.x0) : Math.abs(z - f.z0)) < 30
  return LANDMARKS.freeways.some(on) ? 'Freeway' : ''
}

// a distance in the speedometer's units: metres or kilometres, feet or miles
function distance (m, mph) {
  if (mph)
    return m < 400
      ? `${Math.round(m * 0.328084) * 10} ft`
      : `${(m / 1609.34).toFixed(1)} mi`
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(1)} km`
}

export class MapView {
  // panel: the tab's element (its canvas and boxes: menu.js); app: the game's state; mph(): whether
  // distances are in miles
  constructor (panel, app, mph) {
    this.app = app
    this.mph = mph
    const $ = sel => panel.querySelector(sel)
    this.cv = $('canvas')
    this.g = this.cv.getContext('2d')
    this.el = {
      info: $('.mp-info'),
      where: $('.mp-where'),
      clear: $('.mp-clear'),
      find: $('.mp-find'),
      hover: $('.mp-hover')
    }
    this.v = { x: 0, z: 0, k: 0, W: 0, H: 0, dpr: 1 }
    this.shown = false
    this.cursor = false // the keyboard's crosshair, in the middle
    this.raf = 0
    this.downs = new Map() // pointers down: id -> { x, y }
    this.press = null // the press that may yet be a click
    const touch = window.matchMedia?.('(pointer: coarse)')?.matches
    this.verb = touch ? 'Tap' : 'Click'
    this.listen()
    for (const b of panel.querySelectorAll('[data-zoom]'))
      b.addEventListener('click', () => this.zoomBy(Number(b.dataset.zoom)))
    this.el.find.addEventListener('click', () => this.findCar())
    this.el.clear.addEventListener('click', () => {
      gps.clear()
      this.queue()
    })
    window.addEventListener('resize', () => this.queue())
  }

  // the menu has opened on this tab (or switched to it), or closed it
  show (on) {
    this.shown = on
    if (!on) return
    if (!this.v.k) this.fit()
    this.queue()
  }
  // the whole city in view
  fit () {
    const r = this.cv.getBoundingClientRect()
    const k = Math.min(
      r.width / (FIT.x1 - FIT.x0),
      r.height / (FIT.z1 - FIT.z0)
    )
    this.kMin = k * 0.6
    this.v.k = k
    this.v.x = (FIT.x0 + FIT.x1) / 2
    this.v.z = (FIT.z0 + FIT.z1) / 2
  }
  // draw on the next animation frame (once, however many changes come before it)
  queue () {
    if (this.raf || !this.shown) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.draw()
    })
  }
  draw () {
    const cv = this.cv,
      v = this.v
    const r = cv.getBoundingClientRect()
    if (!r.width || !r.height) return
    if (!v.k) this.fit()
    v.dpr = Math.min(2, window.devicePixelRatio || 1)
    v.W = r.width
    v.H = r.height
    const w = Math.round(r.width * v.dpr),
      h = Math.round(r.height * v.dpr)
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const app = this.app
    // (the car is on the map in the city; at the test site it isn't)
    let car = null
    if (app.world === 'city') {
      const s = app.sim,
        p = s.mode === 'ground' ? s.pos : s.com,
        f = s.fwd()
      car = { x: p.x, z: p.z, a: Math.atan2(f.x, -f.z) }
      gps.update(s, false)
    }
    drawMap(this.g, v, {
      car,
      line: car ? gps.line : NONE,
      goal: gps.goal,
      cursor: this.cursor,
      overlay: app.world === 'city' ? app.mapOverlay : null
    })
    this.info()
  }

  // the box over the map: where the waypoint is and how far by the route, or how to set one
  info () {
    const g = gps.goal,
      el = this.el
    el.info.classList.toggle('set', !!g)
    if (!g) {
      el.where.textContent = `${this.verb} a street to set a waypoint`
      return
    }
    const far =
      this.app.world === 'city' && gps.left
        ? ` · ${distance(gps.left, this.mph())}`
        : ''
    el.where.textContent = `${g.street} · ${g.area}${far}`
  }

  // screen (CSS px, on the canvas) to the world, and back
  toWorld (px, py) {
    const v = this.v
    return { x: v.x + (px - v.W / 2) / v.k, z: v.z + (py - v.H / 2) / v.k }
  }
  toScreen (x, z) {
    const v = this.v
    return { x: v.W / 2 + (x - v.x) * v.k, y: v.H / 2 + (z - v.z) * v.k }
  }

  // zoom by f about the point (px, py) on the canvas (the middle if not given)
  zoomBy (f, px = this.v.W / 2, py = this.v.H / 2) {
    const v = this.v,
      at = this.toWorld(px, py)
    v.k = Math.min(K_MAX, Math.max(this.kMin || 0.2, v.k * f))
    // (the point under the pointer stays under it)
    v.x = at.x - (px - v.W / 2) / v.k
    v.z = at.z - (py - v.H / 2) / v.k
    this.clamp()
    this.queue()
  }
  pan (dx, dy) {
    this.v.x -= dx / this.v.k
    this.v.z -= dy / this.v.k
    this.clamp()
    this.queue()
  }
  // (the middle of the map kept over the city and round it)
  clamp () {
    const v = this.v,
      m = WALL + 300
    v.x = Math.min(m, Math.max(-m - 300, v.x))
    v.z = Math.min(m, Math.max(-m - 200, v.z))
  }
  findCar () {
    const s = this.app.sim
    if (this.app.world !== 'city') return
    const p = s.mode === 'ground' ? s.pos : s.com
    this.v.x = p.x
    this.v.z = p.z
    if (this.v.k < 1.2) this.v.k = 1.2
    this.clamp()
    this.queue()
  }

  // a click or a tap at (px, py): the waypoint there, or none if it was the waypoint
  pick (px, py) {
    const g = gps.goal
    if (g) {
      const at = this.toScreen(g.x, g.z)
      if (Math.hypot(at.x - px, at.y - py) < PICK) {
        gps.clear()
        this.queue()
        return
      }
    }
    const w = this.toWorld(px, py)
    gps.set(w.x, w.z)
    this.queue()
  }

  listen () {
    const cv = this.cv
    const local = e => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return // (the left button only)
      cv.setPointerCapture?.(e.pointerId)
      const p = local(e)
      this.downs.set(e.pointerId, p)
      this.press = this.downs.size === 1 ? { ...p, id: e.pointerId } : null
      this.cursor = false
    })
    cv.addEventListener('pointermove', e => {
      const p = local(e),
        was = this.downs.get(e.pointerId)
      if (!was) return this.hover(p)
      if (this.downs.size === 2) {
        // a pinch: zoom by how far the fingers have spread, about the point between them
        const [a, b] = [...this.downs.values()]
        const other = a === was ? b : a
        const d0 = Math.hypot(was.x - other.x, was.y - other.y),
          d1 = Math.hypot(p.x - other.x, p.y - other.y)
        if (d0 > 10)
          this.zoomBy(d1 / d0, (p.x + other.x) / 2, (p.y + other.y) / 2)
        this.pan((p.x - was.x) / 2, (p.y - was.y) / 2)
      } else {
        const pr = this.press
        if (pr && Math.hypot(p.x - pr.x, p.y - pr.y) < DRAG) return
        this.press = null
        this.pan(p.x - was.x, p.y - was.y)
      }
      this.downs.set(e.pointerId, p)
    })
    const up = e => {
      const pr = this.press
      this.downs.delete(e.pointerId)
      if (pr && pr.id === e.pointerId && e.type === 'pointerup') {
        const p = local(e)
        this.pick(p.x, p.y)
      }
      this.press = null
    }
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('pointerleave', () => this.hover(null))
    cv.addEventListener(
      'wheel',
      e => {
        e.preventDefault()
        const p = local(e),
          dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        this.zoomBy(Math.exp(-dy * 0.0016), p.x, p.y)
      },
      { passive: false }
    )
  }

  // the street and the neighbourhood under the pointer (or nothing, off the map)
  hover (p) {
    let text = ''
    if (p) {
      const w = this.toWorld(p.x, p.y)
      text = around(w.x, w.z)
      if (text === null) {
        const at = whereIs(w.x, w.z, {})
        const street = at.cross ? `${at.street} / ${at.cross}` : at.street
        text = street ? `${street} · ${at.area}` : at.area
      }
    }
    if (this.el.hover.textContent !== text) this.el.hover.textContent = text
  }

  // a key while the map has the focus; true if it was the map's
  key (e) {
    const step = 90
    const k = {
      ArrowLeft: () => this.pan(step, 0),
      ArrowRight: () => this.pan(-step, 0),
      ArrowUp: () => this.pan(0, step),
      ArrowDown: () => this.pan(0, -step),
      Equal: () => this.zoomBy(1.4),
      NumpadAdd: () => this.zoomBy(1.4),
      Minus: () => this.zoomBy(1 / 1.4),
      NumpadSubtract: () => this.zoomBy(1 / 1.4),
      Enter: () => this.pick(this.v.W / 2, this.v.H / 2),
      Space: () => this.pick(this.v.W / 2, this.v.H / 2),
      Delete: () => gps.clear(),
      Backspace: () => gps.clear(),
      KeyC: () => this.findCar()
    }[e.code]
    if (!k) return false
    this.cursor = e.code !== 'KeyC'
    k()
    this.queue()
    return true
  }
}
