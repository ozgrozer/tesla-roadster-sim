// Botts' dots: the raised markers that stand in for painted lane lines on Los Angeles' streets, and
// on this city's low-rise neighbourhoods' (the strip, Venice, the beach's Santa Monica and Beverly
// Hills' estates): along each lane line, four white ceramic domes 0.9 m apart and a square
// reflector, the group every 7.3 m, as on California's roads. Where they are is decided here, so
// the ground drawn (cityGround.js) and the ground felt agree; and here a wheel's contact patch is
// followed over them, each dome or reflector it runs onto a knock the tyre takes (street.js counts
// them, for the sound and a gamepad's rumble: the drumming as the car crosses or straddles a line).
// They are felt nowhere in the handling: an 18 mm dome under a tyre is a sound and a buzz in the
// wheel, not a force that moves the car.
import { N, PITCH, ROADS, STOP, LANE_W, BLOCKS, segOpen } from './city.js'

// the neighbourhoods whose streets have them
export const DOT_AREAS = new Set(['strip', 'venice', 'beach', 'estates', 'suburb'])
// along a street between two junctions: the first group DOT_FROM m past the stop line, a group
// every DOT_CYCLE m while one can start DOT_TO m short of the next stop line; in each, DOT_RUN
// domes DOT_GAP m apart and the reflector DOT_SQUARE m on from the first
export const DOT_FROM = 3,
  DOT_TO = 4,
  DOT_CYCLE = 7.3,
  DOT_RUN = 4,
  DOT_GAP = 0.9,
  DOT_SQUARE = 3.65
// how near a wheel's middle must pass a marker's to run over it (m): the dome's radius and half a
// tyre's width
const REACH = 0.06 + 0.14

const area = (bx, bz) =>
  bx >= 0 && bz >= 0 && bx < N && bz < N ? BLOCKS[bz * N + bx].area : ''
// whether the street along road r, from cross street j to j + 1 (running along z if alongZ, along x
// if not), has dots: a block beside it is in a neighbourhood that has them (worked out once for
// every street, as the wheels ask every step)
const DOTTED = []
for (let r = 0; r <= N; r++)
  for (let j = 0; j < N; j++)
    for (const alongZ of [false, true]) {
      const a = alongZ ? area(r - 1, j) : area(j, r - 1),
        b = alongZ ? area(r, j) : area(j, r)
      DOTTED.push(
        (DOT_AREAS.has(a) || DOT_AREAS.has(b)) && segOpen(r, j, alongZ)
      )
    }
export const dotted = (r, j, alongZ) =>
  DOTTED[(r * N + j) * 2 + (alongZ ? 1 : 0)]
// each marker along a street whose stop lines are at a and b (m along it): fn(u, square), u where
// it is along the street, square for the reflector
export function eachMarker (a, b, fn) {
  for (let u = a + DOT_FROM; u < b - DOT_TO; u += DOT_CYCLE) {
    for (let k = 0; k < DOT_RUN; k++) fn(u + k * DOT_GAP, false)
    fn(u + DOT_SQUARE, true)
  }
}

// (how many groups there are between stop lines at a and b, and how many markers lie at or before
// u along the street)
const groups = (a, b) =>
  Math.max(0, Math.ceil((b - a - DOT_FROM - DOT_TO) / DOT_CYCLE))
function markersTo (u, a, b) {
  const s = u - a - DOT_FROM
  if (s < 0) return 0
  const n = Math.floor(s / DOT_CYCLE),
    all = groups(a, b)
  if (n >= all) return all * (DOT_RUN + 1)
  const o = s - n * DOT_CYCLE
  let k = o >= DOT_SQUARE ? 1 : 0
  for (let i = 0; i < DOT_RUN; i++) if (o >= i * DOT_GAP) k++
  return n * (DOT_RUN + 1) + k
}
// (the markers run onto along one lane line, c across the road (on road r), by a wheel going from
// v0 to v1 across and u0 to u1 along it: only over the part of the step it was in reach of the
// line (all of it running along the line, a moment of it crossing), and none across a junction,
// which they stop well short of)
function onLine (c, v0, v1, u0, u1, r, alongZ) {
  const d0 = v0 - c,
    dv = v1 - v0
  let t0 = 0,
    t1 = 1
  if (Math.abs(dv) > 1e-9) {
    const p = (-REACH - d0) / dv,
      q = (REACH - d0) / dv
    t0 = Math.max(0, Math.min(p, q))
    t1 = Math.min(1, Math.max(p, q))
  } else if (Math.abs(d0) > REACH) return 0
  if (t0 > t1) return 0
  const ua = u0 + (u1 - u0) * t0,
    ub = u0 + (u1 - u0) * t1
  const j = Math.floor((ub - ROADS[0]) / PITCH)
  if (j < 0 || j >= N || j !== Math.floor((ua - ROADS[0]) / PITCH)) return 0
  if (!dotted(r, j, alongZ)) return 0
  const a = ROADS[j] + STOP,
    b = ROADS[j + 1] - STOP
  return Math.abs(markersTo(ub, a, b) - markersTo(ua, a, b))
}
// (on the lane lines of the street a wheel is on, a lane's width either side of the road's middle:
// one along x, v across it being z, or along z; none unless one is in reach, as mostly it isn't)
function onStreet (v0, v1, u0, u1, alongZ) {
  const r = Math.round((v1 - ROADS[0]) / PITCH)
  if (r < 0 || r > N) return 0
  const c = ROADS[r]
  if (Math.abs(Math.abs(v1 - c) - LANE_W) > REACH + Math.abs(v1 - v0)) return 0
  return (
    onLine(c - LANE_W, v0, v1, u0, u1, r, alongZ) +
    onLine(c + LANE_W, v0, v1, u0, u1, r, alongZ)
  )
}
// The markers a wheel ran onto going from (px, pz) to (x, z) in a step: on the lane lines of the
// street along x it is on, and of the one along z.
export const dotsRunOver = (px, pz, x, z) =>
  onStreet(pz, z, px, x, false) + onStreet(px, x, pz, z, true)
