// Dogs walked on a lead (mixed into Peds, which keeps them in peds.dogs; render/dogs.js draws
// them). A few people out walking on their own have one. It trots beside them on the side away
// from the road and a little ahead, sits by them when they stop (behind them, back from the kerb,
// while they wait to cross), goes over the street with them, runs with them when they flee, and
// goes indoors with them. It shies clear of the Roadster (or a car it sent sliding) as people
// dive, and never stays under one; out in the road it is one more for the traffic to stop for
// (traffic.peds), and it steps round a car stopped on the crossing as its owner does.
import { kerbDist } from './street.js'
import { ringOf } from './pavement.js'
import { warm } from './traffic.js'

let WARM = false
export const DOGS = {
  // A dog for p, who walks on their own: over to an inner line first (the dog walks inside them,
  // and inside the kerbside line stand the palms), at a stroll. From the second stream (peds.js Q).
  adopt (p) {
    const Q = this.Q
    if (p.ring.d < 2) this.inward(p, 1)
    p.v = p.v0 = Math.min(p.v, 1.3)
    const d = {
      owner: p,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      vx: 0,
      vz: 0,
      v: 0, // its speed (m/s), for its stride
      phase: Q() * 6.3, // its stride's clock
      wag: Q() * 6.3, // its tail's
      look: Q(), // its coat and build, for the renderer
      size: 0.62 + 0.42 * Q(), // a terrier to a retriever
      side: 1, // which side of its owner: 1 their right
      sit: 0, // sat down by them as they stand about (0 to 1)
      dash: 0, // s left of a dive clear of a car
      dt: 0, // (this step's length)
      inRoad: false,
      gone: false
    }
    if (!WARM) {
      warm(d) // (every dog's fields ready for what they will hold: see traffic.js)
      WARM = true
    }
    p.dog = d
    this.dogs.push(d)
    return d
  },
  // the ring of block b at line k, for p: one with a dog keeps to the inner lines
  lineFor (p, b, k) {
    return ringOf(b, p.dog && k === 0 ? 1 : k)
  },
  // Every dog this step (dt): to its owner's side, or diving clear of a car (threats, as peds.js
  // gathers them); those out in the road go on the list traffic stops for (this.onRoad)
  walkDogs (dt, threats, cars) {
    for (const d of this.dogs) {
      const o = d.owner
      if (o.gone) continue
      if (d.dash > 0) {
        // (diving clear, its speed dying away)
        d.dash -= dt
        d.x += d.vx * dt
        d.z += d.vz * dt
        const k = Math.exp(-dt * 3)
        d.vx *= k
        d.vz *= k
        d.v = Math.hypot(d.vx, d.vz)
        d.sit = 0
      } else {
        d.dt = dt
        this.heel(d, o)
      }
      for (const th of threats) this.shy(d, th)
      d.inRoad = kerbDist(d.x, d.z) > -0.2
      if (d.inRoad) {
        this.onRoad.push(d)
        this.round(d, cars)
      }
      d.wag += dt * (d.v > 3 ? 14 : 19)
      // a trot: about 0.6 m a stride for a dog its size (each leg's step half that)
      d.phase += (dt * d.v * Math.PI * 2) / (0.6 * d.size + 0.1)
    }
  },
  // to its place beside its owner o: on whichever side is further from the road (it keeps to the
  // side it is on unless the other is clearly better), a little ahead of them as they go; behind
  // them if beside them would be at the kerb (as they wait to cross); in the road only if they are.
  // (Its step is read from it, d.dt: a number passed in costs an allocation.)
  heel (d, o) {
    const dt = d.dt,
      hx = Math.cos(o.yaw),
      hz = -Math.sin(o.yaw),
      rx = -hz,
      rz = hx // (their right)
    const still =
      o.state === 'wait' ||
      o.state === 'idle' ||
      (o.state === 'linger' && o.leg === 2)
    const fwd = still ? 0.1 : 0.35,
      s = d.side * 0.5
    const ax = o.x + hx * fwd,
      az = o.z + hz * fwd
    let tx = ax + rx * s,
      tz = az + rz * s
    // (which side is looked at every few steps)
    if ((this.frame & 7) === 0)
      if (kerbDist(ax - rx * s, az - rz * s) < kerbDist(tx, tz) - 0.3) {
        d.side = -d.side
        tx = ax - rx * s
        tz = az - rz * s
      }
    if (o.state !== 'cross' && kerbDist(tx, tz) > -0.45) {
      tx = o.x - hx * 0.55
      tz = o.z - hz * 0.55
    }
    // (eased in: quick to catch up, slowing as it gets there)
    const dx = tx - d.x,
      dz = tz - d.z,
      dist = Math.sqrt(dx * dx + dz * dz)
    const v = Math.min(6.5, dist * 4)
    d.v += (v - d.v) * Math.min(1, dt * 8)
    if (dist > 1e-4) {
      const m = Math.min(dist, v * dt) / dist
      d.x += dx * m
      d.z += dz * m
    }
    // facing the way it goes, or as its owner does once it is there
    const want = v > 0.3 ? Math.atan2(-dz, dx) : o.yaw
    let turn = want - d.yaw
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI
    d.yaw += Math.max(-dt * 7, Math.min(dt * 7, turn))
    // sitting down by them while they stand (slowly), up again at once when they go
    d.sit =
      still && d.v < 0.3
        ? Math.min(1, d.sit + dt)
        : Math.max(0, d.sit - dt * 4)
  },
  // Out of the way of whatever is coming (th), as people dive (crowd.js dodge): anyone near its
  // path in the next second and a half leaps sideways, away from its line; and out from under it
  shy (d, th) {
    const dx = d.x - th.x,
      dz = d.z - th.z
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) return
    const along = dx * th.hx + dz * th.hz,
      side = dz * th.hx - dx * th.hz
    if (Math.abs(along) < th.hl + 0.3 && Math.abs(side) < th.hw + 0.3) {
      const out = (th.hw + 0.35) * (side >= 0 ? 1 : -1) - side
      d.x -= th.hz * out
      d.z += th.hx * out
    }
    const sp = Math.sqrt(th.vx * th.vx + th.vz * th.vz)
    if (sp < 1.5 || d.dash > 0) return
    const a = (dx * th.vx + dz * th.vz) / sp,
      l = (dz * th.vx - dx * th.vz) / sp
    if (a < -th.hl || a > th.hl + sp * 1.5 + 1.5) return
    if (Math.abs(l) > th.hw + 1) return
    const sg = Math.abs(l) > 0.15 ? Math.sign(l) : d.side
    const v = a < th.hl + 4 ? 7.5 : 5.5
    d.vx = (-th.vz / sp) * sg * v
    d.vz = (th.vx / sp) * sg * v
    d.yaw = Math.atan2(-d.vz, d.vx)
    d.dash = 0.6
  },
  // out of a car stopped where it stands in the road, by the nearer side (as crowd.js clear)
  round (d, cars) {
    for (const c of cars) {
      const dx = d.x - c.x,
        dz = d.z - c.z
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue
      const along = dx * c.hx + dz * c.hz,
        side = dz * c.hx - dx * c.hz
      const ea = c.len / 2 + 0.3 - Math.abs(along),
        es = c.wid / 2 + 0.3 - Math.abs(side)
      if (ea <= 0 || es <= 0) continue
      if (ea < es) {
        const k = ea * Math.sign(along || 1)
        d.x += c.hx * k
        d.z += c.hz * k
      } else {
        const k = es * Math.sign(side || 1)
        d.x -= c.hz * k
        d.z += c.hx * k
      }
    }
  },
  // the dogs whose owners have gone (out of the bubble, or indoors) go with them
  strays () {
    const D = this.dogs
    let n = 0
    for (let i = 0; i < D.length; i++)
      if (D[i].owner.gone) D[i].gone = true
      else D[n++] = D[i]
    D.length = n
  }
}
