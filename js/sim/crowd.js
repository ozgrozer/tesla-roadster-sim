// How people on foot behave beyond getting about (peds.js), mixed into Peds: some walk in pairs,
// some stand about (on the phone, chatting, waiting), a few jog; heads turn to follow the Roadster
// when it goes by loud and fast; and when it drives along the pavement, crashes, comes down from the
// air or hits something hard close by, the people round about flee along the pavement away from it
// (screaming: peds.panic counts them, peds.scream those who have just started), and calm down a few
// seconds later. Now and then someone jaywalks, straight over the street from the pavement, once
// they have looked and the traffic is far enough off to stop for them (it does: traffic.peds).
import { atJam } from './jam.js'
import { clamp, wrapPi } from './constants.js'
import { kerbDist } from './street.js'
import { LINES, ringOf, sameOn } from './pavement.js'
import { N, PITCH, HALF, ROAD_HW, BLOCKS, superOf } from './city.js'

const KERB = ROAD_HW + 0.5
const STILL = ['phone', 'wait', 'chat'] // what someone standing about is doing

export const CROWD = {
  // who they are: build, pace, and whether they jog
  character (p) {
    const R = this.R,
      k = p.look
    p.tall = 0.9 + ((k * 7.13) % 1) * 0.18
    p.wide = p.tall * (0.92 + ((k * 3.7) % 1) * 0.16)
    p.jog = R() < 0.07
    p.v = p.jog
      ? 2.5 + R() * 0.8
      : R() < 0.14
      ? 0.85 + R() * 0.25 // (taking their time)
      : 1.15 + R() * 0.45
    p.v0 = p.v
    p.head = p.headT = 0 // head turned from the body, rad
    p.act = 0 // standing about: 1 on the phone, 2 chatting
    p.lead = null // walking with someone: them
    p.side = 0 // m in from their line (a pair walks side by side)
    this.steerInit(p) // (pedSteer.js)
  },
  // A companion for p, walking beside them (or, standing, facing them for a chat): on the middle
  // line, with the companion inside them, where two side by side are clear of the palms, the
  // benches and the shopfronts
  pairUp (p) {
    if (p.ring.d !== LINES[1]) this.inward(p, 1)
    const q = this.spawnAt(p.ring, p.s, p.dir)
    if (!q) return
    q.lead = p
    p.mate = q
    q.v = q.v0 = p.v
    q.jog = p.jog
    q.side = 0.62
    if (p.state === 'idle') {
      q.state = 'idle'
      q.act = p.act = 2
      q.idleT = p.idleT
    }
    this.place(q)
    if (p.state === 'idle') {
      // face each other
      const a = Math.atan2(-(p.z - q.z), p.x - q.x)
      p.yaw = a + Math.PI
      q.yaw = a
    }
  },
  // over to line k at the same place along the pavement
  inward (p, k) {
    const h = ringOf(p.ring.b, k)
    p.s = sameOn(p.ring, p.s, h)
    p.ring = h
    p.piece = this.place(p)
  },
  // standing about for a while: on the phone, waiting, chatting with someone
  idle (p, dt) {
    p.gait += (0 - p.gait) * Math.min(1, dt * 4)
    if ((p.idleT -= dt) > 0) return
    p.state = 'walk'
    p.act = 0
    if (p.lead) p.lead.act = 0
  },
  // keeping up with the one they walk with
  follow (p) {
    const o = p.lead
    if (!o || o.gone || o.ring !== p.ring || o.state !== 'walk') {
      if (o && (o.gone || o.state === 'flee' || o.state === 'dodge'))
        p.lead = null
      return false
    }
    // (parted a while: they go their own ways)
    if (Math.abs(o.s - p.s) > 3) {
      p.lead = null
      return false
    }
    p.s = o.s - o.dir * 0.15
    p.dir = o.dir
    p.v = o.v
    return true
  },

  // the Roadster close by and loud (fast, or on the horn): heads turn to follow it
  watch (p, dt, me) {
    let want = 0
    if (me && p.state !== 'dodge' && p.state !== 'flee') {
      const dx = me.x - p.x,
        dz = me.z - p.z
      if (dx * dx + dz * dz < 900)
        want = clamp(wrapPi(Math.atan2(-dz, dx) - p.yaw), -1.3, 1.3)
      // (standing, they turn to it)
      if (want && p.state === 'idle' && Math.abs(want) > 0.9)
        p.yaw += Math.sign(want) * Math.min(Math.abs(want) - 0.9, dt * 1.5)
    }
    p.headT = want || p.glance // (or a look round: pedSteer.js)
    p.head += (p.headT - p.head) * Math.min(1, dt * 5)
  },

  // Fright: everyone within r of (x, z) not already running flees along the pavement away from it,
  // those crossing the road hurry over.
  scare (x, z, r) {
    this.panicX = x
    this.panicZ = z
    for (const p of this.list) {
      const dx = p.x - x,
        dz = p.z - z
      if (dx * dx + dz * dz > r * r) continue
      if (p.state === 'cross') {
        p.hurry = 2.6
        continue
      }
      if (p.state === 'dodge' || p.state === 'back' || p.state === 'down' || p.state === 'brawl') continue
      if (p.state === 'kerb' || p.state === 'wait') this.join(p, p.ring.b)
      if (p.state === 'linger') this.leave(p, true) // (off on their line)
      if (p.state !== 'flee') this.scream++
      p.state = 'flee'
      p.lead = null
      p.act = 0
      p.fleeT = 4 + this.R() * 4
      p.v = 3.6 + this.R() * 1.6
      p.fright = 0.8
      // which way round the block is away from it
      const P = this.P
      this.at(p, P)
      p.dir = P.hx * dx + P.hz * dz >= 0 ? 1 : -1
    }
  },
  // What scares people: the Roadster on the pavement at speed, a crash, a landing, a hard knock
  // (sim events: bumps, cars knocked into each other, posts snapped), all once each.
  // Crashes in traffic come in traffic.heard: they happen after the people's step, and the frame's
  // sim events are cleared before the next.
  alarms (sim, me, traffic) {
    this.scream = 0
    const mode = sim.mode
    if (me) {
      const onWalk = kerbDist(me.x, me.z) < -0.6
      if (mode === 'ground' && Math.abs(sim.speed) > 4 && onWalk)
        this.scare(me.x, me.z, 16)
      // (down in the street, not on a roof)
      if (this.wasAir && mode === 'ground' && me.y < 1) this.scare(me.x, me.z, 28)
    }
    if (mode === 'crash' && this.lastMode !== 'crash') {
      const c = sim.com
      this.scare(c.x, c.z, 40)
    }
    this.wasAir = mode === 'air'
    this.lastMode = mode
    for (const e of sim.events) {
      if (e.peds) continue
      e.peds = true
      if (e.type === 'bump' && e.impact > 5 && me) this.scare(me.x, me.z, 22)
      else if (e.type === 'clash' || e.type === 'knock')
        this.scare(e.x, e.z, 20)
    }
    const heard = traffic.heard
    for (let i = 0; i < heard.length; i++)
      this.scare(heard[i].x, heard[i].z, heard[i].r)
    heard.length = 0
    let n = 0
    for (const p of this.list) if (p.state === 'flee' || p.hurry > 0) n++
    this.panic = n
  },
  // running away along the pavement, then calming down
  flee (p, dt) {
    p.gait += (1.6 - p.gait) * Math.min(1, dt * 4)
    p.fright = Math.max(p.fright, 0.35)
    p.s += p.dir * p.v * dt
    p.sway += dt * 0.7
    p.piece = this.place(p)
    if ((p.fleeT -= dt) > 0) return
    p.state = 'walk'
    p.v = p.v0 * 1.15
  },

  // Over the street from here, not at a crossing: on a straight stretch, away from the corners, not
  // over the jammed street, and only with no traffic coming within a few seconds either way.
  jaywalk (p) {
    if (p.piece % 2 || p.jog || p.lead || p.dog) return false
    const P = this.P
    this.at(p, P)
    // the street beside this stretch of pavement, and the far side of it
    const ox = -P.hz,
      oz = P.hx // into the block; the street is the other way
    const out = 1.5 - kerbDist(p.x, p.z) // (to just out in the road)
    const sx = p.x - ox * out,
      sz = p.z - oz * out
    const along = ox !== 0 ? 1 : 0 // 1: the street runs along z (its centre at x = c)
    const c = Math.round((along ? sx : sz) / PITCH) * PITCH
    if (Math.abs(c) > HALF - 1) return false
    const u = along ? p.z : p.x
    if (Math.abs(u - Math.round(u / PITCH) * PITCH) < 22) return false
    if (atJam(along ? c : u, along ? u : c)) return false
    const side = Math.sign((along ? p.x : p.z) - c)
    for (const car of this.traffic.cars) {
      if (car.parked && !car.loose) continue
      const across = (along ? car.x : car.z) - c,
        d = (along ? car.z : car.x) - u
      if (Math.abs(across) > ROAD_HW + 2 || Math.abs(d) > 70) continue
      if (Math.abs(d) < 12 + car.v * 4.5) return false
    }
    const from = along ? [c + side * KERB, u] : [u, c + side * KERB]
    const to = along ? [c - side * KERB, u] : [u, c - side * KERB]
    const bx = clamp(Math.floor((to[0] + HALF) / PITCH), 0, N - 1),
      bz = clamp(Math.floor((to[1] + HALF) / PITCH), 0, N - 1)
    const block = BLOCKS[bz * N + bx]
    if (superOf(bx, bz)) return false // (pavement.js crossings: not into a superblock)
    p.cross = { node: null, axis: along, from, to, block, j: 0 }
    p.state = 'cross'
    p.jay = true
    p.stall = 0
    p.near = Infinity
    return true
  },
  // Someone new standing about where they spawned (chatting with one or two), or walking off with a
  // friend; or (from the second stream, peds.js Q) with a dog, or sat on a bench nearby out of the
  // camera's sight (view)
  extras (p, view) {
    const R = this.R
    if (!p.jog && R() < 0.13) {
      p.state = 'idle'
      p.act = STILL[Math.floor(R() * 2)] === 'phone' ? 1 : 0 // (on the phone, or waiting)
      p.idleT = 6 + R() * 40
      if (R() < 0.35) {
        this.pairUp(p)
        if (this.Q() < 0.3) this.third(p)
      }
    } else if (R() < 0.16) this.pairUp(p)
    else if (p.jog) return
    else if (this.Q() < 0.05) this.adopt(p)
    else if (this.Q() < 0.07) this.settle(p, p.ring.b, view)
  },

  // Out of the way of whatever is coming (th): anyone near its path in the next second and a half
  // dives clear, sideways, away from it; and nobody stays under it.
  dodge (p, th) {
    const dx = p.x - th.x,
      dz = p.z - th.z
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40) return
    // under the car already: out by the nearer side
    const along = dx * th.hx + dz * th.hz,
      side = dz * th.hx - dx * th.hz
    if (Math.abs(along) < th.hl + 0.35 && Math.abs(side) < th.hw + 0.35) {
      const out = (th.hw + 0.4) * (side >= 0 ? 1 : -1) - side
      p.x -= th.hz * out
      p.z += th.hx * out
    }
    const sp = Math.sqrt(th.vx * th.vx + th.vz * th.vz)
    if (sp < 1.5 || p.state === 'dodge') return
    const a = (dx * th.vx + dz * th.vz) / sp,
      l = (dz * th.vx - dx * th.vz) / sp
    if (a < -th.hl || a > th.hl + sp * 1.5 + 1.5) return
    if (Math.abs(l) > th.hw + 1.1) return
    // away from its line, sideways to the way it is going, quicker the closer it is
    const sg = Math.abs(l) > 0.15 ? Math.sign(l) : this.R() < 0.5 ? 1 : -1
    const v = a < th.hl + 4 ? 7 : 5
    p.vx = (-th.vz / sp) * sg * v
    p.vz = (th.vx / sp) * sg * v
    if (p.state === 'linger') this.leave(p, true) // (up off a bench at once)
    p.state = 'dodge'
    p.t = 0
    p.hop = 0.35
    p.fright = 1
    p.gait = 1.6
    p.cross = p.aside = null
    p.lead = null
    p.act = 0
  },
  // Round a car stopped on the crossing (one caught in the junction, or turning and waiting for
  // them): anyone who would walk into it stays at its edge, and so steps round it.
  clear (p, cars) {
    for (const c of cars) {
      const dx = p.x - c.x,
        dz = p.z - c.z
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || c.y > 2) continue // (not one up on the freeway)
      const along = dx * c.hx + dz * c.hz,
        side = dz * c.hx - dx * c.hz
      const ea = c.len / 2 + 0.35 - Math.abs(along),
        es = c.wid / 2 + 0.35 - Math.abs(side)
      if (ea <= 0 || es <= 0) continue
      // crossing, they take a line round it, past whichever of its ends is nearer, stepping aside
      // out to it first
      if (p.state === 'cross' && !p.aside) {
        const ax = p.cross.axis,
          base = p.cross.from[ax === 1 ? 1 : 0],
          mid = ax === 1 ? c.z : c.x,
          here = ax === 1 ? p.z : p.x
        const ext =
          (c.len / 2) * Math.abs(ax === 1 ? c.hz : c.hx) +
          (c.wid / 2) * Math.abs(ax === 1 ? c.hx : c.hz) +
          0.55
        const way = here < mid ? mid - ext : mid + ext
        p.cross.j = way - base
        p.aside = ax === 1 ? [p.x, way] : [way, p.z]
        p.near = Infinity
        p.stall = 0
      }
      // out by the nearer side
      if (ea < es) {
        const k = ea * Math.sign(along || 1)
        p.x += c.hx * k
        p.z += c.hz * k
      } else {
        const k = es * Math.sign(side || 1)
        p.x -= c.hz * k
        p.z += c.hx * k
      }
    }
  },
  // Nothing on the crossing c, or about to be: no car within a car's length of its stripes.
  clearOver (c) {
    const ax = c.axis,
      line = c.from[ax === 1 ? 1 : 0],
      mid = ax === 1 ? c.node.x : c.node.z
    for (const o of this.traffic.cars) {
      if (o.parked && !o.jam) continue
      const across = ax === 1 ? o.x : o.z,
        along = ax === 1 ? o.z : o.x
      if (Math.abs(across - mid) > ROAD_HW + 1) continue
      if (Math.abs(along - line) < o.len / 2 + 2.5) return false
    }
    return true
  }
}
