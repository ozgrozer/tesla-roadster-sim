// People in the rain (mixed into Peds, as crowd.js is). Each minds the rain at their own point:
// some at the first drops, some only once it pours. Past it, most put up an umbrella (it opens over
// a second, in a raised hand); the rest hurry along a little hunched, with shorter, quicker steps
// and their hoods up if they wear a hoodie, and a few run for it. Nobody stands about chatting or
// sits on a wet bench, and some without an umbrella wait it out under a shop's canopy. As it eases
// off, well under their point, umbrellas come down, hoods too, and they slow to their own pace.
// The canopies run along the shopfronts' feet, 1.1 m out over the pavement (cityBuildings.js):
// where a shop stands at the back of the pavement, there is room to stand under one, out of the
// rain, or to look in its window (linger.js).
import { ENV } from './env.js'
import { clamp } from './constants.js'
import { BUILDINGS } from './city.js'
import { blockNear } from './pavement.js'

// Each block's shopfronts at the back of its pavement, by side (0 north, 1 east, 2 south, 3 west,
// as its rings' straights run: ringAt's pieces 0, 2, 4, 6): [from, to, wall], along x on the north
// and south, along z on the east and west, wall the front's distance in from the kerb (a shop set
// back behind a forecourt or a car park has no canopy over the pavement). Made when first asked.
let FRONTS = null
function frontsOf (b) {
  if (!FRONTS) {
    FRONTS = new Map()
    for (const o of BUILDINGS) {
      if (!o.shop || o.form === 'shaft') continue
      const t = o.tiers[0],
        k = blockNear((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2)
      let f = FRONTS.get(k)
      if (!f) FRONTS.set(k, (f = [[], [], [], []]))
      const walls = [t.z0 - k.z0, k.x1 - t.x1, k.z1 - t.z1, t.x0 - k.x0]
      for (let s = 0; s < 4; s++)
        if (walls[s] > 3.9 && walls[s] < 4.8)
          f[s].push(s % 2 ? [t.z0, t.z1, walls[s]] : [t.x0, t.x1, walls[s]])
    }
  }
  return FRONTS.get(b)
}
// v moved toward `to` by at most k
const ease = (v, to, k) => v + clamp(to - v, -k, k)

export const SHELTER = {
  // what someone new carries and how they take the rain, from the second stream (peds.js Q); out
  // in it already, they come out ready for it
  outfit (p) {
    const Q = this.Q
    p.brolly = !p.jog && Q() < 0.62
    p.wetK = 0.04 + 0.4 * Q()
    p.dash = Q() < 0.2 && !p.brolly
    p.whimT = 4 + 50 * Q()
    const on = ENV.rain > p.wetK ? 1 : 0
    p.wet = on
    p.umb = p.brolly ? on : 0
    p.hunch = p.brolly ? 0 : on
  },
  // How the rain takes them this step (their step, p.lodT): the umbrella up or the hood, how much
  // quicker they go (p.rush), and no standing about in it
  rainy (p) {
    const r = ENV.rain,
      dt = p.lodT
    if (r < 0.02 && p.wet + p.umb + p.hunch === 0) {
      p.rush = 1
      return
    }
    const on = p.wet > 0.5 ? r > p.wetK * 0.6 : r > p.wetK
    const was = p.wet
    p.wet = on ? Math.min(1, p.wet + dt * 1.5) : Math.max(0, p.wet - dt)
    // (the moment they mind it, they think where to go: linger.js)
    if (was < 0.5 && p.wet >= 0.5) p.whimT = Math.min(p.whimT, 2 * this.Q())
    // (under a canopy, the umbrella comes down, and the hood)
    const under = p.state === 'linger' && p.what > 1 && p.leg === 2
    p.umb = ease(p.umb, p.brolly && !under ? p.wet : 0, dt * 1.6)
    p.hunch = ease(p.hunch, p.brolly || under ? 0 : p.wet, dt * 2)
    const run = p.dash ? Math.max(0.3, 2.7 / p.v - 1) : 0.22
    p.rush = p.lead ? p.lead.rush : 1 + p.wet * (p.brolly ? 0.06 : run)
    if (p.state === 'linger' && p.what === 3 && !on)
      p.lingerT = Math.min(p.lingerT, 1.5) // (it has stopped: on their way)
    if (p.wet < 0.5) return
    if (p.state === 'idle') p.idleT = 0
    else if (p.state === 'linger' && p.what === 1) p.lingerT = 0
  },
  // Where p, on a straight of their ring, could stand by the shopfront beside them, back m in
  // front of it, facing the street (or with inside, its window); into out ({ x, z, fx, fz, yaw, s }:
  // the spot, the way to it, and the place on their line level with it), or false: no shop at the
  // back of the pavement here, or someone already standing there
  frontSpot (p, back, inside, out) {
    const P = this.P
    this.at(p, P)
    if (P.piece % 2) return false
    const side = P.piece / 2,
      list = frontsOf(p.ring.b)?.[side]
    if (!list) return false
    const u = side % 2 ? P.z : P.x
    for (const [a, b, wall] of list) {
      if (u < a + 0.8 || u > b - 0.8) continue
      const nx = -P.hz,
        nz = P.hx, // (into the block)
        d = wall - back - p.ring.d
      const x = P.x + nx * d,
        z = P.z + nz * d
      for (const o of this.list)
        if (o.state === 'linger' && o !== p)
          if (Math.abs(o.spot.x - x) < 0.75 && Math.abs(o.spot.z - z) < 0.75)
            return false
      out.x = out.fx = x
      out.z = out.fz = z
      out.s = p.s
      out.yaw = inside ? Math.atan2(-P.hx, -P.hz) : Math.atan2(P.hx, P.hz)
      return true
    }
    return false
  }
}
