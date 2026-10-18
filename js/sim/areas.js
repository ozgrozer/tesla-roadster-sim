// The city's neighbourhoods and street names, laid out the way Los Angeles is: the Pacific to the
// west, with Santa Monica and its pier at the end of Wilshire and Venice south of it along the
// beach; the hills to the north, with Beverly Hills' estates and Hollywood's boulevards below them;
// Century City's towers round the central avenue, Mid-City's low strips and lots to the south, and
// Downtown's skyline to the east. Pure data (no DOM, no three.js, no imports, so anything can read
// it): what the city builds on each block (city.js), how it looks (render/) and where the HUD says
// the car is.

// blocks across, and m between road centre lines (as city.js: tests/areas.test.mjs checks)
const N = 10,
  PITCH = 96,
  HALF = (N / 2) * PITCH,
  ROAD_HW = 7

// Each neighbourhood: its name, and its character, which decides what is built there
//   beach: a beach town's mid-rise, two to six storeys of stucco and brick over shops, palms
//   venice: one- and two-storey bungalows and shopfronts, painted bright, murals, palms
//   estates: big houses on lawns behind hedges, drives, tall palms down every street
//   boulevard: Hollywood's strip: one to four storeys of shops, theatres, signs, a few mid-rises
//   towers: Century City's glass office towers on plazas
//   strip: Mid-City: strip malls and their car parks, gas stations, two- and three-storey
//          apartments over carports, the odd mid-rise
//   downtown: the skyline: the tallest towers, older brick and stone blocks between them
export const AREAS = {
  santaMonica: { name: 'Santa Monica', kind: 'beach' },
  venice: { name: 'Venice', kind: 'venice' },
  beverlyHills: { name: 'Beverly Hills', kind: 'estates' },
  hollywood: { name: 'Hollywood', kind: 'boulevard' },
  centuryCity: { name: 'Century City', kind: 'towers' },
  midCity: { name: 'Mid-City', kind: 'strip' },
  downtown: { name: 'Downtown', kind: 'downtown' }
}
// The block grid, north (top row, bz = 0) to south, west (bx = 0) to east. The spawn is in Santa
// Monica on Wilshire (the central avenue) heading east, Century City's towers ahead round the
// gridlocked block (jam.js, between the second and third roads).
const S = 'santaMonica',
  V = 'venice',
  B = 'beverlyHills',
  H = 'hollywood',
  C = 'centuryCity',
  M = 'midCity',
  D = 'downtown'
// prettier-ignore
const GRID = [
  [S, S, B, B, B, H, H, H, D, D],
  [S, S, B, B, B, H, H, H, D, D],
  [S, S, B, B, B, H, H, H, D, D],
  [S, S, C, C, C, M, H, D, D, D],
  [S, S, C, C, C, M, M, D, D, D],
  [S, S, C, C, C, M, M, D, D, D],
  [V, V, M, M, M, M, M, D, D, D],
  [V, V, M, M, M, M, M, M, D, D],
  [V, V, V, M, M, M, M, M, D, D],
  [V, V, V, M, M, M, M, M, D, D]
]
// the key of the neighbourhood a block (bx, bz) is in
export const areaOf = (bx, bz) =>
  GRID[Math.max(0, Math.min(N - 1, bz))][Math.max(0, Math.min(N - 1, bx))]

// The edges of the map: the ocean and its beach to the west (past the ring road), the hills to the
// north, and more city to the east and south, out of reach beyond the ring road.
export const COAST = 'west'
export const HILLS = 'north'

// Street names. East-west streets (along x, at z = road centre), north to south: the ring road at
// the foot of the hills, Wilshire down the middle (it runs from Downtown to the ocean), Jefferson
// along the south. North-south streets (along z, at x = road centre), west to east: Ocean Avenue
// along the beach, La Cienega down the middle, Alameda past Downtown.
export const STREETS_EW = [
  'Franklin Ave',
  'Hollywood Blvd',
  'Sunset Blvd',
  'Santa Monica Blvd',
  'Melrose Ave',
  'Wilshire Blvd',
  'Olympic Blvd',
  'Pico Blvd',
  'Venice Blvd',
  'Washington Blvd',
  'Jefferson Blvd'
]
export const STREETS_NS = [
  'Ocean Ave',
  'Lincoln Blvd',
  'Sepulveda Blvd',
  'Westwood Blvd',
  'Beverly Dr',
  'La Cienega Blvd',
  'Fairfax Ave',
  'La Brea Ave',
  'Vine St',
  'Figueroa St',
  'Alameda St'
]
// The landmarks, for the radar and the city's look (sim/edge.js makes what is solid out there from
// these; render/cityPier.js and cityHills.js build them). The pier runs out to sea from the
// promenade at the end of Wilshire: x, z is the middle of its run, its deck is rectangles that meet
// edge to edge (x0 < x1, z0 < z1: the long run out from the promenade's edge, the amusement park on
// its south side, the carousel's plaza on its north side, and a wider end to turn round on), and the
// Ferris wheel stands in the park by the deck. The sign stands on the face of the hills at the head of
// La Brea, the observatory on a spur east of it. The freeways run behind the sound walls on the east
// and the south: their centre lines, from end to end.
const PROM = HALF + ROAD_HW + 5.5 // the promenade's outer edge (city.js PROMENADE)
export const LANDMARKS = {
  pier: {
    x: -627.5,
    z: 0,
    deck: [
      { x0: -724, x1: -PROM, z0: -9, z1: 9 },
      { x0: -612, x1: -536, z0: 9, z1: 46 },
      { x0: -566, x1: -520, z0: -28, z1: -9 },
      { x0: -762.5, x1: -724, z0: -16, z1: 16 }
    ],
    wheel: { x: -588, z: 21 }
  },
  sign: { x: 2 * PITCH, z: -680 },
  observatory: { x: 400, z: -640 },
  freeways: [
    { x0: 532, z0: -1500, x1: 532, z1: 2000 },
    { x0: -470, z0: 532, x1: 2000, z1: 532 }
  ]
}

// Where (x, z) is, as the HUD says it: the neighbourhood, and the street (or the crossing, at a
// junction) the car is on or beside; off the grid, the beach or the hills.
const _out = { area: '', street: '', cross: '' }
export function whereIs (x, z, out = _out) {
  const ix = Math.round(x / PITCH + N / 2),
    iz = Math.round(z / PITCH + N / 2)
  const dx = Math.abs(x - (ix - N / 2) * PITCH),
    dz = Math.abs(z - (iz - N / 2) * PITCH)
  const onX = ix >= 0 && ix <= N && dx < ROAD_HW + 6, // beside a north-south street
    onZ = iz >= 0 && iz <= N && dz < ROAD_HW + 6
  const bx = Math.floor(x / PITCH + N / 2),
    bz = Math.floor(z / PITCH + N / 2)
  out.cross = ''
  if (x < -HALF - ROAD_HW - 6) {
    out.area = 'Santa Monica Beach'
    out.street = Math.abs(z - LANDMARKS.pier.z) < 12 ? 'Santa Monica Pier' : ''
    return out
  }
  out.area = AREAS[areaOf(bx, bz)].name
  if (onX && onZ) {
    out.street = STREETS_EW[iz]
    out.cross = STREETS_NS[ix]
  } else if (onX && !(onZ && dz < dx)) out.street = STREETS_NS[ix]
  else if (onZ) out.street = STREETS_EW[iz]
  // (inside a block: the nearer of the streets round it)
  else
    out.street =
      dx < dz
        ? STREETS_NS[Math.max(0, Math.min(N, ix))]
        : STREETS_EW[Math.max(0, Math.min(N, iz))]
  return out
}
