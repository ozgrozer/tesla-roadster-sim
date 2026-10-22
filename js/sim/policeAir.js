// The police from above and ahead (police.js): the helicopter at four stars and up, flying to where
// the player is (or was last seen), its spotlight on them while it can see them and sweeping the
// search circle when it can't; and where a roadblock goes: across the road the player is driving,
// out of sight ahead. Pure: no DOM.
import { clamp } from './constants.js'
import { LANES } from './city.js'
import { clear } from './witness.js'

export const HELI_Y = 58 // m up
export const HELI_V = 30 // m/s at most: a fast car can outrun it
export const HELI_SEE = 85 // m across the ground from under it that its crew can see
const HELI_A = 9

export class Heli {
  constructor (R) {
    this.R = R
    this.on = false // flying over the city
    this.x = this.z = 0
    this.y = HELI_Y
    this.vx = this.vz = 0
    this.yaw = 0
    this.sees = false
    this.spot = { x: 0, z: 0, r: 7 } // the spotlight's pool on the ground
    this.t = 0
    this.offT = 0
  }
  gone () {
    this.on = false
    this.sees = false
  }
  // want: the stars call for it; player: playerView; wanted: wanted.js
  step (dt, want, player, wanted) {
    this.t += dt
    const P = player.pos
    if (!this.on) {
      if (!want) return
      // in from off the map's sky, a good way off
      const a = this.R() * Math.PI * 2
      this.on = true
      this.x = P.x + Math.cos(a) * 260
      this.z = P.z + Math.sin(a) * 260
      this.vx = this.vz = 0
      this.offT = 0
      this.spot.x = P.x
      this.spot.z = P.z
    }
    this.offT = want ? 0 : this.offT + dt
    // where to: the player while it is wanted (in sight, theirs; out of it, the last known
    // place), away once the stars are gone
    let tx = wanted.seen ? P.x : wanted.last.x,
      tz = wanted.seen ? P.z : wanted.last.z
    if (this.offT > 0) {
      tx = this.x + (this.x - P.x)
      tz = this.z + (this.z - P.z)
    }
    const dx = tx - this.x,
      dz = tz - this.z,
      d = Math.hypot(dx, dz) || 1
    // (slowing to hover over it, from the speed it can stop from)
    const v = Math.min(HELI_V, Math.sqrt(2 * HELI_A * d) * 0.8)
    const ax = clamp((dx / d) * v - this.vx, -HELI_A * dt, HELI_A * dt),
      az = clamp((dz / d) * v - this.vz, -HELI_A * dt, HELI_A * dt)
    this.vx += ax
    this.vz += az
    this.x += this.vx * dt
    this.z += this.vz * dt
    if (Math.hypot(this.vx, this.vz) > 2) this.yaw = Math.atan2(-this.vz, this.vx)
    this.y = HELI_Y + Math.sin(this.t * 0.7) * 1.5
    if (this.offT > 12 && Math.hypot(this.x - P.x, this.z - P.z) > 380) return this.gone()
    // its crew's eyes: under it and round about, unless a tower stands between
    const g = Math.hypot(P.x - this.x, P.z - this.z)
    this.sees =
      this.offT === 0 && g < HELI_SEE && clear(this.x, this.z, P.x, P.z, this.y, 1)
    // the spotlight: on the player while it sees them, sweeping round the search circle if not
    let sx = P.x,
      sz = P.z
    if (!this.sees) {
      const r = Math.min(wanted.radius * 0.5, 40)
      sx = this.x + Math.cos(this.t * 0.9) * r * 0.6
      sz = this.z + Math.sin(this.t * 1.3) * r * 0.6
    }
    const k = Math.min(1, dt * (this.sees ? 6 : 1.5))
    this.spot.x += (sx - this.spot.x) * k
    this.spot.z += (sz - this.spot.z) * k
  }
}

// Where a roadblock goes: on a lane of the road the player is on (or one parallel, near its line),
// SPOT_MIN to SPOT_MAX m ahead of them along the way they are going, out of the camera's sight if it
// can be. Returns { e, s } or null.
// is (x, z) in the camera's sight? view: { x, z, fx, fz }
export function inView (view, x, z, los = clear) {
  if (!view) return false
  const dx = x - view.x,
    dz = z - view.z,
    d = Math.hypot(dx, dz)
  if (d > 300) return false
  if (d < 25) return true
  if ((dx * view.fx + dz * view.fz) / d < 0.25) return false
  return los(view.x, view.z, x, z, 3, 1)
}

export function roadblockSpot (player, view, R, { min = 110, max = 200 } = {}) {
  const sp = player.speed
  if (sp < 1) return null
  const vx = player.vel.x / sp,
    vz = player.vel.z / sp
  let best = null,
    bs = Infinity
  for (const e of LANES) {
    if (e.closed || e.len < 24) continue
    if (Math.abs(e.dx * vx + e.dz * vz) < 0.8) continue // (along the way they are going)
    // (the point of it nearest to (min + max) / 2 ahead of them)
    const ax = player.pos.x + vx * (min + max) / 2,
      az = player.pos.z + vz * (min + max) / 2
    const s = Math.max(8, Math.min(e.len - 8, (ax - e.x0) * e.dx + (az - e.z0) * e.dz))
    const x = e.x0 + e.dx * s,
      z = e.z0 + e.dz * s
    const dx = x - player.pos.x,
      dz = z - player.pos.z
    const along = dx * vx + dz * vz
    if (along < min || along > max) continue
    const lat = Math.abs(dx * vz - dz * vx)
    if (lat > 14) continue
    // (nearer the line beats further off it; a little chance)
    // (never put down in the camera's sight: the player would see it appear)
    if (inView(view, x, z)) continue
    const score = lat + R() * 4
    if (score < bs) {
      bs = score
      best = { e, s }
    }
  }
  return best
}
