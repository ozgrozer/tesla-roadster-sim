// People lingering on the pavement (mixed into Peds, as crowd.js is): some sit a while on the bus
// benches, some stop to look in a shop window for a few seconds, some stand under a shop's canopy
// until the rain stops (shelter.js), and now and then three stand talking. Someone lingering walks
// on along their line until level with the spot (the front of a free seat, a window, under a
// canopy), steps off it to the spot, turns, sits down or stands there, and after a while steps back
// to their line and walks on. Sitting down they back onto the seat as their knees bend, so their
// feet stay where they are. Each bench seats two, either side of its middle (clear of the palm that
// stands in front of some), taken from the line by the kerb, the side the benches face; the
// windows and canopies are for those on the inner lines. Every choice here draws on the people's
// second random stream (peds.js Q).
import { ENV } from './env.js'
import { clamp, wrapPi } from './constants.js'
import { DECOR } from './city.js'
import { ringOf, ringAt, nearestOn, blockNear } from './pavement.js'

// Each block's bench seats: { x, z } where a sitter is, { fx, fz } where they stand to sit down,
// yaw (facing the road), and s, the place on the block's kerbside ring level with it (worked out
// when first wanted). Made when first asked for. (Who has each seat, sitting on it or on their way
// to it, each Peds keeps for itself: peds.held.)
let SEATS = null
function seatsOf (b) {
  if (!SEATS) {
    SEATS = new Map()
    for (const d of DECOR) {
      if (d.kind !== 'bench') continue
      const k = blockNear(d.x, d.z),
        fx = Math.cos(d.yaw),
        fz = -Math.sin(d.yaw)
      let list = SEATS.get(k)
      if (!list) SEATS.set(k, (list = []))
      for (const a of [-0.55, 0.55]) {
        const x = d.x - fz * a - fx * 0.02,
          z = d.z + fx * a - fz * 0.02
        list.push({
          x,
          z,
          fx: x + fx * 0.48,
          fz: z + fz * 0.48,
          yaw: d.yaw,
          s: -1
        })
      }
    }
  }
  return SEATS.get(b)
}
// how far round ring g from s to t, going way dir
const ahead = (g, s, t, dir) => ((((t - s) * dir) % g.len) + g.len) % g.len
const TURN = 6 // rad/s, the quickest anyone lingering turns

export const LINGER = {
  // Now and then, walking on their own, they think of stopping somewhere: out of the rain under a
  // canopy if they have no umbrella (thinking of it more often while it rains), on a bench (on the
  // kerbside line, in the dry), at a window. (Their step is read from them, p.lodT: a number
  // passed in costs an allocation.)
  whim (p) {
    if ((p.whimT -= p.lodT) > 0) return
    const Q = this.Q,
      rain = p.wet > 0.5 && !p.brolly
    p.whimT = rain ? 4 + 10 * Q() : 10 + 35 * Q()
    if (p.lead || p.jog || (p.mate && p.mate.lead === p && !p.mate.gone)) return
    const sp = p.spot
    if (p.wet > 0.5) {
      if (rain && p.ring.d > 2 && Q() < 0.6)
        if (this.frontSpot(p, 0.45, false, sp)) this.stop(p, 3, 40 + 80 * Q())
    } else if (p.ring.d < 2) {
      if (ENV.wet < 0.25 && Q() < 0.7) this.sitDown(p, 14)
    } else if (Q() < 0.5 && this.frontSpot(p, 0.65, true, sp))
      this.stop(p, 2, 3 + 6 * Q())
  },
  // off their line to their spot (p.spot), to do what (1 sit, 2 look in a window, 3 wait out the
  // rain) for t seconds
  stop (p, what, t) {
    p.state = 'linger'
    p.what = what
    p.leg = 0
    p.lingerT = t
    p.act = what === 1 && this.Q() < 0.3 ? 1 : 0 // (on the phone, some)
  },
  // a free seat on a bench within `within` m ahead of p along their ring: over to it to sit down
  sitDown (p, within) {
    const list = seatsOf(p.ring.b)
    if (!list) return false
    const g = p.ring
    for (const seat of list) {
      if (this.held.has(seat)) continue
      if (seat.s < 0) seat.s = nearestOn(ringOf(g.b, 0), seat.fx, seat.fz)
      const d = ahead(g, p.s, seat.s, p.dir)
      if (d < 1 || d > within) continue
      this.seat(p, seat, 25 + 70 * this.Q())
      return true
    }
    return false
  },
  seat (p, seat, t) {
    const sp = p.spot
    this.held.set(seat, p)
    sp.seat = seat
    sp.s = seat.s
    sp.x = seat.x
    sp.z = seat.z
    sp.fx = seat.fx
    sp.fz = seat.fz
    sp.yaw = seat.yaw
    this.stop(p, 1, t)
  },
  // Someone new, sat on a free seat on block b (on the kerbside line, level with it) if there is
  // one out of the camera's sight (not ahead of it within 120 m): true if so
  settle (p, b, view) {
    const list = seatsOf(b)
    if (!list || ENV.wet > 0.25 || p.wet > 0.5) return false
    for (const seat of list) {
      if (this.held.has(seat)) continue
      const seen =
        view && (seat.x - view.x) * view.fx + (seat.z - view.z) * view.fz > 0
      if (seen && Math.hypot(seat.x - view.x, seat.z - view.z) < 120) continue
      p.ring = ringOf(b, 0)
      if (seat.s < 0) seat.s = nearestOn(p.ring, seat.fx, seat.fz)
      p.s = seat.s
      this.seat(p, seat, 10 + 80 * this.Q())
      p.leg = 2
      p.sit = 1
      p.x = seat.x
      p.z = seat.z
      p.yaw = seat.yaw
      return true
    }
    return false
  },
  // Lingering: on along their line until level with the spot, over to it, turned, sat down or
  // standing there a while, then up again and back to their line; turning no faster than about a
  // turn a second (TURN)
  linger (p) {
    const sp = p.spot,
      dt = p.lodT
    if (p.leg < 2) p.gait += (1 - p.gait) * Math.min(1, dt * 3)
    if (p.leg === 0) {
      const left = ahead(p.ring, p.s, sp.s, p.dir)
      if (left > 0.05 && left < 20) {
        p.s += p.dir * Math.min(left, p.v * dt)
        p.sway += dt * 0.7
        p.piece = this.place(p)
        return
      }
      p.leg = 1
    }
    if (p.leg === 1) {
      const yaw = p.yaw
      if (this.toward(p, sp.fx, sp.fz, p.v, dt)) p.leg = 2
      p.yaw = yaw + clamp(wrapPi(p.yaw - yaw), -dt * TURN, dt * TURN)
      return
    }
    if (p.leg === 2) {
      p.gait += (0 - p.gait) * Math.min(1, dt * 4)
      const turn = wrapPi(sp.yaw - p.yaw)
      p.yaw += clamp(turn, -dt * TURN, dt * TURN)
      p.lingerT -= dt
      if (p.what !== 1) {
        if (p.lingerT <= 0) p.leg = 3
        return
      }
      // down onto the seat (once turned to it), backing onto it as the knees bend; and up again
      const down = p.lingerT > 0 && Math.abs(turn) < 0.3
      p.sit = down
        ? Math.min(1, p.sit + dt * 1.4)
        : Math.max(0, p.sit - dt * 1.7)
      const k = p.sit * p.sit * (3 - 2 * p.sit)
      p.x = sp.fx + (sp.x - sp.fx) * k
      p.z = sp.fz + (sp.z - sp.fz) * k
      if (p.lingerT <= 0 && p.sit === 0) this.leave(p, false)
      return
    }
    // (stepping back onto it, turning the way they go: on once turned)
    const P = this.P,
      yaw = p.yaw
    ringAt(p.ring, p.s, P)
    const there = this.toward(p, P.x, P.z, p.v, dt),
      way = Math.atan2(-P.hz * p.dir, P.hx * p.dir)
    p.yaw = yaw + clamp(wrapPi(way - yaw), -dt * TURN, dt * TURN)
    if (there && Math.abs(wrapPi(way - p.yaw)) < 0.3) {
      p.state = 'walk'
      p.act = 0
      p.piece = this.place(p)
    }
  },
  // up from their seat and on their way (at once, with now: frightened, or gone), the seat freed
  leave (p, now) {
    const seat = p.spot.seat
    if (seat && this.held.get(seat) === p) this.held.delete(seat)
    p.spot.seat = null
    p.leg = 3
    if (!now) return
    p.sit = 0
    p.act = 0
  },
  // A third joins the chat between p and the one they stand with (pairUp): the three of them in a
  // ring, each facing its middle. The newcomer is drawn from the second stream (as everything
  // here), and after the chat goes the other way.
  third (p) {
    const q = p.mate,
      R = this.R
    if (!q || q.state !== 'idle') return null
    this.R = this.Q
    const r = this.spawnAt(p.ring, p.s + 0.55 * p.dir, -p.dir)
    this.R = R
    r.state = 'idle'
    r.act = 2
    r.idleT = p.idleT
    r.side = 0.31
    this.place(r)
    const cx = (p.x + q.x + r.x) / 3,
      cz = (p.z + q.z + r.z) / 3
    for (const o of [p, q, r]) o.yaw = Math.atan2(-(cz - o.z), cx - o.x)
    return r
  }
}
