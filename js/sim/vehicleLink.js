// Between a drivable body (vehicleSim.js) and the rest of the city: a traffic car taken over
// (handover.js) driven by a body and drawn where the body is (the traffic renderer keeps drawing it,
// paint, damage, brake lights and all), and a stand-in for the player that the traffic and the
// people (traffic.js, peds.js, wrecks.js) read as they read the Roadster: in a car (vehicleProxy),
// or on foot (footProxy).
import { TYPES } from './carTypes.js'
import { kindOfType } from './handling.js'
import { createVehicleBody } from './vehicleSim.js'

// A body for a traffic car (one taken over: traffic.takeOver), with its id, size, mass, paint and
// damage, moving as it was
export function bodyFromTraffic (car) {
  const T = TYPES[car.type]
  const b = createVehicleBody(kindOfType(T.name), {
    x: car.x,
    z: car.z,
    yaw: car.yaw,
    paint: car.paint,
    id: car.id
  })
  b.y = car.y || 0 // (taken over up on the freeway or the hill road: there)
  b.len = car.len
  b.wid = car.wid
  b.hgt = car.hgt
  b.m = car.m
  b.I = car.I
  b.type = car.type
  b.vx = car.vx || car.hx * car.v
  b.vz = car.vz || car.hz * car.v
  b.w = car.w || 0
  b.dmg = car.dmg
  car.body = b // (so another body that runs into this car meets the body: vehicleHit.js)
  if (b.dmg) {
    b.limp = b.dmg.limp ?? 1
    b.dead = !!b.dmg.wreck
  }
  return b
}

// The body's pose and lamps onto its traffic car, for the renderer (once a frame, or each step)
export function writeToTraffic (b, car) {
  const d = Math.hypot(b.x - car.x, b.z - car.z)
  car.x = b.x
  car.z = b.z
  car.y = b.y
  car.gp = b.gp || 0
  car.gr = b.gr || 0
  car.yaw = b.yaw
  car.hx = b.hx
  car.hz = b.hz
  car.v = b.u
  car.vx = b.vx
  car.vz = b.vz
  car.w = car.yr = b.w
  car.acc = b.accLong
  car.odo += b.u < 0 ? -d : d
  car.brake = b.lights.brake
  car.rev = 0
  car.sig = b.lights.indicator
  car.dmg = b.dmg
  car.still = car.stuck = 0
}

const V3 = () => ({ x: 0, y: 0, z: 0 })
// A stand-in for the player in a car, read by traffic.step, peds.step and wrecks.collidePlayer as
// they read the Roadster (mode, pos, com, vel, yaw, yawRate, speed, events, emit, syncPose), sized
// and weighted as the body (collide.js playerRect, loadBody). syncProxy before their steps,
// pullProxy after (their shoves on the player's car back onto the body).
export function vehicleProxy (b) {
  const p = {
    mode: 'ground',
    world: 'city',
    pos: V3(),
    com: V3(),
    vel: V3(),
    yaw: 0,
    yawRate: 0,
    speed: 0,
    floor: 0,
    air: 0,
    halfL: b.len / 2,
    halfW: b.wid / 2,
    mass: b.m,
    Iz: b.I,
    body: b,
    events: [],
    emit (type, data) {
      this.events.push({ type, ...data })
    },
    syncPose () {},
    fwd (out = V3()) {
      out.x = Math.cos(this.yaw)
      out.y = 0
      out.z = -Math.sin(this.yaw)
      return out
    }
  }
  return syncProxy(p, b)
}
export function syncProxy (p, b) {
  p.pos.x = p.com.x = b.x
  p.pos.z = p.com.z = b.z
  p.pos.y = b.y || 0
  p.com.y = p.pos.y + 0.6
  p.vel.x = b.vx
  p.vel.z = b.vz
  p.yaw = b.yaw
  p.yawRate = b.w
  p.speed = b.u
  p.halfL = b.len / 2
  p.halfW = b.wid / 2
  p.mass = b.m
  p.Iz = b.I
  p.body = b
  return p
}
// what the traffic did to the player's car (shoved it, traded momentum) back onto the body
export function pullProxy (p, b) {
  b.x = p.pos.x
  b.z = p.pos.z
  b.vx = p.vel.x
  b.vz = p.vel.z
  b.w = p.yawRate
  return b
}
// A stand-in for the player on foot at pos ({ x, z }), heading yaw: the drivers stop for them and
// honk (drivers.js), the people look at them, and nobody dives out of their way
export function footProxy (pos, yaw = 0) {
  return {
    mode: 'foot',
    world: 'city',
    pos: { x: pos.x, y: 0, z: pos.z },
    com: { x: pos.x, y: 0.9, z: pos.z },
    vel: V3(),
    yaw,
    yawRate: 0,
    speed: 0,
    floor: 0,
    events: [],
    emit (type, data) {
      this.events.push({ type, ...data })
    },
    syncPose () {}
  }
}
