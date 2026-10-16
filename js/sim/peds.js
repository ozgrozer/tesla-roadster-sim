// People on foot: they walk the pavements round the blocks, keeping to a line a metre or three in
// from the kerb, and at each corner some of them cross: they step to the kerb by the crosswalk, wait
// for the walk (the first few seconds of the cross street's green, when the street they cross has
// red, so they are over before it changes) and cross on the stripes to the next block. Traffic and
// Autopilot stop for anyone in the road (traffic.peds). Anyone in the Roadster's way (or a car's it
// sent sliding) dives clear, then walks back to the pavement; nobody is ever left under the car.
// They live in a bubble round the player, like the traffic: those left far behind turn up ahead.
import { kerbDist } from './street.js'
import { CAR, clamp } from './constants.js'
import {
  N,
  rng,
  HALF,
  PITCH,
  CYCLE,
  BLOCKS,
  CURB_R,
  ROAD_HW,
  nodeAt
} from './city.js'

const CROSS_AT = 9.1 // the crosswalk's middle, from the junction's centre (cityGround.js)
const KERB = ROAD_HW + 0.5 // where people wait and step off, from the road's centre line
const WALK_FOR = 4 // s into the cross street's green during which people start over

// A block's pavement ring at d in from the kerb: a rounded rectangle, its corners' radius and the
// straight runs between them. Laid out from one end of its top edge, round the four corners (0: the
// corner at x1, z0, then x1 z1, x0 z1 and x0 z0).
function ring (b, d) {
  const r = Math.max(0.6, CURB_R - d),
    x0 = b.x0 + d,
    x1 = b.x1 - d,
    z0 = b.z0 + d,
    z1 = b.z1 - d
  const w = x1 - x0 - 2 * r,
    h = z1 - z0 - 2 * r,
    arc = (Math.PI / 2) * r
  return {
    b,
    r,
    len: 2 * (w + h) + 4 * arc,
    runs: [w, arc, h, arc, w, arc, h, arc],
    // each straight's start and direction, each corner's centre and starting angle
    edges: [
      [x0 + r, z0, 1, 0],
      [x1, z0 + r, 0, 1],
      [x1 - r, z1, -1, 0],
      [x0, z1 - r, 0, -1]
    ],
    arcs: [
      [x1 - r, z0 + r, -Math.PI / 2],
      [x1 - r, z1 - r, 0],
      [x0 + r, z1 - r, Math.PI / 2],
      [x0 + r, z0 + r, Math.PI]
    ]
  }
}
// the point s along a ring, its heading, and which piece of it that is (odd: a corner)
export function ringAt (R, s, out) {
  let u = ((s % R.len) + R.len) % R.len,
    k = 0
  while (k < 7 && u > R.runs[k]) u -= R.runs[k++]
  out.piece = k
  if (k % 2 === 0) {
    const [sx, sz, dx, dz] = R.edges[k / 2]
    out.x = sx + dx * u
    out.z = sz + dz * u
    out.hx = dx
    out.hz = dz
  } else {
    const [cx, cz, a0] = R.arcs[(k - 1) / 2],
      a = a0 + u / R.r
    out.x = cx + R.r * Math.cos(a)
    out.z = cz + R.r * Math.sin(a)
    out.hx = -Math.sin(a)
    out.hz = Math.cos(a)
  }
  return out
}
// the s on a ring nearest (x, z), by stepping round it (a metre at a time, then refining)
function nearestOn (R, x, z) {
  const P = {}
  let best = 0,
    bd = Infinity
  for (let s = 0; s < R.len; s += 1) {
    ringAt(R, s, P)
    const d = (P.x - x) ** 2 + (P.z - z) ** 2
    if (d < bd) {
      bd = d
      best = s
    }
  }
  for (let s = best - 1; s < best + 1; s += 0.1) {
    ringAt(R, s, P)
    const d = (P.x - x) ** 2 + (P.z - z) ** 2
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}
// the block (x, z) is on or nearest, by the grid
function blockNear (x, z) {
  const bx = clamp(Math.floor((x + HALF) / PITCH), 0, N - 1),
    bz = clamp(Math.floor((z + HALF) / PITCH), 0, N - 1)
  return BLOCKS[bz * N + bx]
}
// Is it time to walk across the street at node that runs along axis (0 east-west, 1 north-south)?
// Its traffic has red, and the cross street's green is in its first few seconds. (Not while the
// light is held for Autopilot: its timings are its own then.)
export function walkOn (node, axis, t) {
  if (node.hold) return false
  const u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  const into = u - ((axis ^ 1) * CYCLE) / 2
  return into >= 0 && into < WALK_FOR
}
// The two crossings from a block's corner k (as ringAt numbers them): for each, the way over (from,
// to), the street's axis, the junction and the block on the other side.
function crossings (b, k) {
  const corner = [
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
    [b.x0, b.z0]
  ][k]
  const ix = b.bx + (corner[0] === b.x1 ? 1 : 0),
    iz = b.bz + (corner[1] === b.z1 ? 1 : 0)
  const node = nodeAt(ix, iz)
  const qx = corner[0] === b.x0 ? 1 : -1, // the block's side of the junction
    qz = corner[1] === b.z0 ? 1 : -1
  const out = []
  const tx = b.bx - qx,
    tz = b.bz - qz
  // over the street that runs along z, on the block's side of the junction
  if (tx >= 0 && tx < N)
    out.push({
      node,
      axis: 1,
      from: [node.x + qx * KERB, node.z + qz * CROSS_AT],
      to: [node.x - qx * KERB, node.z + qz * CROSS_AT],
      block: BLOCKS[b.bz * N + tx]
    })
  // and over the one along x
  if (tz >= 0 && tz < N)
    out.push({
      node,
      axis: 0,
      from: [node.x + qx * CROSS_AT, node.z + qz * KERB],
      to: [node.x + qx * CROSS_AT, node.z - qz * KERB],
      block: BLOCKS[tz * N + b.bx]
    })
  return out
}

// clear of the street lights (0.6 m in), the palms (1.6) and the signal masts (2.2)
const LINES = [1.05, 2.75, 3.15]
const P = { x: 0, z: 0, hx: 1, hz: 0, piece: 0 }

export class Peds {
  constructor ({ count = 240, radius = 150, seed = 11 } = {}) {
    Object.assign(this, { count, radius })
    this.R = rng(seed)
    this.list = []
    this.onRoad = [] // in the road just now: what traffic and Autopilot look out for
    this.clock = 0
  }
  reset (x, z) {
    this.list.length = 0
    for (let i = 0; i < this.count * 4 && this.list.length < this.count; i++)
      this.spawn(x, z, 0, this.radius)
  }
  // someone on a block's pavement between rMin and rMax from (x, z), out of the view's sight
  spawn (x, z, rMin, rMax, view) {
    const R = this.R
    for (let tries = 0; tries < 20; tries++) {
      const b = BLOCKS[Math.floor(R() * BLOCKS.length)]
      const g = ring(b, LINES[Math.floor(R() * LINES.length)] + (R() - 0.5) * 0.2)
      const s = R() * g.len
      ringAt(g, s, P)
      const d = Math.hypot(P.x - x, P.z - z)
      if (d < rMin || d > rMax) continue
      // (never popping up in sight: only behind the camera, or far off)
      const ahead =
        view && (P.x - view.x) * view.fx + (P.z - view.z) * view.fz > 0
      if (ahead && d < 120) continue
      const p = {
        ring: g,
        s,
        dir: R() < 0.5 ? 1 : -1,
        v: 1.1 + R() * 0.5,
        state: 'walk',
        x: P.x,
        z: P.z,
        yaw: 0,
        phase: R() * 6.3,
        gait: 1, // stride, 0 standing to 1.6 running
        fright: 0, // arms up as they dive
        hop: 0,
        t: 0,
        piece: P.piece,
        look: R(), // their clothes and build, for the renderer
        sway: R() * 6.3
      }
      this.place(p)
      this.list.push(p)
      return p
    }
    return null
  }
  place (p) {
    ringAt(p.ring, p.s, P)
    // drifting a little from side to side as they walk
    const o = 0.12 * Math.sin(p.sway)
    p.x = P.x - P.hz * o * p.dir
    p.z = P.z + P.hx * o * p.dir
    p.yaw = Math.atan2(-P.hz * p.dir, P.hx * p.dir)
    return P.piece
  }
  // head for (x, z) at speed v; true once there
  toward (p, x, z, v, dt) {
    const dx = x - p.x,
      dz = z - p.z,
      d = Math.hypot(dx, dz)
    p.yaw = Math.atan2(-dz, dx)
    if (d <= v * dt) {
      p.x = x
      p.z = z
      return true
    }
    p.x += (dx / d) * v * dt
    p.z += (dz / d) * v * dt
    return false
  }

  // threats: the Roadster and anything it sent sliding, as { x, z, vx, vz, hx, hz, hl, hw }
  step (dt, sim, traffic, view) {
    this.clock += dt
    this.traffic = traffic
    const t = traffic.t
    const threats = []
    const pl = sim.mode === 'ground' ? sim.pos : sim.com
    if (sim.mode !== 'ramp' && pl.y - (sim.floor || 0) < 2.5)
      threats.push({
        x: pl.x,
        z: pl.z,
        vx: sim.vel.x,
        vz: sim.vel.z,
        hx: Math.cos(sim.yaw),
        hz: -Math.sin(sim.yaw),
        hl: CAR.halfL,
        hw: CAR.halfW
      })
    for (const c of traffic.loose)
      if (Math.hypot(c.vx, c.vz) > 2) {
        const { x, z, vx, vz, hx, hz } = c
        threats.push({
          x,
          z,
          vx,
          vz,
          hx,
          hz,
          hl: c.len / 2,
          hw: c.wid / 2
        })
      }
    this.onRoad.length = 0
    for (const p of this.list) {
      this.move(p, dt, t)
      for (const th of threats) this.dodge(p, th)
      if (p.state !== 'walk' && kerbDist(p.x, p.z) > -0.2) {
        this.onRoad.push(p)
        this.clear(p, traffic.cars)
      }
    }
    traffic.peds = this.onRoad
    if (this.clock > 0.5) {
      this.clock = 0
      this.recycle(pl.x, pl.z, view)
    }
  }
  move (p, dt, t) {
    p.t += dt
    p.hop = Math.max(0, p.hop - dt * 1.5)
    p.fright = Math.max(0, p.fright - dt * 1.2)
    const R = this.R
    if (p.state === 'walk') {
      p.gait += (1 - p.gait) * Math.min(1, dt * 3)
      p.s += p.dir * p.v * dt
      p.sway += dt * 0.7
      const piece = this.place(p)
      // round a corner: now and then over the road instead
      if (piece !== p.piece && piece % 2 === 1 && R() < 0.4) {
        const opts = crossings(p.ring.b, (piece - 1) / 2)
        if (opts.length) {
          // (each keeps to their own line along the stripes)
          const pick = opts[Math.floor(R() * opts.length)]
          p.cross = { ...pick, j: (R() - 0.5) * 1.6 }
          p.state = 'kerb'
        }
      }
      p.piece = piece
    } else if (p.state === 'kerb') {
      const [fx, fz] = this.jitter(p.cross, p.cross.from)
      if (this.toward(p, fx, fz, p.v, dt)) {
        p.state = 'wait'
        p.t = 0
        p.turned = false
      }
    } else if (p.state === 'wait') {
      p.gait += (0 - p.gait) * Math.min(1, dt * 4)
      const [tx, tz] = this.jitter(p.cross, p.cross.to)
      p.yaw = Math.atan2(-(tz - p.z), tx - p.x)
      // over on the walk, once nothing is on the crossing or right at it
      if (walkOn(p.cross.node, p.cross.axis, t) && this.clearOver(p.cross)) {
        p.state = 'cross'
        p.stall = 0
        p.near = Infinity
      }
      // (given up on a light held for Autopilot: on round the block instead)
      else if (p.t > 45) this.join(p, p.ring.b)
    } else if (p.state === 'cross') {
      p.gait += (1.05 - p.gait) * Math.min(1, dt * 3)
      // (round a car in the way: first a step aside, out to a line clear of it)
      if (p.aside) {
        const d = Math.hypot(p.aside[0] - p.x, p.aside[1] - p.z)
        if (d < p.near - 0.2) {
          p.near = d
          p.stall = 0
        }
        // (a step aside that gets nowhere is given up after a moment)
        if (
          this.toward(p, p.aside[0], p.aside[1], p.v, dt) ||
          (p.stall += dt) > 1.5
        ) {
          p.aside = null
          p.near = Infinity
        }
      } else {
        const [tx, tz] = this.jitter(p.cross, p.cross.to)
        if (this.toward(p, tx, tz, p.v * 1.08, dt)) this.join(p, p.cross.block)
        else {
          // getting nowhere (a car stopped across them, waiting for them to pass): back to the
          // kerb they came from, to wait for the next walk; and if even that is blocked, over
          const d = Math.hypot(tx - p.x, tz - p.z)
          if (d < p.near - 0.3) {
            p.near = d
            p.stall = 0
          } else if ((p.stall += dt) > 8) {
            p.x = tx
            p.z = tz
            this.join(p, p.cross.block)
          } else if (p.stall > 2.5 && !p.turned) {
            p.turned = true
            p.near = Infinity
            p.cross = {
              ...p.cross,
              from: p.cross.to,
              to: p.cross.from,
              block: p.ring.b
            }
          }
        }
      }
    } else if (p.state === 'dodge') {
      p.x += p.vx * dt
      p.z += p.vz * dt
      const k = Math.exp(-dt * 3)
      p.vx *= k
      p.vz *= k
      if (p.t > 0.7) {
        p.state = 'back'
        p.back = blockNear(p.x, p.z)
        const g = ring(p.back, LINES[Math.floor(R() * LINES.length)])
        p.backRing = g
        p.backS = nearestOn(g, p.x, p.z)
      }
    } else if (p.state === 'back') {
      // hurrying back to the pavement
      p.gait += (1.4 - p.gait) * Math.min(1, dt * 3)
      ringAt(p.backRing, p.backS, P)
      if (this.toward(p, P.x, P.z, 2.6, dt)) {
        p.ring = p.backRing
        p.s = p.backS
        p.state = 'walk'
        p.piece = this.place(p)
      }
    }
    // the stride: a step every 0.65 m or so at walking pace
    const speed = p.state === 'wait' ? 0 : p.state === 'back' ? 2.6 : p.v
    p.phase += (dt * speed * Math.PI * 2) / (1.3 * Math.max(0.6, p.gait))
  }
  // where along the stripes this one walks
  jitter (c, [x, z]) {
    return c.axis === 1 ? [x, z + c.j] : [x + c.j, z]
  }
  join (p, b) {
    const g = ring(b, LINES[Math.floor(this.R() * LINES.length)])
    p.ring = g
    p.s = nearestOn(g, p.x, p.z)
    p.state = 'walk'
    p.piece = this.place(p)
    p.cross = p.aside = null
  }
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
    const sp = Math.hypot(th.vx, th.vz)
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
    p.state = 'dodge'
    p.t = 0
    p.hop = 0.35
    p.fright = 1
    p.gait = 1.6
    p.cross = p.aside = null
  }
  // Round a car stopped on the crossing (one caught in the junction, or turning and waiting for
  // them): anyone who would walk into it stays at its edge, and so steps round it.
  clear (p, cars) {
    for (const c of cars) {
      const dx = p.x - c.x,
        dz = p.z - c.z
      if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue
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
  }
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
  // drop people far behind and fill in ahead
  recycle (x, z, view) {
    this.list = this.list.filter(
      p => Math.hypot(p.x - x, p.z - z) < this.radius + 40
    )
    for (let k = 0; k < 6 && this.list.length < this.count; k++)
      this.spawn(x, z, 100, this.radius, view)
  }
}
