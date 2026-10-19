// Changing lanes, mixed into Traffic (traffic.js) with the drivers (drivers.js): moving over for a
// turn from the other lane, to get round something stopped in this one, when the Roadster honks
// from behind, or (a quicker driver) to get by a slow car. The indicator goes on first; then, once
// there is room, over it goes, eased across on a smooth S (place, in drivers.js) over a length of
// road that is shorter at a crawl.
import { LANE_OFF } from './city.js'

const CHANGE = 30 // m of road a lane change takes at speed (less, slower)

export const LANE_CHANGE = {
  // Moving over to the other lane: for a turn from there, to get round something stopped in this
  // one, when the Roadster honks from behind, or (a quicker driver) to get by a slow car. The
  // indicator goes on first; then, once there is room, over it goes.
  lanes (car, dt) {
    const e = car.edge
    car.yieldT = Math.max(0, car.yieldT - dt)
    car.passT -= dt
    car.want = 0
    // (nor while pulled over for a car on a call, makeway.js, or making a delivery, delivery.js)
    const pulled = car.pull === 1 || car.pull === 3 || car.drop?.k > 0
    if (!e.road || !e.twin || car.lc || !car.next || car.panic > 0 || pulled) {
      car.sigT = 0
      return
    }
    // (on a call it cuts across from the lane it is in instead: see drive)
    const forTurn = !e.next.includes(car.next) && car.siren !== 1
    // (behind a wreck, the Roadster or a box truck making a delivery, not traffic that will move
    // on, a driver decides sooner; one seeing the truck's hazards ahead moves over before it is
    // there)
    const drop = car.blk?.drop?.k > 1
    const odd = car.blk === this.me || !!car.blk?.loose || drop
    let move =
      forTurn ||
      car.stuck > (odd ? 1 : 2) + car.patience * 0.2 ||
      (car.yieldT > 0 && e.lane === 0) ||
      (drop && car.clear < 40)
    // a slow car ahead and the other lane going better: a bold driver goes by
    if (!move && car.passT <= 0) {
      car.passT = 1 + this.R()
      move = this.overtake(car)
    }
    if (!move) {
      car.sigT = 0
      return
    }
    // (held up, it may still pull out nearer the junction)
    const last = car.stuck > 0 ? 10 : 22
    if (car.s > 4 && car.s < e.len - last) {
      car.want = e.twin.lane > e.lane ? 2 : 1 // (the kerb lane is the right one)
      car.sigT += dt
      if (
        car.sigT >= car.lead &&
        Math.abs(car.off) < 0.4 &&
        this.roomOut(car) &&
        this.canMerge(e.twin, car)
      )
        this.swap(car)
    } else if (forTurn && car.s >= e.len - 22) {
      car.sigT = 0
      car.next = this.choose(e, car, true) // missed the chance: go another way
    }
  },
  // Room to pull out: moving, or (slow) far enough back from what is ahead in the lane to be clear
  // of it by the time the nose gets there (with a lane change over changeLength); from behind a box
  // truck stopped to deliver (or slowing for its stop), far enough back from it either way (within
  // a metre: pullOut leaves 3 more behind one).
  roomOut (car) {
    if (car.blk?.drop?.k > 0) return car.clear > this.pullOut(car) - 1
    if (car.v > 2) return true
    if (car.len > 7 && !car.stuck) return false // (a bus doesn't change lanes at a crawl)
    return car.clear > this.pullOut(car)
  },
  // (how far back from it: far enough to be clear of it, pulling out over the shortest change; from
  // o, a wreck, a few metres more, to have room to go on round it on the wrong side: react.js; and
  // 3 m more behind a box truck stopping to deliver, as wide as it is: delivery.js)
  pullOut (car, o = null) {
    const more = (o?.dmg?.wreck ? 4 : 0) + (car.blk?.drop?.k > 0 ? 3 : 0)
    return 0.57 * Math.max(9, car.len * 2.2) + more
  },
  // worth going by the car ahead: it is slow for this driver, and the other lane is moving better
  overtake (car) {
    if (car.bold < 0.45 || car.v < 4) return false
    const e = car.edge,
      list = e.cars,
      i = list.indexOf(car),
      o = list[i + 1]
    if (!o || o.s - car.s > 40 || o.v > car.v0 * 0.8) return false
    // the twin lane: its car ahead of this one, and room to go on past
    for (const t of e.twin.cars)
      if (t.s > car.s - 4 && t.s < o.s + 25 && t.v < o.v + 2) return false
    return e.twin.next.includes(car.next) || e.len - car.s > 50
  },

  // over it goes: into the other lane, eased across from where it was on this one (its offset
  // from the line included), and on from there to the same turn if that lane has it
  swap (car) {
    const t = car.edge.twin
    car.lat0 = LANE_OFF[car.edge.lane] - LANE_OFF[t.lane] + car.off
    car.off = car.offT = 0
    car.lc = 1e-6
    car.lcLen = this.changeLength(car)
    car.stuck = car.yieldT = car.sigT = 0
    this.detach(car)
    car.from = car.edge
    car.edge = t
    this.insert(t, car)
    if (!t.next.includes(car.next)) car.next = this.choose(t, car, true)
  },
  // the length of road a lane change takes: shorter at a crawl, never so short it looks like a jump
  // (never so short that the nose swings out at a sharp angle: a bus takes the longest)
  changeLength (car) {
    const min = Math.max(9, car.len * 2.2)
    return Math.max(
      min,
      Math.min(car.v * (2.4 + (1 - car.bold) * 1.4), CHANGE + 10)
    )
  }
}
