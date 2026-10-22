// The hidden tokens' counter (the world's hunt: render/interiors/hunt.js says 'token-collected'
// { id, n, total, where, pos } and, at the last, 'tokens-complete'): a small "◆ 7/30" by the radar
// shown for a few seconds on each find (longer, gold, when all are found) and the count for the
// pause menu's STATS tab. The count is remembered between visits (prefs 'tokenCount'). The state is
// pure (update returns whether it shows); the element is optional.
import { onGame } from '../sim/gameEvents.js'
import { recall, remember } from './prefs.js'

export const SHOW_S = 4 // s the counter stays up after a find
export const DONE_S = 8 // s after the last one
export const DEFAULT_TOTAL = 30

export class TokenCounter {
  constructor (el = null) {
    this.el = el
    const [n, total] = String(recall('tokenCount', '') || '').split('/').map(Number)
    this.total = total > 0 ? total : DEFAULT_TOTAL
    this.n = n >= 0 ? Math.min(n, this.total) : 0
    this.where = ''
    this.t = 0 // s left on screen
    this.shown = false
    this.offs = [
      onGame('token-collected', d => this.found(d)),
      onGame('tokens-complete', d => this.complete(d))
    ]
    this.draw()
  }
  get done () {
    return this.n >= this.total
  }
  found (d = {}) {
    if (d.total > 0) this.total = d.total
    // (the hunt's own count is the truth; a stray repeat never counts down)
    this.n = Math.min(this.total, Number.isFinite(d.n) ? Math.max(this.n, d.n) : this.n + 1)
    this.where = d.where || ''
    this.t = this.done ? DONE_S : SHOW_S
    remember('tokenCount', `${this.n}/${this.total}`)
    this.draw()
  }
  complete (d = {}) {
    if (d.total > 0) this.total = d.total
    this.n = this.total
    this.t = DONE_S
    remember('tokenCount', `${this.n}/${this.total}`)
    this.draw()
  }
  // each frame: whether the counter is up
  update (dt) {
    if (this.t > 0) this.t = Math.max(0, this.t - dt)
    const on = this.t > 0
    if (on !== this.shown) {
      this.shown = on
      this.el?.classList.toggle('on', on)
    }
    return on
  }
  text () {
    return `◆ ${this.n}/${this.total}`
  }
  draw () {
    if (!this.el) return
    this.el.textContent = this.text()
    this.el.classList.toggle('done', this.done)
    this.el.title = this.where ? `Hidden tokens · last found ${this.where}` : 'Hidden tokens'
  }
  dispose () {
    for (const off of this.offs) if (typeof off === 'function') off()
  }
}
