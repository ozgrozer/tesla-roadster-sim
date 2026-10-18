// HUD: telemetry strip, thruster schematic, captions, countdown, popups, top-bar buttons and the hint line.
import { CAR } from '../sim/constants.js'

const $ = id => document.getElementById(id)
const SVG_NS = 'http://www.w3.org/2000/svg'
// Write a node's text, markup, class, style or attribute only when it changes: even an unchanged
// write costs the browser a style and layout pass, and the HUD has a couple of dozen of them.
const last = new WeakMap()
function put (node, what, value) {
  let was = last.get(node)
  if (!was) last.set(node, (was = {}))
  if (was[what] === value) return
  was[what] = value
  if (what === 'text') node.textContent = value
  else if (what === 'html') node.innerHTML = value
  else if (what === 'class') node.className = value
  else if (what[0] === '@') node.setAttribute(what.slice(1), value)
  else node.style[what] = value
}
const FAN_TEXT = {
  auto: 'Suction fan <b>auto</b> · spins up for the wall',
  on: 'Suction fan <b>on</b> · 2.1 G of grip',
  off: 'Suction fan <b>off</b>'
}

export class Hud {
  constructor (RS) {
    this.RS = RS
    this.clock = 0
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
      popups: $('popups'),
      score: $('score'),
      hint: $('hint'),
      speed: $('tSpeed'),
      tag: $('tTag'),
      pitch: $('tPitch'),
      g: $('tG'),
      alt: $('tAlt'),
      pow: $('tPow'),
      suck: $('tSuck'),
      air: $('tAir'),
      airBar: $('tAirBar'),
      z60: $('t060'),
      thrTotal: $('thrTotal'),
      thrAir: $('thrAir'),
      dots: $('thrDots'),
      loading: $('loading'),
      world: $('btnWorld'),
      worldLabel: $('worldLabel'),
      brandSub: $('brandSub'),
      fade: $('fade')
    }
    this.world = 'site'
    this.siteSub = this.el.brandSub.textContent
    this.dots = RS.nozzles.map(nz => this.makeDot(nz))
  }

  // thruster schematic, top-down with the nose at the top
  makeDot (nz) {
    let x = 60,
      y = 86
    if (nz.kind === 'main') {
      x = 60 + nz.local.z * 56
      y = 141
    } else if (nz.kind === 'lift') {
      x = nz.local.z < 0 ? 34 : 86
      y = nz.local.x > 0 ? 24 : 122
    } else x = nz.kind === 'sideL' ? 23 : 97
    const c = document.createElementNS(SVG_NS, 'circle')
    c.setAttribute('cx', x)
    c.setAttribute('cy', y)
    c.setAttribute('r', nz.kind.startsWith('side') ? 4 : 5)
    c.setAttribute('fill', '#bfe9ff')
    c.setAttribute('fill-opacity', '0')
    c.setAttribute('stroke', '#d6a84e')
    c.setAttribute('stroke-width', '1.2')
    this.el.dots.appendChild(c)
    return c
  }

  // kind 'hint' for how to do something: smaller than a score or a crash
  popup (html, ms = 2300, kind = '') {
    const d = document.createElement('div')
    d.className = kind ? `popup ${kind}` : 'popup'
    d.innerHTML = html
    this.el.popups.appendChild(d)
    while (this.el.popups.children.length > 4)
      this.el.popups.firstChild.remove()
    setTimeout(() => d.remove(), ms)
  }
  fanPopup (mode) {
    this.popup(FAN_TEXT[mode], 1600, 'hint')
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
      ? 'Free roam · downtown grid · live traffic and signals'
      : this.siteSub
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
  toggleHelp () {
    const show = this.el.help.hidden
    this.el.help.hidden = !show
    this.el.helpBtn.setAttribute('aria-pressed', String(show))
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
    const { sim, ap } = app,
      el = this.el
    this.RS.nozzles.forEach((nz, i) =>
      put(this.dots[i], '@fill-opacity', nz.level.toFixed(2))
    )
    this.clock += dt
    if (this.clock < 0.07) return
    this.clock = 0
    put(el.speed, 'text', String(Math.round(sim.groundSpeed() * 3.6)))
    put(el.pitch, 'text', `${Math.round(sim.pitchDeg())}°`)
    put(el.g, 'html', `${sim.gLoad.toFixed(2)}<small>G</small>`)
    const alt =
      sim.mode === 'air' || sim.mode === 'crash'
        ? Math.max(0, sim.com.y - CAR.comH)
        : sim.pos.y
    put(el.alt, 'html', `${alt.toFixed(1)}<small>m</small>`)
    if (sim.suction > 0.05) {
      put(el.suck, 'text', `${(sim.suction * CAR.suctionG).toFixed(1)} G`)
      put(el.suck, 'class', 'v status-on')
    } else {
      put(el.suck, 'text', !app.auto && app.fanMode === 'auto' ? 'AUTO' : 'OFF')
      put(el.suck, 'class', 'v')
    }
    const kw = Math.round(sim.drivePower / 1000)
    put(el.pow, 'html', `${kw > 0 ? '+' : ''}${kw}<small>kW</small>`)
    put(el.pow, 'class', kw < 0 ? 'v status-on' : 'v')
    const tag = sim.ebrakeOn
      ? 'E-BRAKE'
      : sim.escActive
      ? 'ESC'
      : sim.abs > 0.5 && sim.groundSpeed() > 1
      ? 'ABS'
      : sim.regenOn && sim.groundSpeed() > 1
      ? 'REGEN'
      : ''
    if (el.tag.textContent !== tag) {
      el.tag.textContent = tag
      el.tag.className =
        tag === 'ESC' || tag === 'ABS'
          ? 'tag esc'
          : tag === 'REGEN'
          ? 'tag status-on'
          : 'tag'
    }
    put(el.air, 'html', `${Math.round(sim.air)}<small>kg</small>`)
    put(el.airBar, 'transform', `scaleX(${(sim.air / CAR.airMass).toFixed(3)})`)
    put(el.airBar, 'background', sim.air < 50 ? 'var(--warn)' : 'var(--jet)')
    put(
      el.thrAir,
      'text',
      `${Math.round(sim.air)} kg air · ${Math.round(
        (380 * sim.air) / CAR.airMass
      )} bar`
    )
    if (sim.z60.last)
      put(el.z60, 'html', `${sim.z60.last.toFixed(2)}<small>s</small>`)
    put(
      el.thrTotal,
      'text',
      `${Math.round(
        (sim.thrMain * CAR.mainThrust +
          sim.thrLift * CAR.liftThrust +
          sim.thrSide * CAR.sideThrust) /
          1000
      )} kN`
    )
    put(el.score, 'text', app.score.toLocaleString('en-US'))
    if (app.auto) {
      const [e, t, s] = ap.cap
      this.setText(el.capE, e)
      this.setText(el.capT, t)
      this.setText(el.capS, s)
      const cd = ap.countdown
      put(el.countdown, 'opacity', cd === null ? '0' : '1')
      if (cd !== null) put(el.countdown, 'text', cd === 0 ? 'GO' : String(cd))
      const what =
        this.world === 'city' ? 'Autopilot on' : 'Autopilot demo running'
      this.setText(
        el.hint,
        app.soundOn
          ? `${what} · press any drive key to take over`
          : `${what} · click or press N for sound · any drive key takes over`
      )
    } else {
      put(el.countdown, 'opacity', '0')
      this.setText(
        el.hint,
        app.intro
          ? 'Optimus is getting in · any drive key skips'
          : this.world === 'city' && sim.mode === 'ground'
          ? 'W throttle · S brake · A/D steer · Space e-brake · Shift boost · F fly · H horn · C test site'
          : sim.mode === 'air'
          ? 'W/S pitch · A/D roll · Q/E yaw · F lift · Shift boost · X backflip · K kickflip'
          : sim.mode === 'ramp'
          ? 'W climb · S brake, then reverse down · Space hold · Shift main burn off the lip'
          : sim.mode === 'crash'
          ? sim.up().y > 0.95
            ? 'Crashed · W to drive on · R to reset · P to watch the autopilot'
            : 'Upside down · A/D to roll it back over · R to reset'
          : 'W throttle · release to coast · S brake · Space e-brake · A/D steer · Shift boost · F fly'
      )
    }
  }
}
