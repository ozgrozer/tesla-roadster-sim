// What there is to find off the streets, drawn (sim/extras.js lays it out): the alleys' dumpsters,
// bins, crates and trash bags, the lamps over their back doors, their fire escapes and the lights
// strung across them; the street furniture (newspaper boxes, parking meters, mailboxes); the
// lookout's and the promenade's benches and coin telescopes. Merged by where it stands, in a grid
// of 576 m squares (each streamed out with the fog, chunks.js, as the districts' meshes), lit
// pieces in one mesh a square and what glows in one mesh for the city.
import * as THREE from 'three'
import { Builder } from './builder.js'
import { EXTRAS } from '../sim/world.js'

const C = hex => new THREE.Color(hex)
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _s = new THREE.Vector3(1, 1, 1),
  _p = new THREE.Vector3()
const at = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  _m.compose(
    _p.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')),
    _s.set(sx, sy, sz)
  )
const BOX = new THREE.BoxGeometry(1, 1, 1),
  CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1),
  BAG = new THREE.IcosahedronGeometry(1, 0)
// a box of w (along the yaw's x), h, d centred at (x, y0 + h / 2, z), turned by yaw
const boxAt = (B, x, y0, z, w, h, d, yaw, col) =>
  B.add(BOX, at(x, y0 + h / 2, z, yaw, w, h, d), col)

const STEEL = C(0x4a4e54),
  DARK = C(0x23262b),
  WOOD = C(0x9a7448),
  GREY = C(0x8c9096),
  BLUE = C(0x1f4f9a),
  BAGS = C(0x15171a)
const SKIP = [0x2f6b3a, 0x2a4f8a, 0x6b4a2a, 0x3a5a5a].map(C)
const IRON = C(0x1c1e21),
  LIT = C(0x7a6444) // (a lit room behind, not a lamp: dim in the glow mesh)
const NEWS = [0xc8302a, 0x2a5aa8, 0xe8c02a, 0x3a8a4a, 0xe8e4da].map(C)

function dumpster (B, e) {
  const c = SKIP[e.tint % 4]
  B.cuboid(
    e.x - e.w / 2,
    e.x + e.w / 2,
    e.z - e.d / 2,
    e.z + e.d / 2,
    0.12,
    e.h - 0.08,
    c
  )
  B.cuboid(
    e.x - e.w / 2 - 0.05,
    e.x + e.w / 2 + 0.05,
    e.z - e.d / 2 - 0.05,
    e.z + e.d / 2 + 0.05,
    e.h - 0.08,
    e.h,
    DARK
  )
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      boxAt(
        B,
        e.x + sx * (e.w / 2 - 0.15),
        0,
        e.z + sz * (e.d / 2 - 0.15),
        0.12,
        0.14,
        0.12,
        0,
        DARK
      )
}
function bin (B, e) {
  B.cuboid(
    e.x - e.w / 2 + 0.03,
    e.x + e.w / 2 - 0.03,
    e.z - e.d / 2 + 0.03,
    e.z + e.d / 2 - 0.03,
    0,
    e.h - 0.06,
    SKIP[e.tint % 4]
  )
  B.cuboid(
    e.x - e.w / 2,
    e.x + e.w / 2,
    e.z - e.d / 2,
    e.z + e.d / 2,
    e.h - 0.06,
    e.h,
    DARK
  )
}
function crate (B, e) {
  const n = e.h > 1 ? 2 : 1
  for (let k = 0; k < n; k++) {
    const y = k * 0.9,
      s = k ? 0.85 : 1
    B.cuboid(
      e.x - (e.w * s) / 2,
      e.x + (e.w * s) / 2,
      e.z - (e.d * s) / 2,
      e.z + (e.d * s) / 2,
      y,
      y + 0.9,
      k ? C(0xb08a5a) : WOOD
    )
  }
}
function bags (B, e) {
  for (let k = 0; k < e.n; k++) {
    const a = (e.seed * 7 + k * 2.1) % (Math.PI * 2),
      r = 0.25 + ((e.seed * 13 + k) % 1) * 0.2
    B.add(
      BAG,
      at(
        e.x + Math.cos(a) * r,
        0.24,
        e.z + Math.sin(a) * r,
        a,
        0.32,
        0.26,
        0.3
      ),
      BAGS
    )
  }
}
function lamp (B, G, e) {
  // (a bracket out from the wall and its lamp, glowing)
  const ox = e.along ? e.side * 0.25 : 0,
    oz = e.along ? 0 : e.side * 0.25
  boxAt(
    B,
    e.x + ox / 2,
    e.y + 0.2,
    e.z + oz / 2,
    e.along ? 0.5 : 0.08,
    0.08,
    e.along ? 0.08 : 0.5,
    0,
    DARK
  )
  boxAt(B, e.x + ox, e.y, e.z + oz, 0.32, 0.18, 0.32, 0, DARK)
  boxAt(G, e.x + ox, e.y - 0.06, e.z + oz, 0.24, 0.08, 0.24, 0, C(0xffc878))
  // and the back door under it
  boxAt(
    B,
    e.x + ox * 0.12,
    0,
    e.z + oz * 0.12,
    e.along ? 0.06 : 1.1,
    2.2,
    e.along ? 1.1 : 0.06,
    0,
    C(0x5a3a2a)
  )
}
function escape (B, G, e) {
  const L = e.len,
    D = e.deep * e.sgn
  // the landings (as the colliders), their railings, and a flight of steps between each pair
  const box = (u0, u1, v0, v1, y0, y1, col, T = B) =>
    e.along
      ? T.cuboid(
          Math.min(e.x + v0, e.x + v1),
          Math.max(e.x + v0, e.x + v1),
          e.z + u0,
          e.z + u1,
          y0,
          y1,
          col
        )
      : T.cuboid(
          e.x + u0,
          e.x + u1,
          Math.min(e.z + v0, e.z + v1),
          Math.max(e.z + v0, e.z + v1),
          y0,
          y1,
          col
        )
  e.levels.forEach((y, i) => {
    box(0, L, 0, D, y - 0.12, y, STEEL)
    // the railing: top and middle rails, and bars down to the landing, open to see through
    const s = e.sgn
    for (const r of [0.5, 1.0]) {
      box(0, L, D - 0.05 * s, D, y + r - 0.05, y + r, IRON)
      box(0, 0.05, 0, D, y + r - 0.05, y + r, IRON)
      box(L - 0.05, L, 0, D, y + r - 0.05, y + r, IRON)
    }
    for (let u = 0; u <= L + 0.01; u += 0.45)
      box(u, u + 0.04, D - 0.04 * s, D, y, y + 1.0, IRON)
    // its brackets under it, back to the wall
    for (const u of [0.1, L - 0.1])
      box(u - 0.04, u + 0.04, 0, D, y - 0.5, y - 0.12, IRON)
    // the window it serves, lit at night (a hand's width out from the wall)
    box(L * 0.55, L * 0.55 + 1.1, 0, 0.06 * s, y + 0.2, y + 1.7, C(0x2a2622))
    box(
      L * 0.55 + 0.1,
      L * 0.55 + 1.0,
      0.06 * s,
      0.08 * s,
      y + 0.3,
      y + 1.6,
      LIT,
      G
    )
    const next = e.levels[i + 1]
    if (next !== undefined) {
      // the steps: a slab sloping up along it
      const h = next - y,
        run = L - 1,
        slope = Math.atan2(h, run),
        len = Math.hypot(h, run)
      const u = (i % 2 ? 0.5 : 0.5) + run / 2,
        v = D / 2
      const cx = e.along ? e.x + v : e.x + u,
        cz = e.along ? e.z + u : e.z + v
      const sgn = i % 2 ? -1 : 1
      if (e.along)
        B.add(
          BOX,
          at(
            cx,
            y + h / 2,
            cz,
            0,
            Math.abs(D) * 0.7,
            0.08,
            len,
            sgn * slope,
            0
          ),
          STEEL
        )
      else
        B.add(
          BOX,
          at(
            cx,
            y + h / 2,
            cz,
            0,
            len,
            0.08,
            Math.abs(D) * 0.7,
            0,
            sgn * slope
          ),
          STEEL
        )
    }
  })
  // the drop ladder from the first landing, hanging to head height off the ground
  const y0 = e.levels[0],
    u = L - 0.75
  for (const w of [0, 0.45])
    box(u + w, u + w + 0.05, D * 0.45, D * 0.45 + 0.05 * e.sgn, 1.6, y0, IRON)
  for (let y = 1.8; y < y0; y += 0.32)
    box(u, u + 0.5, D * 0.45, D * 0.45 + 0.04 * e.sgn, y, y + 0.04, IRON)
}
function string (B, G, e) {
  const n = 7
  for (let k = 0; k <= n; k++) {
    const t = k / n,
      sag = Math.sin(t * Math.PI) * 0.5
    boxAt(
      G,
      e.ax + (e.bx - e.ax) * t,
      e.y - sag - 0.06,
      e.az + (e.bz - e.az) * t,
      0.1,
      0.12,
      0.1,
      0,
      C(k % 2 ? 0xffd27a : 0xfff0d0)
    )
  }
  const len = Math.hypot(e.bx - e.ax, e.bz - e.az)
  B.add(
    BOX,
    at(
      (e.ax + e.bx) / 2,
      e.y - 0.25,
      (e.az + e.bz) / 2,
      Math.atan2(-(e.bz - e.az), e.bx - e.ax),
      len,
      0.02,
      0.02
    ),
    DARK
  )
}
function news (B, e) {
  boxAt(B, e.x, 0, e.z, 0.5, 0.95, 0.46, e.yaw, NEWS[e.tint % 5])
  boxAt(B, e.x, 0.95, e.z, 0.54, 0.08, 0.5, e.yaw, DARK)
  // (the window on its front, towards the road)
  const fx = Math.cos(e.yaw) * 0.235,
    fz = -Math.sin(e.yaw) * 0.235
  boxAt(
    B,
    e.x + fx,
    0.5,
    e.z + fz,
    0.4,
    0.3,
    0.02,
    e.yaw + Math.PI / 2,
    C(0xd8dcd8)
  )
}
function meter (B, e) {
  B.add(CYL, at(e.x, 0.55, e.z, 0, 0.045, 1.1, 0.045), GREY)
  boxAt(B, e.x, 1.08, e.z, 0.2, 0.3, 0.14, e.yaw, DARK)
  boxAt(B, e.x, 1.17, e.z, 0.22, 0.06, 0.16, e.yaw, C(0xc8a02a))
}
function mailbox (B, e) {
  boxAt(B, e.x, 0.15, e.z, 0.52, 0.85, 0.52, e.yaw, BLUE)
  B.add(CYL, at(e.x, 1.0, e.z, e.yaw, 0.26, 0.52, 0.26, Math.PI / 2), BLUE)
  for (const s of [-1, 1])
    boxAt(B, e.x + s * 0.22, 0, e.z + s * 0.22, 0.06, 0.15, 0.06, e.yaw, DARK)
}
function scope (B, e) {
  B.add(CYL, at(e.x, e.y + 0.55, e.z, 0, 0.08, 1.1, 0.08), C(0x2f4a3a))
  boxAt(B, e.x, e.y + 1.05, e.z, 0.34, 0.26, 0.26, e.yaw, C(0x2f4a3a))
  const fx = Math.cos(e.yaw),
    fz = -Math.sin(e.yaw)
  for (const s of [-0.08, 0.08])
    B.add(
      CYL,
      at(
        e.x + fx * 0.25 - fz * s,
        e.y + 1.12,
        e.z + fz * 0.25 + fx * s,
        e.yaw,
        0.06,
        0.3,
        0.06,
        0,
        Math.PI / 2
      ),
      DARK
    )
}
function bench (B, e) {
  // (the seat along the yaw's z: sat facing the yaw)
  const fx = Math.cos(e.yaw),
    fz = -Math.sin(e.yaw)
  boxAt(B, e.x, e.y + 0.4, e.z, 0.5, 0.06, 1.8, e.yaw, WOOD)
  boxAt(
    B,
    e.x - fx * 0.24,
    e.y + 0.46,
    e.z - fz * 0.24,
    0.06,
    0.45,
    1.8,
    e.yaw,
    WOOD
  )
  for (const s of [-0.75, 0.75])
    boxAt(B, e.x + fz * s, e.y, e.z - fx * s, 0.45, 0.4, 0.06, e.yaw, DARK)
}

// the street furniture, bins and crates on their own (cityKnocks.js draws them, knockable)
export const DRAW = { news, meter, mailbox, scope, bench, bin, crate }

const CELL = 576
export function buildExtras (group) {
  const cells = new Map(),
    G = new Builder()
  const cellOf = e => {
    const k = `${Math.floor((e.x ?? e.ax) / CELL)},${Math.floor(
      (e.z ?? e.az) / CELL
    )}`
    if (!cells.has(k)) cells.set(k, new Builder())
    return cells.get(k)
  }
  const ONE = {
    dumpster,
    bin,
    crate,
    bags,
    escape,
    news,
    meter,
    mailbox,
    scope,
    bench
  }
  for (const e of EXTRAS) {
    if (e.knock !== undefined) continue
    const B = cellOf(e)
    if (e.kind === 'lamp') lamp(B, G, e)
    else if (e.kind === 'string') string(B, G, e)
    else if (e.kind === 'escape') escape(B, G, e)
    else ONE[e.kind]?.(B, e)
  }
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0.15
  })
  for (const B of cells.values()) {
    const m = new THREE.Mesh(B.geometry(), mat)
    m.castShadow = m.receiveShadow = true
    m.name = 'extras'
    group.add(m)
  }
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: new THREE.Color(1, 1, 1)
  })
  const gm = new THREE.Mesh(G.geometry(), glowMat)
  gm.name = 'extras glow'
  group.add(gm)
  return {
    night (k) {
      glowMat.color.setScalar(0.5 + 2.6 * k)
    }
  }
}
