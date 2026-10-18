// Headless checks of how the weather and the hour change the traffic (conditions.js, sim/env.js):
// in the rain drivers cruise slower, keep longer gaps, brake more gently and take the corners
// slower, and the guarantees hold (no car through another, no red light run, nobody stuck for
// good); the hour decides how many cars are out (fewest about 3:00, the rest parked in the lots),
// and a jump in the clock is followed gently, out of sight. Each test leaves the city dry at 17:00.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { busy } from '../js/sim/conditions.js'
import { ENV, setWeather, setHour } from '../js/sim/env.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { makeControls } from '../js/sim/constants.js'
import { RED, NODES, BLOCKS, signal } from '../js/sim/city.js'

const H = 1 / 120
const PARK = BLOCKS.find(k => k.kind === 'park')
function parked () {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set((PARK.x0 + PARK.x1) / 2, 0, (PARK.z0 + PARK.z1) / 2)
  sim.syncPose()
  return sim
}
const idle = () => {
  const c = makeControls()
  c.fan = false
  return c
}
const dry = () => {
  setWeather('clear', { now: true })
  setHour(17)
}

// the traffic's pace in a weather: steady cruising on an open road, the time gap following, the
// speed half way round a turn, how hard drivers brake
function pace (weather, secs = 150) {
  setWeather(weather, { now: true })
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.call.next = Infinity // (no calls: the same traffic either way)
  const sum = { cruise: 0, gap: 0, turn: 0, brake: 0 },
    n = { cruise: 0, gap: 0, turn: 0, brake: 0 }
  const add = (k, v) => {
    sum[k] += v
    n[k]++
  }
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
    if (i % 12) continue
    for (const c of tr.cars) {
      if (c.parked || c.loose) continue
      const e = c.edge
      const free = c.clear > 70 && Math.abs(c.acc) < 0.15
      if (e.road && c.s > 15 && e.len - c.s > 35 && free) add('cruise', c.v)
      if (e.road && c.v > 6 && c.clear > 2 && c.clear < 40 && c.blk?.edge === e)
        if (Math.abs(c.acc) < 0.3) add('gap', c.clear / c.v)
      if (e.move && e.move !== 'S' && Math.abs(c.s / e.len - 0.5) < 0.1)
        add('turn', c.v)
      if (c.acc < -0.5 && c.v > 3) add('brake', -c.acc)
    }
  }
  dry()
  const r = {}
  for (const k in sum) r[k] = sum[k] / n[k]
  return r
}

test('in the rain drivers cruise slower, keep longer gaps, brake more gently and corner slower', () => {
  const d = pace('clear'),
    w = pace('storm') // (wet through, and some fog)
  const pct = k => ((w[k] / d[k] - 1) * 100).toFixed(0) + '%'
  assert.ok(w.cruise < d.cruise * 0.9, `cruising ${pct('cruise')}`)
  assert.ok(w.cruise > d.cruise * 0.75, `but not crawling (${pct('cruise')})`)
  assert.ok(w.gap > d.gap * 1.15, `gaps ${pct('gap')}`)
  assert.ok(w.turn < d.turn * 0.95, `round the corners ${pct('turn')}`)
  assert.ok(w.brake < d.brake * 0.9, `braking ${pct('brake')}`)
  assert.equal(ENV.wet, 0, 'and the city dry again')
})

test('a long run in the rain: no car through another, no red light run, nobody stuck for good', () => {
  setWeather('storm', { now: true })
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(sim.pos.x, sim.pos.z)
  const still = new Map()
  let overlaps = 0,
    reds = 0,
    longest = 0
  for (let i = 0; i < 300 / H; i++) {
    const before = new Map(tr.cars.map(c => [c, c.edge]))
    sim.step(H, idle())
    tr.step(H, sim)
    sim.events.length = 0
    const driving = tr.cars.filter(c => !c.parked && !c.loose)
    for (const c of driving) {
      const was = before.get(c)
      // (a police car on a call aside: calls.test.mjs)
      if (was?.road && c.edge !== was && c.edge.move && c.siren !== 1) {
        const node = NODES[was.to]
        if (
          signal(node, was.dir, tr.t) === RED &&
          signal(node, was.dir, tr.t - 3) === RED
        )
          reds++
      }
      const t = c.v < 0.3 ? (still.get(c) || 0) + H : 0
      still.set(c, t)
      longest = Math.max(longest, t)
    }
    if (i % 30 === 0)
      for (let j = 0; j < driving.length; j++)
        for (let k = j + 1; k < driving.length; k++) {
          const a = driving[j],
            b = driving[k]
          if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14) continue
          if (rectRect({ ...carRect(a) }, carRect(b))?.depth > 0.3) overlaps++
        }
  }
  dry()
  assert.equal(overlaps, 0, 'no two cars drive through each other')
  assert.equal(
    reds,
    0,
    'no car enters a junction long after its light turned red'
  )
  assert.ok(longest < 90, `longest standstill ${longest.toFixed(0)} s`)
})

test('the hour decides how many cars are out: fewest about 3:00, the rest parked in the lots', () => {
  const sim = parked()
  const out = {}
  for (const h of [3, 8, 12, 17, 23]) {
    setHour(h)
    const tr = new Traffic({ count: 100, radius: 300, seed: 5 })
    tr.reset(sim.pos.x, sim.pos.z)
    out[h] = { n: tr.n, parked: tr.cars.filter(c => c.parked && !c.jam).length }
  }
  dry()
  assert.equal(out[17].n, 100, 'the evening rush: all of them')
  assert.equal(out[8].n, 100, 'the morning rush too')
  assert.ok(
    out[12].n < 95 && out[12].n > 85,
    `midday a little quieter (${out[12].n})`
  )
  assert.ok(out[23].n < 90, `late in the evening fewer (${out[23].n})`)
  assert.ok(out[3].n > 50 && out[3].n < 60, `at 3:00 about 55% (${out[3].n})`)
  assert.ok(
    out[3].parked - out[17].parked > 35,
    `and more parked (${out[3].parked} against ${out[17].parked})`
  )
  assert.ok(
    busy(5.5) > busy(3) && busy(5.5) < busy(8),
    'the morning comes back gently'
  )
})

test('a jump in the clock is followed gently: cars leave the road one at a time, out of sight', () => {
  setHour(17)
  const sim = parked()
  const tr = new Traffic({ count: 100, radius: 300, seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  // (the camera at the Roadster, looking east)
  const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
  setHour(3)
  let fastest = 0,
    near = Infinity,
    at20 = null
  for (let i = 0; i < 150 / H; i++) {
    const before = new Set(tr.cars.filter(c => !c.parked))
    const n = tr.n
    sim.step(H, idle())
    tr.step(H, sim, view)
    fastest = Math.max(fastest, n - tr.n)
    for (const c of before)
      if (!tr.cars.includes(c)) {
        const d = Math.hypot(c.x - sim.pos.x, c.z - sim.pos.z)
        const ahead = (c.x - view.x) * view.fx + (c.z - view.z) * view.fz
        if (ahead > -12 && d < 260) near = Math.min(near, -1) // (taken off in sight)
        else near = Math.min(near, d)
      }
    if (at20 === null && tr.t >= 20) at20 = tr.n
  }
  const end = tr.n
  dry()
  assert.ok(at20 > 65, `after 20 s still ${at20} out`)
  assert.ok(end < 60, `and after two and a half minutes ${end}`)
  assert.ok(fastest <= 1, 'one at a time')
  assert.ok(near > 120, `never in sight, nor near (${near.toFixed(0)} m)`)
})
