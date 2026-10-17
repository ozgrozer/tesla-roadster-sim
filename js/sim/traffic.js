// City traffic: each driver their own (drivers.js), following the lane graph, keeping their
// distance (intelligent driver model, eased on the pedals), stopping for red lights, slowing for
// corners and for the Roadster, and knocked loose when it hits them (wrecks.js). They signal before
// a lane change or a turn, honk at a Roadster that holds them up or cuts them up, move over when it
// honks at them from behind, brake and swerve when it comes at them (react.js), and stop for anyone
// on foot in the road (peds.js). Nobody honks until the Roadster has sounded its own horn at the
// gridlock: the first horn in the city is the Roadster's.
// Traffic lives in a bubble round the player: cars far behind are recycled into the streets ahead.
// Cars far off are driven less often (a longer step every second or fourth one), and a car that has
// not moved for a long while out of sight is taken off the road.
import { JAM, atJam } from './jam.js'
import { REACT } from './react.js'
import { SIGHT } from './sight.js'
import { nearMisses } from './stunts.js'
import { slide, collidePlayer, bumpLoose } from './wrecks.js'
import { DRIVE, temperament } from './drivers.js'
import { rng, NODES, EDGES, LANES, STALLS, pointAt, LANE_OFF } from './city.js'

// cruise: the speed an ordinary driver likes (m/s); acc, brake: how hard they pull away and brake;
// lat: the sideways acceleration they take a corner at
// prettier-ignore
export const TYPES = [
  { name: 'sedan', len: 4.7, wid: 1.85, hgt: 1.45, m: 1600, share: 30, cruise: 13.4, acc: 2.6, brake: 3.2, lat: 2.9 },
  { name: 'hatch', len: 4.1, wid: 1.78, hgt: 1.5, m: 1300, share: 16, cruise: 13.2, acc: 2.5, brake: 3.2, lat: 2.9 },
  { name: 'suv', len: 4.85, wid: 1.95, hgt: 1.75, m: 2100, share: 20, cruise: 13.4, acc: 2.4, brake: 3.1, lat: 2.5 },
  { name: 'taxi', len: 4.8, wid: 1.85, hgt: 1.62, m: 1650, share: 9, cruise: 14, acc: 2.8, brake: 3.4, lat: 3 },
  { name: 'pickup', len: 5.4, wid: 2.0, hgt: 1.85, m: 2300, share: 10, cruise: 13.4, acc: 2.2, brake: 3, lat: 2.4 },
  { name: 'van', len: 6.4, wid: 2.15, hgt: 2.8, m: 3800, share: 7, cruise: 12.4, acc: 1.7, brake: 2.8, lat: 2.1 },
  { name: 'bus', len: 11.6, wid: 2.55, hgt: 3.15, m: 12500, share: 3, cruise: 10.6, acc: 1.15, brake: 2.4, lat: 1.6 }
]
const BUS = TYPES.findIndex(t => t.name === 'bus')
const SHARES = TYPES.reduce((a, t) => a + t.share, 0)

const P = { x: 0, z: 0, hx: 1, hz: 0 }
const TURNS = [] // (choose's scratch list)

// Every field of the first car is set once to what it may later hold and back: a numeric one to a
// fraction, any other to numbers and objects of more than one kind. V8 keeps one shape for all the
// cars made from the same literal; with each field ready from the start for whatever it will hold,
// that shape never has to change when a car first stores something new in one (which throws away
// the optimised code driving them all, and while it is away every number the drivers work out
// costs an allocation).
let WARM = false
const KINDS = [{ a: 1 }, { b: 1 }, [0]]
export function warm (o) {
  for (const k in o) {
    const v = o[k]
    o[k] = 0.5
    if (typeof v !== 'number') for (const w of KINDS) o[k] = w
    o[k] = v
  }
}

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
    this.walker = null // { x, z } of someone crossing on foot
    this.peds = [] // people in the road (peds.js keeps it)
    this.horn = false // the Roadster's horn is sounding
    this.quiet = true // no driver honks yet
    this.ids = 0
    this.frame = 0
    this.wasAir = false
    this.heard = [] // crashes in traffic since the people last looked: { x, z, r } (crowd.js)
    this.ahead = null // (sight.js: the car ahead in the lane, after leader())
    this.seen = { gap: 0, vl: 0, blk: null } // (drivers.js: what is in the way)
    warm(this.seen)
    this.margin = 0.5 // (sight.js: room a driver leaves either side)
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
    this.quiet = true
    this.wasAir = false // (a reset mid-air is no landing)
    this.heard.length = 0
    for (const n of NODES) n.hold = null // every light on its cycle
    for (const st of STALLS) if (st.taken) this.park(st)
    for (const e of JAM) this.jam(e)
    for (let i = 0; i < this.count * 6 && this.n < this.count; i++)
      this.spawn(x, z, 24, this.radius)
  }

  // a car of the given type; with a driver (not one parked in a lot or the jam) their temperament
  make (type, driver = true) {
    const T = TYPES[type]
    const car = {
      id: this.ids++,
      type,
      len: T.len,
      wid: T.wid,
      hgt: T.hgt,
      m: T.m,
      I: (T.m * (T.len * T.len + T.wid * T.wid)) / 12,
      paint: this.R(),
      v0: T.cruise,
      edge: null,
      next: null,
      go: null, // the lane on which it decided to carry on through an amber
      stop: null, // the lane on which it decided to stop for one
      s: 0,
      v: 0,
      acc: 0, // its acceleration just now (the pedals, eased)
      x: 0,
      z: 0,
      hx: 1,
      hz: 0,
      yaw: 0,
      yr: 0, // yaw rate
      odo: 0,
      lc: 0, // lane change progress, 0 to 1 (0 when not changing)
      lcLen: 30, // m of road it takes
      lat0: 0, // sideways offset from the new lane when the change began
      from: null, // (and the lane it is leaving)
      off: 0, // steered off the lane's line, m to the right
      psi: 0, // and heading off its line, to the right
      offT: 0, // the offset it steers for
      stuck: 0, // s spent stopped behind something that isn't moving with the traffic
      still: 0, // s spent at a standstill, for whatever reason
      blk: null, // what holds it up
      homeX: 0, // parked (in a lot, or the jam): where, to be put back there after a knock
      homeZ: 0,
      homeYaw: 0,
      clear: 1e3, // m clear ahead of it on its way, last it looked
      rev: 0, // backing up out of a standoff: s left
      squeeze: 0, // edging past one: s left
      boxT: 0, // when it came into the junction it is in
      wake: 0, // s since it could have moved off, standing
      idle: 0, // s stopped at the line
      short: 0, // how far short of the line it stops (it creeps up)
      lw: 0, // s spent at the line waiting to turn left across the oncoming traffic
      want: 0, // waiting to move over: 1 left, 2 right
      sigT: 0, // s it has been signalling for
      passT: 0, // s until it looks at overtaking again
      panic: 0, // s left of a fright (react.js)
      scare: false, // (and the trouble is in front: on the brakes)
      sig: 0, // indicators: 0 off, 1 left, 2 right, 3 hazards (knocked loose)
      horn: 0, // which horn it has (0 to 1)
      honkT: 0, // s until it will honk again
      annoy: 0, // s spent held up by the Roadster
      honkIn: 0, // a honk on its way, after a knock
      yieldT: 0, // honked at from behind: s it keeps trying to move over
      tuck: false, // (and tucked in towards the kerb for it)
      shaken: 0, // knocked loose: s it sits there, hazards on, before driving on
      big: type === BUS,
      brake: false,
      parked: false,
      loose: false,
      looseT: 0,
      lod: 1, // driven every lod-th step
      lodT: 0,
      vx: 0,
      vz: 0,
      w: 0,
      // the driver (drivers.js temperament; parked cars keep these)
      bold: 0,
      a: 2,
      b: 3,
      T: 1.4,
      s0: 2.2,
      react: 0.8,
      jerk: 3,
      lat: 2.5,
      amber: 4,
      runner: false,
      patience: 8,
      lead: 1.5,
      short0: 1,
      gapT: 4.5,
      // (fields other parts keep on each car, set here so every car has the same shape: tween.js,
      // the body on its springs in render/traffic.js, stunts.js, the sound. The tween's start at 0:
      // no car stands within its 5 m of the origin, so none is blended from there)
      px: 0,
      pz: 0,
      pyaw: 0,
      podo: 0,
      cx: 0,
      cz: 0,
      cyaw: 0,
      codo: 0,
      pitch: 0,
      pitchV: 0,
      roll: 0,
      rollV: 0,
      steer: 0,
      ryaw: 0,
      miss: undefined,
      sndV: undefined,
      sndLv: undefined,
      sndAlarm: false,
      jam: false
    }
    if (!WARM) {
      warm(car)
      WARM = true
    }
    car.horn = (car.paint * 7.31) % 1
    if (driver) temperament(car, this.R, T)
    car.short = car.short0 || 1
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
    const car = this.make(this.pickType(true), false)
    car.parked = true
    car.x = car.homeX = st.x
    car.z = car.homeZ = st.z
    this.setYaw(car, (car.homeYaw = st.yaw))
  }
  // a lane of the jammed street: nose to tail, a little out of line, brake lights on (and buses
  // only in the kerb lane). The queue's tail stands a car's length and a bit in from the junction,
  // so whoever joins it (Autopilot, on its way to fly over it) is in the street, clear of the box.
  jam (e) {
    const R = this.R
    for (let s = 7.5 + R() * 1.5; ; ) {
      const type = this.pickType(e.lane === 0),
        len = TYPES[type].len
      if (s + len > e.len - 0.5) break
      const car = this.make(type, false)
      car.parked = car.brake = car.jam = true
      pointAt(e, s + len / 2, P)
      const lat = (R() - 0.5) * 0.5
      car.x = car.homeX = P.x - P.hz * lat
      car.z = car.homeZ = P.z + P.hx * lat
      car.homeYaw = Math.atan2(-P.hz, P.hx) + (R() - 0.5) * 0.06
      this.setYaw(car, car.homeYaw)
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
      const s = 6 + R() * (e.len - 36) // (well back from the line, to stop for a red there)
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
      // (clear of the cars in the lane and beside it, one changing lanes included)
      const near = o => Math.abs(o.s - s) < o.len + 10 + o.v * 1.5
      if (e.cars.some(near) || e.twin?.cars.some(near)) continue
      // (and of anyone on foot in the road, and any wreck)
      const by = o => Math.abs(o.x - px) < 12 && Math.abs(o.z - pz) < 12
      if (this.peds.some(by) || this.loose.some(by)) continue
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
  restore (c, x, z, view) {
    for (const [px, pz] of [[c.x, c.z], [c.homeX, c.homeZ]]) {
      const d = Math.sqrt((px - x) ** 2 + (pz - z) ** 2)
      const seen =
        view && d < 260 && (px - view.x) * view.fx + (pz - view.z) * view.fz > -12
      if (d < 60 || seen) return
    }
    c.loose = false
    c.x = c.homeX
    c.z = c.homeZ
    this.setYaw(c, c.homeYaw)
    c.vx = c.vz = c.w = c.yr = 0
    c.sig = 0
    c.honkIn = 0
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
    let straight = null
    for (const o of e.next)
      if (o.move === 'S' && !o.next[0].closed) straight = o
    if (straight && this.R() < (car.type === BUS ? 0.9 : 0.6)) return straight
    const turns = TURNS
    turns.length = 0
    for (const o of e.next)
      if (o !== straight && !o.next[0].closed) turns.push(o)
    if (!own && e.twin)
      for (const o of e.twin.next)
        if (o.move !== 'S' && !o.next[0].closed) turns.push(o)
    return turns.length
      ? turns[Math.floor(this.R() * turns.length)]
      : straight || null
  }
  // a crash for the people to hear (crowd.js), kept until they next look
  hear (x, z, r) {
    if (this.heard.length < 16) this.heard.push({ x, z, r })
  }
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
  }

  step (dt, sim, view) {
    this.t += dt
    this.frame++
    // things in the way that aren't simply the car ahead in the lane: wrecks, and cars crossing
    // an intersection (a left turn cutting across, a straggler on the old green, one stopped at the
    // red with its nose over the line), changing lanes or off their lane's line
    this.loose.length = 0
    this.box.length = 0
    for (const c of this.cars)
      if (c.loose) this.loose.push(c)
      else if (
        !c.parked &&
        (c.edge.move ||
          c.lc ||
          Math.abs(c.off) > 0.3 ||
          c.s + c.len / 2 > c.edge.len)
      )
        this.box.push(c)
    const pl = sim.mode === 'ground' ? sim.pos : sim.com
    this.me = sim.mode !== 'ramp' && pl.y < 4 ? pl : null
    if (this.quiet && this.horn && atJam(pl.x, pl.z)) this.quiet = false
    this.mev = sim.vel
    this.sim = sim
    this.mhx = Math.cos(sim.yaw)
    this.mhz = -Math.sin(sim.yaw)
    // the Roadster coming down on the street from the air: everyone in front of it panics
    if (this.wasAir && sim.mode === 'ground' && pl.y < 1) this.landing(pl.x, pl.z)
    this.wasAir = sim.mode === 'air'
    for (const car of this.cars)
      if (car.loose) slide(this, car, dt, sim)
      else if (!car.parked) {
        car.lodT += dt
        if (car.lod > 1 && (this.frame + car.id) % car.lod) continue
        this.drive(car)
        car.lodT = 0
      }
    bumpLoose(this, sim)
    collidePlayer(this, sim)
    nearMisses(this, sim)
    this.clock += dt
    if (this.clock > 0.25) {
      this.clock = 0
      this.recycle(sim.pos.x, sim.pos.z, view)
    }
  }

  // Drop cars that fell far behind (or were wrecked long ago, or have stood still for a minute, out
  // of sight) and refill the streets around (x, z). And how often each car is driven: every step
  // near the Roadster or in sight, every second or fourth one further off.
  recycle (x, z, view) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]
      if (c.parked) {
        // (knocked out of its place a while ago and out of sight: back in it, as if towed and
        // parked again, so wrecks don't pile up)
        if (c.loose && c.looseT > 20) this.restore(c, x, z, view)
        continue
      }
      const d = Math.sqrt((c.x - x) ** 2 + (c.z - z) ** 2)
      const seen =
        view &&
        d < 260 &&
        (c.x - view.x) * view.fx + (c.z - view.z) * view.fz > -12
      if (
        d > this.radius + 40 ||
        (c.loose && c.looseT > 20 && d > 40 && !seen) ||
        (c.still > 60 && d > 60 && !seen)
      ) {
        this.remove(i)
        continue
      }
      c.lod = d < 110 || (seen && d < 200) ? 1 : seen || d < 170 ? 2 : 4
    }
    for (let k = 0; k < 4 && this.n < this.count; k++)
      this.spawn(x, z, 150, this.radius, view)
  }
}
Object.assign(Traffic.prototype, SIGHT, DRIVE, REACT)
