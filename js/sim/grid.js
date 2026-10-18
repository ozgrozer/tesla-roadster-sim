// The street grid's measurements, in metres, and the seeded random numbers the city is laid out
// with. city.js builds the lane graph on them and passes them on (everything else imports them from
// there); what stands on the blocks (lots.js and the neighbourhoods' builders) takes them from here,
// as city.js imports those in turn. (areas.js keeps its own copy of N, PITCH and ROAD_HW, checked
// against these by its test.)

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
