// The game's marks on the radar (minimap.js's overlay hook) and the pause menu's map (mapDraw.js's):
// the police as red and blue blips flashing by turns, the helicopter, the search circle round the
// last known position (red and blue, pulsing, while the stars flash), the missions' blips in their
// colours (each start a lettered blip held on the rim while it is off the radar; an objective's
// place as GTA's yellow) and the street event going on (a small blue dot).
import { blip } from './blips.js'
import { drawPois } from './poiMap.js'
import { onGame, GAME_EVENTS } from '../sim/gameEvents.js'

// The search area as the police stream says it ('police-search' { pos, radius }, radius 0 or no pos
// to end it): it wins over the one game.js works out from the wanted level while it is fresh (its
// ttl, s, or SEARCH_TTL), and either may be missing.
const SEARCH_TTL = 20
let heard = null
onGame('police-search', e => {
  const p = e.pos
  heard = p && e.radius > 0 ? { x: p.x, z: p.z, r: e.radius, until: e.t + (e.ttl || SEARCH_TTL) } : { none: true, until: e.t + 2 }
})
// the search circle to draw: the stream's while fresh (on the game events' clock), else game.js's
export function searchOf (s) {
  if (heard && GAME_EVENTS.t > heard.until) heard = null
  if (heard && !s.units?.length && !s.search) heard = null // (the stars are gone)
  if (heard) return heard.none ? null : heard
  return s.search
}

const TAU = Math.PI * 2
// a mission's glyph: its initial letter
const letter = ch => (g, k) => {
  g.save()
  g.font = `800 ${8 * k}px sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#111'
  g.fillText(ch, 0, 0.5 * k)
  g.restore()
}
const LETTERS = {}
const glyphOf = title => (LETTERS[title] ||= letter((title || '?')[0].toUpperCase()))

// what game.js hands both maps: { units: [{ x, z, role }], heli: { on, x, z }, search: { x, z, r }
// or null, markers: missions.markers(), event: { x, z } or null, t: the clock }
function police (g, at, s, k, big = 1) {
  const blink = Math.floor(s.t * 4) % 2
  for (const u of s.units) {
    const p = at(u.x, u.z, false)
    if (!p) continue
    g.beginPath()
    g.arc(p.x, p.y, 3.2 * k * big, 0, TAU)
    g.fillStyle = (u.id + blink) % 2 ? '#ff3b3b' : '#3b7bff'
    g.fill()
    g.lineWidth = k
    g.strokeStyle = 'rgba(0,0,0,0.7)'
    g.stroke()
  }
  if (s.heli?.on) {
    const p = at(s.heli.x, s.heli.z, true)
    g.beginPath()
    g.arc(p.x, p.y, 5 * k * big, 0, TAU)
    g.strokeStyle = blink ? '#ff3b3b' : '#3b7bff'
    g.lineWidth = 2 * k
    g.stroke()
    g.beginPath()
    g.arc(p.x, p.y, 2 * k * big, 0, TAU)
    g.fillStyle = '#fff'
    g.fill()
  }
}
function circle (g, at, s, scale) {
  const sr = searchOf(s)
  if (!sr) return
  const c = at(sr.x, sr.z, false, true)
  const r = sr.r * scale
  const pulse = 0.5 + 0.5 * Math.sin(s.t * 3)
  g.beginPath()
  g.arc(c.x, c.y, r, 0, TAU)
  g.fillStyle = `rgba(${Math.floor(s.t * 2) % 2 ? '255,60,60' : '60,110,255'}, ${0.12 + 0.08 * pulse})`
  g.fill()
  g.lineWidth = 1.5
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.stroke()
}
function missions (g, at, s, k, big = 1) {
  for (const m of s.markers) {
    const p = at(m.x, m.z, true)
    if (m.kind === 'start') blip(g, p.x, p.y, k * big, m.color, glyphOf(m.title))
    else if (m.kind === 'target') blip(g, p.x, p.y, k * big * 1.1, '#f2d43a', null)
    else {
      g.beginPath()
      g.arc(p.x, p.y, 3.5 * k * big, 0, TAU)
      g.fillStyle = 'rgba(242,212,58,0.6)'
      g.fill()
    }
  }
  if (s.event) {
    const p = at(s.event.x, s.event.z, false)
    if (p) {
      g.beginPath()
      g.arc(p.x, p.y, 3 * k * big, 0, TAU)
      g.fillStyle = '#5ab4ff'
      g.fill()
    }
  }
}

// The radar: g in screen pixels, V minimap.js's view (px, pz, c, s, cx, cy, W, H), toRadar its
// rim-holding projection, k its mark scale
export function radarOverlay (g, V, toRadar, k, s) {
  const zoom = Math.hypot(V.c, V.s)
  const at = (x, z, rim, raw = false) => {
    const dx = x - V.px,
      dz = z - V.pz
    const px = V.cx + dx * V.c - dz * V.s,
      py = V.cy + dx * V.s + dz * V.c
    if (raw) return { x: px, y: py }
    if (rim) {
      const r = toRadar(x, z)
      return { x: r.x, y: r.y }
    }
    return px < 0 || py < 0 || px > V.W || py > V.H ? null : { x: px, y: py }
  }
  drawPois(g, (x, z) => at(x, z, false), 0.7 * k) // (only those in view, small)
  circle(g, at, s, zoom)
  police(g, at, s, k)
  missions(g, at, s, k)
}

// The pause map: sx, sy world to CSS px, k CSS px a metre
export function mapOverlay (g, sx, sy, k, s) {
  const at = (x, z) => ({ x: sx(x), y: sy(z) })
  drawPois(g, at, 1)
  circle(g, at, s, k)
  police(g, at, s, 1, 1.2)
  missions(g, at, s, 1, 1.25)
}
