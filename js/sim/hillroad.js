// The hill road: a canyon road climbing from the north ring road at Santa Fe Ave into the
// Hollywood Hills. Through a gap in the retaining wall it zigzags up the canyon on switchbacks at
// 12%, then runs east through a tunnel under the ridge, out onto a bridge over the next canyon and a
// lookout over the city. Its pieces are axis-aligned like everything else in the sim: ramps (thin
// landable treads, plots.js) between square landings, stepped barriers down both sides, the tunnel's
// walls and roof, the bridge's deck on columns. The hills are carved to fit it (hillHeight here is
// the ground the game uses: the natural hills, hills.js, cut and filled along the road, but left
// alone over the tunnel and under the bridge). Pure data and math, so it runs headless in the tests.
import { naturalHill, sstep, WALL } from './hills.js'
import { ROADS } from './grid.js'
import { ramp, deck, solid, post } from './plots.js'

export const HILL_HW = 5 // half the road's width: a lane each way and a shoulder
const GRADE = 0.12
const X0 = ROADS[14] // (Santa Fe Ave, on up the canyon behind the Arts District: hills.js CANYONS)
const Z0 = ROADS[0] - 7 // the ring road's north kerb
// the road's centre line, corner to corner: [x, z, how the stretch up to it goes]
const WAY = [
  [X0, Z0],
  [X0, -901],
  [530, -901],
  [530, -923],
  [420, -923],
  [420, -945],
  [530, -945],
  [530, -967],
  [420, -967],
  [420, -989],
  [530, -989],
  [740, -989, 'tunnel'],
  [770, -989],
  [830, -989, 'bridge']
]
const FLAT = { tunnel: 0.012, bridge: 0 } // (the grade of the last stretches)
export const HILL_GAP = [X0 - HILL_HW - 1, X0 + HILL_HW + 1] // the gap in the retaining wall
export const LOOKOUT = { x0: 830, x1: 866, z0: -1006, z1: -972, y: 0 }

// the stretches between corners, each with its heights; the corners' landings
export const HILL_ROAD = []
export const LANDINGS = []
let h = 0
for (let i = 1; i < WAY.length; i++) {
  const [x0, z0] = WAY[i - 1],
    [x1, z1, kind] = WAY[i]
  const len = Math.hypot(x1 - x0, z1 - z0)
  const g = kind ? FLAT[kind] : GRADE
  HILL_ROAD.push({ x0, z0, x1, z1, h0: h, h1: h + g * len, kind: kind || 'road', len })
  h += g * len
  if (i < WAY.length - 1) LANDINGS.push({ x: x1, z: z1, h })
}
LOOKOUT.y = h

// the road nearest (x, z): { d (from its centre line), h (its height level with the point), kind }
const _near = { d: 0, h: 0, kind: '' }
export function hillRoadNear (x, z, out = _near) {
  out.d = Infinity
  for (const s of HILL_ROAD) {
    const ax = s.x1 - s.x0,
      az = s.z1 - s.z0
    const t = Math.max(0, Math.min(1, ((x - s.x0) * ax + (z - s.z0) * az) / (s.len * s.len)))
    const d = Math.hypot(x - s.x0 - ax * t, z - s.z0 - az * t)
    if (d < out.d) {
      out.d = d
      out.h = s.h0 + (s.h1 - s.h0) * t
      out.kind = s.kind
    }
  }
  const L = LOOKOUT
  const dl = Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.z0 - z, 0, z - L.z1))
  if (dl < out.d) {
    out.d = dl
    out.h = L.y
    out.kind = 'bridge'
  }
  return out
}
// whether (x, z) is on the road (its asphalt and its barriers), the lookout or in the tunnel
export function onHillRoad (x, z, m = 0.6) {
  return hillRoadNear(x, z).d < HILL_HW + m
}
export function inTunnel (x, z) {
  const n = hillRoadNear(x, z)
  return n.kind === 'tunnel' && n.d < HILL_HW + 1
}

// The ground north of the wall that the game draws and drives on: the natural hills cut down to the
// road (or built up to it) under its width and a shoulder, blending back to the hillside over a
// slope as wide as the cut is deep; over the tunnel and under the bridge, as it was.
const SHOULDER = 1.5
export function hillHeight (x, z) {
  const n0 = naturalHill(x, z)
  if (z > -WALL) return n0
  const n = hillRoadNear(x, z)
  const off = n.d - HILL_HW - SHOULDER
  const diff = n0 - (n.h - 0.15)
  if (off > Math.abs(diff) * 1.3 + 8) return n0
  if (n.kind === 'tunnel') {
    // (the ridge over it: never less than 7 m of it over the road, easing out to the hillside)
    const over = n.h + 7
    return n0 >= over ? n0 : n0 + (over - n0) * (1 - sstep(0, 14, Math.max(0, off)))
  }
  if (n.kind === 'bridge' && diff < 0) return n0
  if (off <= 0) return n.h - 0.15
  const k = sstep(0, Math.abs(diff) * 1.3 + 8, off)
  return n.h - 0.15 + diff * k
}
// the hillside's slope under (x, z): its upward normal into out
export function hillNormal (x, z, out) {
  const e = 1.5
  const gx = (hillHeight(x + e, z) - hillHeight(x - e, z)) / (2 * e),
    gz = (hillHeight(x, z + e) - hillHeight(x, z - e)) / (2 * e)
  const l = Math.hypot(gx, 1, gz)
  out.x = -gx / l
  out.y = 1 / l
  out.z = -gz / l
  return out
}

// ---------- laying it out (lots.js, before the colliders are made) ----------
const BAR = 0.9 // the barriers' height over the road
const W = HILL_HW
// a barrier down one side of a stretch, in steps a few metres long that follow its slope
function barrier (s, side) {
  const along = s.z0 === s.z1,
    a = along ? Math.min(s.x0, s.x1) : Math.min(s.z0, s.z1),
    b = along ? Math.max(s.x0, s.x1) : Math.max(s.z0, s.z1)
  const n = Math.max(1, Math.ceil((b - a) / 4))
  const c = (along ? s.z0 : s.x0) + side * (W + 0.2)
  for (let i = 0; i < n; i++) {
    const u0 = a + ((b - a) * i) / n,
      u1 = a + ((b - a) * (i + 1)) / n
    const um = (u0 + u1) / 2,
      t = ((along ? um - s.x0 : um - s.z0) / (along ? s.x1 - s.x0 : s.z1 - s.z0)) || 0
    const y = s.h0 + (s.h1 - s.h0) * t
    if (along) solid(u0, u1, c - 0.2, c + 0.2, y - 1, y + BAR, 'plant', 'barrier')
    else solid(c - 0.2, c + 0.2, u0, u1, y - 1, y + BAR, 'plant', 'barrier')
  }
}
export function layHillRoad () {
  HILL_ROAD.forEach((s, i) => {
    const along = s.z0 === s.z1,
      dir = along ? Math.sign(s.x1 - s.x0) : Math.sign(s.z1 - s.z0)
    // (from the landing's edge to the next one's: the first starts at the kerb, the last runs out
    // onto the lookout)
    const cut0 = i === 0 ? 0 : W,
      cut1 = i === HILL_ROAD.length - 1 ? 0 : W
    const piece = { ...s }
    if (along) {
      piece.x0 = s.x0 + dir * cut0
      piece.x1 = s.x1 - dir * cut1
    } else {
      piece.z0 = s.z0 + dir * cut0
      piece.z1 = s.z1 - dir * cut1
    }
    const lo = along ? Math.min(piece.x0, piece.x1) : Math.min(piece.z0, piece.z1),
      hi = along ? Math.max(piece.x0, piece.x1) : Math.max(piece.z0, piece.z1)
    const rising = dir > 0 // (the low end at the start, x0 or z0)
    const ha = rising ? s.h0 : s.h1,
      hb = rising ? s.h1 : s.h0
    if (s.kind === 'bridge' || s.h0 === s.h1) {
      if (along) deck(lo, hi, s.z0 - W, s.z0 + W, s.h1, 1.2)
      else deck(s.x0 - W, s.x0 + W, lo, hi, s.h1, 1.2)
    } else if (along) ramp(lo, hi, s.z0 - W, s.z0 + W, 'x', ha, hb)
    else ramp(s.x0 - W, s.x0 + W, lo, hi, 'z', ha, hb)
    const p2 = { ...piece, h0: rising ? ha : hb, h1: rising ? hb : ha }
    if (s.kind === 'tunnel') tunnel(piece, s)
    else {
      barrier(p2, -1)
      barrier(p2, 1)
    }
    if (s.kind === 'bridge')
      for (let u = lo + 6; u < hi; u += 15)
        for (const k of [-1, 1]) {
          const x = along ? u : s.x0 + k * (W - 1.5),
            z = along ? s.z0 + k * (W - 1.5) : u
          post(x, z, 0.9, s.h1 - 1.2, 'column')
        }
  })
  // the landings, a barrier round their open sides
  LANDINGS.forEach((l, i) => {
    deck(l.x - W, l.x + W, l.z - W, l.z + W, l.h, 1.2)
    const a = WAY[i],
      b = WAY[i + 2]
    const open = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ].filter(([dx, dz]) => {
      const to = (p, q) => Math.sign(p[0] - q.x) === dx && Math.sign(p[1] - q.z) === dz
      return !to(a, l) && !to(b, l)
    })
    for (const [dx, dz] of open) {
      if (dx) solid(l.x + dx * (W + 0.2) - 0.2, l.x + dx * (W + 0.2) + 0.2, l.z - W - 0.4, l.z + W + 0.4, l.h - 1, l.h + BAR, 'plant', 'barrier')
      else solid(l.x - W - 0.4, l.x + W + 0.4, l.z + dz * (W + 0.2) - 0.2, l.z + dz * (W + 0.2) + 0.2, l.h - 1, l.h + BAR, 'plant', 'barrier')
    }
  })
  // the lookout: a deck on columns, a railing round three sides, a car park's worth of room
  const L = LOOKOUT
  deck(L.x0, L.x1, L.z0, L.z1, L.y, 1.2)
  solid(L.x1 - 0.4, L.x1, L.z0, L.z1, L.y - 1, L.y + 1.1, 'plant', 'barrier')
  solid(L.x0, L.x1, L.z0, L.z0 + 0.4, L.y - 1, L.y + 1.1, 'plant', 'barrier')
  solid(L.x0, L.x1, L.z1 - 0.4, L.z1, L.y - 1, L.y + 1.1, 'plant', 'barrier')
  for (let x = L.x0 + 6; x < L.x1; x += 12)
    for (const z of [L.z0 + 4, L.z1 - 4]) {
      post(x, z, 0.9, L.y - 1.2, 'column')
    }
}
// the tunnel: its walls either side and its roof (the ridge piled over it: hillHeight), lit
export const TUNNELS = []
const TUNNEL_H = 6
function tunnel (p, s) {
  const x0 = Math.min(p.x0, p.x1),
    x1 = Math.max(p.x0, p.x1),
    y = Math.min(s.h0, s.h1)
  const top = Math.max(s.h0, s.h1) + TUNNEL_H
  TUNNELS.push({ x0, x1, z0: s.z0 - W - 0.6, z1: s.z0 + W + 0.6, y0: y, y1: top, h0: s.h0, h1: s.h1 })
  solid(x0, x1, s.z0 - W - 0.6, s.z0 - W, y - 1, top, 'plant', 'tunnel')
  solid(x0, x1, s.z0 + W, s.z0 + W + 0.6, y - 1, top, 'plant', 'tunnel')
  solid(x0, x1, s.z0 - W, s.z0 + W, top - 0.5, top + 0.5, 'building', 'tunnel')
}
