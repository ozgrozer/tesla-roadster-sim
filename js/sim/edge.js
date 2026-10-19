// The edges of the map, past the ring road's outer pavement (the promenade): to the west the beach
// and the sea, with Santa Monica's pier running out from the end of Wilshire; to the north the
// Hollywood Hills, behind a planted verge and a retaining wall; to the east and south more city,
// behind a verge and a freeway's sound wall. What is solid out there (the walls, rock groynes across
// the beach at its ends, the pier's railings, buildings and rides), where the car may go (the beach,
// the verges and the pier's deck), and the hills' shape: the same heights the renderer draws, so a
// car flown into a hillside is held up by it rather than passing through. Pure data and math, like
// city.js, so it runs headless in the tests.
import { LANDMARKS, OLD } from './areas.js'
import { PROMENADE, OUTER, HALF, addCollider } from './city.js'

export const WALL = HALF + 25 // the walls' inner face, north, east and south: the verge runs out to it
export const WALL_H = { north: 3.2, side: 4.8 } // the retaining wall, and the sound walls
export const SHORE = OUTER + 1 // where the beach's flat sand ends and slopes down into the sea
export const PIER = LANDMARKS.pier
const RAIL_FROM = PROMENADE + 14 // the pier's railings begin out here (on and off the beach before)
const DEEP = 3 // a wall's collider runs this far back from its face, so nothing gets past it
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const solid = (x0, x1, z0, z1, y1, kind = 'wall', y0 = 0) =>
  addCollider({ x0, x1, z0, z1, y0, y1, kind })

// ---------- the walls ----------
// the retaining wall at the foot of the hills, from the beach to the corner, and the sound walls
// east and south; then a groyne of rocks across the beach at each end, out into the sea
solid(-PROMENADE, WALL + DEEP, -WALL - DEEP, -WALL, WALL_H.north)
solid(WALL, WALL + DEEP, -WALL - DEEP, WALL + DEEP, WALL_H.side)
solid(-PROMENADE, WALL + DEEP, WALL, WALL + DEEP, WALL_H.side)
export const GROYNE = { x0: -SHORE - 34, x1: -PROMENADE, w: 4, h: 1.8 }
solid(GROYNE.x0, GROYNE.x1, -WALL - GROYNE.w, -WALL, GROYNE.h)
solid(GROYNE.x0, GROYNE.x1, WALL, WALL + GROYNE.w, GROYNE.h)

// ---------- the pier ----------
// whether (x, z) is on the pier's deck
export function onDeck (x, z) {
  for (const d of PIER.deck)
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return true
  return false
}
// [a0, a1] less the cuts, as a list of [from, to]
function minus (a0, a1, cuts) {
  let parts = a1 - a0 > 0.01 ? [[a0, a1]] : []
  for (const [c0, c1] of cuts)
    parts = parts.flatMap(([p0, p1]) =>
      c1 <= p0 || c0 >= p1
        ? [[p0, p1]]
        : [
            [p0, Math.max(p0, c0)],
            [Math.min(p1, c1), p1]
          ].filter(([u, v]) => v - u > 0.01)
    )
  return parts
}
// The railings: every stretch of a deck rectangle's side with no deck beyond it, out past where the
// pier leaves the beach: { x0, x1, z0, z1 } (a line along x or along z) and the way out (nx, nz).
export const RAILS = []
for (const d of PIER.deck) {
  const others = PIER.deck.filter(o => o !== d)
  for (const [z, nz] of [
    [d.z0, -1],
    [d.z1, 1]
  ]) {
    const beyond = others.filter(o =>
      nz < 0 ? o.z0 < z && o.z1 >= z : o.z1 > z && o.z0 <= z
    )
    const cuts = beyond.map(o => [o.x0, o.x1])
    for (const [a, b] of minus(d.x0, Math.min(d.x1, -RAIL_FROM), cuts))
      RAILS.push({ x0: a, x1: b, z0: z, z1: z, nx: 0, nz })
  }
  for (const [x, nx] of [
    [d.x0, -1],
    [d.x1, 1]
  ]) {
    if (x > -RAIL_FROM) continue
    const beyond = others.filter(o =>
      nx < 0 ? o.x0 < x && o.x1 >= x : o.x1 > x && o.x0 <= x
    )
    for (const [a, b] of minus(
      d.z0,
      d.z1,
      beyond.map(o => [o.z0, o.z1])
    ))
      RAILS.push({ x0: x, x1: x, z0: a, z1: b, nx, nz: 0 })
  }
}
export const RAIL_H = 1.1
// (each railing's collider is its thickness on the deck's edge and a deep block out over the water)
for (const r of RAILS)
  solid(
    r.nx < 0 ? r.x0 - DEEP : r.nx > 0 ? r.x0 - 0.15 : r.x0,
    r.nx > 0 ? r.x1 + DEEP : r.nx < 0 ? r.x1 + 0.15 : r.x1,
    r.nz < 0 ? r.z0 - DEEP : r.nz > 0 ? r.z0 - 0.15 : r.z0,
    r.nz > 0 ? r.z1 + DEEP : r.nz < 0 ? r.z1 + 0.15 : r.z1,
    RAIL_H
  )

// The Ferris wheel: its hub, radius, and the way its rim runs across the ground (dir, from +x
// towards +z): across the pier, so it shows its face down Wilshire and out at sea, and turns a
// three-quarter face to the beach either side; the feet of its two A-frames, either side of it.
const DIR = Math.PI / 2
export const WHEEL = {
  ...PIER.wheel,
  hub: 15.5,
  r: 13,
  dir: DIR,
  feet: [-1, 1].flatMap(f =>
    [-1, 1].map(side => ({
      x: PIER.wheel.x + Math.cos(DIR) * 7 * f - Math.sin(DIR) * 3.2 * side,
      z: PIER.wheel.z + Math.sin(DIR) * 7 * f + Math.cos(DIR) * 3.2 * side
    }))
  )
}
// the arch over the way onto the pier: its posts either side of the deck
export const ARCH = { x: -PROMENADE - 6, w: 8.5 }
// The roller coaster: its track through these points (x, y, z), a closed loop round the east of the
// park, out of the station over the lift hill and down; a column under each.
export const COASTER = [
  [-572 + OLD, 3, 41 + OLD],
  [-560 + OLD, 3.2, 42 + OLD],
  [-550 + OLD, 8.5, 42 + OLD],
  [-543 + OLD, 14.5, 41 + OLD],
  [-539 + OLD, 12, 36 + OLD],
  [-539 + OLD, 3.5, 28 + OLD],
  [-541 + OLD, 4.5, 20 + OLD],
  [-546 + OLD, 9, 15 + OLD],
  [-555 + OLD, 7, 13 + OLD],
  [-564 + OLD, 3.5, 14 + OLD],
  [-571 + OLD, 7.5, 18 + OLD],
  [-574 + OLD, 9.5, 25 + OLD],
  [-574 + OLD, 6, 33 + OLD],
  [-575 + OLD, 3.2, 38 + OLD]
]
// The pier's buildings (the renderer draws each by its name): the carousel's hall on the plaza, the
// arcade in the park, the coaster's station, the restaurant at the end and a few kiosks along it. You
// can land on their roofs, like the city's.
export const PIER_HOUSES = [
  { name: 'carousel', x0: -560, x1: -538, z0: -26, z1: -12, h: 10.5 },
  { name: 'arcade', x0: -611, x1: -598, z0: 31, z1: 45, h: 7 },
  { name: 'station', x0: -579, x1: -566, z0: 38.5, z1: 45, h: 4.6 },
  { name: 'restaurant', x0: -761, x1: -744, z0: -15, z1: -2, h: 6 },
  ...[-596, -628, -660, -692].map(x => ({
    name: 'kiosk',
    x0: x - 2.2,
    x1: x + 2.2,
    z0: -8.7,
    z1: -5.7,
    h: 3.4
  }))
].map(b => ({ ...b, x0: b.x0 + OLD, x1: b.x1 + OLD, z0: b.z0 + OLD, z1: b.z1 + OLD }))
for (const b of PIER_HOUSES) solid(b.x0, b.x1, b.z0, b.z1, b.h, 'building')
// the arch's posts; the wheel's base and legs, and (for a car flying into it) its rim; the coaster's
// columns
for (const sg of [-1, 1])
  solid(ARCH.x - 0.5, ARCH.x + 0.5, sg * ARCH.w - 0.5, sg * ARCH.w + 0.5, 8.6)
solid(WHEEL.x - 6, WHEEL.x + 6, WHEEL.z - 4, WHEEL.z + 4, 3.5)
for (const f of WHEEL.feet)
  addCollider({
    ...{ x0: f.x - 0.6, x1: f.x + 0.6, z0: f.z - 0.6, z1: f.z + 0.6 },
    ...{ y0: 0, y1: 9, x: f.x, z: f.z, r: 0.6 },
    kind: 'mast'
  })
for (const t of [-11, -5.5, 0, 5.5, 11]) {
  const x = WHEEL.x + Math.cos(WHEEL.dir) * t,
    z = WHEEL.z + Math.sin(WHEEL.dir) * t
  addCollider({
    ...{ x0: x - 2.5, x1: x + 2.5, z0: z - 2.5, z1: z + 2.5 },
    ...{ y0: WHEEL.hub - WHEEL.r, y1: WHEEL.hub + WHEEL.r, x, z, r: 2.5 },
    kind: 'mast'
  })
}
for (const [x, y, z] of COASTER)
  addCollider({
    ...{ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 },
    ...{ y0: 0, y1: y, x, z, r: 0.4 },
    kind: 'mast'
  })

// ---------- keeping the car on the map ----------
// On the ground: the beach ends at the sea, but for the pier's deck; and a car come down past a
// wall (flown over it) is put back on the verge in front of it.
const BACK = 2.6 // (its half length, and a little)
export function keepIn (s) {
  const p = s.pos,
    v = s.vel
  if (p.x < -OUTER && !onDeck(p.x, p.z)) {
    p.x = -OUTER
    if (v.x < 0) v.x = 0
  }
  if (p.x > WALL) {
    p.x = WALL - BACK
    if (v.x > 0) v.x = 0
  }
  if (Math.abs(p.z) > WALL) {
    p.z = Math.sign(p.z) * (WALL - BACK)
    if (v.z * p.z > 0) v.z = 0
  }
}

// ---------- the hills ----------
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
export function hillHeight (x, z) {
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
// the hillside's slope under (x, z): its upward normal into out
export function hillNormal (x, z, out) {
  const e = 1.5
  const gx = (hillHeight(x + e, z) - hillHeight(x - e, z)) / (2 * e),
    gz = (hillHeight(x, z + e) - hillHeight(x, z - e)) / (2 * e)
  const l = Math.hypot(gx, 1, gz)
  out.x = -gx / l
  out.y = 1 / l
  out.z = -gz / l
  return out
}

// In the air over the hills: a car that comes down on a hillside, or flies into one, is held up by
// it: lifted back onto the ground under it, with whatever speed it had into the slope gone, and it
// slides on down (it can only land on the flat). bottom: its lowest corner's height.
const _n = { x: 0, y: 1, z: 0 }
export function hillside (s, bottom) {
  const p = s.com
  if (p.z > -WALL) return
  const h = hillHeight(p.x, p.z)
  if (bottom >= h) return
  hillNormal(p.x, p.z, _n)
  p.y += h - bottom
  const v = s.vel,
    vn = v.x * _n.x + v.y * _n.y + v.z * _n.z
  if (vn < 0) {
    v.x -= vn * _n.x
    v.y -= vn * _n.y
    v.z -= vn * _n.z
  }
  v.multiplyScalar(0.995) // (scrubbing along the ground)
  s.syncPose()
}
