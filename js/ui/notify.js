// What the game tells the player, GTA-style: stunt titles that punch in mid-screen and fade (the same
// stunt again soon after counts on: NEAR MISS ×3), hints in a help box top left that wait their
// turn, and the score top right in GTA's money style, the last gain under it.
import { put } from './dom.js'

const UP_S = 2.4 // s a stunt title stays up
const CHAIN_S = 3.5 // s after the last one in which the same stunt again counts on
const GAP_S = 0.3 // s between one hint and the next
const MIN_S = 2.2 // s a hint stays up at least, when others are waiting their turn
const STALE_S = 9 // s a hint may wait before it is no longer worth showing
const SCORE_S = 5 // s the score stays up after it changes

export class Notices {
  constructor (box) {
    this.box = box
    this.cur = null // the title up now: { key, el, timer }
    // the run of one stunt counting on (it outlives its title: a near miss 3 s after the last
    // still counts on, though the title had gone)
    this.run = { key: '', at: -1e9, count: 0, pts: 0 }
    // (no punch for a stunt counting on, for a player who would rather the screen kept still)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    this.still = !!still?.matches
  }

  // n: { title, sub, pts, big (shown in place of the points), tone ('red', 'blue', 'plain'),
  // key (what kind of stunt), n (its count, where the sim keeps one), chain (the same key again
  // within CHAIN_S counts on and adds its points), html (the title is markup), ms }
  show (n) {
    const now = performance.now(),
      run = this.run
    let count = n.n || 1,
      pts = n.pts || 0
    if (n.chain) {
      if (run.key === n.key && now - run.at < CHAIN_S * 1000) {
        count = run.count + 1
        pts += run.pts
      }
      Object.assign(run, { key: n.key, at: now, count, pts })
    }
    const c = this.cur
    // (the same run still up: count on in place, with a punch)
    if (c && n.chain && c.key === n.key) {
      this.fill(c.el, n, count, pts)
      if (!this.still)
        c.el.animate?.([{ transform: 'scale(1.18)' }, { transform: 'none' }], {
          duration: 300,
          easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)'
        })
      this.hold(c, n.ms)
      return
    }
    if (c) this.retire(c)
    const el = document.createElement('div')
    el.className = n.tone ? `notice ${n.tone}` : 'notice'
    el.innerHTML =
      '<div class="n-title"></div><div class="n-pts"></div><div class="n-sub"></div>'
    this.fill(el, n, count, pts)
    this.box.appendChild(el)
    this.cur = { key: n.key || '', el, timer: 0 }
    this.hold(this.cur, n.ms)
  }

  // the title (×count after it from the second), the points or the big figure, the line under
  fill (el, n, count, pts) {
    const [title, points, sub] = el.children
    if (n.html) title.innerHTML = n.title
    else title.textContent = n.title
    if (count > 1) {
      const x = document.createElement('span')
      x.className = 'x'
      x.textContent = `×${count}`
      title.appendChild(x)
    }
    points.textContent = n.big || (pts ? `+${pts.toLocaleString('en-US')}` : '')
    sub.textContent = n.sub || ''
  }

  hold (c, ms = UP_S * 1000) {
    clearTimeout(c.timer)
    c.timer = setTimeout(() => this.retire(c), ms)
  }

  retire (c) {
    clearTimeout(c.timer)
    if (this.cur === c) this.cur = null
    c.el.classList.add('out')
    setTimeout(() => c.el.remove(), 420)
  }
}

export class HelpBox {
  constructor (box, text) {
    this.box = box
    this.text = text
    this.queue = []
    this.cur = null
    this.gap = 0
    this.t = 0
  }

  // html: the hint, with the keys in <b>; ms: how long it stays up once its turn comes; slot: hints
  // about the same thing (the fan, the units) replace one another rather than queue
  push (html, ms = 3000, slot = '') {
    const same = h => h.html === html || (slot && h.slot === slot)
    const h = { html, slot, left: ms / 1000, up: 0, born: this.t }
    if (this.cur && same(this.cur)) {
      this.cur = h
      put(this.text, 'html', html)
      return
    }
    const i = this.queue.findIndex(same)
    if (i >= 0) this.queue[i] = h
    else this.queue.push(h)
    if (this.queue.length > 4) this.queue.shift()
  }

  // the hints in slot no longer apply (the car's, once the player is out of it)
  drop (slot) {
    if (this.cur && this.cur.slot === slot) this.cur.left = 0
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].slot === slot) this.queue.splice(i, 1)
  }

  // a new world: the hints still waiting were about the old one
  clear () {
    this.queue.length = 0
    if (this.cur) this.cur.left = 0
  }

  update (dt) {
    this.t += dt
    const c = this.cur
    if (c) {
      c.up += dt
      c.left -= dt
      // (its turn is shorter when others are waiting)
      if (c.left > 0 && !(this.queue.length && c.up > MIN_S)) return
      this.cur = null
      put(this.box, '.on', false)
      this.gap = GAP_S
      return
    }
    if (this.gap > 0) {
      this.gap -= dt
      return
    }
    while (this.queue.length && this.t - this.queue[0].born > STALE_S)
      this.queue.shift()
    const next = this.queue.shift()
    if (!next) return
    this.cur = next
    put(this.text, 'html', next.html)
    put(this.box, '.on', true)
  }
}

export class Score {
  constructor (box, value) {
    this.box = box
    this.value = value
    this.was = 0
    this.up = 0
    this.gain = null
  }

  // awake: the top bar is up, so the score is too
  update (dt, score, awake) {
    if (score !== this.was) {
      if (score > this.was) this.added(score - this.was)
      this.was = score
      put(this.value, 'text', score.toLocaleString('en-US'))
    }
    this.up -= dt
    put(this.box, '.on', score > 0 && (this.up > 0 || awake))
  }

  // the gain, under the score, fading out
  added (pts) {
    this.up = SCORE_S
    this.gain?.remove()
    const d = document.createElement('span')
    d.className = 'd'
    d.textContent = `+${pts.toLocaleString('en-US')}`
    this.box.appendChild(d)
    this.gain = d
  }
}
