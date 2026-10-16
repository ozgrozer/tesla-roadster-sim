// Headless checks of the people on foot: where they walk, when they cross, and that nothing on
// wheels ever runs into them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { CityPilot } from '../js/sim/cityPilot.js'
import { Peds, walkOn } from '../js/sim/peds.js'
import { kerbDist } from '../js/sim/street.js'
import { CAR, makeControls } from '../js/sim/constants.js'
import { RED, ROADS, ROAD_HW, LANE_OFF, signal } from '../js/sim/city.js'

const H = 1 / 120
// is (x, z) inside the rectangle of something at (o.x, o.z) heading (hx, hz), with a margin?
const under = (x, z, o, hl, hw, m = 0) => {
  const dx = x - o.x,
    dz = z - o.z
  return (
    Math.abs(dx * o.hx + dz * o.hz) < hl + m &&
    Math.abs(dz * o.hx - dx * o.hz) < hw + m
  )
}

test('people keep to the pavement, cross on the walk, and traffic never runs into them', () => {
  const sim = new Sim()
  sim.reset('city', { x: 100, z: LANE_OFF[1], yaw: 0 })
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 2 })
  peds.reset(sim.pos.x, sim.pos.z)
  const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
  let crossed = 0,
    off = 0,
    hit = 0,
    early = 0
  const since = new Map()
  const c = makeControls()
  c.brake = 1
  for (let i = 0; i < 150 / H; i++) {
    const was = new Map(peds.list.map(p => [p, p.state]))
    sim.step(H, c)
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    for (const p of peds.list) {
      if (p.state === 'cross' && was.get(p) === 'wait') {
        crossed++
        // over only on the walk: the street they cross has red both ways
        const { node, axis } = p.cross
        if (
          !walkOn(node, axis, tr.t) ||
          signal(node, axis, tr.t) !== RED ||
          signal(node, axis + 2, tr.t) !== RED
        )
          early++
        since.set(p, tr.t)
      }
      if (p.state !== 'cross') since.delete(p)
      if (i % 6) continue
      if (p.state === 'walk' && kerbDist(p.x, p.z) > -0.3) off++
      for (const o of tr.cars)
        if (Math.abs(o.x - p.x) < 8 && Math.abs(o.z - p.z) < 8)
          if (under(p.x, p.z, o, o.len / 2, o.wid / 2, 0.1)) hit++
    }
  }
  assert.ok(crossed > 40, `${crossed} crossed the street`)
  assert.equal(early, 0, 'nobody steps off before the walk')
  assert.equal(off, 0, 'walking, everyone keeps to the pavement')
  assert.equal(hit, 0, 'no car ever runs into anyone')
  const stuck = [...since].filter(
    ([p, t0]) => tr.t - t0 > 40 && peds.list.includes(p)
  )
  assert.equal(stuck.length, 0, 'nobody is stuck halfway over')
})

test('people dive out of the Roadster\'s way, and nobody is ever under it', () => {
  // along the pavement of the central avenue, at a run
  const sim = new Sim()
  const z = ROAD_HW + 2.2
  sim.reset('city', { x: ROADS[3] + 12, z, yaw: 0 })
  const tr = new Traffic({ seed: 4, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 6, count: 0 })
  // a few people walking the same stretch of pavement, ahead of the car
  for (let k = 0; k < 400 && peds.list.length < 12; k++) {
    const p = peds.spawn(sim.pos.x + 40, z, 0, 45)
    if (p && (Math.abs(p.z - z) > 1.6 || p.x < sim.pos.x + 8)) peds.list.pop()
  }
  assert.ok(peds.list.length >= 4, 'people on the pavement ahead')
  sim.vel.set(14, 0, 0)
  sim.speed = 14
  const c = makeControls()
  c.throttle = 0.15
  let under0 = 0,
    dived = 0
  for (let i = 0; i < 4 / H; i++) {
    sim.step(H, c)
    peds.step(H, sim, tr)
    tr.step(H, sim)
    for (const p of peds.list) {
      if (p.state === 'dodge' && p.t === 0) dived++
      const me = {
        x: sim.pos.x,
        z: sim.pos.z,
        hx: Math.cos(sim.yaw),
        hz: -Math.sin(sim.yaw)
      }
      if (under(p.x, p.z, me, CAR.halfL, CAR.halfW)) under0++
    }
  }
  assert.ok(dived >= 3, `${dived} dived out of the way`)
  assert.equal(under0, 0, 'nobody is ever under the car')
})

test('Autopilot stops for someone in the road', () => {
  const sim = new Sim()
  sim.reset('city', { x: ROADS[6] + 20, z: LANE_OFF[1], yaw: 0 }) // (clear of the jam)
  const tr = new Traffic({ seed: 1, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const pilot = new CityPilot(sim, tr)
  assert.ok(pilot.join(), 'finds its lane')
  const p = { x: sim.pos.x + 45, z: LANE_OFF[1] }
  let closest = Infinity
  for (let i = 0; i < 12 / H; i++) {
    tr.peds = [p] // (as peds.js would leave it: someone standing in the lane)
    sim.step(H, pilot.update(H))
    tr.step(H, sim)
    closest = Math.min(closest, p.x - sim.pos.x)
  }
  assert.ok(closest > CAR.halfL + 0.5, `stopped ${closest.toFixed(1)} m short`)
  assert.ok(Math.abs(sim.speed) < 0.5, 'and waits')
})
