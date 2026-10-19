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
  // which way, if any: 0 stay, 1 left, 2 right
  fwyDecide (car, e, sd) {
    const rank = RANK.get(e.id) ?? 1
    const want = car.v0 * e.vk
    const a = this.fwyAhead(e, car.s, car)
    const slow = a.gap < LOOKF && a.v < want * 0.88 && a.v < car.v + 3
    const exit = draw(car, 7) < EXIT_SHARE
    // making way: honked at from behind, or a car on a call coming
    if ((car.yieldT > 0 || car.pull) && sd.right) return 2
    // the outer lane goes off at the next ramp: merge in off it, unless leaving there
    if (!sd.right && rank >= 2 && sd.left && !exit) return 1
    // leaving at the next ramp: over to the outer lane while there is road to do it in
    if (exit && sd.right && (RANK.get(sd.right.id) ?? 0) >= 2) return 2
    // the inner lane ends (it bends back into the through lane): off it in good time
    if (rank === 0 && sd.right && e.len - car.s < 260) return 2
    if (slow) {
      if (sd.left && this.fwyBetter(sd.left, car.s + sd.dsL, a, car)) return 1
      // (passing on the right: only the bold, and only if the right lane is clear going)
      if (car.style === 2 && sd.right && this.fwyBetter(sd.right, car.s + sd.dsR, a, car)) return 2
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
  // lane t moving better than the car ahead (a: fwyAhead's, copied before it is reused)?
  fwyBetter (t, s, a, car) {
    const gap = a.gap,
      v = a.v
    const b = this.fwyAhead(t, s, car)
    const ok = b.gap > gap + 25 || b.v > v + 3
    a.gap = gap
    a.v = v
    return ok
  },
  // a safe gap on lane t at s for the car: by time ahead and behind (the bold take a tighter one)
  fwyRoom (t, s, car) {
    const k = 1 - car.bold * 0.4
    for (const o of t.cars) {
      const d = o.s - s,
        need = (o.len + car.len) / 2 + 3
      if (d >= 0 && d < need + (Math.max(0, car.v - o.v) * 2 + car.v * 0.45) * k) return false
      if (d < 0 && -d < need + (Math.max(0, o.v - car.v) * 2.2 + o.v * 0.6) * k) return false
    }
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
  // the lane on the other side of t from e
  fwyFar (t, e) {
    const sd = SIDES.get(t.id)
    if (!sd) return null
    return sd.left === e ? sd.right : sd.right === e ? sd.left : null
  },
  // the stretch of road a freeway lane change takes: three seconds or so, never under 30 m
  fwyChangeLength (car) {
    return Math.max(30, Math.min(110, car.v * (3.6 - car.bold * 1.2)))
  },
  // across from the old lane's line to the new one's (t), as place reads it (+ to the right)
  latTo (e, s, t) {
    pointAt(e, s, P)
    return (P.x - t.x0) * -t.dz + (P.z - t.z0) * t.dx
  }
}
