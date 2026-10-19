// Where people gather (peds.js, pedLife.js): a street performer on a busy pavement (the
// boulevards, the beach, Venice, downtown, the parks and the stadium's), and a few passers-by who
// stop to watch, in a half ring in front of them, a while each. Never a permanent crowd: a show
// lasts a minute or two (and so many watchers) and then the performer packs up, and the spot stays
// quiet a while before the next. Each place is fixed (one in three of those blocks, the middle of
// one side of its pavement); its watchers' places are laid round it on the pavement, clear of the
// kerb and of anything standing there. Pure maths and data: no DOM.
import { BLOCKS, query } from '../city.js'
import { kerbDist } from '../street.js'
import { LINES, ringOf, ringAt, nearestOn } from '../pavement.js'

const KINDS = new Set(['boulevard', 'beach', 'venice', 'downtown', 'stadium'])
export const SLOTS = 6 // watchers at most
export const SHOW = 75 // s a show lasts at most
export const SERVE = 9 // watchers a show has before it ends
export const REST = 40 // s quiet after one
export const WATCH_R = 2.3 // m the watchers stand from the performer
const near = []
const P = { x: 0, z: 0, hx: 1, hz: 0, piece: 0 }

// nothing standing at (x, z), and on the pavement
export function free (x, z) {
  if (kerbDist(x, z) > -0.45) return false
  query(x - 0.35, z - 0.35, x + 0.35, z + 0.35, near)
  for (const c of near) if (!c.down && c.y0 < 1.5 && c.y1 > 0.5) return false
  return true
}
// the places, made once: { b, g (the ring), s, x, z, slots: [{ x, z, yaw, who }], perf, open, t,
// served, rest, shows }
export const POIS = []
export function layPois () {
  if (POIS.length) return POIS
  for (const b of BLOCKS) {
    const want = b.kind === 'park' || KINDS.has(b.area)
    if (!want || (b.bx * 7 + b.bz * 3) % 3) continue
    const g = ringOf(b, LINES.length - 1)
    // the middle of one of its four sides (the first with room: its performer and three watchers)
    for (let k = 0; k < 4; k++) {
      const side = (b.bx + b.bz + k) % 4
      let s = 0
      for (let i = 0; i < side * 2; i++) s += g.runs[i]
      s += g.runs[side * 2] / 2
      ringAt(g, s, P)
      if (!free(P.x, P.z)) continue
      const slots = slotsAt(P.x, P.z, P.hx, P.hz)
      if (slots.length < 3) continue
      POIS.push({ b, g, s, x: P.x, z: P.z, hx: P.hx, hz: P.hz, slots, perf: null, open: true, t: 0, served: 0, rest: 0, shows: 0 })
      break
    }
  }
  return POIS
}
// the watchers' places round a performer at (x, z) on a pavement heading (hx, hz): a half ring on
// the kerb side, each facing them
export function slotsAt (x, z, hx, hz) {
  const kx = hz,
    kz = -hx // (towards the kerb)
  const out = []
  for (let i = 0; i < SLOTS + 2 && out.length < SLOTS; i++) {
    const a = -1.2 + (2.4 * i) / (SLOTS + 1)
    const r = WATCH_R + (i % 2) * 0.35
    const sx = x + r * (Math.cos(a) * kx + Math.sin(a) * hx),
      sz = z + r * (Math.cos(a) * kz + Math.sin(a) * hz)
    if (!free(sx, sz)) continue
    out.push({ x: sx, z: sz, yaw: Math.atan2(-(z - sz), x - sx), who: null })
  }
  return out
}
// a free place to watch at poi, nearest to (x, z); null if none
export function slotFor (poi, x, z) {
  let best = null,
    bd = Infinity
  for (const sl of poi.slots) {
    if (sl.who) continue
    const d = (sl.x - x) ** 2 + (sl.z - z) ** 2
    if (d < bd) {
      bd = d
      best = sl
    }
  }
  return best
}
// how many watching just now
export const watching = poi => poi.slots.reduce((n, sl) => n + (sl.who ? 1 : 0), 0)
// the show's clock: open, then (on so long, or so many served) over and a rest; true when it ends
export function tick (poi, dt) {
  if (!poi.open) {
    if ((poi.rest -= dt) <= 0) {
      poi.open = true
      poi.t = poi.served = 0
    }
    return false
  }
  if (!poi.perf) return false
  poi.t += dt
  if (poi.t < SHOW && poi.served < SERVE) return false
  poi.open = false
  poi.rest = REST
  poi.shows++
  return true
}
// where along ring g the place (x, z) is (for walking over to it)
export const sOn = (g, x, z) => nearestOn(g, x, z)
