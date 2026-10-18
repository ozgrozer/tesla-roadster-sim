// The GPS's routes on the city's lane graph (city.js). A waypoint is snapped to the nearest street
// open to traffic, and can be reached on any of that street's four lanes, either way. From it the
// way there is worked out once for every lane in town: Dijkstra's search run backwards from the
// waypoint through the turns each junction allows, with a lane change counting for a little more
// than its length so a route keeps its lane unless moving over saves more, and the jammed street's
// closed lanes left out. So the route from wherever the car is, or has strayed to, is read off the
// plan at once rather than searched for again. Autopilot drives to a waypoint on the same plan
// (cityPilot.js), which has the same shape as its plan to the gridlock (cityHop.js). Pure data and
// math, like city.js, so the tests run it headless.
import { whereIs } from './areas.js'
import { NODES, LANES, STOP, LANE_W, LANE_OFF } from './city.js'

const SWAP = 15 // m a lane change counts for, over the road it covers
// m a waypoint is kept from either end of its lane (a car pulled up at it is clear of the crossing)
const END = 6
const ARC = 6 // straight pieces drawn for each turn
export const REACH = 15 // m from the waypoint that counts as having got there (gps.js)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// The waypoint for a point picked at (x, z): the nearest point on a street open to traffic, as the
// middle of the road there, its street and neighbourhood (areas.js), and its stops: that point on
// each of the road's lanes, this way and the other, as m along each. Null if no lane is open.
export function snap (x, z) {
  let best = null,
    bd = Infinity,
    bs = 0
  for (const e of LANES) {
    if (e.closed) continue
    const s = clamp((x - e.x0) * e.dx + (z - e.z0) * e.dz, END, e.len - END)
    const d = (e.x0 + e.dx * s - x) ** 2 + (e.z0 + e.dz * s - z) ** 2
    if (d < bd) {
      bd = d
      best = e
      bs = s
    }
  }
  if (!best) return null
  const e = best,
    o = LANE_OFF[e.lane]
  // (the lane runs o to the right of the road's middle: back across it)
  const px = e.x0 + e.dx * bs + e.dz * o,
    pz = e.z0 + e.dz * bs - e.dx * o
  const stops = new Map()
  for (const L of [e, e.twin]) if (L && !L.closed) stops.set(L, bs)
  // (the lanes the other way run from the far junction, so the same point is len - s along them)
  for (const L of NODES[e.to].out[(e.dir + 2) % 4] || [])
    if (!L.closed) stops.set(L, L.len - bs)
  const at = whereIs(px, pz, {})
  return { x: px, z: pz, street: at.street, area: at.area, stops }
}

// The way to a waypoint (a snap) from every lane: a Map from each lane to the turn to take at its
// end (only where keeping to the lane is at least as good as moving over to the one beside it, whose
// turn it then takes, as in the plan to the gridlock), with
//   own: each lane's best turn of its own (for when there's no room to move over),
//   dOwn: m from each lane's end to the waypoint by that turn,
//   D: m from each lane's start to the waypoint, and stops and goal: the waypoint's.
export function routeTo (goal) {
  const D = new Map(goal.stops),
    dOwn = new Map(),
    own = new Map(),
    heap = new Heap()
  for (const [L, s] of goal.stops) heap.push(s, L)
  const relax = (L, d) => {
    if (d >= (D.get(L) ?? Infinity)) return
    D.set(L, d)
    heap.push(d, L)
  }
  while (heap.size) {
    const M = heap.pop(),
      d = heap.key
    if (d > D.get(M)) continue // (a stale entry: M was reached quicker since)
    // every turn onto lane M, from the lane it leaves
    for (const c of M.feeds) {
      const L = NODES[c.node].inc[c.dir][c.lane]
      if (L.closed) continue
      const via = c.len + d
      if (via >= (dOwn.get(L) ?? Infinity)) continue
      dOwn.set(L, via)
      own.set(L, c)
      relax(L, L.len + via)
      // (and from the lane beside it, moving over on the way)
      if (L.twin && !L.twin.closed) relax(L.twin, L.twin.len + via + SWAP)
    }
  }
  const plan = new Map()
  for (const [L, c] of own) {
    const over = L.twin ? (dOwn.get(L.twin) ?? Infinity) + SWAP : Infinity
    if (dOwn.get(L) <= over) plan.set(L, c)
  }
  return Object.assign(plan, { own, dOwn, D, stops: goal.stops, goal })
}

// where lane L's stop is, if it has one (or the lane beside it, the same way: move over to it)
function stopOn (plan, L) {
  const s = plan.stops.get(L)
  if (s !== undefined) return s
  return L.twin ? plan.stops.get(L.twin) : undefined
}

// The route from s m along lane L to the waypoint: the pieces of lane and turn it drives, each
// { e, s0, s1 } (from s0 to s1 m along edge e), into out (its pieces are reused). A lane change is
// a piece of one lane followed by the turn from the lane beside it.
export function pathFrom (plan, L, s, out = []) {
  let n = 0
  const piece = (e, s0, s1) => {
    const p = out[n] || (out[n] = {})
    p.e = e
    p.s0 = s0
    p.s1 = s1
    n++
  }
  for (let guard = 0; guard < 300 && L; guard++) {
    // the waypoint is ahead on this lane (or the one beside it): there
    const stop = stopOn(plan, L)
    if (stop !== undefined && s <= stop + 1) {
      piece(L, s, Math.max(s, stop))
      break
    }
    // the plan's turn (the lane beside's, moving over for it), or if it has none, any way on
    const c =
      plan.get(L) ||
      (L.twin && plan.get(L.twin)) ||
      plan.own.get(L) ||
      L.next.find(t => !t.next[0].closed) ||
      L.next[0]
    if (s < L.len) piece(L, s, L.len)
    piece(c, 0, c.len)
    L = c.next[0]
    s = 0
  }
  out.length = n
  return out
}

// how long a route (pathFrom) is, m
export function lengthOf (pieces) {
  let len = 0
  for (const p of pieces) len += p.s1 - p.s0
  return len
}

// The point s m along straight edge e (a lane, or straight on through a junction), moved over to
// the middle of its side of the road, LANE_W from the centre line: where the route line runs
export function lanePoint (e, s, out = { x: 0, z: 0 }) {
  const k = LANE_W - LANE_OFF[e.lane]
  out.x = e.x0 + e.dx * s - e.dz * k
  out.z = e.z0 + e.dz * s + e.dx * k
  return out
}

// The route as a line to draw (x, z, x, z, ...) into out: down the middle of its side of the road
// (lanePoint), so a lane change doesn't show, and round each corner on an arc about the same centre
// as the lanes' own.
const _q = { x: 0, z: 0 }
export function routeLine (pieces, out = []) {
  out.length = 0
  const put = (x, z) => {
    const n = out.length
    if (n && Math.hypot(out[n - 2] - x, out[n - 1] - z) < 0.05) return
    out.push(x, z)
  }
  for (const { e, s0, s1 } of pieces) {
    if (e.kind === 1) {
      const r = e.move === 'R' ? STOP - LANE_W : STOP + LANE_W
      const a0 = e.a0 + (e.sg * s0) / e.r,
        a1 = e.a0 + (e.sg * s1) / e.r
      for (let i = 0; i <= ARC; i++) {
        const a = a0 + ((a1 - a0) * i) / ARC
        put(e.cx + r * Math.cos(a), e.cz + r * Math.sin(a))
      }
    } else {
      lanePoint(e, s0, _q)
      put(_q.x, _q.z)
      lanePoint(e, s1, _q)
      put(_q.x, _q.z)
    }
  }
  return out
}

// The lane the car at (x, z), facing (fx, fz), is on, or nearest to going its way, and how far
// along it: into out { lane, s }. The lane it was on last (prev) is kept unless another is clearly
// nearer, so a car on the line between two lanes doesn't flick the route from one to the other.
export function laneOf (x, z, fx, fz, prev = null, out = { lane: null, s: 0 }) {
  let best = null,
    bd = Infinity,
    bs = 0
  for (const e of LANES) {
    const s = clamp((x - e.x0) * e.dx + (z - e.z0) * e.dz, 0, e.len)
    let d = Math.hypot(e.x0 + e.dx * s - x, e.z0 + e.dz * s - z)
    if (e.dx * fx + e.dz * fz < 0.3) d += 40 // (the other way, or across it)
    if (e === prev) d -= 1.2
    if (d < bd) {
      bd = d
      best = e
      bs = s
    }
  }
  out.lane = best
  out.s = bs
  return out
}

// a small binary heap of values by key, least first (pop returns the value, and leaves its key
// in .key)
class Heap {
  constructor () {
    this.k = []
    this.v = []
    this.key = 0
  }
  get size () {
    return this.k.length
  }
  push (key, val) {
    const k = this.k,
      v = this.v
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]
      v[i] = v[p]
      i = p
    }
    k[i] = key
    v[i] = val
  }
  pop () {
    const k = this.k,
      v = this.v
    const val = v[0]
    this.key = k[0]
    const lk = k.pop(),
      lv = v.pop(),
      n = k.length
    if (n) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && k[c + 1] < k[c]) c++
        if (k[c] >= lk) break
        k[i] = k[c]
        v[i] = v[c]
        i = c
      }
      k[i] = lk
      v[i] = lv
    }
    return val
  }
}
