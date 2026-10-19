// The pavements people walk (peds.js): each block's ring of pavement at a given distance in from
// the kerb, the point and heading at any distance round it, the crossings from each corner, and
// when the walk is on at a junction. People walk three lines round each block: one between the
// street lights and the palms, and two further in, past the benches, under the shops' canopies.
import { clamp } from './constants.js'
import {
  N,
  HALF,
  PITCH,
  CYCLE,
  BLOCKS,
  CURB_R,
  ROAD_HW,
  nodeAt,
  superOf
} from './city.js'

const CROSS_AT = 9.1 // the crosswalk's middle, from the junction's centre (cityGround.js)
const KERB = ROAD_HW + 0.5 // where people wait and step off, from the road's centre line
const WALK_FOR = 4 // s into the cross street's green during which people start over

// the lines people walk, m in from the kerb: clear of the street lights (0.6 m in), the palms (1.6)
// and the signal masts (2.2); the inner two past the benches (to 2.45 m) as well
export const LINES = [1.05, 2.75, 3.15]
// each block's ring at each line, made once
const RINGS = new Map()
export function ringOf (b, k) {
  let r = RINGS.get(b)
  if (!r) RINGS.set(b, (r = LINES.map(d => ring(b, d))))
  return r[k]
}
// The same place as s on ring g, on ring h of the same block: every ring's straights start and end
// level with each other (their corners' arcs share a centre), so a straight's distance carries
// over and a corner's angle does.
export function sameOn (g, s, h) {
  let u = ((s % g.len) + g.len) % g.len,
    k = 0
  while (k < 7 && u > g.runs[k]) u -= g.runs[k++]
  if (k % 2) u *= h.r / g.r
  for (let i = 0; i < k; i++) u += h.runs[i]
  return u
}

// A block's pavement ring at d in from the kerb: a rounded rectangle, its corners' radius and the
// straight runs between them. Laid out from one end of its top edge, round the four corners (0: the
// corner at x1, z0, then x1 z1, x0 z1 and x0 z0).
export function ring (b, d) {
  const r = Math.max(0.6, CURB_R - d),
    x0 = b.x0 + d,
    x1 = b.x1 - d,
    z0 = b.z0 + d,
    z1 = b.z1 - d
  const w = x1 - x0 - 2 * r,
    h = z1 - z0 - 2 * r,
    arc = (Math.PI / 2) * r
  return {
    b,
    r,
    d,
    len: 2 * (w + h) + 4 * arc,
    runs: [w, arc, h, arc, w, arc, h, arc],
    // each straight's start and direction, each corner's centre and starting angle
    edges: [
      [x0 + r, z0, 1, 0],
      [x1, z0 + r, 0, 1],
      [x1 - r, z1, -1, 0],
      [x0, z1 - r, 0, -1]
    ],
    arcs: [
      [x1 - r, z0 + r, -Math.PI / 2],
      [x1 - r, z1 - r, 0],
      [x0 + r, z1 - r, Math.PI / 2],
      [x0 + r, z0 + r, Math.PI]
    ]
  }
}
// the point s along a ring, its heading, and which piece of it that is (odd: a corner)
export function ringAt (R, s, out) {
  let u = ((s % R.len) + R.len) % R.len,
    k = 0
  while (k < 7 && u > R.runs[k]) u -= R.runs[k++]
  out.piece = k
  if (k % 2 === 0) {
    const [sx, sz, dx, dz] = R.edges[k / 2]
    out.x = sx + dx * u
    out.z = sz + dz * u
    out.hx = dx
    out.hz = dz
  } else {
    const [cx, cz, a0] = R.arcs[(k - 1) / 2],
      a = a0 + u / R.r
    out.x = cx + R.r * Math.cos(a)
    out.z = cz + R.r * Math.sin(a)
    out.hx = -Math.sin(a)
    out.hz = Math.cos(a)
  }
  return out
}
// the s on a ring nearest (x, z), by stepping round it (a metre at a time, then refining)
export function nearestOn (R, x, z) {
  const P = {}
  let best = 0,
    bd = Infinity
  for (let s = 0; s < R.len; s += 1) {
    ringAt(R, s, P)
    const d = (P.x - x) ** 2 + (P.z - z) ** 2
    if (d < bd) {
      bd = d
      best = s
    }
  }
  for (let s = best - 1; s < best + 1; s += 0.1) {
    ringAt(R, s, P)
    const d = (P.x - x) ** 2 + (P.z - z) ** 2
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}
// the block (x, z) is on or nearest, by the grid
export function blockNear (x, z) {
  const bx = clamp(Math.floor((x + HALF) / PITCH), 0, N - 1),
    bz = clamp(Math.floor((z + HALF) / PITCH), 0, N - 1)
  return BLOCKS[bz * N + bx]
}
// Is it time to walk across the street at node that runs along axis (0 east-west, 1 north-south)?
// Its traffic has red, and the cross street's green is in its first few seconds. While the light
// is held green one way for Autopilot, over the street it holds at red, a few seconds at a time
// (so that people still get over, and turning cars still get gaps to go between them).
export function walkOn (node, axis, t) {
  const h = node.hold
  if (h) {
    const on = t - h.t0 - h.wait
    return axis !== h.axis && on >= 0 && on % (CYCLE / 2) < WALK_FOR
  }
  const u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  const into = u - ((axis ^ 1) * CYCLE) / 2
  return into >= 0 && into < WALK_FOR
}
// Where someone waits to cross c from (x, z), a point on their line along the stripes: moved back
// from the kerb's rounded corner until they stand on the pavement (kerbDist <= -BACK), not on its
// edge, where turning cars would take them for someone in the road.
const BACK = 0.6
export function standBack (c, x, z) {
  const n = c.node,
    ax = c.axis === 1 // (over a street along z: walked in x)
  if (!n) return [x, z] // (over mid-block, jaywalking)
  const a = ax ? x - n.x : z - n.z, // across, from the junction's middle
    u = Math.abs(ax ? z - n.z : x - n.x) // and along the street
  const cz = Math.max(0, CURB_R - (u - ROAD_HW)),
    r = CURB_R - BACK
  const need = ROAD_HW + CURB_R - Math.sqrt(Math.max(0, r * r - cz * cz))
  if (Math.abs(a) >= need) return [x, z]
  const out = (a < 0 ? -1 : 1) * need
  return ax ? [n.x + out, z] : [x, n.z + out]
}
// The two crossings from a block's corner k (as ringAt numbers them): for each, the way over (from,
// to), the street's axis, the junction and the block on the other side.
export function crossings (b, k) {
  const corner = [
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
    [b.x0, b.z0]
  ][k]
  const ix = b.bx + (corner[0] === b.x1 ? 1 : 0),
    iz = b.bz + (corner[1] === b.z1 ? 1 : 0)
  const node = nodeAt(ix, iz)
  const qx = corner[0] === b.x0 ? 1 : -1, // the block's side of the junction
    qz = corner[1] === b.z0 ? 1 : -1
  const out = []
  const tx = b.bx - qx,
    tz = b.bz - qz
  // (never into a superblock, the stadium's or the container yard's: its blocks' pavements run
  // through the bowl and the stacks where the streets between them were paved over, grid.js)
  if (superOf(b.bx, b.bz)) return out
  // over the street that runs along z, on the block's side of the junction
  if (tx >= 0 && tx < N && !superOf(tx, b.bz))
    out.push({
      node,
      axis: 1,
      from: [node.x + qx * KERB, node.z + qz * CROSS_AT],
      to: [node.x - qx * KERB, node.z + qz * CROSS_AT],
      block: BLOCKS[b.bz * N + tx]
    })
  // and over the one along x
  if (tz >= 0 && tz < N && !superOf(b.bx, tz))
    out.push({
      node,
      axis: 0,
      from: [node.x + qx * CROSS_AT, node.z + qz * KERB],
      to: [node.x + qx * CROSS_AT, node.z - qz * KERB],
      block: BLOCKS[tz * N + b.bx]
    })
  return out
}
