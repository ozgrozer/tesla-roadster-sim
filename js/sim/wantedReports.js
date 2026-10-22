// Crimes reported to the police (wanted.js), as the people who saw them get round to it: the police
// seeing it themselves, at once; otherwise someone has to ring it in. A person on foot who saw it
// (peds' witnessCrime, living/pedLife.js) gets on the phone a few seconds once safe, and the report
// goes in when the call does; a driver who saw it takes DRIVER_CALL s. A caller knocked down or
// frightened off by the player never gets through: with a driver who saw it too, that driver's call
// still comes; with nobody else, it is never reported. 'crime-reported' { type, pos, by, after }
// as each goes in. Pure: no DOM.
import { emitGame } from './gameEvents.js'

export const DRIVER_CALL = 7 // s a driver who saw it takes to ring it in
export const GIVE_UP = 40 // s a report waits on a call before it is dropped

export class Reports {
  constructor () {
    this.pending = []
    this.made = 0
    this.lost = 0
  }
  clear () {
    this.pending.length = 0
  }
  // crime c seen by w ({ peds, cars, police }: witness.js); call: the call a person on foot is
  // making about it (or null); W: the wanted level. 'now', 'later' or null (nobody to report it)
  add (c, w, call, W) {
    if (w.police > 0) {
      this.file(c, w, W, 'police', 0)
      return 'now'
    }
    if (!(w.peds + w.cars)) return null
    const by = call ? 'ped' : w.cars > 0 ? 'driver' : null
    if (!by) {
      this.lost++
      return null
    }
    this.pending.push({ c, w, call, cars: w.cars, t: 0, due: by === 'driver' ? DRIVER_CALL : Infinity })
    return 'later'
  }
  step (dt, W) {
    const P = this.pending
    for (let i = P.length - 1; i >= 0; i--) {
      const r = P[i]
      r.t += dt
      let by = null
      if (r.call && r.call.state === 'done') by = 'ped'
      else if (r.call && r.call.state === 'failed') {
        r.call = null
        r.due = r.cars > 0 ? r.t + DRIVER_CALL : -1
      } else if (r.t >= r.due && r.due >= 0) by = 'driver'
      if (by) this.file(r.c, r.w, W, by, r.t)
      else if (r.due < 0 || r.t > GIVE_UP) this.lost++
      else continue
      P.splice(i, 1)
    }
  }
  file (c, w, W, by, after) {
    this.made++
    W.report(c, by === 'police' ? w : { peds: w.peds, cars: w.cars, police: 0 })
    emitGame('crime-reported', { type: c.type, pos: c.pos, by, after })
  }
}
