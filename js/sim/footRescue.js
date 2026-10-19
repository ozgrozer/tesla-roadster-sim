// Keeping the player on foot out of trouble (player.js's walker): stuck in something (a wall's
// corner, a car parked up against them, a gap they were pushed into) or out of the world (fallen
// through it, off the map, or a position gone bad), they are put back somewhere safe: stuck, the
// nearest free spot a step or two away; out of the world, the nearest pavement (pavement.js's
// walking lines round the block), else where they last stood safely. Pure maths, Node-testable.
//
//   const r = new FootRescue()   r.step(p, dt, wantMove, world): null, or what it did
//                                ('unstuck' | 'pavement' | 'last-safe') with the spot
import { blockedAt, floorAt, groundBase, placePlayer, FOOT, CITY_WORLD } from './player.js'
import { blockNear, ringOf, nearestOn, ringAt, LINES } from './pavement.js'
import { WALL } from './edge.js'
import { OUTER } from './city.js'

export const RESCUE = {
  stuckT: 1.6, // s asking to move and not moving (pressed into something) before a nudge out
  slow: 0.15, // m/s that counts as not moving
  insideT: 0.5, // s inside a solid (no input needed) before being put out of it
  below: 6, // m under the ground that counts as fallen through it
  safeEvery: 0.5, // s between the last-safe spot's updates
  reach: 3.2 // m round for a free spot to step to
}
const _pt = {}
// a free spot near (x, z) for feet at about y: rings of candidates, nearest first (null: none)
export function nearFree (x, z, world = CITY_WORLD, reach = RESCUE.reach) {
  for (let r = 0.4; r <= reach + 1e-6; r += 0.4) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 0.4))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI,
        sx = x + Math.cos(a) * r,
        sz = z + Math.sin(a) * r
      const y = floorAt(sx, sz, world.base(sx, sz) + FOOT.stepUp, world)
      if (!blockedAt(sx, sz, y, world)) return { x: sx, z: sz, y }
    }
  }
  return null
}
// the nearest free point on a pavement's walking line round the block (x, z) is on or nearest
export function nearestPavement (x, z, world = CITY_WORLD) {
  const b = blockNear(x, z)
  if (!b) return null
  for (let k = 0; k < LINES.length; k++) {
    const R = ringOf(b, k)
    if (!R || !(R.len > 0)) continue
    const s0 = nearestOn(R, x, z)
    for (let d = 0; d < 40; d += 1.5)
      for (const sg of d ? [1, -1] : [1]) {
        ringAt(R, s0 + sg * d, _pt)
        const y = floorAt(_pt.x, _pt.z, world.base(_pt.x, _pt.z) + FOOT.stepUp, world)
        if (!blockedAt(_pt.x, _pt.z, y, world)) return { x: _pt.x, z: _pt.z, y }
      }
  }
  return null
}
// out of the world: a position gone bad, fallen through the ground, or off the map's edges
export function outOfWorld (p) {
  const { x, y, z } = p.pos
  if (!Number.isFinite(x + y + z)) return true
  if (y < groundBase(x, z) - RESCUE.below) return true
  return Math.abs(z) > WALL + 30 || x > WALL + 30 || x < -OUTER - 400
}

export class FootRescue {
  constructor () {
    this.stuck = 0
    this.inside = 0
    this.safeT = 0
    this.safe = null // { x, y, z, heading }
  }
  // one step: p the player on foot; wantMove: they are asking to go somewhere
  step (p, dt, wantMove, world = CITY_WORLD) {
    if (outOfWorld(p)) return this.toPavement(p, world)
    const { x, y, z } = p.pos
    const blocked = p.grounded && blockedAt(x, z, y, world, FOOT.radius * 0.8)
    this.inside = blocked ? this.inside + dt : 0
    this.stuck = wantMove && p.grounded && p.down <= 0 && p.speed < RESCUE.slow ? this.stuck + dt : 0
    if (this.inside > RESCUE.insideT || (this.stuck > RESCUE.stuckT && blocked)) {
      const s = nearFree(x, z, world)
      this.inside = this.stuck = 0
      if (s) return this.put(p, s, 'unstuck')
      return this.toPavement(p, world)
    }
    if (p.grounded && !blocked && (this.safeT += dt) > RESCUE.safeEvery) {
      this.safeT = 0
      this.safe = { x, y, z, heading: p.heading }
    }
    return null
  }
  toPavement (p, world) {
    const ref = Number.isFinite(p.pos.x + p.pos.z) ? p.pos : this.safe || { x: 0, z: 0 }
    const cx = Math.max(-OUTER, Math.min(OUTER, ref.x)),
      cz = Math.max(-OUTER, Math.min(OUTER, ref.z))
    const s = nearestPavement(cx, cz, world)
    if (s) return this.put(p, s, 'pavement')
    if (this.safe) return this.put(p, this.safe, 'last-safe')
    return null
  }
  put (p, s, what) {
    const h = Number.isFinite(p.heading) ? p.heading : 0
    placePlayer(s.x, s.z, h, s.y ?? null, p)
    this.stuck = this.inside = 0
    return { what, x: s.x, y: p.pos.y, z: s.z }
  }
}
