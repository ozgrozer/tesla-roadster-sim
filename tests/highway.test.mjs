// The freeway and the hill road in the lane graph (highway.js), driven by the traffic (hwDrive.js),
// and a car the player drives up a ramp onto the deck, lying on the slope (bodyGround.js). npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { makeControls } from '../js/sim/constants.js'
import { EDGES, pointAt } from '../js/sim/city.js'
import { EXITS, HW } from '../js/sim/highway.js'
import { FWY } from '../js/sim/freeway.js'
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'
import '../js/sim/breakables.js'

const H = 1 / 120
const P = {},
  Q = {}

test('the freeway and the hill road: ways off the streets onto them, and every one back to a street', () => {
  assert.ok(EXITS.length >= 6, `${EXITS.length} street lanes with a way off`)
  assert.ok(HW.length >= 4)
  for (const L of EXITS)
    for (const x of L.exits) {
      pointAt(L, x.atS, P)
      pointAt(x, 0, Q)
      assert.ok(Math.hypot(P.x - Q.x, P.z - Q.z) < 1e-6, 'the way off starts on its lane')
      assert.ok(P.hx * Q.hx + P.hz * Q.hz > 0.9999, 'heading the lane\'s way')
      // (and on along it, back onto a street lane, the grid's)
      let e = x,
        n = 0
      while (e.hw && !e.road && n++ < 80) e = e.next[0]
      assert.ok(!e.hw || e.road, 'back onto a street')
    }
  assert.ok(EDGES.filter(e => e.hw && e.kind === 2).every(e => e.r > 1.9 && e.vmax > 2))
})

function drive (x, z, secs, each) {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set(x, 0, z)
  sim.syncPose()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(x, z)
  const c = makeControls()
  c.fan = false
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, c)
    tr.step(H, sim)
    sim.events.length = 0
    if (i % 60 === 0) each(tr)
  }
  return tr
}

test('the traffic drives the freeway up on its deck, at freeway speed, and comes off it again', () => {
  let top = 0,
    up = 0
  const tr = drive(0, 170, 120, tr => {
    for (const c of tr.cars)
      if (c.edge?.hw && !c.parked && Math.abs(c.y - FWY.y) < 0.05) {
        up++
        top = Math.max(top, c.v)
      }
  })
  assert.ok(up > 20, `cars up on the deck (${up})`)
  assert.ok(top > 20 && top < 36, `at ${(top * 3.6).toFixed(0)} km/h`)
  const stuck = tr.cars.filter(c => c.edge?.hw && !c.parked && c.still > 20)
  assert.equal(stuck.length, 0, 'nobody stuck on it')
})

test('the traffic drives up the hill road, through the tunnel and over the bridge', () => {
  let high = 0
  drive(480, -850, 90, tr => {
    for (const c of tr.cars) if (c.edge?.hw && !c.parked) high = Math.max(high, c.y)
  })
  assert.ok(high > 40, `up to ${high.toFixed(0)} m`)
})

test('a car driven up an on-ramp climbs onto the deck, its nose up the slope on the way', () => {
  const r = FWY.ramps.find(q => q.on && q.h0 === 0)
  const z = (r.z0 + r.z1) / 2
  const b = createVehicleBody('sedan', { x: r.x0 - 4, z, yaw: 0 })
  const inp = Object.assign(makeVehicleInput(), { throttle: 0.5 })
  let gp = 0
  for (let t = 0; t < 14; t += 1 / 60) {
    stepVehicle(b, inp, 1 / 60, { city: true, t })
    if (b.x < r.x1 - 5) gp = Math.max(gp, b.gp)
  }
  assert.ok(b.x > r.x1, `got up it (${b.x.toFixed(1)})`)
  assert.ok(Math.abs(b.y - FWY.y) < 0.1, `on the deck (${b.y.toFixed(2)} m)`)
  assert.ok(gp > 0.05, `nose up the ramp (${gp.toFixed(3)} rad)`)
})
