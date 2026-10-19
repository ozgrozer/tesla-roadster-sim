// Where Los Angeles works: the Arts District's and Vernon's warehouses, factories and truck yards
// east of the river, and the port in the south-west, where the coast turns to quays. A warehouse is a
// long low shed of corrugated metal or tilt-up concrete behind a chain-link fence, loading docks
// down one side with trailers backed up to them; a factory has its chimneys and tanks; the old brick
// lofts of the Arts District carry water towers on their roofs and murals on their walls; a truck
// yard is rows of trailers on asphalt round a little office. The port's blocks are container
// stacks in rows with straddle lanes between, the superblock its container yard. Pure data, as
// plots.js.
import {
  R,
  TINTS,
  pick,
  range,
  chance,
  building,
  tier,
  ground,
  solid,
  hedge,
  post,
  prop,
  stalls,
  free,
  STALLS,
  palm,
  tree
} from './plots.js'
import { mural, roofSign } from './towers.js'
import { billboard } from './strip.js'

// the sheds' cladding: corrugated metal (pale greys, a faded blue or green) or concrete panels
export const METAL = [
  0xc9ccce,
  0xb8bfc4,
  0xa9b6be,
  0x9fb2a6,
  0xd2cbbd,
  0x8e9aa6
]
export const CONCRETE = [0xd9d4c9, 0xcfcac0, 0xc4c1ba, 0xe0dacd]
// the boxes' colours (an index each into the renderer's palette)
const BOXES = 10

// A chain-link fence round [x0, x1] x [z0, z1], open for a gate gw wide in the middle of side
// gate (0 north, 1 east, 2 south, 3 west), 2.2 m tall: solid, drawn as mesh on posts
export function fence (x0, x1, z0, z1, gate = 2, gw = 12) {
  const h = 2.2,
    t = 0.12
  const run = (a, b, along, c, s) => {
    const m = (a + b) / 2
    const parts =
      s === gate
        ? [
            [a, m - gw / 2],
            [m + gw / 2, b]
          ]
        : [[a, b]]
    for (const [u, v] of parts)
      if (v - u > 0.5)
        along
          ? hedge(u, v, c - t, c + t, h, 'chain')
          : hedge(c - t, c + t, u, v, h, 'chain')
  }
  run(x0, x1, true, z0, 0)
  run(z0, z1, false, x1, 1)
  run(x0, x1, true, z1, 2)
  run(z0, z1, false, x0, 3)
}

// a trailer (13.6 m, a cab on it or not) parked at (x, z) heading yaw: solid, not landable
export function trailer (
  x,
  z,
  yaw,
  cab = chance(0.4),
  c = Math.floor(R() * BOXES)
) {
  const along = Math.abs(Math.cos(yaw)) > 0.5,
    L = cab ? 18.5 : 13.6,
    hw = along ? L / 2 : 1.3,
    hd = along ? 1.3 : L / 2
  solid(x - hw, x + hw, z - hd, z + hd, 0, 4, 'plant', 'prop')
  prop('trailer', { x, z, yaw, cab, c })
}

// A stack of n shipping containers (each 2.59 m high, 12.2 or 6.1 m long, 2.44 m wide) at (x, z),
// along x (yaw 0) or z: solid and landable, as a roof
export function containers (x, z, yaw, n, long = true) {
  const L = long ? 12.2 : 6.1,
    along = yaw === 0,
    hw = along ? L / 2 : 1.22,
    hd = along ? 1.22 : L / 2
  const h = n * 2.59
  solid(x - hw, x + hw, z - hd, z + hd, 0, h, 'building', 'prop')
  const c = []
  for (let i = 0; i < n; i++) c.push(Math.floor(R() * BOXES))
  prop('container', { x, z, yaw, L, n, c })
}

// a shed: one big box with a low parapet, metal or concrete, its loading docks down side s
function shed (blk, x0, x1, z0, z1, h, s, area) {
  const metal = chance(0.6)
  const b = building(area, {
    style: metal ? 'metal' : 'concrete',
    tint: pick(metal ? METAL : CONCRETE),
    u: R()
  })
  tier(b, x0, x1, z0, z1, 0, h)
  if (chance(0.25)) b.antenna = false
  // the docks: roll-up doors every 4.5 m down the dock side, a trailer backed up to some
  const along = s % 2 === 0
  const a = along ? x0 : z0,
    e = along ? x1 : z1
  const c = s === 0 ? z0 : s === 1 ? x1 : s === 2 ? z1 : x0
  const out = s === 0 || s === 3 ? -1 : 1
  for (let u = a + 4; u < e - 3; u += 4.5) {
    const x = along ? u : c,
      z = along ? c : u
    prop('dock', { x, z, face: s, w: 3.2, h: 3.6 })
    if (chance(0.35)) {
      const d = out * 7.6,
        tx = along ? x : c + d,
        tz = along ? c + d : z
      trailer(tx, tz, along ? Math.PI / 2 : 0, false)
    }
  }
  ground(
    blk,
    'asphalt',
    ...(along
      ? [x0, x1, s === 0 ? z0 - 18 : z1, s === 0 ? z0 : z1 + 18]
      : [s === 3 ? x0 - 18 : x1, s === 3 ? x0 : x1 + 18, z0, z1])
  )
  return b
}

// a water tower on the roof of b: a wooden tank on steel legs (solid)
export function waterTower (b) {
  const t = b.tiers[b.tiers.length - 1]
  if (t.x1 - t.x0 < 10 || t.z1 - t.z0 < 10) return
  const x = range(t.x0 + 4, t.x1 - 4),
    z = range(t.z0 + 4, t.z1 - 4),
    r = range(2.2, 3.2),
    h = range(4, 6)
  b.water = prop('watertower', { x, z, y: t.y1, r, h, legs: range(4, 6) })
}

// ---------- the Arts District and Vernon ----------
export function industrial (blk, lot) {
  blk.base = 'asphalt'
  const { x0, x1, z0, z1 } = lot
  const area = 'industrial'
  const kind = R()
  const arts = blk.bz < 7 // (the Arts District: older brick among the sheds)
  if (arts && kind < 0.4) {
    // brick lofts, three to seven storeys, round a yard: water towers, murals, a sign on one
    const cuts = [x0, (x0 + x1) / 2 + range(-8, 8), x1]
    for (let i = 0; i < 2; i++)
      for (const [za, zb] of [
        [z0, z0 + range(24, 30)],
        [z1 - range(24, 30), z1]
      ]) {
        const b = building(area, {
          style: 'brick',
          tint: pick(TINTS.brick),
          shop: chance(0.5)
        })
        const h = range(11, 26)
        // (a 3 m service alley between the two: wide enough for a car to fall into)
        tier(b, cuts[i] + 0.4, cuts[i + 1] - 2.6, za + 0.4, zb - 0.4, 0, h)
        if (chance(0.6)) waterTower(b)
        if (chance(0.5)) mural(b, i === 0 ? 3 : 1)
        if (h > 20 && chance(0.25)) roofSign(b, za === z0 ? 0 : 2, 'hotel')
      }
    ground(blk, 'concrete', x0, x1, z0 + 30, z1 - 30)
    for (let x = x0 + 6; x < x1 - 4; x += 9) tree(x, (z0 + z1) / 2, 0.7)
    // (the residents' cars nose in along the yard)
    stalls(0, x0 + 4, x1 - 4, z0 + 33, -1, 0.7)
    stalls(0, x0 + 4, x1 - 4, z1 - 33, 1, 0.7)
    return
  }
  if (kind < 0.62) {
    // one big distribution shed, docks down its long side, a car park for the staff
    const s = chance(0.5) ? 0 : 2
    const za = s === 0 ? z0 + 22 : z0 + 4,
      zb = s === 0 ? z1 - 4 : z1 - 22
    shed(blk, x0 + 4, x1 - 4, za, zb, range(9, 13), s, area)
    fence(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, s)
    return
  }
  if (kind < 0.8) {
    // a factory: its shed, a taller block, chimneys and tanks
    const b = shed(
      blk,
      x0 + 4,
      x1 - 30,
      z0 + 6,
      z1 - 20,
      range(10, 15),
      2,
      area
    )
    b.saw = true // (a sawtooth roof's north lights: drawn as ridges)
    const top = range(18, 26)
    const t = building(area, { style: 'concrete', tint: pick(CONCRETE) })
    tier(t, x1 - 26, x1 - 6, z0 + 6, z0 + 26, 0, top)
    if (chance(0.5)) waterTower(t)
    for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
      const x = x1 - 22 + i * 7,
        z = z0 + 34,
        h = range(28, 44)
      post(x, z, 1.1, h, 'stack')
      prop('stack', { x, z, r: 1.1, h, bands: chance(0.6) })
    }
    for (let i = 0; i < 2 + Math.floor(R() * 3); i++) {
      const r = range(3, 5),
        h = range(6, 12),
        x = x1 - 22 + (i % 2) * 11,
        z = z0 + 46 + Math.floor(i / 2) * 11
      if (z + r > z1 - 1) break
      solid(
        x - r * 0.8,
        x + r * 0.8,
        z - r * 0.8,
        z + r * 0.8,
        0,
        h,
        'building',
        'prop'
      )
      prop('tank', { x, z, r, h, c: R() })
    }
    // (the staff car park between the works and the gate)
    const n = STALLS.length
    stalls(0, x0 + 6, x1 - 32, z1 - 10, -1, 0.7)
    // (not where a trailer stands backed up to a dock)
    for (let i = STALLS.length - 1; i >= n; i--)
      if (!free(STALLS[i].x, STALLS[i].z, 2.4)) STALLS.splice(i, 1)
    fence(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, 2)
    return
  }
  // a truck yard: trailers in rows, an office at the gate, a billboard over the fence
  ground(blk, 'asphalt', x0, x1, z0, z1)
  const off = building(area, {
    style: 'concrete',
    tint: pick(CONCRETE),
    shop: false
  })
  tier(off, x0 + 3, x0 + 17, z1 - 13, z1 - 3, 0, range(4, 7.5))
  for (let x = x0 + 22; x < x1 - 4; x += 4.2)
    for (const z of [z0 + 10, z0 + 34])
      if (chance(0.7)) trailer(x, z, Math.PI / 2, chance(0.25))
  stalls(0, x0 + 20, x1 - 2, z1 - 6, 1, 0.5)
  fence(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, 2)
  if (chance(0.5)) billboard(x0 + 8, z0 + 8, 0)
}

// ---------- the port ----------
// rows of container stacks, two to five high, with lanes between for the straddle carriers; a
// shed or two; on the superblock, the container yard itself
export function port (blk, lot) {
  blk.base = 'asphalt'
  const { x0, x1, z0, z1 } = lot
  ground(blk, 'asphalt', x0, x1, z0, z1)
  const yard = blk.super
  if (!yard && chance(0.35)) {
    shed(blk, x0 + 4, x1 - 4, z0 + 4, z0 + 40, range(10, 14), 2, 'port')
    for (let x = x0 + 8; x < x1 - 8; x += 14)
      containers(x, z1 - 10, 0, 1 + Math.floor(R() * 3))
    fence(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, 2)
    return
  }
  // rows along x, 12.2 m boxes end to end, 2.44 wide, rows in pairs with a lane between pairs
  for (let z = z0 + 6; z < z1 - 4; z += 9) {
    for (let x = x0 + 8; x < x1 - 7; x += 12.8) {
      if (chance(0.12)) continue
      containers(x, z, 0, 1 + Math.floor(R() * (yard ? 5 : 4)))
      if (chance(0.8)) containers(x, z + 2.6, 0, 1 + Math.floor(R() * 4))
    }
  }
  // (floodlight masts over the yard)
  for (const [x, z] of [
    [x0 + 2, z0 + 2],
    [x1 - 2, z1 - 2]
  ]) {
    post(x, z, 0.5, 30, 'mast')
    prop('mast', { x, z, h: 30 })
  }
  fence(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, 1, 14)
  if (!yard) palm(x0 + 2, z1 - 2, 18, true)
}
