// The south's and east's big pieces: the stadium on its superblock (a bowl under a canopy, car parks
// round it, floodlights), the LA River's concrete channel (a parapet round it; the streets cross it
// on bridges), the freeway corridor's blocks under the deck (car parks between its columns), sports
// parks (basketball courts, a ball field, bleachers) and parking garages (two decks, a ramp up the
// side to the roof). Pure data, as plots.js.
import {
  R,
  pick,
  building,
  tier,
  shaft,
  ring,
  ground,
  palm,
  tree,
  solid,
  post,
  prop,
  carPark,
  stalls,
  ramp,
  sign
} from './plots.js'
import { billboard } from './strip.js'
import { fence } from './works.js'

// ---------- the stadium ----------
export function stadium (blk, lot) {
  blk.base = 'asphalt'
  const { x0, x1, z0, z1 } = lot
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2
  // car parks all round, a plaza round the bowl
  carPark(blk, x0 + 2, x1 - 2, z0 + 2, z0 + 34, 0.4)
  carPark(blk, x0 + 2, x1 - 2, z1 - 34, z1 - 2, 0.4)
  ground(blk, 'plaza', x0 + 6, x1 - 6, cz - 50, cz + 50)
  const rx = 66,
    rz = 44,
    h = 26
  const b = building('stadium', { style: 'concrete', tint: 0xe6e2da })
  shaft(b, ring(cx, cz, rx, rz, 32), 0, h, { smooth: true })
  b.stadium = { cx, cz, rx, rz, h }
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ]) {
    const x = cx + sx * (rx + 10),
      z = cz + sz * (rz + 2)
    post(x, z, 0.7, 42, 'mast')
    prop('mast', { x, z, h: 42, big: true })
  }
  for (let i = 0; i < 10; i++) palm(x0 + 8 + i * 17, cz - 50, 20 + R() * 6, true)
  for (let i = 0; i < 10; i++) palm(x0 + 8 + i * 17, cz + 50, 20 + R() * 6, true)
  billboard(x1 - 10, z0 + 40, 1)
}

// ---------- the LA River ----------
export function river (blk, lot) {
  blk.base = 'channel'
  const { x0, x1, z0, z1 } = lot
  // (a parapet round the channel: the car stays on the bridges and the banks)
  const h = 1.1,
    t = 0.35
  solid(x0, x1, z0, z0 + t, 0, h, 'plant', 'parapet')
  solid(x0, x1, z1 - t, z1, 0, h, 'plant', 'parapet')
  solid(x0, x0 + t, z0, z1, 0, h, 'plant', 'parapet')
  solid(x1 - t, x1, z0, z1, 0, h, 'plant', 'parapet')
}

// ---------- under the freeway ----------
// (the deck and its ramps: freeway.js; here the car parks between its columns and a strip of green)
export function corridor (blk, lot, deckZ0, deckZ1, ramps, end) {
  blk.base = 'asphalt'
  const { x0, x1, z0, z1 } = lot
  ground(blk, 'asphalt', x0, x1, z0, z1)
  if (end) ramps = [] // (the slope down to the street fills the deck's band)
  for (let x = x0 + 6; x < x1 - 2 && !end; x += 16)
    for (const z of [deckZ0 + 2.5, deckZ1 - 2.5]) {
      post(x, z, 0.8, 7, 'column')
      prop('column', { x, z, r: 0.8 })
    }
  // car parks under the deck, either side of the columns' middle
  if (!end) stalls(0, x0 + 8, x1 - 8, (deckZ0 + deckZ1) / 2 - 3, -1, 0.45)
  if (!end) stalls(0, x0 + 8, x1 - 8, (deckZ0 + deckZ1) / 2 + 3, 1, 0.45)
  // a strip of green with trees along the sides where no ramp runs
  for (const [za, zb, side] of [
    [z0, deckZ0, 'n'],
    [deckZ1, z1, 's']
  ]) {
    if (ramps.includes(side)) continue
    ground(blk, 'grass', x0, x1, za + 1, zb - 1)
    for (let x = x0 + 5; x < x1 - 3; x += 11) tree(x, (za + zb) / 2, 0.8 + R() * 0.3)
  }
}

// ---------- sports parks ----------
export function sportsPark (blk, lot) {
  blk.base = 'grass'
  const { x0, x1, z0, z1 } = lot
  const cx = (x0 + x1) / 2
  // two basketball courts side by side along the north
  for (const [a, b] of [
    [x0 + 4, x0 + 33],
    [x0 + 37, x0 + 66]
  ]) {
    ground(blk, 'court', a, b, z0 + 4, z0 + 20)
    for (const [hx, yaw] of [
      [a + 1.2, 0],
      [b - 1.2, Math.PI]
    ])
      prop('hoop', { x: hx, z: z0 + 12, yaw })
  }
  fence(x0 + 2, x0 + 68, z0 + 2, z0 + 22, 2, 4)
  // a ball field to the south, bleachers by it, floodlights
  ground(blk, 'dirt', cx - 22, cx + 22, z1 - 46, z1 - 4)
  solid(x1 - 9, x1 - 2, z1 - 40, z1 - 12, 0, 3, 'building', 'prop')
  prop('bleachers', { x0: x1 - 9, x1: x1 - 2, z0: z1 - 40, z1: z1 - 12, h: 3, face: 3 })
  for (const [x, z] of [
    [x0 + 2, z1 - 4],
    [x1 - 2, z1 - 46]
  ]) {
    post(x, z, 0.3, 18, 'mast')
    prop('mast', { x, z, h: 18 })
  }
  for (let i = 0; i < 14; i++) tree(x0 + 3 + R() * 10, z0 + 26 + R() * 40, 0.8 + R() * 0.5)
}

// ---------- parking garages ----------
// two decks of concrete over the ground floor, open sides; a ramp up its north side to the roof
export const GARAGE_H = 6.4
export function garage (blk, lot) {
  blk.base = 'asphalt'
  const { x0, x1, z0, z1 } = lot
  const b = building('garage', { style: 'garage', tint: pick([0xd9d4c9, 0xcfcac0, 0xe0dacd]) })
  tier(b, x0 + 1, x1 - 1, z0 + 9, z1 - 1, 0, GARAGE_H)
  b.garage = true
  // the ramp along the north side, rising east to the roof's edge
  ramp(x0 + 1, x1 - 1, z0 + 1, z0 + 9, 'x', 0, GARAGE_H)
  solid(x0 + 1, x1 - 1, z0 + 0.6, z0 + 1, 0, GARAGE_H + 1, 'plant', 'parapet')
  sign('mall', { x: x1 - 3, z: z1 - 1, y: 2.5, w: 3, h: 3, d: 0.3, face: 2, k: R() })
}
