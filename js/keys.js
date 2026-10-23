// What each key does (GTA V's PC keys: ui/keymap.js), the commands main.js's input hands on: one
// press each (the held keys, driving and walking, are input.js's). Keys a player has no use for
// work only with ?debug=1 (ui/debug.js), the Roadster's stunts only with the stunt keys setting on.
// g: the game's pieces and main.js's own functions (foot and menu are made after the input, so
// they are read as the keys are pressed).
import { DEBUG, stuntKeys } from './ui/debug.js'
import { player } from './sim/player.js'

const LAMPS = ['auto', 'on', 'off']
const LAMP_TEXT = { auto: 'Headlights: auto', on: 'Headlights: on', off: 'Headlights: off' }

export function gtaCommands (g) {
  const { app, hud, sound, climate } = g
  const debug = f => () => (DEBUG.on ? f() : undefined)
  const stunt = f => () => {
    if (stuntKeys()) return f()
    if (!player || player.mode !== 'car') return
    hud.popup('Stunt keys are off · turn them on in Settings (Esc)', 1800, 'hint')
  }
  const radio = d => hud.radio(sound.tuneRadio(d))
  return {
    // R: in a car, only a wreck (or the car on its roof) is put back on the road; on foot it is
    // the melee's (footFight.js), on the test site the demo's reset
    KeyR: () => {
      if (app.world !== 'city') return app.auto ? g.startDemo() : g.resetTo(app.lastSpot)
      if (player.mode !== 'car') return
      const s = g.foot().driven?.() || app.sim
      if (s.mode === 'crash' || DEBUG.on || s.dmg?.wreck) g.respawn()
    },
    KeyV: () => g.polish().cycleCam(g.setCam), // (in a car or on foot: polish.js)
    KeyH: () => {
      const i = (LAMPS.indexOf(app.lamps || 'auto') + 1) % LAMPS.length
      app.lamps = LAMPS[i]
      hud.popup(LAMP_TEXT[app.lamps], 1400, 'hint')
    },
    KeyZ: () => g.minimap.toggleBig(),
    Period: () => radio(1),
    Comma: () => radio(-1),
    PadStart: () => (g.menu().open ? g.menu().hide() : g.menu().show()),
    KeyX: stunt(() => g.tryFlip('z')),
    KeyK: stunt(() => g.tryFlip('x')),
    // ---- ?debug=1 ----
    KeyY: debug(g.toggleWorld),
    KeyT: debug(g.toggleSlow),
    KeyI: debug(() => (app.auto ? g.setAuto(false) : g.startAutopilot())),
    KeyL: debug(() => climate.skipTime()),
    KeyO: debug(() => climate.nextWeather()),
    KeyN: debug(g.toggleSound),
    KeyU: debug(() => hud.toggleUnits()),
    KeyB: debug(g.cycleFan),
    Digit1: debug(() => g.resetTo('start')),
    Digit2: debug(() => {
      g.resetTo('top')
      hud.popup('Hanging at 170° · hold <b>Shift</b> to fire the main thrusters', 2300, 'hint')
    }),
    Digit3: debug(() => {
      g.resetTo('lineup')
      hud.popup('Build speed, then <b>G</b> to lift and <b>K</b> to kickflip', 2300, 'hint')
    })
  }
}
// In a vehicle the mouse wheel tunes the radio, as GTA V's on a PC (on foot it is the camera's
// distance: onFoot.js)
export function wheelRadio (canvas, inCar, tune) {
  let last = 0
  canvas.addEventListener(
    'wheel',
    e => {
      if (!inCar() || !document.pointerLockElement) return
      const now = performance.now()
      if (now - last < 250 || !e.deltaY) return
      last = now
      tune(e.deltaY > 0 ? 1 : -1)
    },
    { passive: true }
  )
}
