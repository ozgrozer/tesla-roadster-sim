// The speedometer, bottom right over where you are: the speed in big digits (km/h or mph: U, or a
// click on the unit, switches, and it is remembered), a power meter from its zero (regen in green to
// the left, power in white to the right), the drive selector (P R N D) and the lamps a dashboard
// lights while they work: ABS, ESC, Track Mode and the e-brake.
import { CAR } from '../sim/constants.js'
import { $, put } from './dom.js'
import { recall, remember } from './prefs.js'

const UNITS = {
  kmh: { k: 3.6, label: 'km/h' },
  mph: { k: 2.23694, label: 'mph' }
}
const PARK_S = 1.5 // s at a standstill with nothing pressed before it shows P
const POWER_KW = CAR.powerW / 1000
const REGEN_KW = CAR.regenPowerW / 1000

export class Speedo {
  constructor () {
    this.el = {
      v: $('spV'),
      unit: $('spUnit'),
      gears: [...$('spGear').children],
      regen: $('spRegen'),
      power: $('spPow'),
      abs: $('lAbs'),
      esc: $('lEsc'),
      track: $('lTrack'),
      brake: $('lBrake')
    }
    this.unit = recall('units') === 'mph' ? 'mph' : 'kmh'
    this.still = 0 // s at a standstill with nothing pressed
    this.gear = 'P'
    this.onToggle = null // (the HUD says which unit it is now)
    this.el.unit.addEventListener('click', e => {
      // (let go of focus after a click, or Space, the e-brake, would press it again)
      if (e.detail) this.el.unit.blur()
      this.toggle()
    })
    this.showUnit()
  }

  // km/h to mph and back; returns the unit's name
  toggle () {
    this.unit = this.unit === 'kmh' ? 'mph' : 'kmh'
    remember('units', this.unit)
    this.showUnit()
    const label = UNITS[this.unit].label
    this.onToggle?.(label)
    return label
  }
  showUnit () {
    const now = UNITS[this.unit].label,
      other = UNITS[this.unit === 'kmh' ? 'mph' : 'kmh'].label
    put(this.el.unit, 'text', now)
    put(this.el.unit, '@aria-label', `Speed in ${now}: switch to ${other} (U)`)
  }

  // P at a standstill with nothing pressed for a moment (and while Optimus gets in), R backing up
  // (the driver's reverse, not a slide that has turned the car round), N with the wheels off the
  // ground, D otherwise
  selector (dt, sim, c, parked) {
    if (parked) return 'P'
    if (sim.mode === 'air' || sim.mode === 'crash') {
      this.still = 0
      return 'N'
    }
    const v = sim.mode === 'ramp' ? sim.v : sim.speed
    const busy =
      c.throttle > 0.02 ||
      c.brake > 0.02 ||
      c.reverse > 0.02 ||
      c.burnout ||
      c.ebrake ||
      c.main > 0 ||
      c.lift > 0 ||
      Math.abs(c.steer) > 0.05
    this.still = Math.abs(v) < 0.15 && !busy ? this.still + dt : 0
    if (this.still > PARK_S) return 'P'
    if (c.reverse > 0.02) return 'R'
    // (still in reverse while it rolls back to a stop after S is let go)
    return this.gear === 'R' && v < 0.3 && !(c.throttle > 0.02) ? 'R' : 'D'
  }

  update (dt, app) {
    const { sim } = app,
      el = this.el
    put(
      el.v,
      'text',
      String(Math.round(sim.groundSpeed() * UNITS[this.unit].k))
    )
    // power on a square-root scale, so cruising shows; regen is a quarter of the meter
    const kw = sim.drivePower / 1000
    const power = kw > 0 ? Math.sqrt(Math.min(1, kw / POWER_KW)) : 0
    const regen = kw < 0 ? Math.min(1, -kw / REGEN_KW) : 0
    put(el.power, 'transform', `scaleX(${power.toFixed(3)})`)
    put(el.regen, 'transform', `scaleX(${regen.toFixed(3)})`)
    this.gear = this.selector(dt, sim, app.lastCtl, app.intro)
    for (const g of el.gears) put(g, '.on', g.textContent === this.gear)
    // (ABS: as the sim says it is working; ESC flickers as a dashboard's does)
    const moving = sim.groundSpeed() > 1
    put(el.abs, '.on', (sim.abs || 0) > 0.5 && moving)
    // (the stability control catching a slide, or holding the power back while the fronts push wide)
    put(el.esc, '.on', !!sim.escActive || (sim.push || 0) > 0.4)
    put(el.track, '.on', !!sim.track)
    put(el.brake, '.on', !!sim.ebrakeOn)
  }
}
