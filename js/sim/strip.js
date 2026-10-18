// Mid-City: low and spread out. Strip malls set back behind their car parks (the cars in them are
// the traffic's parked ones, plots.js stalls), gas stations on the corners of the main streets under
// their canopies, fast-food stands with their signs up on poles and a drive-through round the back,
// a donut stand with a giant donut on its roof, two- and three-storey stucco apartment blocks on
// the side streets, billboards on poles over it all, and now and then an office mid-rise in its
// own car park.
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
  carPark,
  stalls,
  sign,
  post,
  solid,
  frame,
  isMain
} from './plots.js'

let stations = 0 // (gas stations so far: four in the city)

// A billboard on a pole at (x, z) facing side s, its board up at 9 to 14 m: the pole and the board
// are solid
export function billboard (x, z, s) {
  const w = 14.6,
    h = 4.9,
    y = 9.5
  post(x, z, 0.45, y, 'pole')
  sign('billboard', { x, z, y, w, h, d: 0.6, face: s, k: R(), pole: true })
  const along = s % 2 === 0
  const hw = along ? w / 2 : 0.4,
    hd = along ? 0.4 : w / 2
  solid(x - hw, x + hw, z - hd, z + hd, y, y + h, 'plant', 'none')
}

// A gas station on a 34 by 32 m corner of the lot (the box [x0, x1, z0, z1]), its pumps under a
// canopy (landable) on four columns, its shop at the back, its prices up on a pole at the corner
// (cx, cz), the corner's two streets along sides a and b
function gasStation (blk, box, cx, cz) {
  const [x0, x1, z0, z1] = box
  ground(blk, 'concrete', x0, x1, z0, z1)
  const mx = (x0 + x1) / 2,
    mz = (z0 + z1) / 2
  // the canopy over the forecourt, nearer the corner; the shop behind it
  const ux = Math.sign(cx - mx),
    uz = Math.sign(cz - mz)
  const kx = mx + ux * 3,
    kz = mz + uz * 3
  const hw = 11,
    hd = 6.5
  const brand = Math.floor(R() * 4)
  solid(kx - hw, kx + hw, kz - hd, kz + hd, 4.7, 5.5, 'building', 'canopy', {
    brand
  })
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      post(kx + sx * (hw - 2.5), kz + sz * (hd - 2), 0.28, 4.7, 'column')
  // two islands of pumps
  for (const sz of [-1, 1]) {
    const z = kz + sz * 2.2
    solid(kx - 3.8, kx + 3.8, z - 0.55, z + 0.55, 0, 0.18, 'building', 'island')
    for (const sx of [-1, 1])
      solid(
        kx + sx * 2 - 0.35,
        kx + sx * 2 + 0.35,
        z - 0.45,
        z + 0.45,
        0,
        1.75,
        'plant',
        'pump',
        { brand }
      )
  }
  // the shop in the far corner
  const sx0 = ux > 0 ? x0 + 0.6 : x1 - 13.6,
    sz0 = uz > 0 ? z0 + 0.6 : z1 - 10.6
  const b = building('strip', {
    style: 'stucco',
    tint: 0xf4f1ea,
    shop: true,
    kiosk: brand
  })
  tier(b, sx0, sx0 + 13, sz0, sz0 + 10, 0, 5.4)
  post(cx - ux * 1.6, cz - uz * 1.6, 0.18, 2.6, 'pole')
  sign('price', {
    x: cx - ux * 1.6,
    z: cz - uz * 1.6,
    y: 2.6,
    w: 2.6,
    h: 3.6,
    d: 0.4,
    face: uz > 0 ? 2 : 0,
    k: brand / 4
  })
}

// a fast-food stand: one storey in bright colours, its sign up on a pole by the street, a lane
// round it for the drive-through and a few spaces
function fastFood (blk, box, s, f) {
  const [x0, x1, z0, z1] = box
  ground(blk, 'asphalt', x0, x1, z0, z1)
  const b = building('strip', {
    style: 'stucco',
    tint: pick([0xd9452f, 0xf2c14e, 0xf4f1ea, 0xe8742a]),
    shop: true
  })
  const m = f(8, 22, 8, 20)
  tier(b, m[0], m[1], m[2], m[3], 0, 5.6)
  const p = f(2, 3, 1.5, 2.5)
  post((p[0] + p[1]) / 2, (p[2] + p[3]) / 2, 0.3, 8, 'pole')
  sign('food', {
    x: (p[0] + p[1]) / 2,
    z: (p[2] + p[3]) / 2,
    y: 8,
    w: 4.4,
    h: 3,
    d: 0.6,
    face: s,
    k: R()
  })
  // (a row of spaces beside it, noses towards it)
  const q = f(24, 30, 4, 28)
  if (s % 2 === 0)
    stalls(1, q[2], q[3], (q[0] + q[1]) / 2, s === 0 ? -1 : 1, 0.5)
  else stalls(0, q[0], q[1], (q[2] + q[3]) / 2, s === 1 ? -1 : 1, 0.5)
}

// a little donut stand with a giant donut on its roof
function donutStand (blk, box, s) {
  const [x0, x1, z0, z1] = box
  ground(blk, 'asphalt', x0, x1, z0, z1)
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2
  const b = building('strip', { style: 'stucco', tint: 0xf4f1ea, shop: true })
  tier(b, cx - 5, cx + 5, cz - 4, cz + 4, 0, 5)
  // (the donut: 5.5 m round its middle, 1.6 m thick, standing on two posts 1.6 m up; citySigns.js)
  b.donut = { x: cx, z: cz, y: 5, r: 5.5, face: s }
  const along = s % 2 === 0
  b.plant = [
    solid(
      cx - (along ? 7.1 : 1.6),
      cx + (along ? 7.1 : 1.6),
      cz - (along ? 1.6 : 7.1),
      cz + (along ? 1.6 : 7.1),
      5,
      19.2,
      'plant',
      'none'
    )
  ]
}

// a strip mall facing side s: one storey of shops in an L at the back of a car park, a strip of
// lawn with palms along the street, its sign by the street; f: the frame along side s
function stripMall (blk, s, f) {
  const deep = 74 - 0.4
  const back = f(4, 70, deep - 21, deep),
    wing = f(4, 18, deep - 44, deep - 21)
  const b = building('strip', {
    style: 'stucco',
    tint: pick([...TINTS.white, ...TINTS.stucco]),
    shop: true
  })
  const h = range(5.6, 6.6)
  tier(b, back[0], back[1], back[2], back[3], 0, h)
  tier(b, wing[0], wing[1], wing[2], wing[3], 0, h)
  // the car park: two pairs of rows of spaces across it
  const lot = f(19, 70, deep - 57, deep - 22)
  if (s % 2 === 0) carPark(blk, lot[0], lot[1], lot[2], lot[3], 0.6)
  else carParkZ(blk, lot)
  ground(blk, 'asphalt', ...f(19, 70, 9, deep - 57))
  ground(blk, 'grass', ...f(4, 70, 0.4, 7))
  for (let k = 0; k < 4; k++) {
    const p = at(f, 8 + k * 19, 3.6)
    palm(p[0], p[1], 18 + R() * 9, true)
  }
  const p = at(f, 66, 4.5)
  post(p[0], p[1], 0.3, 6.5, 'pole')
  sign('mall', {
    x: p[0],
    z: p[1],
    y: 6.5,
    w: 3.2,
    h: 5,
    d: 0.5,
    face: s,
    k: R()
  })
  return b
}
// a car park with its rows running north-south
function carParkZ (blk, [x0, x1, z0, z1]) {
  ground(blk, 'asphalt', x0, x1, z0, z1)
  let x = x0 + 0.4
  while (x + 5.4 <= x1 - 0.4) {
    stalls(1, z0 + 1, z1 - 1, x + 2.7, -1, 0.55)
    x += 5.4 + 6.5
    if (x + 5.4 > x1 - 0.4) break
    stalls(1, z0 + 1, z1 - 1, x + 2.7, 1, 0.55)
    x += 5.4 + 0.6
  }
}

// a stucco apartment block, two or three storeys, behind a strip of lawn
function apartments (blk, box) {
  const [x0, x1, z0, z1] = box
  const b = building('strip', {
    style: 'stucco',
    tint: pick(chance(0.6) ? TINTS.stucco : TINTS.white)
  })
  tier(b, x0, x1, z0, z1, 0, (2 + (chance(0.45) ? 1 : 0)) * 3.5 + 0.4)
  return b
}
// an office mid-rise in its own car park
function office (blk, lot) {
  const cx = (lot.x0 + lot.x1) / 2,
    cz = (lot.z0 + lot.z1) / 2
  const look = pick(['office', 'glass', 'stone'])
  const b = building('strip', {
    style: look,
    tint: pick(TINTS[look]),
    shop: look === 'stone'
  })
  const w = range(14, 20),
    d = range(12, 18)
  tier(b, cx - w, cx + w, cz - d, cz + d, 0, range(24, 44))
  // (one pair of rows of spaces in front)
  const z1 = Math.min(cz - d - 2, lot.z0 + 19)
  carPark(blk, lot.x0 + 2, lot.x1 - 2, lot.z0 + 1, z1, 0.5)
  ground(blk, 'asphalt', lot.x0 + 2, lot.x1 - 2, z1, cz - d - 1)
}

// side by side along side s, from u = a to b, d deep: apartments behind their strips of lawn, a gap
// between each
function row (blk, f, a, b, d) {
  for (let u = a; u < b - 10; ) {
    let w = range(16, 24)
    if (b - (u + w) < 12) w = b - u
    const set = range(3, 5)
    apartments(blk, f(u, u + w, set, d))
    ground(blk, 'grass', ...f(u, u + w, 0.4, set - 0.6))
    u += w + range(2, 4)
  }
}
// a courtyard apartment: two blocks facing each other across a lawn with a pool and a palm, from
// u0 to u1 and v0 to v1 in frame f
function courtyard (blk, f, u0, u1, v0, v1) {
  const d = (v1 - v0 - 10) / 2
  if (d < 8 || u1 - u0 < 16) return
  apartments(blk, f(u0, u1, v0, v0 + d))
  apartments(blk, f(u0, u1, v1 - d, v1))
  ground(blk, 'grass', ...f(u0, u1, v0 + d, v1 - d))
  const m = (u0 + u1) / 2
  ground(blk, 'pool', ...f(m - 6, m + 6, v0 + d + 2.5, v1 - d - 2.5))
  const p = at(f, u0 + 3, v0 + d + 5)
  palm(p[0], p[1], 9 + R() * 4, false)
}

export function midCity (blk, lot) {
  blk.base = 'asphalt'
  const mains = [0, 1, 2, 3].filter(s => isMain(blk.bx, blk.bz, s))
  const L = lot.x1 - lot.x0
  const donut = blk.bx === 4 && blk.bz === 6
  // a corner of two main streets: a gas station on it, a fast-food stand on the next corner
  const s0 = mains.find(s => mains.includes((s + 1) % 4))
  if (s0 !== undefined && stations < 4 && !donut) {
    stations++
    // (the corner between side s0 and side s0 + 1: the end of side s0's frame)
    const f = frame(lot, s0)
    const box = f(L - 34, L - 0.4, 0.4, 32)
    const cx = s0 <= 1 ? box[1] : box[0],
      cz = s0 === 0 || s0 === 3 ? box[2] : box[3]
    gasStation(blk, box, cx, cz)
    fastFood(blk, f(0, 32, 0.4, 32), s0, f)
    row(blk, frame(lot, (s0 + 2) % 4), 0, L, 18)
    courtyard(blk, f, 6, 68, 35, 54)
    if (chance(0.7)) billboard(...at(f, 36, 1.5), s0)
    return
  }
  const plan = R()
  if (mains.length && plan < 0.45 && !donut) {
    const s = pick(mains)
    stripMall(blk, s, frame(lot, s))
    if (chance(0.6)) billboard(...at(frame(lot, s), 11, 12), s)
    return
  }
  if (plan < 0.6 && !donut) {
    office(blk, lot)
    return
  }
  // apartments along two opposite sides, a corner with a fast-food stand or the donut stand
  const s = mains.length ? mains[0] : Math.floor(R() * 4)
  const f = frame(lot, s)
  if (donut) donutStand(blk, f(0, 26, 0.4, 24), s)
  else if (chance(0.5)) fastFood(blk, f(0, 32, 0.4, 32), s, f)
  else row(blk, f, 0, 32, 16)
  row(blk, f, 36, L, 16)
  row(blk, frame(lot, (s + 2) % 4), 0, L, 18)
  courtyard(blk, f, 36, 70, 20, 53)
  if (chance(0.5)) billboard(...at(f, 34, 1.5), s)
}
// a point u along and v in from a side's frame
function at (f, u, v) {
  const b = f(u, u, v, v)
  return [b[0], b[2]]
}
