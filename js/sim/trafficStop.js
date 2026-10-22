// All-way stops at the quiet junctions, mixed into Traffic (traffic.js). Where two minor streets
// cross in the suburbs, the estates or Venice (neither of them a boulevard, nor the ring road),
// there are no lights to wait for: the signal heads flash red (signals.js) and every driver comes
// to a stop at the line, then goes in the order they got there, once the junction is clear of
// crossing traffic, of anyone on foot in the road and of the player. A bold driver's stop is a
// rolling one, and quicker off; a careful one waits a moment longer. People on foot cross there
// whenever no car is moving through (peds.js). Pure: no DOM.
import { N, BLVD_EW, BLVD_NS, nodeOpen } from './grid.js'
import { NODES } from './city.js'
import { areaOf, AREAS } from './areas.js'
import { JAM } from './jam.js'
import { LOOK } from './sight.js'

const QUIET = new Set(['estates', 'suburb', 'venice'])
export const STOPS = [] // the junctions with an all-way stop

// Mark them: every node gets `stop` (true at an all-way stop) so they all keep one shape
export function markStops (nodes) {
  STOPS.length = 0
  const jam = new Set()
  for (const e of JAM) jam.add(e.from).add(e.to)
  for (const n of nodes) {
    n.stop = false
    if (n.ix <= 0 || n.iz <= 0 || n.ix >= N || n.iz >= N) continue
    if (BLVD_EW.has(n.iz) || BLVD_NS.has(n.ix) || !nodeOpen(n.ix, n.iz) || jam.has(n.i)) continue
    if (!n.inc.some(Boolean)) continue
    let quiet = 0
    for (let j = -1; j <= 0; j++)
      for (let i = -1; i <= 0; i++)
        if (QUIET.has(AREAS[areaOf(n.ix + i, n.iz + j)]?.kind)) quiet++
    if (quiet < 3) continue
    n.stop = true
    STOPS.push(n)
  }
  return STOPS
}

export const STOP_SIGN = {
  // The stop at the end of lane e (an all-way stop at NODES[e.to]): the gap to the line until the
  // driver has stopped there, waited their moment and it is their turn; then Infinity (car.go)
  stopSign (car, e, dt) {
    if (car.go === e) return Infinity
    const toLine = e.len - car.s - car.len / 2
    if (toLine > LOOK || toLine < -car.len / 2) return Infinity
    const node = NODES[e.to]
    // (stopped at the line: a bold driver calls a crawl a stop)
    const halt = car.style === 2 ? 1.3 : 0.3
    if (car.v < halt && toLine < 2.5) {
      if (!car.arrive) car.arrive = this.t
      const wait = car.style === 2 ? 0.25 : 0.7 + car.react * (car.style === 0 ? 1 : 0.5)
      if (this.t - car.arrive > wait && this.stopClear(node, car, e)) {
        car.go = e
        car.arrive = 0
        return Infinity
      }
    }
    return Math.max(0, toLine - 0.3) + car.s0
  },
  // nothing crossing, nobody there first, nobody on foot in the road, the player not coming through
  // it, and room on the far side
  stopClear (node, car, e) {
    for (let k = 0; k < 4; k++) {
      const inc = node.inc[k]
      if (!inc) continue
      for (const L of inc) {
        if (!L) continue
        // (anyone moving through the junction from another way)
        for (const c of L.next)
          if (c.move && c.dir !== e.dir)
            for (const o of c.cars) if (o !== car && o.s < c.len - 1) return false
        // (anyone who stopped at their line before this car did; level, the lower id first)
        if (k === e.dir) continue
        const o = L.cars[L.cars.length - 1]
        if (o && o.go === L) return false // (its turn now: on its way in)
        if (o && o.arrive && (o.arrive < car.arrive - 0.05 || (o.arrive <= car.arrive + 0.05 && o.id < car.id))) return false
      }
    }
    for (const p of this.peds) if ((p.x - node.x) ** 2 + (p.z - node.z) ** 2 < 256) return false
    const me = this.me || this.foot
    if (me && (me.x - node.x) ** 2 + (me.z - node.z) ** 2 < 196) return false
    return !car.next?.next?.[0] || this.room(car)
  },
  // can someone on foot cross at an all-way stop now: no car moving into or through it
  stopWalk (node) {
    for (const c of this.cars) {
      if (c.parked || c.v < 1.5) continue
      const dx = c.x - node.x,
        dz = c.z - node.z
      if (dx * dx + dz * dz > 400) continue
      // (coming in, or in it)
      if (dx * c.hx + dz * c.hz < 4) return false
    }
    return true
  }
}
markStops(NODES)
