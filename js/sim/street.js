// What is underfoot in the city: the kerb's line (straight down each street, round each corner, and
// along the promenade), the surface a point is on (asphalt, pavement, a park's grass, the verge's
// grass past the promenade on the north, east and south, the beach's sand on the west and the pier's
// timber deck, each with its own grip and drag), and the street's ironwork: manholes out in the lanes
// and drain grates in the gutter by every corner. The Roadster feels the kerb as it mounts or drops
// off it, and each manhole a wheel runs over (s.suspV kicks the visual suspension; 'kerb' and
// 'manhole' events carry it to the sound), and its tyres grip less on the pier's planks and grass and
// less still on sand; and less on all of them in the wet (ENV.wet, env.js), most on the planks.
import {
  N,
  HALF,
  PITCH,
  BLOCKS,
  CURB_R,
  LANES,
  WALK,
  ROAD_HW,
  PROMENADE,
  LANE_OFF,
  rng
} from './city.js'
import { onDeck } from './edge.js'
import { ENV } from './env.js'
import { CAR } from './constants.js'

// How far (x, z) is from the kerb, positive out on the road: folded into one quadrant of the
// nearest junction, where each block's corner is rounded to CURB_R; outside the ring road, the
// promenade's kerb runs straight.
export function kerbDist (x, z) {
  const ux = x - Math.round(x / PITCH) * PITCH,
    uz = z - Math.round(z / PITCH) * PITCH
  const cx = CURB_R - (Math.abs(ux) - ROAD_HW),
    cz = CURB_R - (Math.abs(uz) - ROAD_HW)
  let d =
    cx > 0 && cz > 0 ? Math.hypot(cx, cz) - CURB_R : Math.max(cx, cz) - CURB_R
  if (Math.abs(x) > HALF) d = ROAD_HW - (Math.abs(x) - HALF)
  if (Math.abs(z) > HALF) d = ROAD_HW - (Math.abs(z) - HALF)
  return d
}

// grip (a share of the tyres' own) and extra rolling drag, by surface (the pier's weathered planks
// a little slippier than the road, and their joints dragging a little)
// and wet: the share of its grip each loses soaked through (asphalt about a quarter, as a good
// tyre's does on a wet road; wet planks are slippery; wet sand packs firm, so it loses none)
export const SURFACES = {
  road: { grip: 1, drag: 0, wet: 0.24 },
  walk: { grip: 1, drag: 0, wet: 0.22 },
  wood: { grip: 0.88, drag: 0.02, wet: 0.32 },
  grass: { grip: 0.84, drag: 0.05, wet: 0.2 },
  sand: { grip: 0.62, drag: 0.12, wet: 0 }
}
// past the promenade's edge, off its level: the sand and the verges lie a little below it, the pier's
// deck level with it
const offEdge = (x, z) =>
  (Math.abs(x) > PROMENADE || Math.abs(z) > PROMENADE) && !onDeck(x, z)
// the surface at (x, z) on the city's ground (roofs are concrete, like the pavement)
export function surfaceAt (x, z) {
  if (x < -PROMENADE) return onDeck(x, z) ? 'wood' : 'sand'
  if (Math.abs(x) > PROMENADE || Math.abs(z) > PROMENADE) return 'grass'
  if (kerbDist(x, z) > 0) return 'road'
  const bx = Math.floor((x + HALF) / PITCH),
    bz = Math.floor((z + HALF) / PITCH)
  const b = bx >= 0 && bz >= 0 && bx < N && bz < N ? BLOCKS[bz * N + bx] : null
  if (
    !b ||
    x <= b.x0 + WALK ||
    x >= b.x1 - WALK ||
    z <= b.z0 + WALK ||
    z >= b.z1 - WALK
  )
    return 'walk'
  if (b.kind === 'park') return 'grass'
  // on the block's lot: what is laid over its base (a lawn, a drive, a car park; the last laid on
  // top), or the base itself (city.js: plots.js)
  let k = b.base
  const g = b.ground
  if (g)
    for (let i = g.length - 1; i >= 0; i--) {
      const r = g[i]
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
        k = r.k
        break
      }
    }
  return LOT[k] || 'walk'
}
// what a lot's ground is to the tyres: lawns grass, car parks asphalt, the rest paving
const LOT = { grass: 'grass', asphalt: 'road' }

// ---------- the street's ironwork ----------
const R = rng(3141)
export const MANHOLE_R = 0.34
export const MANHOLES = [] // { x, z }
export const DRAINS = [] // { x, z, yaw }: a grate in the gutter, its long side along the kerb
for (const e of LANES) {
  // now and then a manhole in a lane, as often as not where the wheels run
  if (R() < 0.4) {
    const s = 12 + R() * (e.len - 24),
      lat = R() < 0.5 ? 0 : (R() < 0.5 ? -1 : 1) * 0.8
    MANHOLES.push({
      x: e.x0 + e.dx * s - e.dz * lat,
      z: e.z0 + e.dz * s + e.dx * lat
    })
  }
  // the kerb lane's gutter has a drain at each end of the block
  if (e.lane === 1) {
    const o = ROAD_HW - 0.24 - LANE_OFF[1]
    for (const s of [3, e.len - 3])
      DRAINS.push({
        x: e.x0 + e.dx * s - e.dz * o,
        z: e.z0 + e.dz * s + e.dx * o,
        yaw: Math.atan2(-e.dz, e.dx)
      })
  }
}
const near = (list, x, z, r) =>
  list.filter(m => Math.abs(m.x - x) < r && Math.abs(m.z - z) < r)
// the manholes within r (m) of (x, z)
export const manholesNear = (x, z, r) => near(MANHOLES, x, z, r)

// ---------- how the Roadster feels it (ground.js, each step in the city) ----------
const WHEELS = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1]
]
const TRACK_HALF = 0.87
export function feel (s) {
  const cy = Math.cos(s.yaw),
    sy = Math.sin(s.yaw)
  const fx = cy,
    fz = -sy,
    lx = -sy,
    lz = -cy
  const x = s.pos.x,
    z = s.pos.z,
    on = s.floor > 0 ? 'walk' : surfaceAt(x, z)
  const f = SURFACES[on]
  s.surface = on
  s.grip = f.grip * (1 - f.wet * ENV.wet)
  s.rollDrag = f.drag
  const v = Math.abs(s.speed)
  // a jump of more than a few metres in a step is a reset, not a drive over the kerb
  const moved = s.feel ? Math.hypot(x - s.feel.x, z - s.feel.z) : 99
  const fresh = !s.feel || moved > 3
  const st = (s.feel = s.feel || { x, z, kerb: [true, true], holes: new Set() })
  st.x = x
  st.z = z
  if (s.floor > 0) return
  // each axle mounting or dropping off the kerb (the promenade's edge onto the sand or the verge
  // too; not onto the pier, which is level with it)
  for (let a = 0; a < 2; a++) {
    const sg = a === 0 ? 1 : -1,
      ax = x + fx * CAR.halfWB * sg,
      az = z + fz * CAR.halfWB * sg
    const onRoad = kerbDist(ax, az) > 0 || offEdge(ax, az)
    if (!fresh && onRoad !== st.kerb[a] && v > 0.8) {
      s.suspV += (onRoad ? -1 : 1) * Math.min(0.9, 0.12 + v * 0.035)
      s.emit('kerb', { v, up: !onRoad, front: a === 0 })
    }
    st.kerb[a] = onRoad
  }
  // a wheel running onto a manhole's lid
  const under = new Set()
  if (on === 'road')
    for (const m of manholesNear(x, z, 4))
      for (const [sx, sl] of WHEELS) {
        const wx = x + fx * CAR.halfWB * sx + lx * TRACK_HALF * sl,
          wz = z + fz * CAR.halfWB * sx + lz * TRACK_HALF * sl
        if (Math.hypot(wx - m.x, wz - m.z) < MANHOLE_R) under.add(m)
      }
  for (const m of under)
    if (!st.holes.has(m) && !fresh && v > 2) {
      s.suspV -= Math.min(0.25, 0.04 + v * 0.006)
      s.emit('manhole', { v })
    }
  st.holes = under
}

// grip and extra rolling drag for the car's surface (1 and 0 off the city's ground)
export const gripOf = s => (s.world === 'city' && s.grip) || 1
export const dragOf = s => (s.world === 'city' && s.rollDrag) || 0
