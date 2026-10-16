// Autopilot: flies the reveal-night sequence through the same controls a player uses.
//  Stunt 1: from the foot of the wall, climb and hang inverted, reverse back to the start, then a
//           full-speed run off the lip, roll upright and come straight down on the thrusters.
//  Stunt 2: full speed and full thrust over the parked lineup with a kickflip, thruster landing.
import * as THREE from 'three'
import { TRACK, LINEUP_FIRST, LINEUP_LAST } from './track.js'
import {
  G,
  TAU,
  CAR,
  clamp,
  wrapPi,
  clamp01,
  LIFT_ACC,
  makeControls
} from './constants.js'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const JUMP_SPEED = 50 // m/s for the lineup jump (180 km/h), built up with the main thrusters
const JUMP_LEAD = 1.05 // s before the first car to lift off, so the kickflip starts over it
const LIP_BURN = 3.4 // m of lip where the rear thrusters fire before the push-off

export const CAPS = {
  stage: [
    'Stunt 1 · The Wall',
    'Roadster at the wall',
    'Suction fan spooling up · skirts down'
  ],
  climb: [
    'Stunt 1 · The Wall',
    'Climbing the wall',
    'Fan suction 2.1 G keeps the tires planted'
  ],
  hold: [
    'Inverted',
    'Hanging at 170°',
    '21 m up · about 4,600 kg of fan downforce'
  ],
  reverse: [
    'Inverted',
    'Reversing down the wall',
    'Brakes and suction control the drop'
  ],
  ready: ['Stunt 1 · Flight', 'Full-speed run', 'Back at the start'],
  charge: [
    'Stunt 1 · Flight',
    'Full speed up the wall',
    'Brakes over the top · rear thrusters fire, then it pushes off the lip'
  ],
  halfroll: ['Flight', 'Rolling upright', 'Side attitude thrusters'],
  descend: ['Flight', 'Falling', 'Thrusters idle until the last few metres'],
  burn: ['Landing burn', 'Full bottom thrust', ''],
  settle: [
    'Landing burn',
    'Settling',
    'Easing onto the floor through the vapor'
  ],
  rollout: [
    'Stunt 2 · The Lineup',
    'Full speed',
    'Tires plus four rear thrusters'
  ],
  jump: [
    'Stunt 2 · The Lineup',
    'Full thrust',
    'Fan off · all lift nozzles open'
  ],
  kickflip: [
    'Stunt 2 · The Lineup',
    'Kickflip',
    '360° roll over five parked Teslas, as at the event'
  ],
  stop: ['Stunt 2 · The Lineup', 'Stuck it', 'Air tank recharging'],
  done: [
    'Demo complete',
    'Your turn',
    'Press M or any drive key to take the wheel · P to replay'
  ],
  crashed: ['Autopilot', 'Crashed', 'Restarting the run']
}
const SHOTS = {
  stage: 'intro',
  climb: 'wallWide',
  hold: 'topClose',
  reverse: 'topClose',
  ready: 'wallWide',
  charge: 'wallWide',
  halfroll: 'landing',
  descend: 'landing',
  burn: 'landing',
  settle: 'landing',
  rollout: 'tracking',
  jump: 'jumpTrack',
  kickflip: 'jumpTrack',
  stop: 'orbit',
  done: 'orbit',
  crashed: 'orbit'
}

export class Autopilot {
  constructor (sim) {
    this.sim = sim
    this.reset()
  }

  reset () {
    this.sim.reset('base')
    this.phase = 'stage'
    this.t = 0
    this.total = 0
    this.slow = 1
    this.countdown = null
    this.cap = CAPS.stage.slice()
    this.shot = SHOTS.stage
    this.restart = false
    this.stunt = 1
  }

  go (p) {
    this.phase = p
    this.t = 0
    this.cap = (CAPS[p] || this.cap).slice()
    this.shot = SHOTS[p] || this.shot
  }

  // ---- control helpers ----
  accel (c, a) {
    if (a >= 0) c.throttle = clamp01(a / CAR.driveAccelMax)
    else c.brake = clamp01(-a / CAR.brakeAccel)
  }

  // moving backwards: brakes push forward, reverse pushes back
  accelReverse (c, a) {
    if (a >= 0) c.brake = clamp01(a / CAR.brakeAccel)
    else c.reverse = clamp01(-a / 5)
  }

  speedTo (c, vT) {
    this.accel(c, 2.2 * (vT - this.sim.speed))
  }

  lane (c, zT, yawT) {
    const s = this.sim
    const dir = Math.cos(yawT) >= 0 ? 1 : -1
    const yawCorr = clamp(-dir * (zT - s.pos.z) * 0.08, -0.3, 0.3)
    c.steer = clamp(wrapPi(yawT + yawCorr - s.yaw) * 2.5, -1, 1)
  }

  fwdSpeed () {
    const s = this.sim
    const f = s.fwd(_a)
    const h = Math.hypot(f.x, f.z) || 1
    return (s.vel.x * f.x + s.vel.z * f.z) / h
  }

  altHold (c, target, alt) {
    const s = this.sim
    const upY = s.up(_b).y
    const aUp = G + 2.6 * (target - alt) - 2.4 * s.vel.y
    c.lift = upY < 0.8 ? 0 : clamp01(aUp / (LIFT_ACC * upY))
  }

  // Nose-up attitude for the landing burn: tilted bottom nozzles also bleed off forward speed.
  burnFlare (alt) {
    return alt > 1.2 ? clamp(0.02 * this.fwdSpeed(), 0, 0.4) : 0
  }

  // Free fall with the thrusters idle until the stopping distance at full bottom thrust
  // (with some margin) reaches the floor, then light everything.
  burnNow (alt, flare) {
    const vy = this.sim.vel.y
    const net = LIFT_ACC * Math.cos(flare) - G
    return vy < -2 && alt - 1.0 <= (vy * vy) / (2 * 0.85 * net)
  }

  update (dt) {
    const s = this.sim
    const c = makeControls()
    c.latHold = true
    this.t += dt
    this.total += dt
    const alt = s.mode === 'air' ? Math.max(0, s.com.y - CAR.comH) : s.pos.y
    if (s.mode === 'crash' && this.phase !== 'crashed') this.go('crashed')
    switch (this.phase) {
      case 'stage':
        c.brake = 1
        this.countdown = Math.max(1, 3 - Math.floor(this.t / 0.8))
        if (this.t > 2.4) {
          this.countdown = 0
          this.go('climb')
        }
        break
      case 'climb': {
        if (this.t > 0.6) this.countdown = null
        if (s.mode !== 'ramp') {
          this.speedTo(c, 12)
          this.lane(c, 0, 0)
          break
        }
        const th = TRACK.theta(s.s)
        const rem = TRACK.sHold - s.s
        if (rem > 1.0)
          this.accel(
            c,
            2.5 * (Math.min(13.5, Math.sqrt(2 * 5.5 * rem)) - s.v) +
              G * Math.sin(th)
          )
        else this.accel(c, 3.0 * rem - 3.2 * s.v + G * Math.sin(th))
        if (Math.abs(rem) < 0.3 && Math.abs(s.v) < 0.35) this.go('hold')
        break
      }
      case 'hold':
        c.brake = 1
        if (this.t > 1.0)
          this.cap[2] = `Reversing down in ${Math.max(0, 2.6 - this.t).toFixed(
            1
          )} s`
        if (this.t > 2.6) this.go('reverse')
        break
      case 'reverse': {
        // backwards down the wall: gravity does the work and the brakes hold the speed,
        // easing to a stop on the flat beginning of the platform (not out on the floor)
        const left = s.s - TRACK.baseS
        const vT =
          s.s > 8 ? -8 : -Math.min(3, Math.sqrt(2 * 3 * Math.max(0, left)))
        this.accelReverse(c, 2.5 * (vT - s.v) + G * Math.sin(TRACK.theta(s.s)))
        if ((left < 0.25 && Math.abs(s.v) < 0.3) || s.mode !== 'ramp')
          this.go('ready')
        break
      }
      case 'ready':
        c.brake = 1
        this.cap[2] = `Back at the start · go in ${Math.max(
          0,
          1.2 - this.t
        ).toFixed(1)} s`
        if (this.t > 1.2) this.go('charge')
        break
      case 'charge':
        if (s.mode === 'ground') {
          c.throttle = s.speed < 15.5 ? 1 : 0
          this.lane(c, 0, 0)
        } else if (s.mode === 'ramp') {
          // full power the whole way up and over the top (no braking), rear thrusters on along
          // the lip, then the bottom ones push it off the ceiling
          const toEnd = TRACK.L - s.s
          c.throttle = 1
          if (toEnd < LIP_BURN) c.main = 1
          if (toEnd < 1.6) {
            c.fan = false
            c.lift = 1
          }
        } else if (s.mode === 'air') {
          s.startManeuver('x', Math.PI)
          this.go('halfroll')
        }
        break
      case 'halfroll':
        if (!s.man) this.go('descend')
        break
      case 'descend':
        // falling: no thrust, nose pre-tilted so the burn starts at the right attitude
        c.flare = this.burnFlare(alt)
        if (this.burnNow(alt, c.flare)) this.go('burn')
        if (s.mode === 'ground') this.go(this.stunt === 1 ? 'rollout' : 'stop')
        break
      case 'burn':
        // close to the floor: full bottom thrust until the fall is nearly stopped
        c.lift = 1
        c.flare = this.burnFlare(alt)
        this.cap[2] = `${s.gLoad.toFixed(1)} G · ${alt.toFixed(
          1
        )} m off the floor`
        if (s.vel.y > -2.6) this.go('settle')
        if (s.mode === 'ground') this.go(this.stunt === 1 ? 'rollout' : 'stop')
        break
      case 'settle': {
        // ease the last metres down at ~2 m/s
        const upY = s.up(_b).y
        c.lift = clamp01(
          (G + 4 * (-2 - s.vel.y)) / (LIFT_ACC * Math.max(upY, 0.3))
        )
        c.flare = this.burnFlare(alt)
        if (s.mode === 'ground') this.go(this.stunt === 1 ? 'rollout' : 'stop')
        break
      }
      case 'rollout':
        // the long run to the lineup: main thrusters on until jump speed, then hold it
        this.stunt = 2
        c.throttle = s.speed < JUMP_SPEED ? 1 : 0
        c.main = s.speed < JUMP_SPEED - 1 ? 1 : 0
        this.lane(c, 0, Math.PI)
        if (c.main)
          this.cap[2] = `Main thrusters · ${Math.round(s.speed * 3.6)} km/h`
        else
          this.cap[2] = `Holding ${Math.round(
            JUMP_SPEED * 3.6
          )} km/h for the jump`
        if (s.pos.x < LINEUP_FIRST + JUMP_SPEED * JUMP_LEAD + 30) c.fan = false
        if (s.pos.x < LINEUP_FIRST + JUMP_SPEED * JUMP_LEAD) this.go('jump')
        break
      case 'jump':
        c.fan = false
        c.lift = alt < 3.5 ? 1 : 0
        // (s.speed is the ground speed and goes stale once airborne: use the real horizontal speed)
        c.main = alt < 3.5 && Math.hypot(s.vel.x, s.vel.z) < JUMP_SPEED ? 1 : 0
        if (s.mode === 'ground') this.lane(c, 0, Math.PI)
        if (
          s.mode === 'air' &&
          alt > 6 &&
          s.vel.y > 0 &&
          s.startManeuver('x', -TAU)
        )
          this.go('kickflip')
        break
      case 'kickflip':
        c.fan = false
        this.altHold(c, 9, alt)
        this.slow = s.man ? 0.55 : 1
        if (!s.man && s.pos.x < LINEUP_LAST - 1) {
          this.slow = 1
          this.go('descend')
        }
        break
      case 'stop':
        c.brake = 1
        c.fan = true
        this.lane(c, 0, Math.PI)
        if (Math.abs(s.speed) < 0.3 && this.t > 1) this.go('done')
        break
      case 'done':
        c.brake = 1
        c.ebrake = true
        if (this.t > 6) this.restart = true
        break
      case 'crashed':
        this.slow = 1
        if (this.t > 3.5) this.restart = true
        break
    }
    return c
  }
}
