// The city's own vehicles among the ordinary traffic, mixed into Traffic (traffic.js). In place of
// about two vans in five, a delivery box truck (delivery.js: its stops); of the sedans, now and
// then a lowrider (an early-'60s hardtop on wire wheels), most often in Mid-City and the south and
// east of the map, and a stretch limousine in Beverly Hills and Hollywood. (The ambulances and the
// fire engines go out only on calls: calls.js.) The swaps draw on random numbers of their own
// (fleetR), so the traffic's own sequence, which types come and where, is as it was.
import { N, PITCH } from './grid.js'
import { areaOf } from './areas.js'
import { rng } from './city.js'
import { TYPES } from './carTypes.js'

const TRUCKS = 0.4 // of the vans, the share that are box trucks
// of the sedans, the share that are lowriders, and limousines, by neighbourhood (areas.js)
// prettier-ignore
const LOW = { midCity: 0.12, downtown: 0.07, venice: 0.035, hollywood: 0.02, centuryCity: 0.015, santaMonica: 0.01, beverlyHills: 0.005 }
// prettier-ignore
const LIMO = { beverlyHills: 0.09, hollywood: 0.07, centuryCity: 0.03, santaMonica: 0.02, downtown: 0.015, midCity: 0.004, venice: 0.004 }
const SOUTH = 6 // (from this row of blocks down, half as many lowriders again)

const OUT = new Set(['bus', 'ambulance', 'fire', 'limo']) // (parked in a lot as a sedan)

// (the block a coordinate is in, across the grid or down it)
const block = v => Math.floor(v / PITCH + N / 2)

// The random numbers of the city's own vehicles, each kept apart from the traffic's (Traffic.R) and
// from each other: fleetR, which types are swapped; dropR, which box trucks stop where, how long
export const streams = seed => ({
  fleetR: rng(seed * 577 + 91),
  dropR: rng(seed * 613 + 29)
})

export const FLEET = {
  // the type to put on the road (or in a lot) at (x, z), for type as pickType drew it: the same,
  // or one of the city's own in its place
  fleet (type, x, z) {
    const K = this.idx
    if (type === K.van) return this.fleetR() < TRUCKS ? K.truck : type
    if (type !== K.sedan) return type
    const bz = block(z),
      area = areaOf(block(x), bz)
    const r = this.fleetR(),
      low = (LOW[area] || 0) * (bz >= SOUTH ? 1.5 : 1)
    if (r < low) return K.lowrider
    return r < low + (LIMO[area] || 0) ? K.limo : type
  },
  // one of the city's own long ones, which take their turns with more care (drivers.js; the bus,
  // as long, keeps its old ways)
  long (car) {
    return car.len > 7.5 && car.type !== this.bus
  },
  // what a car of this type parks as in a lot (conditions.js, and those parked at the start): what
  // won't fit a space as a sedan (a bus, an ambulance, a fire engine, a limousine), a box truck as a
  // van
  lotType (type) {
    const K = this.idx
    if (type === K.truck) return K.van
    return OUT.has(TYPES[type].name) ? 0 : type
  },
  // the type of a car parked in a lot at (x, z) at the start, as pickType draws it (with R) and
  // fleet swaps it
  lotPick (R, x, z) {
    return this.lotType(this.fleet(this.pickType(true, R), x, z))
  }
}
