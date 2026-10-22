// Thirty hidden tokens to find round the city, GTA's hidden packages: at the far end of alleys, on
// the multi-storey car parks' roofs and a few low roofs (the Roadster flies), in the parks, out on
// the pier and the sand by it, by the lighthouse, the masts, the observatory and the lookout, under the
// freeway, in the hill road's tunnel, and one in each of the interiors. Picked on their own random
// numbers (rng 20261023) from what is already laid out, so nothing else moves. Pure: where they
// are, which have been found, and the step that finds them (render/interiors/glue.js runs it, emits
// 'token-collected' { id, n, total, pos } and remembers them; render/cityTokens.js draws them).
import { BLOCKS, BUILDINGS, rng, query } from './city.js'
import { groundHeight, roofAt, LANDMARKS_V2, LOOKOUT } from './world.js'
import { ALLEYS } from './extras.js'
import { DECKS } from './lots.js'
import { PIER } from './edge.js'
import { LANDMARKS } from './areas.js'
import { TUNNELS } from './hillroad.js'
import { FWY } from './freeway.js'
import { SITES, POCKET, toWorld } from './interiors/sites.js'

export const TOTAL = 30
export const PICK_R = { foot: 1.4, car: 3.2 } // m from a token that takes it
const R = rng(20261023)
const hits = []
// whether someone could stand at (x, y, z): nothing at body height there
function clear (x, z, y) {
  for (const c of query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, hits))
    if (!c.down && c.y0 < y + 1.8 && c.y1 > y + 0.4) return false
  return true
}
export const TOKENS = []
function add (x, z, y, where) {
  if (
    TOKENS.length >= TOTAL ||
    TOKENS.some(t => Math.hypot(t.x - x, t.z - z) < 20 && Math.abs(t.y - y) < 4)
  )
    return false
  TOKENS.push({ id: TOKENS.length, x, z, y, where })
  return true
}
const onGround = (x, z, where) =>
  clear(x, z, groundHeight(x, z)) && add(x, z, groundHeight(x, z), where)

// one in each interior, in a corner of its floor clear of the furniture
for (const s of SITES) {
  const R2 = s.room
  for (const [u, v] of [
    [-R2.w / 2 + 0.8, R2.d - 0.8],
    [R2.w / 2 - 0.8, R2.d - 0.8],
    [-R2.w / 2 + 0.8, 1.6],
    [0, R2.d / 2]
  ]) {
    const p = toWorld(s, u, v)
    const inside = s.solids.every(
      c =>
        c.look !== 'room' ||
        c.y1 <= POCKET + 0.4 ||
        !(
          p.x > c.x0 - 0.4 &&
          p.x < c.x1 + 0.4 &&
          p.z > c.z0 - 0.4 &&
          p.z < c.z1 + 0.4
        )
    )
    if (inside && add(p.x, p.z, POCKET, `inside ${s.name}`)) break
  }
}
// the landmarks
{
  const L = LOOKOUT
  add(L.x0 + 3, L.z0 + 3, L.y, 'the lookout')
  const end = PIER.deck[3]
  add(
    (end.x0 + end.x1) / 2,
    end.z0 + 3,
    groundHeight((end.x0 + end.x1) / 2, end.z0 + 3),
    'the end of the pier'
  )
  // (on the sand beside the pier)
  const d0 = PIER.deck[0]
  const ux = d0.x0 + (d0.x1 - d0.x0) * 0.8
  onGround(ux, d0.z1 + 5, 'on the beach by the pier')
  const lh = LANDMARKS_V2.lighthouse
  if (lh)
    for (const [dx, dz] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4]
    ])
      if (onGround(lh.x + dx, lh.z + dz, 'by the lighthouse')) break
  const m = LANDMARKS_V2.masts[0]
  if (m)
    for (const [dx, dz] of [
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5]
    ])
      if (onGround(m.x + dx, m.z + dz, 'at the masts')) break
  const o = LANDMARKS.observatory
  for (const dz of [26, 30, 34, -26])
    if (onGround(o.x, o.z + dz, 'the observatory')) break
  const t = TUNNELS[0]
  if (t) {
    const x = (t.x0 + t.x1) / 2,
      z = (t.z0 + t.z1) / 2
    add(x, z - 2.5, groundHeight(x, z - 2.5, t.y0 + 2), 'in the tunnel')
  }
  for (const f of [0.3, 0.62]) {
    const x = FWY.x0 + (FWY.x1 - FWY.x0) * f
    for (const dz of [-8, 8, 0])
      if (clear(x, FWY.z + dz, 0) && add(x, FWY.z + dz, 0, 'under the freeway'))
        break
  }
}
// the multi-storey car parks' roofs
for (const k of ['10,13', '11,4', '9,9']) {
  // (lots.js GARAGES)
  const [bx, bz] = k.split(',').map(Number)
  const blk = BLOCKS.find(b => b.bx === bx && b.bz === bz)
  let top = null
  for (const d of DECKS)
    if (
      d.x0 >= blk.x0 &&
      d.x1 <= blk.x1 &&
      d.z0 >= blk.z0 &&
      d.z1 <= blk.z1 &&
      (!top || d.y1 > top.y1)
    )
      top = d
  if (top)
    add(
      (top.x0 + top.x1) / 2,
      (top.z0 + top.z1) / 2,
      top.y1,
      "on a car park's roof"
    )
}
// the parks' middles
for (const b of BLOCKS)
  if (b.kind === 'park' && !b.sports)
    onGround((b.x0 + b.x1) / 2 + 2, (b.z0 + b.z1) / 2 + 2, 'in a park')
// the far ends of alleys, round the city
{
  const order = ALLEYS.map(a => [R(), a]).sort((p, q) => p[0] - q[0])
  let n = 0
  for (const [, a] of order) {
    if (n >= 9) break
    if (
      a.deep &&
      clear(a.deep.x, a.deep.z, 0) &&
      add(a.deep.x, a.deep.z, 0, 'down an alley')
    )
      n++
  }
}
// and the rest on low flat roofs (for the Roadster to land on)
{
  const low = BUILDINGS.filter(
    b =>
      b.h >= 6 &&
      b.h <= 16 &&
      b.tiers.length === 1 &&
      !b.tiers[0].hip &&
      !b.shafts
  )
  for (let tries = 0; tries < 400 && TOKENS.length < TOTAL; tries++) {
    const b = low[Math.floor(R() * low.length)]
    const x = (b.x0 + b.x1) / 2,
      z = (b.z0 + b.z1) / 2
    const r = roofAt(x, z, b.h + 0.5)
    if (r && Math.abs(r.y1 - b.h) < 0.6 && clear(x, z, b.h))
      add(x, z, b.h, 'on a roof')
  }
}

// which have been found (ids); restored from what the game remembered
export const FOUND = new Set()
export const found = () => FOUND.size
// the token the player at p takes this step, if any ({ x, y, z } feet; car: at the wheel)
export function tokenAt (p, car = false) {
  const r = car ? PICK_R.car : PICK_R.foot
  for (const t of TOKENS) {
    if (FOUND.has(t.id)) continue
    const dx = p.x - t.x,
      dz = p.z - t.z
    if (dx * dx + dz * dz < r * r && Math.abs(p.y - t.y) < 2.5) return t
  }
  return null
}
// take it: the count found so far
export function take (t) {
  FOUND.add(t.id)
  return FOUND.size
}
// the found set as a string to keep ('0,4,17'), and back
export const saveFound = () => [...FOUND].join(',')
export function loadFound (s) {
  FOUND.clear()
  for (const v of String(s || '').split(','))
    if (v !== '' && Number(v) < TOKENS.length) FOUND.add(Number(v))
}
