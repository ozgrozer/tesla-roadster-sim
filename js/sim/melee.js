// The player's fists on foot, GTA's way: a press (F, or the left mouse button) throws a punch, and
// presses in time chain a combo of three: a jab, a cross and a heavy hook that knocks people down.
// Each punch soft-locks on to the nearest person in front (within LOCK m, turning to face them and
// lunging the last metre or two), lands at its hit time if they are still in reach, and whiffs if
// not. Someone already down is stamped on instead. Pure (no DOM): onFoot's glue (footFight.js) runs
// it, the people take the blows (brawl.js), the render poses the arms from punchPose().
import { wrapPi, clamp } from './constants.js'

// each punch of the combo: s to the hit, s to the end, damage (of a person's 1), the shove (m/s)
// and whether it knocks them down whatever their health; side: the fist (-1 left, 1 right)
export const COMBO = [
  { name: 'jab', hit: 0.13, end: 0.36, dmg: 0.2, push: 1.4, knock: false, side: -1 },
  { name: 'cross', hit: 0.15, end: 0.4, dmg: 0.26, push: 1.8, knock: false, side: 1 },
  { name: 'hook', hit: 0.2, end: 0.6, dmg: 0.4, push: 3.6, knock: true, side: -1 }
]
export const STOMP = { name: 'stomp', hit: 0.22, end: 0.55, dmg: 0.34, push: 0.3, knock: false, side: 1 }
export const MELEE = {
  reach: 1.25, // m between middles a fist lands at (and a little more: SLACK)
  slack: 0.45,
  lock: 4.2, // m soft-aim looks for someone
  cone: 1.0, // rad either side of the facing it looks in
  stompR: 1.7, // m: someone down this close, with nobody standing to hit, is stamped on
  chain: 0.4, // s after a punch's end a press still carries on the combo
  turn: 16, // rad/s turning to face the target
  lunge: 4.5 // m/s closing in on them
}

const standing = q => !q.gone && !q.dead && q.state !== 'down'

export class Melee {
  constructor () {
    this.reset()
  }
  reset () {
    this.cur = null // the punch being thrown: { move, i, t, target, landed }
    this.queued = false
    this.next = 0 // the combo's next punch
    this.since = Infinity // s since the last punch ended
    this.hits = 0
  }
  get busy () {
    return !!this.cur
  }
  // a press: thrown now, or next if a punch is being thrown (the combo)
  press () {
    this.queued = true
  }
  // the person to aim at from p (the player) facing dir (rad): nearest in the cone, standing first
  target (p, list, dir = p.heading) {
    const fx = Math.cos(dir),
      fz = -Math.sin(dir)
    let best = null,
      bs = Infinity,
      down = null,
      bd = MELEE.stompR
    for (const q of list) {
      const dx = q.x - p.pos.x,
        dz = q.z - p.pos.z
      if (Math.abs(dx) > MELEE.lock || Math.abs(dz) > MELEE.lock) continue
      const d = Math.hypot(dx, dz)
      if (d > MELEE.lock || d < 1e-3 || q.gone) continue
      if (!standing(q)) {
        if (!q.gone && d < bd) {
          bd = d
          down = q
        }
        continue
      }
      const a = Math.abs(wrapPi(Math.atan2(-dz, dx) - dir))
      // (close by, a wider cone: someone right beside you is still hit)
      if (a > MELEE.cone + (d < 1.6 ? 0.6 : 0)) continue
      const s = d + a * 1.5 + (fx * dx + fz * dz < 0 ? 5 : 0)
      if (s < bs) {
        bs = s
        best = q
      }
    }
    return best || down
  }
  // One step: p the player (heading and, through ctl, the lunge), list the people, aim the way
  // asked to go (rad, or null: the facing). Returns the move for the feet ({ x, z, mag } toward
  // the target, or null) and fills out.hits with what landed this step ({ q, move, dx, dz }).
  step (dt, p, list, aim = null, out = { ctl: null, hits: [], swung: null }) {
    out.ctl = null
    out.hits.length = 0
    out.swung = null
    if (!this.cur) {
      this.since += dt
      if (this.since > MELEE.chain) this.next = 0
      if (!this.queued) return out
      this.queued = false
      if (p.down > 0 || !p.grounded) return out
      const target = this.target(p, list, aim ?? p.heading)
      const stomp = target && !standing(target)
      const move = stomp ? STOMP : COMBO[this.next]
      this.cur = { move, i: stomp ? -1 : this.next, t: 0, target, landed: false }
      this.next = stomp ? 0 : (this.next + 1) % COMBO.length
      out.swung = move
    }
    const c = this.cur,
      m = c.move,
      q = c.target
    const t0 = c.t
    c.t += dt
    if (q && !q.gone) {
      const dx = q.x - p.pos.x,
        dz = q.z - p.pos.z,
        d = Math.hypot(dx, dz)
      // facing them, and closing in until the fist lands
      const want = Math.atan2(-dz, dx)
      p.heading = wrapPi(p.heading + clamp(wrapPi(want - p.heading), -MELEE.turn * dt, MELEE.turn * dt))
      const reach = standing(q) ? MELEE.reach : 0.75
      if (c.t < m.hit && d > reach) {
        const left = Math.max(dt, m.hit - c.t)
        const v = Math.min(MELEE.lunge, (d - reach) / left)
        out.ctl = { x: dx / d, z: dz / d, mag: 1, pace: v }
      }
      if (t0 < m.hit && c.t >= m.hit) {
        const ahead = Math.abs(wrapPi(want - p.heading)) < 1.3
        if (d < reach + MELEE.slack && ahead) {
          c.landed = true
          this.hits++
          out.hits.push({ q, move: m, dx: d > 1e-3 ? dx / d : Math.cos(p.heading), dz: d > 1e-3 ? dz / d : -Math.sin(p.heading) })
        }
      }
    }
    if (c.t >= m.end) {
      this.cur = null
      this.since = 0
      if (!c.landed && c.i >= 0) this.next = 0 // (a whiff ends the combo)
    }
    return out
  }
}

// The arm's pose for the punch being thrown (the render): { side, k } k 0 drawn back, 1 the fist
// out at full reach, eased in on the hit and back out after it; null when not punching
export function punchPose (melee) {
  const c = melee.cur
  if (!c) return null
  const m = c.move,
    t = c.t
  let k
  if (t < m.hit * 0.45) k = -0.35 * (t / (m.hit * 0.45)) // (drawn back)
  else if (t < m.hit) k = -0.35 + 1.35 * ((t - m.hit * 0.45) / (m.hit * 0.55)) ** 0.7
  else k = Math.max(0, 1 - (t - m.hit) / (m.end - m.hit)) ** 1.6
  return { side: m.side, k, name: m.name, t, landed: c.landed }
}
