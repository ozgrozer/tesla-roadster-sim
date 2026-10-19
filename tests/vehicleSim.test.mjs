// The handling classes (handling.js) and the drivable cars' physics (vehicleSim.js, vehicleHit.js):
// every class drives as its kind should, the Roadster keeps its own physics, and a traffic car can
// be taken over, driven and handed back (handover.js, vehicleLink.js). npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HANDLING, KINDS, kindOfType, lockAt, torqueAt } from '../js/sim/handling.js'
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'
import { collideTraffic } from '../js/sim/vehicleHit.js'
import { bodyFromTraffic, writeToTraffic, vehicleProxy, footProxy } from '../js/sim/vehicleLink.js'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { TYPES } from '../js/sim/carTypes.js'
import { makeControls } from '../js/sim/constants.js'
import { LANES, BLOCKS } from '../js/sim/city.js'
import { kerbDist } from '../js/sim/street.js'

const H = 1 / 60
const OPEN = { x: -100, z: 300 } // open desert, off the city
const CARS = KINDS.filter(k => !HANDLING[k].sim)
function run (b, inp, secs, world = null, each) {
  for (let t = 0; t < secs; t += H) {
    stepVehicle(b, inp, H, world)
    each?.(b, t)
  }
  return b
}
const input = o => Object.assign(makeVehicleInput(), o)

test('every handling class has its figures, and every traffic type drives as one of them', () => {
  const need = ['mass', 'torque', 'gears', 'final', 'vMax', 'brake', 'lock', 'steerV', 'gripF',
    'gripR', 'suspHz', 'travel', 'rollK', 'comH', 'wf']
  for (const k of ['sedan', 'sports', 'suv', 'pickup', 'truck', 'van', 'bus', 'police'])
    for (const f of need) assert.ok(HANDLING[k][f] !== undefined, `${k}.${f}`)
  assert.ok(HANDLING.roadster.sim, 'the Roadster keeps its own physics')
  for (const T of TYPES) assert.ok(HANDLING[kindOfType(T.name)], T.name)
  for (const k of CARS) {
    const h = HANDLING[k]
    assert.ok(lockAt(h, 30) < lockAt(h, 10) && lockAt(h, 10) < lockAt(h, 0), `${k}: less lock at speed`)
    assert.ok(torqueAt(h, h.rpmPeak) === 1 && torqueAt(h, h.rpmRed * 1.1) === 0, `${k} torque curve`)
  }
})

test('flat out each class runs up through its gears to about its top speed, never past the red line', () => {
  const top = {}
  for (const k of CARS) {
    const b = createVehicleBody(k, OPEN)
    const gears = new Set()
    let red = 0
    run(b, input({ throttle: 1 }), 70, null, b => {
      gears.add(b.gear)
      red = Math.max(red, b.rpm / b.spec.rpmRed)
    })
    top[k] = b.u
    assert.ok(b.u <= b.spec.vMax * 1.01 && b.u > b.spec.vMax * 0.85, `${k}: ${b.u.toFixed(1)} of ${b.spec.vMax}`)
    assert.ok(gears.size >= 4, `${k} shifted through ${gears.size} gears`)
    assert.ok(red < 1.03, `${k} kept under the red line`)
  }
  assert.ok(top.sports > top.police && top.police > top.sedan && top.sedan > top.van && top.van > top.bus)
})

test('a sports car pulls away hardest and stops shortest, a bus slowest on both', () => {
  const t100 = k => {
    const b = createVehicleBody(k, OPEN)
    let t = 0
    while (b.u < 20 && t < 60) {
      stepVehicle(b, input({ throttle: 1 }), H)
      t += H
    }
    return t
  }
  const stop = k => {
    const b = createVehicleBody(k, OPEN)
    b.vx = 25
    let d = 0
    while (Math.hypot(b.vx, b.vz) > 0.05 && d < 500) {
      const x = b.x
      stepVehicle(b, input({ brake: 1 }), H)
      d += b.x - x
    }
    return d
  }
  assert.ok(t100('sports') < t100('sedan') && t100('sedan') < t100('truck') && t100('truck') < 1e3)
  assert.ok(t100('bus') > t100('van'))
  assert.ok(stop('sports') < stop('sedan') && stop('sedan') < stop('bus'))
  assert.ok(stop('sedan') > 25 && stop('sedan') < 45, `sedan from 90 km/h in ${stop('sedan').toFixed(1)} m`)
})

test('braking throws the weight onto the nose and dips it; a tall van rolls more than a sports car', () => {
  const b = createVehicleBody('sedan', OPEN)
  b.vx = 25
  let dN = 0,
    pitch = 0
  run(b, input({ brake: 1 }), 1, null, b => {
    dN = Math.min(dN, b.dN)
    pitch = Math.max(pitch, b.pitch)
  })
  assert.ok(dN < -0.15 * b.m * 9.81, 'weight forward')
  assert.ok(pitch > 0.01, 'nose down')
  const roll = k => {
    const c = createVehicleBody(k, OPEN)
    c.vx = 14
    let r = 0
    run(c, input({ steer: 0.6, throttle: 0.3 }), 3, null, c => (r = Math.max(r, Math.abs(c.roll))))
    return r
  }
  assert.ok(roll('van') > 2 * roll('sports'), `van ${roll('van')} sports ${roll('sports')}`)
})

test('cornering holds to the grip, and steering loses lock with speed', () => {
  for (const k of CARS) {
    const b = createVehicleBody(k, OPEN)
    b.vx = 25
    let lat = 0
    run(b, input({ steer: 1, throttle: 0.5 }), 4, null, b => (lat = Math.max(lat, Math.abs(b.latAcc))))
    assert.ok(lat < b.spec.mu * 9.81 * 1.15, `${k} corners at ${lat.toFixed(1)} m/s^2`)
    assert.ok(Math.abs(b.steerAng) < b.spec.lock * 0.6, `${k}: little lock at 90 km/h`)
  }
})

test('a handbrake flick swings the tail, and let go the car straightens and drives on', () => {
  for (const k of CARS) {
    const b = createVehicleBody(k, OPEN)
    b.vx = 20
    let turned = 0
    run(b, input({ handbrake: true, steer: 1 }), 0.4, null, b => (turned = Math.max(turned, b.yaw)))
    run(b, input({ throttle: 0.5 }), 3)
    assert.ok(turned > 0.04, `${k} swung ${turned.toFixed(2)} rad`)
    assert.ok(Math.abs(b.slip) < 0.05 && b.u > 5, `${k} recovered: slip ${b.slip.toFixed(2)}, ${b.u.toFixed(1)} m/s`)
  }
  // held longer, a light sports car comes right round
  const s = createVehicleBody('sports', OPEN)
  s.vx = 20
  run(s, input({ handbrake: true, steer: 1 }), 0.8)
  assert.ok(s.yaw > 1, 'a long pull swings it well round')
})

test('the brake held at a standstill backs up, with the reversing lights on; the brake lights work', () => {
  const b = createVehicleBody('suv', OPEN)
  run(b, input({ brake: 1 }), 3)
  assert.ok(b.u < -4 && b.gear === -1 && b.lights.reverse && !b.lights.brake)
  run(b, input({ throttle: 1 }), 0.5)
  assert.ok(b.u > -4, 'the throttle stops it backing')
  const c = createVehicleBody('sedan', OPEN)
  c.vx = 10
  stepVehicle(c, input({ brake: 0.5 }), H)
  assert.ok(c.lights.brake && !c.lights.reverse)
})

test('into a wall: bounced off by mass and momentum, dented, a crash; a kerb climbed costs speed', () => {
  const wall = { x0: 10, x1: 14, z0: -10, z1: 10, y0: 0, y1: 10, kind: 'building' }
  const world = { city: false, solids: [wall] }
  const b = createVehicleBody('sedan', { x: 0, z: 0 })
  b.vx = 18
  const seen = []
  run(b, input({ throttle: 0.2 }), 1.5, world, b => seen.push(...b.events))
  assert.ok(seen.some(e => e.type === 'crash'), 'a crash')
  assert.ok(b.vx < 0 || b.x + b.len / 2 <= wall.x0 + 0.05, 'stopped at the wall')
  assert.ok(b.dmg && b.dmg.harm > 0, 'damaged')
  // the city's kerb: from the road up onto the pavement, square on
  const e = LANES.find(l => l.dir === 1 && l.lane === 1 && l.len > 60)
  const k = createVehicleBody('sedan', { x: e.x0, z: e.z0 + 30, yaw: 0 })
  let up = null
  k.vx = 10
  run(k, input({ throttle: 0.4 }), 1.2, { city: true }, b => {
    for (const ev of b.events) if (ev.type === 'kerb') up = up || ev
  })
  assert.ok(up && up.impact > 2, 'up the kerb')
  assert.ok(kerbDist(k.x, k.z) < 0 || k.u < 10, 'slowed')
})

test('the Roadster as a drivable body is the Roadster: stepped by its own physics, exactly', () => {
  const b = createVehicleBody('roadster', { x: OPEN.x, z: OPEN.z, yaw: 0 })
  const s = new Sim()
  s.reset('city', { x: OPEN.x, z: OPEN.z, yaw: 0 })
  const c = makeControls()
  c.fan = false
  for (let t = 0; t < 4; t += H) {
    const steer = t > 2 ? 0.5 : 0
    stepVehicle(b, input({ throttle: 1, steer }), H, { city: true })
    c.throttle = 1
    c.steer = steer
    s.step(H, c)
  }
  assert.equal(b.x, s.pos.x)
  assert.equal(b.z, s.pos.z)
  assert.equal(b.yaw, s.yaw)
})

test('a traffic car taken over is out of the AI, driven by a body, drawn where it is, and handed back', () => {
  const tr = new Traffic({ count: 30, seed: 5 })
  const park = BLOCKS.find(k => k.kind === 'park')
  const sim = new Sim()
  sim.reset('city', { x: (park.x0 + park.x1) / 2, z: (park.z0 + park.z1) / 2, yaw: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const car = tr.cars.find(c => !c.parked && !c.loose)
  const id = car.id,
    n = tr.n
  assert.equal(tr.carById(id), car)
  assert.equal(tr.takeOver(id), car)
  assert.equal(tr.n, n - 1)
  assert.ok(car.ctl === 'player' && car.parked && !car.edge, 'off the AI')
  assert.equal(tr.takeOver(id), null, 'not twice')
  const exit = tr.ejectDriver(car)
  assert.ok(tr.exits.includes(exit) && exit.jacked)
  const b = bodyFromTraffic(car)
  assert.equal(b.id, id)
  assert.equal(b.m, car.m)
  const proxy = vehicleProxy(b)
  assert.equal(proxy.mass, car.m)
  for (let t = 0; t < 2; t += H) {
    stepVehicle(b, input({ throttle: 1 }), H, { city: true })
    writeToTraffic(b, car)
    tr.step(H, sim)
  }
  assert.ok(Math.hypot(car.x - b.x, car.z - b.z) < 1e-9 && b.u > 3, 'drawn where the body is')
  assert.equal(tr.cars.includes(car), true, 'still on the map')
  tr.handBack(car)
  assert.ok(!car.ctl && car.parked && car.abandoned, 'left parked')
  // on foot, the player is someone in the road for the drivers, not a car
  const f = footProxy({ x: 0, z: 0 })
  tr.step(H, f)
  assert.ok(tr.foot && !tr.me)
})

test('a heavy truck shoves a car it hits further than a sedan does', () => {
  const shove = kind => {
    const tr = new Traffic({ count: 0 })
    const car = tr.make(0)
    car.parked = true
    car.x = 10
    car.z = 0
    tr.setYaw(car, Math.PI / 2)
    const b = createVehicleBody(kind, { x: 10 - car.wid / 2 - HANDLING[kind].len / 2 - 0.2, z: 0 })
    b.vx = 10
    for (let t = 0; t < 0.5; t += H) {
      stepVehicle(b, input({}), H)
      collideTraffic(b, tr)
      for (const c of tr.cars) if (c.loose) { c.x += c.vx * H; c.z += c.vz * H }
    }
    return { v: Math.hypot(car.vx, car.vz), loose: car.loose, dmg: car.dmg }
  }
  const s = shove('sedan'),
    t = shove('truck')
  assert.ok(s.loose && t.loose && t.dmg)
  assert.ok(t.v > s.v * 1.5, `truck ${t.v.toFixed(1)} sedan ${s.v.toFixed(1)}`)
})
