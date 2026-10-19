// Any car the player drives that isn't the Roadster: the Roadster's own physics (sim.js, ground.js,
// the tyres, the crashes, the city's collisions) run with that car's spec sheet in place of the
// Roadster's for its steps, and its pose written back to the traffic car it is, so it is drawn,
// heard and run into as itself. A small adapter so the drive workstream can tune each body's
// handling in one place (HANDLING) without touching the player's code.
//
//   specFor(name)            a CAR-shaped spec sheet for a carTypes.js body ('sedan', 'bus', ...)
//   HANDLING[name]           overrides merged over the derived spec (tune here)
//   withSpec(spec, fn, sim)  run fn with CAR (and the corners and the collision body built from
//                            it) set to spec, put back afterwards, even if fn throws
//   carControls(c)           the controls a car without the Roadster's gear gets: no thrusters, no
//                            suction fan, no attitude control
//   new Drivable()           .board(entry), .step(dt, c), .run(fn), .leave(), .sim, .entry, .spec
import { Sim } from './sim.js'
import { TYPES, IDX } from './carTypes.js'
import { CAR, CORNERS } from './constants.js'
import { BODY, playerRect } from './collide.js'

// engine power (W) and top speed (m/s) per body; the rest is worked out from carTypes.js
// prettier-ignore
const POWER = {
  sedan: [150e3, 58], hatch: [100e3, 52], suv: [220e3, 55], taxi: [150e3, 56],
  pickup: [260e3, 52], van: [150e3, 42], bus: [220e3, 30], police: [280e3, 66],
  sports: [380e3, 80], ambulance: [220e3, 45], fire: [330e3, 35], truck: [260e3, 36],
  lowrider: [170e3, 48], limo: [220e3, 50]
}
// tyre grip (a share of g) by body: sports tyres, everyday ones, the heavy ones
const GRIP = { sports: 1.12, police: 1.04, bus: 0.8, truck: 0.82, fire: 0.82, van: 0.88 }

// Per-body overrides over the derived spec: the drive workstream's knobs, e.g.
// HANDLING.sports = { tireMu: 1.2, rearGrip: 0.98 } for a looser tail.
export const HANDLING = Object.fromEntries(TYPES.map(T => [T.name, {}]))

export function specFor (name) {
  const T = TYPES[IDX[name] ?? 0]
  const [powerW, vMax] = POWER[T.name] || POWER.sedan
  const m = T.m,
    k = m / CAR.mass
  const big = !!T.big || m > 5000
  const base = {
    mass: m,
    wheelbase: T.len * (big ? 0.55 : 0.6),
    halfWB: (T.len * (big ? 0.55 : 0.6)) / 2,
    halfL: T.len / 2,
    halfW: T.wid / 2,
    height: T.hgt,
    comH: 0.45 + 0.3 * Math.max(0, T.hgt - 1.2),
    wheelR: big ? 0.5 : 0.33,
    tireMu: GRIP[T.name] ?? 0.98,
    driveAccelMax: T.acc * 2.6,
    powerW,
    brakeAccel: T.brake * 3,
    vMax,
    // (drag that holds it near its top speed at full power)
    dragK: (0.9 * powerW) / (m * vMax * vMax * vMax),
    Iz: (m * (T.len * T.len + T.wid * T.wid)) / 12,
    rearGrip: 1.06,
    corneringF: CAR.corneringF * k,
    corneringR: CAR.corneringR * k,
    rollRes: big ? 0.02 : 0.015,
    regenAccel: 0.4, // (engine braking, lifting off)
    regenPowerW: 80e3,
    slideMu: 0.78,
    suctionG: 0,
    mainThrust: 0,
    liftThrust: 0,
    sideThrust: 0,
    airMass: 0,
    recharge: 0
  }
  return { ...base, ...HANDLING[T.name] }
}

// the Roadster's corners, the collision body's mass and the footprint, saved while a spec runs
const SAVED = {},
  CORNER0 = CORNERS.map(v => [v.x, v.y, v.z])
let depth = 0
export function withSpec (spec, fn, sim = null) {
  if (!spec || depth > 0) return fn()
  depth++
  const keys = Object.keys(spec)
  for (const k of keys) SAVED[k] = CAR[k]
  Object.assign(CAR, spec)
  for (const v of CORNERS) {
    v.x = Math.sign(v.x) * spec.halfL
    v.z = Math.sign(v.z) * spec.halfW
  }
  const me = sim ? playerRect(sim) : null,
    hl = me?.hl,
    hw = me?.hw,
    m = BODY.m,
    I = BODY.I
  if (me) {
    me.hl = spec.halfL
    me.hw = spec.halfW
  }
  BODY.m = spec.mass
  BODY.I = spec.Iz
  try {
    return fn()
  } finally {
    for (const k of keys) CAR[k] = SAVED[k]
    CORNERS.forEach((v, i) => v.set(...CORNER0[i]))
    if (me) {
      me.hl = hl
      me.hw = hw
    }
    BODY.m = m
    BODY.I = I
    depth--
  }
}

export function carControls (c) {
  return {
    ...c,
    main: 0,
    lift: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    fan: false,
    flare: 0
  }
}

export class Drivable {
  constructor () {
    this.sim = new Sim()
    this.entry = null
    this.spec = null
    this.car = null
  }
  get active () {
    return !!this.car
  }
  // take over the traffic car of entry e: out of the traffic's hands, the physics put where it is
  board (e, traffic = null) {
    const car = e.car
    this.entry = e
    this.car = car
    this.spec = specFor(e.type)
    if (traffic && !car.parked) traffic.n-- // (no longer one of the traffic's own)
    traffic?.detach(car)
    if (car.siren) traffic?.callGone?.(car)
    car.siren = 0
    car.edge = car.next = null
    car.parked = true
    car.player = true
    car.jam = false
    car.loose = false
    car.ditched = false
    car.vx = car.vz = car.w = 0
    car.sig = 0
    car.pull = car.drop = null
    this.sim.reset('city', { x: car.x, z: car.z, yaw: car.yaw })
    this.sim.air = 0 // (no thrusters, no tank)
    this.sim.suction = 0
  }
  // run fn with this car's spec in place (the traffic's step, its collisions)
  run (fn) {
    return withSpec(this.spec, fn, this.sim)
  }
  step (dt, c) {
    if (!this.car) return
    const s = this.sim
    withSpec(this.spec, () => s.step(dt, carControls(c)), s)
    s.air = 0
    this.writeBack(dt, c)
  }
  // the sim's pose and motion onto the traffic car (drawn, heard and run into from there)
  writeBack (dt, c = null) {
    const s = this.sim,
      car = this.car
    if (!car) return
    const p = s.mode === 'ground' ? s.pos : s.com
    car.x = p.x
    car.z = p.z
    let yaw = s.yaw
    if (s.mode !== 'ground') {
      const f = s.fwd()
      if (Math.hypot(f.x, f.z) > 0.2) yaw = Math.atan2(-f.z, f.x)
    }
    car.yaw = yaw
    car.hx = Math.cos(yaw)
    car.hz = -Math.sin(yaw)
    car.v = s.mode === 'ground' ? s.speed : s.groundSpeed()
    car.odo += car.v * dt
    car.steer = s.steerAng
    car.acc = s.accLong || 0
    car.yr = s.yawRate || 0
    car.brake = !!c && (c.brake > 0.05 || c.ebrake)
    car.alt = Math.max(0, s.pos.y) // (off the ground: a roof, a jump)
  }
  // out of it: the car left where it stands, parked with its door unlocked
  leave () {
    const car = this.car
    if (car) {
      car.player = false
      car.ditched = true
      car.v = car.acc = car.steer = 0
      car.brake = false
      car.alt = 0
      car.homeX = car.x
      car.homeZ = car.z
      car.homeYaw = car.yaw
    }
    this.car = this.entry = this.spec = null
    return car
  }
}
