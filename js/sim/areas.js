// The city's neighbourhoods and street names, laid out the way Los Angeles is: the Pacific to the
// west, with Santa Monica and its pier at the end of Wilshire and Venice south of it along the
// beach; the hills to the north, with Beverly Hills' estates and Hollywood's boulevards below them;
// Century City's towers round the central avenue, Mid-City's low strips and lots to the south, and
// Downtown's skyline to the east. Pure data (no DOM, no three.js, no imports, so anything can read
// it): what the city builds on each block (city.js), how it looks (render/) and where the HUD says
// the car is.

// blocks across, and m between road centre lines (as city.js: tests/areas.test.mjs checks)
const N = 18,
  PITCH = 96,
  HALF = (N / 2) * PITCH,
  ROAD_HW = 7,
  OLD = (10 / 2 - N / 2) * PITCH // (the first city's blocks are its north-west: grid.js OLD)

// Each neighbourhood: its name, and its character, which decides what is built there
//   beach: a beach town's mid-rise, two to six storeys of stucco and brick over shops, palms
//   venice: one- and two-storey bungalows and shopfronts, painted bright, murals, palms
//   estates: big houses on lawns behind hedges, drives, tall palms down every street
//   boulevard: Hollywood's strip: one to four storeys of shops, theatres, signs, a few mid-rises
//   towers: Century City's glass office towers on plazas
//   strip: Mid-City: strip malls and their car parks, gas stations, two- and three-storey
//          apartments over carports, the odd mid-rise
//   downtown: the skyline: the tallest towers, older brick and stone blocks between them
//   industrial: warehouses, factories, loading docks, truck yards, water towers on old roofs
//   port: the docks: container stacks, gantry cranes over the quay, sheds, trucks
//   suburb: one-storey houses on lawns with a drive and a car in it, low walls, street trees
//   river: the LA River's concrete channel, the streets crossing it on bridges
//   corridor: the freeway on its deck through the middle of the blocks, ramps, car parks under it
//   stadium: the stadium on its superblock, car parks round it
export const AREAS = {
  santaMonica: { name: 'Santa Monica', kind: 'beach' },
  venice: { name: 'Venice', kind: 'venice' },
  beverlyHills: { name: 'Beverly Hills', kind: 'estates' },
  hollywood: { name: 'Hollywood', kind: 'boulevard' },
  centuryCity: { name: 'Century City', kind: 'towers' },
  midCity: { name: 'Mid-City', kind: 'strip' },
  downtown: { name: 'Downtown', kind: 'downtown' },
  losFeliz: { name: 'Los Feliz', kind: 'boulevard' },
  artsDistrict: { name: 'Arts District', kind: 'industrial' },
  vernon: { name: 'Vernon', kind: 'industrial' },
  river: { name: 'LA River', kind: 'river' },
  freeway: { name: 'Santa Monica Freeway', kind: 'corridor' },
  crenshaw: { name: 'Crenshaw', kind: 'strip' },
  inglewood: { name: 'Inglewood', kind: 'suburb' },
  leimert: { name: 'Leimert Park', kind: 'suburb' },
  stadium: { name: 'Inglewood Stadium', kind: 'stadium' },
  port: { name: 'Port of Los Angeles', kind: 'port' },
  playa: { name: 'Playa del Rey', kind: 'venice' }
}
// The block grid, north (top row, bz = 0) to south, west (bx = 0) to east. The first city is the
// top-left ten by ten; the spawn is in Santa Monica on Wilshire heading east, Century City's towers
// ahead round the gridlocked block (jam.js, between the second and third roads). East of Downtown
// the LA River runs north to south down a column of its own, the Arts District's warehouses past
// it; the Santa Monica Freeway crosses the city on its deck down row 10; south of it Crenshaw's
// strips, the suburbs of Leimert Park and Inglewood round the stadium, Vernon's factories in the
// south-east, and the port in the south-west where the coast turns to quays.
const S = 'santaMonica',
  V = 'venice',
  B = 'beverlyHills',
  H = 'hollywood',
  C = 'centuryCity',
  M = 'midCity',
  D = 'downtown',
  L = 'losFeliz',
  A = 'artsDistrict',
  X = 'vernon',
  W = 'river',
  F = 'freeway',
  K = 'crenshaw',
  I = 'inglewood',
  E = 'leimert',
  T = 'stadium',
  P = 'port',
  Y = 'playa'
// prettier-ignore
const GRID = [
  [S, S, B, B, B, H, H, H, D, D, L, L, W, A, A, A, A, A],
  [S, S, B, B, B, H, H, H, D, D, L, L, W, A, A, A, A, A],
  [S, S, B, B, B, H, H, H, D, D, L, L, W, A, A, A, A, A],
  [S, S, C, C, C, M, H, D, D, D, D, D, W, A, A, A, A, A],
  [S, S, C, C, C, M, M, D, D, D, D, D, W, A, A, A, A, A],
  [S, S, C, C, C, M, M, D, D, D, D, D, W, A, A, A, A, A],
  [V, V, M, M, M, M, M, D, D, D, D, D, W, A, A, A, A, A],
  [V, V, M, M, M, M, M, M, D, D, D, D, W, X, X, X, X, X],
  [V, V, V, M, M, M, M, M, D, D, D, D, W, X, X, X, X, X],
  [V, V, V, M, M, M, M, M, D, D, K, K, W, X, X, X, X, X],
  [Y, Y, F, F, F, F, F, F, F, F, F, F, W, F, F, F, F, F],
  [Y, Y, K, K, K, K, K, K, K, K, K, K, W, X, X, X, X, X],
  [Y, Y, E, E, E, E, E, E, K, K, K, K, W, X, X, X, X, X],
  [Y, Y, E, E, E, E, E, E, T, T, I, I, W, X, X, X, X, X],
  [P, P, P, E, E, E, E, E, T, T, I, I, W, X, X, X, X, X],
  [P, P, P, E, E, E, I, I, I, I, I, I, W, X, X, X, X, X],
  [P, P, P, I, I, I, I, I, I, I, I, I, W, X, X, X, X, X],
  [P, P, P, I, I, I, I, I, I, I, I, I, W, X, X, X, X, X]
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
  'Jefferson Blvd',
  'Exposition Blvd',
  'Martin Luther King Jr Blvd',
  'Slauson Ave',
  'Florence Ave',
  'Manchester Ave',
  'Century Blvd',
  'Imperial Hwy',
  'El Segundo Blvd'
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
  'Alameda St',
  'Central Ave',
  'Santa Fe Ave',
  'Mission Rd',
  'Soto St',
  'Indiana St',
  'Atlantic Blvd',
  'Garfield Ave',
  'Eastern Ave'
]
// The landmarks, for the radar and the city's look (sim/edge.js makes what is solid out there from
// these; render/cityPier.js and cityHills.js build them). The pier runs out to sea from the
// promenade at the end of Wilshire: x, z is the middle of its run, its deck is rectangles that meet
// edge to edge (x0 < x1, z0 < z1: the long run out from the promenade's edge, the amusement park on
// its south side, the carousel's plaza on its north side, and a wider end to turn round on), and the
// Ferris wheel stands in the park by the deck. The sign stands on the face of the hills at the head of
// La Brea, the observatory on a spur east of it. The freeways run behind the sound walls on the east
// and the south: their centre lines, from end to end. (All where they stood by the first city, moved
// with it: OLD.)
const PROM = HALF + ROAD_HW + 5.5 // the promenade's outer edge (city.js PROMENADE)
const WIL = OLD // Wilshire's centre line (z)
export const LANDMARKS = {
  pier: {
    x: -627.5 + OLD,
    z: WIL,
    deck: [
      { x0: -724 + OLD, x1: -PROM, z0: WIL - 9, z1: WIL + 9 },
      { x0: -612 + OLD, x1: -536 + OLD, z0: WIL + 9, z1: WIL + 46 },
      { x0: -566 + OLD, x1: -520 + OLD, z0: WIL - 28, z1: WIL - 9 },
      { x0: -762.5 + OLD, x1: -724 + OLD, z0: WIL - 16, z1: WIL + 16 }
    ],
    wheel: { x: -588 + OLD, z: WIL + 21 }
  },
  sign: { x: 2 * PITCH + OLD, z: -680 + OLD },
  observatory: { x: 400 + OLD, z: -640 + OLD },
  freeways: [
    { x0: HALF + 52, z0: -1500 + OLD, x1: HALF + 52, z1: 2000 - OLD },
    { x0: -HALF + 10, z0: HALF + 52, x1: 2000 - OLD, z1: HALF + 52 }
  ]
}
export { OLD }

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
    const port = z > (13 - N / 2) * PITCH
    out.area = port ? 'Port of Los Angeles' : 'Santa Monica Beach'
    out.street = Math.abs(z - LANDMARKS.pier.z) < 12 ? 'Santa Monica Pier' : ''
    return out
  }
  if (z < -HALF - ROAD_HW - 6) {
    out.area = 'Hollywood Hills'
    out.street = x > -HALF && x < HALF ? 'Mulholland Dr' : ''
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
