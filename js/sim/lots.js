// What is built on each block, by its neighbourhood (areas.js): Downtown's skyline and Century City's
// towers (towers.js), Santa Monica's and Hollywood's shops (shops.js), Mid-City's strip malls and
// gas stations (strip.js), Beverly Hills' houses and Venice's bungalows (homes.js); and the parks and
// parking lots. Most of the city is low, one to four storeys: the towers stand downtown and in
// Century City, and that contrast is the look. Each block: { bx, bz, x0, x1, z0, z1 } inside its
// kerb, kind ('park', 'parking' or 'city'), area (the neighbourhood's kind), base (what covers its
// lot: plaza, grass or asphalt) and ground (lawns, drives, car parks and pools over it: plots.js).
import { N, ROADS, ROAD_HW, WALK } from './grid.js'
import { AREAS, areaOf } from './areas.js'
import {
  BLOCKS,
  BUILDINGS,
  TREES,
  PALMS,
  STALLS,
  SOLIDS,
  SIGNS,
  R,
  palm,
  mark,
  parkCars
} from './plots.js'
import { downtown, centuryCity } from './towers.js'
import { santaMonica, hollywood } from './shops.js'
import { midCity } from './strip.js'
import { beverlyHills, venice } from './homes.js'

export { BLOCKS, BUILDINGS, TREES, PALMS, STALLS, SOLIDS, SIGNS }

const PARKS = new Set(['6,3', '2,7'])
const PARKING = new Set(['7,7']) // (a big surface lot in Mid-City)
const BUILD = {
  downtown,
  towers: centuryCity,
  beach: santaMonica,
  boulevard: hollywood,
  strip: midCity,
  estates: beverlyHills,
  venice
}

for (let bz = 0; bz < N; bz++)
  for (let bx = 0; bx < N; bx++) {
    const key = `${bx},${bz}`
    const blk = {
      bx,
      bz,
      x0: ROADS[bx] + ROAD_HW,
      x1: ROADS[bx + 1] - ROAD_HW,
      z0: ROADS[bz] + ROAD_HW,
      z1: ROADS[bz + 1] - ROAD_HW,
      kind: PARKS.has(key) ? 'park' : PARKING.has(key) ? 'parking' : 'city',
      area: AREAS[areaOf(bx, bz)].kind,
      base: 'plaza',
      ground: []
    }
    BLOCKS.push(blk)
    mark()
    const lot = {
      x0: blk.x0 + WALK,
      x1: blk.x1 - WALK,
      z0: blk.z0 + WALK,
      z1: blk.z1 - WALK
    }
    const { x0: lx0, x1: lx1, z0: lz0, z1: lz1 } = lot
    if (blk.kind === 'park') {
      blk.base = 'grass'
      for (let i = 0; i < 46; i++) {
        const x = lx0 + 3 + R() * (lx1 - lx0 - 6),
          z = lz0 + 3 + R() * (lz1 - lz0 - 6)
        // keep the crossing footpaths clear
        if (
          Math.abs(x - (lx0 + lx1) / 2) < 3 ||
          Math.abs(z - (lz0 + lz1) / 2) < 3
        )
          continue
        TREES.push({ x, z, s: 0.8 + R() * 0.6 })
      }
      continue
    }
    if (blk.kind === 'parking') {
      blk.base = 'asphalt'
      // rows of nose-in stalls either side of three aisles
      for (let row = 0; row < 4; row++) {
        const z = lz0 + 6 + row * 17.5
        for (let x = lx0 + 3; x < lx1 - 2; x += 2.7)
          for (const side of [-1, 1])
            STALLS.push({
              x: x + 1.35,
              z: z + side * 2.7,
              yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2, // nose in, towards the row's centre line
              fill: 0.62,
              taken: false
            })
      }
      // and a tall palm at each end of the middle aisles
      for (const z of [lz0 + 14.75, lz0 + 32.25, lz0 + 49.75])
        for (const x of [lx0 + 1.2, lx1 - 1.2]) palm(x, z, 19 + R() * 8, true)
      continue
    }
    BUILD[blk.area](blk, lot)
  }
parkCars(267)
