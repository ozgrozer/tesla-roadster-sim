// The all-way stops' signs (the junctions trafficStop.js marks): an octagonal STOP sign on its post
// at the near-right corner of every approach, a metre and a half before the stop line and just in
// from the kerb, facing the drivers coming up to it; and "STOP" painted in each lane before the
// line. Each post is a breakaway one (breakables.js): a knock at a jogging pace or more flattens it
// (render/cityStopSigns.js stops drawing it) until the city stands up again.
import { NODES, addCollider, query } from './city.js'
import { DIRS, ROAD_HW, STOP, LANE_OFF } from './grid.js'
import { STOPS } from './trafficStop.js'

export const SIGN = {
  back: STOP + 1.9,
  out: ROAD_HW + 0.75,
  h: 2.6,
  r: 0.07,
  face: 0.38
}
export const SIGNS = [] // { node, dir, x, z, fx, fz (the way its face looks: at the drivers), c (its collider) }
export const LEGENDS = [] // "STOP" in a lane: { x, z, dx, dz (the way the lane goes) }

const hits = []
const clear = (x, z) =>
  !query(x - 0.35, z - 0.35, x + 0.35, z + 0.35, hits).some(
    c => c.y1 > 0.3 && c.y0 < 2
  )
for (const n of STOPS)
  for (let k = 0; k < 4; k++) {
    if (!n.inc[k]) continue
    const [dx, dz] = DIRS[k]
    // (right of the way they come: (-dz, dx), as the lanes' offsets and the signal masts)
    let back = SIGN.back
    let x = n.x - dx * back - dz * SIGN.out,
      z = n.z - dz * back + dx * SIGN.out
    for (let tries = 0; tries < 6 && !clear(x, z); tries++) {
      back += 0.7
      x = n.x - dx * back - dz * SIGN.out
      z = n.z - dz * back + dx * SIGN.out
    }
    const c = addCollider({
      x0: x - SIGN.r,
      x1: x + SIGN.r,
      z0: z - SIGN.r,
      z1: z + SIGN.r,
      y0: 0,
      y1: SIGN.h,
      x,
      z,
      r: SIGN.r,
      kind: 'stop',
      i: SIGNS.length,
      breakAt: 4,
      mass: 25
    })
    // (its face towards them: they come along +dir, so it looks back along -dir)
    SIGNS.push({ node: n.i, dir: k, x, z, fx: -dx, fz: -dz, c })
    for (const o of LANE_OFF) {
      const d = STOP + 3.2
      LEGENDS.push({
        x: n.x - dx * d - dz * o,
        z: n.z - dz * d + dx * o,
        dx,
        dz
      })
    }
  }
export const nodeCount = STOPS.length
