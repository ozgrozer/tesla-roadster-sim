// Headless checks of the people and the hour and the rain (footfall.js, shelter.js): how many are
// out, umbrellas up as it rains and down after, hurrying, nobody standing about in it, some under
// the shop canopies, and that in the rain nobody is run into, everyone keeps to the pavement and
// crosses on the walk as before. Each test puts the clock and the weather back as it found them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds, walkOn } from '../js/sim/peds.js'
import { ENV } from '../js/sim/env.js'
import { kerbDist } from '../js/sim/street.js'
import { hourShare, evening, lively } from '../js/sim/footfall.js'
import { makeControls } from '../js/sim/constants.js'
import {
  RED,
  LANE_OFF,
  ROADS,
  LAMPS,
  COLLIDERS,
  OLD,
  signal
} from '../js/sim/city.js'
import { lampOn } from '../js/render/pedLight.js'
import '../js/sim/breakables.js'

const H = 1 / 120
// run fn with the clock at hour and the rain (and the wet) as given, then put them back
function weather (hour, rain, fn) {
  const was = { hour: ENV.hour, rain: ENV.rain, wet: ENV.wet }
  Object.assign(ENV, { hour, rain, wet: rain })
  try {
    return fn()
  } finally {
    Object.assign(ENV, was)
  }
}
// people (and no traffic) round (x, z), stepped t seconds with the camera looking east
function run (peds, x, z, t, each) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(x, z)
  const view = { x, z, fx: 1, fz: 0 }
  const c = makeControls()
  c.brake = 1
  for (let i = 0; i < t / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
    each?.(i)
  }
}
// (the old city sits in the north-west of the grown one, its x shifted by OLD: these are on the
// same stretches of Hollywood Blvd and Olympic as before; the shops along Hollywood were drawn
// again as the lots' stream grew, so its spot moved a block east, to where they stand at the back
// of the pavement)
const HOLLYWOOD = { x: 90 + OLD, z: ROADS[1] + LANE_OFF[1] }
const MIDCITY = { x: 60 + OLD, z: ROADS[7] + LANE_OFF[1] }

test('fewer people late at night, a third at three in the morning, all back by seven', () => {
  assert.equal(hourShare(17), 1)
  assert.equal(hourShare(12), 1)
  assert.equal(hourShare(21.9), 1)
  assert.ok(Math.abs(hourShare(3) - 1 / 3) < 1e-9, 'a third at three')
  assert.ok(hourShare(0) < 0.65 && hourShare(0) > 0.4, 'fewer at midnight')
  assert.ok(hourShare(6) > hourShare(4), 'coming back out towards seven')
  assert.equal(hourShare(7), 1)
  const count = h =>
    weather(h, 0, () => {
      const peds = new Peds({ seed: 2 })
      peds.reset(MIDCITY.x, MIDCITY.z)
      return peds.list.length
    })
  // (the last one in may bring a friend or two)
  const day = count(12)
  assert.ok(day >= 240 && day <= 243, `${day} by day, as ever`)
  const night = count(3)
  assert.ok(night > 70 && night < 90, `${night} out at three in the morning`)
  // the clock running on into the night: people go indoors out of sight, a few at a time
  weather(12, 0, () => {
    const peds = new Peds({ seed: 2 })
    peds.reset(MIDCITY.x, MIDCITY.z)
    ENV.hour = 3
    let last = peds.list.length,
      drop = 0
    run(peds, MIDCITY.x, MIDCITY.z, 60, () => {
      drop = Math.max(drop, last - peds.list.length)
      last = peds.list.length
    })
    // (four going in at most each half second, and the odd one walking off out of the bubble)
    assert.ok(drop <= 8, `no more than a few at a time (${drop})`)
    assert.ok(peds.list.length < 100, `${peds.list.length} left out at three`)
  })
})

test('in the evening more people on Hollywood\'s and Santa Monica\'s streets', () => {
  assert.equal(evening(12), 0)
  assert.equal(evening(17), 0, 'not yet in the late afternoon')
  assert.equal(evening(20), 1)
  const count = (h, at) =>
    weather(h, 0, () => {
      const peds = new Peds({ seed: 2 })
      peds.reset(at.x, at.z)
      const n = peds.list.filter(p => lively(p.ring.b)).length
      return { all: peds.list.length, lively: n / peds.list.length }
    })
  const day = count(12, HOLLYWOOD),
    eve = count(20, HOLLYWOOD)
  assert.ok(
    eve.all > day.all * 1.2,
    `${eve.all} out in the evening, ${day.all} by day`
  )
  assert.ok(eve.lively >= day.lively, 'and more of them on the lively blocks')
  const mid = count(20, MIDCITY)
  assert.ok(
    mid.all < eve.all,
    `fewer in Mid-City (${mid.all}) than in Hollywood`
  )
})

test('umbrellas go up as it rains, hoods and a quicker step without, and all down after', () => {
  const peds = weather(17, 0, () => new Peds({ seed: 5 }))
  weather(17, 0, () => peds.reset(MIDCITY.x, MIDCITY.z))
  const up = () => peds.list.filter(p => p.umb > 0.95).length
  const hunched = () => peds.list.filter(p => p.hunch > 0.95).length
  assert.equal(up() + hunched(), 0, 'dry: none')
  weather(17, 0, () => {
    // the rain coming on slowly, as the city's weather eases in: some mind it before others
    const seen = []
    run(peds, MIDCITY.x, MIDCITY.z, 24, i => {
      ENV.rain = Math.min(0.8, (i * H) / 20)
      if (i % 240 === 0) seen.push(up())
    })
    const n = peds.list.length,
      carry = peds.list.filter(p => p.brolly).length
    assert.ok(
      seen.some(k => k > 5 && k < carry * 0.7),
      `umbrellas up one by one (${seen})`
    )
    assert.ok(up() > carry * 0.85, `${up()} of ${carry} umbrellas up`)
    assert.ok(hunched() > (n - carry) * 0.6, `${hunched()} hunched without one`)
    const walk = peds.list.filter(p => p.state === 'walk' && !p.lead)
    assert.ok(walk.every(p => p.rush >= 1), 'no slower')
    assert.ok(walk.some(p => p.rush > 1.15), 'and quicker')
    const dash = peds.list.filter(p => p.state === 'walk' && p.v * p.rush > 2.3)
    assert.ok(dash.length > 0, `${dash.length} running for it`)
    const idle = peds.list.filter(p => p.state === 'idle')
    assert.equal(idle.length, 0, 'nobody stands about')
    const sat = peds.list.filter(p => p.sit > 0)
    assert.equal(sat.length, 0, 'nobody on a wet bench')
    ENV.rain = 0
    run(peds, MIDCITY.x, MIDCITY.z, 6)
    assert.equal(up() + hunched(), 0, 'and down again once it stops')
    assert.ok(peds.list.every(p => p.umb === 0 && p.rush === 1), 'all of them')
  })
})

test('in a downpour fewer come out, and some wait it out under the shop canopies', () => {
  weather(17, 1, () => {
    const peds = new Peds({ seed: 3 })
    peds.reset(HOLLYWOOD.x, HOLLYWOOD.z)
    const n = peds.list.length
    assert.ok(n > 100 && n < 140, `${n} out in a downpour`)
    const under = new Set()
    run(peds, HOLLYWOOD.x, HOLLYWOOD.z, 60, () => {
      for (const p of peds.list)
        if (p.state === 'linger' && p.what === 3 && p.leg === 2) under.add(p)
    })
    assert.ok(under.size >= 4, `${under.size} waited under a canopy`)
    for (const p of under) {
      const d = -kerbDist(p.x, p.z)
      assert.ok(d > 3.3 && d < 4.4, `under it (${d.toFixed(2)} m in)`)
      assert.equal(p.umb, 0, 'umbrella down')
    }
    // and on their way once it stops
    ENV.rain = 0
    run(peds, HOLLYWOOD.x, HOLLYWOOD.z, 8)
    // (still under the canopy: one who has walked on and stopped at a window since is on their way)
    const still = [...under].filter(
      p => p.state === 'linger' && p.what === 3 && !p.gone
    )
    assert.equal(still.length, 0, 'on their way once it stops')
  })
})

test('in the rain people still keep to the pavement, cross on the walk, and are never run into', () => {
  weather(17, 1, () => {
    const sim = new Sim()
    sim.reset('city', { x: 100, z: LANE_OFF[1], yaw: 0 })
    const tr = new Traffic({ seed: 3 })
    tr.reset(sim.pos.x, sim.pos.z)
    const peds = new Peds({ seed: 2 })
    peds.reset(sim.pos.x, sim.pos.z)
    const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
    const c = makeControls()
    c.brake = 1
    let crossed = 0,
      early = 0,
      off = 0,
      hit = 0
    for (let i = 0; i < 120 / H; i++) {
      const was = new Map(peds.list.map(p => [p, p.state]))
      sim.step(H, c)
      peds.step(H, sim, tr, view)
      tr.step(H, sim, view)
      for (const p of peds.list) {
        if (p.state === 'cross' && was.get(p) === 'wait') {
          crossed++
          const { node, axis } = p.cross
          if (
            !walkOn(node, axis, tr.t) ||
            signal(node, axis, tr.t) !== RED ||
            signal(node, axis + 2, tr.t) !== RED
          )
            early++
        }
        if (i % 6) continue
        const on = p.state === 'walk' || p.state === 'linger'
        if (on && kerbDist(p.x, p.z) > -0.3) off++
        for (const o of tr.cars) {
          const dx = p.x - o.x,
            dz = p.z - o.z
          if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue
          if (
            Math.abs(dx * o.hx + dz * o.hz) < o.len / 2 + 0.1 &&
            Math.abs(dz * o.hx - dx * o.hz) < o.wid / 2 + 0.1
          )
            hit++
        }
      }
    }
    assert.ok(crossed > 20, `${crossed} crossed the street`)
    assert.equal(early, 0, 'nobody steps off before the walk')
    assert.equal(off, 0, 'everyone keeps to the pavement')
    assert.equal(hit, 0, 'no car ever runs into anyone')
  })
})

test('at night the street light over the pavement lights whoever stands in its pool', () => {
  const i = LAMPS.findIndex(l => !l.wood),
    l = LAMPS[i]
  // (the middle of its pool, 2.3 m out over the road from the pole; and in from there)
  const px = l.x + l.ax * 2.3,
    pz = l.z + l.az * 2.3
  const out = { x: 0, y: 0, z: 0, w: 0 }
  assert.equal(lampOn(px, pz, 0, out).w, 0, 'not by day')
  const mid = lampOn(px, pz, 1, out).w
  assert.ok(mid > 3, 'brightest in the middle of its pool')
  assert.ok(out.y > 8 && Math.hypot(out.x, out.z) < 0.2, 'from the lens, above')
  const near = lampOn(px - l.ax * 2, pz - l.az * 2, 1, out).w
  assert.ok(near > 0.4 * mid && near < mid, 'less towards its edge')
  const past = lampOn(px - l.ax * 6.5, pz - l.az * 6.5, 1, out).w
  assert.equal(past, 0, 'none past it')
  assert.ok(lampOn(px, pz, 0.5, out).w < mid, 'dimmer as the lights come on')
  // knocked down, it lights nobody
  const post = COLLIDERS.find(c => c.kind === 'lamp' && c.i === i)
  post.down = true
  try {
    assert.equal(lampOn(px, pz, 1, out).w, 0, 'knocked down, it lights nobody')
  } finally {
    post.down = false
  }
})
