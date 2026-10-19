// The edges of the map, past the ring road's outer pavement (the promenade): to the west the beach
// and the sea, with Santa Monica's pier running out from the end of Wilshire; to the north the
// Hollywood Hills, behind a planted verge and a retaining wall; to the east and south more city,
// behind a verge and a freeway's sound wall. What is solid out there (the walls, rock groynes across
// the beach at its ends, the pier's railings, buildings and rides), where the car may go (the beach,
// the verges and the pier's deck), and the hills' shape: the same heights the renderer draws, so a
// car flown into a hillside is held up by it rather than passing through. Pure data and math, like
// city.js, so it runs headless in the tests.
import { LANDMARKS, OLD } from './areas.js'
import { PROMENADE, OUTER, addCollider } from './city.js'
import { WALL, WALL_H, noise, TERRACE } from './hills.js'
import { hillHeight, hillNormal, HILL_GAP, onHillRoad, inTunnel } from './hillroad.js'
import { QUAY, onQuay } from './quay.js'

export { WALL, WALL_H, noise, TERRACE, hillHeight, hillNormal }
export const SHORE = OUTER + 1 // where the beach's flat sand ends and slopes down into the sea
export const PIER = LANDMARKS.pier
const RAIL_FROM = PROMENADE + 14 // the pier's railings begin out here (on and off the beach before)
const DEEP = 3 // a wall's collider runs this far back from its face, so nothing gets past it
const solid = (x0, x1, z0, z1, y1, kind = 'wall', y0 = 0) =>
  addCollider({ x0, x1, z0, z1, y0, y1, kind })

// ---------- the walls ----------
// the retaining wall at the foot of the hills, from the beach to the corner, and the sound walls
// east and south; then a groyne of rocks across the beach at each end, out into the sea
// (with a gap where the hill road goes up the canyon: hillroad.js)
solid(-PROMENADE, HILL_GAP[0], -WALL - DEEP, -WALL, WALL_H.north)
solid(HILL_GAP[1], WALL + DEEP, -WALL - DEEP, -WALL, WALL_H.north)
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
  if (p.x < -OUTER && !onDeck(p.x, p.z) && !onQuay(p.x, p.z)) {
    p.x = onQuay(-OUTER, p.z) ? QUAY.x0 : -OUTER // (off the quay's edge: quay.js)
    if (v.x < 0) v.x = 0
  }
  if (p.x > WALL) {
    p.x = WALL - BACK
    if (v.x > 0) v.x = 0
  }
  if (p.z < -WALL && onHillRoad(p.x, p.z, 1.5)) return // (up the hill road)
  if (Math.abs(p.z) > WALL) {
    p.z = Math.sign(p.z) * (WALL - BACK)
    if (v.z * p.z > 0) v.z = 0
  }
}


// In the air over the hills: a car that comes down on a hillside, or flies into one, is held up by
// it: lifted back onto the ground under it, with whatever speed it had into the slope gone, and it
// slides on down (it can only land on the flat). bottom: its lowest corner's height.
const _n = { x: 0, y: 1, z: 0 }
export function hillside (s, bottom) {
  const p = s.com
  if (p.z > -WALL || inTunnel(p.x, p.z)) return
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
