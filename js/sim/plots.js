// What stands on the blocks, and the helpers the neighbourhoods are built with (lots.js lays out
// each block by its neighbourhood: towers.js, shops.js, homes.js). Buildings are boxes stacked in
// tiers (setbacks), each solid and landable on top; a tier may carry a hip roof instead of a flat
// one, and a tower may be drawn round, three-sided or sail-topped (its shafts) while the sim keeps
// to boxes that follow its plan. Pure data, as city.js.
import { ROADS, rng, BLVD_EW, BLVD_NS } from './grid.js'

export const BLOCKS = []
export const BUILDINGS = []
export const TREES = [] // round-headed trees: { x, z, s } (the parks' first)
export const PALMS = [] // { x, z, h, fan }: a tall, thin Mexican fan palm, or a stout date palm
export const STALLS = [] // parking spaces: { x, z, yaw, taken }
// other solid things on the lots, each a box: hedges and garden walls, a gas station's canopy (on
// its columns) and pumps, a billboard's board on its pole. kind as the colliders' (city.js): a
// 'building' is landable on top, 'plant' is not; posts have r; look says how each is drawn.
export const SOLIDS = []
// signs and pictures for the renderer: billboards, pylon signs, marquees, blade signs, rooftop
// signs, murals, helipads: { kind, x, z, y, w, h, face (the way it faces: 0 north, 1 east, 2
// south, 3 west), ... }
export const SIGNS = []
// the new districts' kit, for the renderer (render/cityWorks.js): shipping containers, gantry cranes,
// parked trailers and trucks, storage tanks, chimneys, water towers, loading-dock doors, basketball
// hoops, bleachers, floodlight masts, bus shelters, bushes, the ship at the quay: { kind, x, z, ... }
// (what is solid among them is in SOLIDS too, look 'prop', or a post)
export const PROPS = []
// Raised drivable surfaces: decks (flat, a slab y0 to y1: the freeway, a car park's roof) and ramps
// (a slope from h0 at one end to h1 at the other along axis 'x' or 'z', the low end at the start,
// x0 or z0, when rising, else at the end). The sim's colliders are boxes, so a ramp is laid as a
// flight of thin landable treads (kind 'building', look 'ramp'), each RISE higher than the one before
// (well under roofs.js STEP, so the car drives up them as onto the next roof): groundHeight
// (terrain.js) gives the smooth slope they follow.
export const DECKS = [] // { x0, x1, z0, z1, y0, y1 }
export const RAMPS = [] // { x0, x1, z0, z1, axis, h0, h1 }
const RISE = 0.06
export function deck (x0, x1, z0, z1, y1, thick = 1) {
  const d = { x0, x1, z0, z1, y0: y1 - thick, y1 }
  DECKS.push(d)
  solid(x0, x1, z0, z1, y1 - thick, y1, 'building', 'deck')
  return d
}
export function ramp (x0, x1, z0, z1, axis, h0, h1) {
  const r = { x0, x1, z0, z1, axis, h0, h1 }
  RAMPS.push(r)
  const a = axis === 'x' ? x0 : z0,
    b = axis === 'x' ? x1 : z1
  const n = Math.max(2, Math.ceil(Math.abs(h1 - h0) / RISE))
  for (let i = 0; i < n; i++) {
    const u0 = a + ((b - a) * i) / n,
      u1 = a + ((b - a) * (i + 1)) / n
    // (each tread at the slope's height half way along it)
    const y = h0 + ((h1 - h0) * (i + 0.5)) / n
    if (y < 0.03) continue
    const box =
      axis === 'x' ? [u0, u1, z0, z1] : [x0, x1, u0, u1]
    solid(...box, Math.max(0, y - 0.6), y, 'building', 'ramp')
  }
  return r
}
export const prop = (kind, o) => {
  const p = { kind, ...o }
  PROPS.push(p)
  return p
}

export const R = rng(1015)
export const range = (a, b) => a + R() * (b - a)
export const pick = arr => arr[Math.floor(R() * arr.length)]
export const chance = p => R() < p

// the main streets, with shops along them and palms down them (indices into ROADS): Hollywood,
// Sunset, Santa Monica and Wilshire Boulevards and Venice Boulevard east-west; Ocean Avenue, La
// Cienega and Vine north-south (areas.js names them); and the south's and east's boulevards: the
// boulevards with a median (grid.js)
const MAIN_EW = BLVD_EW
const MAIN_NS = BLVD_NS
// the street along side s of block (bx, bz) (0 north, 1 east, 2 south, 3 west): its index in
// ROADS, and whether it runs east-west
export const streetOf = (bx, bz, s) =>
  s === 0 ? bz : s === 2 ? bz + 1 : s === 1 ? bx + 1 : bx
export const isMain = (bx, bz, s) =>
  (s % 2 === 0 ? MAIN_EW : MAIN_NS).has(streetOf(bx, bz, s))
export const MAIN = { EW: MAIN_EW, NS: MAIN_NS }
export { ROADS }

// facade colours by style
export const TINTS = {
  glass: [0x8fb8d0, 0x7a9fc0, 0x9cc4bf, 0xc4ab88, 0x8796ad, 0xa3b8c9],
  dark: [0x5d6670, 0x4f5862, 0x6b7076], // black and smoked glass
  office: [0xe8e2d6, 0xd6d1c8, 0xcdd2d6, 0xe3d6c0, 0xbfc4c9],
  stone: [0xeadfca, 0xe2d2b4, 0xd9c6a5, 0xefe6d6, 0xd8cfc0],
  brick: [0xf2ece6, 0xe6d6ca, 0xd6cbc4, 0xc9c0bb],
  stucco: [0xf3e3c8, 0xf2cdb5, 0xd8e6cf, 0xf0d5cf, 0xe9e0c2, 0xcfe1e6],
  white: [0xf6f2ea, 0xf1ebe0, 0xefe6d6, 0xf7f4ee, 0xe9e4da],
  bright: [
    0x5cc6d6,
    0xf2876a,
    0xf6d06a,
    0xb89be0,
    0x8fd49a,
    0xf4a6c8,
    0x6fa8e6,
    0xf2b05e,
    0xe86f6f,
    0x7fd8c0
  ]
}

// Local frames along a lot's sides. side s of the lot [x0, x1] x [z0, z1]: u runs along the street
// (0 to the side's length), v in from it (0 at the pavement). f(u0, u1, v0, v1) is the box
// [x0, x1, z0, z1] in the world.
export function frame (lot, s) {
  const { x0, x1, z0, z1 } = lot
  if (s === 0) return (u0, u1, v0, v1) => [x0 + u0, x0 + u1, z0 + v0, z0 + v1]
  if (s === 1) return (u0, u1, v0, v1) => [x1 - v1, x1 - v0, z0 + u0, z0 + u1]
  if (s === 2) return (u0, u1, v0, v1) => [x1 - u1, x1 - u0, z1 - v1, z1 - v0]
  return (u0, u1, v0, v1) => [x0 + v0, x0 + v1, z1 - u1, z1 - u0]
}
// the length of side s of a lot
export const sideLen = (lot, s) => (s % 2 ? lot.z1 - lot.z0 : lot.x1 - lot.x0)

// ---------- buildings ----------
// A building, its look in o: style and tint (the facade), shop (storefronts round the ground
// floor), u (where the facade's window pattern starts, so neighbours differ), and its tiers added
// after with tier().
export function building (area, o = {}) {
  const b = {
    x0: Infinity,
    x1: -Infinity,
    z0: Infinity,
    z1: -Infinity,
    h: 0,
    area,
    style: 'stucco',
    tint: 0xffffff,
    u: R(),
    shop: false,
    antenna: false,
    tiers: [],
    ...o
  }
  BUILDINGS.push(b)
  return b
}
// A tier: a box from y0 to y1. extra: its own style or tint, hip (the rise of a hip roof on it, m),
// eave (how far that roof overhangs), deck (a flat roof the car can land on: false for a hip roof)
export function tier (b, x0, x1, z0, z1, y0, y1, extra) {
  const t = { x0, x1, z0, z1, y0, y1, ...extra }
  b.tiers.push(t)
  b.x0 = Math.min(b.x0, x0)
  b.x1 = Math.max(b.x1, x1)
  b.z0 = Math.min(b.z0, z0)
  b.z1 = Math.max(b.z1, z1)
  b.h = Math.max(b.h, y1)
  return t
}
// A box building on [x0, x1] x [z0, z1], h tall, stepping in as it rises: steps setbacks, each
// tier a share of what is left of the height, the next inset by 2 to 5.5 m
export function stack (b, x0, x1, z0, z1, h, steps = 1, y = 0) {
  let ins = 0
  for (let t = 0; t < steps; t++) {
    const top =
      t === steps - 1 ? h : y + (h - y) * (t === 0 ? 0.5 + R() * 0.2 : 0.6)
    const w = Math.min(x1 - x0, z1 - z0) / 2 - ins
    if (t > 0 && w < 5) break
    tier(b, x0 + ins, x1 - ins, z0 + ins, z1 - ins, y, top)
    y = top
    ins += 2 + R() * 3.5
  }
  return b
}

// ---------- shaped towers ----------
// A shaft: a prism on a convex plan (pts, [x, z] round it anticlockwise seen from above) from y0
// to y1, drawn as it is (smooth: a round one's walls shade smoothly). The sim gets boxes for it:
// strips across its plan (along z), each as wide as the plan is across the strip's middle.
export function shaft (b, pts, y0, y1, o = {}) {
  const s = { pts, y0, y1, smooth: false, ...o }
  ;(b.shafts = b.shafts || []).push(s)
  b.form = 'shaft'
  const zs = pts.map(p => p[1]),
    lo = Math.min(...zs),
    hi = Math.max(...zs)
  const n = Math.max(3, Math.min(10, Math.round((hi - lo) / 6)))
  for (let k = 0; k < n; k++) {
    const za = lo + ((hi - lo) * k) / n,
      zb = lo + ((hi - lo) * (k + 1)) / n
    const [xa, xb] = across(pts, (za + zb) / 2)
    if (xb - xa > 0.5) tier(b, xa, xb, za, zb, y0, y1, { strip: true })
  }
  return s
}
// where a horizontal line at z crosses a convex plan: [x0, x1]
function across (pts, z) {
  let a = Infinity,
    c = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i],
      [x1, z1] = pts[(i + 1) % pts.length]
    if ((z0 - z) * (z1 - z) > 0 || z0 === z1) continue
    const x = x0 + ((x1 - x0) * (z - z0)) / (z1 - z0)
    a = Math.min(a, x)
    c = Math.max(c, x)
  }
  return [a, c]
}
// a round plan: n points on a circle (or an ellipse, rx by rz) round (cx, cz), turned by a
export const ring = (cx, cz, rx, rz = rx, n = 28, a = 0) =>
  Array.from({ length: n }, (_, i) => {
    const t = a - (i / n) * Math.PI * 2
    return [cx + rx * Math.cos(t), cz + rz * Math.sin(t)]
  })
// a regular polygon's corners cut off by c (m): a triangle with its tips trimmed, an octagon...
export function trimmed (cx, cz, r, sides, c, a = 0) {
  const pts = []
  for (let i = 0; i < sides; i++) {
    const t0 = a - (i / sides) * Math.PI * 2,
      t1 = a - ((i + 1) / sides) * Math.PI * 2
    const p = [cx + r * Math.cos(t0), cz + r * Math.sin(t0)],
      q = [cx + r * Math.cos(t1), cz + r * Math.sin(t1)]
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]),
      k = c / L
    pts.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k])
    pts.push([q[0] - (q[0] - p[0]) * k, q[1] - (q[1] - p[1]) * k])
  }
  return pts
}

// ---------- on the ground ----------
// a surface on a block's lot, over its base: grass, asphalt (a car park), concrete (a drive or a
// forecourt), plaza (paving), pool (water)
export function ground (blk, k, x0, x1, z0, z1) {
  ;(blk.ground = blk.ground || []).push({ k, x0, x1, z0, z1 })
}
export function solid (x0, x1, z0, z1, y0, y1, kind, look, extra) {
  const s = { x0, x1, z0, z1, y0, y1, kind, look, ...extra }
  SOLIDS.push(s)
  return s
}
// a hedge (or a garden wall: look 'wall') along [x0, x1] x [z0, z1], h tall
export const hedge = (x0, x1, z0, z1, h, look = 'hedge') =>
  solid(x0, x1, z0, z1, 0, h, 'plant', look, { tint: R() })
// a post on the lot: a billboard's or a sign's pole
export const post = (x, z, r, h, look) =>
  solid(x - r, x + r, z - r, z + r, 0, h, 'mast', look, { x, z, r })
// A row of parking spaces along x (axis 0) or z (axis 1) from a to b at c, the cars' noses
// pointing towards +c (dir 1) or -c (dir -1); fill: how full the car park is, about
export function stalls (axis, a, b, c, dir, fill = 0.6) {
  for (let t = a + 1.35; t + 1.35 <= b; t += 2.7) {
    const yaw =
      axis === 0
        ? dir > 0
          ? -Math.PI / 2
          : Math.PI / 2
        : dir > 0
        ? 0
        : Math.PI
    STALLS.push({
      x: axis === 0 ? t : c,
      z: axis === 0 ? c : t,
      yaw,
      fill,
      taken: false
    })
  }
}
// A car park on [x0, x1] x [z0, z1]: rows of nose-in spaces either side of aisles, along x
export function carPark (blk, x0, x1, z0, z1, fill = 0.55) {
  ground(blk, 'asphalt', x0, x1, z0, z1)
  // (a row pair is 5.4 + 6.5 + 5.4: spaces, aisle, spaces)
  let z = z0 + 0.4
  while (z + 5.4 <= z1 - 0.4) {
    stalls(0, x0 + 1, x1 - 1, z + 2.7, -1, fill)
    z += 5.4 + 6.5
    if (z + 5.4 > z1 - 0.4) break
    stalls(0, x0 + 1, x1 - 1, z + 2.7, 1, fill)
    z += 5.4 + 0.6
  }
}
// Which spaces have a car in: n of them, each car park about as full as it asks. (The traffic
// draws each parked car's make from the same random numbers as the drivers it deals after them,
// traffic.js: n stays at the 267 the city always had, so the drivers on the streets are the same.)
export function parkCars (n) {
  const keys = STALLS.map(s => [R() / s.fill, s])
  keys.sort((a, b) => a[0] - b[0])
  keys.forEach(([, s], i) => (s.taken = i < n))
}
// Whether (x, z) is m clear of the buildings and solid things put up on this block so far (lots.js
// marks where each block's begin), so a palm never stands in a wall
let fromB = 0,
  fromS = 0
export function mark () {
  fromB = BUILDINGS.length
  fromS = SOLIDS.length
}
const inBox = (c, x, z, m) =>
  x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m
export function free (x, z, m = 1.2) {
  for (let i = fromB; i < BUILDINGS.length; i++)
    if (BUILDINGS[i].tiers.some(t => inBox(t, x, z, m))) return false
  for (let i = fromS; i < SOLIDS.length; i++)
    if (inBox(SOLIDS[i], x, z, m)) return false
  return true
}
// a palm or a tree on a lot, where there is room for it
export const palm = (x, z, h, fan) => free(x, z) && PALMS.push({ x, z, h, fan })
export const tree = (x, z, s) => free(x, z, 2) && TREES.push({ x, z, s })
// A sign or a picture for the renderer (and, for a billboard or a pylon, its post: post())
export const sign = (kind, o) => {
  const s = { kind, ...o }
  SIGNS.push(s)
  return s
}
