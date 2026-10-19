// What each kind of mission objective asks, and how it is judged (manager.js runs them): each a
// { text, start, check } over the objective's data (o), its live state (st) and the mission's
// context (ctx: { player (playerView), wanted, events (this step's game events), dt }).
// check returns 'done', 'fail' (with st.why) or nothing (still on it). Pure: no DOM.
import { spot, lotSpot } from './spots.js'

const near = (p, at, r) => Math.hypot(p.x - at.x, p.z - at.z) < r
// a place in an objective: { at: [fx, fz] } (spots.js), { lot: [fx, fz] } (the car park nearest
// there), or { x, z } already
export const place = o => {
  if (o._at) return o._at
  o._at = o.lot ? lotSpot(o.lot[0], o.lot[1]) : Array.isArray(o.at) ? spot(o.at[0], o.at[1]) : o.at
  return o._at
}
const model = v => v?.model || ''

export const OBJECTIVES = {
  // get to a place (and stop there, with stop: true)
  goto: {
    text: o => o.text || 'Drive to the <b>destination</b>',
    start (o, st) {
      st.target = place(o)
    },
    check (o, st, ctx) {
      const P = ctx.player
      if (o.vehicle && !P.vehicle) return
      if (near(P.pos, st.target, o.r || 8) && (!o.stop || P.speed < 3)) return 'done'
    }
  },
  // through the checkpoints in order before the clock runs out
  checkpoints: {
    text: o => o.text || 'Drive through the <b>checkpoints</b>',
    start (o, st) {
      st.points = o.points.map(p => (Array.isArray(p) ? spot(p[0], p[1]) : p))
      st.i = 0
      st.target = st.points[0]
      st.next = st.points[1] || null
    },
    check (o, st, ctx) {
      if (!near(ctx.player.pos, st.target, o.r || 10)) return
      st.i++
      st.hit = (st.hit || 0) + 1
      if (o.bonus) st.bonus = o.bonus // (seconds back on the clock: manager.js)
      if (st.i >= st.points.length) return 'done'
      st.target = st.points[st.i]
      st.next = st.points[st.i + 1] || null
    },
    progress: (o, st) => `${st.i}/${st.points.length}`
  },
  // get the police after you: this many stars
  wanted: {
    text: o => o.text || `Get a <b>${o.stars}-star</b> wanted level`,
    check (o, st, ctx) {
      if (ctx.wanted.stars >= o.stars) return 'done'
    }
  },
  // lose them
  evade: {
    text: o => o.text || 'Lose the <b>cops</b>',
    check (o, st, ctx) {
      if (ctx.wanted.stars === 0) return 'done'
    }
  },
  // steal a car of a model (a traffic type: carTypes.js), or any car (model: null)
  steal: {
    text: o => o.text || `Steal a <b>${o.model || 'car'}</b>`,
    check (o, st, ctx) {
      for (const e of ctx.events)
        if (e.type === 'car-stolen' && (!o.model || e.model === o.model)) {
          st.vehicle = e.vehicle
          return 'done'
        }
      const v = ctx.player.vehicle
      if (v && v.stolen && (!o.model || model(v) === o.model)) return 'done'
    }
  },
  // bring the car (of o.model, or the one stolen) to a place and stop
  deliver: {
    text: o => o.text || 'Deliver the car to the <b>garage</b>',
    start (o, st) {
      st.target = place(o)
    },
    check (o, st, ctx) {
      const P = ctx.player
      const v = P.vehicle
      if (!v || (o.model && model(v) !== o.model)) {
        st.wrong = true
        return
      }
      st.wrong = false
      if (near(P.pos, st.target, o.r || 8) && P.speed < 2.5) return 'done'
    }
  },
  // stop by someone and wait for them to get in (wait s, at a standstill)
  pickup: {
    text: o => o.text || 'Pick up the <b>passenger</b>',
    start (o, st) {
      st.target = place(o)
      st.waitT = 0
    },
    check (o, st, ctx) {
      const P = ctx.player
      if (P.vehicle && near(P.pos, st.target, o.r || 9) && P.speed < 1.5) {
        st.waitT += ctx.dt
        if (st.waitT >= (o.wait ?? 1.5)) return 'done'
      } else st.waitT = 0
    }
  },
  // take them there, stop and let them out
  dropoff: {
    text: o => o.text || 'Take the passenger to the <b>destination</b>',
    start (o, st) {
      st.target = place(o)
      st.waitT = 0
    },
    check (o, st, ctx) {
      const P = ctx.player
      if (!P.vehicle) {
        st.why = 'You left the passenger behind'
        return o.leave === false ? undefined : 'fail'
      }
      if (near(P.pos, st.target, o.r || 9) && P.speed < 1.5) {
        st.waitT += ctx.dt
        if (st.waitT >= (o.wait ?? 1)) return 'done'
      } else st.waitT = 0
    }
  }
}
