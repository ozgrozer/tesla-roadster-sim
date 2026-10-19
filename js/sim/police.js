// The police force on the city's streets (the wanted level is wanted.js; each car's mind is
// policeUnit.js): as many units as the stars call for (UNITS), each put on a lane of the road
// network off-screen (out of the camera's view or behind a building, between SPAWN_MIN and
// SPAWN_MAX m off, facing the player), driven by the 'police' handling class along the lane graph.
// At three stars and up, roadblocks across the road ahead; at four and up, a helicopter with its
// spotlight. Who has the player in sight decides `seen` for the wanted level; the units shove the
// traffic and the player's car with their mass, and a ram from the player is a crime against them.
// Units with the stars cleared drive off and are taken away out of sight. Pure: no DOM.
import { clamp } from './constants.js'
import { rng, LANES, LANE_OFF } from './city.js'
import { stepVehicle } from './vehicleSim.js'
import { writeToTraffic } from './vehicleLink.js'
import { collideTraffic, rectOf } from './vehicleHit.js'
import { rectRect, impulse, playerRect, loadBody, storeBody, nudge, BODY } from './collide.js'
import { Planner } from './aiDriver.js'
import { clear, policeSight } from './witness.js'
import { makeUnit, think } from './policeUnit.js'
import { Heli, roadblockSpot } from './policeAir.js'

export const UNITS = [0, 2, 3, 4, 5, 6] // pursuing units for 0 to 5 stars
export const SPAWN_MIN = 110
export const SPAWN_MAX = 230
export const ROADBLOCK_STARS = 3
export const HELI_STARS = 4
const SPAWN_GAP = 1.4 // s between one unit and the next joining
const LOOK_GAP = 0.2 // s between a unit's looks for the player
const BUST_R = 7.5 // m: a unit this close to a player at a standstill is arresting them
const _a = { x: 0, z: 0, fx: 1, fz: 0, hl: 1, hw: 1 }

// is (x, z) in the camera's sight? view: { x, z, fx, fz }
export function inView (view, x, z, los = clear) {
  if (!view) return false
  const dx = x - view.x,
    dz = z - view.z,
    d = Math.hypot(dx, dz)
  if (d > 300) return false
  if (d < 25) return true
  if ((dx * view.fx + dz * view.fz) / d < 0.25) return false
  return los(view.x, view.z, x, z, 3, 1)
}

// A place on a lane off-screen between rMin and rMax m from (px, pz), facing towards it if it can:
// { x, z, yaw, lane } or null. R: random numbers; view: the camera
export function spawnPoint (px, pz, view, R, { rMin = SPAWN_MIN, rMax = SPAWN_MAX, los = clear } = {}) {
  for (let tries = 0; tries < 90; tries++) {
    const e = LANES[Math.floor(R() * LANES.length)]
    if (!e || e.closed || e.len < 30) continue
    const s = 8 + R() * (e.len - 16)
    const x = e.x0 + e.dx * s,
      z = e.z0 + e.dz * s
    const d = Math.hypot(x - px, z - pz)
    if (d < rMin || d > rMax) continue
    if (tries < 60 && e.dx * (px - x) + e.dz * (pz - z) < 0) continue // (facing the player)
    if (inView(view, x, z, los)) continue
    if (e.cars.some(c => Math.abs(c.s - s) < 14)) continue
    return { x, z, yaw: Math.atan2(-e.dz, e.dx), lane: e, s }
  }
  return null
}

export class Police {
  constructor (traffic, { seed = 4242 } = {}) {
    this.traffic = traffic
    this.R = rng(seed)
    this.units = []
    this.heli = new Heli(this.R)
    this.planner = new Planner(22)
    this.spawnT = 0
    this.blockT = 8
    this.seen = false
    this.nearest = Infinity // m from the player to the nearest unit chasing them
    this.bustable = 0 // units close enough to arrest a player at a standstill
    this.hits = [] // this step's rams between the player and a unit: { impact, byPlayer, unit }
    this.chase = { on: false, car: null, mode: 0, kind: 0, whoops: 0, horns: 0, long: false }
    traffic.chase = this.chase // (heard as the siren: audio/siren.js)
  }
  get pursuing () {
    let n = 0
    for (const u of this.units) if (u.role === 'pursuit' && u.state !== 'leave') n++
    return n
  }
  // a unit of the given role at `at` ({ x, z, yaw, v }) (the street events' too: ambient.js)
  add (at, role = 'pursuit') {
    const u = makeUnit(this.traffic, at, this.R, role)
    u.slot = this.units.length
    this.units.push(u)
    return u
  }
  remove (u) {
    const tr = this.traffic,
      i = tr.cars.indexOf(u.car)
    if (i >= 0) tr.remove(i)
    const j = this.units.indexOf(u)
    if (j >= 0) this.units.splice(j, 1)
    if (this.chase.car === u.car) this.chase.car = null
  }
  clearAll () {
    for (const u of [...this.units]) this.remove(u)
    this.heli.gone()
  }

  // One physics step. ctx: { wanted (wanted.js), player (playerView), sim (the Roadster when the
  // player drives it, for the rams), body (or the vehicleSim body of another car they drive), view
  // (the camera), grip (the road's, 0 to 1) }
  step (dt, ctx) {
    const { wanted, player, view } = ctx
    const tr = this.traffic
    const stars = wanted.stars
    this.hits.length = 0
    // (a traffic reset took the cars away: the units go with them)
    for (const u of [...this.units]) if (!tr.cars.includes(u.car)) this.units.splice(this.units.indexOf(u), 1)
    // reinforcements, off-screen, one at a time
    this.spawnT -= dt
    if (stars > 0 && this.pursuing < UNITS[stars] && this.spawnT <= 0) {
      this.spawnT = SPAWN_GAP
      const near = wanted.seen ? player.pos : wanted.last
      const at = spawnPoint(near.x, near.z, view, this.R)
      if (at) this.add({ ...at, v: 14 })
    }
    if (stars >= ROADBLOCK_STARS) this.roadblocks(dt, player, view, stars)
    this.heli.step(dt, stars >= HELI_STARS, player, wanted)
    const plan = (x, z) => this.planner.get(x, z)
    const think_ = {
      stars,
      seen: wanted.seen,
      player,
      last: wanted.last,
      radius: wanted.radius,
      plan,
      R: this.R,
      cars: tr.cars,
      grip: ctx.grip ?? 1
    }
    const world = { city: true, t: tr.t, grip: ctx.grip ?? 1 }
    let seen = this.heli.sees
    this.nearest = Infinity
    this.bustable = 0
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i],
        b = u.body
      // sight of the player, a few times a second
      u.seeT -= dt
      if (u.seeT <= 0) {
        u.seeT = LOOK_GAP
        const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z)
        u.sees = stars > 0 && d < policeSight(stars) && clear(b.x, b.z, player.pos.x, player.pos.z, 1.3)
      }
      if (u.sees && u.role !== 'npc') seen = true
      think(u, think_, dt)
      stepVehicle(b, u.inp, dt, world)
      collideTraffic(b, tr, u.car)
      for (let j = i + 1; j < this.units.length; j++) bodies(b, this.units[j].body)
      if (ctx.sim) this.ram(u, ctx.sim)
      else if (ctx.body) this.ramBody(u, ctx.body)
      writeToTraffic(b, u.car)
      u.x = b.x
      u.z = b.z
      if (u.role === 'pursuit' && u.state !== 'leave') {
        const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z)
        this.nearest = Math.min(this.nearest, d)
        // (on foot, an officer gets out to them: a unit stopped close by)
        const r = player.driving ? BUST_R : BUST_R + 3
        if (d < r && Math.abs(b.u) < 4 && u.sees) this.bustable++
      }
    }
    this.seen = seen
    this.retire(dt, player, view, stars)
    this.siren(player)
  }

  // The player's car against unit u's: pushed apart by mass, momentum traded; a ram from the player
  // (they were the faster into it) goes on this.hits for the wanted level
  ram (u, sim) {
    if (sim.mode === 'foot' || sim.mode === 'ramp') return
    const me = playerRect(sim)
    const b = u.body
    const hit = rectRect(me, rectOf(b, _a))
    if (!hit) return
    const mass = sim.mass || BODY.m
    const share = b.m / (b.m + mass)
    nudge(sim, hit.nx * hit.depth * share, hit.nz * hit.depth * share)
    b.x -= hit.nx * hit.depth * (1 - share)
    b.z -= hit.nz * hit.depth * (1 - share)
    const pv = Math.hypot(sim.vel.x, sim.vel.z)
    const impact = impulse(loadBody(sim), b, hit, 0.25, 0.3)
    storeBody(sim)
    if (sim.mode === 'ground') sim.syncPose?.()
    if (impact > 0.6) {
      sim.emit?.('bump', { impact, what: 'car', px: hit.px, pz: hit.pz, nx: hit.nx, nz: hit.nz, peds: true, police: true })
      this.hits.push({ impact, byPlayer: pv > Math.abs(b.u) + 1, unit: u })
    }
  }

  // another car the player drives (a vehicleSim body: drivable.js) against unit u's
  ramBody (u, pb) {
    const b = u.body
    if (Math.abs(pb.x - b.x) > 8 || Math.abs(pb.z - b.z) > 8) return
    const pv = Math.hypot(pb.vx, pb.vz)
    const impact = bodies(pb, b)
    if (impact > 0.6) {
      pb.events?.push({ type: 'bump', impact, what: 'car', x: b.x, z: b.z, police: true })
      this.hits.push({ impact, byPlayer: pv > Math.abs(b.u) + 1, unit: u })
    }
  }

  // Roadblocks across the road ahead: two cars nose to nose (three at five stars), every so often
  roadblocks (dt, player, view, stars) {
    this.blockT -= dt
    let blocks = 0
    for (const u of this.units) if (u.role === 'block') blocks++
    const max = stars >= 5 ? 2 : 1
    if (this.blockT > 0 || blocks >= max * 2 || player.speed < 8) return
    this.blockT = 18
    const spot = roadblockSpot(player, view, this.R)
    if (!spot) return
    const { e, s } = spot
    const o = LANE_OFF[e.lane]
    // the road's centre line there, and across it (right of the lane: (-dz, dx))
    const cx = e.x0 + e.dx * s + e.dz * o,
      cz = e.z0 + e.dz * s - e.dx * o
    const yaw = Math.atan2(-e.dx, -e.dz) // (side on: nose across the road)
    const offs = stars >= 5 ? [-4.6, 0, 4.6] : [-2.7, 2.7]
    for (const k of offs)
      this.add({ x: cx - e.dz * k, z: cz + e.dx * k, yaw: yaw + (k > 0 ? 0.25 : -0.25), v: 0 }, 'block')
    this.traffic.clearAround?.(cx, cz, 12)
  }

  // Units no longer wanted: off the road once out of sight (or long gone); roadblocks the player
  // left behind
  retire (dt, player, view, stars) {
    for (const u of [...this.units]) {
      const d = Math.hypot(player.pos.x - u.x, player.pos.z - u.z)
      const seen = inView(view, u.x, u.z)
      let go = false
      if (u.role === 'pursuit' && u.state === 'leave') {
        u.gone = (u.gone || 0) + dt // (stuck or not, gone in the end, out of sight)
        go = (d > 120 || u.gone > 30) && !seen
      }
      else if (u.role === 'pursuit') go = d > 420 && !seen
      else if (u.role === 'block') go = (u.age > 50 || stars < ROADBLOCK_STARS || d > 260) && !seen && d > 60
      if (u.role === 'pursuit' && u.state !== 'leave' && this.pursuing > UNITS[stars] + 1 && d > 160 && !seen) go = true
      if (go) this.remove(u)
    }
  }

  // the siren heard: the nearest unit with its lights on
  siren (player) {
    const C = this.chase
    let best = null,
      bd = 260
    for (const u of this.units) {
      if (!u.car.siren || u.role === 'block' || u.role === 'scene') continue
      const d = Math.hypot(player.pos.x - u.x, player.pos.z - u.z)
      if (d < bd) {
        bd = d
        best = u
      }
    }
    C.on = !!best
    C.car = best ? best.car : null
    C.mode = best && (bd < 45 || best.state === 'search') ? 1 : 0
  }
}

// two bodies against each other (two units, or a unit and a car the player drives); returns the
// closing speed (0: apart)
function bodies (a, b) {
  if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) return 0
  const A = { ...rectOf(a) }
  const hit = rectRect(A, rectOf(b, _a))
  if (!hit) return 0
  a.x += hit.nx * hit.depth * 0.5
  a.z += hit.nz * hit.depth * 0.5
  b.x -= hit.nx * hit.depth * 0.5
  b.z -= hit.nz * hit.depth * 0.5
  const w0 = a.w,
    w1 = b.w
  const impact = impulse(a, b, hit, 0.2, 0.3)
  a.w = w0 + clamp(a.w - w0, -2, 2)
  b.w = w1 + clamp(b.w - w1, -2, 2)
  return impact
}
