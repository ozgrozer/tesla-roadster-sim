// The traffic on the freeway and the hill road (highway.js lays their lanes), mixed into Traffic
// (traffic.js): which way on (a street lane's way off taken now and then, by numbers of its own so
// the streets' traffic draws as it did), standing on whatever is under it there and pitched up or
// down its slope, waiting at the end of a slip road for a gap in the street it joins, and put
// straight onto the freeway or the hill road now and then when one is near.
import { rng } from './city.js'
import { groundHeight } from './world.js'
import { HW } from './highway.js'

const TAKE = 0.35 // the share of drivers who take a way off onto the freeway
const TAKE_HILL = 0.2 // ...and up the hill road
const NOSE = 1.6 // m fore and aft of the middle the slope is read at
const _span = []
const SPAWN_HW = 0.45
const HILL_MAX = 10 // the share of new cars put on the freeway or the hill road, when one is near

export const HWDRIVE = {
  // the way on from edge e, if the freeway's or the hill road's say (undefined: the street's own)
  hwChoose (e, car, own) {
    // (onto the deck: the through lane or the inner one beside it, as likely)
    if (e.hw && !e.road) return e.next[e.next.length > 1 && (this.hwR ||= rng(91733))() < 0.5 ? 1 : 0] || null
    if (own || !e.exits.length || car.siren === 1 || car.ctl) return undefined
    const R = (this.hwR ||= rng(91733))
    for (const x of e.exits) {
      if (car.s > x.atS - 3) continue
      if (R() < (x.move ? TAKE_HILL : TAKE)) return x
    }
    return undefined
  },
  // (after place: up on the deck, the ramp or the hill, its nose up or down the slope)
  hwPlace (car) {
    if (!car.edge.hw) {
      car.y = car.gp = 0
      return
    }
    const top = car.y + 1.2
    const y = groundHeight(car.x, car.z, top),
      f = groundHeight(car.x + car.hx * NOSE, car.z + car.hz * NOSE, top),
      b = groundHeight(car.x - car.hx * NOSE, car.z - car.hz * NOSE, top)
    car.y = y
    car.gp = Math.atan2(f - b, 2 * NOSE)
  },
  // Coming to the end of a slip road onto street lane L (e.next[0]), joining it e.joinS along: the
  // gap to where it waits, while anyone on L is near that point or coming up to it.
  mergeHold (car, e) {
    const toEnd = e.len - car.s - car.len / 2
    if (toEnd > 30) return Infinity
    const L = e.next[0],
      s = e.joinS
    for (const o of L.cars)
      if (o.s > s - 12 - o.v * 2 && o.s - o.len / 2 < s + car.len / 2 + 3)
        return Math.max(0, toEnd - 0.5)
    return Infinity
  },
  // A new car straight onto the freeway or the hill road between rMin and rMax from (x, z) (out of
  // sight as spawn's are), now and then; null if none.
  hwSpawn (x, z, rMin, rMax, view) {
    const R = (this.hwS ||= rng(55117))
    // (along the stretches of it within reach, each as likely as its length there)
    let sum = 0
    _span.length = 0
    for (const e of HW) {
      const t = (x - e.x0) * e.dx + (z - e.z0) * e.dz,
        p = Math.abs((x - e.x0) * e.dz - (z - e.z0) * e.dx)
      if (p >= rMax) continue
      const h = Math.sqrt(rMax * rMax - p * p),
        a = Math.max(10, t - h),
        b = Math.min(e.len - 10, t + h)
      if (b > a) _span.push(e, a, b, (sum += b - a))
    }
    if (!sum || R() > SPAWN_HW) return null
    const pick = R() * sum
    let i = 0
    while (_span[i + 3] < pick) i += 4
    const e = _span[i],
      s = _span[i + 1] + R() * (_span[i + 2] - _span[i + 1])
    // (the hill road's a quiet one: a few cars on it at a time)
    if (
      e.vk < 1 &&
      this.cars.filter(c => c.edge?.hw && c.edge.vk < 1).length >= HILL_MAX
    )
      return null
    const px = e.x0 + e.dx * s,
      pz = e.z0 + e.dz * s
    const d = Math.hypot(px - x, pz - z)
    if (d < rMin || d > rMax) return null
    if (
      view &&
      d < 240 &&
      (px - view.x) * view.fx + (pz - view.z) * view.fz > 0
    )
      return null
    if (e.cars.some(o => Math.abs(o.s - s) < o.len + 14)) return null
    // (nor where a car changing lanes out of it, in the list of the lane beside, still is)
    if (this.cars.some(o => o.lc && o.from === e && Math.abs(o.x - px) < o.len + 14 && Math.abs(o.z - pz) < o.len + 14)) return null
    const car = this.make(this.pickType())
    car.edge = e
    car.s = s
    car.v = car.v0 * e.vk * 0.8
    car.y = groundHeight(px, pz)
    this.insert(e, car)
    car.next = this.choose(e, car)
    this.place(car)
    this.n++
    return car
  }
}
