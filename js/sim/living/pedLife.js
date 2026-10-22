// The people on foot's lives beyond the walk (peds.js): who they are (pedProfile.js), gathering to
// watch a street performer (pedPoi.js), what they do when they see a crime (witnessCrime: some run,
// some freeze where they are, some stop at a distance to watch, and one rings the police, on the
// phone a few seconds; down, or frightened off by the player coming at them, and the call is never
// made: living/reports.js waits on it), a fright close by that leaves some cowering rather than
// running, a car tearing past (a start and a look), and anyone stuck getting nowhere
// put back on their way (or, out of sight, taken off). Mixed into Peds; run once a step after the
// people move (living()), its heavier half twice a second, for those near the player only.
import { emitGame } from '../gameEvents.js'
import { clear, PED_SEE } from '../witness.js'
import { kerbDist } from '../street.js'
import { blockNear, nearestOn } from '../pavement.js'
import { TRAITS, drawOf, PED_PROFILE } from './pedProfile.js'
import { layPois, slotFor, tick, watching } from './pedPoi.js'

export const SEVERE = new Set(['carjack', 'ped-hit', 'ped-killed', 'assault', 'shots-fired', 'hit-police'])
export const COWER_R = 10 // m: closer than this to a fright, the timid freeze
export const CALL = [4, 8] // s on the phone to the police
export const SCARE_OFF = 5 // m: the player closer than this to a caller and they run, call cut off
export const STUCK = 6 // s getting nowhere before being put back on their way
const MOVING = new Set(['walk', 'kerb', 'flee', 'back'])
export const MIN_CROWD = 12 // people about before a performer turns up
const SLOW = 0.5 // s between the heavier looks

export const PED_LIFE = {
  ...PED_PROFILE,
  // once a step, after everyone moved
  living (dt, sim, view) {
    this.lifeT = (this.lifeT || 0) + dt
    const me = this.threats[0] === this.me ? this.me : null
    const pl = sim.mode === 'ground' || sim.mode === 'foot' ? sim.pos : sim.com
    for (const p of this.list) {
      const L = p.liv
      if (!L) continue
      // cowering: crouched, arms up, until it passes
      if (L.cowerT > 0) {
        if (p.state !== 'idle') L.cowerT = 0
        else {
          L.cowerT -= dt
          p.fright = 1
          p.idleT = Math.max(p.idleT, 0.2)
          if (L.cowerT <= 0) p.idleT = 0
        }
      }
      // a fright just now: the timid close to it freeze instead of running
      if (p.state === 'flee' && !L.fled) {
        L.fled = true
        const d2 = (p.x - this.panicX) ** 2 + (p.z - this.panicZ) ** 2
        if (d2 < COWER_R * COWER_R && drawOf(p, 3) < TRAITS[L.prof].cower && !this.coming(p)) this.cower(p, 3 + 3 * drawOf(p, 4))
      } else if (p.state !== 'flee' && !L.cowerT) L.fled = false
      if (L.call) this.calling(p, L, dt, pl)
    }
    if (this.lifeT < SLOW) return
    const T = this.lifeT
    this.lifeT = 0
    this.lifeNear(T, me, view)
    this.gather(T, pl, view)
  },
  // anything moving within 10 m of p (no freezing in its path)
  coming (p) {
    for (const th of this.threats) {
      const dx = p.x - th.x,
        dz = p.z - th.z
      if (dx * dx + dz * dz < 100 && th.vx * th.vx + th.vz * th.vz > 1) return true
    }
    return false
  },
  cower (p, t) {
    p.state = 'idle'
    p.act = 0
    p.lead = null
    p.idleT = t + 0.5
    p.gait = 0
    p.fright = 1
    p.liv.cowerT = t
    this.cowering = (this.cowering || 0) + 1
  },
  // what is seen of a crime (game.js, before the police hear of it): people within sight react,
  // and the most willing of them rings it in (the call returned, for reports.js, or null)
  witnessCrime (c) {
    if (!c.pos) return null
    const severe = SEVERE.has(c.type) || (c.severity ?? 1) >= 2
    let rays = 0,
      seen = 0,
      best = null,
      bs = 0
    for (const p of this.list) {
      const L = p.liv
      if (!L || p.dead || p.state === 'down') continue
      const dx = p.x - c.pos.x,
        dz = p.z - c.pos.z,
        d = Math.sqrt(dx * dx + dz * dz)
      if (d > PED_SEE || d < 0.8) continue
      if (rays++ > 40) break
      if (!clear(p.x, p.z, c.pos.x, c.pos.z)) continue
      seen++
      L.seen = this.frame
      const T = TRAITS[L.prof],
        k = (this.crimesSeen || 0) + p.i
      p.hop = Math.max(p.hop, 0.4)
      if (severe) {
        if (p.state === 'linger') this.leave(p, true)
        if (d < COWER_R && drawOf(p, 5 + k) < T.cower && !this.coming(p)) this.cower(p, 4 + 3 * drawOf(p, 6))
        else if (d > 14 && drawOf(p, 7 + k) < T.watch) this.stare(p, c.pos, 5 + 4 * drawOf(p, 8))
        else if (p.state !== 'cross' && p.state !== 'dodge' && p.state !== 'back') this.run(p, c.pos.x, c.pos.z)
        if (p.state === 'flee') L.fled = true
      } else if (p.state === 'walk' || p.state === 'idle') this.stare(p, c.pos, 2 + 2 * drawOf(p, 8))
      // the caller: the most willing, nearer the better (never one already on a call)
      if (L.call) continue
      const will = T.call * (1 - d / (PED_SEE + 5))
      if (drawOf(p, 11 + k) < T.call && will > bs) {
        bs = will
        best = p
      }
    }
    this.crimesSeen = (this.crimesSeen || 0) + 1
    let call = null
    if (best) {
      const [a, b] = CALL
      call = { type: c.type, pos: c.pos, state: 'pending', t: 0, dur: a + (b - a) * drawOf(best, 13), who: best.i }
      best.liv.call = call
    }
    emitGame('crime-witnessed', { type: c.type, pos: c.pos, peds: seen, caller: best ? best.i : null })
    return call
  },
  // stopping to look at (x, z) a while
  stare (p, pos, t) {
    if (p.state !== 'walk' && p.state !== 'idle') return
    p.state = 'idle'
    p.act = 0
    p.idleT = Math.max(p.idleT, t)
    p.yaw = Math.atan2(-(pos.z - p.z), pos.x - p.x)
  },
  // a call to the police: once safe (not running), on the phone for its length; cut off if they
  // go down, are frightened off or the player comes at them
  calling (p, L, dt, pl) {
    const c = L.call
    const fail = () => {
      c.state = 'failed'
      L.call = null
    }
    if (p.gone || p.dead || p.state === 'down') return fail()
    const dp = Math.hypot(pl.x - p.x, pl.z - p.z)
    if (c.state === 'pending') {
      if ((c.t += dt) > 20) return fail()
      if (p.state === 'flee' || p.state === 'cross' || p.state === 'dodge' || p.state === 'back') return
      if (dp < SCARE_OFF * 2) return
      c.state = 'calling'
      c.t = 0
      if (!L.cowerT) {
        p.state = 'idle'
        p.idleT = c.dur + 0.5
        p.lead = null
      }
      p.act = 1
      return
    }
    if (dp < SCARE_OFF) {
      this.run(p, pl.x, pl.z)
      return fail()
    }
    if (p.state !== 'idle') return fail()
    p.act = 1
    if ((c.t += dt) < c.dur) return
    c.state = 'done'
    L.call = null
    p.idleT = Math.min(p.idleT, 1)
    this.calls = (this.calls || 0) + 1
    emitGame('crime-called', { type: c.type, pos: c.pos, by: 'ped', id: p.i })
  },
  // twice a second, near the player: a car tearing past, and anyone stuck
  lifeNear (T, me, view) {
    const fast = me && me.vx * me.vx + me.vz * me.vz > 144
    let drop = false
    for (const p of this.list) {
      const L = p.liv
      if (!L || p.lod > 2) continue
      if (fast && p.state !== 'down' && p.state !== 'dodge' && p.state !== 'flee' && this.frame - L.seen > 90) {
        const dx = p.x - me.x,
          dz = p.z - me.z
        if (dx * dx + dz * dz < 25) {
          L.seen = this.frame
          p.hop = Math.max(p.hop, 0.6)
          p.fright = Math.max(p.fright, 0.9)
          this.startled = (this.startled || 0) + 1
          if (p.state === 'idle' || p.state === 'walk') {
            this.stare(p, me, 1.5)
          }
        }
      }
      // getting nowhere: back on their way
      const moved = Math.abs(p.x - L.lastX) + Math.abs(p.z - L.lastZ)
      L.lastX = p.x
      L.lastZ = p.z
      const moving = MOVING.has(p.state) || (p.state === 'linger' && p.leg !== 2)
      if (!moving || moved > 0.08 || p.lead) {
        L.stuckT = 0
        if (moved > 1) L.tries = 0
        continue
      }
      if ((L.stuckT += T) < STUCK) continue
      // (held by a car beside them, the player's or another: theirs to sort out, not ours)
      if (this.byCar(p, me)) {
        L.stuckT = 0
        continue
      }
      const seen = view && (p.x - view.x) * view.fx + (p.z - view.z) * view.fz > -8
      this.unstuckN = (this.unstuckN || 0) + 1
      if (L.tries >= 2 && !seen) {
        p.gone = drop = true
        continue
      }
      this.unstick(p)
      L.lastX = p.x
      L.lastZ = p.z
      L.tries++
      L.stuckT = 0 // (stuck again after twice put right: off, if out of sight)
    }
    if (drop) this.list = this.list.filter(p => !p.gone)
  },
  byCar (p, me) {
    if (me && (p.x - me.x) ** 2 + (p.z - me.z) ** 2 < 36) return true
    for (const c of this.traffic?.cars || []) if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 36) return true
    return false
  },
  unstick (p) {
    if (p.state === 'linger') this.leave(p, true)
    if (p.state === 'back' && p.backRing) {
      p.ring = p.backRing
      p.s = p.backS
    } else {
      const b = p.state === 'walk' || p.state === 'flee' ? p.ring.b : blockNear(p.x, p.z)
      if (b !== p.ring.b || kerbDist(p.x, p.z) > -0.2) p.ring = this.lineFor(p, b, 1)
      p.s = nearestOn(p.ring, p.x, p.z) + p.dir * 1.2
    }
    p.state = 'walk'
    p.cross = p.aside = null
    p.jay = false
    p.piece = this.place(p)
  },
  // the performers and their watchers
  gather (T, pl, view) {
    for (const poi of layPois()) {
      const d = Math.hypot(poi.x - pl.x, poi.z - pl.z)
      const q = poi.perf
      if (q && (q.gone || q.state !== 'idle' || d > this.radius + 30)) {
        poi.perf = null
        if (q.state === 'idle' && !q.gone) q.idleT = 0
        if (q.liv) q.liv.perf = null
      }
      // (the slots of those who went)
      for (const sl of poi.slots) {
        const o = sl.who
        if (o && (o.gone || o.state !== 'linger' || o.leg === 3 || o.liv?.poi !== poi)) {
          sl.who = null
          if (o.liv?.poi === poi) o.liv.poi = null
        }
      }
      if (d > 110) continue
      if (tick(poi, T) && poi.perf) {
        poi.perf.idleT = 0 // (show over: packs up and walks off)
        poi.perf.liv.perf = null
        poi.perf = null
        for (const sl of poi.slots) if (sl.who) sl.who.lingerT = Math.min(sl.who.lingerT, 1 + 2 * drawOf(sl.who, 41))
      }
      if (!poi.open) continue
      if (!poi.perf) {
        // (never appearing in sight; and only where there is a crowd to play to: none on empty
        // streets, nor with the people switched off)
        if (!this.count || this.list.length < MIN_CROWD) continue
        const ahead = view && (poi.x - view.x) * view.fx + (poi.z - view.z) * view.fz > 0
        if ((ahead && d < 120) || d < 25) continue
        poi.perf = this.performer(poi)
        continue
      }
      if (watching(poi) >= poi.slots.length) continue
      for (const p of this.list) {
        if (p.state !== 'walk' || p.ring.b !== poi.b || p.lead || p.mate || p.dog || p.jog || p.lod > 1) continue
        const L = p.liv
        if (!L || L.poi || L.call) continue
        const dx = p.x - poi.x,
          dz = p.z - poi.z
        if (dx * dx + dz * dz > 196) continue
        if (drawOf(p, 21 + poi.shows * 3 + poi.served) > 0.3 * TRAITS[L.prof].linger) continue
        const sl = slotFor(poi, p.x, p.z)
        if (!sl) break
        this.watchAt(p, poi, sl)
        if (watching(poi) >= poi.slots.length) break
      }
    }
  },
  performer (poi) {
    const R = this.R
    this.R = this.Q // (the second stream, as for the third in a chat: linger.js)
    const q = this.spawnAt(poi.g, poi.s, 1)
    this.R = R
    q.state = 'idle'
    q.act = 2
    q.idleT = 1e9
    q.liv.perf = poi
    q.yaw = Math.atan2(poi.hx, poi.hz) // (facing the kerb)
    this.place(q)
    q.yaw = Math.atan2(poi.hx, poi.hz)
    return q
  },
  watchAt (p, poi, sl) {
    sl.who = p
    p.liv.poi = poi
    poi.served++
    const sp = p.spot
    sp.seat = null
    sp.fx = sp.x = sl.x
    sp.fz = sp.z = sl.z
    sp.yaw = sl.yaw
    sp.s = nearestOn(p.ring, sl.x, sl.z)
    this.stop(p, 2, (8 + 17 * drawOf(p, 31 + poi.served)) * TRAITS[p.liv.prof].idleLen)
    this.gathered = (this.gathered || 0) + 1
  }
}
