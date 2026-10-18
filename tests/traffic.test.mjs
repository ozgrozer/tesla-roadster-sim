// Headless checks of how traffic drives: every driver their own, smooth on the pedals and the
// wheel, a queue moving off in a wave, no collisions or deadlocks over a long run, and drivers
// reacting to the Roadster the way GTA's do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { makeControls, wrapPi } from '../js/sim/constants.js'
import { RED, NODES, LANES, BLOCKS, signal, holdLight } from '../js/sim/city.js'

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
// the Roadster parked in a park, out of everyone's way
function parked () {
  const sim = new Sim()
  sim.reset('city')
  const park = BLOCKS.find(k => k.kind === 'park')
  sim.pos.set((park.x0 + park.x1) / 2, 0, (park.z0 + park.z1) / 2)
  sim.syncPose()
  return sim
}
// a car of type 0 at s along lane e, moving at v
function put (tr, e, s, v = 0) {
  const car = tr.make(0)
  car.edge = e
  car.s = s
  car.v = v
  tr.insert(e, car)
  car.next = e.next.find(o => o.move === 'S') || e.next[0]
  tr.place(car)
  tr.n++
  return car
}
const idle = () => {
  const c = makeControls()
  c.fan = false
  return c
}

test('every driver is their own: speed, gap, reactions and nerve all differ', () => {
  const tr = new Traffic({ count: 0 })
  const cars = Array.from({ length: 200 }, () => tr.make(0))
  const spread = k => {
    const v = cars.map(c => c[k])
    return Math.max(...v) - Math.min(...v)
  }
  assert.ok(spread('v0') > 5, 'desired speeds from dawdlers to speeders')
  assert.ok(spread('T') > 0.6, 'following gaps')
  assert.ok(spread('react') > 0.5, 'reaction times')
  assert.ok(spread('a') > 0.8 && spread('b') > 0.8, 'pulling away and braking')
  assert.ok(cars.some(c => c.runner) && cars.some(c => !c.runner), 'amber runners')
  const fast = cars.filter(c => c.v0 > 14.7).length
  assert.ok(fast > 20 && fast < 80, `${fast} of 200 press on`)
})

test('a queue at a red moves off at the green in a wave, each a moment after the one ahead', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  // a lane far from the jam, its light held red, four cars on it
  const e = laneByPark(1)
  const node = NODES[e.to]
  holdLight(node, 1, 0) // north-south green: red for this lane
  const cars = [8, 18, 28, 38].map(s => put(tr, e, s, 8))
  for (let i = 0; i < 25 / H; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
  }
  assert.equal(signal(node, e.dir, tr.t), RED)
  for (const c of cars) assert.ok(c.v < 0.5, 'all stopped at the red')
  const lead = cars[cars.length - 1]
  const toLine = e.len - lead.s - lead.len / 2
  assert.ok(toLine > 0.2 && toLine < 3.2, `front car ${toLine.toFixed(1)} m short of the line`)
  holdLight(node, 0, tr.t) // green for it, after the other way's amber
  const t0 = tr.t
  let green = null
  const off = new Map()
  for (let i = 0; i < 12 / H; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
    if (green === null && signal(node, e.dir, tr.t) !== RED) green = tr.t
    for (const c of cars) if (!off.has(c) && c.v > 0.3) off.set(c, tr.t)
  }
  assert.ok(green > t0, 'the light changed')
  const starts = cars.slice().reverse().map(c => off.get(c))
  assert.ok(starts.every(Number.isFinite), 'everyone moved off')
  assert.ok(starts[0] - green > 0.35, `the first after ${(starts[0] - green).toFixed(2)} s`)
  for (let k = 1; k < starts.length; k++)
    assert.ok(
      starts[k] - starts[k - 1] > 0.3,
      `car ${k} ${(starts[k] - starts[k - 1]).toFixed(2)} s after the one ahead`
    )
})

test('a long run: smooth, no car through another, no red light run, no deadlock', () => {
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(sim.pos.x, sim.pos.z)
  const prev = new Map(),
    still = new Map()
  let overlaps = 0,
    jerky = 0,
    snaps = 0,
    jumps = 0,
    longest = 0,
    reds = 0
  for (let i = 0; i < 300 / H; i++) {
    const before = new Map(tr.cars.map(c => [c, c.edge]))
    // (a car driven every few steps far off catches up in one: skipped here)
    const lod = new Map(tr.cars.map(c => [c, c.lod]))
    sim.step(H, idle())
    tr.step(H, sim)
    const driving = tr.cars.filter(c => !c.parked && !c.loose)
    for (const c of driving) {
      const was = before.get(c)
      // (a police car on a call goes over on red, at a crawl once the junction is clear: that is
      // checked in calls.test.mjs)
      if (was?.road && c.edge !== was && c.edge.move && c.siren !== 1) {
        const node = NODES[was.to]
        if (signal(node, was.dir, tr.t) === RED && signal(node, was.dir, tr.t - 3) === RED) reds++
      }
      const t = c.v < 0.3 ? (still.get(c) || 0) + H : 0
      still.set(c, t)
      longest = Math.max(longest, t)
      const p = prev.get(c)
      prev.set(c, { x: c.x, z: c.z, yaw: c.yaw, v: c.v, lod: Math.max(c.lod, lod.get(c) || 1) })
      if (!p || c.lod > 1 || p.lod > 1) continue
      if (Math.abs(c.v - p.v) > 9.05 * H) jerky++ // (a speed change no brakes could make)
      if (Math.abs(wrapPi(c.yaw - p.yaw)) > 0.02) snaps++ // (2.4 rad/s: a snap)
      const most = Math.max(Math.abs(c.v), Math.abs(p.v))
      if (Math.hypot(c.x - p.x, c.z - p.z) > most * H + 0.02) jumps++
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
  assert.equal(overlaps, 0, 'no two cars drive through each other')
  assert.equal(reds, 0, 'no car enters a junction long after its light turned red')
  assert.equal(jerky, 0, 'no instant speed changes')
  assert.equal(snaps, 0, 'no snapping round')
  assert.equal(jumps, 0, 'no jumps along the road')
  assert.ok(longest < 75, `longest standstill ${longest.toFixed(0)} s`)
})

// a car in lane e at s0 driving at v, with the Roadster coming the other way straight at it
function headOn (gapM, v, myV) {
  const sim = new Sim()
  const e = LANES.find(l => !l.closed && l.dir === 0 && l.lane === 0 && NODES[l.to].ix === 8)
  sim.reset('city', { x: e.x0 + 10 + gapM, z: e.z0, yaw: Math.PI })
  sim.vel.set(-myV, 0, 0)
  sim.speed = myV
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.quiet = false
  const car = put(tr, e, 10, v)
  car.v0 = v
  return { sim, tr, car }
}

test('a Roadster coming straight at a car: its driver brakes hard, swerves and honks', () => {
  const { sim, tr, car } = headOn(55, 12, 16)
  let panic = false,
    hard = 0,
    swerve = 0,
    honks = 0
  for (let i = 0; i < 2.2 / H; i++) {
    const c = idle()
    c.throttle = 0.25
    sim.step(H, c)
    tr.step(H, sim)
    honks += sim.events.filter(e => e.type === 'honk').length
    sim.events.length = 0
    panic ||= car.panic > 0
    if (!car.loose) {
      hard = Math.min(hard, car.acc)
      swerve = Math.max(swerve, Math.abs(car.off))
    }
  }
  assert.ok(panic, 'startled')
  assert.ok(hard < -5, `brakes hard (${hard.toFixed(1)} m/s^2)`)
  assert.ok(swerve > 0.3, `swerves ${swerve.toFixed(2)} m off its line`)
  assert.ok(honks > 0, 'and leans on the horn')
})

test('a car knocked loose stops, hazards on, then steers back into its lane and drives on', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const e = laneByPark(1)
  const car = put(tr, e, 20, 10)
  // a glancing knock: sliding on, a little out of line and turned
  car.loose = true
  tr.detach(car)
  Object.assign(car, { looseT: 0, vx: 7, vz: 1.2, w: 0.25, v: 0, sig: 3, shaken: 3 })
  let hazards = 0,
    back = null
  for (let i = 0; i < 20 / H && !back; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
    if (car.loose && car.sig === 3 && Math.hypot(car.vx, car.vz) < 0.1) hazards++
    if (!car.loose && car.v > 3) back = { off: car.off, psi: car.psi }
  }
  assert.ok(hazards > 120, 'sits a while with its hazards on')
  assert.ok(back, 'drives on')
  assert.equal(car.edge, e, 'in its own lane')
  let worst = 0
  for (let i = 0; i < 6 / H; i++) {
    const yaw = car.yaw
    sim.step(H, idle())
    tr.step(H, sim)
    worst = Math.max(worst, Math.abs(wrapPi(car.yaw - yaw)))
  }
  assert.ok(Math.abs(car.off) < 0.15, `steered back onto its line (${car.off.toFixed(2)} m)`)
  assert.ok(worst < 0.02, 'without snapping round')
})

test('the Roadster landing on the road in front sends drivers onto the brakes', () => {
  const e = LANES.find(l => !l.closed && l.dir === 0 && l.lane === 1 && NODES[l.to].ix === 8)
  const sim = new Sim()
  sim.reset('city')
  const tr = new Traffic({ count: 0 })
  tr.reset(e.x0, e.z0)
  const car = put(tr, e, 5, 11)
  car.v0 = 11
  sim.setMode('air')
  sim.com.set(e.x0 + 38, 3, e.z0 + 3.5) // over the next lane, coming down
  sim.vel.set(0, -4, 0)
  sim.syncPose()
  let landed = false,
    panic = false,
    hard = 0
  for (let i = 0; i < 3 / H; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
    sim.events.length = 0
    landed ||= sim.mode === 'ground'
    if (landed) {
      panic ||= car.panic > 0
      hard = Math.min(hard, car.acc)
    }
  }
  assert.ok(landed, 'it came down')
  assert.ok(panic, 'the driver in front panics')
  assert.ok(hard < -4, `and brakes hard (${hard.toFixed(1)})`)
})
