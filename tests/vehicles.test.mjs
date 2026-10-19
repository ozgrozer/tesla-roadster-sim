// Headless checks of the city's own vehicles (fleet.js, delivery.js, calls.js, responder.js,
// render/carRide.js): they draw on random numbers of their own, so the traffic's own sequence is
// as it was; about two vans in five are box trucks, the lowriders are mostly in Mid-City and the
// south, the limousines in Beverly Hills and Hollywood; a box truck double-parks to deliver, its
// hazards on and its door up, the traffic goes round it and it drives on; an ambulance and a fire
// engine each drive their run and get there, an ambulance's siren going to its hi-lo and a fire
// engine blowing its air horn at the junctions; and a lowrider at the lights hops on its
// hydraulics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic, TYPES } from '../js/sim/traffic.js'
import { IDX } from '../js/sim/carTypes.js'
import { areaOf } from '../js/sim/areas.js'
import { N, PITCH } from '../js/sim/grid.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { makeControls } from '../js/sim/constants.js'
import { RED, NODES, LANES, BLOCKS, signal, holdLight } from '../js/sim/city.js'
import { ride, RIDE_DT } from '../js/render/carRide.js'

const H = 1 / 120
const PARK = BLOCKS.find(k => k.kind === 'park')
// the Roadster parked in a park, out of everyone's way
function parked () {
  const sim = new Sim()
  sim.reset('city')
  sim.pos.set((PARK.x0 + PARK.x1) / 2, 0, (PARK.z0 + PARK.z1) / 2)
  sim.syncPose()
  return sim
}
const idle = () => {
  const c = makeControls()
  c.fan = false
  return c
}
// the traffic for secs, each(i) after every step (false stops it)
function run (sim, tr, secs, each) {
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, idle())
    tr.step(H, sim)
    sim.events.length = 0
    if (each?.(i) === false) return
  }
}
// two cars driving through each other (more than 0.3 m deep), among those on the road
function overlaps (tr) {
  const d = tr.cars.filter(c => !c.parked && !c.loose)
  let n = 0
  for (let j = 0; j < d.length; j++)
    for (let k = j + 1; k < d.length; k++) {
      const a = d[j],
        b = d[k]
      if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14) continue
      if (rectRect({ ...carRect(a) }, carRect(b))?.depth > 0.3) n++
    }
  return n
}
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
// a car of type at s along lane e, moving at v, going straight on at the end
function put (tr, e, s, v, type = 0) {
  const car = tr.make(type)
  car.edge = e
  car.s = s
  car.v = v
  tr.insert(e, car)
  car.next = e.next.find(o => o.move === 'S')
  tr.place(car)
  tr.n++
  return car
}
// the traffic's own random numbers, counted
function counted (tr) {
  const R = tr.R
  tr.draws = 0
  tr.R = () => {
    tr.draws++
    return R()
  }
  return tr
}

test('the city’s own vehicles draw on random numbers of their own: the traffic’s sequence is as it was', () => {
  const sim = parked()
  const make = own => {
    const tr = counted(new Traffic({ count: 110, radius: 300, seed: 7 }))
    if (!own) tr.fleet = t => t // (the swaps off)
    tr.reset(sim.pos.x, sim.pos.z)
    return tr
  }
  const a = make(false),
    b = make(true)
  assert.equal(b.draws, a.draws, 'as many of the traffic’s own drawn')
  assert.equal(b.cars.length, a.cars.length)
  const swaps = {}
  for (let i = 0; i < a.cars.length; i++) {
    const p = a.cars[i],
      q = b.cars[i]
    assert.ok(
      p.x === q.x && p.z === q.z && p.paint === q.paint,
      'each car where it was'
    )
    if (p.type === q.type) continue
    const k = TYPES[p.type].name + '>' + TYPES[q.type].name
    swaps[k] = (swaps[k] || 0) + 1
  }
  for (const k of Object.keys(swaps))
    assert.ok(
      ['van>truck', 'sedan>lowrider', 'sedan>limo'].includes(k),
      `only the city’s own swapped in (${k})`
    )
  assert.ok(swaps['van>truck'] > 0, 'box trucks among them')
  // (and the next of a run's own random numbers is the same whichever kind goes)
  const k = [0, 1, 2].map(kind => {
    const tr = new Traffic({ count: 0, seed: 7 })
    tr.call.force = kind
    return tr.call.R()
  })
  assert.ok(k[0] === k[1] && k[1] === k[2], 'the kind keeps to its own numbers')
})

test('about two vans in five are box trucks; lowriders mostly in Mid-City and the south, limousines in Beverly Hills and Hollywood', () => {
  const tr = new Traffic({ count: 0, seed: 3 })
  // the middle of block (bx, bz)
  const at = b => (b - N / 2 + 0.5) * PITCH
  const n = 4000
  let trucks = 0
  for (let i = 0; i < n; i++)
    if (tr.fleet(IDX.van, 0, 0) === IDX.truck) trucks++
  const pc = ((trucks / n) * 100).toFixed(0)
  assert.ok(Math.abs(trucks / n - 0.4) < 0.03, `${pc}% of vans`)
  const share = {}
  for (let bz = 0; bz < N; bz++)
    for (let bx = 0; bx < N; bx++) {
      const area = areaOf(bx, bz),
        s = (share[area] ||= { low: 0, limo: 0, n: 0 })
      for (let i = 0; i < 400; i++) {
        const t = tr.fleet(IDX.sedan, at(bx), at(bz))
        if (t === IDX.lowrider) s.low++
        if (t === IDX.limo) s.limo++
        s.n++
      }
    }
  const pct = (a, k) => share[a][k] / share[a].n
  assert.ok(pct('midCity', 'low') > 0.1, 'lowriders in Mid-City')
  assert.ok(
    pct('midCity', 'low') > 5 * pct('beverlyHills', 'low'),
    'few in Beverly Hills'
  )
  assert.ok(pct('beverlyHills', 'limo') > 0.06, 'limousines in Beverly Hills')
  assert.ok(pct('hollywood', 'limo') > 0.05, 'and Hollywood')
  assert.ok(
    pct('beverlyHills', 'limo') > 10 * pct('midCity', 'limo'),
    'hardly any in Mid-City'
  )
  for (const T of ['ambulance', 'fire', 'truck', 'lowrider', 'limo'])
    assert.equal(TYPES[IDX[T]].share, 0, `${T} never drawn as an everyday type`)
  // (in a lot, what won't fit a space parks as a sedan, a box truck as a van)
  assert.equal(tr.lotType(IDX.fire), 0)
  assert.equal(tr.lotType(IDX.limo), 0)
  assert.equal(tr.lotType(IDX.truck), IDX.van)
  assert.equal(tr.lotType(IDX.lowrider), IDX.lowrider)
})

test('a box truck double-parks to deliver: signals, pulls in, hazards on and door up, then drives on; the traffic goes round it', () => {
  const e = laneByPark(1)
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  holdLight(NODES[e.from], 0, 0)
  holdLight(NODES[e.to], 0, 0)
  tr.dropR = () => 0.1 // (it stops on this block)
  const truck = put(tr, e, 12, 8, IDX.truck)
  truck.drop = { k: 0, s: 0, t: 0, stay: 0, e: null, door: 0, since: 999 }
  const behind = [put(tr, e, 2, 7), put(tr, laneByPark(0), 2, 7)]
  let stopped = null,
    left = null,
    sig = false,
    hazard = false,
    door = 0,
    off = 0,
    touched = 0,
    longest = 0
  const still = new Map()
  run(sim, tr, 120, i => {
    const d = truck.drop
    if (d.k === 1 && truck.sig === 2) sig = true
    if (d.k === 2) {
      stopped ??= tr.t
      if (truck.sig === 3) hazard = true
    }
    if (stopped !== null && d.k === 0 && left === null) left = tr.t
    door = Math.max(door, d.door)
    off = Math.max(off, truck.off)
    if (i % 30 === 0) touched += overlaps(tr)
    for (const c of behind) {
      const t = c.v < 0.3 ? (still.get(c) || 0) + H : 0
      still.set(c, t)
      longest = Math.max(longest, t)
    }
    return left === null || tr.t < left + 5
  })
  NODES[e.from].hold = NODES[e.to].hold = null
  assert.ok(sig, 'signals in towards the kerb')
  assert.ok(stopped !== null, 'stops')
  assert.ok(off > 0.1, `in towards the kerb (${off.toFixed(2)} m)`)
  assert.ok(hazard, 'its hazards on')
  assert.ok(door > 0.99, 'its door run up')
  assert.ok(left !== null && left - stopped > 50, 'a minute later it goes')
  assert.equal(truck.drop.door, 0, 'its door down')
  assert.ok(truck.v > 3 && truck.edge, 'and drives on')
  for (const c of behind) {
    const ahead = (c.x - truck.x) * e.dx + (c.z - truck.z) * e.dz
    assert.ok(c.edge !== e || ahead > 0, 'those behind went round it')
  }
  assert.ok(longest < 20, `nobody held up long (${longest.toFixed(0)} s)`)
  assert.equal(touched, 0, 'without touching it')
})

test('over a long run every delivery stop ends, and nobody waits long behind one', () => {
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(sim.pos.x, sim.pos.z)
  const stops = new Map(),
    still = new Map()
  let longest = 0,
    overlap = 0
  run(sim, tr, 400, i => {
    for (const c of tr.cars) {
      if (c.parked || c.loose) continue
      if (c.drop?.k > 1) stops.set(c, (stops.get(c) || 0) + H)
      else if (stops.has(c) && !c.drop?.k) stops.set(c, -1) // (over)
      const t = c.v < 0.3 && c.blk?.drop?.k > 1 ? (still.get(c) || 0) + H : 0
      still.set(c, t)
      longest = Math.max(longest, t)
    }
    if (i % 60 === 0) overlap += overlaps(tr)
  })
  const ends = [...stops.values()]
  assert.ok(ends.length > 0, 'box trucks made deliveries')
  assert.ok(ends.every(t => t < 135), 'none stopped longer than its stay')
  assert.ok(longest < 30, `the longest wait behind one ${longest.toFixed(0)} s`)
  assert.equal(overlap, 0, 'no two cars through each other')
})

test('an ambulance and a fire engine each drive their run, over a red only at a crawl, and get there', () => {
  for (const [kind, name, most] of [
    [1, 'ambulance', 19.4],
    [2, 'fire', 16.7]
  ]) {
    const sim = parked()
    const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
    tr.reset(sim.pos.x, sim.pos.z)
    tr.call.next = 3
    tr.call.force = kind
    let car = null,
      dest = -1,
      top = 0,
      slow = Infinity,
      was = null,
      end = null,
      overlap = 0
    const reds = [],
      modes = new Set()
    run(sim, tr, 220, i => {
      if (!car && tr.call.car) {
        car = tr.call.car
        dest = tr.call.dest
      }
      if (i % 30 === 0) overlap += overlaps(tr)
      if (!car) return
      if (car.siren !== 1) {
        end ??= { t: tr.t, edge: car.edge }
        return false
      }
      modes.add(tr.call.mode)
      top = Math.max(top, car.v)
      const e = car.edge
      if (e.road && e.len - car.s - car.len / 2 < 4)
        slow = Math.min(slow, car.v)
      if (was?.road && e.move) {
        if (signal(NODES[was.to], was.dir, tr.t) === RED) reds.push(slow)
        slow = Infinity
      }
      was = e
    })
    assert.equal(TYPES[car.type].name, name)
    assert.ok(end.edge.move && end.edge.node === dest, `the ${name} got there`)
    const kmh = (top * 3.6).toFixed(0)
    assert.ok(top > most * 0.6 && top < most * 1.03, `up to ${kmh} km/h`)
    for (const v of reds)
      assert.ok(v < 3, `over a red at a crawl (${v.toFixed(1)} m/s)`)
    assert.equal(overlap, 0, 'no two cars through each other')
    if (kind === 1) assert.ok(modes.has(2), 'its siren goes to its hi-lo')
    else {
      const n = tr.call.horns
      assert.ok(n >= 6, `its air horn at the junctions (${n})`)
      assert.equal(tr.call.horns % 3, 0, 'a long blast and two short each time')
    }
  }
})

test('of the calls, about two in five go to the police, a third to an ambulance, the rest a fire engine', () => {
  const tr = new Traffic({ count: 0, seed: 11 })
  const n = [0, 0, 0]
  for (let i = 0; i < 3000; i++) n[tr.callKind()]++
  assert.ok(Math.abs(n[0] / 3000 - 0.4) < 0.03, `police ${n[0]}`)
  assert.ok(Math.abs(n[1] / 3000 - 0.35) < 0.03, `ambulances ${n[1]}`)
  assert.ok(Math.abs(n[2] / 3000 - 0.25) < 0.03, `fire engines ${n[2]}`)
})

test('a lowrider stopped at the lights, about half of them, hops on its hydraulics; on the move it rides low', () => {
  const tr = new Traffic({ count: 0, seed: 3 })
  const S = { axles: [1.6, -1.5], track: 0.8 }
  RIDE_DT.dt = 1 / 60
  // the most its body rises, over secs standing (or moving at v)
  const lift = (type, paint, v, secs) => {
    const car = tr.make(type)
    car.paint = paint
    car.v = v
    let most = 0
    for (let t = 0; t < secs; t += 1 / 60) {
      car.still = v ? 0 : t
      ride(car, TYPES[type], S)
      most = Math.max(most, car.lift)
    }
    return most
  }
  let hops = 0
  const paints = [...Array(40).keys()].map(i => (i + 0.5) / 40)
  for (const p of paints) if (lift(IDX.lowrider, p, 0, 6) > 0.12) hops++
  assert.ok(hops > 12 && hops < 28, `${hops} of 40 hop`)
  const hopper = paints.find(p => lift(IDX.lowrider, p, 0, 6) > 0.12)
  assert.ok(lift(IDX.lowrider, hopper, 0, 1) < 0.01, 'not the moment it stops')
  assert.ok(lift(IDX.lowrider, hopper, 8, 6) < 0.01, 'never on the move')
  assert.equal(lift(IDX.sedan, hopper, 0, 6), 0, 'and an ordinary car never')
})
