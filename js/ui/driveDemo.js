// A developer's harness for the drivable cars (not a game mode: the player's workstream does the
// real handoff in drivable.js): with ?drive=<kind> in the address (sedan, sports, suv, pickup,
// truck, van, bus, police), a car of that handling class is put on the road just ahead of the
// Roadster as a traffic car taken over (handover.js), and the driving keys drive it through
// vehicleSim.js instead of the Roadster, which stands where it is with the camera behind it.
// ?drive=<kind>&auto=1 drives it by itself (pulls away, a handbrake flick, on again), for
// screenshots and smoke tests.
import { HANDLING, TYPE_KIND } from '../sim/handling.js'
import { IDX } from '../sim/carTypes.js'
import { stepVehicle, makeVehicleInput } from '../sim/vehicleSim.js'
import { bodyFromTraffic, writeToTraffic } from '../sim/vehicleLink.js'
import { collideTraffic } from '../sim/vehicleHit.js'

const TYPE_OF = { sedan: 'sedan', sports: 'sports', suv: 'suv', pickup: 'pickup', truck: 'truck', van: 'van', bus: 'bus', police: 'police' }

export function driveDemo (sim, traffic) {
  const q = new URLSearchParams(location.search)
  const kind = q.get('drive')
  if (!kind || !HANDLING[kind] || HANDLING[kind].sim) return null
  const auto = q.get('auto') === '1'
  const inp = makeVehicleInput()
  let car = null,
    body = null,
    t = 0
  const spawn = () => {
    const c = traffic.make(IDX[TYPE_OF[kind]] ?? 0, false)
    c.parked = true
    const fx = Math.cos(sim.yaw),
      fz = -Math.sin(sim.yaw)
    c.x = sim.pos.x + fx * 16
    c.z = sim.pos.z + fz * 16
    traffic.setYaw(c, sim.yaw)
    traffic.takeOver(c)
    car = c
    body = bodyFromTraffic(c)
    t = 0
    window.__drive = { body, car, kind: TYPE_KIND[kind] || kind }
  }
  return {
    // one physics step: the keys (c) drive the car, the Roadster stands
    step (h, c) {
      if (!car || !traffic.cars.includes(car)) spawn()
      t += h
      if (auto) {
        inp.throttle = t > 0.5 && !(t > 4 && t < 4.4) ? 0.6 : 0
        inp.handbrake = t > 4 && t < 4.4
        inp.steer = t > 4 && t < 4.4 ? 1 : 0
        inp.brake = 0
      } else {
        inp.throttle = c.throttle
        inp.brake = c.brake || c.reverse
        inp.steer = c.steer
        inp.handbrake = !!c.ebrake
      }
      c.throttle = c.brake = c.reverse = c.steer = c.main = c.lift = 0
      c.ebrake = false
      c.brake = 1
      stepVehicle(body, inp, h, { city: true, t: traffic.t })
      collideTraffic(body, traffic, car)
      writeToTraffic(body, car)
    }
  }
}
