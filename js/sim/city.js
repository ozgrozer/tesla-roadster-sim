// The city: a grid of two-lane-each-way roads around downtown blocks, the lane graph its traffic
// drives on, the signal plan at every intersection and the solid footprints the Roadster can hit.
// Pure data and math (no DOM, no three.js), so traffic and collisions run headless in tests.

export const N = 10 // blocks across
export const PITCH = 96 // m between road centre lines
export const LANE_W = 3.5
export const ROAD_HW = 2 * LANE_W // asphalt half-width: two lanes each way
export const WALK = 4 // sidewalk width
export const CURB_H = 0.08
export const CURB_R = 4 // rounded kerb at every corner
export const STOP = 11 // stop line, measured from an intersection's centre
export const HALF = (N / 2) * PITCH // centre line of the outer ring road
export const EDGE = HALF + ROAD_HW + WALK // outside of the ring road's sidewalk
export const OUTER = EDGE + 60 // the open ground ends here
export const ROADS = Array.from(
  { length: N + 1 },
  (_, i) => (i - N / 2) * PITCH
)
export const LANE_OFF = [LANE_W / 2, LANE_W * 1.5] // inner (left) and outer (right) lane
// travel directions as (x, z): east, south, west, north. Right of dir k is dir k + 1.
export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1]
]
// on the central avenue, eastbound in the kerb lane, with the downtown skyline ahead
export const SPAWN = { x: ROADS[1] - 40, z: LANE_OFF[1], yaw: 0 }

// small seeded generator, so the city is the same on every load and in tests
export function rng (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const R = rng(20261015)
const pick = arr => arr[Math.floor(R() * arr.length)]

// ---------- signals: east-west, then north-south, with an all-red gap between ----------
// Left turns go on the same green and give way to oncoming traffic.
export const RED = 0
export const YELLOW = 1
export const GREEN = 2
export const SIGNAL = { green: 13, yellow: 3, clear: 1.2 }
export const CYCLE = 2 * (SIGNAL.green + SIGNAL.yellow + SIGNAL.clear)
// State of the light for traffic travelling `dir` into `node` at time t.
export function signal (node, dir, t) {
  let u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  const axis = u < CYCLE / 2 ? 0 : 1 // 0 east-west, 1 north-south
  if ((dir & 1) !== axis) return RED
  u -= (axis * CYCLE) / 2
  return u < SIGNAL.green
    ? GREEN
    : u < SIGNAL.green + SIGNAL.yellow
    ? YELLOW
    : RED
}

// ---------- lane graph ----------
export const NODES = [] // intersections
export const EDGES = [] // every lane piece: straight lanes between intersections and turns inside them
export const LANES = [] // just the straight lanes (where traffic spawns)
export const nodeAt = (ix, iz) =>
  ix < 0 || iz < 0 || ix > N || iz > N ? null : NODES[iz * (N + 1) + ix]

function line (x0, z0, dx, dz, len) {
  const e = { id: EDGES.length, kind: 0, x0, z0, dx, dz, len, vmax: Infinity }
  e.cars = []
  e.next = []
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

for (let iz = 0; iz <= N; iz++)
  for (let ix = 0; ix <= N; ix++)
    NODES.push({
      i: NODES.length,
      ix,
      iz,
      x: ROADS[ix],
      z: ROADS[iz],
      offset: R() * CYCLE,
      out: [null, null, null, null],
      inc: [null, null, null, null]
    })
for (const a of NODES)
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = DIRS[k],
      b = nodeAt(a.ix + dx, a.iz + dz)
    if (!b) continue
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

// ---------- blocks and buildings ----------
// distance from downtown in blocks: 0.5 for the four central blocks, up to 4.5 at the edge
const ringOf = (bx, bz) =>
  Math.max(Math.abs(bx - (N - 1) / 2), Math.abs(bz - (N - 1) / 2))
const PARKS = new Set(['6,3', '2,7'])
const PARKING = new Set(['7,7', '1,2'])
const TINTS = {
  glass: [0x8fb8d0, 0x7a9fc0, 0x9cc4bf, 0xc4ab88, 0x8796ad, 0xa3b8c9],
  office: [0xe8e2d6, 0xd6d1c8, 0xcdd2d6, 0xe3d6c0, 0xbfc4c9],
  brick: [0xf2ece6, 0xe6d6ca, 0xd6cbc4, 0xc9c0bb],
  stucco: [0xf3e3c8, 0xf2cdb5, 0xd8e6cf, 0xf0d5cf, 0xe9e0c2, 0xcfe1e6]
}
const BASE_H = [175, 95, 48, 24, 14] // typical height by ring, m

export const BLOCKS = []
export const BUILDINGS = []
export const TREES = [] // round park trees: { x, z, s }
export const PALMS = [] // { x, z, h }
export const LAMPS = [] // street lights: { x, z, ax, az } with the arm pointing (ax, az) over the road
export const POLES = [] // signal masts: { node, dir, x, z }
export const STALLS = [] // parking spaces: { x, z, yaw, taken }

function splits (a, b, n) {
  const out = [a]
  for (let i = 1; i < n; i++) {
    const f = i / n + (R() - 0.5) * (0.18 / n)
    out.push(a + (b - a) * f)
  }
  out.push(b)
  return out
}
function addBuilding (x0, x1, z0, z1, d) {
  const h = Math.max(7, BASE_H[Math.min(4, Math.floor(d))] * (0.55 + R() * 0.9))
  const style =
    d < 1
      ? R() < 0.7
        ? 'glass'
        : 'office'
      : d < 2
      ? pick(['glass', 'glass', 'office', 'office', 'brick'])
      : d < 3
      ? pick(['office', 'office', 'brick', 'stucco', 'stucco', 'glass'])
      : pick(['stucco', 'stucco', 'stucco', 'brick', 'office'])
  const b = {
    x0,
    x1,
    z0,
    z1,
    h,
    style,
    tint: pick(TINTS[style]),
    u: R(), // texture offset, so neighbours don't share a window pattern
    shop: style !== 'glass' && d > 0.5 && R() < 0.75,
    antenna: h > 130 && R() < 0.6,
    tiers: []
  }
  // setbacks: taller buildings step in as they rise
  const nt = h > 140 ? 3 : h > 55 && R() < 0.6 ? 2 : 1
  let y = 0,
    ins = 0
  for (let t = 0; t < nt; t++) {
    const top =
      t === nt - 1 ? h : y + (h - y) * (t === 0 ? 0.5 + R() * 0.2 : 0.6)
    const w = Math.min(x1 - x0, z1 - z0) / 2 - ins
    if (t > 0 && w < 5) break
    b.tiers.push({
      x0: x0 + ins,
      x1: x1 - ins,
      z0: z0 + ins,
      z1: z1 - ins,
      y0: y,
      y1: top
    })
    y = top
    ins += 2 + R() * 3.5
  }
  b.h = b.tiers[b.tiers.length - 1].y1
  BUILDINGS.push(b)
  return b
}

for (let bz = 0; bz < N; bz++)
  for (let bx = 0; bx < N; bx++) {
    const key = `${bx},${bz}`,
      d = ringOf(bx, bz)
    const blk = {
      bx,
      bz,
      x0: ROADS[bx] + ROAD_HW,
      x1: ROADS[bx + 1] - ROAD_HW,
      z0: ROADS[bz] + ROAD_HW,
      z1: ROADS[bz + 1] - ROAD_HW,
      kind: PARKS.has(key) ? 'park' : PARKING.has(key) ? 'parking' : 'city'
    }
    BLOCKS.push(blk)
    const lx0 = blk.x0 + WALK,
      lx1 = blk.x1 - WALK,
      lz0 = blk.z0 + WALK,
      lz1 = blk.z1 - WALK
    if (blk.kind === 'park') {
      for (let i = 0; i < 46; i++) {
        const x = lx0 + 3 + R() * (lx1 - lx0 - 6),
          z = lz0 + 3 + R() * (lz1 - lz0 - 6)
        // keep the crossing footpaths clear
        if (
          Math.abs(x - (lx0 + lx1) / 2) < 3 ||
          Math.abs(z - (lz0 + lz1) / 2) < 3
        )
          continue
        TREES.push({ x, z, s: 0.8 + R() * 0.6 })
      }
      continue
    }
    if (blk.kind === 'parking') {
      // rows of nose-in stalls either side of three aisles
      for (let row = 0; row < 4; row++) {
        const z = lz0 + 6 + row * 17.5
        for (let x = lx0 + 3; x < lx1 - 2; x += 2.7)
          for (const side of [-1, 1])
            STALLS.push({
              x: x + 1.35,
              z: z + side * 2.7,
              yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2, // nose in, towards the row's centre line
              taken: R() < 0.62
            })
      }
      continue
    }
    // downtown blocks sometimes hold one landmark tower on a plaza
    if (d < 1 && R() < 0.4) {
      addBuilding(lx0 + 9, lx1 - 9, lz0 + 9, lz1 - 9, 0)
      continue
    }
    const n = d < 1 ? 2 : d < 3 ? 2 + (R() < 0.5 ? 1 : 0) : 3
    const xs = splits(lx0, lx1, n),
      zs = splits(lz0, lz1, n)
    const gap = d < 1 ? 1.5 : 2 + R() * 3 // alleys between buildings
    const set = d < 2 ? 0.4 : 1 + R() * 3 // setback from the sidewalk
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (d > 3 && R() < 0.12) continue // an empty lot now and then
        addBuilding(
          xs[i] + (i ? gap / 2 : set),
          xs[i + 1] - (i < n - 1 ? gap / 2 : set),
          zs[j] + (j ? gap / 2 : set),
          zs[j + 1] - (j < n - 1 ? gap / 2 : set),
          d
        )
      }
  }

// street furniture along every sidewalk: lights every 24 m, palms on the boulevards
const BOULEVARD = new Set([0, N / 2, N]) // the two central avenues and the ring road
for (let i = 0; i <= N; i++)
  for (let j = 0; j < N; j++) {
    const c = ROADS[i],
      a = ROADS[j] + STOP + 3,
      b = ROADS[j + 1] - STOP - 3
    for (const side of [-1, 1]) {
      const off = c + side * (ROAD_HW + 0.6)
      for (let t = a + 4, k = 0; t < b; t += 24, k++) {
        // roads along z at x = c (index i) and along x at z = c
        LAMPS.push({ x: off, z: t, ax: -side, az: 0 })
        LAMPS.push({ x: t, z: off, ax: 0, az: -side })
        if (BOULEVARD.has(i) && t + 12 < b) {
          const po = c + side * (ROAD_HW + 1.6)
          PALMS.push({ x: po, z: t + 12, h: 9 + R() * 5 })
          PALMS.push({ x: t + 12, z: po, h: 9 + R() * 5 })
        }
      }
    }
  }
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
function addCollider (c) {
  COLLIDERS.push(c)
  for (let j = cell(c.z0); j <= cell(c.z1); j++)
    for (let i = cell(c.x0); i <= cell(c.x1); i++) grid[j * GN + i].push(c)
  return c
}
const post = (x, z, r, h, kind) =>
  addCollider({
    x0: x - r,
    x1: x + r,
    z0: z - r,
    z1: z + r,
    y0: 0,
    y1: h,
    x,
    z,
    r,
    kind
  })
for (const b of BUILDINGS)
  for (const t of b.tiers) addCollider({ ...t, kind: 'building' })
LAMPS.forEach((l, i) => (post(l.x, l.z, 0.16, 8, 'lamp').i = i))
for (const p of PALMS) post(p.x, p.z, 0.28, p.h, 'palm')
for (const t of TREES) post(t.x, t.z, 0.3, 6, 'tree')
for (const p of POLES) post(p.x, p.z, 0.2, 7, 'signal')
// a low concrete barrier round the outside of the ring road, and the end of the open ground
const BW = EDGE + 1.5
for (const [x0, x1, z0, z1] of [
  [-BW - 0.8, BW + 0.8, -BW - 0.8, -BW],
  [-BW - 0.8, BW + 0.8, BW, BW + 0.8],
  [-BW - 0.8, -BW, -BW, BW],
  [BW, BW + 0.8, -BW, BW]
])
  addCollider({ x0, x1, z0, z1, y0: 0, y1: 1.1, kind: 'barrier' })
export const BARRIER = BW
// Street lights go down when the Roadster hits them (collider.down); this stands them all back up.
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

// whether a point is on the street grid's asphalt
export function onRoad (x, z) {
  const near = v => {
    const k = Math.round(v / PITCH + N / 2)
    return k >= 0 && k <= N && Math.abs(v - ROADS[k]) < ROAD_HW
  }
  return (
    Math.abs(x) <= HALF + ROAD_HW &&
    Math.abs(z) <= HALF + ROAD_HW &&
    (near(x) || near(z))
  )
}
