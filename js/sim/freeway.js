// The Santa Monica Freeway on its deck, east-west across the city down the middle of row FWY_ROW's
// blocks (areas.js 'corridor'): three lanes each way, DECK_Y up, from a slope down to the street at
// its west end to one at its east end, over every north-south street between (the streets pass
// under it) and over the river. Two pairs of ramps: west of the river an eastbound on-ramp up its
// south side and a westbound off-ramp down its north side; east of it an eastbound off-ramp and a
// westbound on-ramp. Each ramp runs beside the deck and meets its edge at the top, a barrier
// between them below; the deck has a parapet along each side, open where a ramp joins. Its traffic
// is drawn far off only; the deck and ramps are for the Roadster (and whoever drives what: the
// RAMPS and DECKS, and groundHeight in terrain.js, say where they are).
import { N, ROADS, ROAD_HW, WALK } from './grid.js'
import { DECKS, RAMPS, deck, ramp, solid } from './plots.js'

export const FWY_ROW = 10 // the row of blocks it runs down (bz)
export const FWY_FROM = 2 // its first and last blocks (bx)
export const FWY_TO = N - 1
export const DECK_Y = 6.5 // the road's surface, m up (the street under it has 5.5 m clear)
export const DECK_HW = 13 // half its width: three 3.6 m lanes and a shoulder each way
const RAMP_W = 7.5
const PARAPET = 1.05
export const FWY_Z = (ROADS[FWY_ROW] + ROADS[FWY_ROW + 1]) / 2 // its centre line
const Z0 = FWY_Z - DECK_HW,
  Z1 = FWY_Z + DECK_HW
// a block's lot along x (inside its pavements)
const lotX = bx => [ROADS[bx] + ROAD_HW + WALK, ROADS[bx + 1] - ROAD_HW - WALK]
// the blocks with ramps, and on which side of the deck ('n' or 's')
const MERGE = 36 // m of merge lane along the deck past a ramp's top
export const RAMP_AT = {
  4: ['n', 's'],
  14: ['n', 's']
}
export const FWY = { z: FWY_Z, z0: Z0, z1: Z1, y: DECK_Y, x0: 0, x1: 0 }

export function layFreeway () {
  const [wx0, wx1] = lotX(FWY_FROM),
    [ex0, ex1] = lotX(FWY_TO)
  FWY.x0 = wx0
  FWY.x1 = ex1
  // the slopes down at its ends, the deck between
  ramp(wx0, wx1, Z0, Z1, 'x', 0, DECK_Y)
  ramp(ex0, ex1, Z0, Z1, 'x', DECK_Y, 0)
  // (the deck in a piece a block and a piece a street, so no collider is longer than it need be)
  for (let bx = FWY_FROM; bx <= FWY_TO; bx++) {
    const [a, b] = lotX(bx)
    if (bx > FWY_FROM && bx < FWY_TO) deck(a, b, Z0, Z1, DECK_Y)
    if (bx < FWY_TO) {
      const [na] = lotX(bx + 1)
      deck(b, na, Z0, Z1, DECK_Y)
    }
  }
  // the ramps
  const rampsAt = []
  for (const [k, sides] of Object.entries(RAMP_AT)) {
    const bx = +k,
      [a, b] = lotX(bx),
      west = bx < N / 2
    for (const side of sides) {
      const z0 = side === 's' ? Z1 : Z0 - RAMP_W,
        z1 = side === 's' ? Z1 + RAMP_W : Z0
      // west of the river: up on the south (eastbound on), down on the north (westbound off), both
      // with their low end west; east of it the other way round
      const rising = west
      const r = ramp(a, b, z0, z1, 'x', rising ? 0 : DECK_Y, rising ? DECK_Y : 0)
      r.side = side
      r.on = (side === 's') === west
      rampsAt.push(r)
      // (and at its top a merge lane on along the deck's side, so it never ends in the air: closed
      // off at its far end, a barrier down its outside)
      const mx0 = rising ? b : a - MERGE,
        mx1 = rising ? b + MERGE : a
      deck(mx0, mx1, z0, z1, DECK_Y)
      r.merge = [mx0, mx1]
      const out = side === 's' ? z1 : z0
      solid(mx0, mx1, out - 0.2, out + 0.2, DECK_Y - 1, DECK_Y + PARAPET, 'plant', 'barrier')
      const end = rising ? mx1 : mx0
      solid(end - 0.2, end + 0.2, z0, z1, DECK_Y - 1, DECK_Y + PARAPET, 'plant', 'barrier')
      // the barrier between ramp and deck, a step a fifth of the way, up to where the ramp is near
      // the deck's height (the last fifth is open, for the merge)
      const edge = side === 's' ? Z1 : Z0
      for (let i = 0; i < 4; i++) {
        const u0 = rising ? a + ((b - a) * i) / 5 : b - ((b - a) * (i + 1)) / 5,
          u1 = u0 + (b - a) / 5
        const top = Math.min(DECK_Y, (DECK_Y * (i + 1)) / 5 + 1)
        solid(u0, u1, edge - 0.2, edge + 0.2, 0, top, 'plant', 'barrier')
      }
    }
  }
  FWY.ramps = rampsAt
  // the parapets along the deck's sides (cut where a ramp joins), and along the ramps' outer sides
  for (const [edge, side] of [
    [Z0, 'n'],
    [Z1, 's']
  ]) {
    const cuts = rampsAt
      .filter(r => r.side === side)
      .map(r => [Math.min(r.x0, r.merge[0]), Math.max(r.x1, r.merge[1])])
    let from = wx1
    for (const [c0, c1] of [...cuts.sort((p, q) => p[0] - q[0]), [ex0, ex0]]) {
      if (c0 - from > 1) parapet(from, c0, edge, side)
      from = c1
    }
  }
  const ends = RAMPS.filter(r => r.z0 === Z0 && r.z1 === Z1)
  for (const r of [
    ...rampsAt,
    ...ends.map(e => ({ ...e, side: 'n', z0: Z0 })),
    ...ends.map(e => ({ ...e, side: 's', z1: Z1 }))
  ]) {
    const out = r.side === 's' ? r.z1 : r.z0
    for (let i = 0; i < 6; i++) {
      const u0 = r.x0 + ((r.x1 - r.x0) * i) / 6,
        u1 = u0 + (r.x1 - r.x0) / 6
      const mid = r.h0 + ((r.h1 - r.h0) * (i + 0.5)) / 6
      solid(u0, u1, out - 0.2, out + 0.2, 0, mid + PARAPET, 'plant', 'barrier')
    }
  }
  return { DECKS, RAMPS }
}
function parapet (x0, x1, edge, side) {
  const o = side === 'n' ? -0.25 : 0.25
  solid(x0, x1, edge - 0.2 + o, edge + 0.2 + o, DECK_Y - 1, DECK_Y + PARAPET, 'plant', 'barrier')
}
