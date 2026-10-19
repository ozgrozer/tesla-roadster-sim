// The weather and the hour as the traffic feels them (sim/env.js), mixed into Traffic (traffic.js).
// In the rain and on a wet road drivers go slower (about 15% under their usual pace when it is wet
// through), keep longer gaps (a third more), brake earlier and more gently, pull away a little
// more gently and take corners slower; in fog they slow down and keep back too. Each driver by
// their own caution: the bolder ones less. And the hour decides how many are out: the streets are
// busiest in the morning and evening rush, a little quieter through the day and the evening, and
// late at night (from about 23:00, fewest about 3:00, back by 6:00) down to about 55% of the rush,
// the rest parked in the lots. All of it eased: each driver's pace follows the weather as it comes
// on, and cars leave the road (to a space in a lot) or come back one at a time, out of sight.
import { ENV } from './env.js'
import { clamp } from './constants.js'
import { STALLS } from './city.js'

// how busy the streets are through the day, as a share of Traffic.count (the rush): [hour, share]
// prettier-ignore
const DAY = [[0, 0.74], [3, 0.55], [6, 0.88], [8, 1], [10, 0.9], [15, 0.9], [17, 1], [18.5, 1],
  [20.5, 0.9], [23, 0.86], [24, 0.74]]
export function busy (h) {
  h = ((h % 24) + 24) % 24
  let i = 0
  while (i < DAY.length - 2 && DAY[i + 1][0] <= h) i++
  const [h0, a] = DAY[i],
    [h1, b] = DAY[i + 1]
  const u = (h - h0) / (h1 - h0)
  return a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u))
}

// what the weather does to a driver of caution k (about 1) at full wet (w) and full fog (f)
const pace = (k, w, f) => (1 - 0.15 * w * k) * (1 - 0.12 * f * k)
const gap = (k, w, f) => (1 + 0.35 * w * k) * (1 + 0.2 * f * k)
const still = (w, f) => 1 + 0.15 * w + 0.1 * f // (the gap kept at a standstill)
const brake = w => 1 - 0.25 * w
const grip = w => 1 - 0.25 * w
const pull = w => 1 - 0.1 * w
const NEAR = 120 // m: nobody leaves the road, or parks, closer to the Roadster than this

export const CONDITIONS = {
  // how many cars there should be on the road just now (eased towards the hour's share)
  want () {
    return Math.round(this.count * this.dens)
  },
  // Every quarter of a second (from recycle): the weather into each driver's ways, and the
  // hour's traffic, out of sight of (x, z) and the view
  conditions (x, z, view) {
    const w = clamp(Math.max(ENV.wet, 0.75 * ENV.rain), 0, 1),
      f = clamp(ENV.fog, 0, 1)
    for (const car of this.cars)
      if (
        !car.parked &&
        !car.siren &&
        (Math.abs(w - car.wetK) > 0.004 || Math.abs(f - car.fogK) > 0.004)
      )
        this.weather(car, w, f)
    this.dens += (busy(ENV.hour) - this.dens) * 0.0125 // (over about 20 s)
    // (fewer than the rush at this hour: one at a time into the lots, or back out of them)
    const want = this.want()
    if (this.n > want + 1 && want < this.count) this.leave(x, z, view)
    else if (this.n < want && this.extra.length) this.unpark(x, z, view)
  },
  // a driver's ways from the weather they last drove in (car.wetK, car.fogK) to w and f
  weather (car, w, f) {
    const k = 0.75 + 0.5 * (1 - car.bold),
      w0 = car.wetK,
      f0 = car.fogK
    car.v0 *= pace(k, w, f) / pace(k, w0, f0)
    car.T *= gap(k, w, f) / gap(k, w0, f0)
    car.s0 *= still(w, f) / still(w0, f0)
    car.b *= brake(w) / brake(w0)
    car.lat *= grip(w) / grip(w0)
    car.a *= pull(w) / pull(w0)
    car.wetK = w
    car.fogK = f
  },
  // One car fewer on the road: the furthest one out of sight, not on a call nor in a junction,
  // gone into a lot (a car parked in a free space there, out of sight, if there is one and park)
  leave (x, z, view, park = true) {
    let best = -1,
      bd = NEAR * NEAR
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i]
      if (c.parked || c.loose || c.siren || !c.edge.road || c.lc) continue
      const d = (c.x - x) ** 2 + (c.z - z) ** 2
      if (d > bd && !this.inView(c.x, c.z, view)) {
        bd = d
        best = i
      }
    }
    if (best < 0) return
    const type = this.cars[best].type
    this.remove(best)
    if (park && this.extra.length < this.count) this.parkOne(type, x, z, view)
  },
  // a car parked in a free space in a lot, out of sight and further than near from (x, z) (one of
  // those the night's drivers left)
  parkOne (type, x, z, view, near = NEAR) {
    const R = this.wxR
    for (let tries = 0; tries < 30; tries++) {
      const st = STALLS[Math.floor(R() * STALLS.length)]
      if (st.taken || this.used.has(st)) continue
      const d2 = (st.x - x) ** 2 + (st.z - z) ** 2
      if (d2 < near * near || this.inView(st.x, st.z, view)) continue
      const car = this.park(st, R, this.lotType(type))
      this.used.add(st)
      this.extra.push(car)
      return
    }
  },
  // and one of them gone from its space again, out of sight, as the morning comes
  unpark (x, z, view) {
    for (let i = this.extra.length - 1; i >= 0; i--) {
      const c = this.extra[i]
      if (c.loose) continue
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2
      if (d2 < NEAR * NEAR || this.inView(c.x, c.z, view)) continue
      const k = this.cars.indexOf(c)
      if (k >= 0) this.remove(k)
      this.extra.splice(i, 1)
      for (const st of this.used)
        if (st.x === c.homeX && st.z === c.homeZ) this.used.delete(st)
      return
    }
  },
  // (within sight of the camera: in front of it, and near enough to make out)
  inView (x, z, view) {
    return (
      !!view &&
      (x - view.x) ** 2 + (z - view.z) ** 2 < 260 * 260 &&
      (x - view.x) * view.fx + (z - view.z) * view.fz > -12
    )
  }
}
