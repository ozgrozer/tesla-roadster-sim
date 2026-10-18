// The shopping streets. Santa Monica: two to six storeys of stucco, Art Deco and brick over shops
// along the main streets, apartments on the side streets, courtyards with palms, and Deco hotels
// facing the ocean with their names in neon on the roof. Hollywood: a strip of narrow one- to
// four-storey shops along every street, with billboards on their roofs and blade signs on their
// fronts, a theatre with a lit marquee on Hollywood Boulevard, a motel on Sunset round its car park
// under a tall neon sign, a few older mid-rises on the corners, and a round tower of stacked floors
// with a spire by Hollywood and Vine (as the Capitol Records Building).
import {
  R,
  TINTS,
  pick,
  range,
  chance,
  building,
  tier,
  shaft,
  ring,
  ground,
  palm,
  stalls,
  carPark,
  sign,
  post,
  solid,
  frame,
  isMain
} from './plots.js'
import { cells, faces, roofSign, mural } from './towers.js'

const SHOP = 4.6 // the storefronts' height (cityBuildings.js)
const FLOOR = 3.5
// a building with shops round its foot and n storeys over them
const over = n => SHOP + n * FLOOR

// ---------- Santa Monica ----------
export function santaMonica (blk, lot) {
  cells(lot, 3, 3, range(3, 4.5), 0.4, (x0, x1, z0, z1, i, j) => {
    const side = faces(i, j, 3)
    const main = side.some((f, s) => f && isMain(blk.bx, blk.bz, s))
    if (i === 1 && j === 1 && chance(0.6)) {
      // a courtyard with palms
      ground(blk, 'grass', x0 + 2, x1 - 2, z0 + 2, z1 - 2)
      palm((x0 + x1) / 2, (z0 + z1) / 2, 9 + R() * 4, false)
      if (chance(0.5)) palm(x0 + 4, z0 + 4, 16 + R() * 8, true)
      return
    }
    if (blk.bx === 0 && side[3] && chance(0.7)) {
      // a Deco hotel looking out over the ocean, its name on the roof
      const b = building('beach', {
        style: 'stone',
        tint: pick([0xcfe8e2, 0xf3e3c8, 0xf2d4c8, 0xe8eef2, 0xf6efe0]),
        shop: true,
        fins: true
      })
      tier(b, x0, x1, z0, z1, 0, over(5 + Math.floor(R() * 5)))
      roofSign(b, 3, 'hotel')
      return
    }
    if (main) {
      // shops with two to six storeys of offices or flats over them
      const look = pick(['stucco', 'stucco', 'stone', 'brick', 'white'])
      const b = building('beach', {
        style: look === 'white' ? 'stucco' : look,
        tint: pick(TINTS[look === 'stone' ? 'stucco' : look]),
        shop: true,
        fins: look === 'stone'
      })
      tier(b, x0, x1, z0, z1, 0, over(1 + Math.floor(R() * 5)))
      return
    }
    // apartments, two to four storeys, set back behind a strip of garden
    const b = building('beach', {
      style: 'stucco',
      tint: pick(chance(0.5) ? TINTS.white : TINTS.stucco)
    })
    tier(
      b,
      x0 + 1,
      x1 - 1,
      z0 + 1,
      z1 - 1,
      0,
      (2 + Math.floor(R() * 3)) * FLOOR
    )
  })
}

// ---------- Hollywood ----------
// the round tower of stacked floors by Hollywood and Vine, its spire over it
function recordsTower (cx, cz) {
  const b = building('boulevard', {
    style: 'glass',
    tint: 0xd8dcdc,
    records: true
  })
  shaft(b, ring(cx, cz, 12, 12, 24), 0, 46, { smooth: true })
  b.spire = { x: cx, z: cz, y: 46, h: 28, beacon: true }
  return b
}
// a theatre: a tall, plain auditorium behind a stone front, a marquee over the pavement lit with
// bulbs, and its name up a blade sign over it
function theatre (box, s) {
  const [x0, x1, z0, z1] = box
  const b = building('boulevard', {
    style: 'stone',
    tint: pick([0xe6cfae, 0xd9b48f, 0xecdcc4]),
    shop: false,
    fins: true
  })
  // (an auditorium has no windows: a plain wall, Deco fins up it)
  tier(b, x0, x1, z0, z1, 0, range(15, 18), { blank: true })
  const along = s % 2 === 0
  const fx = along ? (x0 + x1) / 2 : s === 1 ? x1 : x0,
    fz = along ? (s === 0 ? z0 : z1) : (z0 + z1) / 2
  const w = Math.min(16, (along ? x1 - x0 : z1 - z0) - 4)
  b.marquee = sign('marquee', {
    x: fx,
    z: fz,
    y: 4.4,
    w,
    h: 2.2,
    d: 3.2,
    face: s,
    k: R()
  })
  sign('blade', { x: fx, z: fz, y: 6.9, w: 2.4, h: 9, d: 0.7, face: s, k: R() })
  return b
}
// a motel: two storeys of rooms in an L round its car park, a tall sign at the street (f: the
// frame along its side of the block, s)
function motel (blk, s, f) {
  const b = building('boulevard', { style: 'stucco', tint: pick(TINTS.stucco) })
  // (the wings: along the back of the lot and down one side)
  const back = f(0, 40, 22, 30),
    wing = f(0, 10, 0.4, 22)
  tier(b, back[0], back[1], back[2], back[3], 0, 6.6)
  tier(b, wing[0], wing[1], wing[2], wing[3], 0, 6.6)
  const yard = f(10.5, 40, 0.4, 21.5)
  ground(blk, 'asphalt', yard[0], yard[1], yard[2], yard[3])
  const along = s % 2 === 0
  const u0 = along ? yard[0] : yard[2],
    u1 = along ? yard[1] : yard[3]
  const c = s === 0 ? yard[3] : s === 2 ? yard[2] : s === 1 ? yard[0] : yard[1]
  stalls(
    along ? 0 : 1,
    u0 + 1,
    u1 - 1,
    c + (s === 0 || s === 3 ? -2.7 : 2.7),
    s === 0 || s === 3 ? 1 : -1,
    0.5
  )
  const p = f(36, 38, 1.2, 3)
  const px = (p[0] + p[1]) / 2,
    pz = (p[2] + p[3]) / 2
  post(px, pz, 0.3, 12, 'pole')
  sign('motel', { x: px, z: pz, y: 7.5, w: 5, h: 4.5, d: 0.6, face: s, k: R() })
  return b
}
// a shop of n storeys (and a billboard on its roof, or a blade sign, now and then)
function shopfront (box, s, n) {
  const [x0, x1, z0, z1] = box
  const look =
    n > 6
      ? pick(['stone', 'brick'])
      : pick(['stucco', 'stucco', 'brick', 'stone', 'white'])
  const b = building('boulevard', {
    style: look === 'white' ? 'stucco' : look,
    tint: pick(TINTS[look === 'white' ? 'white' : look]),
    shop: true
  })
  const h = n ? over(n) : SHOP + range(1, 2.2)
  tier(b, x0, x1, z0, z1, 0, h)
  const along = s % 2 === 0,
    len = along ? x1 - x0 : z1 - z0
  if (n <= 2 && len > 9 && chance(0.3)) {
    // a billboard on the roof, facing the street, on a frame standing back from the front
    const w = Math.min(len - 1, 13),
      bh = w * 0.36
    const fx = along ? (x0 + x1) / 2 : s === 1 ? x1 - 3 : x0 + 3,
      fz = along ? (s === 0 ? z0 + 3 : z1 - 3) : (z0 + z1) / 2
    sign('billboard', {
      x: fx,
      z: fz,
      y: h + 1.6,
      w,
      h: bh,
      d: 0.5,
      face: s,
      k: R()
    })
    const hw = along ? w / 2 : 0.4,
      hd = along ? 0.4 : w / 2
    // (solid, on the roof: roofs.js keeps it with the plant)
    b.plant = [
      solid(
        fx - hw,
        fx + hw,
        fz - hd,
        fz + hd,
        h,
        h + 1.6 + bh,
        'plant',
        'none'
      )
    ]
  } else if (n >= 1 && n <= 4 && chance(0.35)) {
    const fx = along ? x0 + 2 + R() * (x1 - x0 - 4) : s === 1 ? x1 : x0,
      fz = along ? (s === 0 ? z0 : z1) : z0 + 2 + R() * (z1 - z0 - 4)
    sign('blade', {
      x: fx,
      z: fz,
      y: SHOP + 0.6,
      w: 1.4,
      h: Math.min(h - SHOP - 1, 6),
      d: 0.35,
      face: s,
      k: R()
    })
  }
  if (chance(0.12)) mural(b, (s + (chance(0.5) ? 1 : 3)) % 4)
  return b
}
export function hollywood (blk, lot) {
  const key = `${blk.bx},${blk.bz}`
  const theatreOn = key === '6,0' ? 2 : key === '5,1' ? 0 : -1
  const motelOn = key === '5,2' ? 0 : -1
  // a row of narrow buildings along each street, the north and south rows full width, the east
  // and west ones between them (a theatre's or a motel's row runs deeper); a car park in the middle
  const dep = [range(16, 26), range(14, 22), range(16, 26), range(14, 22)]
  if (theatreOn >= 0) dep[theatreOn] = range(34, 40)
  if (motelOn >= 0) dep[motelOn] = 30
  const L = lot.x1 - lot.x0
  if (key === '7,0') recordsTower(lot.x1 - 15, lot.z1 - 15)
  for (const s of [0, 1, 2, 3]) {
    const f = frame(lot, s)
    const a = s % 2 ? dep[s === 1 ? 0 : 2] + 1 : 0,
      b = s % 2 ? L - dep[s === 1 ? 2 : 0] - 1 : L
    // (the stretch a theatre or a motel takes)
    const held = s === theatreOn ? [24, 52] : s === motelOn ? [0, 40] : null
    if (s === theatreOn) theatre(f(24, 52, 0.4, dep[s]), s)
    if (s === motelOn) motel(blk, s, f)
    let u = held && held[0] === 0 ? held[1] : a
    while (u < b - 0.5) {
      const end = held && u < held[0] ? held[0] : b
      let w = range(8, 20)
      if (end - (u + w) < 8) w = end - u
      const box = f(u, u + w, 0.4, dep[s])
      const corner = u === a || u + w >= b - 0.5
      u += w
      if (held && u === held[0]) u = held[1]
      // (by the records tower, nothing)
      if (key === '7,0' && box[1] > lot.x1 - 30 && box[3] > lot.z1 - 30)
        continue
      // (mostly one or two storeys; an older mid-rise on a corner now and then)
      const n =
        corner && chance(0.09)
          ? 7 + Math.floor(R() * 6)
          : pick([0, 0, 0, 0, 1, 1, 1, 2, 3])
      shopfront(box, s, n)
    }
  }
  // the middle: a car park behind the shops
  const m = {
    x0: lot.x0 + dep[3] + 2,
    x1: lot.x1 - dep[1] - 2,
    z0: lot.z0 + dep[0] + 2,
    z1: lot.z1 - dep[2] - 2
  }
  if (key === '7,0') m.x1 = Math.min(m.x1, lot.x1 - 30)
  if (m.x1 - m.x0 > 14 && m.z1 - m.z0 > 12) {
    // (one pair of rows of spaces, the rest of it paved)
    ground(blk, 'asphalt', m.x0, m.x1, m.z0, m.z1)
    const z = (m.z0 + m.z1) / 2 - 9
    if (m.z1 - m.z0 > 19) carPark(blk, m.x0, m.x1, z, z + 18.1, 0.45)
  }
}
