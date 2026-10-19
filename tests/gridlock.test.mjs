// The traffic's last resorts and its moods (handover.js): a queue behind something that will never
// move is cleared, nobody runs down the player standing in the road (they stop and honk), a knock
// makes a driver angry for a while, drivers drive in their styles, and downtown is busier than the
// estates. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { footProxy } from '../js/sim/vehicleLink.js'
import { STYLE } from '../js/sim/handover.js'
import { makeControls } from '../js/sim/constants.js'
import { LANES, BLOCKS } from '../js/sim/city.js'

const H = 1 / 120
const PARK = BLOCKS.find(k => k.kind === 'park')
const laneByPark = l =>
  LANES.find(
    e => !e.closed && e.dir === 0 && e.lane === l && Math.abs(e.z0 - PARK.z0) < 12 &&
      e.x0 < PARK.x1 && e.x0 + e.len > PARK.x0
  )
function parked () {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set((PARK.x0 + PARK.x1) / 2, 0, (PARK.z0 + PARK.z1) / 2)
  sim.syncPose()
  return sim
}
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
const idle = () => Object.assign(makeControls(), { fan: false })

test('a queue behind a blockage that never clears is not left there: edged past, or taken off out of sight', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const e = laneByPark(1)
  // two wrecks across both lanes, never towed
  const wrecks = [e, e.twin].map(l => {
    const w = put(tr, l, 70, 0)
    tr.detach(w)
    tr.n--
    Object.assign(w, { loose: true, looseT: 0, vx: 0, vz: 0, w: 0, sig: 3, shaken: 1e9 })
    return w
  })
  const queue = [put(tr, e, 40, 0), put(tr, e, 30, 0), put(tr, e.twin, 40, 0)]
  let worst = 0
  for (let i = 0; i < 45 / H; i++) {
    for (const w of wrecks) w.looseT = 0
    sim.step(H, idle())
    tr.step(H, sim)
    for (const c of queue) if (tr.cars.includes(c)) worst = Math.max(worst, c.stuck)
  }
  const left = queue.filter(c => tr.cars.includes(c) && c.stuck > 1)
  assert.equal(left.length, 0, `${left.length} still stuck behind it`)
  assert.ok(worst < 30, `stuck at most ${worst.toFixed(0)} s`)
})

test('the player on foot in the lane: the driver stops short of them and honks', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.quiet = false
  const e = laneByPark(1)
  const car = put(tr, e, 10, 12)
  const me = footProxy({ x: e.x0 + e.dx * 50, z: e.z0 + e.dz * 50 })
  let honks = 0,
    closest = Infinity
  for (let i = 0; i < 15 / H; i++) {
    tr.step(H, me)
    honks += me.events.filter(v => v.type === 'honk').length
    me.events.length = 0
    closest = Math.min(closest, Math.hypot(car.x - me.pos.x, car.z - me.pos.z) - car.len / 2)
  }
  assert.ok(closest > 0.8, `stopped ${closest.toFixed(2)} m short`)
  assert.ok(car.v < 0.2, 'waiting')
  assert.ok(honks > 0, 'and honking')
})

test('a knock makes a driver angry a while: quicker, closer, on the horn; then they calm down', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const car = put(tr, laneByPark(1), 10, 10)
  const v0 = car.v0,
    T = car.T
  tr.anger(car, 8)
  tr.step(H, sim)
  assert.ok(car.v0 > v0 * 1.2 && car.T < T, 'angry')
  for (let i = 0; i < 40 / H; i++) tr.step(H, sim)
  assert.ok(Math.abs(car.v0 - v0) < 1e-6 && Math.abs(car.T - T) < 1e-6, 'calmed down')
})

test('drivers drive in styles, and downtown is busier than the estates', () => {
  const tr = new Traffic({ count: 100 })
  const cars = Array.from({ length: 300 }, () => tr.make(0))
  for (const s of Object.values(STYLE)) assert.ok(cars.some(c => c.style === s), `style ${s}`)
  const aggr = cars.filter(c => c.style === STYLE.aggressive),
    calm = cars.filter(c => c.style === STYLE.cautious)
  const mean = (l, k) => l.reduce((a, c) => a + c[k], 0) / l.length
  assert.ok(mean(aggr, 'T') < mean(calm, 'T') && mean(aggr, 'v0') > mean(calm, 'v0'))
  tr.districts = true
  assert.ok(tr.areaShare(400, 0) > tr.areaShare(-150, -400), 'downtown over Beverly Hills')
  tr.districts = false
  assert.equal(tr.areaShare(400, 0), 1)
})
