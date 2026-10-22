// What there is to find off the streets, laid out after everything else on its own random numbers
// (rng 20261022: the layout, the parked cars and the traffic's dealing stay as they were): the
// alleys (the gaps the blocks already leave between their buildings, where one opens onto a
// street: dumpsters, bins, crates, a lamp over a back door, fire escapes up the taller walls, lights
// strung across some), the street furniture (newspaper boxes and parking meters along the shopping
// streets, mailboxes in the strips and the suburbs, between the street lights at the kerb's edge,
// outside the people's walking lines), and the lookout's and the beach promenade's benches and coin
// telescopes. Everything solid is a collider and is drawn (render/cityExtras.js): nothing in the
// way that can't be seen, nothing seen that can be driven through but the trash on the ground.
//
//   ALLEYS[i]  = { x0, x1, z0, z1, axis ('x' | 'z': the way it runs), open (the end on the street:
//                 -1 the low end, 1 the high), area, deep (its far end, { x, z }) }
//   EXTRAS[i]  = { kind, x, z, y, w, d, h, yaw, ... } what is drawn ('dumpster', 'bin', 'crate',
//                 'bags', 'lamp', 'escape', 'string', 'news', 'meter', 'mailbox', 'bench', 'scope')
import {
  BLOCKS,
  BUILDINGS,
  LAMPS,
  WALK,
  PROMENADE,
  rng,
  query,
  addCollider
} from './city.js'
import { LOOKOUT } from './hillroad.js'
import { SITES } from './interiors/sites.js'
import { PIER } from './edge.js'

const R = rng(20261022)
export const ALLEYS = []
export const EXTRAS = []

const hits = []
// nothing at body height in [x0, x1] x [z0, z1] (m: a margin round it)
function open (x0, x1, z0, z1, m = 0.2, y = 0) {
  for (const c of query(x0 - m, z0 - m, x1 + m, z1 + m, hits))
    if (!c.down && c.y0 < y + 2 && c.y1 > y + 0.3) return false
  return true
}
const solid = (x0, x1, z0, z1, y0, y1, look) =>
  addCollider({ x0, x1, z0, z1, y0, y1, kind: 'plant', look })
const post = (x, z, r, y0, y1, look) =>
  addCollider({
    x0: x - r,
    x1: x + r,
    z0: z - r,
    z1: z + r,
    y0,
    y1,
    x,
    z,
    r,
    kind: 'mast',
    look
  })
// a box standing on the ground at (x, z), w along x, d along z: solid and drawn
function thing (kind, x, z, w, d, h, extra = {}, y = 0) {
  if (!open(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.05, y)) return null
  solid(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h, kind)
  const e = { kind, x, z, y, w, d, h, ...extra }
  EXTRAS.push(e)
  return e
}
const nearDoor = (x0, x1, z0, z1) =>
  SITES.some(
    s =>
      s.out.x > x0 - 3 &&
      s.out.x < x1 + 3 &&
      s.out.z > z0 - 3 &&
      s.out.z < z1 + 3
  )

// ---------- the alleys ----------
const ALLEY_AREAS = new Set([
  'downtown',
  'industrial',
  'beach',
  'boulevard',
  'strip'
])
function findAlleys () {
  const found = []
  for (const blk of BLOCKS) {
    if (!ALLEY_AREAS.has(blk.area) || blk.kind !== 'city' || blk.super) continue
    const lx0 = blk.x0 + WALK,
      lx1 = blk.x1 - WALK,
      lz0 = blk.z0 + WALK,
      lz1 = blk.z1 - WALK
    const bs = BUILDINGS.filter(
      b =>
        b.h > 5 &&
        b.x0 >= lx0 - 1 &&
        b.x1 <= lx1 + 1 &&
        b.z0 >= lz0 - 1 &&
        b.z1 <= lz1 + 1
    )
    for (const a of bs)
      for (const b of bs) {
        if (a === b) continue
        for (const axis of ['z', 'x']) {
          // (along z: a west of b, the gap between them running north-south)
          const g = axis === 'z' ? b.x0 - a.x1 : b.z0 - a.z1
          if (g < 2.6 || g > 8) continue
          const r =
            axis === 'z'
              ? {
                  x0: a.x1,
                  x1: b.x0,
                  z0: Math.max(a.z0, b.z0),
                  z1: Math.min(a.z1, b.z1)
                }
              : {
                  x0: Math.max(a.x0, b.x0),
                  x1: Math.min(a.x1, b.x1),
                  z0: a.z1,
                  z1: b.z0
                }
          const len = axis === 'z' ? r.z1 - r.z0 : r.x1 - r.x0
          if (len < 12) continue
          // one end on the pavement
          const lo = axis === 'z' ? r.z0 - lz0 : r.x0 - lx0,
            hi = axis === 'z' ? lz1 - r.z1 : lx1 - r.x1
          const end = lo < 1.2 ? -1 : hi < 1.2 ? 1 : 0
          if (
            !end ||
            !open(r.x0 + 0.15, r.x1 - 0.15, r.z0 + 0.15, r.z1 - 0.15, 0) ||
            nearDoor(r.x0, r.x1, r.z0, r.z1)
          )
            continue
          found.push({
            ...r,
            axis,
            open: end,
            area: blk.area,
            wall: Math.min(a.h, b.h),
            len
          })
        }
      }
  }
  return found
}
// dress one alley: what stands along its walls, from its far end back towards the street
function dress (al) {
  const along = al.axis === 'z'
  const w = along ? al.x1 - al.x0 : al.z1 - al.z0
  // u: m along it from the street; v: m across from its first wall
  const P = (u, v) => {
    const t = al.open < 0 ? u : al.len - u
    return along
      ? { x: al.x0 + v, z: al.z0 + t }
      : { x: al.x0 + t, z: al.z0 + v }
  }
  const side = R() < 0.5 ? 0 : 1
  const vAt = d => (side ? w - d / 2 - 0.1 : d / 2 + 0.1)
  al.deep = P(al.len - 1.5, w / 2)
  let u = al.len - 2.2
  // a dumpster or two where there is room to pass it, else wheelie bins
  const big = w >= 3.8
  for (let k = 0; k < (big ? 1 + (R() < 0.5 ? 1 : 0) : 2); k++) {
    if (u < 4) break
    const [lw, ld, h] = big ? [2.0, 1.15, 1.35] : [0.62, 0.7, 1.05]
    const p = P(u - lw / 2, vAt(ld))
    thing(
      big ? 'dumpster' : 'bin',
      p.x,
      p.z,
      along ? ld : lw,
      along ? lw : ld,
      h,
      { tint: Math.floor(R() * 4), along }
    )
    u -= lw + 0.4 + R() * 1.2
  }
  // crates stacked, bags of trash by them (to look at only)
  if (u > 5 && R() < 0.7) {
    const p = P(u - 0.6, vAt(1))
    thing('crate', p.x, p.z, 1, 1, 0.9 + (R() < 0.5 ? 0.9 : 0), { along })
    u -= 1.8
  }
  if (u > 4) {
    const p = P(u - 0.5, vAt(0.8))
    EXTRAS.push({
      kind: 'bags',
      x: p.x,
      z: p.z,
      y: 0,
      w: 0.9,
      d: 0.9,
      h: 0.5,
      n: 2 + Math.floor(R() * 3),
      seed: R()
    })
  }
  // a lamp over a back door on the other wall
  const lp = P(al.len * (0.35 + R() * 0.4), side ? 0.05 : w - 0.05)
  EXTRAS.push({
    kind: 'lamp',
    x: lp.x,
    z: lp.z,
    y: 3.1,
    along,
    side: side ? -1 : 1
  })
  // a fire escape up the taller walls (its landings solid)
  if (al.wall > 10 && R() < 0.65) {
    const u0 = 2.5 + R() * Math.min(4, Math.max(0, al.len - 11)), // (near the mouth, to be seen from the street)
      a = P(u0, 0),
      b = P(u0 + 4.5, 0)
    const v = side ? 0 : w
    const deep = Math.min(1.1, w * 0.3)
    const levels = []
    for (let y = 3.4; y < al.wall - 1.2; y += 3.3) levels.push(y)
    if (levels.length) {
      const sgn = side ? 1 : -1 // (out from the wall it hangs on, into the alley)
      const q0 = along
        ? { x: al.x0 + v, z: Math.min(a.z, b.z) }
        : { x: Math.min(a.x, b.x), z: al.z0 + v }
      for (const y of levels) {
        if (along)
          solid(
            Math.min(q0.x, q0.x + sgn * deep),
            Math.max(q0.x, q0.x + sgn * deep),
            q0.z,
            q0.z + 4.5,
            y - 0.12,
            y,
            'escape'
          )
        else
          solid(
            q0.x,
            q0.x + 4.5,
            Math.min(q0.z, q0.z + sgn * deep),
            Math.max(q0.z, q0.z + sgn * deep),
            y - 0.12,
            y,
            'escape'
          )
      }
      EXTRAS.push({
        kind: 'escape',
        x: q0.x,
        z: q0.z,
        along,
        sgn,
        deep,
        len: 4.5,
        levels
      })
    }
  }
  // lights strung across, now and then
  if (R() < 0.35) {
    const n = Math.floor(al.len / 6)
    for (let k = 1; k <= n; k++) {
      const a = P(k * 6 - 3, 0.05),
        b = P(k * 6 - 1, w - 0.05)
      EXTRAS.push({
        kind: 'string',
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        y: Math.min(5.5, al.wall - 1)
      })
    }
  }
}
{
  const all = findAlleys()
  // a share of them, spread round the districts
  for (const al of all) {
    if (
      R() >
      (al.area === 'downtown' ? 0.35 : al.area === 'industrial' ? 0.5 : 0.3)
    )
      continue
    if (
      ALLEYS.some(
        o =>
          o.x0 < al.x1 + 2 &&
          o.x1 > al.x0 - 2 &&
          o.z0 < al.z1 + 2 &&
          o.z1 > al.z0 - 2
      )
    )
      continue
    ALLEYS.push(al)
    dress(al)
  }
}

// ---------- the street furniture, between the street lights at the kerb's edge ----------
const SHOPS = new Set(['beach', 'boulevard', 'downtown', 'towers', 'venice'])
const MAIL = new Set(['strip', 'suburb', 'estates'])
const lampAt = new Map(
  LAMPS.map(l => [`${Math.round(l.x)},${Math.round(l.z)}`, l])
)
function districtOfPoint (x, z) {
  for (const b of BLOCKS)
    if (x > b.x0 - 6 && x < b.x1 + 6 && z > b.z0 - 6 && z < b.z1 + 6)
      return b.area
  return null
}
for (const l of LAMPS) {
  // the way along the kerb (t up), and the next light along it 24 m on: only between two lights
  const tx = l.ax ? 0 : 1,
    tz = l.ax ? 1 : 0
  if (!lampAt.has(`${Math.round(l.x + tx * 24)},${Math.round(l.z + tz * 24)}`))
    continue
  const area = districtOfPoint(l.x, l.z)
  const r = R()
  const at = (t, inward) => ({
    x: l.x + tx * t - l.ax * inward,
    z: l.z + tz * t - l.az * inward
  })
  const yaw = Math.atan2(-l.az, l.ax) // (facing the road)
  if (SHOPS.has(area)) {
    if (r < 0.45) {
      // newspaper boxes, two or three side by side
      const n = 2 + (R() < 0.4 ? 1 : 0)
      for (let k = 0; k < n; k++) {
        const p = at(9 + k * 0.62, -0.15)
        if (open(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3, 0.05)) {
          solid(p.x - 0.27, p.x + 0.27, p.z - 0.25, p.z + 0.25, 0, 1.05, 'news')
          EXTRAS.push({
            kind: 'news',
            ...p,
            y: 0,
            yaw,
            tint: Math.floor(R() * 5)
          })
        }
      }
    }
    if (r > 0.55) {
      // parking meters, every 6 m along the kerb
      for (const t of [6, 18]) {
        const p = at(t, -0.1)
        if (!open(p.x - 0.1, p.x + 0.1, p.z - 0.1, p.z + 0.1, 0.05)) continue
        post(p.x, p.z, 0.07, 0, 1.3, 'meter')
        EXTRAS.push({ kind: 'meter', ...p, y: 0, yaw })
      }
    }
  } else if (MAIL.has(area) && r < 0.12) {
    const p = at(10, -0.2)
    if (open(p.x - 0.35, p.x + 0.35, p.z - 0.35, p.z + 0.35, 0.05)) {
      solid(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3, 0, 1.2, 'mailbox')
      EXTRAS.push({ kind: 'mailbox', ...p, y: 0, yaw })
    }
  }
}

// ---------- the lookout and the beach promenade: benches and coin telescopes facing the view ----
{
  const L = LOOKOUT
  // (the city to the south: along the railing on the lookout's south side)
  for (let x = L.x0 + 4; x < L.x1 - 3; x += 7) {
    post(x, L.z1 - 1.0, 0.16, L.y, L.y + 1.35, 'scope')
    EXTRAS.push({ kind: 'scope', x, z: L.z1 - 1.0, y: L.y, yaw: -Math.PI / 2 })
    const bx = x + 3.2
    if (bx < L.x1 - 2) {
      solid(
        bx - 0.9,
        bx + 0.9,
        L.z1 - 3.1,
        L.z1 - 2.5,
        L.y,
        L.y + 0.46,
        'bench'
      )
      EXTRAS.push({
        kind: 'bench',
        x: bx,
        z: L.z1 - 2.8,
        y: L.y,
        yaw: -Math.PI / 2
      })
    }
  }
  // the promenade along the beach (the sea to the west), clear of the pier's end
  for (let z = -780; z < 780; z += 64) {
    if (Math.abs(z - PIER.z) < 30) continue
    const x = -PROMENADE - 1.2
    if (open(x - 1, x + 1, z - 1.5, z + 3, 0.1)) {
      post(x, z, 0.16, 0, 1.35, 'scope')
      EXTRAS.push({ kind: 'scope', x, z, y: 0, yaw: Math.PI })
      solid(x - 0.3, x + 0.3, z + 1.6, z + 3.4, 0, 0.46, 'bench')
      EXTRAS.push({ kind: 'bench', x, z: z + 2.5, y: 0, yaw: Math.PI / 2 })
    }
  }
}
