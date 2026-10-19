// The HUD, in the spirit of GTA V: a clean screen while driving (the title and the buttons fade away
// until the mouse moves or a key that isn't a drive key is pressed), the radar bottom left with the
// car's condition and its air under it (minimap.js) and the clock over it (clock.js), the
// speedometer over where you are bottom right (speedo.js, place.js), the engineering instruments
// only when they matter (instruments.js), stunt titles, the help box and the score (notify.js), the
// keys card, and the test site's captions and countdown.
import { $, put } from './dom.js'
import { Clock } from './clock.js'
import { Place } from './place.js'
import { Speedo } from './speedo.js'
import { DRIVE_KEYS, LOOK_BACK } from './input.js'
import { CAR } from '../sim/constants.js'
import { recall, remember } from './prefs.js'
import { Instruments } from './instruments.js'
import { Notices, HelpBox, Score } from './notify.js'

const FAN_TEXT = {
  auto: 'Suction fan: auto · it spins up for the wall · <b>G</b> to change',
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
  'KeyG',
  'KeyX',
  'KeyK',
  'KeyB'
])
const LINE_S = 7 // s the line of keys along the bottom stays up after it changes
const DENTED = 1 // m of dents (damage.js's amount) that take the condition bar down to nothing

export class Hud {
  // RS: the Roadster (its nozzles light the schematic); damage: its dents (the condition bar)
  constructor (RS, damage) {
    this.damage = damage
    this.clock = 0
    this.acc = 0
    this.el = {
      mode: $('btnMode'),
      modeLabel: $('modeLabel'),
      cam: $('camLabel'),
      camBtn: $('btnCam'),
      slow: $('btnSlow'),
      sound: $('btnSound'),
      helpBtn: $('btnHelp'),
      help: $('help'),
      cap: $('caption'),
      capE: $('capEyebrow'),
      capT: $('capTitle'),
      capS: $('capSub'),
      countdown: $('countdown'),
      hint: $('hint'),
      loading: $('loading'),
      world: $('btnWorld'),
      worldLabel: $('worldLabel'),
      brandSub: $('brandSub'),
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
    this.siteSub = this.el.brandSub.textContent
    this.instruments = new Instruments(RS)
    this.speedo = new Speedo()
    this.speedo.onToggle = unit =>
      this.helpbox.push(`Speed in ${unit} · <b>U</b> to switch`, 1800, 'units')
    this.place = new Place()
    this.daytime = new Clock($('clock'))
    this.notices = new Notices($('notices'))
    this.helpbox = new HelpBox($('helpbox'), $('helpText'))
    this.score = new Score($('scoreBox'), $('score'))
    this.line = '' // the line of keys along the bottom, how long it has been up, whether it is
    this.lineT = 0 // new, and the lines already shown in this world (each once: a clean screen)
    this.fresh = false
    this.lines = new Set()
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
    // the keys card: on the first visit only, afterwards a hint (there are no keys on a phone),
    // given on the first update (the world set up at boot clears the help box)
    const touch = !!window.matchMedia?.('(pointer: coarse)')?.matches
    this.keysHint = false
    if (recall('keysSeen') === '1' || touch) {
      this.showHelp(false)
      this.keysHint = !touch
    } else remember('keysSeen', '1')
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
      return this.helpbox.push('The sound is off · <b>N</b> to turn it on', 1800)
    put(this.el.radioFreq, 'text', st ? `${st.freq} FM` : '')
    put(this.el.radioName, 'text', st ? st.name : 'Radio off')
    this.radioLeft = 2.6
  }
  // U: km/h or mph (quiet: no hint, as from the pause menu)
  toggleUnits (quiet = false) {
    this.speedo.toggle(quiet)
  }

  setMode (auto) {
    this.el.mode.classList.toggle('manual', !auto)
    this.el.modeLabel.textContent = auto ? 'Autopilot' : 'Manual'
    this.el.cap.style.opacity = auto ? 1 : 0
  }
  setWorld (w) {
    this.world = w
    const city = w === 'city'
    document.body.classList.toggle('in-city', city)
    this.el.worldLabel.textContent = city ? 'Test site' : 'City'
    this.el.world.setAttribute(
      'aria-label',
      city ? 'Back to the test site' : 'Drive in the city'
    )
    this.el.brandSub.textContent = city
      ? 'Los Angeles · free roam · live traffic and signals'
      : this.siteSub
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
  setCam (name) {
    this.el.cam.textContent = name
  }
  setSlow (on) {
    this.el.slow.setAttribute('aria-pressed', String(on))
  }
  setSound (on) {
    this.el.sound.textContent = on ? 'Sound: on' : 'Sound: off'
    this.el.sound.setAttribute('aria-pressed', String(on))
  }
  showHelp (show) {
    this.el.help.hidden = !show
    this.el.helpBtn.setAttribute('aria-pressed', String(show))
  }
  toggleHelp () {
    this.showHelp(this.el.help.hidden)
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
        'Press <b>Esc</b> for the map and settings, <b>I</b> for the keys',
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

  // the keys for what the car is doing, along the bottom: for good while Autopilot drives, Optimus
  // gets in or the car is wrecked, otherwise for a few seconds the first time each comes up
  keysLine (dt, app) {
    const text = this.lineFor(app)
    if (text !== this.line) {
      this.line = text
      this.lineT = 0
      this.fresh = !this.lines.has(text)
      this.lines.add(text)
    } else this.lineT += dt
    const sticky = app.auto || app.intro || app.sim.mode === 'crash'
    put(this.el.hint, 'text', text)
    put(
      this.el.hint,
      '.on',
      !!text && (sticky || (this.fresh && this.lineT < LINE_S))
    )
  }
  lineFor (app) {
    const { sim } = app
    if (app.auto) {
      const what = this.world === 'city' ? 'Autopilot on' : 'Autopilot demo'
      return app.soundOn
        ? `${what} · press any drive key to take over`
        : `${what} · click or press N for sound · any drive key takes over`
    }
    if (app.intro) return 'Optimus is getting in · any drive key skips'
    // (on foot, and in a car that isn't the Roadster: onFoot.js)
    if (app.foot)
      return 'W A S D walk · Shift run · Space jump · mouse look (click) · E get in a car'
    if (app.vehicle && app.vehicle.kind !== 'roadster' && sim.mode !== 'crash')
      return 'W throttle · S brake · A/D steer · Space handbrake · H horn · E get out'
    if (sim.mode === 'crash')
      return sim.up().y > 0.95
        ? 'Crashed · W to drive on · R to reset · P to watch the autopilot'
        : 'Upside down · A/D to roll it back over · R to reset'
    if (sim.mode === 'air')
      return 'W/S pitch · A/D roll · Q/E yaw · F lift · Shift boost · X backflip · K kickflip'
    if (sim.mode === 'ramp')
      return 'W climb · S brake, then reverse down · Space hold · Shift main burn off the lip'
    return this.world === 'city'
      ? 'W throttle · S brake · A/D steer · Space e-brake · Shift boost · F fly · E get out'
      : 'W throttle · release to coast · S brake · Space e-brake · A/D steer · Shift boost · F fly'
  }
}
