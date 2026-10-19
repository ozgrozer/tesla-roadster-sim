// The traffic's cars as entities others can take over, mixed into Traffic (traffic.js). Every car
// keeps a stable id for as long as it is on the map (car.id); the player's workstream finds one by
// it (carById) or by where it is (carsNear), takes it off its driver (takeOver: out of the lane
// graph, out of the AI's hands, drawn where the player's body puts it: vehicleLink.js), puts the
// driver out on the pavement as someone on foot (ejectDriver, alight.js), and hands it back when
// done (handBack: left parked where it stands, or given a driver who takes it back into traffic).
// Also the drivers' moods (an angry driver after a knock presses on, close behind, on the horn),
// their driving style, the last-resort gridlock watchdog and how busy each district is.
import { TYPES } from './carTypes.js'
import { LANES, PITCH, N } from './city.js'
import { AREAS, areaOf } from './areas.js'
import { temperament } from './drivers.js'
import { honk } from './manners.js'
import { kerbDist } from './street.js'

// how busy each kind of neighbourhood's streets are, against the city's average (areas.js kinds)
// (a share of Traffic.count, the busiest district's rush; only with traffic.districts on: main.js)
export const DISTRICT = {
  downtown: 1,
  towers: 1,
  boulevard: 0.95,
  strip: 0.9,
  beach: 0.85,
  venice: 0.75,
  estates: 0.55
}
export const STYLE = { cautious: 0, normal: 1, aggressive: 2 }
const GRID_SQUEEZE = 14, // s held up by something that will not move: edge past it at a crawl
  GRID_DROP = 22 // s: still held up, out of sight, it is taken off the road (and refilled elsewhere)
const ANGRY = 18 // s a driver stays angry after a knock

export const HANDOVER = {
  carById (id) {
    for (const c of this.cars) if (c.id === id) return c
    return null
  },
  // the cars within r of (x, z), nearest first (parked and loose ones too; not one already taken)
  carsNear (x, z, r, out = []) {
    out.length = 0
    for (const c of this.cars)
      if (!c.ctl && (c.x - x) ** 2 + (c.z - z) ** 2 < r * r) out.push(c)
    out.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))
    return out
  },
  // Off the AI: out of its lane (or its slide), no longer driven, recycled, towed or parked back,
  // and never collided with as traffic (the player's body is the player: wrecks.js collidePlayer
  // skips it). ctl: who has it ('player', or a workstream's own tag). Returns the car, or null.
  takeOver (ref, ctl = 'player') {
    const car = typeof ref === 'object' ? ref : this.carById(ref)
    if (!car || car.ctl) return null
    if (car.siren) this.callGone(car)
    this.detach(car)
    if (!car.parked) this.n--
    if (!car.loose) {
      car.vx = car.hx * car.v
      car.vz = car.hz * car.v
      car.w = car.yr || 0
    }
    Object.assign(car, { parked: true, loose: false, jam: false, ctl, lc: 0, off: 0, offT: 0 })
    Object.assign(car, { panic: 0, rev: 0, squeeze: 0, sig: 0, brake: false, drop: null, siren: 0 })
    car.edge = car.next = null
    this.quiet = false // (a GTA city: the drivers honk from now on)
    return car
  },
  // Given back: left where it stands, parked (to be knocked about and put back there, as a parked
  // car is), or with a driver (rejoin: true) who takes it back into the nearest lane it lines up
  // with, if there is one within 3 m. Returns whether it is back in traffic.
  handBack (car, { rejoin = false } = {}) {
    if (!car?.ctl) return false
    car.ctl = null
    car.v = 0
    car.homeX = car.x
    car.homeZ = car.z
    car.homeYaw = car.yaw
    car.abandoned = !rejoin
    if (!rejoin) return false
    let best = null,
      bs = 0,
      bd = 3
    for (const e of LANES) {
      if (e.closed || e.dx * car.hx + e.dz * car.hz < 0.8) continue
      const s = (car.x - e.x0) * e.dx + (car.z - e.z0) * e.dz
      if (s < 2 || s > e.len - 8) continue
      const d = Math.abs((car.z - e.z0) * e.dx - (car.x - e.x0) * e.dz)
      if (d < bd) {
        bd = d
        best = e
        bs = s
      }
    }
    if (!best) return false
    temperament(car, this.R, TYPES[car.type])
    Object.assign(car, { parked: false, abandoned: false, edge: best, s: bs, stuck: 0, still: 0 })
    this.insert(best, car)
    car.next = this.choose(best, car)
    this.place(car)
    this.n++
    return true
  },
  // The driver put out of car on its side nearer the pavement (or side: 1 left, -1 right), as
  // someone on foot (peds.js picks them up from traffic.exits: alight.js); jacked: dragged out, so
  // they run off (and the people round about see it). Returns the door they leave by.
  ejectDriver (car, { side = 0, jacked = true } = {}) {
    const lx = car.hz,
      lz = -car.hx // (the car's left)
    let sg = side
    if (!sg) {
      const o = car.wid / 2 + 1.5
      sg =
        kerbDist(car.x + lx * o, car.z + lz * o) <
        kerbDist(car.x - lx * o, car.z - lz * o)
          ? 1
          : -1
    }
    const e = {
      x: car.x + lx * sg * (car.wid / 2 + 0.5),
      z: car.z + lz * sg * (car.wid / 2 + 0.5),
      ox: lx * sg,
      oz: lz * sg,
      jacked,
      car: car.id
    }
    this.exits.push(e)
    return e
  },
  // A knock (or being cut up): the driver is angry for a while: honks, presses on closer behind
  anger (car, impact = 5) {
    if (car.parked || car.ctl) return
    car.angry = Math.max(car.angry, ANGRY * Math.min(1.5, impact / 6))
    if (car.honkT <= 0) honk(this, car, true)
  },
  // (each step, an angry driver's ways: v0 and the gap, put back as it wears off)
  mood (car, dt) {
    const was = car.angry > 0
    car.angry = Math.max(0, car.angry - dt)
    const k = car.angry > 0 ? 1 : 0
    if (k && !car.mad) {
      car.mad = true
      car.v0 *= 1.25
      car.T *= 0.6
      car.a *= 1.3
      car.patience *= 0.3
    } else if (!k && was && car.mad) {
      car.mad = false
      car.v0 /= 1.25
      car.T /= 0.6
      car.a /= 1.3
      car.patience /= 0.3
    }
  },
  // The last resort against gridlock (react.js sorts out the usual standoffs): held up by something
  // that will not move for GRID_SQUEEZE s, a car edges past it at a crawl (but not past the player);
  // still there after GRID_DROP s and out of sight, it is taken off (true: remove it).
  // (and the queue behind one taken off goes with it, out of sight)
  gridlock (c, d, seen) {
    if (c.v > 1) c.jammed = false
    if (c.blk?.jammed && c.stuck > 3 && !seen && d > 30) return (c.jammed = true)
    if (c.stuck < GRID_SQUEEZE || c.blk === this.me) return false
    if (!c.squeeze && !c.rev) c.squeeze = 3
    c.jammed = c.stuck > GRID_DROP && !seen && d > 30
    // (what held it up is known for a blockage now: the next one behind it goes sooner)
    if (c.jammed && c.blk && c.blk.len && c.blk.v < 0.5) c.blk.jammed = true
    return c.jammed
  },
  // how busy the streets round (x, z) are, against the city's average (DISTRICT)
  areaShare (x, z) {
    if (!this.districts) return 1
    const bx = Math.floor(x / PITCH + N / 2),
      bz = Math.floor(z / PITCH + N / 2)
    const a = AREAS[areaOf(bx, bz)]
    return (a && DISTRICT[a.kind]) || 1
  }
}

// a driver's style, from their nerve (drivers.js temperament): cautious, normal or aggressive
export const styleOf = car =>
  car.bold < 0.3 ? STYLE.cautious : car.bold > 0.72 ? STYLE.aggressive : STYLE.normal
