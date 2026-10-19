// The car the player drives when it isn't the Roadster (drivable.js): the traffic renderer keeps
// drawing it as itself (traffic.js: its body type, paint, glass, lamps and dents), but posed here
// from its physics body (vehicleSim.js) rather than from the traffic's own springs: the body's
// pitch, roll and heave (a little exaggerated, as a game's are), the front wheels at the body's
// steering angle, the rears spinning up past the road in a burnout, the reversing lamps from the
// body's light hooks (body.lights) and its headlights on as soon as the city's light asks for them.
// It also stands in for the Roadster's wheels for the skid marks (skids.js) and the tyre smoke
// (effects.js): four pivots kept where the car's tyres touch the road, and its slide on the Sim the
// camera follows (skidF, skidR, burnSpin), so every car the player drives leaves rubber and smoke.
//
//   new PlayerCar(cityView)   .frame(drivable, dt): the stand-in for RS (or null), each frame
import * as THREE from 'three'

const PITCH_K = 1.5, // how much the drawn body exaggerates the body's pitch and roll
  ROLL_K = 1.35
const _p = new THREE.Vector3()

export class PlayerCar {
  // city: the city's view (render/city.js), whose traffic renderer (cars: traffic.js TrafficView)
  // has each type's shape (S)
  constructor (city) {
    this.city = city
    // the four tyres, front left, front right, rear left, rear right: pivots on the road under
    // them, turned the way each tyre points (skids.js and effects.js read pivot and front)
    this.wheels = [0, 1, 2, 3].map(i => ({
      front: i < 2,
      side: i % 2 ? 1 : -1,
      pivot: new THREE.Object3D()
    }))
    this.skidTrail = [null, null, null, null] // (skids.js: this car's own ribbons)
    this.car = null
  }

  // after the frame's physics steps, before the city is drawn: the car posed from its body, and
  // this stand-in (RS-like: wheels) returned for the skids and the smoke, or null with no such car
  frame (alt, dt) {
    if (!alt.active) {
      if (this.car) this.release()
      return null
    }
    const car = alt.car,
      b = alt.body,
      s = alt.sim
    if (car !== this.car) {
      if (this.car) this.release()
      this.car = car
      this.skidTrail.fill(null)
    }
    // the drawn body on the physics body's springs (traffic.js reads these instead of riding)
    car.posed = true
    car.pitch = -b.pitch * PITCH_K // (the body's pitch is nose down; the drawing's nose up)
    car.roll = b.roll * ROLL_K
    car.lift = Math.max(-0.05, b.heave)
    car.steer = b.steerAng
    // the driven rears turning faster than the road in a burnout or a power slide, or stopped
    // dead on the handbrake (traffic.js turns the rears by spin - wspin)
    const S = this.city.cars.types[car.type].S
    const locked = b.ebLock >= 1 && Math.abs(b.u) > 1
    const dw = locked ? -b.u / S.r : b.spin * 40
    car.wspin = ((car.wspin || 0) + dw * dt) % (2 * Math.PI)
    car.revLamp = !!b.lights.reverse
    car.brake = !!b.lights.brake
    // the slide, onto the Sim the camera, the sounds and the smoke follow: the rears when the tail
    // is out (a drift, the handbrake, wheelspin), the fronts pushing wide otherwise
    const tail = b.drifting || b.ebLock > 0 || b.spin > 0.05
    s.skid = b.skid
    s.skidR = tail ? b.skid : b.skid * 0.45
    s.skidF = tail ? b.skid * 0.35 : b.skid
    s.burnSpin = b.spin * 12
    s.burning = b.spin > 0.4 && Math.abs(b.u) < 4
    s.latAcc = b.latAcc
    s.surface = 'asphalt'
    s.world = 'city'
    s.floor = 0
    // the four pivots, where the tyres meet the road, each turned the way its tyre points
    const hx = Math.cos(car.yaw),
      hz = -Math.sin(car.yaw)
    for (const w of this.wheels) {
      const ax = S.axles[w.front ? 0 : 1],
        lz = w.side * S.track
      _p.set(car.x + ax * hx - lz * hz, 0, car.z + ax * hz + lz * hx)
      w.pivot.position.copy(_p)
      w.pivot.rotation.set(0, car.yaw + (w.front ? car.steer : 0), 0)
      w.pivot.updateMatrixWorld(true)
    }
    return this
  }

  // given back to the traffic (got out, or another car): it rides on the traffic's springs again
  release () {
    const car = this.car
    if (car) {
      car.posed = false
      car.wspin = 0
      car.revLamp = false
    }
    this.car = null
  }
}
