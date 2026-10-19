// What is built on each block, by its neighbourhood (areas.js): Downtown's skyline and Century City's
// towers (towers.js), Santa Monica's and Hollywood's shops (shops.js), Mid-City's strip malls and
// gas stations (strip.js), Beverly Hills' houses and Venice's bungalows (homes.js); and the parks and
// parking lots. Most of the city is low, one to four storeys: the towers stand downtown and in
// Century City, and that contrast is the look. Each block: { bx, bz, x0, x1, z0, z1 } inside its
// kerb, kind ('park', 'parking' or 'city'), area (the neighbourhood's kind), base (what covers its
// lot: plaza, grass or asphalt) and ground (lawns, drives, car parks and pools over it: plots.js).
import { N, ROADS, ROAD_HW, WALK, PITCH, superOf } from './grid.js'
import { AREAS, areaOf } from './areas.js'
import {
  BLOCKS,
  BUILDINGS,
  TREES,
  PALMS,
  STALLS,
  SOLIDS,
  SIGNS,
  PROPS,
  DECKS,
  RAMPS,
  R,
  palm,
  mark,
  parkCars
} from './plots.js'
import { downtown, centuryCity } from './towers.js'
import { santaMonica, hollywood } from './shops.js'
import { midCity } from './strip.js'
import { beverlyHills, venice } from './homes.js'
import { industrial, port } from './works.js'
import { suburb } from './suburbs.js'
import { stadium, river, corridor, sportsPark, garage } from './venues.js'
import { layFreeway, FWY, FWY_FROM, FWY_TO, RAMP_AT } from './freeway.js'

export { BLOCKS, BUILDINGS, TREES, PALMS, STALLS, SOLIDS, SIGNS, PROPS, DECKS, RAMPS }

const PARKS = new Set(['6,3', '2,7', '15,4'])
// sports parks: basketball courts, a ball field, bleachers (venues.js)
const SPORTS = new Set(['6,12', '10,16', '4,15', '14,12'])
const PARKING = new Set(['7,7', '10,14']) // (big surface lots: Mid-City's, the stadium's)
const GARAGES = new Set(['10,13', '11,4', '9,9']) // (multi-storey car parks, landable roofs)
const BUILD = {
  downtown,
  towers: centuryCity,
  beach: santaMonica,
  boulevard: hollywood,
  strip: midCity,
  estates: beverlyHills,
  venice,
  industrial,
  port,
  suburb,
  river,
  stadium,
  containers: port
}

for (let bz = 0; bz < N; bz++)
  for (let bx = 0; bx < N; bx++) {
    const key = `${bx},${bz}`
    const sup = superOf(bx, bz)
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
    // a superblock (grid.js) is built once, from its north-west block, as one lot; its four blocks
    // each keep their kerb, the closed streets between paved over (render/cityGround.js)
    if (sup) {
      blk.super = sup
      blk.kind = 'city'
      blk.area = sup.kind === 'stadium' ? 'stadium' : 'port'
      if (bx !== sup.bx || bz !== sup.bz) {
        blk.base = 'asphalt'
        continue
      }
      const big = {
        x0: blk.x0 + WALK,
        x1: blk.x1 + PITCH - WALK,
        z0: blk.z0 + WALK,
        z1: blk.z1 + PITCH - WALK
      }
      BUILD[sup.kind](blk, big)
      continue
    }
    const lot = {
      x0: blk.x0 + WALK,
      x1: blk.x1 - WALK,
      z0: blk.z0 + WALK,
      z1: blk.z1 - WALK
    }
    if (blk.area === 'corridor') {
      const end = bx === FWY_FROM || bx === FWY_TO
      corridor(blk, lot, FWY.z0, FWY.z1, RAMP_AT[bx] || [], end)
      continue
    }
    if (SPORTS.has(key)) {
      blk.kind = 'park'
      blk.sports = true
      sportsPark(blk, lot)
      continue
    }
    if (GARAGES.has(key)) {
      garage(blk, lot)
      continue
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
layFreeway()
parkCars(267)
