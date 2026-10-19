// The city: a grid of two-lane-each-way roads around its blocks, the lane graph its traffic drives
// on, the signal plan at every intersection and the solid footprints the Roadster can hit (what is
// built on the blocks is laid out in lots.js, by neighbourhood; what stands along the pavements in
// kerbside.js). Pure data and math (no DOM, no three.js), so traffic and collisions run headless in
// tests.

// the signal plan at every junction is in signals.js
import {
  RED,
  YELLOW,
  GREEN,
  SIGNAL,
  CYCLE,
  signal,
  holdLight,
  releaseLight,
  amberLeft,
  redAge
} from './signals.js'
// the street grid's measurements (grid.js), passed on
import {
  N,
  PITCH,
  LANE_W,
  ROAD_HW,
  WALK,
  CURB_H,
  CURB_R,
  STOP,
  HALF,
  EDGE,
  OUTER,
  ROADS,
  LANE_OFF,
  DIRS,
  SPAWN,
  OLD,
  WILSHIRE,
  SUPERS,
  BLVD_EW,
  BLVD_NS,
  MEDIAN_HW,
  segOpen,
  nodeOpen,
  superOf,
  closedAt,
  rng
} from './grid.js'
// what stands on the blocks (lots.js) and along the pavements (kerbside.js)
import {
  BLOCKS,
  BUILDINGS,
  TREES,
  PALMS,
  STALLS,
  SOLIDS,
  SIGNS
} from './lots.js'
import { LAMPS, WIRES, DECOR } from './kerbside.js'
import { layHighways, curveAt } from './highway.js'
export {
  RED,
  YELLOW,
  GREEN,
  SIGNAL,
  CYCLE,
  signal,
  holdLight,
  releaseLight,
  amberLeft,
  redAge
}
export {
  N,
  PITCH,
  LANE_W,
  ROAD_HW,
  WALK,
  CURB_H,
  CURB_R,
  STOP,
  HALF,
  EDGE,
  OUTER,
  ROADS,
  LANE_OFF,
  DIRS,
  SPAWN,
  OLD,
  WILSHIRE,
  SUPERS,
  BLVD_EW,
  BLVD_NS,
  MEDIAN_HW,
  segOpen,
  nodeOpen,
  superOf,
  closedAt,
  rng,
  BLOCKS,
  BUILDINGS,
  TREES,
  PALMS,
  STALLS,
  SOLIDS,
  SIGNS,
  LAMPS,
  WIRES,
  DECOR
}
const R = rng(20261015)

// ---------- lane graph ----------
export const NODES = [] // intersections
export const EDGES = [] // every lane piece: straight lanes between intersections and turns inside them
export const LANES = [] // just the straight lanes (where traffic spawns)
export const nodeAt = (ix, iz) =>
  ix < 0 || iz < 0 || ix > N || iz > N ? null : NODES[iz * (N + 1) + ix]

// (every edge has every field from the start, lane or turn, so they all share one shape)
function line (x0, z0, dx, dz, len) {
  const e = {
    id: EDGES.length,
    kind: 0,
    x0,
    z0,
    dx,
    dz,
    len,
    vmax: Infinity,
    cars: [],
    next: [],
    feeds: [],
    // a lane: road, its lane, direction, the junctions it runs from and to, the lane beside it
    road: false,
    lane: 0,
    dir: 0,
    from: 0,
    to: 0,
    twin: null,
    closed: false, // (the jammed street: jam.js)
    // the freeway's and the hill road's (highway.js): on it, its speed against a street's; a way off
    // a street lane starting atS along it, or onto one joining it joinS along; a street lane's ways
    // off; a curve's points
    hw: false,
    vk: 1,
    atS: -1,
    joinS: -1,
    exits: [],
    xs: null,
    zs: null,
    cum: null,
    // a turn: the move (S, L or R) and the junction it is in; its arc's centre, radius, sense
    move: null,
    node: 0,
    cx: 0.5,
    cz: 0.5,
    r: 0.5,
    sg: 0,
    a0: 0.5
  }
  EDGES.push(e)
  return e
}
// quarter turn from (px, pz) heading (dx, dz) to (qx, qz); sg +1 turns right, -1 left
function arc (px, pz, dx, dz, qx, qz, sg) {
  const r = Math.abs((qx - px) * dx + (qz - pz) * dz)
  const cx = px - dz * r * sg,
    cz = pz + dx * r * sg
  const e = line(px, pz, dx, dz, (r * Math.PI) / 2)
  Object.assign(e, { kind: 1, cx, cz, r, sg, a0: Math.atan2(pz - cz, px - cx) })
  e.vmax = Math.sqrt(2.6 * r) // gentle lateral acceleration through the corner
  return e
}
// position and unit heading at distance s along an edge
export function pointAt (e, s, out) {
  if (e.kind === 2) return curveAt(e, s, out)
  if (e.kind === 0) {
    out.x = e.x0 + e.dx * s
    out.z = e.z0 + e.dz * s
    out.hx = e.dx
    out.hz = e.dz
  } else {
    const a = e.a0 + (e.sg * s) / e.r,
      c = Math.cos(a),
      sn = Math.sin(a)
    out.x = e.cx + e.r * c
    out.z = e.cz + e.r * sn
    out.hx = -sn * e.sg
    out.hz = c * e.sg
  }
  return out
}

// (the signals' offsets: the first city's junctions draw theirs first, in the order they always
// did, so its signal plan is as it was; then the rest)
const OFFSET = new Map()
for (let iz = 0; iz <= 10; iz++)
  for (let ix = 0; ix <= 10; ix++) OFFSET.set(iz * (N + 1) + ix, R() * CYCLE)
for (let iz = 0; iz <= N; iz++)
  for (let ix = 0; ix <= N; ix++)
    NODES.push({
      i: NODES.length,
      ix,
      iz,
      x: ROADS[ix],
      z: ROADS[iz],
      offset: OFFSET.get(iz * (N + 1) + ix) ?? R() * CYCLE,
      out: [null, null, null, null],
      inc: [null, null, null, null]
    })
for (const a of NODES)
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = DIRS[k],
      b = nodeAt(a.ix + dx, a.iz + dz)
    if (!b) continue
    // (no lanes on a closed street: a superblock's, grid.js)
    if (
      dz === 0
        ? !segOpen(a.iz, Math.min(a.ix, b.ix), false)
        : !segOpen(a.ix, Math.min(a.iz, b.iz), true)
    )
      continue
    a.out[k] = []
    b.inc[k] = []
    for (let l = 0; l < 2; l++) {
      const o = LANE_OFF[l]
      const e = line(
        a.x + dx * STOP - dz * o,
        a.z + dz * STOP + dx * o,
        dx,
        dz,
        PITCH - 2 * STOP
      )
      Object.assign(e, { road: true, lane: l, dir: k, from: a.i, to: b.i })
      a.out[k][l] = e
      b.inc[k][l] = e
      LANES.push(e)
    }
    a.out[k][0].twin = a.out[k][1] // the lane beside it, for lane changes
    a.out[k][1].twin = a.out[k][0]
  }
// Turns keep their lane: the inner lane goes straight or left, the kerb lane straight or right.
// Where neither exists (the city's corners) a lane takes the other turn instead; those arcs share a
// centre with the usual ones, so they never cross them.
for (const n of NODES)
  for (let k = 0; k < 4; k++) {
    if (!n.inc[k]) continue
    for (let l = 0; l < 2; l++) {
      const e = n.inc[k][l],
        ex = e.x0 + e.dx * e.len,
        ez = e.z0 + e.dz * e.len
      const add = (move, k2) => {
        const o = n.out[k2]?.[l]
        if (!o) return
        const c =
          move === 'S'
            ? line(ex, ez, e.dx, e.dz, 2 * STOP)
            : arc(ex, ez, e.dx, e.dz, o.x0, o.z0, move === 'R' ? 1 : -1)
        Object.assign(c, { move, node: n.i, dir: k, lane: l })
        c.next.push(o)
        e.next.push(c)
        o.feeds.push(c) // the turns that lead onto lane o
      }
      add('S', k)
      if (l === 1) add('R', (k + 1) % 4)
      else add('L', (k + 3) % 4)
      if (!e.next.length) {
        if (l === 1) add('L', (k + 3) % 4)
        else add('R', (k + 1) % 4)
      }
    }
  }

// the freeway and the hill road, on the streets' lanes (highway.js)
layHighways(line, nodeAt)

// ---------- signal masts ----------
export const POLES = [] // signal masts: { node, dir, x, z }
// a signal mast on the far-right corner of every approach, its arm reaching back over the lanes
for (const n of NODES)
  for (let k = 0; k < 4; k++) {
    if (!n.inc[k]) continue
    const [dx, dz] = DIRS[k],
      o = ROAD_HW + 2.2
    POLES.push({
      node: n.i,
      dir: k,
      x: n.x + dx * o - dz * o,
      z: n.z + dz * o + dx * o
    })
  }

// ---------- colliders, indexed on a coarse grid ----------
// Boxes: { x0, x1, z0, z1, y0, y1 }; posts are boxes with a radius r (vertical cylinders).
export const COLLIDERS = []
const G0 = -OUTER - PITCH,
  GN = Math.ceil((2 * (OUTER + PITCH)) / PITCH)
const grid = Array.from({ length: GN * GN }, () => [])
const cell = v => Math.max(0, Math.min(GN - 1, Math.floor((v - G0) / PITCH)))
export function addCollider (c) {
  COLLIDERS.push(c)
  for (let j = cell(c.z0); j <= cell(c.z1); j++)
    for (let i = cell(c.x0); i <= cell(c.x1); i++) grid[j * GN + i].push(c)
  return c
}
for (const b of BUILDINGS)
  for (const t of b.tiers) addCollider({ ...t, kind: 'building' })
// hedges, garden walls, canopies, pumps, billboards and their poles (lots.js)
for (const c of SOLIDS) addCollider(c)
// (street lights, palms, trees and signal masts: breakables.js; rooftop plant: roofs.js)
// the promenade: the sidewalk round the outside of the ring road ends here and the beach begins,
// open all the way down to the water (OUTER)
export const PROMENADE = EDGE + 1.5
// Street lights, signals and trees go down when they are hit hard (collider.down); this stands them
// all back up.
export function standUp () {
  for (const c of COLLIDERS) c.down = false
}

let stamp = 0
// Every collider whose footprint overlaps the rectangle [x0, x1] x [z0, z1].
export function query (x0, z0, x1, z1, out = []) {
  out.length = 0
  stamp++
  for (let j = cell(z0); j <= cell(z1); j++)
    for (let i = cell(x0); i <= cell(x1); i++)
      for (const c of grid[j * GN + i])
        if (c.q !== stamp && c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1) {
          c.q = stamp
          out.push(c)
        }
  return out
}

// First hit of the segment a -> b against building boxes, as a fraction of its length (1 if clear).
export function raycast (
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  list = query(
    Math.min(ax, bx),
    Math.min(az, bz),
    Math.max(ax, bx),
    Math.max(az, bz)
  )
) {
  let best = 1
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az
  for (const c of list) {
    if (c.r) continue
    let t0 = 0,
      t1 = best
    for (const [p, d, lo, hi] of [
      [ax, dx, c.x0, c.x1],
      [ay, dy, c.y0, c.y1],
      [az, dz, c.z0, c.z1]
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) t0 = 2
        continue
      }
      let u = (lo - p) / d,
        v = (hi - p) / d
      if (u > v) [u, v] = [v, u]
      t0 = Math.max(t0, u)
      t1 = Math.min(t1, v)
    }
    if (t0 <= t1 && t0 < best) best = t0
  }
  return best
}

// The closest point on any lane to (x, z), facing along it: where a wrecked Roadster is put back.
export function nearestLane (x, z) {
  let best = null,
    bd = Infinity
  for (const e of LANES) {
    if (e.closed) continue // the jammed street (jam.js)
    const s = Math.min(
      e.len - 6,
      Math.max(6, (x - e.x0) * e.dx + (z - e.z0) * e.dz)
    )
    const px = e.x0 + e.dx * s,
      pz = e.z0 + e.dz * s,
      d = (px - x) ** 2 + (pz - z) ** 2
    if (d < bd) {
      bd = d
      best = { x: px, z: pz, yaw: Math.atan2(-e.dz, e.dx) }
    }
  }
  return best
}

// whether a point is on the street grid's asphalt (not a superblock's closed streets)
export function onRoad (x, z) {
  const near = v => {
    const k = Math.round(v / PITCH + N / 2)
    return k >= 0 && k <= N && Math.abs(v - ROADS[k]) < ROAD_HW
  }
  return (
    Math.abs(x) <= HALF + ROAD_HW &&
    Math.abs(z) <= HALF + ROAD_HW &&
    (near(x) || near(z)) &&
    !closedAt(x, z)
  )
}
