// Everything small on the pavements gives when a car hits it, as GTA's street furniture does: the
// hydrants, bus benches and litter bins along the kerb (kerbside.js DECOR, which had no collider at
// all: drawn only, driven through), the newspaper boxes, parking meters and mailboxes (extras.js,
// solid but unbreakable), the promenade's and the lookout's benches and coin telescopes, the alleys'
// wheelie bins and crates, and the bus shelters (lots PROPS, which had no collider either). Each is a
// collider with breakAt (the closing speed, m/s, that knocks it loose) and mass (kg: what the car
// loses shoving it, breakables.js snap), kind 'prop' and i its place in KNOCKS, so the Roadster
// (collide.js), any car the player drives (vehicleHit.js) and a wreck sliding loose (wrecks.js) all
// knock it the way they snap a street light, and the renderer (render/cityKnocks.js) throws it.
//
//   KNOCKS[i] = { kind, x, z, y, yaw, v (its look's variant), mode, c (its collider) }
//   mode: 'tumble' (knocked loose and thrown), 'bend' (a post bent over at its foot), 'tip' (a heavy
//   thing that goes over at its foot once the hit is hard enough: the bus shelter)
//
// (Laid out by layKnocks(), once every module has laid out its own, the tokens included, so nothing
// that was placed by looking at the colliders moves: main.js calls it before anything is built.)
import { DECOR, CURB_H, addCollider, query } from './city.js'
import { EXTRAS } from './extras.js'
import { PROPS } from './plots.js'

// what each kind takes to knock (breakAt m/s, mass kg), how it goes, and whether people may stand in
// its collider (a bench they sit on, a shelter they wait in: pedBrain.unwall leaves them be)
export const KNOCK_KINDS = {
  hydrant: { breakAt: 2.5, mass: 90, mode: 'tumble', spray: true },
  bench: { breakAt: 2, mass: 60, mode: 'tumble', walk: true },
  bin: { breakAt: 1.2, mass: 15, mode: 'tumble' },
  news: { breakAt: 1.5, mass: 35, mode: 'tumble' },
  meter: { breakAt: 2, mass: 25, mode: 'bend' },
  mailbox: { breakAt: 2.5, mass: 70, mode: 'tumble' },
  scope: { breakAt: 3, mass: 40, mode: 'bend' },
  wheelie: { breakAt: 1.2, mass: 20, mode: 'tumble' },
  crate: { breakAt: 1.5, mass: 25, mode: 'tumble' },
  shelter: { breakAt: 5.5, mass: 220, mode: 'tip', walk: true }
}
export const KNOCKS = []
const AS = { bin: 'wheelie' }
const hits = []

function knockable (kind, it, c, v = '', y = 0) {
  const k = KNOCK_KINDS[kind]
  Object.assign(c, {
    kind: 'prop',
    look: c.look || kind,
    i: KNOCKS.length,
    breakAt: k.breakAt,
    mass: k.mass
  })
  if (k.walk) c.walk = true
  // (what it was laid out as told it is drawn knockable now: render/cityKnocks.js draws it)
  it.knock = KNOCKS.length
  KNOCKS.push({
    kind,
    x: it.x,
    z: it.z,
    y: (it.y || 0) + y,
    yaw: it.yaw || 0,
    v,
    mode: k.mode,
    c,
    src: it
  })
}
// a box in the item's frame ([lx0, lx1] out towards its yaw, [lz0, lz1] across), turned yaw, as the
// axis-aligned box round it
function turned (x, z, yaw, lx0, lx1, lz0, lz1, y0, y1, look) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw)
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity
  for (const u of [lx0, lx1])
    for (const w of [lz0, lz1]) {
      const wx = x + u * c + w * s,
        wz = z - u * s + w * c
      x0 = Math.min(x0, wx)
      x1 = Math.max(x1, wx)
      z0 = Math.min(z0, wz)
      z1 = Math.max(z1, wz)
    }
  return addCollider({ x0, x1, z0, z1, y0, y1, look })
}
const postAt = (x, z, r, y0, y1, look) =>
  addCollider({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0, y1, x, z, r, look })

export function layKnocks () {
  if (KNOCKS.length) return KNOCKS
  // the kerb's hydrants, bus benches and litter bins: given colliders now
  for (const d of DECOR) {
    // (stood on the kerb's pavement, CURB_H up)
    if (d.kind === 'hydrant')
      knockable('hydrant', d, postAt(d.x, d.z, 0.17, 0, 0.85, 'hydrant'), '', CURB_H)
    else if (d.kind === 'bin')
      knockable('bin', d, postAt(d.x, d.z, 0.28, 0, 1.15, 'bin'), '', CURB_H)
    else if (d.kind === 'bench') {
      const c = turned(d.x, d.z, d.yaw, -0.34, 0.32, -0.95, 0.95, 0, 1.05, 'bench')
      knockable('bench', d, c, '', CURB_H)
    }
  }
  // the street furniture and the alleys' bins and crates, solid already: their colliders made to give
  function colliderOf (e, look) {
    let best = null,
      bd = Infinity
    for (const c of query(e.x - 0.6, e.z - 0.6, e.x + 0.6, e.z + 0.6, hits)) {
      if (c.look !== look || c.kind === 'prop') continue
      const d = Math.hypot((c.x0 + c.x1) / 2 - e.x, (c.z0 + c.z1) / 2 - e.z)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }
  for (const e of EXTRAS) {
    if (!['news', 'meter', 'mailbox', 'scope', 'bench', 'bin', 'crate'].includes(e.kind)) continue
    const c = colliderOf(e, e.kind)
    if (!c) continue
    const kind = AS[e.kind] || e.kind
    // (its look: the alleys' bins and crates are laid out square to the street, their sizes swapped)
    const dims = `${e.w}x${e.d}`
    const v =
      kind === 'news' ? String(e.tint % 5)
        : kind === 'wheelie' ? `${e.tint % 4}:${dims}`
          : kind === 'crate' ? `${e.h > 1 ? 2 : 1}:${dims}`
            : kind === 'bench' ? 'promenade' : ''
    knockable(kind, e, c, v)
  }
  // the bus shelters: the posts, the back and the end glass solid (the roof over the pavement is
  // overhead), people waiting in it
  for (const p of PROPS) {
    if (p.kind !== 'shelter') continue
    knockable('shelter', p, turned(p.x, p.z, p.yaw, -1.0, -0.4, -1.8, 2.5, 0, 2.6, 'shelter'))
  }
  return KNOCKS
}

// Every pavement prop type with how many there are and how many give to a car (a collider with
// breakAt that something draws going over), for the audit (tests/knockables.test.mjs,
// tools/sim/propAudit.mjs)
export function knockCount () {
  const by = {}
  for (const k of KNOCKS) {
    const b = (by[k.kind + (k.v === 'promenade' ? '-promenade' : '')] ??= { n: 0, breakable: 0 })
    b.n++
    if (k.c.breakAt > 0 && k.c.kind === 'prop' && KNOCKS[k.c.i] === k) b.breakable++
  }
  return by
}
