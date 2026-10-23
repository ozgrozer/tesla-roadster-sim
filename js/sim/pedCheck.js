// A sanity checker for the people on foot (peds.js), run in Node (tests/pedCheck.test.mjs and
// tools/sim/pedCheck.mjs) or in the page (window.__roadster.peds): sampled every so often, it
// flags anyone inside a building or a parked car, standing about in the road, stuck (meaning to go
// somewhere but not getting there), jittering (turning back and forth on the spot), popping (a jump
// further than they can go), walking through someone standing, sliding (moving
// along with their legs still, or striding on the spot), crowded (too many on one spot), running
// scared for no time at all, or running towards what scared them.
import { COLLIDERS, query } from './city.js'
import { kerbDist } from './street.js'

// (states someone is going somewhere in, and the ones they may be in the road in)
const MOVING = new Set(['walk', 'kerb', 'cross', 'back', 'flee'])
const ROADY = new Set([
  'cross',
  'dodge',
  'down',
  'back',
  'kerb',
  'wait',
  'brawl'
])
const near = []
export const CHECK = {
  every: 0.25, // s between samples
  stuckS: 6, // s going nowhere while meaning to
  stuckM: 0.6, // m: going nowhere is less than this
  roadS: 5, // s stood about in the road
  jitterWin: 3, // s looked back over for jitter
  crowdR: 0.45, // m: closer than this, two people are on top of each other
  crowdN: 4 // this many on top of each other is a crowd
}
export const KINDS = [
  'building',
  'car',
  'road',
  'stuck',
  'jitter',
  'slide',
  'pop',
  'through',
  'crowd',
  'calm',
  'wrongway'
]

// inside a solid thing at ground level (a building, a planter, a mast), by more than m
export function insideSolid (x, z, m = 0.3) {
  query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, near)
  for (const c of near) {
    if (c.r || c.down || c.walk || c.y0 > 1 || c.y1 < 0.5) continue
    if (x > c.x0 + m && x < c.x1 - m && z > c.z0 + m && z < c.z1 - m)
      return c.kind || 'solid'
  }
  return null
}
const inCar = (p, cars) => {
  for (const c of cars) {
    if (c.y > 2) continue
    const dx = p.x - c.x,
      dz = p.z - c.z
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue
    const along = dx * c.hx + dz * c.hz,
      side = dz * c.hx - dx * c.hz
    if (Math.abs(along) < c.len / 2 - 0.25 && Math.abs(side) < c.wid / 2 - 0.25)
      return c
  }
  return null
}
const wrap = a => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2

export class PedCheck {
  constructor (peds, opts = {}) {
    this.peds = peds
    this.o = { ...CHECK, ...opts }
    this.t = 0
    this.acc = 0
    this.hist = new Map() // person -> their samples, oldest first
    this.flags = []
    this.count = Object.fromEntries(KINDS.map(k => [k, 0]))
    this.samples = 0
    this.states = {} // samples in each state
    this.seen = new Set() // (kind:id, each once)
  }
  flag (kind, p, info) {
    this.count[kind]++
    const k = kind + ':' + p.i
    if (this.seen.has(k)) return
    this.seen.add(k)
    this.flags.push({
      kind,
      id: p.i,
      state: p.state,
      x: +p.x.toFixed(1),
      z: +p.z.toFixed(1),
      t: +this.t.toFixed(2),
      ...info
    })
  }
  // after each peds.step(dt, ...): cars is traffic.cars, threat where the last fright was (or null)
  step (dt, cars = []) {
    this.t += dt
    if ((this.acc += dt) < this.o.every) return
    this.acc = 0
    this.sample(cars)
  }
  sample (cars) {
    const o = this.o
    const live = new Set()
    const cell = new Map()
    for (const p of this.peds.list) {
      if (p.lod > 2) continue // (far off: moved in big steps)
      live.add(p)
      let h = this.hist.get(p)
      if (!h) this.hist.set(p, (h = []))
      h.push({
        t: this.t,
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        state: p.state,
        gait: p.gait
      })
      while (
        h.length &&
        this.t - h[0].t > Math.max(o.stuckS, o.jitterWin) + 0.01
      )
        h.shift()
      this.samples++
      this.states[p.state] = (this.states[p.state] || 0) + 1
      const up = p.sit > 0 || p.state === 'linger' // (on a bench, at a window: placed by linger.js)
      const solid = up ? null : insideSolid(p.x, p.z)
      if (solid) this.flag('building', p, { what: solid })
      if (p.state !== 'down' && inCar(p, cars)) this.flag('car', p)
      if (!ROADY.has(p.state) && kerbDist(p.x, p.z) > 0.3) {
        p.chkRoad = (p.chkRoad || 0) + o.every
        if (p.chkRoad > o.roadS) this.flag('road', p, { s: p.chkRoad })
      } else p.chkRoad = 0
      // stuck: meaning to go somewhere (the same state all along) and not getting there
      const first = h[0]
      if (
        MOVING.has(p.state) &&
        this.t - first.t >= o.stuckS - 0.01 &&
        h.every(s => s.state === p.state) &&
        Math.hypot(p.x - first.x, p.z - first.z) < o.stuckM
      )
        this.flag('stuck', p, {
          m: +Math.hypot(p.x - first.x, p.z - first.z).toFixed(2)
        })
      // jitter: the heading back and forth (three or more reversals of over 60° in the window), or
      // a lot of to and fro for little way made
      const w = h.filter(s => this.t - s.t <= o.jitterWin)
      if (w.length > 4) {
        let flips = 0,
          path = 0,
          lastSign = 0
        for (let i = 1; i < w.length; i++) {
          const d = wrap(w[i].yaw - w[i - 1].yaw)
          if (Math.abs(d) > 1.05) {
            const sg = Math.sign(d)
            if (lastSign && sg !== lastSign) flips++
            lastSign = sg
          }
          path += Math.hypot(w[i].x - w[i - 1].x, w[i].z - w[i - 1].z)
        }
        const net = Math.hypot(p.x - w[0].x, p.z - w[0].z)
        const sameState = w.every(s => s.state === p.state)
        if (flips >= 2 && sameState) this.flag('jitter', p, { flips })
        else if (
          sameState &&
          p.state !== 'linger' &&
          path > 3 &&
          net < path * 0.2
        )
          this.flag('jitter', p, {
            path: +path.toFixed(1),
            net: +net.toFixed(1)
          })
      }
      // sliding: going along at a walk with the legs still, or striding on the spot
      if (h.length > 1) {
        const a = h[h.length - 2]
        const v =
          Math.hypot(p.x - a.x, p.z - a.z) / Math.max(1e-3, this.t - a.t)
        if (
          a.state === p.state &&
          p.state !== 'dodge' &&
          p.state !== 'down' &&
          p.state !== 'linger'
        ) {
          if (v > 0.9 && p.gait < 0.25)
            this.flag('slide', p, {
              v: +v.toFixed(2),
              gait: +p.gait.toFixed(2)
            })
          else if (v < 0.05 && p.gait > 0.8 && MOVING.has(p.state))
            this.flag('slide', p, {
              v: +v.toFixed(2),
              gait: +p.gait.toFixed(2),
              on: 'spot'
            })
        }
        // popping: further in a sample than anyone on foot goes (not diving, thrown or set down)
        const fast = { flee: 6.5, dodge: 12, down: 30, back: 4 }[p.state] || 3.6
        if (a.state === p.state && v > fast * 1.4)
          this.flag('pop', p, { v: +v.toFixed(1) })
        // scared for a moment and calm at once (under 1.5 s running)
        if (a.state === 'flee' && p.state === 'walk') {
          const ran = h.filter(s => s.state === 'flee').length * o.every
          if (ran < 1.5 && h.length * o.every > ran + 0.5)
            this.flag('calm', p, { ran })
        }
      }
      // running towards the fright, closer than they were
      if (
        p.state === 'flee' &&
        this.peds.panicX !== undefined &&
        h.length > 4
      ) {
        const fx = this.peds.panicX,
          fz = this.peds.panicZ
        const b = h[h.length - 5]
        const d0 = Math.hypot(b.x - fx, b.z - fz),
          d1 = Math.hypot(p.x - fx, p.z - fz)
        if (b.state === 'flee' && d1 < 12 && d1 < d0 - 1.5)
          this.flag('wrongway', p, { d0: +d0.toFixed(1), d1: +d1.toFixed(1) })
      }
      if (p.state !== 'down' && p.state !== 'linger' && !p.lead && !p.mate) {
        const k = Math.round(p.x / o.crowdR) + ',' + Math.round(p.z / o.crowdR)
        cell.set(k, (cell.get(k) || 0) + 1)
        if (cell.get(k) >= o.crowdN) this.flag('crowd', p, { n: cell.get(k) })
      }
    }
    // walking through someone standing (not who they are with)
    const L = [...live]
    for (const p of L) {
      if (p.state !== 'walk' && p.state !== 'cross') continue
      for (const q of L) {
        if (
          q === p ||
          (q.state !== 'idle' && q.state !== 'wait') ||
          q.lead === p ||
          p.lead === q ||
          q.mate === p ||
          p.mate === q
        )
          continue
        if (q.lead && q.lead === p.lead) continue
        if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 0.3 * 0.3)
          this.flag('through', p, { other: q.i })
      }
    }
    for (const p of this.hist.keys()) if (!live.has(p)) this.hist.delete(p)
  }
  // the counts per thousand samples, and the flags
  report () {
    const per = {}
    for (const k of KINDS)
      per[k] = +((this.count[k] * 1000) / Math.max(1, this.samples)).toFixed(2)
    return {
      samples: this.samples,
      states: { ...this.states },
      count: { ...this.count },
      per,
      flags: this.flags
    }
  }
}
export { COLLIDERS }
