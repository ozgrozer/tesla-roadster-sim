// The world's queries, in one place for the other workstreams (the player on foot, traffic, people,
// missions): the ground's height and slope anywhere (the street, the hills and the hill road cut
// into them, the freeway's deck and its ramps, a car park's ramp), whether a point is on the road,
// which district and street it is in, where cars may be parked and people may appear, and the
// pavements as a graph to walk. Pure data and math over the layout (city.js, lots.js), so it runs
// headless in the tests.
import { BLOCKS, STALLS, BUILDINGS, onRoad, N, PITCH, HALF } from './city.js'
import { DECKS, RAMPS } from './lots.js'
import { AREAS, areaOf, whereIs } from './areas.js'
import { WALL } from './hills.js'
import { hillHeight, onHillRoad, inTunnel, HILL_ROAD, LOOKOUT } from './hillroad.js'
import { FWY } from './freeway.js'
import { STEP, roofAt } from './roofs.js'
import { LINES, ringOf, ringAt, crossings } from './pavement.js'
import { ROOFTOPS, LANDMARKS_V2 } from './variety.js'

export { onRoad, roofAt, FWY, HILL_ROAD, LOOKOUT, onHillRoad, inTunnel, ROOFTOPS, LANDMARKS_V2 }

const inRect = (o, x, z) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1
// a ramp's height at (x, z) (plots.js: h0 at x0 or z0, h1 at the far end)
export function rampHeight (r, x, z) {
  const t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0)
  return r.h0 + (r.h1 - r.h0) * Math.max(0, Math.min(1, t))
}

// The height of the drivable (and walkable) ground at (x, z): the highest surface there no more than
// a step above y (by default, whatever is on top). The street is 0; north of the wall the hills
// (hillHeight: with the hill road cut in); then the decks and ramps over them. Pass the height of
// whoever asks to find what is under them: under the freeway, the street; on it, the deck. Building
// roofs are not ground (roofAt is).
export function groundHeight (x, z, y = Infinity) {
  let h = z < -WALL ? hillHeight(x, z) : 0
  if (inTunnel(x, z)) h = -Infinity // (the hill over the tunnel is not its floor)
  const top = y + STEP
  for (const d of DECKS)
    if (d.y1 > h && d.y1 <= top && inRect(d, x, z)) h = d.y1
  for (const r of RAMPS)
    if (inRect(r, x, z)) {
      const v = rampHeight(r, x, z)
      if (v > h && v <= top) h = v
    }
  return h === -Infinity ? (z < -WALL ? hillHeight(x, z) : 0) : h
}
// the ground's upward unit normal at (x, z) (as groundHeight, at y), into out
export function groundNormal (x, z, y = Infinity, out = { x: 0, y: 1, z: 0 }) {
  const e = 0.75,
    h = groundHeight(x, z, y),
    up = h + 1 // (each side read at the same surface, not one stacked over it)
  const gx = (groundHeight(x + e, z, up) - groundHeight(x - e, z, up)) / (2 * e),
    gz = (groundHeight(x, z + e, up) - groundHeight(x, z - e, up)) / (2 * e)
  const l = Math.hypot(gx, 1, gz)
  out.x = -gx / l
  out.y = 1 / l
  out.z = -gz / l
  return out
}

// Which district (x, z) is in: its block, its neighbourhood's key and kind (areas.js AREAS: 'downtown',
// 'industrial', 'port', 'suburb', ...), and the HUD's name for the place and its street
export function districtAt (x, z) {
  const bx = Math.floor((x + HALF) / PITCH),
    bz = Math.floor((z + HALF) / PITCH)
  const w = whereIs(x, z, { area: '', street: '', cross: '' })
  const inside = bx >= 0 && bx < N && bz >= 0 && bz < N
  const key = inside ? areaOf(bx, bz) : null
  const out = {
    bx: inside ? bx : -1,
    bz: inside ? bz : -1,
    key,
    kind: key ? AREAS[key].kind : z < -WALL ? 'hills' : 'beach',
    name: w.area,
    street: w.street,
    cross: w.cross
  }
  if (onHillRoad(x, z)) {
    out.name = 'Hollywood Hills'
    out.street = inTunnel(x, z) ? 'Santa Fe Canyon Tunnel' : 'Santa Fe Canyon Rd'
  }
  return out
}

// The parking spaces within r of (x, z) (a car park's, a driveway's, the kerbside bays):
// { x, z, yaw, taken }. free: only those lots.js left empty (parkCars took the rest).
export function parkingNear (x, z, r, free = true) {
  const out = []
  for (const s of STALLS)
    if ((!free || !s.taken) && Math.abs(s.x - x) < r && Math.abs(s.z - z) < r && Math.hypot(s.x - x, s.z - z) < r)
      out.push(s)
  return out
}

// Points on the pavements within r of (x, z) where someone could appear, about every `every` m
// round each block's middle walking line: { x, z, hx, hz } (hx, hz: the way along it)
export function pavementNear (x, z, r, every = 12) {
  const out = [],
    P = {}
  for (const b of BLOCKS) {
    if (b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r) continue
    const g = ringOf(b, 1)
    for (let s = 0; s < g.len; s += every) {
      ringAt(g, s, P)
      if (Math.hypot(P.x - x, P.z - z) < r) out.push({ x: P.x, z: P.z, hx: P.hx, hz: P.hz })
    }
  }
  return out
}

// The pavements as a graph, made when first asked: a node at each block's corner (on the middle
// walking line, pavement.js LINES[1]), joined round the block along its sides and over the street
// to the next block's corner by each crosswalk (cross: the junction and the street's axis, for
// waiting for the walk signal: pavement.js walkOn). nodes[i] = { x, z, block, corner },
// edges = [{ a, b, len, cross }], adj[i] = the edges at node i.
let GRAPH = null
export function pavementGraph () {
  if (GRAPH) return GRAPH
  const nodes = [],
    edges = [],
    adj = []
  const id = new Map()
  const P = {}
  for (const b of BLOCKS) {
    const g = ringOf(b, 1)
    // (a corner node at the middle of its arc)
    let s = 0
    for (let k = 0; k < 4; k++) {
      s += g.runs[2 * k]
      ringAt(g, s + g.runs[2 * k + 1] / 2, P)
      s += g.runs[2 * k + 1]
      id.set(`${b.bx},${b.bz},${k}`, nodes.length)
      nodes.push({ x: P.x, z: P.z, block: b, corner: k })
      adj.push([])
    }
  }
  const link = (a, b, cross = null) => {
    const e = { a, b, len: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z), cross }
    edges.push(e)
    adj[a].push(e)
    adj[b].push(e)
  }
  const MIRROR = [
    [1, 0, 3, 2], // (over a street along x: north and south swap)
    [3, 2, 1, 0] // (over one along z: east and west)
  ]
  for (const b of BLOCKS) {
    for (let k = 0; k < 4; k++) {
      const a = id.get(`${b.bx},${b.bz},${k}`)
      link(a, id.get(`${b.bx},${b.bz},${(k + 1) % 4}`))
      for (const c of crossings(b, k)) {
        const o = c.block,
          m = id.get(`${o.bx},${o.bz},${MIRROR[c.axis][k]}`)
        // (each crossing once, from the block with the lower index)
        if (m !== undefined && m > a) link(a, m, { node: c.node, axis: c.axis })
      }
    }
  }
  GRAPH = { nodes, edges, adj, line: LINES[1] }
  return GRAPH
}

// Spawn points for parked cars and for people near (x, z): the free bays, and pavement points clear
// of the buildings
export function spawnPoints (x, z, r) {
  return {
    cars: parkingNear(x, z, r).map(s => ({ x: s.x, z: s.z, yaw: s.yaw })),
    people: pavementNear(x, z, r).filter(p => !inBuilding(p.x, p.z))
  }
}
function inBuilding (x, z) {
  for (const b of BUILDINGS)
    for (const t of b.tiers) if (t.y0 === 0 && inRect(t, x, z)) return true
  return false
}
