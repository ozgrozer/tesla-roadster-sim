// Street events near the player now and then (GTA's random events): a crash scene (two wrecked cars
// in the road, hazards on, a police car parked by them, its lights going, people stopping to look),
// the police chasing someone (a traffic car taken over and driven off fast along the lane graph, a
// police unit after it), a street race (two sports cars flat out to somewhere across town) and a
// fight on the pavement (two people squaring up, everyone keeping back to watch). One at a time, a
// while apart, put down out of the camera's sight between NEAR and FAR m off, and cleared away once
// it is over and out of sight. Pure: no DOM.
import { rng, LANES } from './city.js'
import { IDX } from './carTypes.js'
import { hurt } from './carDamage.js'
import { loosen } from './wrecks.js'
import { stepVehicle, makeVehicleInput } from './vehicleSim.js'
import { bodyFromTraffic, writeToTraffic } from './vehicleLink.js'
import { collideTraffic } from './vehicleHit.js'
import { Planner, Follower, steerTo, blocker, unstick, cornerV } from './aiDriver.js'
import { spawnPoint, inView } from './police.js'
import { bounds } from './missions/spots.js'

export const KINDS = ['crash', 'chase', 'race', 'fight']
export const GAP = [50, 100] // s between one event and the next
const NEAR = 70,
  FAR = 170
const LAST = { crash: 70, chase: 55, race: 50, fight: 30 } // s each lasts at most

export class Ambient {
  constructor (traffic, peds, police, { seed = 99107 } = {}) {
    Object.assign(this, { traffic, peds, police })
    this.R = rng(seed)
    this.planner = new Planner(30)
    this.ev = null // the event on now
    this.wait = 30 // s to the first
    this.on = true
    this.drivers = [] // the cars it drives: { car, body, inp, follow, goal, v }
  }
  // the event on now, for the radar and the tests: { kind, x, z, t }
  get current () {
    return this.ev
  }
  step (dt, player, view, busy = false) {
    const ev = this.ev
    if (!ev) {
      if (!this.on || busy) return
      if ((this.wait -= dt) > 0) return
      this.wait = GAP[0] + this.R() * (GAP[1] - GAP[0])
      this.start(KINDS[Math.floor(this.R() * KINDS.length)], player, view)
      return
    }
    ev.t += dt
    for (const d of this.drivers) this.drive(d, dt)
    if (ev.kind === 'fight') this.fight(ev, dt)
    if (ev.kind === 'chase' && ev.suspect) {
      const b = ev.suspect.body
      Object.assign(ev.target, { x: b.x, z: b.z, vx: b.vx, vz: b.vz })
    }
    // (where it is, for the radar: the cars' middle)
    if (this.drivers.length) {
      ev.x = this.drivers[0].body.x
      ev.z = this.drivers[0].body.z
    }
    const d = Math.hypot(ev.x - player.pos.x, ev.z - player.pos.z)
    const over = ev.t > LAST[ev.kind] || d > 380
    if (over && (!inView(view, ev.x, ev.z) || d > 300)) this.end()
  }
  // start an event of kind (or a random one) near the player; returns it or null
  start (kind, player, view) {
    const P = player.pos
    const ev = { kind, x: P.x, z: P.z, t: 0, cars: [], units: [], peds: [], target: null }
    let ok = false
    if (kind === 'crash') ok = this.crash(ev, P, view)
    else if (kind === 'chase') ok = this.chase(ev, P, view)
    else if (kind === 'race') ok = this.race(ev, P, view)
    else if (kind === 'fight') ok = this.brawl(ev, P, view)
    if (!ok) {
      this.end(ev)
      this.wait = 8
      return null
    }
    this.ev = ev
    return ev
  }
  end (ev = this.ev) {
    if (!ev) return
    const tr = this.traffic
    for (const d of this.drivers) {
      // (handed back to a driver of its own if it lines up with a lane; otherwise off the road)
      if (!tr.handBack(d.car, { rejoin: true })) {
        const i = tr.cars.indexOf(d.car)
        if (i >= 0) tr.cars.splice(i, 1)
      }
    }
    this.drivers.length = 0
    for (const u of ev.units) this.police.remove(u)
    for (const p of ev.peds) if (p.state === 'idle') p.idleT = 0
    if (ev === this.ev) this.ev = null
  }

  // two cars knocked loose in the road, dented, hazards on; a police car stopped behind them
  crash (ev, P, view) {
    const at = spawnPoint(P.x, P.z, view, this.R, { rMin: NEAR, rMax: FAR })
    if (!at) return false
    const tr = this.traffic,
      e = at.lane
    tr.clearAround(at.x, at.z, 18)
    for (let k = 0; k < 2; k++) {
      const car = tr.make(this.pick(), true, this.R)
      const off = k ? 4.2 : -1.2
      car.x = at.x + e.dx * off * 1.4 - e.dz * (k ? 2.2 : -0.4)
      car.z = at.z + e.dz * off * 1.4 + e.dx * (k ? 2.2 : -0.4)
      tr.setYaw(car, at.yaw + (k ? 1.1 : -0.35))
      tr.n++
      loosen(tr, car)
      car.vx = car.vz = 0
      car.shaken = 120 // (they stay put, hazards on, the drivers out)
      hurt(car, car.x + car.hx * car.len * 0.45, car.z + car.hz * car.len * 0.45, 13, 1600, tr.t)
      ev.cars.push(car)
    }
    const back = { x: at.x - e.dx * 16, z: at.z - e.dz * 16, yaw: at.yaw + 0.2, v: 0 }
    ev.units.push(this.police.add(back, 'scene'))
    ev.x = at.x
    ev.z = at.z
    this.peds.threat?.(at.x, at.z, 16, 1, 40)
    return true
  }
  // someone in a car driven off fast, a police car after them
  chase (ev, P, view) {
    const tr = this.traffic
    const at = spawnPoint(P.x, P.z, view, this.R, { rMin: NEAR + 20, rMax: FAR + 40 })
    if (!at) return false
    const car = tr.make(this.pick(), true, this.R)
    car.parked = true
    car.x = at.x
    car.z = at.z
    tr.setYaw(car, at.yaw)
    const d = this.driver(car, 'suspect', 31, 15)
    if (!d) return false
    ev.suspect = d
    ev.target = { x: at.x, z: at.z, vx: 0, vz: 0 }
    const back = { x: at.x - at.lane.dx * 22, z: at.z - at.lane.dz * 22, yaw: at.yaw, v: 13 }
    const u = this.police.add(back, 'npc')
    u.target = ev.target
    ev.units.push(u)
    return true
  }
  // two sports cars side by side, flat out
  race (ev, P, view) {
    const tr = this.traffic
    const at = spawnPoint(P.x, P.z, view, this.R, { rMin: NEAR, rMax: FAR })
    if (!at || !at.lane.twin) return false
    const goal = this.far(at)
    for (const L of [at.lane, at.lane.twin]) {
      const car = tr.make(IDX.sports ?? 0, true, this.R)
      car.parked = true
      car.x = L.x0 + L.dx * at.s
      car.z = L.z0 + L.dz * at.s
      tr.setYaw(car, at.yaw)
      if (!this.driver(car, 'racer', 36 + this.R() * 4, 6, goal)) return false
    }
    return true
  }
  // two people on the pavement squaring up; the people round about stop to watch
  brawl (ev, P) {
    const list = this.peds.list || []
    let a = null,
      b = null
    for (const p of list) {
      if (p.state !== 'walk' || p.lead || p.dead) continue
      const d = Math.hypot(p.x - P.x, p.z - P.z)
      if (d < 30 || d > 120) continue
      for (const q of list)
        if (q !== p && q.state === 'walk' && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < 9) {
          a = p
          b = q
          break
        }
      if (a) break
    }
    if (!a) return false
    for (const p of [a, b]) {
      p.state = 'idle'
      p.idleT = LAST.fight
      p.act = 2
      p.lead = null
    }
    // face to face, a step apart
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2,
      dx = b.x - a.x,
      dz = b.z - a.z,
      l = Math.hypot(dx, dz) || 1
    a.x = mx - (dx / l) * 0.7
    a.z = mz - (dz / l) * 0.7
    b.x = mx + (dx / l) * 0.7
    b.z = mz + (dz / l) * 0.7
    ev.peds.push(a, b)
    ev.x = mx
    ev.z = mz
    ev.face = Math.atan2(-dz, dx)
    return true
  }
  // each step of a fight: turned on each other, shoving, the crowd kept back watching
  fight (ev, dt) {
    const [a, b] = ev.peds
    if (!a || !b || a.state !== 'idle' || b.state !== 'idle') return (ev.t = LAST.fight + 1)
    const s = Math.sin(ev.t * 7.3)
    a.yaw = ev.face + s * 0.25
    b.yaw = ev.face + Math.PI - s * 0.25
    a.hop = Math.max(a.hop || 0, s > 0.9 ? 0.25 : 0)
    b.hop = Math.max(b.hop || 0, s < -0.9 ? 0.25 : 0)
    a.idleT = b.idleT = 5
    if ((ev.th = (ev.th || 0) - dt) <= 0) {
      ev.th = 0.5
      this.peds.threat?.(ev.x, ev.z, 11, 1, 0.8)
    }
  }

  pick () {
    const names = ['sedan', 'suv', 'pickup', 'sports', 'compact', 'taxi']
    for (let i = 0; i < 6; i++) {
      const k = IDX[names[Math.floor(this.R() * names.length)]]
      if (k !== undefined) return k
    }
    return 0
  }
  // somewhere across town from a spawn, along its lane's way
  far (at) {
    const a = Math.atan2(at.lane.dz, at.lane.dx) + (this.R() - 0.5) * 1.2
    const B = bounds(),
      m = 30
    const c = (v, lo, hi) => Math.max(lo + m, Math.min(hi - m, v))
    return { x: c(at.x + Math.cos(a) * 420, B.x0, B.x1), z: c(at.z + Math.sin(a) * 420, B.z0, B.z1) }
  }
  // a car taken over and driven by aiDriver (to goal, or far along its way) at up to v m/s
  driver (car, tag, v, v0, goal = null) {
    const tr = this.traffic
    if (!tr.takeOver(car, tag)) return null
    const body = bodyFromTraffic(car)
    body.vx = car.hx * v0
    body.vz = car.hz * v0
    const at = { x: car.x, z: car.z, lane: LANES.find(e => e.dx * car.hx + e.dz * car.hz > 0.9) }
    const d = { car, body, inp: makeVehicleInput(), follow: new Follower(), goal, v, stuckT: 0, revT: 0, revSteer: 0 }
    if (!goal) d.goal = this.far({ ...at, lane: { dx: car.hx, dz: car.hz } })
    this.drivers.push(d)
    return d
  }
  drive (d, dt) {
    const b = d.body,
      inp = d.inp,
      tr = this.traffic
    if (!unstick(d, b, inp, dt)) {
      const plan = this.planner.get(d.goal.x, d.goal.z)
      const pt = d.follow.point(b, plan, dt, 10 + 0.5 * Math.abs(b.u)) || d.goal
      let tx = pt.x,
        tz = pt.z,
        v = pt === d.goal ? d.v : cornerV(b, d.follow, d.v)
      const blk = blocker(b, tr.cars, 28, 2.4, d.car)
      if (blk && blk.d < 18) {
        const fx = Math.cos(b.yaw),
          fz = -Math.sin(b.yaw)
        tx -= fz * blk.side * 3.4
        tz += fx * blk.side * 3.4
      }
      if (Math.hypot(d.goal.x - b.x, d.goal.z - b.z) < 30) v = 0
      steerTo(b, inp, tx, tz, v)
    }
    stepVehicle(b, inp, dt, { city: true, t: tr.t })
    collideTraffic(b, tr, d.car)
    writeToTraffic(b, d.car)
  }
}
