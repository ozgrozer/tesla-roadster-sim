// A drivable body (vehicleSim.js) on the ground under it (world.js groundHeight): up the ramps and
// along the freeway's deck, up the hill road, through its tunnel and over its bridge; off an edge
// (the deck's end, a ramp's side) it drops, under gravity, to whatever is below. And it lies on the
// ground as the ground lies: gp its nose up the slope, gr its right side down (the renderer:
// carSlope.js), eased so a tread's step doesn't jolt it.
import { G } from './constants.js'
import { groundHeight } from './world.js'

const CLIMB = 0.6 // m above the body the ground is still under it (a ramp's tread is a step of 6 cm)
const EASE = 10 // per s: how fast the body settles to the slope
const _p = { f: 0, b: 0, l: 0, r: 0 }

export function settle (b, dt) {
  const top = b.y + CLIMB
  const g = groundHeight(b.x, b.z, top)
  if (g >= b.y - 0.05) {
    b.y = g
    b.vy = 0
  } else {
    // in the air: falling, until it comes down on what is below
    b.vy = (b.vy || 0) - G * dt
    b.y = Math.max(g, b.y + b.vy * dt)
    if (b.y === g) b.vy = 0
  }
  // the slope under it: front and back, left and right of the middle
  const hl = b.len * 0.4,
    hw = b.wid * 0.45,
    up = b.y + CLIMB
  const fx = b.hx,
    fz = b.hz
  _p.f = groundHeight(b.x + fx * hl, b.z + fz * hl, up)
  _p.b = groundHeight(b.x - fx * hl, b.z - fz * hl, up)
  _p.r = groundHeight(b.x - fz * hw, b.z + fx * hw, up)
  _p.l = groundHeight(b.x + fz * hw, b.z - fx * hw, up)
  const air = b.vy < -0.5
  const gp = air ? b.gp || 0 : Math.atan2(_p.f - _p.b, 2 * hl),
    gr = air ? b.gr || 0 : Math.atan2(_p.l - _p.r, 2 * hw)
  const k = Math.min(1, dt * EASE)
  b.gp = (b.gp || 0) + (gp - (b.gp || 0)) * k
  b.gr = (b.gr || 0) + (gr - (b.gr || 0)) * k
}
