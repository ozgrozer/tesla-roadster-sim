// The port's waterfront (the sim lays it out: quay.js): the concrete wharf over the beach's face,
// its edge line, bollards and fenders, the ship-to-shore cranes on their rails (legs, portal, boom
// out over the water, the machinery house and the A-frame over it), and the container ship moored
// alongside, its hull, its cargo in stacks and its bridge house at the stern. Static, merged: a
// mesh for the steel and concrete, one for the boxes.
import * as THREE from 'three'
import { QUAY, CRANES, SHIP } from '../sim/quay.js'
import { PROPS } from '../sim/lots.js'
import { Builder } from './builder.js'

const C = hex => new THREE.Color(hex)
const BOX = [
  0x2a5a9c, 0xb8332b, 0x2f7d4f, 0xd27a2c, 0x8f8f8a, 0xe6e2d6, 0x1d3b63,
  0x8a4b2e, 0x3f8f95, 0xc9a227
] // (cityWorks.js's)
const CRANE = [C(0xc23b2e), C(0x2f5f9a)],
  WHITE = C(0xeeeeea),
  DARK = C(0x2b2c2f),
  CONCRETE = C(0xb3ada1),
  HULL = C(0x1f2d3d),
  RED = C(0x8e2a23)

function quay (B) {
  const { x0, x1, z0, z1 } = QUAY,
    y = 0.07
  B.top(x0, x1, z0, z1, y, CONCRETE)
  B.quad([x0, -3.4, z0], [x0, -3.4, z1], [x0, y, z1], [x0, y, z0], [-1, 0, 0], [0, 0, 1, 1], CONCRETE)
  B.cuboid(x0, x1, z0 - 0.5, z0, -3.4, y, CONCRETE)
  B.top(x0 + 1.2, x0 + 1.45, z0, z1, y + 0.01, C(0xe2b53a)) // (the edge line)
  for (let z = z0 + 6; z < z1; z += 14) {
    B.cuboid(x0 + 0.4, x0 + 0.9, z - 0.25, z + 0.25, y, y + 0.6, DARK) // (a bollard)
    B.cuboid(x0 - 0.5, x0, z - 1, z + 1, -2.6, -0.2, C(0x151515)) // (a fender)
  }
  // the crane rails
  for (const c of CRANES)
    for (const x of [c.xw, c.xl]) {
      B.top(x - 0.3, x + 0.3, z0, z1, y + 0.02, C(0x6c6f72))
    }
}
function crane (B, c) {
  const col = CRANE[c.c],
    { xw, xl, z, span, h } = c
  const leg = (x, dz) => B.cuboid(x - 0.7, x + 0.7, z + dz - 0.7, z + dz + 0.7, 0, h, col)
  for (const x of [xw, xl]) for (const dz of [-span / 2, span / 2]) leg(x, dz)
  // (the sill beams low along the quay and the portal across the top of the legs)
  for (const x of [xw, xl]) B.cuboid(x - 0.8, x + 0.8, z - span / 2 - 0.8, z + span / 2 + 0.8, 0.4, 1.6, col)
  for (const dz of [-span / 2, span / 2]) {
    B.cuboid(xw - 0.8, xl + 0.8, z + dz - 0.8, z + dz + 0.8, h - 2.5, h, col)
    B.cuboid(xw - 0.6, xl + 0.6, z + dz - 0.5, z + dz + 0.5, 12, 13, col) // (a cross brace)
  }
  // the boom, out over the water and back over the quay, at the top of the portal
  const bx0 = xw - c.out,
    bx1 = xl + c.back
  for (const dz of [-2.2, 2.2]) B.cuboid(bx0, bx1, z + dz - 0.5, z + dz + 0.5, h + 0.5, h + 3.5, col)
  for (let x = bx0 + 3; x < bx1; x += 6) B.cuboid(x - 0.2, x + 0.2, z - 2.2, z + 2.2, h + 3, h + 3.4, col)
  // the machinery house at the back, the operator's cab under the boom, the A-frame and its stays
  B.cuboid(xl - 2, xl + 10, z - 4, z + 4, h + 3.5, h + 9, WHITE)
  B.cuboid(xw - 6, xw - 2, z - 1.6, z + 1.6, h - 3, h + 0.5, WHITE)
  for (const dz of [-3.5, 3.5]) B.cuboid(xl - 1, xl + 1, z + dz - 0.6, z + dz + 0.6, h + 3.5, h + 22, col)
  B.cuboid(xl - 1, xl + 1, z - 4, z + 4, h + 21, h + 23, col)
  // (a spreader and its cables hanging over the ship)
  const sx = xw - 30
  B.cuboid(sx - 1.2, sx + 1.2, z - 6, z + 6, h - 16, h - 15, C(0xd9b23a))
  for (const dz of [-1.5, 1.5]) B.cuboid(sx - 0.05, sx + 0.05, z + dz - 0.05, z + dz + 0.05, h - 15, h + 0.5, DARK)
}
function ship (B, K, s) {
  const { x0, x1, z0, z1, deck } = s,
    lo = -6
  const bow = 26 // (its bow narrows to a point over the last metres, north)
  const xm = (x0 + x1) / 2
  B.walls(x0, x1, z0 + bow, z1, lo, deck, HULL, w => [0, 0, w / 8, 1])
  B.cuboid(x0 - 0.02, x1 + 0.02, z0 + bow, z1, lo, -1.4, RED) // (the antifouling under the waterline)
  B.top(x0, x1, z0 + bow, z1, deck, C(0x5a5f63))
  // the bow: a wedge, its two sides and its deck
  const P = (x, y, z) => [x, y, z]
  B.quad(P(x0, lo, z0 + bow), P(xm, lo, z0), P(xm, deck + 2, z0), P(x0, deck + 2, z0 + bow), [-0.7, 0, -0.7], [0, 0, 1, 1], HULL)
  B.quad(P(xm, lo, z0), P(x1, lo, z0 + bow), P(x1, deck + 2, z0 + bow), P(xm, deck + 2, z0), [0.7, 0, -0.7], [0, 0, 1, 1], HULL)
  B.tri(P(x0, deck + 2, z0 + bow), P(xm, deck + 2, z0), P(x1, deck + 2, z0 + bow), [0, 1, 0], [0, 0, 1, 0, 0.5, 1], C(0x5a5f63))
  // the bridge house at the stern, its funnel
  B.cuboid(x0 + 2, x1 - 2, z1 - 30, z1 - 18, deck, deck + 22, WHITE)
  B.cuboid(x0 + 1, x1 - 1, z1 - 31, z1 - 17, deck + 19, deck + 20, WHITE) // (the bridge wings)
  B.cuboid(xm - 3, xm + 3, z1 - 14, z1 - 8, deck, deck + 16, C(0xb8332b))
  // the cargo
  for (const t of s.stacks)
    for (let i = 0; i < t.n; i++) {
      const c = C(BOX[(t.c + i * 3) % 10])
      K.cuboid(t.x - 1.21, t.x + 1.21, t.z - 6, t.z + 6, deck + i * 2.59, deck + (i + 1) * 2.59 - 0.04, c)
    }
}

export function buildPort (group) {
  const B = new Builder(),
    K = new Builder()
  quay(B)
  for (const c of CRANES) crane(B, c)
  const s = PROPS.find(p => p.kind === 'ship') || { ...SHIP, stacks: [] }
  ship(B, K, s)
  for (const [b, name, rough] of [
    [B, 'port', 0.8],
    [K, 'ship cargo', 0.7]
  ]) {
    if (b.empty) continue
    const m = new THREE.Mesh(b.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0.1 }))
    m.castShadow = m.receiveShadow = true
    m.name = name
    group.add(m)
  }
}
