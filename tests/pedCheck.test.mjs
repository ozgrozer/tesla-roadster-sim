// The people on foot played for a while in Node and checked by js/sim/pedCheck.js: nobody in a
// building, under a car, on the road off a crossing or stuck; few slides, pops or walks through
// people; and a fright that spreads, wears off slowly and leaves them cross.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { PedCheck } from '../js/sim/pedCheck.js'
import { makeControls } from '../js/sim/constants.js'
import { LANE_OFF, ROADS, WILSHIRE, ROAD_HW } from '../js/sim/city.js'
import { ENV } from '../js/sim/env.js'

const H = 1 / 60

function play (at, drive, secs, look = () => {}) {
  ENV.hour = 13
  const sim = new Sim()
  sim.reset('city', at)
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 7 })
  peds.reset(sim.pos.x, sim.pos.z)
  const chk = new PedCheck(peds)
  for (let i = 0; i < secs / H; i++) {
    const t = i * H
    sim.step(H, Object.assign(makeControls(), drive(t)))
    const view = {
      x: sim.pos.x,
      z: sim.pos.z,
      fx: Math.cos(sim.yaw),
      fz: -Math.sin(sim.yaw)
    }
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
    chk.step(H, tr.cars)
    look(peds, t)
  }
  return chk.report()
}

function sane (r, soft) {
  for (const k of ['building', 'car', 'road', 'stuck'])
    assert.equal(
      r.count[k],
      0,
      k + ' ' + JSON.stringify(r.flags.filter(f => f.kind === k).slice(0, 3))
    )
  for (const k of ['slide', 'pop', 'through', 'jitter'])
    assert.ok(r.count[k] <= soft, `${k} ${r.count[k]} of ${r.samples}`)
  assert.ok(r.samples > 5000)
}

test('peds on a quiet street: no one in walls, on the road or walking through others', () => {
  sane(
    play({ x: 100, z: LANE_OFF[1], yaw: 0 }, () => ({ brake: 1 }), 30),
    8
  )
})

test('the Roadster up on the pavement: the fright spreads, wears off slowly, they gesture', () => {
  const seen = { spread: 0, shaken: 0, gesture: 0, fled: new Set() }
  const r = play(
    { x: ROADS[6] + 14, z: ROADS[WILSHIRE] + ROAD_HW + 2.2, yaw: 0 },
    t => (t > 3 && t < 9 ? { throttle: 0.35 } : { brake: 1 }),
    30,
    (peds, t) => {
      for (const p of peds.list) {
        if (p.state === 'flee') {
          seen.fled.add(p)
          if (p.gen > 0) seen.spread++
        }
        if (t > 20 && seen.fled.has(p) && p.state !== 'flee' && p.shaken > 0)
          seen.shaken++
        if (p.gestT > 0 && p.act >= 3) seen.gesture++
      }
    }
  )
  sane(r, 12)
  assert.ok(seen.fled.size >= 3, 'fled ' + seen.fled.size)
  assert.ok(
    seen.spread > 0,
    'fright passed on to someone who never saw the car'
  )
  assert.ok(seen.shaken > 0, 'still shaken well after the flight')
  assert.ok(seen.gesture > 0, 'someone shook a fist')
})
