// A car bearing down on people on foot (pedReact.js): nobody senses it from afar, most freeze,
// stumble or react late, a few dive after a human reaction time and only about a metre; aimed at
// them at 40 and 70 km/h, the Roadster hits most (tools/sim/pedHits.mjs). npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { FREEZE, STUMBLE, LATE, DIVE } from '../js/sim/pedReact.js'
import { resetGame } from '../js/sim/gameEvents.js'
import { LANE_OFF } from '../js/sim/city.js'

const H = 1 / 120
function world (seed = 4) {
  const sim = new Sim()
  sim.reset('city', { x: 100, z: LANE_OFF[1], yaw: 0 })
  const tr = new Traffic({ seed: 3, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed })
  peds.reset(sim.pos.x, sim.pos.z)
  return { sim, tr, peds }
}
// the Roadster as a threat d m back from p, coming straight at them at v m/s
function coming (peds, p, d, v) {
  return Object.assign(peds.me, { x: p.x - d, z: p.z, vx: v, vz: 0, hx: 1, hz: 0, hl: 2.2, hw: 1 })
}
// p alone with a car at d m coming at v m/s, for secs (the car moving, the people's clock running):
// p's state each step, and when they started to move
function run (peds, p, d, v, secs) {
  const th = coming(peds, p, d, v)
  const x0 = p.x,
    z0 = p.z
  let moved = -1,
    maxV = 0
  const states = []
  for (let t = 0; t < secs; t += H) {
    peds.now = (peds.now || 0) + H
    th.x += v * H
    if (p.state === 'dodge') {
      p.x += p.vx * H
      p.z += p.vz * H
      maxV = Math.max(maxV, Math.hypot(p.vx, p.vz))
      p.vx *= Math.exp(-3 * H)
      p.vz *= Math.exp(-3 * H)
    }
    peds.dodge(p, th)
    states.push(p.state)
    if (moved < 0 && p.state !== states[0]) moved = t
    if (p.state === 'down') break
  }
  return { states, moved, maxV, off: Math.hypot(p.x - x0, p.z - z0) }
}

test('how people take a car coming: most freeze, stumble or are late; one in five or so dives', () => {
  const { peds } = world()
  const n = [0, 0, 0, 0, 0]
  for (const p of peds.list) n[peds.reactKind(p)]++
  const all = n.reduce((a, b) => a + b, 0)
  assert.ok(n[DIVE] / all > 0.08 && n[DIVE] / all < 0.3, `divers ${n[DIVE]} of ${all}`)
  assert.ok((n[FREEZE] + n[STUMBLE] + n[LATE]) / all > 0.7, JSON.stringify(n))
  assert.ok(n[FREEZE] > n[STUMBLE] && n[FREEZE] > n[LATE], 'freezing the commonest')
  for (const p of peds.list) {
    const k = peds.reactKind(p),
      s = peds.reactDelay(p, k)
    if (k === DIVE) assert.ok(s >= 0.4 && s <= 0.8, `a diver's reaction ${s}`)
    if (k === LATE) assert.ok(s >= 0.9)
  }
})

test('nobody senses a car from afar: at 30 m and more, coming at 70 km/h, they carry on', () => {
  resetGame()
  const { peds } = world()
  const p = peds.list.find(q => q.state === 'walk' || q.state === 'idle')
  const was = p.state
  // 0.4 s: from 60 m to 52 m off, never closer than 30 m
  const r = run(peds, p, 60, 19.4, 0.4)
  assert.ok(r.states.every(s => s === was), r.states.join())
  assert.equal(p.rk, 0, 'not even noticed')
})

test('a diver moves only after their reaction time, and no faster than a lunge: about a metre', () => {
  resetGame()
  const { peds } = world()
  const p = peds.list.find(q => (q.state === 'walk' || q.state === 'idle') && peds.reactKind(q) === DIVE)
  assert.ok(p, 'a diver')
  // 40 km/h from 40 m: seen at about 17 m (1.5 s off), moving 0.4-0.8 s later
  const r = run(peds, p, 40, 11.1, 3)
  const seenAt = (40 - 2.2 - 11.1 * 1.7) / 11.1 // (s: TIME before it would reach them)
  assert.ok(r.moved > seenAt + 0.35, `moved at ${r.moved.toFixed(2)} s, seen at ${seenAt.toFixed(2)} s`)
  assert.ok(r.maxV <= 3.7, `dived at ${r.maxV.toFixed(1)} m/s`)
  assert.ok(r.off < 1.5, `${r.off.toFixed(2)} m clear of where they stood`)
})

test('aimed at people on the pavement at 40 and 70 km/h, the Roadster hits most of them', () => {
  const out = execFileSync(process.execPath, ['--import', './tools/node-loader/register.mjs', 'tools/sim/pedHits.mjs', '1', '--json'], { encoding: 'utf8' })
  const { report } = JSON.parse(out)
  assert.ok(report.all.n >= 15, `${report.all.n} runs`)
  assert.ok(report.kmh40.rate >= 0.75 && report.kmh70.rate >= 0.75, JSON.stringify(report))
})
