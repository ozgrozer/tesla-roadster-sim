// Street furniture that snaps off at the base when it is hit hard enough: street lights, signal
// masts, park trees and palms. Each is a post collider with breakAt, the closing speed (m/s) it takes
// to snap it, and mass (kg), what the car then has to shove out of the way; i is its place in LAMPS,
// POLES, TREES or PALMS. Hit any slower and it stands: the car bounces off it (collide.js).
import { LAMPS, PALMS, TREES, POLES, addCollider } from './city.js'

const post = (x, z, r, h, kind, i, breakAt, mass) =>
  addCollider({
    x0: x - r,
    x1: x + r,
    z0: z - r,
    z1: z + r,
    y0: 0,
    y1: h,
    x,
    z,
    r,
    kind,
    i,
    breakAt,
    mass
  })
// A street light is a breakaway pole that gives at a walking pace; on a wooden power pole it takes
// a harder knock, about 30 km/h. A signal mast is heavy steel bolted down: only a hit at nearly
// 50 km/h shears it. Trees and palms go by the size of their trunk: a tall fan palm's is thin for
// its height (it goes at about 40 km/h), a date palm's stout.
LAMPS.forEach((l, i) =>
  l.wood
    ? post(l.x, l.z, 0.15, 10, 'lamp', i, 8, 450)
    : post(l.x, l.z, 0.16, 8, 'lamp', i, 3, 150)
)
POLES.forEach((p, i) => post(p.x, p.z, 0.2, 7, 'signal', i, 13, 500))
TREES.forEach((t, i) =>
  post(t.x, t.z, 0.3 * t.s, 6 * t.s, 'tree', i, 5 + 4 * t.s, 260 * t.s ** 3)
)
PALMS.forEach((p, i) =>
  p.fan
    ? post(p.x, p.z, 0.2, p.h, 'palm', i, 5 + 0.25 * p.h, 18 * p.h)
    : post(p.x, p.z, 0.36, p.h, 'palm', i, 6 + 0.5 * p.h, 45 * p.h)
)

// Whatever hit post c (body: { vx, vz }, of mass m), with the contact normal (nx, nz) pointing from
// the post to it. If the hit is hard enough the post snaps, the body's velocity loses what that cost,
// and the 'knock' event for it comes back; otherwise null and nothing changes.
export function snap (body, c, nx, nz, m) {
  const vn = -(body.vx * nx + body.vz * nz)
  if (!c.breakAt || c.down || vn < c.breakAt) return null
  // snapping it takes the energy of a hit at exactly breakAt; then the car carries the post along,
  // sharing what is left of its momentum
  const left = (Math.sqrt(vn * vn - c.breakAt * c.breakAt) * m) / (m + c.mass)
  const l = Math.hypot(body.vx, body.vz) || 1
  const dx = body.vx / l,
    dz = body.vz / l // it goes over the way the car was going
  body.vx += nx * (vn - left)
  body.vz += nz * (vn - left)
  c.down = true
  return {
    kind: c.kind,
    i: c.i,
    x: c.x,
    z: c.z,
    dx,
    dz,
    impact: vn,
    speed: left
  }
}
