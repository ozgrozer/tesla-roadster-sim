// The pause menu's SETTINGS tab, GTA V's list: a row for each setting, its value between arrows
// that step through what it can be (the left and right keys do too, as does a click on the row),
// and the time of day on a slider; the row in focus lit white, and what it does said under the
// list. Up and down move from row to row. What each value is and what setting it does are the
// menu's (menu.js): the speed units, the sound and the camera as U, N and V set them, the clock,
// its speed, the weather and the graphics quality as the world's settings (world.js) take them.
import { hhmm } from './clock.js'
import { ROWS } from './settingsRows.js'
import { OPTS, setOption } from './options.js'

export class Settings {
  // box: the tab's element; get[id](), set[id](value): each setting's value, and the setting of it
  constructor (box, get, set) {
    this.get = get
    this.set = set
    this.onChange = null // (a setting has changed: the menu's header shows the time)
    this.rows = []
    const list = make('div', 'st-list')
    for (const r of ROWS)
      list.appendChild(r.head ? make('h3', 'st-head', r.head) : this.row(r))
    this.hint = make('p', 'st-hint')
    box.append(list, this.hint)
    box.addEventListener('focusin', e => {
      const r = this.rows.find(r => r.el.contains(e.target))
      if (r) this.hint.textContent = r.hint
    })
  }

  // a row: its name, and its value with the arrows either side (or the slider)
  row (r) {
    const el = make('div', 'st-row'),
      val = make('span', 'st-val'),
      out = make('output', 'st-out')
    el.append(make('span', 'st-name', r.name), val)
    const row = { ...r, el, out }
    if (r.slider) {
      const range = document.createElement('input')
      Object.assign(range, { type: 'range', min: 0, max: 24, step: 0.25 })
      range.setAttribute('aria-label', r.name)
      range.addEventListener('input', () => {
        this.set[r.id](Number(range.value))
        this.show(row)
        this.onChange?.()
      })
      val.append(range, out)
      row.range = row.focus = range
    } else {
      el.tabIndex = 0
      el.setAttribute('role', 'spinbutton')
      el.setAttribute('aria-label', r.name)
      const arrow = (step, text, label) => {
        const b = make('button', 'st-arr', text)
        b.type = 'button'
        b.tabIndex = -1
        b.setAttribute('aria-label', label)
        b.addEventListener('click', e => {
          e.stopPropagation()
          this.step(row, step)
          el.focus()
        })
        return b
      }
      val.append(arrow(-1, '‹', 'Back'), out, arrow(1, '›', 'On'))
      el.addEventListener('click', () => this.step(row, 1))
      row.focus = el
    }
    this.rows.push(row)
    return el
  }

  // the next (step 1) or the one before (-1) of what a row can be
  step (row, step) {
    if (!row.opts) return
    const now = this.value(row),
      i = row.opts.findIndex(o => o[0] === now),
      n = row.opts.length
    const v = row.opts[(i + step + n) % n][0]
    if (row.opt) setOption(row.opt, v)
    else this.set[row.id](v)
    this.show(row)
    this.onChange?.()
  }
  // a row's value now (one of the player's options, or the menu's)
  value (row) {
    return row.opt ? OPTS[row.opt] : this.get[row.id]()
  }
  // what a row says now
  show (row) {
    const v = this.value(row)
    if (row.range) {
      if (document.activeElement !== row.range) row.range.value = v
      row.out.textContent = hhmm(v)
      return
    }
    const label = row.opts.find(o => o[0] === v)?.[1] ?? String(v)
    row.out.textContent = label
    row.el.setAttribute('aria-valuetext', label)
  }
  // every row, as the menu opens
  refresh () {
    for (const r of this.rows) this.show(r)
  }
  // the first row, given the focus
  focus () {
    this.rows[0].focus.focus()
  }

  // A key on this tab: up and down from row to row ('top' off the first, for the tabs), left and
  // right (or Enter, Space) step the value; the slider takes left and right itself. True if used.
  key (e) {
    const i = this.rows.findIndex(r => r.el.contains(document.activeElement))
    if (i < 0) {
      if (e.code !== 'ArrowDown') return false
      this.focus()
      return true
    }
    const row = this.rows[i]
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const j = i + (e.code === 'ArrowUp' ? -1 : 1)
      if (j < 0) return 'top'
      this.rows[Math.min(j, this.rows.length - 1)].focus.focus()
      return true
    }
    if (row.range) return false // (its own keys)
    const step = { ArrowLeft: -1, ArrowRight: 1, Enter: 1, Space: 1 }[e.code]
    if (!step) return false
    this.step(row, step)
    return true
  }
}

// an element with a class (and its words)
function make (tag, className, text = '') {
  const el = document.createElement(tag)
  el.className = className
  el.textContent = text
  return el
}
