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
const SPAWN_HW = 0.3 // the share of new cars put on the freeway or the hill road, when one is near

export const HWDRIVE = {
  // the way on from edge e, if the freeway's or the hill road's say (undefined: the street's own)
  hwChoose (e, car, own) {
    if (e.hw && !e.road) return e.next[0] || null
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
    if (!HW.length || R() > SPAWN_HW) return null
    const e = HW[Math.floor(R() * HW.length)]
    const s = 10 + R() * Math.max(0, e.len - 20)
    const px = e.x0 + e.dx * s,
      pz = e.z0 + e.dz * s
    const d = Math.hypot(px - x, pz - z)
    if (d < rMin || d > rMax) return null
    if (view && d < 240 && (px - view.x) * view.fx + (pz - view.z) * view.fz > 0) return null
    if (e.cars.some(o => Math.abs(o.s - s) < o.len + 14)) return null
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
