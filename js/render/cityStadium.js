// The stadium's bowl (venues.js lays the building out: b.stadium { cx, cz, rx, rz, h }): over its
// concrete drum, the pitch in mown stripes with its lines, the stands raked up from it in tiers of
// coloured seats with aisles of concrete between, the back wall round the top, and the canopy ring
// over the upper tier on its struts, with a row of floodlight banks under its edge. Static, merged:
// one mesh for all of it.
import * as THREE from 'three'
import { BUILDINGS } from '../sim/lots.js'
import { Builder } from './builder.js'

const C = hex => new THREE.Color(hex)
const SEATS = [C(0x1f4fa0), C(0xc9a227), C(0x1f4fa0), C(0xb8332b)],
  AISLE = C(0x9b978f),
  GRASS = [C(0x3f8f3a), C(0x4a9c42)],
  LINE = C(0xf2f2ee),
  WALL = C(0xd9d4ca),
  CANOPY = C(0xeeeeea),
  STEEL = C(0x6f7377),
  LAMP = C(0xfff4c8)
const SEG = 48
const TAU = Math.PI * 2

// a point on the ellipse at fraction f of the drum's radii, angle t
const at = (s, f, t, y) => [s.cx + Math.cos(t) * s.rx * f, y, s.cz + Math.sin(t) * s.rz * f]
function normal (a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}
// a quad seen from both sides (the bowl is looked at from above and from inside)
function both (B, a, b, c, d, col) {
  const n = normal(a, b, c)
  B.quad(a, b, c, d, n, [0, 0, 1, 1], col)
  B.quad(d, c, b, a, [-n[0], -n[1], -n[2]], [0, 0, 1, 1], col)
}
// a ring of the bowl from (f0, y0) to (f1, y1), coloured col(i) by segment
function band (B, s, f0, y0, f1, y1, col) {
  for (let i = 0; i < SEG; i++) {
    const t0 = (i / SEG) * TAU,
      t1 = ((i + 1) / SEG) * TAU
    both(B, at(s, f0, t0, y0), at(s, f0, t1, y0), at(s, f1, t1, y1), at(s, f1, t0, y1), col(i))
  }
}
// a flat ellipse at fraction f, height y (a fan from the middle)
function disc (B, s, f, y, col) {
  for (let i = 0; i < SEG; i++) {
    const t0 = (i / SEG) * TAU,
      t1 = ((i + 1) / SEG) * TAU
    B.tri([s.cx, y, s.cz], at(s, f, t1, y), at(s, f, t0, y), [0, 1, 0], [0, 0, 1, 0, 1, 1], col)
  }
}

function bowl (B, s) {
  const y = s.h + 0.06
  // the pitch: a running track round it, the grass in stripes across, the lines
  disc(B, s, 0.56, y, C(0xa5523a))
  const px = s.rx * 0.4,
    pz = s.rz * 0.36
  const n = 12
  for (let k = 0; k < n; k++) {
    const x0 = s.cx - px + (2 * px * k) / n,
      x1 = x0 + (2 * px) / n
    B.top(x0, x1, s.cz - pz, s.cz + pz, y + 0.02, GRASS[k % 2])
  }
  const l = 0.25
  for (const [x0, x1, z0, z1] of [
    [s.cx - px, s.cx + px, s.cz - pz, s.cz - pz + l],
    [s.cx - px, s.cx + px, s.cz + pz - l, s.cz + pz],
    [s.cx - px, s.cx - px + l, s.cz - pz, s.cz + pz],
    [s.cx + px - l, s.cx + px, s.cz - pz, s.cz + pz],
    [s.cx - l / 2, s.cx + l / 2, s.cz - pz, s.cz + pz]
  ])
    B.top(x0, x1, z0, z1, y + 0.04, LINE)
  // the stands: the lower tier, a concourse, the upper tier, each in seat colours with aisles
  const seat = tier => i => (i % 6 === 0 ? AISLE : SEATS[(tier + Math.floor(i / 12)) % SEATS.length])
  band(B, s, 0.58, y + 1.2, 0.78, y + 8, seat(0))
  band(B, s, 0.56, y, 0.58, y + 1.2, () => WALL) // (the wall in front of the first row)
  band(B, s, 0.78, y + 8, 0.81, y + 8, () => AISLE)
  band(B, s, 0.81, y + 8, 0.81, y + 9.5, () => WALL)
  band(B, s, 0.81, y + 9.5, 0.99, y + 17, seat(1))
  band(B, s, 0.99, y, 0.99, y + 18, () => WALL) // (the back wall, over the drum's edge)
  // the canopy over the upper tier, on struts at the back wall, the floodlights under its edge
  band(B, s, 0.8, y + 23, 1.02, y + 23, () => CANOPY)
  band(B, s, 1.02, y + 22.2, 1.02, y + 23, () => STEEL)
  band(B, s, 0.8, y + 22.4, 0.8, y + 23, () => STEEL)
  for (let i = 0; i < SEG; i += 3) {
    const t = (i / SEG) * TAU,
      [x, , z] = at(s, 0.995, t, 0)
    B.cuboid(x - 0.4, x + 0.4, z - 0.4, z + 0.4, y + 17, y + 23, STEEL)
    const [lx, , lz] = at(s, 0.81, t + TAU / SEG / 2, 0)
    B.cuboid(lx - 0.9, lx + 0.9, lz - 0.9, lz + 0.9, y + 21.8, y + 22.4, LAMP)
  }
}

export function buildStadium (group) {
  const B = new Builder()
  for (const b of BUILDINGS) if (b.stadium) bowl(B, b.stadium)
  if (B.empty) return
  const m = new THREE.Mesh(B.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
  m.castShadow = m.receiveShadow = true
  m.name = 'stadium bowl'
  group.add(m)
}
