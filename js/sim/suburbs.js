// The suburbs south of the freeway: Leimert Park and Inglewood. One-storey houses on lawns, each
// with a drive up one side to its garage and a car in the drive now and then (a parking space the
// traffic may park in, plots.js stalls), a low wall or a hedge along the front, a tree in the yard,
// a bush or two by the door; along the boulevards, a strip of shops behind their car park. Pure data,
// as plots.js.
import {
  R,
  TINTS,
  STALLS,
  pick,
  range,
  chance,
  building,
  tier,
  ground,
  tree,
  palm,
  hedge,
  frame,
  prop,
  carPark,
  sign,
  post,
  isMain
} from './plots.js'

// the ranch houses' stucco: pale, now and then a brighter one
const RANCH = [0xf3e3c8, 0xe9e0c2, 0xd8e6cf, 0xf0d5cf, 0xcfe1e6, 0xe4d2b8, 0xf6f2ea]
const ROOFS = ['tile', 'shingle']

function pt (f, u, v) {
  const b = f(u, u, v, v)
  return [b[0], b[2]]
}

// A house from u0 to u1 along side s's street (f its frame), D deep: the house set back on its
// lawn, the garage on the drive's side, the drive in concrete from the pavement to it, a car in it
// (a space the traffic parks in, its nose to the garage)
function house (blk, f, s, u0, u1, D) {
  const W = u1 - u0
  const drive = chance(0.5) ? -1 : 1
  const sb = range(6.5, 9),
    d = range(9, 12)
  const gw = 3.6 // (the garage's width, and the drive's)
  const hw = Math.min(W - gw - 2.2, range(8, 10.5))
  const gu = drive < 0 ? u0 + 0.8 : u1 - 0.8 - gw // the drive's near edge
  const hu = drive < 0 ? gu + gw : gu - hw
  const flat = chance(0.2)
  const b = building('suburb', {
    style: 'house',
    tint: pick(RANCH),
    roofs: pick(ROOFS)
  })
  const m = f(hu, hu + hw, sb, sb + d)
  tier(
    b,
    m[0],
    m[1],
    m[2],
    m[3],
    0,
    range(3.4, 4),
    flat ? {} : { hip: range(1.1, 1.7), eave: 0.6 }
  )
  b.door = { ...xz(f, hu + hw / 2, sb), face: s, k: R() }
  // the garage, a step back, and its drive
  const g = building('suburb', { style: 'stucco', tint: pick(RANCH) })
  const gm = f(gu, gu + gw, sb + 1.5, sb + 8)
  tier(g, gm[0], gm[1], gm[2], gm[3], 0, 3.2)
  ground(blk, 'concrete', ...f(gu + 0.2, gu + gw - 0.2, 0, sb + 1.5))
  if (chance(0.75)) {
    const [x, z] = pt(f, gu + gw / 2, sb - 2.2)
    // (the car's nose towards the garage: in from the street, along v)
    const yaw = s === 0 ? -Math.PI / 2 : s === 2 ? Math.PI / 2 : s === 1 ? Math.PI : 0
    STALLS.push({ x, z, yaw, fill: 0.9, taken: false, drive: true })
  }
  // the front: a low wall or a hedge, open for the drive and the path
  const look = chance(0.5) ? 'wall' : 'hedge',
    hh = look === 'wall' ? range(0.6, 0.9) : range(0.7, 1.2)
  const pathU = hu + hw / 2
  const spans =
    drive < 0
      ? [
          [gu + gw + 0.3, pathU - 0.8],
          [pathU + 0.8, u1 - 0.3]
        ]
      : [
          [u0 + 0.3, pathU - 0.8],
          [pathU + 0.8, gu - 0.3]
        ]
  for (const [a, e] of spans)
    if (e - a > 0.8) hedge(...f(a, e, 0.3, look === 'wall' ? 0.6 : 1), hh, look)
  ground(blk, 'concrete', ...f(pathU - 0.6, pathU + 0.6, 0.6, sb))
  // bushes by the house, a tree in the front yard or the back
  for (const du of [1.2, hw - 1.2])
    if (chance(0.7)) prop('bush', { ...xz(f, hu + du, sb - 0.9), r: range(0.6, 1.1) })
  if (chance(0.55)) tree(...pt(f, drive < 0 ? u1 - 2.6 : u0 + 2.6, sb * 0.5), 0.6 + R() * 0.35)
  else if (chance(0.3)) palm(...pt(f, drive < 0 ? u1 - 2 : u0 + 2, sb * 0.45), 9 + R() * 5, false)
  if (chance(0.5)) tree(...pt(f, u0 + W / 2, D - 3.5), 0.8 + R() * 0.4)
}
function xz (f, u, v) {
  const [x, z] = pt(f, u, v)
  return { x, z }
}

// A strip of shops along side s, set back behind their car park, a sign on a pole at the corner
function strip (blk, f, s, L) {
  const dep = range(14, 18),
    park = 17
  const [x0, x1, z0, z1] = f(0, L, 3, park + 2)
  carPark(blk, x0, x1, z0, z1, 0.5)
  for (let u = 1; u < L - 4; ) {
    let w = range(8, 13)
    if (L - 1 - (u + w) < 6) w = L - 1 - u
    const b = building('suburb', {
      style: 'stucco',
      tint: pick(chance(0.3) ? TINTS.bright : TINTS.stucco),
      shop: true
    })
    const m = f(u, u + w, park + 3, park + 2 + dep)
    tier(b, m[0], m[1], m[2], m[3], 0, range(5.4, 6.6))
    u += w
  }
  const [px, pz] = pt(f, 1.2, 1.2)
  post(px, pz, 0.25, 7, 'pole')
  sign('mall', { x: px, z: pz, y: 7, w: 3.4, h: 5, d: 0.5, face: s, k: R() })
}

export function suburb (blk, lot) {
  blk.base = 'grass'
  const L = lot.x1 - lot.x0
  for (const s of [0, 2]) {
    const f = frame(lot, s)
    if (isMain(blk.bx, blk.bz, s) && chance(0.7)) {
      strip(blk, f, s, L)
      continue
    }
    const n = 6,
      W = L / n
    for (let i = 0; i < n; i++) house(blk, f, s, i * W, (i + 1) * W, L / 2)
  }
}
