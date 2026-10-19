// Lane changes on the freeway, mixed into Traffic (traffic.js) beside laneChange.js. The deck's
// lanes are separate edges (highway.js: the through lane, the inner lane beside it and the outer
// lane between the side ramps), each with its own start, so the city's twin-lane change can't be
// used as it is: here every long straight hw edge learns the parallel edges either side of it
// (SIDES: left, right, and how far along the other one the same spot is). On them drivers
//  - overtake: a slower car ahead and the lane to its left moving better, out they go (a bold one
//    passes on the right too, if that's where the room is),
//  - keep right: back out of the inner lane once by (an aggressive driver stays out longer), and
//    off the inner lane before it ends,
//  - merge: off the side ramp's outer lane into the through lane, unless leaving at the next ramp,
//    and over to the outer lane ahead of the next ramp when they mean to leave there,
//  - make way: honked at (yieldT) or with a car on a call behind, they move right.
// The indicator goes on first; once there is a safe gap (by time, at freeway speed) over it goes,
// over a longer stretch of road than in the city. Pure maths: no DOM.
import { EDGES, pointAt } from './city.js'

const MIN_LEN = 60 // m: a straight hw edge this long gets neighbours
const SIDE_MIN = 2.6, // m off to the side a neighbour lane's line is
  SIDE_MAX = 4.8
const LOOKF = 90 // m a driver looks ahead in its own lane for a slow car
const EXIT_SHARE = 0.35 // drivers who mean to leave at the next ramp
const P = { x: 0, z: 0, hx: 1, hz: 0 }

// id -> { left, right, dsL, dsR } (ds: add to s on this edge for s on that one)
export const SIDES = new Map()
// (and each lane's place across the carriageway: 0 the inner lane, counting outwards)
export const RANK = new Map()

export function laySides (edges = EDGES) {
  SIDES.clear()
  RANK.clear()
  const list = edges.filter(e => e.hw && !e.road && e.kind === 0 && e.len >= MIN_LEN && e.vk >= 1.5)
  for (const e of list) {
    let left = null,
      right = null,
      dsL = 0,
      dsR = 0
    for (const t of list) {
      if (t === e || t.dx * e.dx + t.dz * e.dz < 0.999) continue
      // (t's start, across e's line: to the right of e is (-dz, dx), drivers.js place)
      const lat = (t.x0 - e.x0) * -e.dz + (t.z0 - e.z0) * e.dx
      if (Math.abs(lat) < SIDE_MIN || Math.abs(lat) > SIDE_MAX) continue
      const a = (t.x0 - e.x0) * e.dx + (t.z0 - e.z0) * e.dz
      if (a > e.len - 40 || a + t.len < 40) continue // (they must overlap)
      const ds = -a // s on t = s on e + ds
      if (lat > 0) {
        right = t
        dsR = ds
      } else {
        left = t
        dsL = ds
      }
    }
    if (left || right) SIDES.set(e.id, { left, right, dsL, dsR })
  }
  for (const e of list) {
    let k = 0,
      t = e
    while (t && k < 6) {
      t = SIDES.get(t.id)?.left
      if (t) k++
    }
    if (SIDES.has(e.id)) RANK.set(e.id, k)
  }
  return SIDES
}
laySides()

// a stable draw per car (its paint and id), so nothing here shifts the traffic's random numbers
const draw = (car, k) => (car.paint * 9.137 + car.id * 0.6180339 + k * 0.371) % 1

export const FWY_LANES = {
  // the freeway's lane changes (from lanes, laneChange.js); want, sigT as there
  fwyLanes (car, dt) {
    const e = car.edge,
      sd = SIDES.get(e.id)
    car.letIn = sd && car.style !== 2 ? this.fwyLetIn(car, sd) : 0
    if (!sd || car.lc || car.panic > 0 || car.siren === 1 || car.ctl) {
      car.sigT = 0
      car.fwyDir = 0
      return
    }
    if (car.passT <= 0) {
      car.passT = 0.6 + draw(car, car.odo) * 0.8
      car.fwyDir = this.fwyDecide(car, e, sd)
    }
    const dir = car.fwyDir
    if (!dir) {
      car.sigT = 0
      return
    }
    const t = dir === 1 ? sd.left : sd.right,
      ds = dir === 1 ? sd.dsL : sd.dsR
    const len = this.fwyChangeLength(car),
      s1 = car.s + ds
    if (!t || s1 < 5 || t.len - s1 < len + 25 || e.len - car.s < len * 0.5) {
      car.sigT = 0
      car.fwyDir = 0
      return
    }
    car.want = dir
    car.sigT += dt
    if (car.sigT >= car.lead * 0.8 && Math.abs(car.off) < 0.4 && this.fwyRoom(t, s1, car))
      this.swap(car, t, ds)
  },
  // Someone waiting at a crawl in the lane beside, indicator on towards this one, a little ahead:
  // ease off to let them in (the speed to keep to, or 0)
  fwyLetIn (car, sd) {
    for (let k = 0; k < 2; k++) {
      const t = k ? sd.right : sd.left
      if (!t) continue
      const ds = k ? sd.dsR : sd.dsL,
        toMe = k ? 1 : 2 // (their want, to come over into this lane)
      for (const o of t.cars) {
        if (o.want !== toMe || o.v > 4 || o.sigT < 1.5) continue
        const d = o.s - (car.s + ds)
        if (d > 0 && d < 80) return Math.max(4, d * 0.15)
      }
    }
    return 0
  },
  // which way, if any: 0 stay, 1 left, 2 right
  fwyDecide (car, e, sd) {
    const rank = RANK.get(e.id) ?? 1
    const want = car.v0 * e.vk
    const exit = draw(car, 7) < EXIT_SHARE
    const A = this.fwyAhead(e, car.s, car)
    let gap = A.gap,
      v = A.v
    // (something stopped in the lane that isn't traffic: the player, a wreck: round it)
    const blk = car.blk
    if (blk && (blk === this.me || blk === this.foot || blk.loose) && car.clear < gap && car.clear < LOOKF) {
      gap = car.clear
      v = 0
    }
    const slow = gap < LOOKF && v < want * 0.88 && v < car.v + 3
    // making way: honked at from behind, or a car on a call coming
    if ((car.yieldT > 0 || car.pull) && sd.right) return 2
    // (into a lane that is moving: not one queueing a little way on)
    const going = t => {
      const b = this.fwyAhead(t, car.s + (t === sd.left ? sd.dsL : sd.dsR), car)
      return b.gap > 50 || b.v > want * 0.7
    }
    // the outer lane goes off at the next ramp: merge in off it, unless leaving there
    if (!sd.right && rank >= 2 && sd.left && !exit && going(sd.left)) return 1
    // leaving at the next ramp: over to the outer lane while there is road to do it in
    if (exit && sd.right && (RANK.get(sd.right.id) ?? 0) >= 2 && going(sd.right)) return 2
    // the inner lane ends (it bends back into the through lane): off it in good time
    if (rank === 0 && sd.right && e.len - car.s < 260) return 2
    // (stopped behind it: whichever side has the room just now, left first)
    if (slow && gap < 30 && v < 2 && car.v < 4) {
      if (sd.left && this.fwyRoom(sd.left, car.s + sd.dsL, car)) return 1
      if (sd.right && this.fwyRoom(sd.right, car.s + sd.dsR, car)) return 2
      return car.fwyDir || (sd.left ? 1 : 2)
    }
    if (slow) {
      if (sd.left && this.fwyBetter(sd.left, car.s + sd.dsL, gap, v, car)) return 1
      // (passing on the right: only the bold, and only if the right lane is clear going)
      if (car.style === 2 && sd.right && this.fwyBetter(sd.right, car.s + sd.dsR, gap, v, car)) return 2
      return 0
    }
    // keep right: by now, nothing slow ahead in the lane to the right (the aggressive linger)
    if (rank === 0 && sd.right && car.style !== 2) {
      const b = this.fwyAhead(sd.right, car.s + sd.dsR, car)
      if (b.gap > 60 || b.v > want * 0.95) return 2
    }
    return 0
  },
  // the nearest car ahead on lane t from s: { gap, v } (gap Infinity: none within reach)
  fwyAhead (t, s, car) {
    const out = this.fwyA || (this.fwyA = { gap: Infinity, v: 0 })
    out.gap = Infinity
    out.v = 0
    for (const o of t.cars) {
      if (o === car || o.s <= s) continue
      const g = o.s - s - (o.len + car.len) / 2
      if (g < out.gap) {
        out.gap = g
        out.v = o.v
      }
    }
    return out
  },
  // lane t moving better than the car ahead (gap m on, at v)?
  fwyBetter (t, s, gap, v, car) {
    const b = this.fwyAhead(t, s, car)
    return b.gap > gap + 25 || b.v > v + 3
  },
  // a safe gap on lane t at s for the car: by time ahead and behind (the bold take a tighter one)
  fwyRoom (t, s, car) {
    // (waiting at a crawl with the indicator on a while, a driver takes a tighter gap, and those
    // coming up in that lane ease off to let them in: the zip)
    const k = (1 - car.bold * 0.4) * (car.v < 4 && car.sigT > 3 ? 0.4 : 1)
    for (const o of t.cars) {
      const d = o.s - s,
        need = (o.len + car.len) / 2 + 3
      if (d >= 0 && d < need + (Math.max(0, car.v - o.v) * 2 + car.v * 0.45) * k) return false
      if (d < 0 && -d < need + (Math.max(0, o.v - car.v) * 2.2 + o.v * 0.6) * k) return false
    }
    // (at a crawl, room ahead to swing out: its nose past what it is stuck behind)
    if (car.v < 4 && car.clear < this.fwyChangeLength(car) * 0.3) return false
    // (nothing stopped in that lane that isn't traffic, near where it would pull in: the player, a
    // wreck)
    pointAt(t, s, P)
    for (const o of [this.me, this.foot]) if (o && this.inLane(o, P, car, 1)) return false
    for (const o of this.loose) if (this.inLane(o, P, car, (o.len || 4) / 2)) return false
    // (nor anyone about to move into the same lane from the far side, level with it)
    const far = this.fwyFar(t, car.edge)
    if (far) {
      const sd = SIDES.get(t.id)
      const ds = sd.left === far ? sd.dsL : sd.dsR
      for (const o of far.cars)
        if (o.want && !o.lc && Math.abs(o.s - (s + ds)) < 30) {
          // (the lower id goes first)
          if (o.id < car.id) return false
        }
    }
    return true
  },
  // o (half length hl) in the lane at P (pointAt's), within reach of a car pulling in there
  inLane (o, P, car, hl) {
    if (Math.abs(o.y - car.y) > 3) return false
    const dx = o.x - P.x,
      dz = o.z - P.z
    const along = dx * P.hx + dz * P.hz,
      side = dx * P.hz - dz * P.hx
    return Math.abs(side) < 2.6 && along > -hl - car.len && along < hl + car.len / 2 + 10 + car.v * 1.5
  },
  // the lane on the other side of t from e
  fwyFar (t, e) {
    const sd = SIDES.get(t.id)
    if (!sd) return null
    return sd.left === e ? sd.right : sd.right === e ? sd.left : null
  },
  // the stretch of road a freeway lane change takes: three seconds or so, never under 30 m (14 at
  // a crawl, pulling out round something stopped)
  fwyChangeLength (car) {
    return Math.max(car.v < 6 ? 14 : 30, Math.min(110, car.v * (3.6 - car.bold * 1.2)))
  },
  // a freeway lane with a lane beside it
  hasSide (e) {
    return e.hw && SIDES.has(e.id)
  },
  // changing lanes, will it be clear across of o (g m ahead on the lane it is leaving) by the time
  // it gets there?
  clearOf (car, o, g) {
    const u = Math.min(1, car.lc + Math.max(0, g) / car.lcLen)
    const over = Math.abs(car.lat0) * u * u * u * (10 - 15 * u + 6 * u * u)
    return over > (car.wid + o.wid) / 2 + 0.2
  },
  // across from the old lane's line to the new one's (t), as place reads it (+ to the right)
  latTo (e, s, t) {
    pointAt(e, s, P)
    return (P.x - t.x0) * -t.dz + (P.z - t.z0) * t.dx
  }
}
