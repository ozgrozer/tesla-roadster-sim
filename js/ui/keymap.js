// The keyboard's bindings, and their remapping. The game listens for its own keys (input.js,
// main.js's COMMANDS, onFoot.js), so a binding is kept as a translation: the key pressed is passed on
// as the key the game knows (its default). Each action has one key; giving an action a key another
// action has swaps them, so nothing is ever left without one (or two on one key). Pure data: the
// listener that does the translating is remap.js's, the tests load this.
import { recall, remember } from './prefs.js'

// [default code, what it does, group]: the keys that may be remapped (the arrows, Esc and the
// number keys stay as they are)
export const ACTIONS = [
  ['KeyW', 'Throttle · walk forward', 'Drive · on foot'],
  ['KeyS', 'Brake, reverse · walk back', 'Drive · on foot'],
  ['KeyA', 'Steer left · walk left', 'Drive · on foot'],
  ['KeyD', 'Steer right · walk right', 'Drive · on foot'],
  ['Space', 'Handbrake · jump', 'Drive · on foot'],
  ['ShiftLeft', 'Boost · run', 'Drive · on foot'],
  ['KeyE', 'Get in, out · steal', 'Drive · on foot'],
  ['KeyF', 'Fly (lift thrusters)', 'Drive'],
  ['KeyH', 'Horn', 'Drive'],
  ['KeyZ', 'Look behind', 'Drive'],
  ['KeyQ', 'Yaw left (flying)', 'Fly'],
  ['KeyX', 'Backflip', 'Fly'],
  ['KeyK', 'Kickflip', 'Fly'],
  ['KeyV', 'Camera', 'Game'],
  ['KeyB', 'Radio station', 'Game'],
  ['KeyP', 'Autopilot', 'Game'],
  ['KeyR', 'Reset', 'Game'],
  ['KeyL', 'Time of day', 'Game'],
  ['KeyO', 'Weather', 'Game'],
  ['KeyT', 'Slow motion', 'Game'],
  ['KeyN', 'Sound on, off', 'Game'],
  ['KeyU', 'Speed units', 'Game'],
  ['KeyC', 'City · test site', 'Game'],
  ['KeyM', 'Manual', 'Game'],
  ['KeyI', 'Keys card', 'Game']
]
export const DEFAULT_CODES = ACTIONS.map(a => a[0])
// keys that can't be given to an action (the menu's, the arrows' second set of driving keys)
export const RESERVED = new Set([
  'Escape',
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
    saved = JSON.parse(recall('keys', '{}')) || {}
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
  remember('keys', JSON.stringify(out))
}
// the code the game should hear for a key pressed: itself, another, or null (nothing)
export function translate (code) {
  return TRANSLATE.has(code) ? TRANSLATE.get(code) : code
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
