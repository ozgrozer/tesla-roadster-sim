// Places for the missions, given as fractions of the street grid's extent (0, 0 its north-west
// corner, 1, 1 its south-east) rather than coordinates, so they keep their meaning on a bigger map
// (the world workstream's): spot(fx, fz) is the nearest point on a street open to traffic, by the
// kerb of its outer lane (route.js snap does the snapping). Pure: no DOM.
import { NODES, LANES, LANE_OFF } from '../city.js'

let B = null
export function bounds () {
  if (B && B.n === NODES.length) return B
  B = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: NODES.length }
  for (const n of NODES) {
    B.x0 = Math.min(B.x0, n.x)
    B.x1 = Math.max(B.x1, n.x)
    B.z0 = Math.min(B.z0, n.z)
    B.z1 = Math.max(B.z1, n.z)
  }
  return B
}

// the kerbside point on the street nearest the fraction (fx, fz) of the map, with the lane it is by
// and its heading: { x, z, yaw, lane, s }
export function spot (fx, fz, { kerb = true } = {}) {
  const b = bounds()
  const x = b.x0 + fx * (b.x1 - b.x0),
    z = b.z0 + fz * (b.z1 - b.z0)
  return nearestKerb(x, z, kerb)
}
export function nearestKerb (x, z, kerb = true) {
  let best = null,
    bd = Infinity,
    bs = 0
  for (const e of LANES) {
    if (e.closed || e.len < 30) continue
    const s = Math.max(10, Math.min(e.len - 10, (x - e.x0) * e.dx + (z - e.z0) * e.dz))
    const d = (e.x0 + e.dx * s - x) ** 2 + (e.z0 + e.dz * s - z) ** 2
    if (d < bd) {
      bd = d
      best = e
      bs = s
    }
  }
  if (!best) return { x, z, yaw: 0, lane: null, s: 0 }
  const e = best
  // (by the kerb, 6 m right of the road's middle: right of the lane is (-dz, dx))
  const o = kerb ? 6 - LANE_OFF[e.lane] : 0
  return {
    x: e.x0 + e.dx * bs - e.dz * o,
    z: e.z0 + e.dz * bs + e.dx * o,
    yaw: Math.atan2(-e.dz, e.dx),
    lane: e,
    s: bs
  }
}
// a list of spots
export const spots = list => list.map(([fx, fz]) => spot(fx, fz))
