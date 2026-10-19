// A multi-storey car park (venues.js garage): the ground floor and two decks over it, open sides on
// columns, driven all the way up. A ramp along the north side climbs east from the ground floor to
// a landing across the east end of the first deck; from there one along the south side climbs west
// to a landing across the west end of the roof. Walls along the north and south sides and down each
// ramp's inner side keep the car on the ramp it is on; parapets round the decks' open edges. Bays
// of nose-in spaces on every level, each at its height (st.y). All decks and ramps (plots.js), so
// the cars, the traffic's bodies and the Roadster drive them as they do the freeway.
import { deck, ramp, solid, stalls, STALLS } from './plots.js'

export const LEVEL = 3.4 // m from one floor to the next
const SLAB = 0.5,
  LAND = 12, // m: the landings at either end
  STRIP = 8, // m: each ramp's width
  RAIL = 1.1 // m: a parapet's height
const wall = (x0, x1, z0, z1, y0, y1) =>
  solid(x0, x1, z0, z1, y0, y1, 'plant', 'barrier')

export function multiStorey (lot) {
  const x0 = lot.x0 + 1,
    x1 = lot.x1 - 1,
    z0 = lot.z0 + 1,
    z1 = lot.z1 - 1
  const za = z0 + STRIP, // the middle, between the ramps
    zb = z1 - STRIP,
    y1 = LEVEL,
    y2 = 2 * LEVEL,
    top = y2 + RAIL
  // the decks: the first's middle and its east landing; the roof's middle and its west landing
  deck(x0, x1, za, zb, y1, SLAB)
  deck(x1 - LAND, x1, z0, z1, y1, SLAB)
  deck(x0, x1, za, zb, y2, SLAB)
  deck(x0, x0 + LAND, z0, z1, y2, SLAB)
  // the ramps: up east along the north side, then up west along the south (open under it)
  ramp(x0 + LAND, x1 - LAND, z0, za, 'x', 0, y1)
  ramp(x0 + LAND, x1 - LAND, zb, z1, 'x', y2, y1).open = true
  // the walls: north and south, and between each ramp and the middle, all the way up
  wall(x0, x1, z0 - 0.4, z0, 0, top)
  wall(x0, x1, z1, z1 + 0.4, 0, top)
  wall(x0 + LAND, x1 - LAND, za - 0.4, za, 0, top)
  wall(x0 + LAND, x1 - LAND, zb, zb + 0.4, 0, top)
  // the parapets round the open edges: the first deck's west and east ends, the roof's
  wall(x0, x0 + 0.4, za, zb, y1, y1 + RAIL)
  wall(x1 - 0.4, x1, z0, z1, y1, y1 + RAIL)
  wall(x0, x0 + 0.4, z0, z1, y2, top)
  wall(x1 - 0.4, x1, za, zb, y2, top)
  // the bays: rows along x, two back to back between aisles, on each level clear of the landings
  // and the ramps' feet, a column at every sixth space down the seam between back-to-back rows
  const rows = [3, 15.4, 20.8, 33.2, 38.6, 51].filter(
    v => za + v + 2.7 < zb - 0.5
  )
  for (const [y, a, b] of [
    [0, x0 + LAND, x1 - 8],
    [y1, x0 + 8, x1 - LAND - 1],
    [y2, x0 + LAND + 1, x1 - 8]
  ]) {
    const n = STALLS.length
    rows.forEach((v, i) => stalls(0, a, b, za + v, i % 2 ? 1 : -1, 0.7))
    for (let i = n; i < STALLS.length; i++) STALLS[i].y = y
  }
  for (let k = 0; k < rows.length - 1; k++) {
    const seam = za + (rows[k] + rows[k + 1]) / 2
    if (rows[k + 1] - rows[k] > 6) continue
    for (let x = x0 + LAND; x <= x1 - 8; x += 6 * 2.7)
      wall(x - 0.25, x + 0.25, seam - 0.25, seam + 0.25, 0, y2)
  }
}
