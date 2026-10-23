// The HUD, GTA V's: nothing on screen but the radar bottom left with the health and the air under
// it (minimap.js) and the clock over it (clock.js), the stars and the cash top right (crimeHud.js),
// the speedometer over where you are bottom right (speedo.js, place.js), and the help box top left
// (notify.js) that says the keys for what is going on for a few seconds the first time it comes up.
// No title, no buttons, no line of keys: the pause menu (Esc, P) has the settings, the controls and
// (with ?debug=1) the test site, slow motion and Autopilot. Also the engineering instruments only
// when they matter (instruments.js), stunt titles and the score, and the test site's captions.
import { $, put } from './dom.js'
import { Clock } from './clock.js'
import { Place } from './place.js'
import { Speedo } from './speedo.js'
import { DRIVE_KEYS, LOOK_BACK } from './input.js'
import { keyOf } from './keymap.js'
import { CAR } from '../sim/constants.js'
import { recall, remember } from './prefs.js'
import { Instruments } from './instruments.js'
import { Notices, HelpBox, Score } from './notify.js'

const FAN_TEXT = {
  auto: 'Suction fan: auto · it spins up for the wall · <b>B</b> to change',
  on: 'Suction fan: on · 2.1 G of grip',
  off: 'Suction fan: off'
}
const WAKE_S = 3 // s the title and the buttons stay up after the mouse last moved, while driving
// the keys that drive or fly the car (the keys card's Drive and Fly), and the radio's: they keep
// the screen clean
const PLAY_KEYS = new Set([
  ...DRIVE_KEYS,
  LOOK_BACK,
  'KeyH',
  'KeyZ',
  'KeyX',
  'KeyK',
  'Period',
  'Comma'
])
const LINE_S = 6 // s the help box says the keys for what is going on, the first time it comes up
const DENTED = 1 // m of dents (damage.js's amount) that take the condition bar down to nothing

export class Hud {
  // RS: the Roadster (its nozzles light the schematic); damage: its dents (the condition bar)
  constructor (RS, damage) {
    this.damage = damage
    this.clock = 0
    this.acc = 0
    this.el = {
      cap: $('caption'),
      capE: $('capEyebrow'),
      capT: $('capTitle'),
      capS: $('capSub'),
      countdown: $('countdown'),
      loading: $('loading'),
      fade: $('fade'),
      cond: $('condBar'),
      condBox: $('condBox'),
      air: $('airBar'),
      airBox: $('airBox'),
      radio: $('radioTag'),
      radioFreq: $('radioFreq'),
      radioName: $('radioName')
    }
    this.radioLeft = 0 // s the radio's station stays up
    this.world = 'site'
    this.instruments = new Instruments(RS)
    this.speedo = new Speedo()
    this.speedo.onToggle = unit =>
      this.helpbox.push(`Speed in ${unit} · <b>U</b> to switch`, 1800, 'units')
    this.place = new Place()
    this.daytime = new Clock($('clock'))
    this.notices = new Notices($('notices'))
    this.helpbox = new HelpBox($('helpbox'), $('helpText'))
    this.score = new Score($('scoreBox'), $('score'))
    this.line = '' // the keys for what is going on, and the ones already said in this world (each
    this.lines = new Set() // once: a clean screen)
    this.cam = '' // the camera's name, the slow motion and the sound (the pause menu shows them)
    this.slow = false
    this.sound = false
    // GTA's empty screen: the time of the last wake (the mouse moved, the screen was touched away
    // from the drive pad, a key that isn't a drive key) and of the last driving
    this.wokeAt = 0
    this.droveAt = -1
    const wake = () => (this.wokeAt = this.clock)
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') wake()
    })
    window.addEventListener('pointerdown', e => {
      if (!e.target?.closest?.('.touch')) wake()
    })
    window.addEventListener('keydown', e => {
      if (!PLAY_KEYS.has(e.code)) wake()
      else this.droveAt = this.clock
    })
    // the first visit: where the keys are, said once on the first update (the world set up at boot
    // clears the help box; there are no keys on a phone)
    const touch = !!window.matchMedia?.('(pointer: coarse)')?.matches
    this.keysHint = !touch && recall('keysSeen') !== '1'
    remember('keysSeen', '1')
  }

  // a hint goes in the help box (kind 'hint'); anything else is a title mid-screen
  popup (html, ms = 2300, kind = '') {
    if (kind === 'hint') this.helpbox.push(html, ms)
    else this.notices.show({ title: html, html: true, tone: 'plain', ms })
  }
  // a stunt, a record or a crash (events.js): see Notices.show
  notify (n) {
    this.notices.show(n)
  }
  fanPopup (mode) {
    this.helpbox.push(FAN_TEXT[mode], 1800, 'fan')
  }
  // B: the radio's station (null: off) at the top of the screen as GTA shows it; undefined: the
  // sound is off, so the radio is too
  radio (st) {
    if (st === undefined)
      return this.helpbox.push('The sound is off · turn it on in Settings (<b>Esc</b>)', 1800)
    put(this.el.radioFreq, 'text', st ? `${st.freq} FM` : '')
    put(this.el.radioName, 'text', st ? st.name : 'Radio off')
    this.radioLeft = 2.6
  }
  // U: km/h or mph (quiet: no hint, as from the pause menu)
  toggleUnits (quiet = false) {
    this.speedo.toggle(quiet)
  }

  setMode (auto) {
    this.auto = auto
    this.el.cap.style.opacity = auto ? 1 : 0
  }
  setWorld (w) {
    this.world = w
    const city = w === 'city'
    document.body.classList.toggle('in-city', city)
    this.lines.clear()
    this.helpbox.clear()
  }
  // black out, run fn (the world switch) behind it, then fade back in
  fade (fn) {
    const f = this.el.fade
    f.style.opacity = 1
    setTimeout(() => {
      fn()
      setTimeout(() => (f.style.opacity = 0), 140)
    }, 260)
  }
  // (the old top bar's: kept as state, the pause menu reads it)
  setCam (name) {
    this.cam = name
  }
  setSlow (on) {
    this.slow = on
    if (this.clock > 0) this.helpbox.push(on ? 'Slow motion' : 'Slow motion off', 1200, 'slow')
  }
  setSound (on) {
    this.sound = on
  }
  hideLoading () {
    const l = this.el.loading
    if (!l) return
    l.style.opacity = 0
    setTimeout(() => l.remove(), 700)
    this.el.loading = null
  }

  setText (node, text) {
    put(node, 'text', text)
  }

  update (dt, app) {
    const { sim } = app
    this.clock += dt
    this.instruments.nozzles()
    this.acc += dt
    if (this.acc < 0.07) return
    dt = this.acc
    this.acc = 0
    // (driving: a drive key, or the car moving under the player's hands, a gamepad's too)
    const manual = !app.auto && !app.intro
    if (manual && sim.groundSpeed() > 2) this.droveAt = this.clock
    const quiet =
      manual && this.droveAt > this.wokeAt && this.clock - this.wokeAt > WAKE_S
    put(document.body, '.quiet', quiet)
    put(document.body, '.cine', !!app.intro)
    if (this.keysHint) {
      this.keysHint = false
      this.helpbox.push(
        '<b>Esc</b> or <b>P</b>: the map, settings and controls',
        4500
      )
    }
    this.radioLeft -= dt
    put(this.el.radio, '.on', this.radioLeft > 0)
    this.speedo.update(dt, app)
    this.place.update(dt, app)
    if (app.world === 'city') this.daytime.update()
    this.instruments.update(dt, app)
    this.helpbox.update(dt)
    this.score.update(dt, app.score, !quiet)
    this.vitals(sim)
    this.captions(app)
    this.keysLine(dt, app)
    this.carHud?.update(dt, app) // (whatever the player drives, or on foot: carHud.js)
  }

  // under the radar: the car's condition (its dents) and the thrusters' air
  vitals (sim) {
    const el = this.el
    const cond = Math.max(0, 1 - (this.damage?.amount || 0) / DENTED)
    put(el.cond, 'transform', `scaleX(${cond.toFixed(3)})`)
    put(el.condBox, '.low', cond < 0.3)
    put(el.air, 'transform', `scaleX(${(sim.air / CAR.airMass).toFixed(3)})`)
    put(el.airBox, '.low', sim.air < 50)
  }

  // the autopilot's caption and countdown (the test site's demo, Autopilot in the city)
  captions (app) {
    const el = this.el
    if (!app.auto) {
      put(el.countdown, 'opacity', '0')
      return
    }
    const [e, t, s] = app.ap.cap
    put(el.capE, 'text', e)
    put(el.capT, 'text', t)
    put(el.capS, 'text', s)
    const cd = app.ap.countdown
    put(el.countdown, 'opacity', cd === null ? '0' : '1')
    if (cd !== null) put(el.countdown, 'text', cd === 0 ? 'GO' : String(cd))
    put(el.countdown, '.go', cd === 0)
  }

  // the keys for what is going on, in the help box top left (GTA's) for LINE_S s the first time
  // each comes up in this world (while Autopilot drives, Optimus gets in or the car is wrecked,
  // each time)
  keysLine (dt, app) {
    const text = this.lineFor(app)
    if (text === this.line) return
    this.line = text
    const again = app.auto || app.intro || app.sim.mode === 'crash'
    if (!text || (this.lines.has(text) && !again)) return
    this.lines.add(text)
    this.helpbox.push(text, LINE_S * 1000, 'keys')
  }
  lineFor (app) {
    const { sim } = app
    const k = c => `<b>${keyOf(c)}</b>`
    if (app.auto) {
      const what = this.world === 'city' ? 'Autopilot on' : 'Autopilot demo'
      return `${what} · any drive key takes over`
    }
    if (app.intro) return 'Optimus is getting in · any drive key skips'
    // (on foot, and in a car that isn't the Roadster: onFoot.js)
    if (app.foot)
      return `${k('KeyF')} enter a vehicle · ${k('ShiftLeft')} sprint · ${k('Space')} jump · ` +
        `<b>Click</b> or ${k('KeyR')} punch · <b>Alt</b> walk`
    if (app.vehicle && app.vehicle.kind !== 'roadster' && sim.mode !== 'crash')
      return `${k('Space')} handbrake · ${k('KeyE')} horn · ${k('KeyF')} exit · ${k('KeyC')} look behind`
    if (sim.mode === 'crash')
      return sim.up().y > 0.95
        ? `Crashed · ${k('KeyW')} to drive on · ${k('KeyR')} to reset`
        : `Upside down · ${k('KeyA')} ${k('KeyD')} to roll it back over · ${k('KeyR')} to reset`
    if (sim.mode === 'air')
      return `${k('KeyW')} ${k('KeyS')} pitch · ${k('KeyA')} ${k('KeyD')} roll · ${k('KeyQ')} <b>E</b> yaw · ` +
        `${k('KeyG')} lift · ${k('KeyX')} backflip · ${k('KeyK')} kickflip`
    if (sim.mode === 'ramp')
      return `${k('KeyW')} climb · ${k('KeyS')} brake, then reverse down · ${k('ShiftLeft')} main burn off the lip`
    return this.world === 'city'
      ? `${k('Space')} handbrake · ${k('ShiftLeft')} boost · ${k('KeyE')} horn · ${k('KeyF')} exit · ${k('KeyV')} camera`
      : `${k('Space')} handbrake · ${k('ShiftLeft')} boost · ${k('KeyG')} fly`
  }
}
