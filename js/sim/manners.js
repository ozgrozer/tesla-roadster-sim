// Traffic drivers' manners: indicators for lane changes and turns, hazards on a car knocked loose
// (wrecks.js), honking at a Roadster that holds them up or cuts them up, and moving over when it
// honks at them from behind (tr.horn).
import { LANE_OFF } from './city.js'

// Indicators, a honk at a Roadster in the way (mine: it is what holds the car up), and moving over
// when it honks from behind.
export function temper (tr, car, dt, mine, gap, acc) {
  const e = car.edge
  car.sig = 0
  if (car.lc) car.sig = car.lat0 > 0 ? 1 : 2
  else if (e.twin && car.next && !e.next.includes(car.next))
    car.sig = LANE_OFF[e.lane] > LANE_OFF[e.twin.lane] ? 1 : 2
  // waiting to move over
  else {
    const turn =
      e.move || (car.next && e.len - car.s < 45 ? car.next.move : null)
    car.sig = turn === 'L' ? 1 : turn === 'R' ? 2 : 0
  }
  car.honkT -= dt
  // held up by the Roadster sitting in the way, or cut up by it
  if (mine && gap < 14 && car.v < 1) car.annoy += dt
  else car.annoy = Math.max(0, car.annoy - dt * 0.5)
  if (car.honkT <= 0) {
    if (car.annoy > 1.6) {
      honk(tr, car, car.annoy > 5)
      car.annoy = 0.6
    } else if (mine && acc < -5 && car.v > 6) honk(tr, car, true)
  }
  const me = tr.me
  if (!tr.horn || !me || car.lc) return
  // honked at: a car just ahead of the Roadster, going its way, moves over (and may toot back)
  const dx = car.x - me.x,
    dz = car.z - me.z,
    along = dx * tr.mhx + dz * tr.mhz
  if (
    along > 2 &&
    along < 35 &&
    Math.abs(dz * tr.mhx - dx * tr.mhz) < 2.6 &&
    car.hx * tr.mhx + car.hz * tr.mhz > 0.8 &&
    !car.yieldT
  ) {
    car.yieldT = 3
    if (car.honkT <= 0 && tr.R() < 0.3) honk(tr, car, false)
  }
}
// sim event 'honk': where, which horn, and a toot or a long blast
export function honk (tr, car, long) {
  car.honkT = 3.5 + ((car.paint * 13) % 1) * 3
  tr.sim?.emit('honk', {
    x: car.x,
    z: car.z,
    horn: car.horn,
    big: car.big,
    long
  })
}
