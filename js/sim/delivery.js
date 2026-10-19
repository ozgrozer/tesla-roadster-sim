// Deliveries, mixed into Traffic (traffic.js): a box truck (fleet.js) coming into a block in the
// kerb lane now and then makes a stop on it, double-parked, as LA's delivery drivers do. It
// signals, pulls in towards the kerb and stops, puts its hazards on and runs its roller door up; a
// minute or two later it pulls the door down, signals and drives on. The drivers behind go round
// it as they go round a wreck (laneChange.js, drivers.js; react.js counts it as something that
// isn't going anywhere), and those pulling over for a call leave it be (makeway.js). Its choices
// draw on random numbers of their own (dropR: fleet.js streams).
// car.drop, made the first time the truck is driven: k, 0 driving on, 1 pulling in, 2 stopped, 3
// setting off; s, where on its lane it stops; t, s in this state; stay, how long it stops for; e,
// the lane it last chose on; door, how far up its door is (0 to 1); since, s since its last stop.
import { OB, put } from './sight.js'
import { clamp } from './constants.js'
import { ROAD_HW, LANE_OFF } from './city.js'

const SHARE = 0.25 // of the blocks it comes into in the kerb lane, the share it stops on
const REST = 80 // s after a stop before it makes another
const STAY = [55, 125] // s it stops for
const DOOR = 2.4 // s its roller door takes to run up or down
const NEAR = 30 // m short of its stop it starts pulling in

export const DELIVERY = {
  // Each time a box truck drives (drivers.js): the gap to where it stops, or Infinity
  deliver (car, dt) {
    const e = car.edge
    let d = car.drop
    if (!d)
      d = car.drop = {
        k: 0,
        s: 0,
        t: 0,
        stay: 0,
        e: null,
        door: 0,
        since: REST // (ready to make a stop from the first block it comes into)
      }
    d.since += dt
    if (d.k === 0) return this.chooseStop(car, d)
    // (moved off its lane, or knocked on past its stop: the stop is off)
    if (e !== d.e || car.lc || car.s > d.s + 3) {
      d.k = 0
      d.door = car.offT = 0
      return Infinity
    }
    d.t += dt
    // (in towards the kerb, as far as there is room: about a hand's breadth from it)
    const room = clamp(ROAD_HW - 0.3 - LANE_OFF[1] - car.wid / 2, 0, 0.28)
    if (d.k === 1) {
      // pulling in towards the kerb as it slows, signalling, and stopping there (rolling on a few
      // metres more while the car behind is too close to pull out round it)
      const left = d.s - car.s
      if (left < NEAR) {
        car.offT = room
        car.want = 2
      }
      if (left < 2 && d.s < e.len - 26 && this.crowded(car))
        d.s = Math.min(e.len - 26, d.s + 3)
      if (car.v < 0.1 && left < 0.8) {
        d.k = 2
        d.t = 0
      }
      return car.v < 0.1 && left < 0.5
        ? car.s0 - 0.05
        : Math.max(0, left) + car.s0
    }
    car.offT = room
    if (d.k === 2) {
      // stopped: hazards on, the door up a moment later, and down again when it is time to go
      car.want = 3
      d.door = clamp((d.t - 1.5) / DOOR, 0, 1)
      if (d.t > d.stay) {
        d.k = 3
        d.t = 0
      }
      return car.s0 - 0.05
    }
    // setting off: the door down, then signalling out, and away
    d.door = clamp(1 - d.t / DOOR, 0, 1)
    car.want = d.t < DOOR + 0.3 ? 3 : 1
    if (d.t < DOOR + 2) return car.s0 - 0.05
    d.k = 0
    d.since = 0
    car.offT = 0
    return Infinity
  },
  // Driving on: coming into a block in the kerb lane, it chooses whether to stop on it (and
  // pulling back out from a stop, it signals until it is back on its line)
  chooseStop (car, d) {
    const e = car.edge,
      R = this.dropR
    if (d.since < 8 && Math.abs(car.off) > 0.06) car.want = 1
    if (e === d.e || car.lc) return Infinity
    d.e = e
    if (
      e.road &&
      e.lane === 1 &&
      e.twin &&
      car.s < 15 &&
      d.since > REST &&
      !car.siren &&
      R() < SHARE
    ) {
      d.k = 1
      d.t = 0
      d.s = 25 + R() * (e.len - 55)
      d.stay = STAY[0] + R() * (STAY[1] - STAY[0])
    }
    return Infinity
  },
  // the car behind it in its lane too close to pull out round it once it stops, or one already
  // pulling out from behind it not yet clear of it
  crowded (car) {
    const e = car.edge,
      o = e.cars[e.cars.indexOf(car) - 1]
    const near = o => car.s - o.s - (car.len + o.len) / 2 < this.pullOut(o) + 0.5
    if (o && !o.lc && near(o)) return true
    return !!e.twin?.cars.some(o => o.lc && o.from === e && o.s < car.s && near(o))
  },
  // (a car changing lanes out from behind a truck stopped to deliver sees it by its body, as it
  // sees a wreck: drivers.js)
  seeTruck (car, o) {
    put(o.x, o.z, 0, 0, o.hx, o.hz, o.len / 2, o.wid / 2)
    this.obstacle(car, OB, o)
  }
}
