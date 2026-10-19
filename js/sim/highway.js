// The freeway and the hill road in the traffic's lane graph (city.js lays the streets; this lays
// these on top, with the same edges). The edges here are marked hw: their cars stand on whatever
// is under them (world.js groundHeight: the deck, the ramps, the hill road, the tunnel, the bridge),
// keep their own speed (vk: a freeway is driven at about twice a street's), and go where the edge
// leads (a single way on, mostly). Curves are cubic Béziers (kind 2): a ramp's turn off a street and
// back onto one, the merges and the diverges, the hill road's corners and the turn at the lookout.
// Off a street: a street lane's exits, each a curve starting atS m along it (traffic.js choose takes
// one now and then); back onto one: a curve ending joinS m along the street lane it joins.
import { N, ROADS, STOP } from './grid.js'
import { FWY, FWY_FROM, FWY_TO, DECK_HW } from './freeway.js'
import { HILL_ROAD, HILL_HW } from './hillroad.js'

export const HW = [] // the hw edges cars can be put on straight away (traffic.js spawn): long ones
export const EXITS = [] // the street lanes with a way off onto them
const SAMPLES = 24
const FWY_K = 2 // a freeway's speed against a street's
const RAMP_K = 1.4
const HILL_K = 0.85
const LANE3 = 3.6 // the deck's lanes
const RAMP_C = DECK_HW + 3.75 // the side ramps' middle line, off the freeway's
const MERGE = 36

// A cubic from (x0, z0) to (x1, z1) leaving along (h0x, h0z) and arriving along (h1x, h1z), k m of
// handle each end: an edge of kind 2, its points sampled by length (city.js pointAt)
function curve (line, x0, z0, h0x, h0z, x1, z1, h1x, h1z, k) {
  const px = [x0, x0 + h0x * k, x1 - h1x * k, x1],
    pz = [z0, z0 + h0z * k, z1 - h1z * k, z1]
  const xs = new Float64Array(SAMPLES + 1),
    zs = new Float64Array(SAMPLES + 1),
    cum = new Float64Array(SAMPLES + 1)
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES,
      u = 1 - t
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t
    xs[i] = a * px[0] + b * px[1] + c * px[2] + d * px[3]
    zs[i] = a * pz[0] + b * pz[1] + c * pz[2] + d * pz[3]
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])
  }
  const len = cum[SAMPLES]
  const e = line(x0, z0, (x1 - x0) / (Math.hypot(x1 - x0, z1 - z0) || 1), (z1 - z0) / (Math.hypot(x1 - x0, z1 - z0) || 1), len)
  // (the tightest bend along it, for the speed it is taken at)
  let r = Infinity
  for (let i = 1; i < SAMPLES; i++) {
    const ax = xs[i] - xs[i - 1], az = zs[i] - zs[i - 1],
      bx = xs[i + 1] - xs[i], bz = zs[i + 1] - zs[i]
    const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz))
    if (turn > 1e-4) r = Math.min(r, ((cum[i + 1] - cum[i - 1]) / 2) / turn)
  }
  Object.assign(e, { kind: 2, xs, zs, cum, r: Math.max(2, r), cp: [...px, ...pz] })
  e.vmax = Math.sqrt(2.6 * e.r)
  return e
}
// position and heading at s along a curve (city.js pointAt)
export function curveAt (e, s, out) {
  const c = e.cum
  let i = Math.min(SAMPLES - 1, Math.max(0, Math.floor((s / e.len) * SAMPLES)))
  while (i > 0 && c[i] > s) i--
  while (i < SAMPLES - 1 && c[i + 1] < s) i++
  const l = c[i + 1] - c[i] || 1,
    u = Math.max(0, Math.min(1, (s - c[i]) / l))
  // (the parameter there, by the table, and the point and the true tangent of the cubic at it)
  const t = (i + u) / SAMPLES,
    w = 1 - t,
    p = e.cp
  out.x = w * w * w * p[0] + 3 * w * w * t * p[1] + 3 * w * t * t * p[2] + t * t * t * p[3]
  out.z = w * w * w * p[4] + 3 * w * w * t * p[5] + 3 * w * t * t * p[6] + t * t * t * p[7]
  const dx = 3 * (w * w * (p[1] - p[0]) + 2 * w * t * (p[2] - p[1]) + t * t * (p[3] - p[2])),
    dz = 3 * (w * w * (p[5] - p[4]) + 2 * w * t * (p[6] - p[5]) + t * t * (p[7] - p[6]))
  const d = Math.hypot(dx, dz) || 1
  out.hx = dx / d
  out.hz = dz / d
  return out
}

const link = (a, b) => {
  a.next.push(b)
  b.feeds.push(a)
  return b
}
const mark = (e, vk) => Object.assign(e, { hw: true, vk, lane: 1 })
// a straight hw edge from (x0, z0) to (x1, z1)
function seg (line, x0, z0, x1, z1, vk) {
  const l = Math.hypot(x1 - x0, z1 - z0)
  return mark(line(x0, z0, (x1 - x0) / l, (z1 - z0) / l, l), vk)
}
// where along street lane L the point (x, z) is
const along = (L, x, z) => (x - L.x0) * L.dx + (z - L.z0) * L.dz

// a way off street lane L onto (x, z) heading (hx, hz): a curve from the point on L as far back
// from there as it is off to the side
function exitTo (line, L, x, z, hx, hz) {
  const side = Math.abs((x - L.x0) * -L.dz + (z - L.z0) * L.dx) // (off L's line)
  const s = along(L, x, z) - side
  if (!(s > 4 && s < L.len - 4)) return null
  const e = mark(curve(line, L.x0 + L.dx * s, L.z0 + L.dz * s, L.dx, L.dz, x, z, hx, hz, side * 0.55), 1)
  e.atS = s
  e.dir = L.dir
  L.exits.push(e)
  if (!EXITS.includes(L)) EXITS.push(L)
  return e
}
// a way from (x, z) heading (hx, hz) onto street lane L, joining it as far on as it is off to the side
function joinTo (line, L, x, z, hx, hz) {
  const side = Math.abs((x - L.x0) * -L.dz + (z - L.z0) * L.dx)
  const s = along(L, x, z) + side
  if (!(s > 4 && s < L.len - 12)) return null
  const e = mark(curve(line, x, z, hx, hz, L.x0 + L.dx * s, L.z0 + L.dz * s, L.dx, L.dz, side * 0.55), 1)
  e.joinS = s
  e.next.push(L)
  return e
}
// a chain of edges, each onto the next
function chain (list) {
  for (let i = 1; i < list.length; i++) link(list[i - 1], list[i])
  return list
}

// ---------- the freeway ----------
function freeway (line, nodeAt) {
  const z = FWY.z
  const lane = (side, j) => z + side * (2.2 + LANE3 * j) // (side +1: eastbound, south of the middle)
  const north = (ix, iz) => nodeAt(ix, iz)?.out[3]?.[1] // the kerb lane northbound from row iz
  const south = (ix, iz) => nodeAt(ix, iz)?.out[1]?.[1]
  const r10 = 10 // (the freeway's row of blocks: between streets 10 and 11)
  const ends = { w: FWY.x0, e: FWY.x1 }
  // the through lanes, end to end: eastbound up from street FWY_FROM, down onto the ring road
  {
    const z1 = lane(1, 1),
      up = north(FWY_FROM, r10 + 1),
      down = south(N, r10)
    const on = up && exitTo(line, up, ends.w, z1, 1, 0)
    const off = down && joinTo(line, down, ends.e, z1, 1, 0)
    if (on && off) HW.push(chain([on, seg(line, ends.w, z1, ends.e, z1, FWY_K), off])[1])
    else if (on) up.exits.pop()
  }
  {
    const z1 = lane(-1, 1),
      up = south(N, r10),
      down = north(FWY_FROM, r10 + 1)
    const on = up && exitTo(line, up, ends.e, z1, -1, 0)
    const off = down && joinTo(line, down, ends.w, z1, -1, 0)
    if (on && off) HW.push(chain([on, seg(line, ends.e, z1, ends.w, z1, FWY_K), off])[1])
    else if (on) up.exits.pop()
  }
  // the outer lanes, on at one side ramp and off at the next
  const west = FWY.ramps.filter(r => r.x1 < 0),
    east = FWY.ramps.filter(r => r.x0 > 0)
  const rampOf = (list, side) => list.find(r => r.side === side)
  // eastbound: on up the south ramp west of the river, off down the south ramp east of it
  {
    const a = rampOf(west, 's'),
      b = rampOf(east, 's')
    if (a && b) {
      const bxA = ROADS.findIndex((v, i) => v < a.x0 && ROADS[i + 1] > a.x0),
        bxB = ROADS.findIndex((v, i) => v < b.x0 && ROADS[i + 1] > b.x0)
      const zr = z + RAMP_C,
        zo = lane(1, 2)
      const src = north(bxA, r10 + 1),
        dst = south(bxB + 1, r10)
      const on = src && exitTo(line, src, a.x0, zr, 1, 0)
      const off = dst && joinTo(line, dst, b.x1, zr, 1, 0)
      if (on && off) {
        const list = chain([
          on,
          seg(line, a.x0, zr, a.x1, zr, RAMP_K),
          mark(curve(line, a.x1, zr, 1, 0, a.x1 + MERGE, zo, 1, 0, 14), RAMP_K),
          seg(line, a.x1 + MERGE, zo, b.x0 - MERGE, zo, FWY_K),
          mark(curve(line, b.x0 - MERGE, zo, 1, 0, b.x0, zr, 1, 0, 14), RAMP_K),
          seg(line, b.x0, zr, b.x1, zr, RAMP_K),
          off
        ])
        HW.push(list[3])
      } else if (on) src.exits.pop()
    }
  }
  // westbound: on up the north ramp east of the river, off down the north ramp west of it
  {
    const a = rampOf(east, 'n'),
      b = rampOf(west, 'n')
    if (a && b) {
      const bxA = ROADS.findIndex((v, i) => v < a.x0 && ROADS[i + 1] > a.x0),
        bxB = ROADS.findIndex((v, i) => v < b.x0 && ROADS[i + 1] > b.x0)
      const zr = z - RAMP_C,
        zo = lane(-1, 2)
      const src = south(bxA + 1, r10),
        dst = north(bxB, r10 + 1)
      const on = src && exitTo(line, src, a.x1, zr, -1, 0)
      const off = dst && joinTo(line, dst, b.x0, zr, -1, 0)
      if (on && off) {
        const list = chain([
          on,
          seg(line, a.x1, zr, a.x0, zr, RAMP_K),
          mark(curve(line, a.x0, zr, -1, 0, a.x0 - MERGE, zo, -1, 0, 14), RAMP_K),
          seg(line, a.x0 - MERGE, zo, b.x1 + MERGE, zo, FWY_K),
          mark(curve(line, b.x1 + MERGE, zo, -1, 0, b.x1, zr, -1, 0, 14), RAMP_K),
          seg(line, b.x1, zr, b.x0, zr, RAMP_K),
          off
        ])
        HW.push(list[3])
      } else if (on) src.exits.pop()
    }
  }
}

// ---------- the hill road ----------
// the hill road's lane one way along its line (pts: its corners, in order), HILL_HW / 2 right of
// it, each corner rounded off by a curve
function hillLane (line, pts) {
  const o = HILL_HW / 2,
    edges = []
  const off = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i],
      [x1, z1] = pts[i + 1]
    const l = Math.hypot(x1 - x0, z1 - z0),
      dx = (x1 - x0) / l,
      dz = (z1 - z0) / l
    off.push({ x0: x0 - dz * o, z0: z0 + dx * o, x1: x1 - dz * o, z1: z1 + dx * o, dx, dz, l })
  }
  // (consecutive pieces meet at a corner: each trimmed back from it and joined by a curve)
  const T = 9
  let sx = off[0].x0,
    sz = off[0].z0
  for (let i = 0; i < off.length; i++) {
    const p = off[i],
      q = off[i + 1]
    // the corner where p's line meets q's
    let ex = p.x1,
      ez = p.z1
    if (q) {
      const den = p.dx * q.dz - p.dz * q.dx
      if (Math.abs(den) > 1e-6) {
        const t = ((q.x0 - p.x0) * q.dz - (q.z0 - p.z0) * q.dx) / den
        ex = p.x0 + p.dx * t
        ez = p.z0 + p.dz * t
      }
    }
    const trim = q ? Math.min(T, Math.hypot(ex - sx, ez - sz) / 2.2) : 0
    let fx = ex - p.dx * trim,
      fz = ez - p.dz * trim
    if (Math.hypot(fx - sx, fz - sz) > 0.5) edges.push(seg(line, sx, sz, fx, fz, HILL_K))
    else (fx = sx), (fz = sz) // (too short a piece between two corners: the curves meet)
    if (q) {
      const t2 = Math.min(T, trim)
      const nx = ex + q.dx * t2,
        nz = ez + q.dz * t2
      edges.push(mark(curve(line, fx, fz, p.dx, p.dz, nx, nz, q.dx, q.dz, trim * 0.55), HILL_K))
      sx = nx
      sz = nz
    }
  }
  return edges
}
function hillRoad (line, nodeAt) {
  if (!HILL_ROAD.length) return
  const n = nodeAt(ROADS.indexOf(HILL_ROAD[0].x0), 0)
  if (!n) return
  // its corners from the stop line at the ring road up to the far end of the bridge
  const z0 = n.z - STOP
  const pts = [[HILL_ROAD[0].x0, z0], ...HILL_ROAD.map(s => [s.x1, s.z1])]
  const up = hillLane(line, pts)
  const down = hillLane(line, pts.slice().reverse())
  // the turn at the lookout: out round it from the up lane's end to the down lane's start
  const ue = up[up.length - 1],
    ds = down[0]
  const ux = ue.x0 + ue.dx * ue.len,
    uz = ue.z0 + ue.dz * ue.len
  const turn = mark(curve(line, ux, uz, ue.dx, ue.dz, ds.x0, ds.z0, ds.dx, ds.dz, 24), 0.5)
  chain([...up, turn, ...down])
  HW.push(up[3], down[down.length - 4])
  // the last piece down is a street lane into the junction, at its lights (dir 1: southbound)
  const last = down[down.length - 1]
  Object.assign(last, { road: true, dir: 1, from: n.i, to: n.i })
  const lx = last.x0 + last.dx * last.len,
    lz = last.z0 + last.dz * last.len
  // out of the junction from it: straight on, left, right (each a curve, a turn in the junction)
  const outs = [
    ['S', n.out[1]?.[1], 1],
    ['L', n.out[0]?.[0], 1],
    ['R', n.out[2]?.[1], 1]
  ]
  for (const [move, o] of outs) {
    if (!o) continue
    const c = mark(curve(line, lx, lz, 0, 1, o.x0, o.z0, o.dx, o.dz, move === 'S' ? 6 : 8), 1)
    Object.assign(c, { move, node: n.i, dir: 1, lane: 1 })
    c.next.push(o) // (not among o's feeds: those are the grid's turns, route.js)
    last.next.push(c)
  }
  // into it: from the lane coming up from the south (straight on), from the east-bound (left) and
  // the west-bound (right), at their lines, through the junction
  const ins = [
    ['S', n.inc[3]?.[1], 3],
    ['S', n.inc[3]?.[0], 3],
    ['L', n.inc[0]?.[0], 0],
    ['R', n.inc[2]?.[1], 2]
  ]
  const u0 = up[0]
  for (const [move, L, dir] of ins) {
    if (!L) continue
    const c = mark(curve(line, L.x0 + L.dx * L.len, L.z0 + L.dz * L.len, L.dx, L.dz, u0.x0, u0.z0, u0.dx, u0.dz, move === 'S' ? 6 : 8), 1)
    Object.assign(c, { move, node: n.i, dir, lane: L.lane, atS: L.len })
    link(c, u0)
    L.exits.push(c)
    if (!EXITS.includes(L)) EXITS.push(L)
  }
}

export function layHighways (line, nodeAt) {
  freeway(line, nodeAt)
  hillRoad(line, nodeAt)
}
