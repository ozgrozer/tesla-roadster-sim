// HUD: telemetry strip, thruster schematic, captions, countdown, popups, top-bar buttons and the hint line.
import { CAR } from '../sim/constants.js'

const $ = id => document.getElementById(id)
const SVG_NS = 'http://www.w3.org/2000/svg'
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

  popup (html, ms = 2300) {
    const d = document.createElement('div')
    d.className = 'popup'
    d.innerHTML = html
    this.el.popups.appendChild(d)
    while (this.el.popups.children.length > 4)
      this.el.popups.firstChild.remove()
    setTimeout(() => d.remove(), ms)
  }
  fanPopup (mode) {
    this.popup(FAN_TEXT[mode], 1600)
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
    if (node.textContent !== text) node.textContent = text
  }

  update (dt, app) {
    const { sim, ap } = app,
      el = this.el
    this.RS.nozzles.forEach((nz, i) =>
      this.dots[i].setAttribute('fill-opacity', nz.level.toFixed(2))
    )
    this.clock += dt
    if (this.clock < 0.07) return
    this.clock = 0
    el.speed.textContent = Math.round(sim.groundSpeed() * 3.6)
    el.pitch.textContent = `${Math.round(sim.pitchDeg())}°`
    el.g.innerHTML = `${sim.gLoad.toFixed(2)}<small>G</small>`
    const alt =
      sim.mode === 'air' || sim.mode === 'crash'
        ? Math.max(0, sim.com.y - CAR.comH)
        : sim.pos.y
    el.alt.innerHTML = `${alt.toFixed(1)}<small>m</small>`
    if (sim.suction > 0.05) {
      el.suck.textContent = `${(sim.suction * CAR.suctionG).toFixed(1)} G`
      el.suck.className = 'v status-on'
    } else {
      el.suck.textContent = !app.auto && app.fanMode === 'auto' ? 'AUTO' : 'OFF'
      el.suck.className = 'v'
    }
    const kw = Math.round(sim.drivePower / 1000)
    el.pow.innerHTML = `${kw > 0 ? '+' : ''}${kw}<small>kW</small>`
    el.pow.className = kw < 0 ? 'v status-on' : 'v'
    const tag = sim.ebrakeOn
      ? 'E-BRAKE'
      : sim.escActive
      ? 'ESC'
      : sim.regenOn && sim.groundSpeed() > 1
      ? 'REGEN'
      : ''
    if (el.tag.textContent !== tag) {
      el.tag.textContent = tag
      el.tag.className =
        tag === 'ESC' ? 'tag esc' : tag === 'REGEN' ? 'tag status-on' : 'tag'
    }
    el.air.innerHTML = `${Math.round(sim.air)}<small>kg</small>`
    el.airBar.style.transform = `scaleX(${(sim.air / CAR.airMass).toFixed(3)})`
    el.airBar.style.background = sim.air < 50 ? 'var(--warn)' : 'var(--jet)'
    el.thrAir.textContent = `${Math.round(sim.air)} kg air · ${Math.round(
      (380 * sim.air) / CAR.airMass
    )} bar`
    if (sim.z60.last)
      el.z60.innerHTML = `${sim.z60.last.toFixed(2)}<small>s</small>`
    el.thrTotal.textContent = `${Math.round(
      (sim.thrMain * CAR.mainThrust +
        sim.thrLift * CAR.liftThrust +
        sim.thrSide * CAR.sideThrust) /
        1000
    )} kN`
    el.score.textContent = app.score.toLocaleString('en-US')
    if (app.auto) {
      const [e, t, s] = ap.cap
      this.setText(el.capE, e)
      this.setText(el.capT, t)
      this.setText(el.capS, s)
      const cd = ap.countdown
      el.countdown.style.opacity = cd === null ? 0 : 1
      if (cd !== null) el.countdown.textContent = cd === 0 ? 'GO' : String(cd)
      this.setText(
        el.hint,
        app.soundOn
          ? 'Autopilot demo running · press any drive key to take over'
          : 'Autopilot demo running · click or press N for sound · any drive key takes over'
      )
    } else {
      el.countdown.style.opacity = 0
      this.setText(
        el.hint,
        this.world === 'city' && sim.mode === 'ground'
          ? 'W throttle · S brake · A/D steer · B e-brake · Shift boost · Space lift off · C test site'
          : sim.mode === 'air'
          ? 'W/S pitch · A/D roll · Q/E yaw · Space lift · Shift boost · X backflip · K kickflip'
          : sim.mode === 'ramp'
          ? 'W climb · S brake, then reverse down · B hold · Shift main burn off the lip'
          : sim.mode === 'crash'
          ? 'Crashed · R to reset · P to watch the autopilot'
          : 'W throttle · release to coast · S brake · B e-brake · A/D steer · Shift boost · Space lift off'
      )
    }
  }
}
