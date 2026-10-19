// The street grid's measurements, in metres, and the seeded random numbers the city is laid out
// with. city.js builds the lane graph on them and passes them on (everything else imports them from
// there); what stands on the blocks (lots.js and the neighbourhoods' builders) takes them from here,
// as city.js imports those in turn. (areas.js keeps its own copy of N, PITCH and ROAD_HW, checked
// against these by its test.)

export const N = 18 // blocks across (10 before the city grew east and south)
export const PITCH = 96 // m between road centre lines
export const LANE_W = 3.5
export const ROAD_HW = 2 * LANE_W // asphalt half-width: two lanes each way
export const WALK = 4 // sidewalk width
export const CURB_H = 0.08
export const CURB_R = 4 // rounded kerb at every corner
export const STOP = 11 // stop line, measured from an intersection's centre
export const HALF = (N / 2) * PITCH // centre line of the outer ring road
export const EDGE = HALF + ROAD_HW + WALK // outside of the ring road's sidewalk
export const OUTER = EDGE + 24 // the beach past the ring road ends here, at the sea
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
// The first city (ten blocks across) is the north-west of this one, its blocks keeping their numbers;
// what stood at (x, z) there stands at (x + OLD, z + OLD) here (the pier, the hills' landmarks...)
export const OLD = (10 / 2 - N / 2) * PITCH
// Wilshire Boulevard, the old city's central avenue: its index in ROADS (east-west)
export const WILSHIRE = 5
// on Wilshire, eastbound in the kerb lane, with the downtown skyline ahead
export const SPAWN = {
  x: ROADS[1] - 40,
  z: ROADS[WILSHIRE] + LANE_OFF[1],
  yaw: 0
}

// ---------- superblocks: four blocks with the streets between them closed ----------
// Each is the north-west block (bx, bz) of a 2 x 2 square: the stadium and the port's container yard.
// The two road segments through the middle each way and their junction are paved over (no lanes,
// no paint, no lights); the square is built as one lot (lots.js).
export const SUPERS = [
  { bx: 8, bz: 13, kind: 'stadium' },
  { bx: 0, bz: 14, kind: 'containers' }
]
// closed road segments: 'z r j' (the road along z at ROADS[r], between ROADS[j] and ROADS[j + 1])
// or 'x r j' (along x at z = ROADS[r]); and the junctions gone with them, 'ix,iz'
const CLOSED = new Set()
const GONE = new Set()
for (const { bx, bz } of SUPERS) {
  for (const j of [bz, bz + 1]) CLOSED.add(`z ${bx + 1} ${j}`)
  for (const j of [bx, bx + 1]) CLOSED.add(`x ${bz + 1} ${j}`)
  GONE.add(`${bx + 1},${bz + 1}`)
}
// whether the road along z (alongZ) or x at ROADS[r] is open between ROADS[j] and ROADS[j + 1]
export const segOpen = (r, j, alongZ) => !CLOSED.has(`${alongZ ? 'z' : 'x'} ${r} ${j}`)
// whether there is a junction at (ix, iz)
export const nodeOpen = (ix, iz) => !GONE.has(`${ix},${iz}`)
// the superblock block (bx, bz) is part of, or null
export function superOf (bx, bz) {
  for (const s of SUPERS)
    if (bx >= s.bx && bx <= s.bx + 1 && bz >= s.bz && bz <= s.bz + 1) return s
  return null
}
// Whether (x, z), on the street grid's asphalt band, is on a closed piece of it (paved over)
export function closedAt (x, z) {
  const ix = Math.round(x / PITCH + N / 2),
    iz = Math.round(z / PITCH + N / 2)
  const onX = Math.abs(x - (ix - N / 2) * PITCH) < ROAD_HW + 0.01,
    onZ = Math.abs(z - (iz - N / 2) * PITCH) < ROAD_HW + 0.01
  if (onX && onZ) return !nodeOpen(ix, iz)
  if (onX) return !segOpen(ix, Math.floor(z / PITCH + N / 2), true)
  if (onZ) return !segOpen(iz, Math.floor(x / PITCH + N / 2), false)
  return false
}

// ---------- the roads' hierarchy ----------
// Boulevards (indices into ROADS) carry a raised median between their junctions, planted with
// palms: the old city's main streets and the new south and east's; the rest are two-lane-each-way
// streets. (plots.js MAIN: the same sets, for what is built along them.)
export const BLVD_EW = new Set([1, 2, 3, 5, 8, 11, 13, 15])
export const BLVD_NS = new Set([0, 5, 8, 11, 14, 16])
export const MEDIAN_HW = 0.6 // the median's half-width: the inner lanes keep 1.15 m clear of it

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
