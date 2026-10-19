// The Hollywood Hills' natural ground north of the wall, before any road is cut into it (hillroad.js
// carves its road in and gives the final hillHeight): value noise, ridges, the canyons, the pass,
// the peak behind the sign and the observatory's terrace. Pure math, so it runs headless in the
// tests (edge.js re-exports what the rest of the game uses).
import { LANDMARKS, OLD } from './areas.js'
import { HALF, EDGE } from './grid.js'

export const WALL = HALF + 25 // the walls' inner face, north, east and south: the verge runs out to it
export const WALL_H = { north: 3.2, side: 4.8 } // the retaining wall, and the sound walls
const PROMENADE = EDGE + 1.5 // (city.js)
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// value noise on a unit lattice, smooth, 0 to 1 (hashed, so the hills are the same every time)
function lattice (i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + 1013904223
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
export function noise (x, z) {
  const i = Math.floor(x),
    j = Math.floor(z)
  let u = x - i,
    v = z - j
  u = u * u * (3 - 2 * u)
  v = v * v * (3 - 2 * v)
  const a = lattice(i, j),
    b = lattice(i + 1, j),
    c = lattice(i, j + 1),
    d = lattice(i + 1, j + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
// ridges: noise folded over, sharp along its crests, a few octaves of it (0 to 1)
function ridges (x, z) {
  let s = 0,
    a = 0.5
  for (let k = 0; k < 4; k++) {
    s += a * (1 - Math.abs(2 * noise(x, z) - 1))
    x = x * 2.03 + 17.1
    z = z * 2.03 - 5.3
    a *= 0.5
  }
  return s / 0.9375
}
// canyons running back into the hills (their floors' x), opening onto the flats at the wall; the
// pass the east freeway takes north; the peak behind the sign; the observatory's terrace
const CANYONS = [-300, -95, 70, 310, 860, 1180].map(x => x + OLD)
const PASS = LANDMARKS.freeways[0].x0
const SIGN = LANDMARKS.sign
const OBS = LANDMARKS.observatory
export const TERRACE = 74 // the observatory's terrace, m up
// The ground's height north of the wall: from the wall's top, a steep face rising to a crest a few
// hundred metres back, down its back into the valley beyond, cut by canyons and roughed with ridges
// and spurs; down to the beach at the west end, level with the flats past the east wall.
export function naturalHill (x, z) {
  const u = -z - WALL
  if (u < 0 || x < -PROMENADE) return 0
  const base =
    WALL_H.north *
    sstep(-PROMENADE, -PROMENADE + 10, x) *
    (1 - sstep(WALL, WALL + 30, x))
  // (shaped as they were behind the first city: xo is x where it stood then)
  const xo = x - OLD
  const crest = 255 + 45 * Math.sin(xo / 330 + 0.6) + 50 * noise(xo / 210, 3.7)
  let top = 140 + 70 * noise(xo / 290, 9.2)
  // (lower toward the sea in the west, and far off in the east)
  top *=
    (0.4 + 0.6 * sstep(-PROMENADE, -120 + OLD, x)) *
    (1 - 0.55 * sstep(1100, 2400, xo))
  // (the slope eases in from the wall: a shelf behind it before it climbs)
  let h =
    (u < crest
      ? top * (1 - Math.pow(1 - u / crest, 1.35))
      : top - (top - 40) * sstep(crest, crest + 450, u)) *
    (1 - Math.exp(-u / 22))
  // the peak behind the sign
  h +=
    30 * Math.exp(-((x - SIGN.x + 10) ** 2 + (u - 310) ** 2) / (2 * 150 ** 2))
  let cut = 0
  for (const c of CANYONS) cut = Math.max(cut, Math.exp(-(((x - c) / 60) ** 2)))
  h *= 1 - 0.5 * cut * sstep(0, 160, u)
  h += 38 * (ridges(xo / 170, u / 170) - 0.45) * sstep(0, 140, u)
  // the pass: a broad floor, steep sides
  h = Math.min(h, 3 + Math.max(0, Math.abs(x - PASS) - 45) * 1.1)
  // the observatory's terrace, on its spur
  const d = Math.hypot(x - OBS.x, z - OBS.z)
  h += (TERRACE - h) * (1 - sstep(34, 75, d))
  // the bluffs down to the beach
  h *= sstep(-PROMENADE, -PROMENADE + 45, x)
  return Math.max(base, base + h)
}
