// Headless checks of damage, GTA-style: a hit crumples a car on the side it lands on, the harder
// the deeper; it breaks the lamps on that side; a wreck stays where it stops, smoking, while its
// driver climbs out and traffic goes round it; a car put back in its place is as good as new, and
// a wreck out of sight is towed; and the Roadster's own lamps break, and are mended, while it
// drives on as ever.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Peds } from '../js/sim/peds.js'
import { Traffic } from '../js/sim/traffic.js'
import { kerbDist } from '../js/sim/street.js'
import { makeControls } from '../js/sim/constants.js'
import { rectRect, carRect, carFrame } from '../js/sim/collide.js'
import { Wear, LAMPS, PANE, paneOf, BROKE, hurt } from '../js/sim/carDamage.js'
import { LANES, BLOCKS, STALLS } from '../js/sim/city.js'
import * as THREE from 'three'

const H = 1 / 120
const PARK = BLOCKS.find(k => k.kind === 'park')
// an eastbound lane (in lane l) on the street along the park's north side
const laneByPark = l =>
  LANES.find(
    e =>
      !e.closed &&
      e.dir === 0 &&
      e.lane === l &&
      Math.abs(e.z0 - PARK.z0) < 12 &&
      e.x0 < PARK.x1 &&
      e.x0 + e.len > PARK.x0
  )
const coast = () => {
  const c = makeControls()
  c.fan = false
  return c
}
// the Roadster parked in the park, out of everyone's way
const MID = { x: (PARK.x0 + PARK.x1) / 2, z: (PARK.z0 + PARK.z1) / 2, yaw: 0 }
function parked () {
  const sim = new Sim()
  sim.reset('city', MID)
  return sim
}
// a car of type ty standing still on the street at (x, z), heading yaw (one of the gridlock's,
// so it stays put until it is hit)
function standing (tr, x, z, yaw, ty = 0) {
  const car = tr.make(ty, false)
  car.parked = car.jam = true
  car.x = car.homeX = x
  car.z = car.homeZ = z
  tr.setYaw(car, (car.homeYaw = yaw))
  return car
}
// a car of type ty at s along lane e, moving at v, going straight on
function put (tr, e, s, v = 0, ty = 0) {
  const car = tr.make(ty)
  car.edge = e
  car.s = s
  car.v = v
  tr.insert(e, car)
  car.next = e.next.find(o => o.move === 'S') || e.next[0]
  tr.place(car)
  tr.n++
  return car
}
// the Roadster driven at car, at v m/s, into spot: 'nose', 'tail', 'right', 'left' (its flanks),
// 'fl' (the front left corner) or 'rr' (the rear right); the bump events it made back
function ram (sim, tr, car, spot, v, secs = 2) {
  const L = car.len / 2,
    W = car.wid / 2,
    hx = car.hx,
    hz = car.hz
  // (from the car's frame: a along it, b to its right; a run-up of 5 m)
  const dir = (a, b) => [hx * a - hz * b, hz * a + hx * b]
  const at = (a, b) => [car.x + dir(a, b)[0], car.z + dir(a, b)[1]]
  const ways = {
    nose: [at(L + 5, 0), dir(-1, 0)],
    tail: [at(-L - 5, 0), dir(1, 0)],
    right: [at(0.3, W + 4.5), dir(0, -1)],
    left: [at(0.3, -W - 4.5), dir(0, 1)],
    fl: [at(L + 4.5, -W - 1.7), dir(-0.94, 0.34)],
    rr: [at(-L - 4.5, W + 1.7), dir(0.94, -0.34)]
  }
  const [[x, z], [dx, dz]] = ways[spot]
  const l = Math.hypot(dx, dz)
  sim.reset('city', { x, z, yaw: Math.atan2(-dz / l, dx / l) })
  sim.vel.set((dx / l) * v, 0, (dz / l) * v)
  sim.speed = v
  sim.syncPose()
  const bumps = []
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, coast())
    tr.step(H, sim)
    bumps.push(...sim.events.filter(e => e.type === 'bump'))
    sim.events.length = 0
  }
  return bumps
}
// a street away from the traffic, the city reset round it, and a car standing on it across the
// road (side hits) or along it
function scene (across = false) {
  const e = laneByPark(1)
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const x = e.x0 + e.dx * 60,
    z = e.z0 + e.dz * 60 - (across ? 3.5 : 0)
  const car = standing(tr, x, z, across ? Math.PI / 2 : Math.atan2(-e.dz, e.dx))
  return { sim, tr, car }
}
const NOSE = [0, 1, 2],
  RIGHT = [3, 4, 5],
  TAIL = [6, 7, 8],
  LEFT = [9, 10, 11]
const most = (d, zones) => Math.max(...zones.map(k => d[k]))

test('a hit crumples a car where it lands, nose, tail, flanks or corner, the harder the deeper', () => {
  for (const [spot, hit, clean] of [
    ['nose', NOSE, [...TAIL, 4, 10]],
    ['tail', TAIL, [...NOSE, 4, 10]],
    ['right', RIGHT, [...LEFT, 1, 7]],
    ['left', LEFT, [...RIGHT, 1, 7]],
    ['fl', [0], [...RIGHT, ...TAIL]]
  ]) {
    const across = spot === 'right' || spot === 'left'
    const { sim, tr, car } = scene(across)
    ram(sim, tr, car, spot, 9)
    const d = car.dmg?.dents
    assert.ok(d, `${spot}: damaged`)
    assert.ok(
      most(d, hit) > 0.08,
      `${spot}: crumpled ${most(d, hit).toFixed(3)} m`
    )
    assert.ok(
      most(d, clean) < 0.01,
      `${spot}: nothing elsewhere (${most(d, clean).toFixed(3)} m)`
    )
  }
  // (and harder, deeper: the same hit at 5 m/s and at 14)
  const soft = scene(),
    hard = scene()
  ram(soft.sim, soft.tr, soft.car, 'nose', 5)
  ram(hard.sim, hard.tr, hard.car, 'nose', 14)
  const a = soft.car.dmg.dents[1],
    b = hard.car.dmg.dents[1]
  assert.ok(
    b > a * 2.2,
    `deeper: ${a.toFixed(3)} m at 5 m/s, ${b.toFixed(3)} m at 14 m/s`
  )
  assert.ok(hard.car.dmg.harm > soft.car.dmg.harm * 3, 'and more harm done')
})

test('a hard hit breaks the lamps on the side it lands, and the glass of that face', () => {
  const lamps = (spot, v, across = false) => {
    const { sim, tr, car } = scene(across)
    ram(sim, tr, car, spot, v)
    return car.dmg
  }
  assert.equal(
    lamps('fl', 9).lamps,
    LAMPS.FL,
    'the front left corner: its headlight'
  )
  assert.equal(lamps('rr', 9).lamps, LAMPS.RR, 'the rear right: its tail light')
  assert.equal(lamps('nose', 4).lamps, 0, 'a gentle nudge on the nose: none')
  assert.equal(lamps('nose', 13).lamps, LAMPS.FL | LAMPS.FR, 'a hard one: both')
  assert.equal(lamps('right', 13, true).lamps, 0, 'the middle of a flank: none')
  const D = lamps('right', 13, true)
  assert.ok(paneOf(D, PANE.right) > 0, 'its side windows crazed')
  assert.equal(paneOf(D, PANE.left), 0, 'the far side whole')
  assert.ok(
    paneOf(lamps('nose', 13), PANE.front) > 0,
    'a hard hit on the nose: the windscreen'
  )
})

test('a wreck stays where it stops, smoking, its driver gets out, and traffic goes round it', () => {
  const e = laneByPark(1)
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ count: 0 })
  peds.reset(sim.pos.x, sim.pos.z)
  const car = put(tr, e, 60, 0)
  car.v0 = 0
  const bumps = ram(sim, tr, car, 'tail', 19, 3)
  assert.ok(
    bumps.some(b => b.broke & BROKE.wreck),
    'wrecked by the hit'
  )
  // (the Roadster back in the park, and the wreck where it would block one lane, turned a little
  // across it, as the giveway tests have one: thrown across both, it would block the street until
  // it was towed, as nobody goes round on the wrong side of the road)
  sim.reset('city', MID)
  car.x = e.x0 + e.dx * 60
  car.z = e.z0 + e.dz * 60
  car.vx = car.vz = car.w = 0
  tr.setYaw(car, Math.atan2(-e.dz, e.dx) + 0.3)
  // (nobody else is out on foot but a street performer at their spot (living/pedLife.js gather):
  // anyone else who turns up is its driver, and where)
  let out = null,
    door = null
  const look = () => {
    out ||= peds.list.find(p => !p.liv?.perf)
    door ||= out && Math.hypot(out.x - car.x, out.z - car.z)
  }
  for (let i = 0; i < 4 / H; i++) {
    sim.step(H, coast())
    peds.step(H, sim, tr)
    tr.step(H, sim)
    sim.events.length = 0
    look()
  }
  assert.ok(car.loose && car.dmg.wreck, 'a wreck')
  const rest = { x: car.x, z: car.z, yaw: car.yaw }
  // traffic coming up behind it, along its lane, watched from behind it (in sight, it isn't towed)
  const cars = [10, 22].map(s => put(tr, e, s, 9))
  const view = {
    x: car.x - e.dx * 40,
    z: car.z - e.dz * 40,
    fx: e.dx,
    fz: e.dz
  }
  let overlaps = 0
  for (let i = 0; i < 60 / H; i++) {
    sim.step(H, coast())
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
    look()
    if (i % 30) continue
    for (const a of [car, ...cars])
      for (const b of tr.cars)
        if (a !== b && Math.abs(a.x - b.x) < 14 && Math.abs(a.z - b.z) < 14)
          if (rectRect({ ...carRect(a) }, carRect(b))?.depth > 0.3) overlaps++
  }
  assert.ok(
    Math.hypot(car.x - rest.x, car.z - rest.z) < 0.05,
    'it stayed where it stopped'
  )
  assert.ok(car.loose && !car.edge?.cars.includes(car), 'nobody drives it away')
  assert.equal(car.sig, 3, 'its hazards on')
  assert.equal(car.dmg.smoke, 2, 'smoking')
  assert.ok(
    out && door < 2.5,
    `its driver climbed out (${door?.toFixed(1)} m from it)`
  )
  assert.ok(
    kerbDist(out.x, out.z) < 0 && out.state === 'walk',
    'and walked off to the pavement'
  )
  for (const c of cars) {
    const along = (c.x - car.x) * e.dx + (c.z - car.z) * e.dz
    assert.ok(
      along > 5,
      `car #${c.id} got round it (${along.toFixed(1)} m past)`
    )
    assert.ok(!c.loose && !c.dmg, `#${c.id} untouched`)
  }
  assert.equal(overlaps, 0, 'no car through another')
})

test('a damaged car drives on, slower; a wreck out of sight is towed, a parked one put back new', () => {
  // (a knock that leaves it running: it drives on at less than its own pace)
  const { sim, tr, car } = (() => {
    const e = laneByPark(1)
    const sim = parked()
    const tr = new Traffic({ count: 0 })
    tr.reset(sim.pos.x, sim.pos.z)
    return { sim, tr, car: put(tr, e, 30, 0) }
  })()
  car.v0 = 12
  ram(sim, tr, car, 'tail', 7, 1.5)
  sim.reset('city', MID)
  assert.ok(
    car.dmg && !car.dmg.wreck && car.dmg.limp < 0.95,
    'damaged, not wrecked'
  )
  let top = 0
  for (let i = 0; i < 30 / H; i++) {
    sim.step(H, coast())
    tr.step(H, sim)
    sim.events.length = 0
    if (!car.loose) top = Math.max(top, car.v)
  }
  assert.ok(top > 3, `it drove on (${top.toFixed(1)} m/s)`)
  assert.ok(
    top < 12 * car.dmg.limp + 0.3,
    `slower than its own pace (${top.toFixed(1)} m/s)`
  )
  // a wreck left out of sight is towed after a while; a parked car knocked out of its place and
  // wrecked is put back in it, as good as new, once nobody can see it go
  const wreck = put(tr, laneByPark(1), 100, 0)
  wreck.v0 = 0
  ram(sim, tr, wreck, 'tail', 19)
  const st = STALLS.find(
    s => s.taken && Math.hypot(s.x - wreck.x, s.z - wreck.z) < 200
  )
  const lot = tr.cars.find(
    c => c.parked && !c.jam && c.homeX === st.x && c.homeZ === st.z
  )
  ram(sim, tr, lot, 'right', 19)
  assert.ok(wreck.dmg.wreck && lot.dmg.wreck && lot.loose, 'both wrecked')
  sim.reset('city', { x: wreck.x + 400, z: wreck.z, yaw: 0 })
  let towed = null,
    back = null
  for (let i = 0; i < 50 / H; i++) {
    sim.step(H, coast())
    tr.step(H, sim)
    sim.events.length = 0
    if (towed === null && !tr.cars.includes(wreck)) towed = tr.t
    if (back === null && !lot.loose) back = tr.t
  }
  assert.ok(
    towed - 6 > 20,
    `the wreck towed, a while out of sight (${towed?.toFixed(0)} s)`
  )
  assert.ok(back - 6 > 20, `the parked one put back (${back?.toFixed(0)} s)`)
  assert.equal(lot.dmg, null, 'as good as new')
  assert.ok(Math.hypot(lot.x - st.x, lot.z - st.z) < 0.01, 'in its own space')
})

test("every new car is whole, and damage draws nothing from the traffic's random numbers", () => {
  // the same city twice (one after the other: they share the streets), the parked cars in one
  // dented, lamps, glass and all: the same traffic after, in both
  const run = dent => {
    const sim = parked()
    const tr = new Traffic({ count: 110, seed: 7 })
    tr.reset(sim.pos.x, sim.pos.z)
    assert.ok(
      tr.cars.every(c => c.dmg === null),
      'all of them whole'
    )
    if (dent)
      for (const c of tr.cars.filter(c => c.parked && !c.jam))
        hurt(c, c.x + c.hx * c.len * 0.5, c.z + c.hz * c.len * 0.5, 15, 2200, 0)
    for (let i = 0; i < 10 / H; i++) {
      sim.step(H, coast())
      tr.step(H, sim)
    }
    assert.ok(!dent || tr.cars.some(c => c.dmg?.lamps), 'damaged')
    return { at: tr.cars.map(c => [c.x, c.z]), next: tr.R() }
  }
  const a = run(true),
    b = run(false)
  assert.deepEqual(a.at, b.at, 'every car where it is in the other')
  assert.equal(a.next, b.next, 'and the same random numbers next')
})

test("the Roadster's lamps break on the side it hits, its glass crazes, and a reset mends them", () => {
  const { sim, tr, car } = scene()
  const bus = standing(
    tr,
    car.x + car.hx * 30,
    car.z + car.hz * 30,
    car.yaw,
    tr.bus
  )
  const wear = new Wear()
  const frame = { l: new THREE.Vector3(), n: new THREE.Vector3() }
  // (each knock into the Roadster's frame and onto its wear, as damage.js does)
  const knock = bumps => {
    for (const e of bumps) {
      carFrame(sim, e.px, e.pz, e.nx, e.nz, frame)
      wear.hit(frame.l.x, frame.l.z, e.impact, sim.time)
    }
  }
  // square into a car's flank at about 30 km/h: no harder than the middle of its nose takes
  knock(ram(sim, tr, car, 'right', 8.5))
  assert.equal(wear.lamps, 0, 'the lamps whole')
  // nose first into the bus, hard
  knock(ram(sim, tr, bus, 'tail', 14))
  const front = LAMPS.FL | LAMPS.FR
  assert.equal(wear.lamps & front, front, 'both headlights')
  assert.equal(wear.lamps & ~front, 0, 'its tail lights whole')
  assert.ok(paneOf(wear, PANE.front) > 0, 'its windscreen crazed')
  // and it drives on as ever (moved out from behind the bus, as it was)
  assert.equal(sim.mode, 'ground')
  sim.pos.x -= bus.hz * 4
  sim.pos.z += bus.hx * 4
  sim.syncPose()
  const go = coast()
  go.throttle = 1
  const v = sim.speed
  for (let i = 0; i < 2 / H; i++) sim.step(H, go)
  assert.ok(
    sim.speed > v + 8,
    `drivable (${sim.speed.toFixed(1)} m/s after 2 s)`
  )
  wear.repair()
  assert.equal(wear.lamps, 0, 'a reset mends the lamps')
  assert.equal(wear.glass, 0, 'and the glass')
})

test('a wreck across both lanes, in sight, is gone round on the wrong side of the road', () => {
  // (square across the street's two lanes one way, between them, nobody knocked into it since)
  const e = laneByPark(1),
    e0 = laneByPark(0)
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const wreck = put(tr, e, 50)
  tr.detach(wreck)
  wreck.x = (e.x0 + e0.x0) / 2 + e.dx * 50
  wreck.z = (e.z0 + e0.z0) / 2 + e.dz * 50
  tr.setYaw(wreck, Math.atan2(-e.dz, e.dx) + Math.PI / 2)
  Object.assign(wreck, { loose: true, looseT: 5, vx: 0, vz: 0, w: 0, sig: 3 })
  hurt(wreck, wreck.x + wreck.hx * 2.4, wreck.z + wreck.hz * 2.4, 22, null, 0)
  assert.ok(wreck.dmg.wreck, 'a wreck')
  // two coming up in the kerb lane, one in the inner lane, watched from behind it all along
  const cars = [put(tr, e, 10, 8), put(tr, e, 25, 8), put(tr, e0, 15, 8)]
  const view = { x: wreck.x - e.dx * 40, z: wreck.z - e.dz * 40 }
  Object.assign(view, { fx: e.dx, fz: e.dz })
  const by = cars.map(() => null)
  let overlaps = 0,
    wrong = 0
  for (let i = 0; i < 60 / H; i++) {
    sim.step(H, coast())
    tr.step(H, sim, view)
    sim.events.length = 0
    cars.forEach((c, k) => {
      const past = (c.x - wreck.x) * e.dx + (c.z - wreck.z) * e.dz
      if (by[k] === null && past > 5) by[k] = tr.t
      if (c.off < -2) wrong++
    })
    if (i % 15) continue
    for (const a of [wreck, ...cars])
      for (const b of tr.cars)
        if (a !== b && Math.abs(a.x - b.x) < 14 && Math.abs(a.z - b.z) < 14)
          if (rectRect({ ...carRect(a) }, carRect(b))?.depth > 0.05) overlaps++
  }
  assert.ok(tr.cars.includes(wreck) && wreck.loose, 'the wreck still there')
  for (const [k, t] of by.entries())
    assert.ok(t !== null && t < 45, `car ${k} got round (${t?.toFixed(1)} s)`)
  assert.ok(wrong > 0, 'on the wrong side of the road')
  assert.equal(overlaps, 0, 'no car through another, or through the wreck')
  assert.ok(
    cars.every(c => !c.loose && !c.dmg),
    'nobody knocked into'
  )
})

test("a wreck's driver climbing out draws nothing from the people's own random numbers", () => {
  // (the same people twice: one with a driver out of a wreck among them, one without)
  const sim = parked()
  const run = out => {
    const peds = new Peds({ count: 40 })
    peds.reset(sim.pos.x, sim.pos.z)
    const n = peds.list.length
    if (out) {
      const e = laneByPark(1)
      peds.alight({ exits: [{ x: e.x0 + 40, z: e.z0 + 1.5, ox: 0, oz: 1 }] })
      assert.equal(peds.list.length, n + 1, 'the driver is out')
      assert.equal(peds.list[n].state, 'back', 'hurrying off')
    }
    return [peds.R(), peds.Q(), peds.R()]
  }
  assert.deepEqual(run(true), run(false))
})

test('a box truck knocked loose while it delivers has its stop called off', () => {
  // (the drivers behind take a truck stopped to deliver for a stop that will end, and a car knocked
  // loose, or a wreck, for one that won't: drivers.js, react.js)
  const e = laneByPark(1)
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const car = put(tr, e, 60, 0, tr.idx.truck)
  car.v0 = 0
  car.drop = { k: 2, s: 60, t: 5, stay: 90, e, door: 1, since: 0 }
  ram(sim, tr, car, 'tail', 19, 3)
  assert.ok(car.loose && car.dmg, 'knocked loose and dented')
  assert.equal(car.drop.k, 0, 'its delivery stop is off')
})
