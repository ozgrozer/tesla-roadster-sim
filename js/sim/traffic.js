// City traffic: drivers follow the lane graph, keep their distance (intelligent driver model), stop
// for red lights, slow for corners and for the Roadster, and get knocked loose when it hits them.
// Traffic lives in a bubble round the player: cars far behind are recycled into the streets ahead.
import { JAM } from './jam.js'
import { CAR, clamp } from './constants.js'
import { slide, collidePlayer } from './wrecks.js'
import {
  rng,
  NODES,
  EDGES,
  LANES,
  GREEN,
  YELLOW,
  STALLS,
  signal,
  pointAt,
  LANE_OFF
} from './city.js'

export const TYPES = [
  { name: 'sedan', len: 4.7, wid: 1.85, hgt: 1.45, m: 1600, share: 30 },
  { name: 'hatch', len: 4.1, wid: 1.78, hgt: 1.5, m: 1300, share: 16 },
  { name: 'suv', len: 4.85, wid: 1.95, hgt: 1.75, m: 2100, share: 20 },
  { name: 'taxi', len: 4.8, wid: 1.85, hgt: 1.62, m: 1650, share: 9 },
  { name: 'pickup', len: 5.4, wid: 2.0, hgt: 1.85, m: 2300, share: 10 },
  { name: 'van', len: 6.4, wid: 2.15, hgt: 2.8, m: 3800, share: 7 },
  { name: 'bus', len: 11.6, wid: 2.55, hgt: 3.15, m: 12500, share: 3 }
]
const BUS = TYPES.findIndex(t => t.name === 'bus')
const SHARES = TYPES.reduce((a, t) => a + t.share, 0)

// intelligent driver model
const A = 2.2 // comfortable acceleration, m/s^2
const B = 3.2 // comfortable braking
const S0 = 2.2 // gap kept at a standstill, m
const HEADWAY = 1.3 // s
const LOOK = 70 // m a driver watches ahead
const STOP_DECEL = 4 // on yellow, go if stopping would need more than this
const CHANGE = 28 // m of road a lane change takes

const P = { x: 0, z: 0, hx: 1, hz: 0 }

export class Traffic {
  constructor ({ count = 90, radius = 270, seed = 7 } = {}) {
    this.count = count
    this.radius = radius
    this.R = rng(seed)
    this.cars = []
    this.loose = []
    this.box = []
    this.n = 0 // cars in traffic (parked ones aside)
    this.t = 0
    this.clock = 0
    this.vl = 0
  }

  // the lane graph is shared, so whichever traffic was there before is cleared off it too
  clear () {
    for (const e of EDGES) e.cars.length = 0
    this.cars.length = 0
    this.n = 0
  }

  // Fill the parking lots, the jammed street and the streets around (x, z).
  reset (x, z) {
    this.clear()
    this.t = 0
    for (const st of STALLS) if (st.taken) this.park(st)
    for (const e of JAM) this.jam(e)
    for (let i = 0; i < this.count * 6 && this.n < this.count; i++)
      this.spawn(x, z, 24, this.radius)
  }

  make (type) {
    const T = TYPES[type]
    const car = {
      type,
      len: T.len,
      wid: T.wid,
      hgt: T.hgt,
      m: T.m,
      I: (T.m * (T.len * T.len + T.wid * T.wid)) / 12,
      paint: this.R(),
      v0: type === BUS ? 9 + this.R() * 2 : 10.5 + this.R() * 4.5,
      edge: null,
      next: null,
      go: null, // the lane on which it decided to carry on through a yellow
      s: 0,
      v: 0,
      x: 0,
      z: 0,
      hx: 1,
      hz: 0,
      yaw: 0,
      odo: 0,
      lc: 0, // lane change progress, 0 to 1 (0 when not changing)
      lat0: 0, // sideways offset from the new lane when the change began
      stuck: 0, // s spent stopped behind something that isn't moving with the traffic
      brake: false,
      parked: false,
      loose: false,
      looseT: 0,
      vx: 0,
      vz: 0,
      w: 0
    }
    this.cars.push(car)
    return car
  }
  pickType (noBus) {
    let r = this.R() * SHARES
    for (let i = 0; i < TYPES.length; i++)
      if ((r -= TYPES[i].share) < 0) return noBus && i === BUS ? 0 : i
    return 0
  }
  park (st) {
    const car = this.make(this.pickType(true))
    car.parked = true
    car.x = st.x
    car.z = st.z
    this.setYaw(car, st.yaw)
  }
  // a lane of the jammed street: nose to tail, a little out of line, brake lights on (and buses
  // only in the kerb lane)
  jam (e) {
    const R = this.R
    for (let s = 0.8 + R(); ; ) {
      const type = this.pickType(e.lane === 0),
        len = TYPES[type].len
      if (s + len > e.len - 0.5) break
      const car = this.make(type)
      car.parked = car.brake = true
      pointAt(e, s + len / 2, P)
      const lat = (R() - 0.5) * 0.5
      car.x = P.x - P.hz * lat
      car.z = P.z + P.hx * lat
      this.setYaw(car, Math.atan2(-P.hz, P.hx) + (R() - 0.5) * 0.06)
      s += len + 0.9 + R() * 1.4
    }
  }
  setYaw (car, yaw) {
    car.yaw = yaw
    car.hx = Math.cos(yaw)
    car.hz = -Math.sin(yaw)
  }

  // A new car on a random lane between rMin and rMax from (x, z). With a view (the camera), cars
  // only appear behind it or far off, so they never pop into sight.
  spawn (x, z, rMin, rMax, view) {
    const R = this.R
    for (let tries = 0; tries < 40; tries++) {
      const e = LANES[Math.floor(R() * LANES.length)]
      if (e.closed) continue
      const s = 6 + R() * (e.len - 12)
      const px = e.x0 + e.dx * s,
        pz = e.z0 + e.dz * s
      const d = Math.hypot(px - x, pz - z)
      if (d < rMin || d > rMax) continue
      if (
        view &&
        d < 240 &&
        (px - view.x) * view.fx + (pz - view.z) * view.fz > 0
      )
        continue
      if (e.cars.some(o => Math.abs(o.s - s) < o.len + 10)) continue
      const car = this.make(this.pickType())
      car.edge = e
      car.s = s
      car.v = car.v0 * 0.6
      this.insert(e, car)
      car.next = this.choose(e, car)
      this.place(car)
      this.n++
      return car
    }
    return null
  }
  // clear the road round (x, z), where the Roadster is about to be put back
  clearAround (x, z, r) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]
      if (!c.parked && Math.hypot(c.x - x, c.z - z) < r) this.remove(i)
    }
  }
  remove (i) {
    const c = this.cars[i]
    this.detach(c)
    this.cars.splice(i, 1)
    if (!c.parked) this.n--
  }

  // keep each lane's cars sorted by distance along it
  insert (e, car) {
    const list = e.cars
    let i = list.length
    while (i > 0 && list[i - 1].s > car.s) i--
    list.splice(i, 0, car)
  }
  detach (car) {
    const list = car.edge?.cars
    const i = list ? list.indexOf(car) : -1
    if (i >= 0) list.splice(i, 1)
  }
  // Where to go at the end of this lane: mostly straight on, sometimes a turn, which can mean
  // moving over to the other lane first (unless `own`). Never into the jammed street.
  choose (e, car, own = false) {
    const open = o => !o.next[0].closed
    const straight = e.next.find(o => o.move === 'S' && open(o))
    if (straight && this.R() < (car.type === BUS ? 0.9 : 0.6)) return straight
    const turns = e.next.filter(o => o !== straight && open(o))
    if (!own && e.twin)
      for (const o of e.twin.next) if (o.move !== 'S' && open(o)) turns.push(o)
    return turns.length
      ? turns[Math.floor(this.R() * turns.length)]
      : straight || null
  }
  // room to pull into lane t beside the car: a safe gap to the cars there, nothing stopped in the way
  // (the Roadster's own autopilot asks with skipMe, as the Roadster is the one pulling over)
  canMerge (t, car, skipMe = false) {
    for (const o of t.cars) {
      const d = o.s - car.s,
        need = (o.len + car.len) / 2 + 3
      if (d >= 0 && d < need + Math.max(0, car.v - o.v) * 2) return false
      if (d < 0 && -d < need + Math.max(0, o.v - car.v) * 2 + o.v * 0.6)
        return false
    }
    pointAt(t, car.s, P)
    for (const o of this.me && !skipMe ? [this.me, ...this.loose] : this.loose)
      if (Math.abs(o.x - P.x) < 9 && Math.abs(o.z - P.z) < 9) return false
    return true
  }
  swap (car) {
    const t = car.edge.twin
    car.lat0 = LANE_OFF[car.edge.lane] - LANE_OFF[t.lane]
    car.lc = 1e-6
    car.stuck = 0
    this.detach(car)
    car.edge = t
    this.insert(t, car)
    if (!t.next.includes(car.next)) car.next = this.choose(t, car, true)
  }
  place (car) {
    pointAt(car.edge, car.s, P)
    let x = P.x,
      z = P.z,
      yaw = Math.atan2(-P.hz, P.hx)
    if (car.lc) {
      // ease across from the old lane, the nose turned a little into the move
      const u = car.lc,
        lat = car.lat0 * (1 - u * u * (3 - 2 * u))
      const rate = (-car.lat0 * 6 * u * (1 - u) * Math.max(car.v, 3)) / CHANGE
      x -= P.hz * lat
      z += P.hx * lat
      yaw -= Math.atan2(rate, Math.max(car.v, 1))
    }
    car.x = x
    car.z = z
    this.setYaw(car, yaw)
  }

  step (dt, sim, view) {
    this.t += dt
    // things in the way that aren't simply the car ahead in the lane: wrecks, and cars crossing
    // an intersection (a left turn cutting across, a straggler on the old green)
    this.loose.length = 0
    this.box.length = 0
    for (const c of this.cars)
      if (c.loose) this.loose.push(c)
      else if (!c.parked && (c.edge.move || c.lc)) this.box.push(c)
    const pl = sim.mode === 'ground' ? sim.pos : sim.com
    this.me = sim.mode !== 'ramp' && pl.y < 4 ? pl : null
    this.mev = sim.vel
    for (const car of this.cars)
      if (car.loose) slide(this, car, dt, sim)
      else if (!car.parked) this.drive(car, dt)
    collidePlayer(this, sim)
    this.clock += dt
    if (this.clock > 0.25) {
      this.clock = 0
      this.recycle(sim.pos.x, sim.pos.z, view)
    }
  }

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
  }
  // the Roadster, or a car knocked out of its lane, in this car's path
  obstacle (car, ox, oz, ovx, ovz, half, gap) {
    const dx = ox - car.x,
      dz = oz - car.z
    const along = dx * car.hx + dz * car.hz
    if (along <= 0 || along > LOOK) return gap
    if (Math.abs(dz * car.hx - dx * car.hz) > car.wid / 2 + 1.5) return gap
    const g = along - car.len / 2 - half
    if (g >= gap) return gap
    this.vl = Math.max(0, ovx * car.hx + ovz * car.hz)
    return g
  }

  // Is anything coming the other way that a left turn into `node` would cut across?
  oncoming (node, dir) {
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
        if (o.next?.move !== 'L' && (d < 6 || d < o.v * 6)) return true
      }
    }
    return false
  }

  drive (car, dt) {
    const e = car.edge
    // move over to the other lane: for a turn from there, or to get round something stopped here
    if (e.road && e.twin && !car.lc && car.next) {
      const forTurn = !e.next.includes(car.next)
      if (forTurn || car.stuck > 2.5) {
        if (car.s > 4 && car.s < e.len - 22 && this.canMerge(e.twin, car))
          this.swap(car)
        else if (forTurn && car.s >= e.len - 22)
          car.next = this.choose(e, car, true) // missed the chance: go another way
      }
    }
    let gap = this.leader(car),
      vl = this.vl,
      blocked = false
    const me = this.me,
      mv = this.mev
    const see = (x, z, vx, vz, half) => {
      const g = this.obstacle(car, x, z, vx, vz, half, gap)
      if (g < gap) {
        gap = g
        vl = this.vl
        blocked = vl < 0.5
      }
    }
    if (me) see(me.x, me.z, mv.x, mv.z, CAR.halfL)
    for (const o of this.loose) see(o.x, o.z, o.vx, o.vz, o.len / 2)
    for (const o of this.box)
      if (o !== car && o.edge !== e)
        see(o.x, o.z, o.hx * o.v, o.hz * o.v, o.len / 2)
    // the signal at the end of this lane; a left turn also waits for a gap in the oncoming traffic
    if (e.road && car.next && car.go !== e) {
      const toLine = e.len - car.s - car.len / 2
      if (toLine < LOOK && toLine > -1) {
        const node = NODES[e.to],
          st = signal(node, e.dir, this.t)
        let stop = st !== GREEN
        if (
          st === YELLOW &&
          car.v * car.v > 2 * STOP_DECEL * Math.max(0, toLine - 0.5)
        ) {
          car.go = e // too close to stop: carry on through
          stop = false
        }
        if (!stop && car.next.move === 'L' && toLine < 30)
          stop = this.oncoming(node, e.dir)
        if (stop && toLine - 1.4 < gap) {
          gap = toLine - 1.4 // the bumper stops just behind the painted line
          vl = 0
          blocked = false
        }
      }
    }
    car.stuck = blocked && car.v < 0.5 ? car.stuck + dt : 0
    // slow for the corner ahead: the speed from which it can still brake gently down to the turn's
    let v0 = Math.min(car.v0, e.vmax)
    if (car.next && car.next.vmax < v0)
      v0 = Math.min(
        v0,
        Math.sqrt(car.next.vmax ** 2 + 2 * 2 * Math.max(0, e.len - car.s - 1))
      )
    const v = car.v
    let acc = A * (1 - (v / Math.max(v0, 0.1)) ** 4)
    if (gap < LOOK) {
      const ss =
        S0 + Math.max(0, v * HEADWAY + (v * (v - vl)) / (2 * Math.sqrt(A * B)))
      acc -= A * (ss / Math.max(gap, 0.2)) ** 2
    }
    acc = clamp(acc, -9, A)
    car.brake = acc < -1 || v < 0.3
    car.v = Math.max(0, v + acc * dt)
    car.s += car.v * dt
    car.odo += car.v * dt
    if (car.lc && (car.lc += (dt * Math.max(car.v, 3)) / CHANGE) >= 1)
      car.lc = 0
    while (car.s > car.edge.len) {
      const nx = car.next
      if (!nx) {
        car.s = car.edge.len
        car.v = 0
        break
      }
      car.s -= car.edge.len
      this.detach(car)
      car.edge = nx
      car.go = null
      this.insert(nx, car)
      car.next = this.choose(nx, car)
    }
    this.place(car)
  }

  // drop cars that fell far behind (or were wrecked long ago) and refill the streets around (x, z)
  recycle (x, z, view) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]
      if (c.parked) continue
      const d = Math.hypot(c.x - x, c.z - z)
      if (d > this.radius + 40 || (c.loose && c.looseT > 20 && d > 40))
        this.remove(i)
    }
    for (let k = 0; k < 4 && this.n < this.count; k++)
      this.spawn(x, z, 150, this.radius, view)
  }
}
