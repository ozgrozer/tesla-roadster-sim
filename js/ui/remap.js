// The key remapping, live: a listener ahead of every other (installed before the menu's and the
// game's) that passes each key pressed on as the key the game knows (keymap.js), and the CONTROLS
// tab's card of bindings: each action with its key, a click (or Enter) on one waits for the next key
// and binds it (Esc leaves it as it was), and a button puts them all back. Under it the gamepad's
// buttons, as gamepad.js maps them.
import { ACTIONS, BINDS, RESERVED, bind, keyName, loadKeys, resetKeys, translate } from './keymap.js'

const MARK = '__remapped'
// translate keys while on(): the event pressed is stopped and the game's own is sent in its place
export function installRemap (on) {
  loadKeys()
  const pass = e => {
    if (e[MARK] || !on() || e.metaKey || e.ctrlKey || e.altKey) return
    const to = translate(e.code)
    if (to === e.code) return
    e.stopImmediatePropagation()
    e.preventDefault()
    if (!to) return
    const ev = new KeyboardEvent(e.type, {
      code: to,
      key: e.key,
      repeat: e.repeat,
      bubbles: true,
      cancelable: true
    })
    ev[MARK] = true
    ;(e.target || window).dispatchEvent(ev)
  }
  window.addEventListener('keydown', pass, true)
  window.addEventListener('keyup', pass, true)
}

// the gamepad's buttons, as gamepad.js presses them
const PAD = [
  ['RT · LT', 'Throttle · brake, reverse'],
  ['Left stick', 'Steer · walk · pitch and roll'],
  ['Right stick', 'Look round · yaw'],
  ['R3 (stick in)', 'Look behind (hold)'],
  ['A', 'Handbrake · jump'],
  ['B', 'Camera'],
  ['X', 'Horn'],
  ['Y', 'Get in, out · steal'],
  ['RB · LB', 'Boost, run · fly'],
  ['D-pad ↑ ↓', 'Backflip · kickflip'],
  ['View · Menu', 'Reset · Autopilot']
]

export class KeyCard {
  constructor (box) {
    this.box = box
    this.waiting = null // the action waiting for its key
    box.classList.add('rk')
    const groups = new Map()
    for (const [code, what, group] of ACTIONS) {
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push([code, what])
    }
    let html = '<section class="rk-keys"><h3>Keyboard <small>click a key to change it</small></h3>'
    for (const [g, rows] of groups) {
      html += `<h4>${g}</h4><ul>`
      for (const [code, what] of rows)
        html += `<li><button type="button" class="rk-key" data-code="${code}"></button>${what}</li>`
      html += '</ul>'
    }
    html += '<p class="rk-foot"><button type="button" class="btn rk-reset">Reset to defaults</button>' +
      '<span class="rk-note" aria-live="polite"></span></p></section>'
    html += '<section class="rk-pad"><h3>Gamepad</h3><ul>' +
      PAD.map(([b, what]) => `<li><span class="k"><kbd>${b}</kbd></span>${what}</li>`).join('') +
      '</ul><p class="rk-hint">Arrow keys always drive too · Esc pauses</p></section>'
    box.innerHTML = html
    this.buttons = [...box.querySelectorAll('.rk-key')]
    this.note = box.querySelector('.rk-note')
    for (const b of this.buttons) b.addEventListener('click', () => this.wait(b.dataset.code))
    box.querySelector('.rk-reset').addEventListener('click', () => {
      resetKeys()
      this.say('Keys back to their defaults')
      this.refresh()
    })
    this.refresh()
  }
  refresh () {
    for (const b of this.buttons) {
      const c = b.dataset.code
      b.textContent = this.waiting === c ? 'press a key…' : keyName(BINDS[c])
      b.classList.toggle('waiting', this.waiting === c)
      b.classList.toggle('moved', BINDS[c] !== c)
    }
  }
  say (t) {
    this.note.textContent = t
  }
  wait (code) {
    this.waiting = code
    this.say('')
    this.refresh()
  }
  // a key while the card is waiting for one (the menu hands it over): true if taken
  key (e) {
    if (!this.waiting) return false
    if (e.repeat) return true
    const def = this.waiting
    this.waiting = null
    if (e.code === 'Escape') this.say('Unchanged')
    else if (RESERVED.has(e.code)) this.say(`${keyName(e.code)} can't be bound`)
    else {
      const was = Object.entries(BINDS).find(([d, k]) => k === e.code && d !== def)
      bind(def, e.code)
      const what = ACTIONS.find(a => a[0] === def)[1]
      this.say(`${what}: ${keyName(e.code)}` + (was ? ` · swapped with ${ACTIONS.find(a => a[0] === was[0])[1]}` : ''))
    }
    this.refresh()
    this.buttons.find(b => b.dataset.code === def)?.focus()
    return true
  }
}
