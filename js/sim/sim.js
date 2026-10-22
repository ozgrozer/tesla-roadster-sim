// The vehicle simulation: state, mode switching (ground / ramp / air / crash), the wall ride and scoring.
// Uses only THREE math types, so it runs headless in Node for tests.
import * as THREE from 'three'
import { knock } from './collide.js'
import { stepRamp } from './ramp.js'
import { stepAir } from './flight.js'
import { stepGround } from './ground.js'
import { SPAWN, query } from './city.js'
import { TRACK, SOLIDS } from './track.js'
import { drift, donuts } from './stunts.js'
import { enterCrash, stepCrash } from './crash.js'
import {
  G,
  DEG,
  TAU,
  CAR,
  AX_X,
  AX_Y,
  AX_Z,
  clamp,
  wrapPi,
  clamp01,
  CORNERS
} from './constants.js'

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3()
const _p1 = { x: 0, y: 0 },
  _p2 = { x: 0, y: 0 }
const _near = []

export class Sim {
  constructor () {
    this.pos = new THREE.Vector3()
    this.quat = new THREE.Quaternion()
    this.vel = new THREE.Vector3()
    this.com = new THREE.Vector3()
    this.omega = new THREE.Vector3()
    this.omegaW = new THREE.Vector3()
    this.events = []
    this.reset('start')
  }
  emit (type, data = {}) {
    this.events.push({ type, ...data })
  }

  // `at` ({ x, z, yaw }) puts the car somewhere other than the city's usual spawn point
  reset (spot = 'start', at = null) {
    // 'site' is the test site with the wall and the lineup, 'city' the free-roam city
    this.world = spot === 'city' ? 'city' : 'site'
    this.mode = 'ground'
    this.modeTime = 0
    this.time = 0
    this.spot = spot
    this.pos.set(-92, 0, 0)
    this.yaw = 0
    this.speed = 0
    this.steerAng = 0
    this.vel.set(0, 0, 0)
    this.omega.set(0, 0, 0)
    this.omegaW.set(0, 0, 0)
    this.s = 0
    this.v = 0
    this.d = 0
    this.dVel = 0
    this.rampAngle = 0
    this.air = CAR.airMass
    this.suction = 0
    this.thrMain = 0
    this.thrLift = 0
    this.thrSide = 0
    this.att = { pitch: 0, roll: 0, yaw: 0 }
    this.gLoad = 1
    this.gPeak = 1
    this.maxRampS = -10
    this.attachCooldown = 0
    this.topAwarded = false
    this.man = null
    this.stunt = null
    this.invertedTime = 0
    this.crashSettled = false
    this.righting = null
    this.crashTime = 0
    this.floor = 0 // height of what the car is on or over: the street, or a roof (this.roof)
    this.roof = null
    this.crashReason = ''
    this.accLong = 0
    this.dN = 0 // the weight shifted from the front axle to the rear (N: ground.js)
    this.latAcc = 0
    this.yawRate = 0
    this.lastFyf = 0
    this.lastFyr = 0
    this.rearGrip = 1
    this.ebLock = 0 // how hard the e-brake bites, 0 to 1 (ground.js)
    this.hbDir = 0 // the way the car was going as the handbrake was pulled (drift.js: the J-turn)
    this.rearLocked = false // the rear wheels locked by the handbrake (a turn: ground.js)
    this.abs = 0 // how hard the ABS is working, 0 to 1 (ground.js)
    this.push = 0 // how much of the power the understeer control is holding back, 0 to 1
    this.pushF = 0 // (the same, eased, whatever the throttle: ground.js)
    this.held = 0 // how long the wheel has been held over, for the understeer control (0 to 1)
    this.track = false // Track Mode: the handbrake has the electronics stand back (ground.js)
    this.calm = 0
    this.driftA = 0 // the drift angle a step ago
    this.driftDir = 0 // the way the drift began (1 left, -1 right)
    this.driftWant = 0 // the drift angle the driver is asking for (rad)
    this.driftV = 0 // the pace the drift holds (m/s)
    this.linking = false // steering out of a drift with the power on, into one the other way
    this.slipR = 0
    this.escActive = false
    this.wheelSpin = 0
    this.wheelSpinR = 0
    this.skid = 0
    this.skidF = 0
    this.skidR = 0
    this.drivePower = 0
    this.regenOn = false
    this.ebrakeOn = false
    this.burning = false // a burnout: the throttle and brake together at a crawl (ground.js)
    this.burnSpin = 0
    this.rearSpin = 0
    this.donutTurn = 0 // how far round the car has turned in this burnout (rad), and how many
    this.donutCount = 0 // full turns it has scored (stunts.js)
    this.z60 = { armed: true, t0: 0, last: null }
    this.susp = 0
    this.suspV = 0
    if (spot === 'top') {
      this.mode = 'ramp'
      this.s = TRACK.sHold
      this.maxRampS = this.s
      this.suction = 1
      this.topAwarded = true
    } else if (spot === 'lineup') {
      this.pos.set(-210, 0, 0)
      this.yaw = Math.PI
      this.suction = 1
    } else if (spot === 'city') {
      const p = at || SPAWN
      this.pos.set(p.x, 0, p.z)
      this.yaw = p.yaw
      this.suction = 0
    } else if (spot === 'base') {
      // on the flat beginning of the platform, where the autopilot starts and returns to
      this.mode = 'ramp'
      this.s = TRACK.baseS
      this.maxRampS = this.s
      this.suction = 0.4
    } else {
      this.suction = 0.2
    }
    this.syncPose()
  }

  up (out = _d) {
    return out.copy(AX_Y).applyQuaternion(this.quat)
  }
  fwd (out = _c) {
    return out.copy(AX_X).applyQuaternion(this.quat)
  }
  altitude () {
    return this.mode === 'ramp' ? this.pos.y : Math.max(0, this.pos.y)
  }
  groundSpeed () {
    return this.mode === 'ground'
      ? Math.hypot(this.vel.x, this.vel.z)
      : this.mode === 'ramp'
      ? Math.abs(this.v)
      : this.vel.length()
  }
  // Pitch in degrees, continuous through inverted (170 deg at the top of the wall)
  pitchDeg () {
    if (this.mode === 'ramp') return TRACK.theta(this.s) / DEG
    const f = this.fwd(_a),
      u = this.up(_b)
    const p = Math.asin(clamp(f.y, -1, 1)) / DEG
    return u.y >= 0 ? p : wrapPi((180 - p) * DEG) / DEG
  }

  syncPose () {
    if (this.mode === 'ground') {
      this.quat.setFromAxisAngle(AX_Y, this.yaw)
      this.pos.y = this.floor
      this.vel.y = 0
    } else if (this.mode === 'ramp') {
      const P1 = TRACK.point(this.s - CAR.halfWB, _p1),
        P2 = TRACK.point(this.s + CAR.halfWB, _p2)
      this.rampAngle = Math.atan2(P2.y - P1.y, P2.x - P1.x)
      this.pos.set((P1.x + P2.x) / 2, (P1.y + P2.y) / 2, this.d)
      this.quat.setFromAxisAngle(AX_Z, this.rampAngle)
      const th = TRACK.theta(this.s)
      this.vel.set(Math.cos(th) * this.v, Math.sin(th) * this.v, this.dVel)
    } else {
      this.pos.copy(this.com).sub(this.up(_a).multiplyScalar(CAR.comH))
    }
    if (this.mode !== 'air' && this.mode !== 'crash')
      this.com.copy(this.pos).add(this.up(_a).multiplyScalar(CAR.comH))
  }

  startManeuver (axis, angle) {
    if (this.mode !== 'air') return false
    this.man = { axis, target: angle, acc: 0 }
    return true
  }

  // ---------------- main step ----------------
  step (dt, c) {
    this.time += dt
    this.modeTime += dt
    this.attachCooldown = Math.max(0, this.attachCooldown - dt)
    const grounded = this.mode === 'ground' || this.mode === 'ramp'
    const fanWant = c.fan && grounded && c.lift < 0.25 ? 1 : 0
    this.suction +=
      (fanWant - this.suction) * Math.min(1, dt * (fanWant ? 1.6 : 4.0))
    if (this.suction < 0.003) this.suction = 0

    const hasAir = this.air > 0.2
    const main = hasAir && this.mode !== 'crash' ? clamp01(c.main) : 0
    const lift = hasAir && this.mode !== 'crash' ? clamp01(c.lift) : 0
    this.thrMain = main
    this.thrLift = lift
    const side =
      this.mode === 'air'
        ? Math.min(1, Math.abs(this.att.roll) + Math.abs(this.att.yaw))
        : 0
    this.thrSide = hasAir ? side : 0
    const F =
      main * CAR.mainThrust +
      lift * CAR.liftThrust +
      this.thrSide * CAR.sideThrust
    this.air = Math.max(0, this.air - (F / CAR.ve) * dt)
    if (this.mode === 'ground' && F === 0)
      this.air = Math.min(CAR.airMass, this.air + CAR.recharge * dt)

    if (this.mode === 'ground') stepGround(this, dt, c, main, lift)
    else if (this.mode === 'ramp') stepRamp(this, dt, c, main, lift)
    else if (this.mode === 'air') stepAir(this, dt, c, main, lift)
    else stepCrash(this, dt, c)

    // visual suspension spring
    this.suspV += (-120 * this.susp - 14 * this.suspV) * dt
    this.susp += this.suspV * dt
    const roll =
      ((this.mode === 'ground'
        ? this.speed
        : this.mode === 'ramp'
        ? this.v
        : 0) /
        CAR.wheelR) *
      dt
    this.ebrakeOn = !!c.ebrake && this.mode !== 'air'
    this.wheelSpin += roll
    if (!this.rearLocked)
      this.wheelSpinR += roll + ((this.burnSpin || 0) / CAR.wheelR) * dt
    if (this.mode !== 'ground') {
      this.burning = false
      this.burnSpin = 0
      this.rearSpin = 0
      this.abs = 0
      this.push = 0
      this.ebLock = 0
      this.rearLocked = false
      this.skid = this.skidF = this.skidR = 0
      if (this.mode !== 'ramp') {
        this.drivePower = 0
        this.regenOn = false
      }
    }
    this.gPeak = Math.max(this.gPeak, this.gLoad)
    drift(this, dt) // (scored once it is over: stunts.js)
    donuts(this, dt)

    // 0-60 mph timer
    const gs = this.mode === 'ground' ? this.speed : -1
    if (
      this.mode === 'ground' &&
      (Math.abs(this.speed) < 0.15 || this.burning)
    ) {
      this.z60.armed = true
      this.z60.t0 = this.time
    }
    if (this.z60.armed && gs >= 26.82) {
      this.z60.armed = false
      this.z60.last = this.time - this.z60.t0
      this.emit('z60', { t: this.z60.last })
    }
    if (this.mode !== 'ground') this.z60.armed = false
  }

  setMode (m) {
    this.mode = m
    this.modeTime = 0
  }

  toAir (cooldown = 0.4) {
    const fromRamp = this.mode === 'ramp'
    this.syncPose()
    this.com.copy(this.pos).add(this.up(_a).multiplyScalar(CAR.comH))
    this.omega.set(
      0,
      fromRamp ? 0 : this.yawRate,
      fromRamp ? this.v * TRACK.kappa(this.s) : 0
    )
    this.setMode('air')
    this.attachCooldown = cooldown
    this.stunt = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      t: 0,
      invStart: this.up(_b).y < 0
    }
  }

  // roof: the building top it comes down on (null for the street)
  land (roof = null) {
    this.roof = roof
    this.floor = roof ? roof.y1 : 0
    const f = this.fwd(_a)
    const vy = this.vel.y
    // (a nose pointing nearly straight down: face the way the car is going)
    if (Math.hypot(f.x, f.z) > 0.25) this.yaw = Math.atan2(-f.z, f.x)
    else if (Math.hypot(this.vel.x, this.vel.z) > 1)
      this.yaw = Math.atan2(-this.vel.z, this.vel.x)
    this.yawRate = clamp(
      _b.copy(this.omega).applyQuaternion(this.quat).y,
      -3,
      3
    )
    this.vel.y = 0
    this.speed =
      this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)
    this.setMode('ground')
    this.man = null
    const gImpact = 1 + Math.abs(vy) / (G * 0.16)
    this.gLoad = gImpact
    this.gPeak = Math.max(this.gPeak, gImpact)
    this.suspV = vy * 0.9
    this.syncPose()
    this.emit('touchdown', { g: gImpact, vy })
    this.scoreLanding(gImpact)
  }

  scoreLanding (gImpact) {
    const st = this.stunt
    if (!st) return
    const tricks = []
    let pts = 0
    const nP = Math.floor((Math.abs(st.pitch) + 0.7) / TAU)
    if (nP > 0) {
      const n = st.pitch > 0 ? 'Backflip' : 'Frontflip'
      tricks.push(nP > 1 ? `${nP}× ${n}` : n)
      pts += 1500 * nP
    }
    const nR = Math.floor((Math.abs(st.roll) + 0.7) / TAU)
    if (nR > 0) {
      tricks.push(nR > 1 ? `${nR}× Kickflip` : 'Kickflip')
      pts += 1200 * nR
    } else if (st.invStart && Math.abs(Math.abs(st.roll) - Math.PI) < 0.8) {
      tricks.push('Half roll')
      pts += 400
    }
    const nY = Math.floor((Math.abs(st.yaw) + 0.7) / TAU)
    if (nY > 0) {
      tricks.push(nY > 1 ? `${nY}× 360 spin` : '360 spin')
      pts += 800 * nY
    }
    if (st.t > 1.0) pts += Math.round(st.t * 150)
    pts += gImpact < 3.6 ? 500 : 250
    this.stunt = null
    if (st.t > 0.5)
      this.emit('landing', { tricks, pts, airtime: st.t, g: gImpact })
  }

  hitSolid () {
    const q = this.quat,
      P = this.pos
    const solids =
      this.world === 'city'
        ? query(P.x - 6, P.z - 6, P.x + 6, P.z + 6, _near)
        : SOLIDS
    for (const p of CORNERS) {
      _a.copy(p).applyQuaternion(q).add(P)
      for (const b of solids) {
        // (the lineup's cars bounce the car off instead: bumpCars)
        if (b.down || b.kind === 'car' || _a.y <= b.y0 || _a.y >= b.y1) continue
        if (
          b.r
            ? Math.hypot(_a.x - b.x, _a.z - b.z) < b.r
            : _a.x > b.x0 && _a.x < b.x1 && _a.z > b.z0 && _a.z < b.z1
        ) {
          // hit hard enough, street lights, signals and trees go over rather than stop the car
          if (b.breakAt) {
            const dx = _a.x - b.x,
              dz = _a.z - b.z,
              l = Math.hypot(dx, dz) || 1
            if (knock(this, b, dx / l, dz / l)) continue
          }
          return b
        }
      }
    }
    return null
  }
  toCrash (reason) {
    enterCrash(this, reason)
  }
}
