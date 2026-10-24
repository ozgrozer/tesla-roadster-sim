// The player's options, one object (OPTS) that the pause menu's SETTINGS tab changes and the game
// reads: the sound's three levels (everything, the radio, the rest), the graphics (shadows, the
// pixels to a point, how far the city is drawn), the camera (how fast the mouse turns it, the
// vertical look inverted), and accessibility (subtitles for the missions and the sounds that matter,
// larger text, a HUD palette for colour-blind players, reduced motion: less camera shake and no
// speed blur). Each is remembered between visits (prefs.js) and anyone may hear a change
// (onOption). No three.js here; the DOM only to set the body's classes, so the tests can load it.
import { recall, remember } from './prefs.js'

export const DEFAULTS = {
  master: 0.9,
  music: 0.7,
  sfx: 1,
  shadows: 'on', // 'on' | 'off'
  px: 'auto', // 'auto' (the quality's) or a number of pixels to a point
  draw: 'far', // 'near' | 'mid' | 'far': how far the city is drawn (the fog closes in nearer)
  sens: 1, // the mouse look's speed, times the default
  invert: false, // the mouse's vertical look inverted
  subtitles: true,
  bigText: false,
  palette: 'standard', // 'standard' | 'deutan' (red/green safe) | 'tritan' (blue/yellow safe)
  motion: 'full', // 'full' | 'reduced'
  stunts: true // the Roadster's stunt keys (G fly, X backflip, K kickflip: debug.js)
}
// what each may be (the menu steps through these)
export const CHOICES = {
  master: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  music: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  sfx: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  shadows: ['on', 'off'],
  px: ['auto', 0.75, 1, 1.5, 2],
  draw: ['near', 'mid', 'far'],
  sens: [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5],
  invert: [false, true],
  subtitles: [true, false],
  bigText: [false, true],
  palette: ['standard', 'deutan', 'tritan'],
  motion: ['full', 'reduced'],
  stunts: [false, true]
}
// how far each draw distance lets you see: the least fog density (scene.fog, FogExp2) it keeps
export const DRAW_FOG = { near: 0.0042, mid: 0.0024, far: 0 }

export const OPTS = { ...DEFAULTS }
const subs = new Set()

// a stored string back to its option's value (anything not one of its choices: the default)
function parse (k, s) {
  if (s === '') return DEFAULTS[k]
  const v = CHOICES[k].find(c => String(c) === s)
  return v === undefined ? DEFAULTS[k] : v
}

// every option as it was left (call once, at the start)
export function loadOptions () {
  for (const k of Object.keys(DEFAULTS)) OPTS[k] = parse(k, recall('opt.' + k))
  // (reduced motion not chosen here yet: as the phys stream's motionPref.js has it, the remembered
  // 'reducedMotion' or the browser's prefers-reduced-motion)
  if (recall('opt.motion') === '') OPTS.motion = prefersCalm() ? 'reduced' : 'full'
  applyBody()
  for (const fn of subs) fn(null, OPTS)
  return OPTS
}
// one option set (and remembered), and everyone told
export function setOption (k, v) {
  if (!(k in DEFAULTS)) return
  OPTS[k] = CHOICES[k].includes(v) ? v : DEFAULTS[k]
  remember('opt.' + k, OPTS[k])
  // (shared with render/motionPref.js, the camera's shakes: the same key it remembers)
  if (k === 'motion') remember('reducedMotion', OPTS.motion === 'reduced' ? '1' : '0')
  applyBody()
  for (const fn of subs) fn(k, OPTS)
}
// all of them back to their defaults
export function resetOptions () {
  for (const k of Object.keys(DEFAULTS)) setOption(k, DEFAULTS[k])
}
// fn(key, OPTS) on each change (key null: all of them, as they are loaded); returns an unsubscribe
export function onOption (fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// The mouse's movement as the camera should turn by it: scaled, and its vertical inverted if asked
const _look = [0, 0]
export function look (dx, dy) {
  _look[0] = dx * OPTS.sens
  _look[1] = dy * OPTS.sens * (OPTS.invert ? -1 : 1)
  return _look
}
// how much of a camera shake to keep (reduced motion: a quarter)
export const shakeScale = () => (OPTS.motion === 'reduced' ? 0.25 : 1)
// whether the speed blur and other motion effects are wanted
export const motionFx = () => OPTS.motion !== 'reduced'

function prefersCalm () {
  const r = recall('reducedMotion')
  if (r) return r === '1'
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
// the body's classes for the CSS: larger text, the palette, reduced motion
function applyBody () {
  const b = typeof document !== 'undefined' && document.body
  if (!b) return
  b.classList.toggle('big-text', OPTS.bigText)
  b.classList.toggle('pal-deutan', OPTS.palette === 'deutan')
  b.classList.toggle('pal-tritan', OPTS.palette === 'tritan')
  b.classList.toggle('calm', OPTS.motion === 'reduced')
}

// (loaded as the module is, so everything made after it reads the player's own from the start)
loadOptions()
