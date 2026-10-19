// Making way for the car on a call (calls.js), mixed into Traffic (traffic.js). A driver ahead of
// it on its road, in its lane or the one beside, notices it coming (each at their own distance,
// and a moment later by their own reactions), signals, pulls over towards the kerb and slows to a
// stop, waits there until it has gone by, then signals and pulls out again; one too near a
// junction to stop short of it goes on over first. Anyone coming up to the junction it is
// crossing holds at the line while it crosses, if they can still stop; and the people waiting to
// cross there stay on the kerb (peds.js asks Traffic.urgent, calls.js).
// The police on a chase with their sirens going (police.js puts them in Traffic.sirens) are made
// way for the same way, each driver pulling over for the one coming up behind them (car.yieldTo).
// car.pull: 0 driving on, 1 pulling over (or pulled over), 3 it has gone by (off again in a
// moment), 2 pulling back out; car.pullT: s in that state; car.pullS: where it stops on its lane.
import { LANE_W, LANE_OFF, ROAD_HW } from './city.js'

const LONGEST = 30 // s a driver waits pulled over before giving up on it

export const MAKEWAY = {
  // The gap to where this driver means to stop for the car on a call (at the line of the junction
  // it is crossing, or pulled over at the kerb in front of it), or Infinity
  giveWay (car, dt) {
    const C = this.call,
      S = C.on ? C.car : this.sirenFor(car)
    if (car === C.car || car.ctl) return Infinity
    const e = car.edge
    let gap = Infinity
    // the junction it is crossing, or about to: hold at the line, if it can still stop there
    if (
      C.on &&
      S &&
      C.node &&
      e.road &&
      car.next &&
      e.to === C.node.i &&
      (e.dir !== C.dir || this.cutsAcross(S, car))
    ) {
      const toLine = e.len - car.s - car.len / 2
      if (toLine >= 0) {
        if (
          car.v < 0.5 ||
          car.v * car.v < 2 * car.b * Math.max(0.1, toLine - 0.3)
        )
          gap = Math.max(0, toLine - 0.3 - car.short) + car.s0
      } else if (car.v < 0.3 && toLine > -car.len / 2) gap = car.s0 - 0.05
    }
    if (car.pull === 1 || car.pull === 3)
      return Math.min(gap, this.pulled(car, S, dt))
    if (car.pull === 2) this.pullBack(car, dt)
    // (a box truck stopped to deliver, or pulling in to, is already at the kerb: delivery.js)
    else if (S && e.road && !car.lc && !car.drop?.k) this.notice(car, S, dt)
    return gap
  },
  // Is the car on a call turning at the junction (or about to)? It cuts across from either lane to
  // make the turn, so those coming up beside it, its own way, hold at the line too: one let into
  // the junction beside a fire engine swinging its nose across its lane waits on it, and it on them
  // (only those behind it: one ahead of it at the line goes on, out of its way)
  cutsAcross (S, car) {
    const m = S.edge.move || (S.next?.kind === 1 ? S.next.move : null)
    if (!m || m === 'S') return false
    return !!S.edge.move || car.edge.len - car.s > S.edge.len - S.s
  },
  // Ahead of it on its road, going its way (in its lane or the one beside): the driver notices it
  // within their own distance, and pulls over a moment later, by their own reactions
  notice (car, S, dt) {
    const e = car.edge,
      dx = car.x - S.x,
      dz = car.z - S.z
    const along = dx * S.hx + dz * S.hz,
      side = dz * S.hx - dx * S.hz
    const reach = 35 + 40 * ((car.paint * 5.7) % 1) + 1.5 * S.v
    if (
      along < (car.len + S.len) / 2 ||
      along > reach ||
      Math.abs(side) > 5.6 ||
      car.hx * S.hx + car.hz * S.hz < 0.75 ||
      (S.v < 2 && along > 30)
    ) {
      car.pullT = Math.min(0, car.pullT + dt)
      return
    }
    car.pullT += dt
    if (car.pullT < car.react + 0.2 + 1.2 * ((car.paint * 3.3) % 1)) return
    // where it stops: a comfortable stop ahead, short of the line (too near the junction for that,
    // it goes on over first, and pulls over on the far side)
    const stop = car.s + Math.max(5, (car.v * car.v) / (1.2 * car.b)),
      line = e.len - car.len / 2 - 1.5
    if (stop > line && car.v * car.v > 2 * car.b * Math.max(0, line - car.s))
      return
    car.pull = 1
    car.yieldTo = S
    car.pullT = 0
    car.pullS = Math.min(stop, line)
  },
  // Pulled over (or pulling over): in towards the kerb as far as there is room, signalling, stopped
  // until it has gone by, then a moment later off again; the gap to where it stops
  pulled (car, S, dt) {
    const e = car.edge
    car.pullT += dt
    if (e.road && !car.lc) car.offT = this.kerbRoom(car)
    car.want = 2 // (the indicator on, to the right)
    // gone by (or gone for good, or waited for long enough): out again, after a moment
    if (
      car.pull === 1 &&
      (!S ||
        car.pullT > LONGEST ||
        (car.x - S.x) * S.hx + (car.z - S.z) * S.hz <
          -(car.len + S.len) / 2 - 2)
    ) {
      car.pull = 3
      car.pullT = 0
    }
    if (
      car.pull === 3 &&
      car.pullT > car.react + 0.4 + 0.8 * ((car.paint * 9.1) % 1)
    ) {
      car.pull = 2
      car.pullT = 0
      return Infinity
    }
    // stopped before it could get over (in a queue, say): on with the traffic at a crawl, easing
    // over as it rolls (a car only moves sideways rolling forward), and stopping again once over
    const over = Math.abs(car.offT - car.off) < 0.15
    if (!over && car.v < 1.5 && car.pullS - car.s < 1.5) {
      car.pullS = car.s + 1
      return car.s0 + 4
    }
    if (over && car.pullS - car.s > 3 && car.v < 3)
      car.pullS = car.s + Math.max(1.5, (car.v * car.v) / car.b)
    const left = car.pullS - car.s
    return car.v < 0.1 && left < 0.5
      ? car.s0 - 0.05
      : Math.max(0, left) + car.s0
  },
  // pulling back out into its lane, signalling (and not pulling over again at once for the same
  // car, if it is still about)
  pullBack (car, dt) {
    car.offT = 0
    car.want = Math.abs(car.off) > 0.25 ? 1 : 0
    if ((car.pullT += dt) > 4 || Math.abs(car.off) < 0.05) {
      car.pull = 0
      car.yieldTo = null
      car.pullT = -12
    }
  },
  // (no call on) the police car with its siren on this driver makes way for: the one it is already
  // pulled over for while that one still has its siren on, else the nearest coming up behind it
  sirenFor (car) {
    const L = this.sirens
    if (!L || !L.length) return null
    if (car.pull) return L.includes(car.yieldTo) ? car.yieldTo : null
    let best = null,
      bd = 80
    for (const S of L) {
      const dx = car.x - S.x,
        dz = car.z - S.z
      const along = dx * S.hx + dz * S.hz
      if (along > 0 && along < bd && Math.abs(dz * S.hx - dx * S.hz) < 6) {
        bd = along
        best = S
      }
    }
    return best
  },
  // How far in towards the kerb it can go: up to it, in the kerb lane; half into the kerb lane from
  // the inner one, as far as the cars there alongside leave room
  kerbRoom (car) {
    const e = car.edge,
      t = e.twin
    if (e.lane === 1 || !t)
      return Math.max(
        0,
        Math.min(0.75, ROAD_HW - 0.25 - LANE_OFF[e.lane] - car.wid / 2)
      )
    let room = 1.3
    for (const o of t.cars)
      if (Math.abs(o.s - car.s) < (o.len + car.len) / 2 + 2)
        room = Math.min(
          room,
          LANE_W - (o.wid + car.wid) / 2 - 0.35 + Math.min(0, o.off)
        )
    return Math.max(0, room)
  }
}
