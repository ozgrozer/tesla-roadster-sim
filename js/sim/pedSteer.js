// How the people on foot get round each other and what they make of things, beyond the walk
// itself (peds.js) and the states (pedBrain.js); mixed into Peds and run once a step (think):
//  - looking ahead: someone standing (or slower, or coming the other way) on their line a few
//    metres on, a walker eases out round them on whichever side has room on the pavement (p.passT,
//    eased: no jumps), and with no room either side slows and waits (p.slow) rather than walking
//    through them; those crossing the street step round each other on the stripes too
//  - fright spreads: someone running scared sets those near them off a moment later (who did not
//    see it themselves), running from what frightened the first, and only two hops out
//  - calming down takes a while: once they stop running they walk on shaken (quicker, looking back,
//    no stopping for a chat or a bench) for a quarter of a minute or so
//  - cars: a near miss (a dive clear) or the horn close by, and they stop and shake a fist at it
//  - standing about, they look round: up and down the street, at the traffic, at a shop
// Its random numbers are its own stream (S), so everyone else's sequence is as it was.
import { rng } from './city.js'
import { kerbDist } from './street.js'
import { insideSolid } from './pedCheck.js'

const LOOK = 3.2 // m ahead a walker looks
const W = 0.72 // m: two people side by side at least this apart
const PASS_V = 1.1 // m/s a walker drifts sideways round someone
const SPREAD_R = 7 // m: fright spreads this far from someone running
const CELL = 3
const WAY = []
// (steps sideways a walker tries, least first)
const STEPS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6]
const grid = new Map()
const key = (x, z) =>
  (Math.floor(x / CELL) * 73856093) ^ (Math.floor(z / CELL) * 19349663)

// (room for someone at (x, z): on the pavement, not in a wall, a planter or a post)
const room = (x, z) => kerbDist(x, z) < -0.45 && !insideSolid(x, z, 0.05)

export const PEDSTEER = {
  steerInit (p) {
    p.passT = 0 // where the walker wants p.pass, m
    p.slow = 1 // walking at this much of their pace (waiting for room)
    p.shaken = 0 // s still shaken after a fright
    p.gestT = 0 // s shaking a fist at a car
    p.spook = 0 // s until a fright reaches them from someone running nearby
    p.gen = 0 // how many hops from the fright itself (0 saw it)
    p.glance = 0 // head turned to look at something, standing about
    p.glanceT = 0
    p.dodged = false
    p.waitT = 0
  },
  steer (dt) {
    const S = this.S || (this.S = rng(91))
    grid.clear()
    for (const p of this.list) {
      if (p.lod > 2) continue
      const k = key(p.x, p.z)
      const c = grid.get(k)
      if (c) c.push(p)
      else grid.set(k, [p])
    }
    const horn = this.hornWas && this.me
    for (const p of this.list) {
      if (p.lod > 2) continue
      this.react(p, dt, S, horn)
      if (p.state === 'walk') this.lookAhead(p, dt)
      else if (p.state === 'cross' && !p.aside) this.crossRound(p, dt)
      else if (p.state === 'kerb') this.queue(p)
      else if (p.state !== 'walk') {
        p.passT = 0
        p.slow = 1
      }
      if (p.state === 'flee' && p.gen < 2 && p.fleeT > 1.5)
        this.spreadFright(p, S)
    }
  },
  // the neighbours of (x, z) within a cell either way
  around (x, z, fn) {
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL)
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const c = grid.get(((cx + i) * 73856093) ^ ((cz + j) * 19349663))
        if (c) for (const o of c) fn(o)
      }
  },
  // those in the way on p's heading within look m, into WAY as [ahead, sideways] pairs; the
  // nearest of them right in the way, or null
  inWay (p, hx, hz, look) {
    WAY.length = 0
    let best = null,
      bestA = look
    this.around(p.x, p.z, o => {
      if (o === p || o === p.lead || o.lead === p || o.sit > 0) return
      if (o.lead && o.lead === p.lead) return
      const dx = o.x - p.x,
        dz = o.z - p.z
      const a = dx * hx + dz * hz
      if (a < 0.15 || a > look) return
      const l = dz * hx - dx * hz
      if (Math.abs(l) > W + 1.8) return
      // (someone going the same way at least as quick isn't in the way: they keep ahead)
      if (
        o.state === p.state &&
        o.dir === p.dir &&
        o.ring === p.ring &&
        o.v * (o.slow || 1) >= p.v * 0.92
      )
        return
      WAY.push(a, l)
      if (Math.abs(l) < W && a < bestA) {
        bestA = a
        best = [a, l]
      }
    })
    return best
  },
  lookAhead (p, dt) {
    const hx = Math.cos(p.yaw),
      hz = -Math.sin(p.yaw)
    const w = this.inWay(p, hx, hz, LOOK)
    let slowT = 1
    if (w) {
      // the least step sideways that clears all of them, with room on the pavement for it (m
      // along L = (-hz, hx), the way l is measured; the ring's offset, p.pass, runs along its
      // inward normal, which is L times the way round they walk: m along L is m * dir of pass)
      let to = null
      for (const m of STEPS) {
        const t = p.pass + m * p.dir
        if (Math.abs(t) > 1.3) continue
        let clear = true
        for (let i = 0; i < WAY.length && clear; i += 2)
          if (Math.abs(WAY[i + 1] - m) < W) clear = false
        if (clear && room(p.x - hz * m, p.z + hx * m)) {
          to = t
          break
        }
      }
      if (to !== null) p.passT = to || 1e-3
      else slowT = w[0] < 1.3 ? 0 : 0.5 // (no way by: wait for them)
    } else p.passT = 0
    // (waited a while with no way by: back the way they came)
    if (slowT === 0 && p.slow < 0.1) {
      if ((p.waitT = (p.waitT || 0) + dt) > 3) {
        p.dir = -p.dir
        p.waitT = 0
        p.passT = 0
      }
    } else p.waitT = 0
    if (p.passT)
      p.pass += Math.max(-PASS_V * dt, Math.min(PASS_V * dt, p.passT - p.pass))
    p.slow += (slowT - p.slow) * Math.min(1, dt * (slowT < p.slow ? 6 : 2))
  },
  // to the kerb to wait for the walk: someone already waiting right in front, and they wait
  // behind them (rather than walking on the spot into their back)
  queue (p) {
    const c = p.cross
    const [fx, fz] = this.jitter(c, c.from)
    const dx = fx - p.x,
      dz = fz - p.z,
      d = Math.hypot(dx, dz)
    if (d < 0.05 || d > 4) return
    const w = this.inWay(p, dx / d, dz / d, 0.85)
    if (!w) return
    p.state = 'wait'
    p.t = 0
    p.turned = false
  },
  // over the street, round someone coming the other way on the stripes: a step along them
  crossRound (p, dt) {
    const c = p.cross
    const tx = c.axis === 1 ? c.to[0] : c.to[0] + c.j,
      tz = c.axis === 1 ? c.to[1] + c.j : c.to[1]
    const dx = tx - p.x,
      dz = tz - p.z,
      d = Math.hypot(dx, dz) || 1
    const w = this.inWay(p, dx / d, dz / d, 2.4)
    if (!w) return
    const sg = w[1] >= 0 ? -1 : 1
    // (the stripes run across the way over: j slides the line along them)
    const along = c.axis === 1 ? -dx / d : dz / d
    c.j = Math.max(-2, Math.min(2, c.j + sg * Math.sign(along || 1) * dt * 0.9))
  },
  // running scared, they set off those near them who haven't seen it, a moment later
  spreadFright (p, S) {
    this.around(p.x, p.z, o => {
      if (o.spook > 0 || o.shaken > 0 || o.dead) return
      if (
        o.state !== 'walk' &&
        o.state !== 'idle' &&
        o.state !== 'wait' &&
        o.state !== 'linger' &&
        o.state !== 'kerb'
      )
        return
      if ((o.x - p.x) ** 2 + (o.z - p.z) ** 2 > SPREAD_R * SPREAD_R) return
      o.spook = 0.35 + S() * 0.9
      o.gen = p.gen + 1
    })
  },
  // the fright reaching them, getting over it, the horn and near misses, glances
  react (p, dt, S, horn) {
    if (p.spook > 0 && (p.spook -= dt) <= 0) {
      p.spook = 0
      if (
        p.state === 'walk' ||
        p.state === 'idle' ||
        p.state === 'wait' ||
        p.state === 'linger' ||
        p.state === 'kerb'
      ) {
        if (p.state === 'kerb' || p.state === 'wait') this.join(p, p.ring.b)
        if (p.state === 'linger') this.leave(p, true)
        this.run(p, this.panicX, this.panicZ)
        p.fleeT = 2.5 + S() * 2.5
      }
    }
    if (p.state === 'flee') {
      p.shaken = 14 + S() * 12
      p.glance = 0
    } else if (p.state === 'walk' && p.gen && !p.shaken) p.gen = 0
    if (p.state === 'dodge') p.dodged = true
    if (p.shaken > 0) {
      p.shaken -= dt
      if (p.state === 'walk') {
        // (quick, and a look back over the shoulder now and then)
        p.v = Math.max(p.v, p.v0 * 1.25)
        p.glance =
          Math.sin(p.t * 0.9 + p.i) > 0.85 ? 1.2 * (p.i % 2 ? 1 : -1) : 0
        if (p.shaken <= 0) {
          p.v = p.v0
          p.glance = 0
          p.gen = 0
        }
      }
    }
    // the horn close by, or just dived clear of a car: a fist shaken at it (walking, they stop)
    if (p.dodged && p.state === 'walk') {
      p.dodged = false
      p.gestT = 1.6 + S()
      p.shaken = Math.max(p.shaken, 8)
    } else if (
      horn &&
      !this.hornSeen &&
      (p.state === 'walk' || p.state === 'idle' || p.state === 'wait')
    ) {
      const me = this.me
      if ((p.x - me.x) ** 2 + (p.z - me.z) ** 2 < 100 && S() < 0.5)
        p.gestT = 1.2 + S()
    }
    if (p.gestT > 0) {
      p.gestT -= dt
      const me = this.me
      if (
        me &&
        (p.state === 'walk' || p.state === 'idle' || p.state === 'wait')
      ) {
        p.act = p.gestT > 0 ? 3 + 0.5 * Math.max(0, Math.sin(p.gestT * 9)) : 0
        if (p.state === 'walk') p.slow = Math.min(p.slow, 0.15)
        p.glance = 0
      } else if (p.act >= 3 && p.state !== 'brawl') p.act = 0
      if (p.gestT <= 0 && p.act >= 3 && p.state !== 'brawl') p.act = 0
    }
    // standing about: a look up the street, down it, into a shop, every few seconds
    if ((p.state === 'idle' && p.act !== 2) || p.state === 'wait') {
      if ((p.glanceT -= dt) <= 0) {
        p.glanceT = 1.5 + S() * 4
        p.glance = S() < 0.35 ? 0 : (S() - 0.5) * 2.4
      }
    } else if (!p.shaken) p.glance = 0
  }
}
