// Roofs: the flat top of every building tier is somewhere to land and drive, with plant on the top
// tier (a stair and lift housing, air-handling units and sometimes a mast) to steer round. The edge is
// only a low lip the wheels roll over, so the car can drive straight off a tall roof and drop onto a
// lower one across the alley (or onto the tier below). A helipad's circle is kept clear of plant; a
// one-storey roof gets only a few air-handling units. A hip roof (a house's tiles) is solid but no
// roof to land on: what comes down on it rides its ridge and slides off the way it overhangs, as off
// any edge (collide.js), and the walls' top under it is never reached. Spires and masts are posts.
import { BUILDINGS, rng, query, addCollider } from './city.js'

export const LIP = 0.3 // the roof's edging: m wide
export const LIP_H = 0.1 // and m high, drawn only (the wheels roll over it)
export const STEP = 0.3 // a roof up to this much higher than the one the car is on is driven onto

// plant, kept on each building as b.plant for the renderer, with whatever else is solid on the
// roof (a hip roof, a sign's frame, a billboard: each with its look, and not drawn as plant)
const R = rng(4242)
for (const b of BUILDINGS) {
  b.plant = b.plant || []
  const box = (x0, x1, z0, z1, y0, h, look) =>
    b.plant.push(
      addCollider({ x0, x1, z0, z1, y0, y1: y0 + h, kind: 'plant', look })
    )
  for (const t of b.tiers) {
    if (!t.hip) continue
    const e = t.eave || 0
    box(t.x0 - e, t.x1 + e, t.z0 - e, t.z1 + e, t.y1, t.hip, 'hip')
  }
  const mast = (x, z, y, h, r) =>
    addCollider({
      x0: x - r,
      x1: x + r,
      z0: z - r,
      z1: z + r,
      y0: y,
      y1: y + h,
      x,
      z,
      r,
      kind: 'mast'
    })
  if (b.spire) mast(b.spire.x, b.spire.z, b.spire.y, b.spire.h, 0.6)
  // an old sign's frame along the roof's edge
  const sg = b.roofSign
  if (sg) {
    const along = sg.face % 2 === 0,
      hw = along ? sg.w / 2 : 0.3,
      hd = along ? 0.3 : sg.w / 2
    box(sg.x - hw, sg.x + hw, sg.z - hd, sg.z + hd, sg.y - 1, sg.h + 1, 'frame')
  }
  if (b.form === 'shaft') continue // (a shaped tower's top is its crown or its helipad)
  const t = b.tiers[b.tiers.length - 1],
    w = t.x1 - t.x0,
    d = t.z1 - t.z0
  if (t.hip) continue
  // (clear of the helipad's circle and the sign)
  const pad = b.helipad
  const clear = (x0, x1, z0, z1) =>
    !(
      pad &&
      Math.max(x0 - pad.x, 0, pad.x - x1) ** 2 +
        Math.max(z0 - pad.z, 0, pad.z - z1) ** 2 <
        (pad.r + 1.5) ** 2
    ) &&
    !(
      sg &&
      x1 > sg.x - sg.w / 2 - 1 &&
      x0 < sg.x + sg.w / 2 + 1 &&
      z1 > sg.z - sg.w / 2 - 1 &&
      z0 < sg.z + sg.w / 2 + 1
    )
  const place = (sx, sz, h, tries = 6) => {
    for (let k = 0; k < tries; k++) {
      const x = t.x0 + 1.5 + R() * (w - sx - 3),
        z = t.z0 + 1.5 + R() * (d - sz - 3)
      if (clear(x, x + sx, z, z + sz)) return box(x, x + sx, z, z + sz, t.y1, h)
    }
  }
  const low = t.y1 < 8 // (one storey: a shop or a house)
  if (w > 10 && d > 10 && !low) {
    place(4 + R() * 2, 3 + R() * 2, 3.2)
    for (let i = 0; i < 3; i++)
      place(1.6 + R() * 1.4, 1.2 + R(), 1.1 + R() * 0.8)
  } else if (w > 6 && d > 6 && b.area !== 'estates') {
    const n = Math.floor(R() * (low ? 3 : 2))
    for (let i = 0; i < n; i++)
      place(1.4 + R() * 1.2, 1.1 + R() * 0.8, 0.9 + R() * 0.6)
  }
  if (b.antenna) {
    const cx = (t.x0 + t.x1) / 2,
      cz = (t.z0 + t.z1) / 2
    mast(cx, cz, t.y1, 14, 0.3)
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
