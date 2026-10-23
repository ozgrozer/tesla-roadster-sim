// The keyboard's bindings, and their remapping. The game listens for its own keys (input.js,
// main.js's COMMANDS, onFoot.js), so a binding is kept as a translation: the key pressed is passed on
// as the key the game knows (its default). Each action has one key; giving an action a key another
// action has swaps them, so nothing is ever left without one (or two on one key). Pure data: the
// listener that does the translating is remap.js's, the tests load this.
import { recall, remember } from './prefs.js'

// GTA V's PC keys (keymap v2). [default code, what it does, group, debug]: the keys that may be
// remapped (the arrows, Esc, P, Left Alt, Caps Lock and the mouse stay as they are: FIXED). The game
// listens for these codes (main.js COMMANDS, input.js, footFight.js), so the default is the key.
// Debug rows only work with ?debug=1 (debug.js); the Roadster's stunts only with the stunt keys
// setting on (or debug).
export const ACTIONS = [
  ['KeyW', 'Accelerate · move forward', 'On foot · in a vehicle'],
  ['KeyS', 'Brake, reverse · move back', 'On foot · in a vehicle'],
  ['KeyA', 'Steer left · move left', 'On foot · in a vehicle'],
  ['KeyD', 'Steer right · move right', 'On foot · in a vehicle'],
  ['ShiftLeft', 'Sprint · Roadster boost', 'On foot · in a vehicle'],
  ['Space', 'Jump · handbrake', 'On foot · in a vehicle'],
  ['KeyF', 'Enter, exit vehicle · steal, carjack', 'On foot · in a vehicle'],
  ['KeyE', 'Interact (doors, shops) · horn', 'On foot · in a vehicle'],
  ['KeyR', 'Melee attack · reset a wrecked car', 'On foot · in a vehicle'],
  ['KeyH', 'Headlights: auto, on, off', 'On foot · in a vehicle'],
  ['KeyV', 'Cycle camera', 'Camera · HUD'],
  ['KeyC', 'Look behind (hold)', 'Camera · HUD'],
  ['KeyZ', 'Expanded radar', 'Camera · HUD'],
  ['KeyM', 'Map (the pause menu)', 'Camera · HUD'],
  ['Period', 'Radio: next station', 'Camera · HUD'],
  ['Comma', 'Radio: previous station', 'Camera · HUD'],
  ['KeyG', 'Fly: lift thrusters (hold)', 'Roadster stunts'],
  ['KeyQ', 'Yaw left in the air (E: right)', 'Roadster stunts'],
  ['KeyX', 'Backflip (in the air)', 'Roadster stunts'],
  ['KeyK', 'Kickflip (in the air)', 'Roadster stunts'],
  ['KeyY', 'City · test site', 'Debug', true],
  ['KeyT', 'Slow motion', 'Debug', true],
  ['KeyI', 'Autopilot · manual', 'Debug', true],
  ['KeyL', 'Time of day', 'Debug', true],
  ['KeyO', 'Weather', 'Debug', true],
  ['KeyB', 'Suction fan (test site)', 'Debug', true],
  ['KeyN', 'Sound on, off', 'Debug', true],
  ['KeyU', 'Speed units', 'Debug', true]
]
// the keys that can't be remapped, as the CONTROLS card lists them
export const FIXED = [
  ['Esc · P', 'Pause menu'],
  ['Left Alt · Caps', 'Walk (toggle)'],
  ['Mouse', 'Look round (click the picture first); in a car it recentres'],
  ['Left click', 'Melee attack (press again: combo)'],
  ['Wheel', 'Camera distance on foot · radio station in a vehicle'],
  ['Arrows', 'Drive and move, as W A S D']
]
export const DEFAULT_CODES = ACTIONS.map(a => a[0])
// keys that can't be given to an action (the menu's, the arrows' second set of driving keys)
export const RESERVED = new Set([
  'Escape',
  'KeyP',
  'CapsLock',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'MetaLeft',
  'MetaRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight'
])
// the stored map's version: a map saved under another (the old non-GTA keys) is dropped
export const KEYMAP_VERSION = 2

// set when a saved map from an older version was dropped (the menu says so once)
export const MIGRATED = { from: 0 }
// action (its default code) -> the key bound to it
export const BINDS = {}
// key pressed -> the code the game hears (null: swallowed, it is no one's now)
export const TRANSLATE = new Map()

function rebuild () {
  TRANSLATE.clear()
  const bound = new Set(Object.values(BINDS))
  for (const [def, key] of Object.entries(BINDS)) {
    if (key !== def) TRANSLATE.set(key, def)
    // (a default key given away and bound to nothing: it does nothing)
    if (key !== def && !bound.has(def)) TRANSLATE.set(def, null)
  }
}
// the bindings as they were left
export function loadKeys () {
  let saved = {}
  try {
    const raw = JSON.parse(recall('keys', '{}')) || {}
    // (v1 maps were plain { action: key } over the old keys: they meant other actions, so they go)
    if (raw.v === KEYMAP_VERSION && raw.map) saved = raw.map
    else if (Object.keys(raw).length) {
      remember('keys', JSON.stringify({ v: KEYMAP_VERSION, map: {} }))
      MIGRATED.from = 1
    }
  } catch {}
  for (const c of DEFAULT_CODES) BINDS[c] = c
  const used = new Set()
  for (const c of DEFAULT_CODES) {
    const k = saved[c]
    if (typeof k === 'string' && !RESERVED.has(k) && !used.has(k)) BINDS[c] = k
  }
  // (a saved map that gives one key twice is repaired: the later one back to its default, or left)
  const seen = new Map()
  for (const c of DEFAULT_CODES) {
    const k = BINDS[c]
    if (seen.has(k)) BINDS[c] = c
    seen.set(BINDS[c], c)
  }
  rebuild()
  return BINDS
}
// action def gets key; whoever had key gets def's old one. False if the key may not be bound.
export function bind (def, key) {
  if (!(def in BINDS) || RESERVED.has(key)) return false
  const old = BINDS[def]
  for (const [d, k] of Object.entries(BINDS)) if (k === key && d !== def) BINDS[d] = old
  BINDS[def] = key
  rebuild()
  save()
  return true
}
export function resetKeys () {
  for (const c of DEFAULT_CODES) BINDS[c] = c
  rebuild()
  save()
}
function save () {
  const out = {}
  for (const [d, k] of Object.entries(BINDS)) if (d !== k) out[d] = k
  remember('keys', JSON.stringify({ v: KEYMAP_VERSION, map: out }))
}
// the code the game should hear for a key pressed: itself, another, or null (nothing)
export function translate (code) {
  return TRANSLATE.has(code) ? TRANSLATE.get(code) : code
}
// the key bound to an action, as the HUD says it: keyOf('KeyF') -> 'F' (or what it was moved to)
export function keyOf (def) {
  return keyName(BINDS[def] || def)
}
// a key's name as the card shows it: KeyW -> W, ShiftLeft -> Shift, Digit1 -> 1
export function keyName (code) {
  if (!code) return '—'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
  const names = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    AltLeft: 'Alt',
    ShiftRight: 'R Shift',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Enter: 'Enter',
    Backspace: 'Bksp',
    CapsLock: 'Caps'
  }
  return names[code] || code
}
for (const c of DEFAULT_CODES) BINDS[c] = c
