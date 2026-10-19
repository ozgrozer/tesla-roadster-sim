// The pause menu, GTA V's. Esc, or the menu button in the top bar (the way in on a phone), stops
// the game where it is (main.js steps nothing while it is open: the sim, the traffic and the people
// stand still, and the sound is paused) and lays the menu over the last frame drawn, dimmed and
// blurred. Its tabs: MAP (the city, the waypoint and the GPS route: map.js), SETTINGS (settings.js)
// and CONTROLS (the keys card's rows, with the menu's, the map's and a gamepad's). Q and E switch
// tabs, as do the left and right keys on the tabs themselves; Esc or Resume closes it. Nothing
// pressed while it is open reaches the game. It wires up the top bar too: each button does what
// its key does (main.js's COMMANDS), and the menu button opens this.
import { $, put } from './dom.js'
import { gps } from './gps.js'
import { COLOR } from './blips.js'
import { Clock } from './clock.js'
import { MapView } from './map.js'
import { Settings } from './settings.js'
import { worldSettings } from './world.js'
import { whereIs } from '../sim/areas.js'
import { ENV, WEATHERS } from '../sim/env.js'
import { KeyCard, installRemap } from './remap.js'
import { Stats } from './stats.js'
import { UxFrame } from './ux.js'

const TABS = ['map', 'settings', 'controls', 'stats']
// the top bar's buttons and the keys they press (the mode button: M or P, menu.bar)
const BAR = {
  btnWorld: 'KeyC',
  btnCam: 'KeyV',
  btnSlow: 'KeyT',
  btnHelp: 'KeyI',
  btnSound: 'KeyN'
}
// the keys along the bottom, GTA's: for every tab, then for each
const PROMPTS = {
  all: [
    ['Esc', 'Resume'],
    ['Q E', 'Tabs']
  ],
  map: [
    ['Click', 'Waypoint'],
    ['Drag', 'Pan'],
    ['Wheel', 'Zoom']
  ],
  settings: [
    ['↑ ↓', 'Choose'],
    ['← →', 'Change']
  ],
  controls: [['Click', 'Change a key']],
  stats: []
}
// the legend's marks, each a 16 x 16 drawing, as the map draws them (blips.js)
const icon = body => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`
const disc = fill =>
  `<circle cx="8" cy="8" r="6.2" fill="${fill}" stroke="#0a0c12" stroke-width="1.4"/>`
const YOU = '<path class="lg-you" d="M8 2l4.6 11.4L8 10.7l-4.6 2.7z"/>'
const LINE = '<path class="lg-route" d="M1 12c4-1 4-8 7-8s3 7 7 6"/>'
const FLAG = '<path d="M6.5 11.4V4.6l4.4 1.6-4.4 1.6"/>'
const JUMP = '<path d="M5 9.6L8 6.4l3 3.2"/>'
const LEGEND = [
  [icon(YOU), 'You'],
  [icon(disc(COLOR.waypoint) + FLAG), 'Waypoint'],
  [icon(LINE), 'GPS route'],
  [icon(disc(COLOR.jam) + JUMP), 'Gridlock'],
  [icon(disc('#f2f2f2')), 'Landmark'],
  ['<i class="lg-sw park"></i>', 'Park'],
  ['<i class="lg-sw sand"></i>', 'Beach']
]
const crosshair =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4"/>' +
  '<path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg>'
const MARKUP = `
<div class="mn-frame">
  <header class="mn-head">
    <div class="mn-title"><h2>Tesla Roadster Sim</h2><p class="mn-sub">Paused</p></div>
    <div class="mn-status">
      <div class="mn-now city-only"><span class="mn-clock"></span><span class="mn-wx"></span></div>
      <div class="mn-place"></div>
    </div>
    <button class="btn mn-resume" type="button" aria-label="Resume (Esc)">Resume</button>
  </header>
  <nav class="mn-tabs" role="tablist" aria-label="Pause menu">
    <button type="button" role="tab" id="mnTabMap" aria-controls="mnMap">Map</button>
    <button type="button" role="tab" id="mnTabSettings" aria-controls="mnSettings">Settings</button>
    <button type="button" role="tab" id="mnTabControls" aria-controls="mnControls">Controls</button>
    <button type="button" role="tab" id="mnTabStats" aria-controls="mnStats">Stats</button>
  </nav>
  <section class="mn-panel mn-map" id="mnMap" role="tabpanel" aria-labelledby="mnTabMap">
    <canvas tabindex="0" aria-label="Map of the city: arrows pan, plus and minus zoom,
      Enter sets a waypoint at the cross, C finds the car"></canvas>
    <div class="mp-info" aria-live="polite">
      <b>Waypoint</b><span class="mp-where"></span>
      <button class="mp-clear" type="button">Clear</button>
    </div>
    <div class="mp-hover" aria-hidden="true"></div>
    <details class="mp-legend"><summary>Legend</summary><ul>
      ${LEGEND.map(([i, t]) => `<li>${i}${t}</li>`).join('')}
    </ul></details>
    <div class="mp-zoom">
      <button type="button" data-zoom="1.5" aria-label="Zoom in">+</button>
      <button type="button" data-zoom="0.6667" aria-label="Zoom out">−</button>
      <button type="button" class="mp-find" aria-label="Find the car">${crosshair}</button>
    </div>
  </section>
  <section class="mn-panel mn-settings" id="mnSettings" role="tabpanel"
    aria-labelledby="mnTabSettings" hidden></section>
  <section class="mn-panel mn-controls" id="mnControls" role="tabpanel"
    aria-labelledby="mnTabControls" tabindex="0" hidden><div class="mn-keys"></div></section>
  <section class="mn-panel mn-stats" id="mnStats" role="tabpanel"
    aria-labelledby="mnTabStats" tabindex="0" hidden></section>
  <footer class="mn-foot" aria-hidden="true"></footer>
</div>`
// the CONTROLS tab's own column: the menu's keys, the map's and a gamepad's
const kbd = keys => keys.map(k => `<kbd>${k}</kbd>`).join('')
const row = (k, what) => `<li><span class="k">${k}</span>${what}</li>`
const list = (title, rows) => `<h3>${title}</h3><ul>${rows.join('')}</ul>`
const MORE =
  '<section>' +
  list('Pause menu', [
    row(kbd(['Esc']), 'pause · resume'),
    row(kbd(['Q', 'E']), 'tabs'),
    row(kbd(['↑', '↓']), 'settings: choose'),
    row(kbd(['←', '→']), 'settings: change')
  ]) +
  list('Map', [
    row('click', 'waypoint · again to clear'),
    row('drag · wheel', 'pan · zoom'),
    row(kbd(['Enter']), 'waypoint at the cross'),
    row(kbd(['C']), 'find the car'),
    row(kbd(['P']), 'Autopilot drives there, once resumed')
  ]) +
  '</section>'

export class Menu {
  // keys: what each key does (main.js's COMMANDS); app, hud, sound, rig: the game's; cityPilot:
  // Autopilot in the city, which drives to the waypoint; setCam(mode); world: the world's settings
  // (world.js makes them if main.js passes none)
  constructor (keys, { app, hud, sound, rig, cityPilot, setCam, world }) {
    Object.assign(this, { keys, app, hud, sound, gps }) // (gps: for the console)
    const w = (this.world = world || worldSettings(app))
    // (the remapped keys passed on as the game's own while the menu is shut: ahead of every other
    // listener, the menu's own too)
    installRemap(() => !this.open)
    this.ux = new UxFrame({ app, hud, sound })
    this.open = false
    this.tab = 'map'
    this.goalWas = null // the waypoint as the menu opened
    app.paused = false
    const root = (this.root = document.createElement('div'))
    root.className = 'menu'
    root.hidden = true
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', 'Pause menu')
    root.innerHTML = MARKUP
    document.body.appendChild(root)
    const q = s => root.querySelector(s)
    this.el = {
      tabs: [...root.querySelectorAll('[role=tab]')],
      panels: {
        map: q('#mnMap'),
        settings: q('#mnSettings'),
        controls: q('#mnControls'),
        stats: q('#mnStats')
      },
      sub: q('.mn-sub'),
      wx: q('.mn-wx'),
      place: q('.mn-place'),
      foot: q('.mn-foot')
    }
    this.clock = new Clock(q('.mn-clock'))
    this.map = new MapView(q('#mnMap'), app, () => hud.speedo.unit === 'mph')
    this.settings = new Settings(
      q('#mnSettings'),
      {
        units: () => hud.speedo.unit,
        sound: () => sound.enabled,
        cam: () => rig.mode,
        hour: w.hour,
        rate: w.rate,
        weather: w.weather,
        quality: w.quality
      },
      {
        units: u => u !== hud.speedo.unit && hud.toggleUnits(true),
        sound: on => {
          if (on !== sound.enabled) keys.KeyN()
          this.hush()
        },
        cam: setCam,
        hour: w.setHour,
        rate: w.setRate,
        weather: w.setWeather,
        quality: w.setQuality
      }
    )
    this.settings.onChange = () => this.status()
    this.keysCard(q('.mn-keys'))
    this.stats = this.ux.stats = new Stats(q('#mnStats'))
    this.el.tabs.forEach((b, i) =>
      b.addEventListener('click', () => this.select(TABS[i]))
    )
    q('.mn-resume').addEventListener('click', () => this.hide())
    // (the legend open where there is room for it)
    const small = '(max-width: 760px), (max-height: 540px)'
    q('.mp-legend').open = !window.matchMedia?.(small)?.matches
    // (how to start Autopilot: P, or on a touch screen the mode button in the top bar, Manual)
    const touch = window.matchMedia?.('(pointer: coarse)')?.matches
    this.how = touch ? 'tap <b>Manual</b>' : '<b>P</b>'
    this.bar(keys, app)
    // the GPS leads Autopilot to the waypoint, and the help box says when it is reached
    gps.onGoal = (plan, reached) => cityPilot.goTo(plan, reached)
    gps.onReach = () => hud.popup('Waypoint reached', 2600, 'hint')
    // (the menu hears every key first, before the game's own listeners)
    window.addEventListener('keydown', e => this.key(e), true)
    // (a press can turn the sound on, main.js's unlock: paused again at once while open, and the
    // settings say so)
    const hush = () =>
      this.open &&
      setTimeout(() => {
        this.hush()
        this.settings.refresh()
      })
    for (const type of ['pointerdown', 'keydown'])
      window.addEventListener(type, hush, true)
    this.canvas = $('c') // (the game's: a resize while paused blanks it, main.js redraws it)
    this.size = 0
  }

  // the top bar: each button presses its key; the menu button opens the menu
  bar (keys, app) {
    for (const [id, code] of Object.entries(BAR))
      $(id).addEventListener('click', () => keys[code]())
    $('btnMode').addEventListener('click', () =>
      keys[app.auto ? 'KeyM' : 'KeyP']()
    )
    $('btnMenu').addEventListener('click', () => this.show())
    // (a clicked button lets go of focus, or Space, the e-brake, would press it again)
    for (const b of document.querySelectorAll('.controls-top .btn'))
      b.addEventListener('click', e => e.detail && b.blur())
  }

  show (tab = this.tab) {
    if (!this.open) {
      this.open = true
      this.app.paused = true
      this.hush()
      this.goalWas = gps.goal
      this.size = this.canvas.width * 1e5 + this.canvas.height
      document.body.classList.add('paused')
      this.root.hidden = false
      this.status()
      this.settings.refresh()
    }
    this.select(tab, true)
  }
  hide () {
    if (!this.open) return
    this.open = false
    this.app.paused = false
    this.map.show(false)
    document.body.classList.remove('paused')
    this.root.hidden = true
    const a = document.activeElement
    if (this.root.contains(a)) a.blur()
    // (the sound wakes with the next frame's mix: sound.update) a new waypoint: how to get there
    const app = this.app,
      fresh = gps.goal && gps.goal !== this.goalWas
    if (fresh && app.world === 'city' && !app.auto) {
      const hint = `Waypoint set · ${this.how} and Autopilot drives there`
      this.hud.popup(hint, 3200, 'hint')
    }
  }
  // Whether the frame behind the menu has been blanked since it was drawn: true once after the
  // game's canvas changes size (a window resized, a phone turned) while the menu is open, and
  // main.js draws the frame again.
  blanked () {
    const size = this.canvas.width * 1e5 + this.canvas.height
    if (size === this.size) return false
    this.size = size
    return true
  }
  // the sound is kept paused while the menu is open
  hush () {
    const s = this.sound
    if (this.open && s.ctx && !s.paused) s.pause()
  }

  // a tab, and its button lit (focus: given the keyboard's focus too)
  select (tab, focus = false) {
    this.tab = tab
    TABS.forEach((t, i) => {
      const b = this.el.tabs[i],
        on = t === tab
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
      this.el.panels[t].hidden = !on
    })
    this.map.show(tab === 'map')
    if (tab === 'stats') this.ux.showStats(this.game, this.hud.speedo.unit === 'mph')
    if (tab === 'controls') this.card.refresh()
    const keys = [...PROMPTS.all, ...PROMPTS[tab]]
    put(
      this.el.foot,
      'html',
      keys.map(([k, t]) => `<span>${kbd(k.split(' '))}${t}</span>`).join('')
    )
    if (focus) this.el.tabs[TABS.indexOf(tab)].focus()
  }
  // the next tab (d 1) or the one before (-1)
  step (d) {
    const n = TABS.length
    this.select(TABS[(TABS.indexOf(this.tab) + d + n) % n], true)
  }
  // into the open tab, from the tabs
  enter () {
    if (this.tab === 'map') this.map.cv.focus()
    else if (this.tab === 'settings') this.settings.focus()
    else this.el.panels.controls.focus()
  }

  // the header: the time and the weather, and where the car is
  status () {
    this.clock.update()
    const app = this.app
    put(this.el.wx, 'text', WEATHERS[ENV.weather]?.name || '')
    let where = 'McGregor, Texas',
      sub = 'Test site · Paused'
    if (app.world === 'city') {
      const s = app.sim,
        p = s.mode === 'ground' ? s.pos : s.com,
        at = whereIs(p.x, p.z, {})
      where = at.street ? `${at.street} · ${at.area}` : at.area
      sub = 'Los Angeles · Paused'
    }
    put(this.el.place, 'text', where)
    put(this.el.sub, 'text', sub)
  }

  // the CONTROLS tab: the keys card's two columns (index.html), and its own third
  keysCard (box) {
    const card = document.createElement('div')
    box.appendChild(card)
    this.card = new KeyCard(card)
    box.insertAdjacentHTML('beforeend', MORE)
  }
  // each frame (main.js): the hints, captions and stats (ux.js)
  frame (dt, city) {
    this.ux.frame(dt, city, this.game)
  }

  // Every key while the menu is open is the menu's, and none reaches the game (main.js makes the
  // menu before the input, so it hears them first). Closed, Esc opens it, and goes on to the game's
  // own listeners like any key (the first key turns the sound on: main.js).
  key (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!this.open) {
      // (not while the title card is still up)
      if (e.code !== 'Escape' || e.repeat || this.hud.el.loading) return
      e.preventDefault()
      return this.show()
    }
    e.stopImmediatePropagation()
    if (this.tab === 'controls' && this.card.key(e)) return e.preventDefault()
    const c = e.code,
      onTabs = this.el.tabs.includes(document.activeElement),
      side = c === 'ArrowLeft' ? -1 : c === 'ArrowRight' ? 1 : 0
    let used = true
    if (c === 'Escape') {
      if (!e.repeat) this.hide()
    } else if (c === 'KeyQ' || c === 'KeyE') this.step(c === 'KeyQ' ? -1 : 1)
    else if ((onTabs || this.tab === 'controls') && side) this.step(side)
    else if (onTabs && c === 'ArrowDown') this.enter()
    else if (this.tab === 'map' && document.activeElement === this.map.cv)
      used = this.map.key(e)
    else if (this.tab === 'settings') {
      used = this.settings.key(e)
      if (used === 'top') this.el.tabs[1].focus()
    } else used = false
    if (used) e.preventDefault()
  }
}
