// Headless checks of the street stunts the Roadster is scored for: drifts and near misses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { drift } from '../js/sim/stunts.js'
import { makeControls } from '../js/sim/constants.js'
import { LANES, LANE_OFF } from '../js/sim/city.js'

const H = 1 / 120

test('a drift held at speed scores once it straightens up', () => {
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-300, 0, 60) // open ground beside the runway
  sim.suction = 0
  sim.syncPose()
  sim.vel.set(20, 0, 0)
  sim.speed = 20
  const events = []
  for (let t = 0; t < 4; t += H) {
    const c = makeControls()
    c.fan = false
    // a tap of the e-brake on full lock, then power on and the wheel straight
    c.ebrake = t < 0.6
    c.steer = t < 0.6 ? 1 : 0
    c.throttle = t > 0.6 ? 0.5 : 0
    sim.step(H, c)
    events.push(...sim.events)
    sim.events.length = 0
  }
  const drifts = events.filter(e => e.type === 'drift')
  assert.equal(drifts.length, 1, 'one drift')
  assert.ok(drifts[0].t > 0.8 && drifts[0].pts > 0, 'scored for its length')
  // a drift that ends in a crash scores nothing
  sim.drifting = { t: 2, sum: 0.8, calm: 0 }
  sim.mode = 'crash'
  drift(sim, H)
  assert.equal(sim.events.length, 0, 'nothing for a drift into a crash')
  assert.equal(sim.drifting.t, 0, 'and it is over')
})

// The Roadster at 25 m/s overtaking a car doing 8 in the next lane, `off` m over towards it.
function overtake (off) {
  const sim = new Sim()
  const e = LANES.find(
    l => l.road && l.lane === 0 && l.dir === 0 && l.len > 70 && !l.closed
  )
  const tr = new Traffic({ count: 0 })
  tr.reset(e.x0, e.z0)
  tr.cars.length = 0
  const car = tr.make(0)
  Object.assign(car, { edge: e, s: 50, v: 8, v0: 8 })
  tr.insert(e, car)
  car.next = tr.choose(e, car)
  tr.place(car)
  tr.n++
  // in the kerb lane beside it, 30 m back
  const z = e.z0 + LANE_OFF[1] - LANE_OFF[0] - off
  sim.reset('city', { x: e.x0 + 20, z, yaw: 0 })
  sim.vel.set(25, 0, 0)
  sim.speed = 25
  const events = []
  for (let t = 0; t < 2.5; t += H) {
    const c = makeControls()
    c.throttle = sim.speed < 25 ? 0.4 : 0
    sim.step(H, c)
    tr.step(H, sim)
    events.push(...sim.events)
    sim.events.length = 0
  }
  return events
}

test('flashing past a car close by is a near miss, a lane away is not', () => {
  const close = overtake(0.8)
  assert.equal(
    close.filter(e => e.type === 'nearMiss').length,
    1,
    'a near miss, close by'
  )
  assert.ok(!close.some(e => e.type === 'bump'), 'without touching it')
  const wide = overtake(0)
  assert.ok(
    !wide.some(e => e.type === 'nearMiss'),
    'a lane away is just overtaking'
  )
})
