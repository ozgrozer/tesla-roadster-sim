// Keyboard, gamepad and touch input: held drive keys, one-shot command keys, and the manual control
// mapping (a gamepad's sticks and triggers are analog: gamepad.js).
import { Pad } from './gamepad.js'
import { TRACK } from '../sim/track.js'
import { BURN_V } from '../sim/drift.js'
import { smooth } from '../sim/tyres.js'
import { G, CAR, clamp, makeControls } from '../sim/constants.js'

// The steering keys ease the wheel over rather than throwing it to full lock: full in KEY_T s at a
// standstill and KEY_T_V s more per m/s (up to KEY_V_TOP m/s: past it the wheel turns no slower, as
// the steering's reach is already small up there), so at speed a tap is a small correction, holding
// the key a lane change, then a turn at the tyres' limit; with the handbrake pulled, or the car
// sliding, as fast as at a standstill (a handbrake turn, a slide to catch). Let go and it comes back
// KEY_BACK times as fast.
const KEY_T = 0.1,
  KEY_T_V = 0.008,
  KEY_V_TOP = 35,
  KEY_BACK = 2.5
// The brake key squeezes the pedal rather than stamping on it: the brakes come on over BRAKE_T s,
// as a foot pushes the pedal down and the calipers build pressure (about how long a real hard stop
// takes to reach its full bite), so a tap slows the car a little and holding it is a full stop; let
// go, they are off in BRAKE_OFF s. Held through a stop, it keeps the car on its brakes for STOP_HOLD
// s, as a driver stops and then selects reverse, before it backs up (pressed afresh at a standstill
// it backs up at once), the motor's pull easing in over BRAKE_T s.
const BRAKE_T = 0.3,
  BRAKE_OFF = 0.1,
  STOP_HOLD = 0.5
// The throttle key presses the pedal down over GAS_T s, as a foot does (and the motors' torque
// builds), rather than all at once: a tap creeps the car forward, holding it is full power a moment
// later; let go, it is up in GAS_OFF s.
const GAS_T = 0.2,
  GAS_OFF = 0.06
// A gamepad's feel for the tyres and the road (gamepad.js), set every FEEL_T s while a pad drives
// (it has been touched in the last FEEL_IDLE s): a faint buzz as the tyres near their grip (from
// FEEL_USE of it), more once they slide or the ABS pulses, and a low rumble while the rears spin
// (a burnout, a drift on the power) and over grass or sand
const FEEL_T = 0.1,
  FEEL_IDLE = 10,
  FEEL_USE = 0.85
// k eased towards want (-1, 0 or 1) at up per s, and back to the middle at down per s
export function easeKey (k, want, up, down, dt) {
  if (want !== 0 && k * want >= 0)
    return want > 0 ? Math.min(want, k + up * dt) : Math.max(want, k - up * dt)
  return k > 0 ? Math.max(0, k - down * dt) : Math.min(0, k + down * dt)
}

// Held, Z looks behind the car, as GTA's does (camera.js; a gamepad's right stick pressed in
// presses it: gamepad.js). Not a drive key: it doesn't take the wheel from Autopilot.
export const LOOK_BACK = 'KeyZ'

export const DRIVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyF',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight'
])

export class Input {
  // onDrive(code, firstPress) fires for held driving keys (and a gamepad's sticks and triggers),
  // onCommand(code) for everything else, onRelease(code) when any key comes back up (the horn sounds
  // for as long as H is held), and onPad(name) when a gamepad is plugged in
  constructor ({ onDrive, onCommand, onRelease = () => {}, onPad }) {
    this.keys = new Set()
    this.stale = new Set() // held since before lift-off: they don't fly the car until pressed again
    this.wasAir = false
    this.lastT = -1
    this.down = new Set() // every key held, drive or not
    const press = code => {
      if (code === 'Pad') return onDrive(code, true)
      this.down.add(code)
      if (DRIVE_KEYS.has(code)) {
        const first = !this.keys.has(code)
        this.keys.add(code)
        this.stale.delete(code)
        onDrive(code, first)
      } else onCommand(code)
    }
    window.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (DRIVE_KEYS.has(e.code)) e.preventDefault()
      if (!e.repeat) press(e.code)
    })
    const release = code => {
      this.keys.delete(code)
      if (this.down.delete(code)) onRelease(code)
    }
    window.addEventListener('keyup', e => release(e.code))
    window.addEventListener('blur', () => {
      for (const code of this.down) release(code)
      this.keys.clear()
    })
    this.pad = new Pad({ press, release, onConnect: onPad })
    this.padStale = false // a stick held over since before lift-off
    // the brake key's pedal (0 to 1), the reverse it eases into, and how long it has held the car
    // at a standstill (-1: not braked to one)
    this.keyBrake = this.backing = this.keyGas = 0
    this.stopT = -1
    // on-screen pad for touch screens: each button behaves like its key
    for (const b of document.querySelectorAll('.tb')) {
      const code = b.dataset.key
      const down = e => {
        e.preventDefault()
        b.classList.add('active')
        b.setPointerCapture?.(e.pointerId)
        press(code)
      }
      const up = () => {
        b.classList.remove('active')
        release(code)
      }
      b.addEventListener('pointerdown', down)
      b.addEventListener('pointerup', up)
      b.addEventListener('pointercancel', up)
      b.addEventListener('lostpointercapture', up)
    }
  }

  // once a frame: the gamepad's buttons, sticks and triggers
  poll () {
    this.pad.poll()
  }

  // whether the look-behind key (or the pad's button for it) is held
  lookBack () {
    return this.down.has(LOOK_BACK)
  }

  // `fresh`: leave out keys still held from before lift-off
  held (a, b, fresh = false) {
    const on = k => this.keys.has(k) && !(fresh && this.stale.has(k))
    return on(a) || (b !== undefined && on(b))
  }

  // Map held keys to controls. Same keys drive on the ground and fly in the air, but a key held
  // through lift-off only flies once it is pressed again: W held for the run-up would otherwise
  // pitch the nose straight back down into the ground.
  controls (sim, fanMode) {
    const c = makeControls()
    const air = sim.mode === 'air'
    // (the first call after the autopilot hands over, or after a reset, is not a lift-off)
    const pad = this.pad
    if (air && !this.wasAir && Math.abs(sim.time - this.lastT) < 0.05) {
      for (const k of this.keys) this.stale.add(k)
      this.padStale = Math.hypot(pad.stickX, pad.stickY) > 0.3
    }
    if (!air) this.stale.clear()
    // (a stick that was steering only flies the car once it has come back to the middle)
    if (!air || Math.hypot(pad.stickX, pad.stickY) < 0.2) this.padStale = false
    this.wasAir = air
    const dt = clamp(sim.time - this.lastT, 0, 0.05)
    this.lastT = sim.time
    const W = this.held('KeyW', 'ArrowUp', air),
      S = this.held('KeyS', 'ArrowDown', air)
    const A = this.held('KeyA', 'ArrowLeft', air),
      D = this.held('KeyD', 'ArrowRight', air)
    const nearWall =
      sim.world === 'site' &&
      sim.pos.x > TRACK.X0 - 25 &&
      sim.pos.x < TRACK.towerX1 &&
      Math.abs(sim.pos.z) < TRACK.W &&
      Math.cos(sim.yaw) > 0.3
    c.fan =
      fanMode === 'on' ||
      (fanMode === 'auto' && (sim.mode === 'ramp' || nearWall))
    // Space is the handbrake, as in GTA; F (fly) fires the lift thrusters
    c.ebrake = this.keys.has('Space')
    c.main = this.held('ShiftLeft', 'ShiftRight') ? 1 : 0
    c.lift = this.keys.has('KeyF') ? 1 : 0
    // a key wins over the stick; the stick and triggers are analog
    const or = (key, analog) => key || analog
    if (air) {
      this.keyBrake = this.backing = this.keyGas = 0
      this.stopT = -1
      const live = !this.padStale
      c.pitch = or((S ? 1 : 0) - (W ? 1 : 0), live ? pad.stickY : 0)
      c.roll = or((D ? 1 : 0) - (A ? 1 : 0), live ? pad.stickX : 0)
      c.yaw = or(
        (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0),
        -pad.lookX
      )
    } else {
      this.keyGas = easeKey(this.keyGas, W ? 1 : 0, 1 / GAS_T, 1 / GAS_OFF, dt)
      c.throttle = Math.max(this.keyGas, pad.throttle)
      // (sliding: the rear axle running ten degrees or more off the line of the car)
      const sliding = sim.mode === 'ground' && Math.abs(sim.slipR) > 0.17
      const T =
        c.ebrake || sliding
          ? KEY_T
          : KEY_T + KEY_T_V * Math.min(KEY_V_TOP, sim.groundSpeed())
      this.keySteer = easeKey(
        this.keySteer || 0,
        (A ? 1 : 0) - (D ? 1 : 0),
        1 / T,
        KEY_BACK / T,
        dt
      )
      c.steer = or(this.keySteer, pad.steer)
      this.keyBrake = easeKey(
        this.keyBrake,
        S ? 1 : 0,
        1 / BRAKE_T,
        1 / BRAKE_OFF,
        dt
      )
      const brake = Math.max(this.keyBrake, pad.brake)
      // the throttle and the brake together at a crawl: a burnout (and with the wheel turned, a
      // donut), as in GTA
      let rev = false
      if (
        Math.max(W ? 1 : 0, pad.throttle) > 0.5 &&
        Math.max(S ? 1 : 0, pad.brake) > 0.5 &&
        !c.ebrake &&
        sim.mode === 'ground' &&
        sim.groundSpeed() < BURN_V
      )
        c.burnout = true
      else if (brake > 0.02) {
        // S brakes while rolling forward, holds the car once it has stopped, then reverses (also
        // back down the wall). (stopT: s held at a standstill after braking the car to it, -1 if
        // it was pressed there)
        const fwd = sim.mode === 'ramp' ? sim.v : sim.speed
        if (fwd > 0.5) {
          c.brake = brake
          this.stopT = 0
        } else if (this.stopT >= 0 && this.stopT < STOP_HOLD) {
          c.brake = brake
          this.stopT += dt
        } else {
          // (from holding the car, the motor's pull eases in; pressed at a standstill, the
          // pedal or trigger is already easing in)
          rev = true
          c.reverse =
            this.stopT >= 0
              ? Math.min(brake, this.backing + dt / BRAKE_T)
              : brake
        }
      } else this.stopT = -1
      this.backing = rev ? c.reverse : 0
    }
    this.feel(sim)
    return c
  }

  // the pad's feel for the tyres and the road, every FEEL_T s of the sim's time
  feel (sim) {
    const pad = this.pad
    if (pad.index < 0 || performance.now() - pad.usedAt > FEEL_IDLE * 1000)
      return
    if (Math.abs(sim.time - (this.feltT ?? -1)) < FEEL_T) return
    this.feltT = sim.time
    if (sim.mode !== 'ground') return
    const grip = CAR.tireMu * ((sim.world === 'city' && sim.grip) || 1),
      use = Math.hypot(sim.latAcc, 0.6 * sim.accLong) / (G * grip),
      slide = Math.max(sim.skidF, sim.skidR, 0.8 * sim.abs),
      spin = sim.burning ? 1 : sim.rearSpin,
      rough =
        sim.surface === 'sand' || sim.surface === 'grass'
          ? clamp(sim.groundSpeed() / 15, 0, 1)
          : 0
    pad.feel(
      0.3 * spin + 0.2 * rough + 0.1 * slide,
      0.12 * smooth((use - FEEL_USE) / 0.15) + 0.4 * slide + 0.15 * rough
    )
  }
}
