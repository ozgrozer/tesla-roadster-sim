// The missions' state machine. Idle, every mission on offer has a marker in the world (its start:
// spots.js); drive (or walk) into one, slowly enough, and it starts (never forced). Running, its
// objectives (objectives.js) come one after another, each with the place it points at (for the
// marker, the blips and the GPS), against the mission's clock and the objective's own; busted or
// wasted ends it (failed), as does the clock running out or an objective failing. Passed, the
// reward (and any tip for time to spare) goes on the cash. Side effects (the wanted level, a car to
// steal, the GPS) are the game's (game.js) through the hooks: on.start(def), on.end(def, passed),
// on.objective(def, o, st). Pure: no DOM.
import { MISSIONS } from './index.js'
import { OBJECTIVES } from './objectives.js'
import { spot } from './spots.js'

export const START_R = 6 // m: in the marker
export const START_V = 14 // m/s at most to start one, driving in
export const LEAVE_R = 16 // m from a marker before it can start again, after a mission ended there

export class MissionManager {
  constructor (defs = MISSIONS) {
    this.defs = defs
    this.cash = 0
    this.on = { start: null, end: null, objective: null }
    this.passed = new Set()
    this.msgs = [] // for the HUD: { kind: 'start' | 'objective' | 'pass' | 'fail', ... }
    this.reset()
  }
  reset () {
    this.active = null
    this.state = 'idle'
    this.i = 0
    this.st = null
    this.timer = null // s left on the mission's clock (null: none)
    this.objT = null // and on the objective's
    this.t = 0
    this.hold = null // { id, x, z }: a marker that waits for the player to leave it
  }
  get objective () {
    return this.active ? this.active.objectives[this.i] : null
  }
  // the mission's starts (idle) or what the current objective points at (running), for the
  // markers, blips and GPS: [{ id, kind: 'start' | 'target' | 'next', x, z, color, title }]
  markers (out = []) {
    out.length = 0
    if (this.state === 'idle') {
      for (const d of this.defs) {
        const at = this.startOf(d)
        out.push({ id: d.id, kind: 'start', x: at.x, z: at.z, color: d.color, title: d.title })
      }
    } else if (this.st?.target) {
      const c = this.active.color
      out.push({ id: this.active.id, kind: 'target', x: this.st.target.x, z: this.st.target.z, color: c })
      if (this.st.next) out.push({ id: this.active.id, kind: 'next', x: this.st.next.x, z: this.st.next.z, color: c })
    }
    return out
  }
  startOf (d) {
    return (d._start ||= spot(d.start[0], d.start[1]))
  }

  // Each step. ctx: { player (playerView), wanted, events (game events since the last step), dt }
  update (dt, ctx) {
    this.t += dt
    ctx.dt = dt
    if (this.state !== 'running') return this.idle(ctx)
    for (const e of ctx.events)
      if (e.type === 'busted' || e.type === 'wasted') return this.fail(e.type === 'busted' ? 'Busted' : 'Wasted')
    const o = this.objective,
      H = OBJECTIVES[o.type]
    const r = H.check(o, this.st, ctx)
    if (this.st.bonus) {
      if (this.objT !== null) this.objT += this.st.bonus
      else if (this.timer !== null) this.timer += this.st.bonus
      this.st.bonus = 0
    }
    if (r === 'fail') return this.fail(this.st.why || 'Mission failed')
    if (r === 'done') return this.next(ctx)
    if (this.timer !== null && (this.timer -= dt) <= 0) return this.fail('Out of time')
    if (this.objT !== null && (this.objT -= dt) <= 0) return this.fail('Out of time')
  }
  idle (ctx) {
    const P = ctx.player
    if (this.hold && Math.hypot(P.pos.x - this.hold.x, P.pos.z - this.hold.z) > LEAVE_R) this.hold = null
    if (P.speed > START_V || ctx.wanted?.stars) return // (not while wanted, as GTA)
    for (const d of this.defs) {
      const at = this.startOf(d)
      if (this.hold?.id === d.id) continue
      if (Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < START_R) return this.start(d, ctx)
    }
  }
  start (d, ctx = null) {
    if (typeof d === 'string') d = this.defs.find(m => m.id === d)
    if (!d) return false
    if (this.state === 'running') this.end(false)
    this.active = d
    this.state = 'running'
    this.timer = d.timer ?? null
    this.i = -1
    this.msgs.push({ kind: 'start', title: d.title, text: d.brief, color: d.color })
    this.on.start?.(d, ctx)
    this.next(ctx, true)
    return true
  }
  // on to the next objective (or passed, after the last)
  next (ctx, first = false) {
    this.i++
    const d = this.active
    if (this.i >= d.objectives.length) return this.pass()
    const o = d.objectives[this.i]
    this.st = { target: null, next: null }
    this.objT = o.time ?? null
    OBJECTIVES[o.type].start?.(o, this.st, ctx)
    this.msgs.push({ kind: 'objective', text: OBJECTIVES[o.type].text(o), first })
    this.on.objective?.(d, o, this.st)
  }
  pass () {
    const d = this.active
    const left = this.objT ?? this.timer ?? 0
    const pay = Math.round(d.reward + (d.tip || 0) * Math.max(0, left))
    this.cash += pay
    this.passed.add(d.id)
    this.msgs.push({ kind: 'pass', title: d.title, reward: pay })
    this.end(true)
  }
  fail (why) {
    const d = this.active
    this.msgs.push({ kind: 'fail', title: d?.title, why })
    this.end(false)
  }
  // (its marker waits for the player to drive out of it before it can start again)
  end (passed) {
    const d = this.active
    if (!d) return
    const at = this.startOf(d)
    this.hold = { id: d.id, x: at.x, z: at.z }
    this.on.end?.(d, passed)
    this.reset()
    this.hold = { id: d.id, x: at.x, z: at.z }
  }
  abort () {
    if (this.state === 'running') this.fail('Mission abandoned')
  }
  // the HUD's line: the objective's text, its progress, the clock (s, or null)
  status () {
    if (this.state !== 'running') return null
    const o = this.objective,
      H = OBJECTIVES[o.type]
    return {
      title: this.active.title,
      text: H.text(o),
      progress: H.progress ? H.progress(o, this.st) : '',
      clock: this.objT ?? this.timer,
      wrong: !!this.st.wrong,
      color: this.active.color
    }
  }
}
