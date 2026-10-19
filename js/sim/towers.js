// The towers: Downtown's skyline and Century City's. Downtown's tallest stand round the middle of
// it, on Wilshire, and fall away from there: a stepped cylinder with a lit glass crown and a helipad
// on top (as the US Bank Tower), a sail-topped glass tower with a spire on the corner of Wilshire
// and Figueroa (as the Wilshire Grand), black slabs, and most of the rest flat-topped with a big
// H-marked helipad on the roof, as Los Angeles' fire code had them; between and round them, the
// older ten- to fifteen-storey stone and brick blocks of the historic core, and low brick
// warehouses out at the edges. Century City is a cluster of glass office towers on plazas round a
// pair of matching three-sided towers (as the Century Plaza Towers), with palms in planters.
import {
  R,
  TINTS,
  pick,
  range,
  chance,
  building,
  tier,
  stack,
  shaft,
  ring,
  trimmed,
  ground,
  palm,
  tree,
  solid,
  sign,
  isMain
} from './plots.js'
import { OLD } from './grid.js'

// Split [a, b] into n parts of roughly equal size.
function splits (a, b, n) {
  const out = [a]
  for (let i = 1; i < n; i++)
    out.push(a + (b - a) * (i / n + (R() - 0.5) * (0.18 / n)))
  out.push(b)
  return out
}
// A grid of nx by nz buildings on a lot, alleys gap wide between them, set back set from the
// pavement; mk(x0, x1, z0, z1, i, j) builds each (it may leave one out)
export function cells (lot, nx, nz, gap, set, mk) {
  const xs = splits(lot.x0, lot.x1, nx),
    zs = splits(lot.z0, lot.z1, nz)
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++)
      mk(
        xs[i] + (i ? gap / 2 : set),
        xs[i + 1] - (i < nx - 1 ? gap / 2 : set),
        zs[j] + (j ? gap / 2 : set),
        zs[j + 1] - (j < nz - 1 ? gap / 2 : set),
        i,
        j
      )
}
// which sides of the lot cell (i, j) of nx by nz faces: [north, east, south, west]
export const faces = (i, j, nx, nz = nx) => [
  j === 0,
  i === nx - 1,
  j === nz - 1,
  i === 0
]

// A helipad on a building's top: a pad of radius r round (x, z) (the roof stays clear round it)
function helipad (b, x, z, r) {
  b.helipad = { x, z, r, y: b.h }
}
// the middle of a building's top tier, and its half-size
function topOf (b) {
  const t = b.tiers[b.tiers.length - 1]
  return {
    x: (t.x0 + t.x1) / 2,
    z: (t.z0 + t.z1) / 2,
    r: Math.min(t.x1 - t.x0, t.z1 - t.z0) / 2
  }
}
// A box tower h tall on [x0, x1] x [z0, z1], stepping back as it rises, helipad on the roof
export function tower (area, x0, x1, z0, z1, h, o = {}) {
  const look = o.look || pick(['glass', 'glass', 'dark', 'office', 'office'])
  const b = building(area, {
    style: look === 'dark' ? 'glass' : look,
    tint: o.tint ?? pick(TINTS[look])
  })
  stack(b, x0, x1, z0, z1, h, o.steps ?? (h > 150 ? 3 : h > 80 ? 2 : 1))
  const top = topOf(b)
  if (o.helipad !== false && h > 70 && top.r > 8 && R() < 0.85)
    helipad(b, top.x, top.z, Math.min(11, top.r - 2.5))
  else b.antenna = h > 120 && chance(0.5)
  // a band of glass round the top storeys, lit at night (cityBuildings.js)
  if (h > 100 && chance(0.4)) b.crownBand = range(5, 9)
  return b
}

// ---------- the landmarks ----------
// a stepped cylinder in grey granite, its glass crown lit at night and a round helipad on it
function steppedCylinder (cx, cz) {
  const b = building('downtown', { style: 'office', tint: 0xcfd0cc })
  shaft(b, ring(cx, cz, 23), 0, 150, { smooth: true })
  shaft(b, ring(cx, cz, 20), 150, 228, { smooth: true })
  shaft(b, ring(cx, cz, 17), 228, 286, { smooth: true })
  shaft(b, ring(cx, cz, 14), 286, 300, { smooth: true, crown: true })
  helipad(b, cx, cz, 10)
  return b
}
// a glass tower on a long six-sided plan on a hotel podium, its top a sail of glass sloping up to
// the east, lit at night, and a spire over its high end
function sailTower (cx, cz, podium) {
  const b = building('downtown', { style: 'glass', tint: 0x9fb9cc, shop: true })
  const hx = 26,
    hz = 14
  const pts = [
    [cx + hx, cz],
    [cx + hx - 9, cz - hz],
    [cx - hx + 9, cz - hz],
    [cx - hx, cz],
    [cx - hx + 9, cz + hz],
    [cx + hx - 9, cz + hz]
  ]
  tier(b, ...podium, 0, 26)
  shaft(b, pts, 26, 252)
  b.sail = { pts, y0: 252, y1: 286 } // (rising from the west end to the east)
  // the sail is no roof to land on: boxes stepping up under its slope
  for (let k = 0; k < 3; k++)
    solid(
      cx - hx + (2 * hx * k) / 3,
      cx - hx + (2 * hx * (k + 1)) / 3,
      cz - hz,
      cz + hz,
      252,
      252 + (34 * (k + 1)) / 3,
      'plant',
      'none'
    )
  b.spire = { x: cx + hx - 6, z: cz, y: 286, h: 30 }
  return b
}
// a pair of three-sided towers in opposite corners of their plaza, turned half a turn to each
// other, a point of each aimed at the fountain between them
function triangleTwins (lot) {
  const m = 20
  for (const [x, z, a] of [
    [lot.x0 + m, lot.z0 + m, Math.PI / 4],
    [lot.x1 - m, lot.z1 - m, (-3 * Math.PI) / 4]
  ]) {
    const b = building('towers', { style: 'office', tint: 0xd4d8dc })
    shaft(b, trimmed(x, z, 19.5, 3, 4.5, a), 0, 172)
    helipad(b, x, z, 7.5)
  }
}
// a granite and glass tower with its corners cut back (as Fox Plaza)
function chamfered (area, cx, cz, r, h, tint) {
  const b = building(area, { style: 'office', tint })
  shaft(b, trimmed(cx, cz, r, 4, r * 0.32, Math.PI / 4), 0, h * 0.88)
  shaft(b, trimmed(cx, cz, r * 0.8, 4, r * 0.26, Math.PI / 4), h * 0.88, h)
  helipad(b, cx, cz, Math.min(9, r * 0.45))
  return b
}

// ---------- plazas ----------
// planters round a plaza (the rect it covers): strips of grass with palms or trees along its sides,
// clear of the towers on it
function planters (blk, rect, area, inset) {
  for (const s of [0, 1, 2, 3]) {
    if (!chance(0.75)) continue
    const along = s % 2 === 0
    const a = (along ? rect.x0 : rect.z0) + inset,
      b = (along ? rect.x1 : rect.z1) - inset
    const c =
      s === 0
        ? rect.z0 + 2.5
        : s === 2
        ? rect.z1 - 2.5
        : s === 1
        ? rect.x1 - 2.5
        : rect.x0 + 2.5
    const fan = area === 'towers' || chance(0.4)
    for (let t = a + 4; t < b - 2; t += fan ? 9 : 11) {
      const x = along ? t : c,
        z = along ? c : t
      if (fan ? palm(x, z, 16 + R() * 9, true) : tree(x, z, 0.75 + R() * 0.3)) {
        if (along) ground(blk, 'grass', x - 2.2, x + 2.2, c - 1.3, c + 1.3)
        else ground(blk, 'grass', c - 1.3, c + 1.3, z - 2.2, z + 2.2)
      }
    }
  }
}
// a fountain: a shallow pool in the plaza
const fountain = (blk, x, z, w, d) =>
  ground(blk, 'pool', x - w / 2, x + w / 2, z - d / 2, z + d / 2)

// ---------- older blocks ----------
// A stone or brick block of the historic core, h tall, shops round its foot on the main streets,
// sometimes an old sign on its roof
function oldBlock (blk, x0, x1, z0, z1, h, side) {
  const look = chance(0.45) ? 'brick' : 'stone'
  const b = building('downtown', {
    style: look,
    tint: pick(TINTS[look]),
    shop: side.some((f, s) => f && isMain(blk.bx, blk.bz, s)) || chance(0.5)
  })
  tier(b, x0, x1, z0, z1, 0, h)
  const s = side.findIndex(f => f)
  if (h > 30 && s >= 0 && chance(0.18)) roofSign(b, s, 'hotel')
  return b
}
// an old hotel's sign on the roof, along its street side s, its letters lit at night
export function roofSign (b, s, kind) {
  const t = b.tiers[b.tiers.length - 1],
    along = s % 2 === 0,
    len = (along ? t.x1 - t.x0 : t.z1 - t.z0) * 0.7
  const w = Math.min(len, 22),
    h = 3.2 + w * 0.08
  const x = along ? (t.x0 + t.x1) / 2 : s === 1 ? t.x1 - 1.2 : t.x0 + 1.2
  const z = along ? (s === 0 ? t.z0 + 1.2 : t.z1 - 1.2) : (t.z0 + t.z1) / 2
  b.roofSign = sign(kind, { x, z, y: t.y1 + 1, w, h, face: s, k: R() })
  return b.roofSign
}
// a brick warehouse or loft, two to six storeys, now and then a mural on its side
function warehouse (blk, x0, x1, z0, z1, side) {
  const b = building('downtown', {
    style: 'brick',
    tint: pick(TINTS.brick),
    shop: chance(0.3)
  })
  tier(b, x0, x1, z0, z1, 0, range(7.5, 22))
  const s = side.findIndex(f => f)
  if (s >= 0 && chance(0.35)) mural(b, s)
  return b
}
// a mural painted on side s of a building's lowest tier
export function mural (b, s) {
  const t = b.tiers[0],
    along = s % 2 === 0
  const len = along ? t.x1 - t.x0 : t.z1 - t.z0
  const w = Math.min(len - 2, 18),
    h = Math.min(t.y1 - 1, w * 0.45)
  if (w < 5 || h < 2.5) return
  sign('mural', {
    x: along ? (t.x0 + t.x1) / 2 : s === 1 ? t.x1 : t.x0,
    z: along ? (s === 0 ? t.z0 : t.z1) : (t.z0 + t.z1) / 2,
    y: Math.max(0.5, (t.y1 - h) / 2),
    w,
    h,
    face: s,
    k: R()
  })
}

// ---------- Downtown ----------
// the skyline's middle, between the stepped cylinder and the sail tower
const CORE = { x: 336 + OLD, z: -20 + OLD } // (where it stood in the first city: grid.js OLD)
export function downtown (blk, lot) {
  const cx = (lot.x0 + lot.x1) / 2,
    cz = (lot.z0 + lot.z1) / 2
  const d = Math.hypot(cx - CORE.x, cz - CORE.z)
  const peak = 300 * Math.exp(-((d / 185) ** 2)) // how tall towers get here
  const key = `${blk.bx},${blk.bz}`
  const old = (h0, h1, nx, nz) => (x0, x1, z0, z1, i, j) =>
    oldBlock(blk, x0, x1, z0, z1, range(h0, h1), faces(i, j, nx, nz))
  if (key === '8,4') {
    // the stepped cylinder on its plaza, older blocks along its east side
    steppedCylinder(lot.x0 + 30, cz + 2)
    cells({ ...lot, x0: lot.x0 + 56 }, 1, 3, 2.5, 0.4, old(36, 54, 1, 3))
    planters(blk, { ...lot, x1: lot.x0 + 55 }, 'downtown', 4)
    return
  }
  if (key === '8,5') {
    // the sail tower on the corner of Wilshire and Figueroa, its podium along Wilshire, older
    // blocks to the south
    sailTower(lot.x1 - 30, lot.z0 + 22, [
      lot.x0 + 14,
      lot.x1 - 0.4,
      lot.z0 + 0.4,
      lot.z0 + 40
    ])
    cells({ ...lot, z0: lot.z0 + 44 }, 3, 1, 2.5, 0.4, old(24, 52, 3, 1))
    planters(blk, { ...lot, x1: lot.x0 + 13, z1: lot.z0 + 42 }, 'downtown', 2)
    return
  }
  if (key === '9,5') {
    // twin black slabs either side of a plaza with a fountain
    for (const x of [lot.x0 + 15, lot.x1 - 15])
      tower('downtown', x - 12, x + 12, lot.z0 + 14, lot.z1 - 14, 205, {
        look: 'dark',
        steps: 1,
        tint: 0x4a525a
      })
    fountain(blk, cx, cz, 10, 22)
    planters(blk, lot, 'downtown', 4)
    return
  }
  if (key === '9,4') {
    // a tall dark slab, its long side to the avenue
    tower('downtown', lot.x0 + 8, lot.x1 - 8, lot.z0 + 22, lot.z1 - 16, 236, {
      look: 'dark',
      steps: 1,
      tint: 0x5b636b
    })
    planters(blk, lot, 'downtown', 6)
    return
  }
  if (peak > 120) {
    // a tower on a plaza, two side by side, or a tower and older blocks on the rest of the block
    const plan = R()
    if (plan < 0.35) {
      const ins = range(8, 14)
      tower(
        'downtown',
        lot.x0 + ins,
        lot.x1 - ins,
        lot.z0 + ins,
        lot.z1 - ins,
        peak * range(0.7, 1)
      )
      planters(blk, lot, 'downtown', ins * 0.5)
    } else if (plan < 0.65) {
      const mid = cx + range(-5, 5)
      tower(
        'downtown',
        lot.x0 + 5,
        mid - 4,
        lot.z0 + range(6, 14),
        lot.z1 - range(6, 14),
        peak * range(0.7, 1)
      )
      if (chance(0.4))
        chamfered(
          'downtown',
          (mid + lot.x1) / 2,
          cz,
          17,
          peak * range(0.5, 0.8),
          pick(TINTS.glass)
        )
      else
        tower(
          'downtown',
          mid + 4,
          lot.x1 - 5,
          lot.z0 + range(8, 16),
          lot.z1 - range(8, 16),
          peak * range(0.45, 0.8)
        )
      planters(blk, lot, 'downtown', 3)
    } else {
      const split = lot.x0 + (lot.x1 - lot.x0) * range(0.5, 0.6)
      const hT = peak * range(0.65, 0.95)
      if (chance(0.35))
        chamfered(
          'downtown',
          (lot.x0 + split) / 2,
          cz,
          21,
          hT,
          pick(TINTS.glass)
        )
      else tower('downtown', lot.x0 + 4, split - 4, lot.z0 + 8, lot.z1 - 8, hT)
      cells({ ...lot, x0: split + 1 }, 1, 2, 2, 0.4, old(30, 54, 1, 2))
    }
    return
  }
  if (peak > 45) {
    // the historic core: older blocks, a mid-height tower among them now and then
    cells(lot, 3, 3, range(2, 3.5), 0.4, (x0, x1, z0, z1, i, j) => {
      if (i === 1 && j === 1) {
        if (chance(0.5)) return // (a light well, or a car park)
        if (chance(0.5)) {
          tower('downtown', x0, x1, z0, z1, peak * range(0.6, 1), { steps: 1 })
          return
        }
      }
      const h = chance(0.35) ? range(14, 26) : range(34, 56)
      oldBlock(blk, x0, x1, z0, z1, h, faces(i, j, 3))
    })
    return
  }
  // out at the edges: lofts and warehouses, an old block or two
  const n = chance(0.5) ? 3 : 2
  cells(lot, n, n, range(2.5, 6), 0.4, (x0, x1, z0, z1, i, j) => {
    if (chance(0.08)) return
    if (chance(0.25))
      oldBlock(blk, x0, x1, z0, z1, range(24, 46), faces(i, j, n))
    else warehouse(blk, x0, x1, z0, z1, faces(i, j, n))
  })
}

// ---------- Century City ----------
export function centuryCity (blk, lot) {
  const cx = (lot.x0 + lot.x1) / 2,
    cz = (lot.z0 + lot.z1) / 2
  const key = `${blk.bx},${blk.bz}`
  if (key === '3,4') {
    triangleTwins(lot)
    fountain(blk, cx, cz, 9, 9)
    planters(blk, lot, 'towers', 4)
    return
  }
  if (key === '4,4') {
    chamfered('towers', cx, cz, 26, 150, 0xd8b8a4)
    planters(blk, lot, 'towers', 5)
    return
  }
  if (key === '3,5') {
    // a long, low hotel slab and its gardens
    const b = building('towers', { style: 'stucco', tint: 0xf1ece2 })
    tier(b, lot.x0 + 6, lot.x1 - 6, cz - 9, cz + 9, 0, 62)
    ground(blk, 'grass', lot.x0 + 4, lot.x1 - 4, cz + 13, lot.z1 - 4)
    fountain(blk, cx, cz + 22, 16, 7)
    for (let x = lot.x0 + 8; x < lot.x1 - 6; x += 10)
      palm(x, lot.z1 - 7, 18 + R() * 8, true)
    return
  }
  // a glass tower or two on a plaza
  const peak = range(85, 160)
  if (chance(0.55)) {
    const ins = range(9, 15)
    tower(
      'towers',
      lot.x0 + ins,
      lot.x1 - ins,
      lot.z0 + ins,
      lot.z1 - ins,
      peak,
      {
        look: pick(['glass', 'glass', 'office', 'dark'])
      }
    )
    planters(blk, lot, 'towers', ins * 0.5)
  } else {
    const mid = cx + range(-4, 4)
    tower('towers', lot.x0 + 7, mid - 5, lot.z0 + 10, lot.z1 - 10, peak, {
      look: 'glass'
    })
    tower(
      'towers',
      mid + 5,
      lot.x1 - 7,
      lot.z0 + 10,
      lot.z1 - 10,
      peak * range(0.6, 0.9),
      {
        look: pick(['office', 'glass'])
      }
    )
    planters(blk, lot, 'towers', 4)
  }
}
