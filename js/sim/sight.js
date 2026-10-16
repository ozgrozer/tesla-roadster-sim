// What a traffic driver sees, mixed into Traffic (traffic.js): the car ahead in its path, the
// Roadster or a knocked or crossing car in the way, and the oncoming traffic a left turn would cut.
import { DIRS } from './city.js'

export const LOOK = 70 // m a driver watches ahead
export const STOP_DECEL = 4 // on yellow, go if stopping would need more than this

export const SIGHT = {
  // Gap to whatever is ahead in this car's path (bumper to bumper) and its speed (in this.vl).
  leader (car) {
    const e = car.edge,
      list = e.cars,
      i = list.indexOf(car)
    this.vl = 0
    if (i >= 0 && i < list.length - 1) {
      const o = list[i + 1]
      this.vl = o.v
      return o.s - car.s - (o.len + car.len) / 2
    }
    const n1 = car.next
    if (!n1) return Infinity
    let dist = e.len - car.s - car.len / 2,
      best = Infinity
    // a car just turning off this lane onto another branch still blocks the mouth of the junction
    for (const sib of e.next)
      if (sib !== n1 && sib.cars.length) {
        const o = sib.cars[0],
          g = dist + o.s - o.len / 2
        if (o.s < o.len + 1 && g < best) {
          best = g
          this.vl = o.v * 0.5
        }
      }
    if (n1.cars.length) {
      const o = n1.cars[0],
        g = dist + o.s - o.len / 2
      if (g < best) {
        best = g
        this.vl = o.v
      }
      return best
    }
    dist += n1.len
    if (dist < LOOK && n1.next.length === 1 && n1.next[0].cars.length) {
      const o = n1.next[0].cars[0],
        g = dist + o.s - o.len / 2
      if (g < best) {
        best = g
        this.vl = o.v
      }
    }
    return best
  },
  // The Roadster, a car knocked out of its lane or one crossing a junction, in this car's path. The
  // obstacle's whole footprint counts (heading ohx, ohz, half length and width ohl, ohw): a long car
  // crossing at an angle blocks the lane with its tail as much as with its middle.
  obstacle (car, ox, oz, ovx, ovz, ohx, ohz, ohl, ohw, gap) {
    const dx = ox - car.x,
      dz = oz - car.z
    const along = dx * car.hx + dz * car.hz
    if (along <= 0 || along > LOOK) return gap
    const cos = Math.abs(ohx * car.hx + ohz * car.hz),
      sin = Math.abs(ohx * car.hz - ohz * car.hx)
    const across = ohl * sin + ohw * cos,
      deep = ohl * cos + ohw * sin
    if (Math.abs(dz * car.hx - dx * car.hz) > car.wid / 2 + 0.5 + across)
      return gap
    const g = along - car.len / 2 - deep
    if (g >= gap) return gap
    this.vl = Math.max(0, ovx * car.hx + ovz * car.hz)
    return g
  },

  // Is anything coming the other way that a left turn into `node` would cut across? On a yellow
  // (changing), only what is going on through it: the rest will be stopping.
  oncoming (node, dir, changing = false) {
    const lanes = node.inc[(dir + 2) % 4]
    if (!lanes) return false
    for (const L of lanes) {
      for (const c of L.next)
        if (c.move !== 'L' && c.cars.some(o => o.s < c.len - 2)) return true
      const list = L.cars
      for (let i = list.length - 1; i >= Math.max(0, list.length - 3); i--) {
        const o = list[i],
          d = L.len - o.s - o.len / 2
        if (d > 60) break
        // at the line, or would reach it within the four and a half seconds a turn across takes (a
        // longer gap than that hardly ever comes in busy traffic, and the turn waited out green after
        // green)
        if (o.next?.move === 'L') continue
        if (
          changing &&
          o.go !== L &&
          o.v * o.v < 2 * STOP_DECEL * Math.max(0, d - 0.5)
        )
          continue
        if (d < 6 || d < o.v * 4.5) return true
      }
    }
    return this.meComing(node, dir)
  },
  // the Roadster coming the other way (it isn't in the lanes' lists): on that road, heading for the
  // junction, and there within the same four and a half seconds
  meComing (node, dir) {
    const me = this.me
    if (!me) return false
    const [ux, uz] = DIRS[(dir + 2) % 4]
    const v = this.mev.x * ux + this.mev.z * uz
    if (v < 1) return false
    const ahead = (node.x - me.x) * ux + (node.z - me.z) * uz,
      off = Math.abs((node.z - me.z) * ux - (node.x - me.x) * uz)
    return off < 9 && ahead > -6 && ahead < 14 + v * 4.5
  }
}
