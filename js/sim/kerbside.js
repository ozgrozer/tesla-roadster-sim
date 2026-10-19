// What stands along the pavements, by the neighbourhood behind them. A street light every 24 m on
// both sides (a cobra head on a steel pole; on Mid-City's and Venice's side streets, on one side, on
// a wooden power pole carrying the wires along the street and over the junctions), and in a line a
// little further in, palms and trees: tall, thin Mexican fan palms every 12 m down the main
// boulevards, Ocean Avenue's promenade and every street in Beverly Hills, stouter date palms on
// Santa Monica's and Venice's side streets, a scattering of tall palms on Mid-City's main streets,
// and round street trees downtown and on Hollywood's and Mid-City's side streets. Bus benches on the
// main streets, a hydrant by most corners, litter bins on the shopping streets (these three only to
// look at).
import { N, ROADS, ROAD_HW, STOP, segOpen, BLVD_EW, BLVD_NS } from './grid.js'
import { BLOCKS, TREES, PALMS } from './lots.js'
import { R, MAIN, prop } from './plots.js'

export const LAMPS = [] // street lights: { x, z, ax, az, wood } with the arm pointing (ax, az) over the road
// the wires between wooden poles: [i, j], each a pair of indices into LAMPS
export const WIRES = []
// things on the pavement only to look at: { kind: 'bench', 'hydrant' or 'bin', x, z, yaw }
export const DECOR = []
export { TREES, PALMS }
// the first city's square (grid.js OLD): its kerbside as it was
const OLD_C = (ROADS[0] + ROADS[10]) / 2,
  OLD_R = (ROADS[10] - ROADS[0]) / 2 + ROAD_HW

// what is behind the pavement on one side of a street: the neighbourhood's kind, or 'park' or
// 'parking', or 'west', 'north', 'east', 'south' for the promenade round the outside
function behind (bx, bz) {
  if (bx < 0) return 'west'
  if (bx >= N) return 'east'
  if (bz < 0) return 'north'
  if (bz >= N) return 'south'
  const b = BLOCKS[bz * N + bx]
  return b.kind === 'city' ? b.area : b.kind
}
// what grows along a pavement: 'fan' palms every 12 m, every 24 m ('fan24'), 'date' palms every
// 24 m, 'trees' every 12 or 24 m ('trees24'), or nothing
function planting (area, main) {
  switch (area) {
    case 'estates':
    case 'west':
      return 'fan'
    case 'beach':
    case 'venice':
    case 'towers':
      return main ? 'fan' : 'date'
    case 'boulevard':
      return main ? 'fan' : 'trees24'
    case 'strip':
      return main ? 'fan24' : 'trees24'
    case 'parking':
      return main ? 'fan24' : ''
    case 'downtown':
      return main ? 'fan24' : 'trees24'
    case 'suburb':
      return main ? 'fan24' : 'trees'
    case 'industrial':
    case 'port':
    case 'corridor':
      return main ? 'trees24' : ''
    case 'stadium':
      return 'fan'
    case 'river':
      return ''
    case 'north':
      return 'date'
    default:
      return 'trees24'
  }
}
// sides of streets where the power lines run, on wooden poles
const POWER = new Set(['strip', 'venice', 'suburb', 'industrial', 'port'])
// the last pole along each side of each street so far, to wire the next block's first one to
const lastWood = new Map()
const key = (c, side, alongZ) => `${c} ${side} ${alongZ}`
const along = (p, alongZ) => (alongZ ? p.z : p.x)

for (let i = 0; i <= N; i++)
  for (let j = 0; j < N; j++) {
    const c = ROADS[i],
      a = ROADS[j] + STOP + 3,
      b = ROADS[j + 1] - STOP - 3
    for (const side of [-1, 1]) {
      // (the blocks behind: along the road that runs along z at x = c, then along x at z = c)
      const k = side < 0 ? i - 1 : i
      for (const alongZ of [true, false]) {
        if (!segOpen(i, j, alongZ)) continue // (a superblock's closed street: grid.js)
        const area = alongZ ? behind(k, j) : behind(j, k)
        const main = (alongZ ? MAIN.NS : MAIN.EW).has(i)
        const other = alongZ
          ? behind(side < 0 ? i : i - 1, j)
          : behind(j, side < 0 ? i : i - 1)
        // power on one side of a street only: the north or west side, unless only the other has it
        const wood = !main && POWER.has(area) && (side < 0 || !POWER.has(other))
        lay(c, a, b, side, alongZ, area, main, wood)
      }
    }
  }

// palms down the boulevards' medians, every 24 m between the junctions (render/cityGround.js draws
// the median; median: true)
for (let i = 0; i <= N; i++)
  for (let j = 0; j < N; j++)
    for (const alongZ of [true, false]) {
      if (!(alongZ ? BLVD_NS : BLVD_EW).has(i) || !segOpen(i, j, alongZ)) continue
      for (let t = ROADS[j] + STOP + 14; t < ROADS[j + 1] - STOP - 8; t += 24) {
        const p = alongZ ? { x: ROADS[i], z: t } : { x: t, z: ROADS[i] }
        PALMS.push({ ...p, h: 14 + R() * 8, fan: true, median: true })
      }
    }

// one side of one block's length of street: c the road's centre line, a to b along it
function lay (c, a, b, side, alongZ, area, main, wood) {
  const at = (t, off) => {
    const o = c + side * (ROAD_HW + off)
    return alongZ ? { x: o, z: t } : { x: t, z: o }
  }
  const ax = alongZ ? -side : 0,
    az = alongZ ? 0 : -side
  const plant = planting(area, main)
  let first = -1
  for (let t = a + 4; t < b; t += 24) {
    // the street light (on a power pole: wired to the last one)
    const p = at(t, 0.6)
    LAMPS.push({ x: p.x, z: p.z, ax, az, wood })
    if (wood) {
      const n = LAMPS.length - 1
      if (first < 0) first = n
      else WIRES.push([n - 1, n])
    }
    // palms and trees in a line further in
    for (const dt of plant === 'fan' || plant === 'trees' ? [6, 18] : [12]) {
      if (t + dt >= b || !plant) continue
      const q = at(t + dt, 1.6)
      if (plant.startsWith('trees'))
        TREES.push({ ...q, s: 0.72 + R() * 0.3, street: true })
      else if (plant === 'date')
        PALMS.push({ ...q, h: 8 + R() * 5, fan: false })
      else PALMS.push({ ...q, h: 21 + R() * 9, fan: true })
    }
  }
  // (the wires carry on over the junction to the next block's first pole along this side)
  if (wood && first >= 0) {
    const prev = lastWood.get(key(c, side, alongZ))
    if (
      prev !== undefined &&
      Math.abs(along(LAMPS[prev], alongZ) - along(LAMPS[first], alongZ)) < 60
    )
      WIRES.push([prev, first])
    lastWood.set(key(c, side, alongZ), LAMPS.length - 1)
  } else lastWood.delete(key(c, side, alongZ))
  // a bus bench on the main streets, a hydrant near the corner, a bin on the shopping streets
  const shops = ['beach', 'boulevard', 'downtown', 'towers', 'venice'].includes(
    area
  )
  const yaw = Math.atan2(-az, ax) // (the way the bench faces: the road)
  // (on the main streets a bus stop: in the old city a bench, in the new a shelter over it)
  if (main && R() < 0.6) {
    const p = at(a + 16, 2.1)
    if (Math.max(Math.abs(p.x - OLD_C), Math.abs(p.z - OLD_C)) > OLD_R)
      prop('shelter', { ...at(a + 16, 2.4), yaw })
    else DECOR.push({ kind: 'bench', ...p, yaw })
  }
  if (R() < 0.7) DECOR.push({ kind: 'hydrant', ...at(a + 1.5, 0.5), yaw })
  if (shops && R() < 0.7) DECOR.push({ kind: 'bin', ...at(a + 22, 0.55), yaw })
}
