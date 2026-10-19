// Every car the player can get into, in one registry: the Roadster, the traffic's cars on the road
// and the cars parked in the lots (and the jammed street's). Pure (no DOM), so it is tested in Node.
// Each entry is stable for as long as its car exists (a WeakMap keeps it), so what is learnt about a
// car (stolen, left with its door unlocked) stays with it.
//
//   vehicles.list               every entry, the Roadster first
//   vehicles.nearest(pos, r, f) the entry nearest pos ({ x, z }) within r m of its body, f(entry)
//                               filtering (null: none)
//   vehicles.sync(traffic, sim) once a frame: the list rebuilt from the traffic and the Roadster
//   vehicles.toWorld(e, lx, lz) a point in the car's frame (+x its nose, +z its right: the driver
//                               sits on the left, -z) into the world, and toLocal back
//
// An entry: { id, kind: 'roadster' | 'traffic' | 'parked', type (its body: carTypes.js name, or
// 'roadster'), pos { x, y, z }, heading (yaw, as sim.yaw), speed, occupant: 'player' | 'npc' | null,
// parked, locked, seat { x, y, z } (the driver's hips, car frame), door { x, z } (where to stand to
// get in, car frame), doorLen, len, wid, hgt, car (the traffic car, or null), sim (the Roadster's,
// or null), stolen, vacant }.
import { TYPES } from './carTypes.js'
import { CAR } from './constants.js'

// cabs that sit over the front axle (the driver high up behind the windscreen)
const CAB = new Set(['bus', 'van', 'truck', 'fire', 'ambulance'])
// seat heights (the hips over the road, m) for the cars that sit higher or lower than a sedan's
const SEAT_Y = { sports: 0.34, lowrider: 0.4, suv: 0.72, pickup: 0.78, police: 0.6 }

// Where the driver sits and gets in, by body: { seat, door, doorLen } in the car's frame
export function layoutFor (name, len, wid, hgt) {
  if (name === 'roadster')
    return {
      seat: { x: -0.3, y: 0.36, z: -0.42 },
      door: { x: -0.2, z: -1.32 },
      doorLen: 1.3
    }
  const cab = CAB.has(name)
  const seat = cab
    ? {
        x: len / 2 - (name === 'bus' ? 1.3 : 1.5),
        y: Math.min(1.5, hgt * 0.42),
        z: -wid / 2 + 0.6
      }
    : { x: 0.1 - 0.08 * len, y: SEAT_Y[name] ?? 0.48, z: -0.38 }
  return {
    seat,
    door: { x: seat.x + 0.15, z: -(wid / 2 + 0.5) },
    doorLen: cab ? 0.95 : name === 'sports' ? 1.25 : 1.1
  }
}

const ROADSTER = {
  len: CAR.halfL * 2,
  wid: CAR.halfW * 2,
  hgt: CAR.height,
  ...layoutFor('roadster')
}

const entries = new WeakMap()
let roadsterEntry = null

function make (car, sim) {
  const T = car ? TYPES[car.type] : null
  const L = car ? layoutFor(T.name, car.len, car.wid, car.hgt) : ROADSTER
  return {
    id: car ? `car${car.id}` : 'roadster',
    kind: car ? (car.parked && !car.jam ? 'parked' : 'traffic') : 'roadster',
    type: car ? T.name : 'roadster',
    pos: { x: 0, y: 0, z: 0 },
    heading: 0,
    speed: 0,
    occupant: car ? null : 'player',
    parked: false,
    locked: false,
    seat: L.seat,
    door: L.door,
    doorLen: L.doorLen,
    len: car ? car.len : ROADSTER.len,
    wid: car ? car.wid : ROADSTER.wid,
    hgt: car ? car.hgt : ROADSTER.hgt,
    car: car || null,
    sim: sim || null,
    stolen: false, // broken into or taken from its driver by the player
    vacant: false // its driver gone (pulled out, or left by the player)
  }
}

// a traffic car's state into its entry
function readCar (e, car) {
  e.pos.x = car.x
  e.pos.z = car.z
  e.pos.y = 0
  e.heading = car.yaw
  e.speed = car.loose ? Math.hypot(car.vx, car.vz) : Math.abs(car.v)
  e.parked = !!car.parked && !car.player
  if (car.player) e.occupant = 'player'
  else if (e.vacant || (car.parked && !car.jam) || car.dmg?.alight)
    e.occupant = null
  else e.occupant = 'npc'
  // (a parked car is locked until the player has broken into it; a car on the road has its driver
  // in it, and is taken from them instead)
  e.locked = e.kind === 'parked' && !e.stolen && !e.vacant
}
function readSim (e, sim) {
  const p = sim.mode === 'ground' ? sim.pos : sim.com
  e.pos.x = p.x
  e.pos.y = sim.pos.y
  e.pos.z = p.z
  e.heading = sim.yaw
  e.speed = sim.groundSpeed()
  e.parked = e.occupant !== 'player'
}

export const vehicles = {
  list: [],
  get roadster () {
    return roadsterEntry
  },
  // the entry for a traffic car (made the first time it is asked for)
  of (car) {
    let e = entries.get(car)
    if (!e) entries.set(car, (e = make(car)))
    return e
  },
  byId (id) {
    return this.list.find(e => e.id === id) || null
  },
  // the list again from the traffic's cars and the Roadster's sim (either may be missing)
  sync (traffic, sim) {
    const list = this.list
    list.length = 0
    if (sim) {
      if (!roadsterEntry || roadsterEntry.sim !== sim)
        roadsterEntry = make(null, sim)
      readSim(roadsterEntry, sim)
      list.push(roadsterEntry)
    }
    if (traffic)
      for (const car of traffic.cars) {
        const e = this.of(car)
        readCar(e, car)
        list.push(e)
      }
    return list
  },
  // how far (x, z) is from the car's body (0 inside it)
  gap (e, x, z) {
    const l = this.toLocal(e, x, z, _l)
    const dx = Math.max(0, Math.abs(l.x) - e.len / 2),
      dz = Math.max(0, Math.abs(l.z) - e.wid / 2)
    return Math.hypot(dx, dz)
  },
  nearest (pos, r = 4, filter = null) {
    let best = null,
      bd = r
    for (const e of this.list) {
      if (Math.abs(e.pos.x - pos.x) > r + 8 || Math.abs(e.pos.z - pos.z) > r + 8)
        continue
      if (filter && !filter(e)) continue
      const d = this.gap(e, pos.x, pos.z)
      if (d <= bd) {
        bd = d
        best = e
      }
    }
    return best
  },
  toWorld (e, lx, lz, out = { x: 0, z: 0 }) {
    const hx = Math.cos(e.heading),
      hz = -Math.sin(e.heading)
    out.x = e.pos.x + lx * hx - lz * hz
    out.z = e.pos.z + lx * hz + lz * hx
    return out
  },
  toLocal (e, x, z, out = { x: 0, z: 0 }) {
    const hx = Math.cos(e.heading),
      hz = -Math.sin(e.heading),
      dx = x - e.pos.x,
      dz = z - e.pos.z
    out.x = dx * hx + dz * hz
    out.z = dz * hx - dx * hz
    return out
  },
  // the car as an oriented rectangle, for the feet to keep out of (player.js)
  rect (e, out = {}) {
    out.x = e.pos.x
    out.z = e.pos.z
    out.fx = Math.cos(e.heading)
    out.fz = -Math.sin(e.heading)
    out.hl = e.len / 2
    out.hw = e.wid / 2
    out.top = e.pos.y + e.hgt
    out.ignore = false
    out.e = e
    return out
  },
  // forget the Roadster's entry (a new sim, in tests)
  reset () {
    roadsterEntry = null
    this.list.length = 0
  }
}
const _l = { x: 0, z: 0 }
