// Keyboard and touch input: held drive keys, one-shot command keys, and the manual control mapping.
import { TRACK } from '../sim/track.js'
import { makeControls } from '../sim/constants.js'

export const DRIVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyB',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight'
])

export class Input {
  // onDrive(code, firstPress) fires for held driving keys, onCommand(code) for everything else
  constructor ({ onDrive, onCommand }) {
    this.keys = new Set()
    const press = code => {
      if (DRIVE_KEYS.has(code)) {
        const first = !this.keys.has(code)
        this.keys.add(code)
        onDrive(code, first)
      } else onCommand(code)
    }
    window.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (DRIVE_KEYS.has(e.code)) e.preventDefault()
      if (!e.repeat) press(e.code)
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
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
        this.keys.delete(code)
      }
      b.addEventListener('pointerdown', down)
      b.addEventListener('pointerup', up)
      b.addEventListener('pointercancel', up)
      b.addEventListener('lostpointercapture', up)
    }
  }

  held (a, b) {
    return this.keys.has(a) || (b !== undefined && this.keys.has(b))
  }

  // Map held keys to controls. Same keys drive on the ground and fly in the air.
  controls (sim, fanMode) {
    const c = makeControls()
    const W = this.held('KeyW', 'ArrowUp'),
      S = this.held('KeyS', 'ArrowDown')
    const A = this.held('KeyA', 'ArrowLeft'),
      D = this.held('KeyD', 'ArrowRight')
    const nearWall =
      sim.world === 'site' &&
      sim.pos.x > TRACK.X0 - 25 &&
      sim.pos.x < TRACK.towerX1 &&
      Math.abs(sim.pos.z) < TRACK.W &&
      Math.cos(sim.yaw) > 0.3
    c.fan =
      fanMode === 'on' ||
      (fanMode === 'auto' && (sim.mode === 'ramp' || nearWall))
    c.ebrake = this.keys.has('KeyB')
    c.main = this.held('ShiftLeft', 'ShiftRight') ? 1 : 0
    c.lift = this.keys.has('Space') ? 1 : 0
    if (sim.mode === 'air') {
      c.pitch = (S ? 1 : 0) - (W ? 1 : 0)
      c.roll = (D ? 1 : 0) - (A ? 1 : 0)
      c.yaw = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0)
    } else {
      c.throttle = W ? 1 : 0
      c.steer = (A ? 1 : 0) - (D ? 1 : 0)
      if (S) {
        // S brakes while rolling forward, then reverses (also back down the wall)
        const fwd = sim.mode === 'ramp' ? sim.v : sim.speed
        if (fwd > 0.5) c.brake = 1
        else c.reverse = 1
      }
    }
    return c
  }
}
