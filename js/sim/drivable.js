// Any car the player drives that isn't the Roadster, on the drive workstream's stack: the traffic
// car is taken off its driver (traffic.takeOver: handover.js), given a body of its handling class
// (vehicleLink.js bodyFromTraffic, vehicleSim.js stepVehicle, handling.js), knocks the city and the
// traffic about (vehicleHit.js collideTraffic, which also dents it), and its pose goes back onto the
// traffic car each step (writeToTraffic) so it is drawn and run into as itself. The traffic and
// the people read it through a stand-in (vehicleProxy); a Sim kept on the body's pose (.sim) is
// what the camera, the HUD and the sounds follow, as they follow the Roadster's.
//
//   new Drivable()   .board(entry, traffic), .step(dt, c), .traffic(fn), .leave(), .active
//                    .sim (the pose for the camera and HUD), .body, .proxy, .entry, .car
//   carInput(c, out) the Roadster's controls (constants.js makeControls) as a body's input
import { Sim } from './sim.js'
import { stepVehicle, makeVehicleInput } from './vehicleSim.js'
import { bodyFromTraffic, writeToTraffic, vehicleProxy, syncProxy, pullProxy } from './vehicleLink.js'
import { collideTraffic } from './vehicleHit.js'
import { roadGrip } from './roadGrip.js'

// the share of a hit's harm the player's car takes (a traffic car's is 1): GTA-tough, so it
// takes a few hard crashes to wreck, dented and smoking well before
export const PLAYER_TOUGH = 0.35

export function carInput (c, out = makeVehicleInput()) {
  out.throttle = c ? c.throttle : 0
  // (the brake and reverse kept apart: the keys hold the car a moment at a stop before backing up)
  out.brake = c ? c.brake : 1
  out.reverse = c ? c.reverse || 0 : 0
  out.steer = c ? c.steer : 0
  out.handbrake = !!c?.ebrake
  return out
}

export class Drivable {
  constructor () {
    this.sim = new Sim()
    this.inp = makeVehicleInput()
    this.world = { city: true, t: 0, grip: 1 }
    this.entry = this.car = this.body = this.proxy = this.tr = null
  }
  get active () {
    return !!this.car
  }
  // take over the traffic car of entry e (already taken, for a carjack: onFoot.js), its body made
  // where it stands
  board (e, traffic) {
    const car = e.car
    if (!car.ctl) traffic.takeOver(car, 'player')
    car.player = true
    this.entry = e
    this.car = car
    this.tr = traffic
    this.body = bodyFromTraffic(car)
    this.body.tough = PLAYER_TOUGH // (the hero's car takes a beating: vehicleHit.js)
    this.proxy = vehicleProxy(this.body)
    this.sim.reset('city', { x: car.x, z: car.z, yaw: car.yaw })
    this.sim.air = 0 // (no thrusters, no tank)
    this.sim.suction = 0
    this.mirror()
  }
  step (dt, c) {
    if (!this.car) return
    const b = this.body
    const W = this.world
    W.t = this.tr.t
    W.grip = roadGrip() // (wet or dry, and the grip hook: roadGrip.js)
    stepVehicle(b, carInput(c, this.inp), dt, W)
    collideTraffic(b, this.tr, this.car)
    writeToTraffic(b, this.car)
    this.sim.time += dt // (the keys ease in on the Sim's clock: input.js)
    this.mirror()
    this.hear(b.events)
  }
  // fn(proxy): the traffic's or the people's step, seeing the car as the player's; their shoves
  // put back onto the body
  traffic (fn) {
    const p = syncProxy(this.proxy, this.body)
    p.events.length = 0
    fn(p)
    pullProxy(p, this.body)
    writeToTraffic(this.body, this.car)
    this.mirror()
    this.hear(p.events)
  }
  // the body's pose onto the Sim the camera and the HUD follow
  mirror () {
    const s = this.sim,
      b = this.body
    s.mode = 'ground'
    s.pos.set(b.x, 0, b.z)
    s.com.set(b.x, 0.6, b.z)
    s.vel.set(b.vx, 0, b.vz)
    s.yaw = b.yaw
    s.yawRate = b.w
    s.speed = b.u
    s.steerAng = b.steerAng
    s.slipR = b.slip // (the keys steer quicker in a slide: input.js)
    s.accLong = b.accLong
    s.latAcc = b.latAcc
    s.air = 0
    s.syncPose()
  }
  // its knocks, for the sounds and the shake (events.js): as the Roadster's 'bump's
  hear (list) {
    for (const e of list)
      if (e.type === 'bump' || e.type === 'clash')
        this.sim.events.push({ type: 'bump', impact: e.impact, what: e.what || 'car', px: e.x ?? e.px, pz: e.z ?? e.pz, broke: e.broke || 0 })
      // (a hit hard enough to wreck a traffic car: the heavy crunch on top, events.js 'smash')
      else if (e.type === 'crash') this.sim.events.push({ type: 'smash', impact: e.impact, px: e.x, pz: e.z })
      // (a wheel up or down a kerb, or over a manhole: the thud, the jolt, the pad's knock)
      else if (e.type === 'kerb') this.sim.events.push({ type: 'kerb', v: e.v, up: e.up })
      else if (e.type === 'manhole') this.sim.events.push({ type: 'manhole', v: e.v })
  }
  // out of it: left where it stands, parked, its door unlocked (handBack)
  leave () {
    const car = this.car
    if (car) {
      car.player = false
      this.tr.handBack(car)
    }
    this.entry = this.car = this.body = this.proxy = null
    return car
  }
}
