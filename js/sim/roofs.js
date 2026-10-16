// Roofs: the flat top of every building tier is somewhere to land and drive, walled in by its parapet,
// with plant on the top tier (a stair and lift housing, air-handling units and sometimes a mast) to
// steer round. To get down, hop the parapet on the lift thrusters.
import { BUILDINGS, rng, query, addCollider } from './city.js'

export const PARAPET = 0.3 // m thick
export const PARAPET_H = 0.9 // m above the roof
export const LIP = 0.3 // the roof's edging: m wide
export const LIP_H = 0.1 // and m high, drawn only (the wheels roll over it)
export const STEP = 0.3 // a roof up to this much higher than the one the car is on is driven onto

// plant, kept on each building as b.plant for the renderer
const R = rng(4242)
for (const b of BUILDINGS) {
  const t = b.tiers[b.tiers.length - 1],
    w = t.x1 - t.x0,
    d = t.z1 - t.z0
  b.plant = []
  const box = (x0, x1, z0, z1, h) =>
    b.plant.push(
      addCollider({ x0, x1, z0, z1, y0: t.y1, y1: t.y1 + h, kind: 'plant' })
    )
  if (w > 10 && d > 10) {
    const hx = t.x0 + 3 + R() * (w - 10),
      hz = t.z0 + 3 + R() * (d - 10)
    box(hx, hx + 4 + R() * 2, hz, hz + 3 + R() * 2, 3.2)
    for (let i = 0; i < 3; i++) {
      const ax = t.x0 + 2 + R() * (w - 6),
        az = t.z0 + 2 + R() * (d - 6)
      box(ax, ax + 1.6 + R() * 1.4, az, az + 1.2 + R(), 1.1 + R() * 0.8)
    }
  }
  if (b.antenna) {
    const cx = (t.x0 + t.x1) / 2,
      cz = (t.z0 + t.z1) / 2
    addCollider({
      x0: cx - 0.3,
      x1: cx + 0.3,
      z0: cz - 0.3,
      z1: cz + 0.3,
      y0: t.y1,
      y1: t.y1 + 14,
      x: cx,
      z: cz,
      r: 0.3,
      kind: 'mast'
    })
  }
}

const near = []
// The roof a car at height y over (x, z) stands or comes down on: the highest building top there
// no higher than y. null over the street.
export function roofAt (x, z, y) {
  let best = null
  for (const c of query(x, z, x, z, near))
    if (
      c.kind === 'building' &&
      c.y1 <= y &&
      x > c.x0 &&
      x < c.x1 &&
      z > c.z0 &&
      z < c.z1 &&
      !(best && best.y1 >= c.y1)
    )
      best = c
  return best
}

// a roof's parapet, as four low walls along its edges
export function parapets (roof) {
  if (!roof.parapets) {
    const { x0, x1, z0, z1, y1 } = roof,
      p = PARAPET
    roof.parapets = [
      [x0, x1, z0, z0 + p],
      [x0, x1, z1 - p, z1],
      [x0, x0 + p, z0, z1],
      [x1 - p, x1, z0, z1]
    ].map(([a, b, c, d]) => ({
      x0: a,
      x1: b,
      z0: c,
      z1: d,
      y0: y1,
      y1: y1 + PARAPET_H,
      kind: 'parapet'
    }))
  }
  return roof.parapets
}
