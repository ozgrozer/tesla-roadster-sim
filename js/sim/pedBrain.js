// What the people on foot (peds.js) think, beyond walking the pavements' graph and crossing on the
// walk: their states, as a machine (walk, kerb: to the crossing, wait: for the walk, cross,
// idle: on the phone or looking about, linger: a bench, a window, a chat, flee, dodge: diving
// clear, back: to the pavement, down: knocked over), each person's alertness (how soon they see a
// car coming: someone on their phone later), being hit by a car too fast to dodge ('ped-hit', and a
// 'crime' when the player did it: gameEvents.js), threats anyone can raise at a place (the player
// on foot with a weapon out, a fight: threat()), the horn, keeping out of each other's way (no
// clumping), never left standing in the road nor pushed into a building, and a jacked driver
// running off. Mixed into Peds.
import { CROWD } from './crowd.js'
import { query } from './city.js'
import { kerbDist } from './street.js'
import { emitGame } from './gameEvents.js'
import { LINES, nearestOn, blockNear, ringAt } from './pavement.js'
import { BRAWL_MIXIN } from './brawl.js'
import { PED_REACT } from './pedReact.js'

export const STATES = ['walk', 'kerb', 'wait', 'cross', 'idle', 'linger', 'flee', 'dodge', 'back', 'down', 'brawl']
export const ACT = { look: 0, phone: 1, talk: 2 }
export const HIT_V = 3.5 // m/s: a car faster than this knocks someone down; slower, it nudges them
export const KILL_V = 12 // m/s (43 km/h): and faster than this, they don't get up
export const MAYBE_V = 8 // m/s: from this up to KILL_V, the more likely they don't
export const GRAVITY = 16 // m/s²: thrown up over the bonnet, how fast they come down
const ROAD_MAX = 4 // s anyone stands about in the road (not crossing, diving or down) before going back
const CELL = 1.5 // m: the grid people keep their distance on
const GAP = 0.6 // m between two people's middles
const SAFE = new Set(['cross', 'dodge', 'down', 'kerb', 'back', 'wait'])
const grid = new Map()
const near = []

export const PEDBRAIN = {
  ...BRAWL_MIXIN, // (fists: brawl.js)
  ...PED_REACT, // (a car coming: pedReact.js)
  // A threat at (x, z) for ttl s: level 1, people within r look at it and keep their distance;
  // level 2 or more (a weapon, a fight, gunfire), they run from it. Returns the threat.
  threat (x, z, r = 12, level = 2, ttl = 0.5) {
    const t = { x, z, r, level, ttl, cool: 0 }
    this.ext.push(t)
    return t
  },
  // how soon someone sees a car coming (s before it would reach them)
  alertOf (p) {
    // (each their own, from who they are: no draw from the people's random numbers)
    if (!p.alert) p.alert = (0.3 + ((p.look * 5.17 + p.i * 0.137) % 1) * 1.1) * (this.traits ? this.traits(p).alert : 1)
    return p.alert * (p.state === 'idle' && p.act === ACT.phone ? 0.45 : 1)
  },
  // once a step, before anyone moves: the threats raised, the horn, the player on foot, a jacked
  // driver's flight, and the road
  think (dt, sim, traffic, me) {
    this.now = (this.now || 0) + dt // (the people's own clock: pedReact.js)
    const ext = this.ext
    // (the fights first: the staggered, those fighting back, the dead taken away: brawl.js)
    this.brawlStep(dt, sim.mode === 'foot' ? sim.pos : null, sim.pos)
    for (let i = ext.length - 1; i >= 0; i--) {
      const t = ext[i]
      if ((t.ttl -= dt) < 0) {
        ext.splice(i, 1)
        continue
      }
      if (t.level >= 2 && (t.cool -= dt) <= 0) {
        t.cool = 1
        this.scare(t.x, t.z, t.r)
      }
    }
    // the horn: heads turn, a start, those crossing hurry, a phone call cut short
    const horn = !!traffic.horn && !!me
    if (horn && !this.hornWas)
      for (const p of this.list) {
        if ((p.x - me.x) ** 2 + (p.z - me.z) ** 2 > 400) continue
        if (p.state === 'cross') p.hurry = Math.max(p.hurry, 2)
        else if (p.state === 'idle') p.idleT = Math.min(p.idleT, 0.4)
        if (p.state !== 'down') p.hop = Math.max(p.hop, 0.2)
      }
    this.hornWas = horn
    const foot = sim.mode === 'foot' ? sim.pos : null
    for (const p of this.list) {
      if (p.jacked && p.state === 'walk') {
        p.jacked = false
        this.run(p, p.fromX, p.fromZ)
      }
      if (p.inRoad && !SAFE.has(p.state)) p.roadT += dt
      else p.roadT = 0
      if (p.roadT > ROAD_MAX) this.goBack(p)
      if (foot) this.keepFrom(p, foot.x, foot.z, 0.75)
      for (const t of ext) if (t.level < 2) this.keepFrom(p, t.x, t.z, 2.5, t.r)
    }
    this.spread()
    this.steer(dt) // (round each other, fright spreading, getting over it: pedSteer.js)
  },
  // keeping r from someone at (x, z) (looking at them within look m); pushed, they step aside
  keepFrom (p, x, z, r, look = 6) {
    const dx = p.x - x,
      dz = p.z - z,
      d2 = dx * dx + dz * dz
    if (d2 > look * look || p.state === 'down') return
    if (d2 >= r * r) return
    const d = Math.sqrt(d2) || 1e-3
    if (p.state === 'walk') p.pass = Math.max(-1.3, Math.min(1.3, p.pass + Math.min(0.03, r - d) * Math.sign(p.side + 0.01)))
    else {
      p.x += (dx / d) * (r - d)
      p.z += (dz / d) * (r - d)
      this.unwall(p)
    }
  },
  // over to the pavement, as after a dive (peds.js 'back')
  goBack (p) {
    p.state = 'back'
    p.back = blockNear(p.x, p.z)
    const g = this.lineFor(p, p.back, Math.floor(this.R() * LINES.length))
    p.backRing = g
    p.backS = nearestOn(g, p.x, p.z)
    p.roadT = p.t = p.stall = 0
    p.near = Infinity
    p.cross = p.aside = null
  },
  // held off the way back (a car stopped over it): round it, to the pavement a few metres along
  pickBack (p) {
    const P = this.P,
      R = p.backRing
    ringAt(R, p.backS, P)
    const ox = P.x,
      oz = P.z,
      s = nearestOn(R, p.x, p.z)
    ringAt(R, s + 4, P)
    const far = Math.hypot(P.x - ox, P.z - oz)
    ringAt(R, s - 4, P)
    p.backS = Math.hypot(P.x - ox, P.z - oz) > far ? s - 4 : s + 4
    p.t = p.stall = 0
    p.near = Infinity
    return false
  },
  // someone running off from (x, z) along their pavement
  run (p, x, z) {
    const P = this.P
    this.at(p, P)
    p.state = 'flee'
    p.lead = null
    p.act = 0
    p.fleeT = 4 + this.R() * 4
    p.v = 3.6 + this.R() * 1.6
    p.fright = 0.8
    p.dir = P.hx * (p.x - x) + P.hz * (p.z - z) >= 0 ? 1 : -1
    this.scream++
  },
  // Out of the way of whatever is coming (th): a car on top of them faster than HIT_V knocks them
  // down; coming at them, most freeze or react too late and only some dive clear (pedReact.js).
  dodge (p, th) {
    if (p.state === 'down') return
    const dx = p.x - th.x,
      dz = p.z - th.z
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) return
    const along = dx * th.hx + dz * th.hz,
      side = dz * th.hx - dx * th.hz
    const sp = Math.sqrt(th.vx * th.vx + th.vz * th.vz)
    if (Math.abs(along) < th.hl + 0.3 && Math.abs(side) < th.hw + 0.3 && sp > HIT_V)
      return this.knockDown(p, th, sp)
    // (at a crawl they step out of its way, as crowd.js has them; faster, each as they take it:
    // pedReact.js)
    if (sp <= HIT_V) return CROWD.dodge.call(this, p, th)
    this.carComing(p, th, sp, dx, dz, this.now || 0)
  },
  // knocked down by th at sp m/s: thrown with it, tumbling the way they go, down a while (or
  // for good, hit hard). A clip at walking pace is a short hop and a fall; faster, they go up
  // over the bonnet and turn over in the air.
  knockDown (p, th, sp) {
    const by = th === this.me ? 'player' : 'traffic'
    if (p.state === 'linger') this.leave(p, true)
    const side = (p.z - th.z) * th.hx - (p.x - th.x) * th.hz >= 0 ? 1 : -1
    const kick = Math.min(2.6, 0.07 * sp + 0.45)
    p.state = 'down'
    p.t = 0
    p.rise = 0
    p.vx = th.vx * 0.9 - th.hz * side * kick
    p.vz = th.vz * 0.9 + th.hx * side * kick
    p.air = 0.02
    p.airV = sp < 4.5 ? 1.15 : Math.min(9, 0.3 * sp)
    p.pitch = 0.2
    p.pitchV = -(sp < 4.5 ? 3.6 : Math.min(13, 0.5 * sp))
    p.hop = 0
    p.fright = 2
    p.gait = 0
    p.fall = 0
    p.umb = 0
    p.yaw = Math.atan2(-p.vz, p.vx)
    p.phase = p.pitch
    p.cross = p.aside = p.lead = null
    p.act = 0
    // (each their own luck between MAYBE_V and KILL_V: no draw from the people's random numbers)
    const luck = (p.look * 7.77 + p.i * 0.618034 + 0.71) % 1
    p.dead = sp >= KILL_V || (sp > MAYBE_V && luck < (sp - MAYBE_V) / (KILL_V - MAYBE_V))
    p.downT = 3 + this.R() * 3 + sp * 0.2
    const severity = p.dead ? 3 : sp > 7 ? 2 : 1
    const pos = { x: p.x, z: p.z }
    emitGame('ped-hit', { pos, speed: sp, severity, by, id: p.i, dead: p.dead, how: 'car' })
    if (by === 'player')
      emitGame('crime', { type: p.dead ? 'ped-killed' : 'ped-hit', pos, severity: p.dead ? 1.5 : 1 })
    if (p.dead) this.killed = (this.killed || 0) + 1
    this.scare(p.x, p.z, 18)
  },
  // down: tumbling with the throw, a bounce, sliding to a stop, lying there, then up (a moment
  // to get the feet under them) and away to the pavement
  lie (p, dt) {
    if (p.rise > 0) {
      p.rise -= dt
      p.vx = p.vz = p.air = p.airV = 0
      p.pitch += (0 - p.pitch) * Math.min(1, dt * 4)
      p.fall = Math.max(0, p.rise / 0.45)
      p.fright = 2
      p.gait = 0
      p.hop = 1
      p.phase = 0
      if (p.rise > 0) return
      p.fall = p.pitch = p.fright = p.hop = 0
      p.jacked = true // (once back on the pavement: running off)
      p.fromX = p.x
      p.fromZ = p.z
      this.goBack(p)
      return
    }
    p.x += p.vx * dt
    p.z += p.vz * dt
    const up = p.air > 0
    if (up) {
      p.air += p.airV * dt
      p.airV -= GRAVITY * dt
      if (p.air <= 0) {
        p.air = 0
        if (p.airV < -3.2) {
          p.air = 1e-3
          p.airV = -p.airV * 0.22
          p.vx *= 0.55
          p.vz *= 0.55
          p.pitchV *= 0.45
        }
      }
    }
    p.pitch += p.pitchV * dt
    const spd = Math.hypot(p.vx, p.vz)
    if (spd > 1.4) p.yaw = Math.atan2(-p.vz, p.vx)
    if (!up) {
      p.pitchV = 0
      const lie = Math.PI / 2
      let d = p.pitch - lie
      d -= Math.PI * 2 * Math.round(d / (Math.PI * 2))
      p.pitch = lie + d * Math.exp(-dt * 5)
    }
    const drag = up ? 0.3 : spd > 8 ? 1.4 : 3.4
    const k = Math.exp(-dt * drag)
    p.vx *= k
    p.vz *= k
    p.fall = Math.min(1, p.fall + dt * 6)
    p.gait = 0
    p.fright = 2
    p.hop = up ? 0 : 1
    p.umb = 0
    p.phase = p.pitch
    this.unwall(p)
    if (p.dead || p.t < p.downT) return
    p.rise = 0.45
  },
  // never inside a building: out by its nearest face
  unwall (p) {
    query(p.x - 0.4, p.z - 0.4, p.x + 0.4, p.z + 0.4, near)
    for (const c of near) {
      if (c.r || c.down || c.walk || c.y0 > 1.5 || c.y1 < 0.5) continue
      const m = 0.25
      const l = p.x - (c.x0 - m),
        r = c.x1 + m - p.x,
        t = p.z - (c.z0 - m),
        b = c.z1 + m - p.z
      if (l <= 0 || r <= 0 || t <= 0 || b <= 0) continue
      const k = Math.min(l, r, t, b)
      if (k === l) p.x -= l
      else if (k === r) p.x += r
      else if (k === t) p.z -= t
      else p.z += b
    }
  },
  // Nobody walks through anybody: two closer than GAP, a walker steps out to pass (p.pass, eased
  // back), anyone standing is nudged apart
  spread () {
    grid.clear()
    for (const p of this.list) {
      if (!p.passT) p.pass *= 0.97
      if (p.lod > 1 || p.state === 'down' || p.state === 'linger') continue
      const k = Math.floor(p.x / CELL) * 73856093 ^ Math.floor(p.z / CELL) * 19349663
      const c = grid.get(k)
      if (c) c.push(p)
      else grid.set(k, [p])
    }
    for (const p of this.list) {
      if (p.lod > 1 || p.state === 'down' || p.state === 'linger') continue
      const cx = Math.floor(p.x / CELL),
        cz = Math.floor(p.z / CELL)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const c = grid.get((cx + i) * 73856093 ^ (cz + j) * 19349663)
          if (c) for (const o of c) if (o.i > p.i) this.part(p, o)
        }
    }
  },
  part (p, o) {
    if (o.lead === p || p.lead === o || o.state === 'linger' || o.state === 'down') return
    const dx = o.x - p.x,
      dz = o.z - p.z,
      d2 = dx * dx + dz * dz
    if (d2 >= GAP * GAP) return
    const d = Math.sqrt(d2) || 1e-3,
      push = (GAP - d) / 2
    for (const [q, sg] of [[p, -1], [o, 1]]) {
      if (q.state === 'walk') q.pass = Math.max(-1.3, Math.min(1.3, q.pass + sg * q.dir * Math.min(push, 0.02))) // (eased)
      else if (q.state !== 'cross' && q.state !== 'dodge' && (sg < 0 ? o : p).state !== 'walk') {
        // (someone standing isn't shoved by a walker: the walker goes round, pedSteer.js)
        const x = q.x + (sg * dx * push) / d,
          z = q.z + (sg * dz * push) / d
        // (never nudged out towards the road)
        if (kerbDist(x, z) < Math.min(-0.5, kerbDist(q.x, q.z) + 0.01)) {
          q.x = x
          q.z = z
        }
      }
    }
  }
}
// (whether a point is in the road, for anyone checking a person: peds.js keeps p.inRoad)
export const inRoad = (x, z) => kerbDist(x, z) > -0.2
