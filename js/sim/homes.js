// Where people live in houses. Beverly Hills: big two-storey houses on lawns, back to back down the
// middle of each block, Spanish revival (white stucco under red clay tile hip roofs, a one-storey
// garage wing out the back) or modern boxes (glass below, a white box above standing out over the
// lawn), behind hedges along the pavement, a drive down one side and a pool out the back. Venice:
// one-storey bungalows on narrow lots, painted bright, behind low hedges, with now and then a
// two-storey modern box among them, and a row of bright shopfronts with murals on their side walls
// along the boulevard and facing the beach.
import {
  R,
  TINTS,
  pick,
  range,
  chance,
  building,
  tier,
  ground,
  palm,
  tree,
  hedge,
  frame,
  isMain
} from './plots.js'
import { mural } from './towers.js'

const SHOP = 4.6
const FLOOR = 3.5

// ---------- Beverly Hills ----------
// A house on the lot from u0 to u1 along side s's street, D deep (f: that side's frame); drive:
// the side the drive runs down (-1 near u0, 1 near u1)
function bigHouse (blk, f, s, u0, u1, D, drive) {
  const W = u1 - u0,
    dw = 3.4
  const w = range(13, W - 8),
    d = range(11, 14.5),
    sb = range(7, 10)
  const du = drive < 0 ? u0 + 1.2 : u1 - 1.2 - dw
  const hu = drive < 0 ? du + dw + 1.4 : du - 1.4 - w
  const spanish = chance(0.66)
  const b = building('estates', {
    style: 'house',
    tint: spanish ? pick(TINTS.white) : pick([0xf4f4f2, 0xe3e5e6, 0xd7d4cf]),
    roofs: spanish ? 'tile' : 'flat'
  })
  const two = !spanish || chance(0.75)
  const h = two ? 2 * FLOOR : FLOOR + 0.4
  if (spanish) {
    const m = f(hu, hu + w, sb, sb + d)
    tier(b, m[0], m[1], m[2], m[3], 0, h, {
      hip: 0.42 * (Math.min(w, d) / 2),
      eave: 0.6
    })
    // the garage wing out the back, at the end of the drive
    const gw = 7,
      g =
        drive < 0
          ? f(hu, hu + gw, sb + d, sb + d + 6.5)
          : f(hu + w - gw, hu + w, sb + d, sb + d + 6.5)
    tier(b, g[0], g[1], g[2], g[3], 0, FLOOR - 0.3, { hip: 1.3, eave: 0.45 })
  } else {
    // glass below, a white box above standing out over the lawn
    const m = f(hu, hu + w, sb, sb + d)
    tier(b, m[0], m[1], m[2], m[3], 0, FLOOR + 0.3, {
      style: 'glass',
      tint: 0xd5dde2
    })
    const top = f(hu + 1.5, hu + w - 1, sb - 2.5, sb + d - 2)
    tier(b, top[0], top[1], top[2], top[3], FLOOR + 0.3, 2 * FLOOR + 0.6)
  }
  // the drive, the path to the front door and the pool out the back
  ground(blk, 'concrete', ...f(du, du + dw, 0, sb + d + 6.5))
  const door = hu + w * range(0.35, 0.65)
  ground(blk, 'concrete', ...f(door - 0.7, door + 0.7, 1.4, sb))
  b.door = { ...at(f, door, sb), face: s, k: R() }
  const pw = range(7, 10),
    pd = range(3.6, 5),
    pv = sb + d + range(3, 5)
  if (pv + pd < D - 1.5) {
    const pu = drive < 0 ? hu + w - pw - 1 : hu + 1
    ground(blk, 'pool', ...f(pu, pu + pw, pv, pv + pd))
  }
  // the hedge along the pavement, open for the drive and the path
  const hh = chance(0.35) ? range(2.6, 3.6) : range(1.2, 2.2),
    wall = chance(0.2)
  const stretch = (a, c) => {
    if (c - a > 0.8)
      hedge(
        ...f(a, c, 0.3, wall ? 0.75 : 1.3),
        wall ? 1 : hh,
        wall ? 'wall' : 'hedge'
      )
  }
  const gaps = [
    [du - 0.2, du + dw + 0.2],
    [door - 0.9, door + 0.9]
  ].sort((a, c) => a[0] - c[0])
  stretch(u0 + 0.3, gaps[0][0])
  stretch(gaps[0][1], gaps[1][0])
  stretch(gaps[1][1], u1 - 0.3)
  // a palm on the front lawn, a tree behind
  const pu = drive < 0 ? u1 - 3 : u0 + 3
  if (chance(0.6)) palm(...pt(f, pu, sb * 0.55), 17 + R() * 9, true)
  if (chance(0.5))
    tree(...pt(f, drive < 0 ? u1 - 4 : u0 + 4, D - 4), 0.8 + R() * 0.4)
}
// the world point u along and v in, in frame f: as [x, z], and as { x, z }
function pt (f, u, v) {
  const b = f(u, u, v, v)
  return [b[0], b[2]]
}
function at (f, u, v) {
  const [x, z] = pt(f, u, v)
  return { x, z }
}

export function beverlyHills (blk, lot) {
  blk.base = 'grass'
  const L = lot.x1 - lot.x0
  // back to back: the houses face one pair of opposite streets, their side yards the other
  const sides = chance(0.5) ? [0, 2] : [1, 3]
  const n = 3,
    W = L / n,
    D = L / 2
  for (const s of sides) {
    const f = frame(lot, s)
    for (let i = 0; i < n; i++)
      bigHouse(
        blk,
        f,
        s,
        i * W,
        (i + 1) * W,
        D,
        i === 0 ? 1 : i === n - 1 ? -1 : chance(0.5) ? 1 : -1
      )
  }
  // hedges along the side streets
  for (const s of [0, 1, 2, 3].filter(s => !sides.includes(s))) {
    const f = frame(lot, s),
      hh = range(1.4, 3)
    hedge(...f(0.3, L / 2 - 1, 0.3, 1.3), hh)
    hedge(...f(L / 2 + 1, L - 0.3, 0.3, 1.3), hh)
  }
}

// ---------- Venice ----------
// a bungalow from u0 to u1 along the street on side s (f: its frame), D deep
function bungalow (blk, f, s, u0, u1, D) {
  const W = u1 - u0
  const w = Math.min(W - 2.6, range(7.5, 9.5)),
    d = range(9, 13),
    sb = range(4, 6)
  const hu = u0 + (W - w) / 2 + range(-0.6, 0.6)
  const m = f(hu, hu + w, sb, sb + d)
  let b
  if (chance(0.22)) {
    // a modern two-storey box among them
    b = building('venice', {
      style: 'stucco',
      tint: chance(0.5) ? pick(TINTS.white) : pick(TINTS.bright)
    })
    tier(b, m[0], m[1], m[2], m[3], 0, 2 * FLOOR + 0.4)
  } else {
    b = building('venice', {
      style: 'house',
      tint: pick(TINTS.bright),
      roofs: 'shingle'
    })
    tier(b, m[0], m[1], m[2], m[3], 0, range(3.6, 4.2), {
      hip: range(1.4, 2),
      eave: 0.5
    })
    if (chance(0.12)) mural(b, chance(0.5) ? 1 : 3)
  }
  b.door = { ...at(f, hu + w / 2, sb), face: s, k: R() }
  // a garage or a little back house at the end of the yard
  if (chance(0.55)) {
    const g = building('venice', {
      style: 'stucco',
      tint: pick(chance(0.5) ? TINTS.bright : TINTS.white)
    })
    const gw = Math.min(W - 2.4, range(5.5, 7))
    const r = f(u0 + 1.2, u0 + 1.2 + gw, D - range(7, 8.5), D - 1)
    tier(g, r[0], r[1], r[2], r[3], 0, range(3, 3.6))
  }
  // a low hedge or a picket fence along the front, a palm or a tree in the yard
  const gate = hu + w / 2
  const look = chance(0.5) ? 'fence' : 'hedge',
    hh = look === 'fence' ? 1 : range(0.8, 1.3)
  if (gate - 0.8 - (u0 + 0.3) > 0.8)
    hedge(
      ...f(u0 + 0.3, gate - 0.8, 0.3, look === 'fence' ? 0.45 : 0.9),
      hh,
      look
    )
  if (u1 - 0.3 - (gate + 0.8) > 0.8)
    hedge(
      ...f(gate + 0.8, u1 - 0.3, 0.3, look === 'fence' ? 0.45 : 0.9),
      hh,
      look
    )
  ground(blk, 'concrete', ...f(gate - 0.6, gate + 0.6, 0.5, sb))
  if (chance(0.3)) palm(...pt(f, u0 + 1.6, sb * 0.5), 8 + R() * 4, false)
  else if (chance(0.3)) tree(...pt(f, u0 + 2.2, D - 3.5), 0.7 + R() * 0.3)
}
// a row of one- and two-storey shopfronts along side s (f: its frame), painted bright, flush with
// the pavement, murals on the walls at its ends
function shopRow (f, s, a, b, dep) {
  for (let u = a; u < b - 0.5; ) {
    let w = range(8, 14)
    if (b - (u + w) < 7) w = b - u
    const two = chance(0.45)
    const sh = building('venice', {
      style: 'stucco',
      tint: pick(TINTS.bright),
      shop: true
    })
    const m = f(u, u + w, 0.4, dep)
    tier(
      sh,
      m[0],
      m[1],
      m[2],
      m[3],
      0,
      two ? SHOP + FLOOR + 0.3 : SHOP + range(0.9, 1.8)
    )
    if (u === a && chance(0.6)) mural(sh, (s + 3) % 4)
    u += w
    if (u >= b - 0.5 && chance(0.6)) mural(sh, (s + 1) % 4)
  }
}

export function venice (blk, lot) {
  blk.base = 'grass'
  const L = lot.x1 - lot.x0
  // the beach blocks face the ocean and the street behind; the rest north and south
  const sides = blk.bx === 0 ? [3, 1] : [0, 2]
  for (const s of sides) {
    const f = frame(lot, s)
    const shops = isMain(blk.bx, blk.bz, s) || (blk.bx === 0 && s === 3)
    if (shops) {
      shopRow(f, s, 0, L, range(14, 20))
      continue
    }
    const n = 6,
      W = L / n
    for (let i = 0; i < n; i++) bungalow(blk, f, s, i * W, (i + 1) * W, L / 2)
  }
}
