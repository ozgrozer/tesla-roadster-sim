// What a traffic driver sees, mixed into Traffic (traffic.js): the car ahead in its path, the
// Roadster or a knocked or crossing car in the way, the oncoming traffic a left turn would cut, and
// whether there is room beyond a junction to pull into it.
import { DIRS, pointAt } from './city.js'

export const LOOK = 70 // m a driver watches ahead
export const STOP_DECEL = 4 // on yellow, go if stopping would need more than this

// the room a driver leaves to either side of their path (less, squeezing by: Traffic.margin)
let MARGIN = 0.5
// Scratch objects passed around instead of numbers: a number passed to or returned from a function
// V8 hasn't inlined costs an allocation, and these run for every car and every obstacle each step.
// RAY: a straight from (x0, z0) heading (hx, hz), starting `ahead` m in front of the car's centre,
// looked along for `reach` m; sc: the car's centre along a turn (negative while still short of it).
// OUT.g: what rayGap and arcGap find, the gap from the car's nose to the obstacle, or Infinity.
const RAY = { x0: 0.5, z0: 0.5, hx: 0.5, hz: 0.5, ahead: 0.5, reach: 0.5, sc: 0.5 }
const OUT = { g: 0.5 }
// (an obstacle: its centre, velocity, heading and half length and width; drivers.js fills it)
export const OB = { x: 0.5, z: 0.5, vx: 0.5, vz: 0.5, hx: 0.5, hz: 0.5, hl: 0.5, hw: 0.5 }
const P = { x: 0, z: 0, hx: 1, hz: 0 }
const NONE = []

// Along the straight RAY: the obstacle ob in the way?
function rayGap (car, r, ob) {
  OUT.g = Infinity
  const dx = ob.x - r.x0,
    dz = ob.z - r.z0
  const along = dx * r.hx + dz * r.hz
  if (along > r.reach) return
  const cos = Math.abs(ob.hx * r.hx + ob.hz * r.hz),
    sin = Math.abs(ob.hx * r.hz - ob.hz * r.hx)
  const across = ob.hl * sin + ob.hw * cos,
    deep = ob.hl * cos + ob.hw * sin
  // (any of it ahead of the car's middle counts: a car crossing at an angle beside it can still
  // reach across its path)
  if (along + r.ahead + deep <= 0) return
  if (Math.abs(dz * r.hx - dx * r.hz) > car.wid / 2 + MARGIN + across) return
  OUT.g = r.ahead + along - car.len / 2 - deep
}
// Round the turn a (the car's centre RAY.sc along it): the obstacle ob on it?
function arcGap (car, a, ob) {
  OUT.g = Infinity
  const rx = ob.x - a.cx,
    rz = ob.z - a.cz,
    rho = Math.sqrt(rx * rx + rz * rz) || 1e-6
  const ux = rx / rho,
    uz = rz / rho
  const cr = Math.abs(ob.hx * ux + ob.hz * uz),
    sr = Math.abs(ob.hx * uz - ob.hz * ux)
  const across = ob.hl * cr + ob.hw * sr,
    deep = ob.hl * sr + ob.hw * cr
  // (the front corner on the outside swings wider than the car's middle: by most for a bus)
  const R = a.r + car.wid / 2,
    sweep = Math.sqrt(R * R + car.len * car.len * 0.25) - R
  const side = rho - a.r,
    room = car.wid / 2 + MARGIN + across
  if (side > room + sweep || -side > room) return
  let u = Math.atan2(rz, rx) - a.a0
  u -= Math.round(u / (2 * Math.PI)) * 2 * Math.PI
  const so = a.sg * u * a.r,
    sc = RAY.sc
  if (so + deep <= sc || so > a.len + deep) return
  OUT.g = so - sc - car.len / 2 - deep
}

export const SIGHT = {
  // Gap to whatever is ahead in this car's path (bumper to bumper) and its speed (in this.vl), and
  // which car that is (this.lead; this.ahead too, if it is in the same lane).
  leader (car) {
    const e = car.edge,
      list = e.cars,
      i = list.indexOf(car)
    this.vl = 0
    this.ahead = this.lead = null
    if (i >= 0 && i < list.length - 1) {
      const o = list[i + 1]
      this.vl = o.v
      this.ahead = this.lead = o
      return o.s - car.s - (o.len + car.len) / 2
    }
    const n1 = car.next
    if (!n1) return Infinity
    let dist = e.len - car.s - car.len / 2,
      best = Infinity
    // a car just turning off this lane onto another branch still blocks the mouth of the junction
    for (const sib of e.next)
      if (sib !== n1 && sib.cars.length) {
        const o = sib.cars[0],
          g = dist + o.s - o.len / 2
        if (o.s < o.len + 1 && g < best) {
          best = g
          this.vl = o.v * 0.5
          this.lead = o
        }
      }
    if (n1.cars.length) {
      const o = n1.cars[0],
        g = dist + o.s - o.len / 2
      if (g < best) {
        best = g
        this.vl = o.v
        this.lead = o
      }
      return best
    }
    dist += n1.len
    if (dist < LOOK && n1.next.length === 1 && n1.next[0].cars.length) {
      const o = n1.next[0].cars[0],
        g = dist + o.s - o.len / 2
      if (g < best) {
        best = g
        this.vl = o.v
        this.lead = o
      }
    }
    return best
  },
  // The Roadster, a car knocked out of its lane or one crossing a junction, in this car's path. The
  // obstacle's whole footprint counts (ob: OB, filled in by the caller; o: what it is): a long car
  // crossing at an angle blocks the lane with its tail as much as with its middle. The path is the
  // one the car will drive: straight on down its lane, or round the turn it is on or coming up to,
  // and on along the lane it turns into. If it is nearer than whatever this.seen holds, it goes in
  // there: the gap, its speed along the car's way, and what it is.
  obstacle (car, ob, o) {
    const dx = ob.x - car.x,
      dz = ob.z - car.z
    if (dx > LOOK || dx < -LOOK || dz > LOOK || dz < -LOOK) return
    MARGIN = this.margin
    const e = car.edge
    if (e.kind === 1) {
      RAY.sc = car.s
      arcGap(car, e, ob)
      if (OUT.g === Infinity) {
        const n = e.next[0]
        RAY.x0 = n.x0
        RAY.z0 = n.z0
        RAY.hx = n.dx
        RAY.hz = n.dz
        RAY.ahead = e.len - car.s
        RAY.reach = LOOK
        rayGap(car, RAY, ob)
      }
    } else {
      const toEnd = e.len - car.s,
        turn = car.next?.kind === 1 && toEnd < 30 ? car.next : null
      RAY.x0 = car.x
      RAY.z0 = car.z
      RAY.hx = car.hx
      RAY.hz = car.hz
      RAY.ahead = 0
      RAY.reach = turn ? toEnd + 1.5 : LOOK
      rayGap(car, RAY, ob)
      if (OUT.g === Infinity && turn) {
        RAY.sc = -toEnd
        arcGap(car, turn, ob)
      }
    }
    const W = this.seen
    if (OUT.g >= W.gap) return
    W.gap = OUT.g
    W.vl = Math.max(0, ob.vx * car.hx + ob.vz * car.hz)
    W.blk = o
  },
  // Is anything coming the other way that a left turn into `node` would cut across, within the gap
  // (s) this driver takes? On a yellow (changing), only what is going on through it: the rest will
  // be stopping.
  oncoming (node, dir, changing = false, gapT = 4.5) {
    const lanes = node.inc[(dir + 2) % 4]
    if (!lanes) return false
    for (const L of lanes) {
      for (const c of L.next)
        if (c.move !== 'L' && c.cars.length && c.cars[0].s < c.len - 2)
          return true
      const list = L.cars
      for (let i = list.length - 1; i >= Math.max(0, list.length - 3); i--) {
        const o = list[i],
          d = L.len - o.s - o.len / 2
        if (d > 60) break
        // at the line, or would reach it within the four and a half seconds or so a turn across
        // takes (a longer gap than that hardly ever comes in busy traffic, and the turn waited out
        // green after green)
        if (o.next?.move === 'L') continue
        if (
          changing &&
          o.go !== L &&
          o.v * o.v < 2 * STOP_DECEL * Math.max(0, d - 0.5)
        )
          continue
        if (d < 6 || d < o.v * gapT) return true
      }
    }
    return this.meComing(node, dir)
  },
  // Room to get out of the junction on the far side: the lane the car's turn leads onto has space at
  // its start for it, after whoever is already crossing to it (or its traffic is moving).
  room (car) {
    const out = car.next.next[0]
    if (!out || out.closed) return true
    let free = out.len
    const last = out.cars[0]
    if (last) free = last.s - last.len / 2 + last.v * 1.5
    for (const f of out.feeds)
      for (const o of f.cars) if (o !== car) free -= o.len + 2
    return free > car.len + 2
  },
  // the Roadster coming the other way (it isn't in the lanes' lists): on that road, heading for the
  // junction, and there within the same four and a half seconds
  meComing (node, dir) {
    const me = this.me
    if (!me) return false
    const [ux, uz] = DIRS[(dir + 2) % 4]
    const v = this.mev.x * ux + this.mev.z * uz
    if (v < 1) return false
    const ahead = (node.x - me.x) * ux + (node.z - me.z) * uz,
      off = Math.abs((node.z - me.z) * ux - (node.x - me.x) * uz)
    return off < 9 && ahead > -6 && ahead < 14 + v * 4.5
  },
  // room to pull into lane t beside the car: a safe gap to the cars there, nothing stopped in the way
  // (the Roadster's own autopilot asks with skipMe, as the Roadster is the one pulling over)
  canMerge (t, car, skipMe = false) {
    for (const o of t.cars) {
      const d = o.s - car.s,
        need = (o.len + car.len) / 2 + 3
      if (d >= 0 && d < need + Math.max(0, car.v - o.v) * 2) return false
      if (d < 0 && -d < need + Math.max(0, o.v - car.v) * 2 + o.v * 0.6)
        return false
    }
    // (and anyone still on their way over from lane t into this one)
    for (const o of car.edge?.cars || NONE)
      if (
        o.lc &&
        o.from === t &&
        Math.abs(o.s - car.s) < (o.len + car.len) / 2 + 6
      )
        return false
    // a wreck reaching into lane t, near where the car would pull in (one in its own lane, say
    // the one it is going round, doesn't count)
    pointAt(t, car.s, P)
    let hw = (car.wid || 2) / 2 - 0.4 // (edged round: react.js roomRound)
    for (const o of this.loose) {
      const dx = o.x - P.x,
        dz = o.z - P.z
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue
      const d = dx * P.hx + dz * P.hz,
        cos = Math.abs(o.hx * P.hx + o.hz * P.hz),
        sin = Math.abs(o.hx * P.hz - o.hz * P.hx)
      const across = (o.len / 2) * sin + (o.wid / 2) * cos,
        deep = (o.len / 2) * cos + (o.wid / 2) * sin
      if (Math.abs(dz * P.hx - dx * P.hz) - across > hw) continue
      if (d + deep > -car.len / 2 - 3 && d - deep < car.len / 2 + 6 + car.v * 2)
        return false
    }
    // the Roadster in that lane, or on its way over into it, as if it were one of that lane's cars
    // (not in this lane: that may be just what the car is pulling out to get round)
    const me = !skipMe && this.me
    hw += 0.9
    if (me) {
      const dx = me.x - P.x,
        dz = me.z - P.z,
        d = dx * P.hx + dz * P.hz,
        side = dz * P.hx - dx * P.hz,
        drift = this.mev.z * P.hx - this.mev.x * P.hz,
        across =
          2.22 * Math.abs(this.mhx * P.hz - this.mhz * P.hx) +
          0.99 * Math.abs(this.mhx * P.hx + this.mhz * P.hz)
      const over =
        Math.abs(side) - across < hw ||
        (Math.abs(side) < 5.5 && side * drift < -0.3)
      if (over && Math.abs(d) < 60) {
        const mv = Math.max(0, this.mev.x * P.hx + this.mev.z * P.hz),
          need = car.len / 2 + 2.2 + 3
        if (d >= 0 && d < need + Math.max(0, car.v - mv) * 2) return false
        if (d < 0 && -d < need + Math.max(0, mv - car.v) * 2.5 + mv * 0.8)
          return false
      }
    }
    return true
  }
}
