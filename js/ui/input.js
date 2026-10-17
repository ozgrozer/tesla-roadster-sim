// Keyboard, gamepad and touch input: held drive keys, one-shot command keys, and the manual control
// mapping (a gamepad's sticks and triggers are analog: gamepad.js).
import { Pad } from './gamepad.js'
import { TRACK } from '../sim/track.js'
import { BURN_V } from '../sim/ground.js'
import { clamp, makeControls } from '../sim/constants.js'

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
// k eased towards want (-1, 0 or 1) at up per s, and back to the middle at down per s
export function easeKey (k, want, up, down, dt) {
  if (want !== 0 && k * want >= 0)
    return want > 0 ? Math.min(want, k + up * dt) : Math.max(want, k - up * dt)
  return k > 0 ? Math.max(0, k - down * dt) : Math.min(0, k + down * dt)
}

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
      const live = !this.padStale
      c.pitch = or((S ? 1 : 0) - (W ? 1 : 0), live ? pad.stickY : 0)
      c.roll = or((D ? 1 : 0) - (A ? 1 : 0), live ? pad.stickX : 0)
      c.yaw = or(
        (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0),
        -pad.lookX
      )
    } else {
      c.throttle = Math.max(W ? 1 : 0, pad.throttle)
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
      const brake = Math.max(S ? 1 : 0, pad.brake)
      // the throttle and the brake together at a crawl: a burnout (and with the wheel turned, a
      // donut), as in GTA
      if (
        c.throttle > 0.5 &&
        brake > 0.5 &&
        !c.ebrake &&
        sim.mode === 'ground' &&
        sim.groundSpeed() < BURN_V
      )
        c.burnout = true
      else if (brake > 0.02) {
        // S brakes while rolling forward, then reverses (also back down the wall)
        const fwd = sim.mode === 'ramp' ? sim.v : sim.speed
        if (fwd > 0.5) c.brake = brake
        else c.reverse = brake
      }
    }
    return c
  }
}
