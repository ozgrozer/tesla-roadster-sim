// Headless checks of the emergency runs (calls.js, responder.js, makeway.js): a call comes now and
// then, never in the city's first minute and never where the camera can see it start; the police
// car drives it fast, siren on, going over a junction on red only at a crawl once it is clear, and
// gets there; the traffic ahead pulls over for it, each driver at their own moment, signalling, and
// pulls out again once it has gone by; the cross traffic holds at the line while it crosses, and
// the people waiting at the kerb stay there; it goes round the Roadster sitting in its way,
// flashing its headlights and giving a whoop of the siren, without touching it; and nobody crashes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Peds } from '../js/sim/peds.js'
import { Traffic, TYPES } from '../js/sim/traffic.js'
import { ring, walkOn, crossings } from '../js/sim/pavement.js'
import { rectRect, carRect } from '../js/sim/collide.js'
import { makeControls } from '../js/sim/constants.js'
import {
  RED,
  NODES,
  LANES,
  BLOCKS,
  signal,
  raycast,
  holdLight
} from '../js/sim/city.js'

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
function run (sim, tr, secs, each, view, peds) {
  for (let i = 0; i < secs / H; i++) {
    sim.step(H, idle())
    peds?.step(H, sim, tr, view)
    tr.step(H, sim, view)
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

test('now and then a police car, an ambulance or a fire engine answers a call: not in the first minute, never in sight', () => {
  const sim = parked()
  const tr = new Traffic({ count: 60, seed: 4 })
  tr.reset(sim.pos.x, sim.pos.z)
  // (the camera at the Roadster, looking east)
  const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
  const calls = []
  let down = null
  run(
    sim,
    tr,
    600,
    () => {
      const car = tr.call.car
      if (car && !calls.some(k => k.car === car))
        calls.push({ car, t: tr.t, x: car.x, z: car.z, siren: car.siren })
      if (calls.length === 1 && down === null && calls[0].car.siren !== 1)
        down = tr.t
      return calls.length < 2
    },
    view
  )
  assert.ok(calls.length === 2, `two calls in ten minutes (${calls.length})`)
  assert.ok(
    calls[0].t > 60 && calls[0].t < 115,
    `the first ${calls[0].t.toFixed(0)} s in`
  )
  const wait = calls[1].t - down
  assert.ok(
    wait > 119 && wait < 250,
    `the next ${wait.toFixed(0)} s after the run`
  )
  for (const k of calls) {
    assert.ok(
      ['police', 'ambulance', 'fire'].includes(TYPES[k.car.type].name),
      TYPES[k.car.type].name
    )
    assert.equal(k.siren, 1, 'lights and siren on')
    const d = Math.hypot(k.x - sim.pos.x, k.z - sim.pos.z)
    assert.ok(d > 150 && d < 290, `${d.toFixed(0)} m off`)
    const ahead = (k.x - view.x) * view.fx + (k.z - view.z) * view.fz
    assert.ok(
      ahead < -20 || raycast(view.x, 2, view.z, k.x, 1.5, k.z) < 0.97,
      'out of sight'
    )
  }
})

test('the police car drives its run fast, over a red only at a crawl once the junction is clear', () => {
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 7 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.call.next = 3 // (a call at once)
  let car = null,
    dest = -1,
    top = 0,
    slow = Infinity,
    was = null,
    end = null,
    overlap = 0
  const reds = []
  run(sim, tr, 200, i => {
    if (!car && tr.call.car) {
      car = tr.call.car
      dest = tr.call.dest
    }
    if (i % 30 === 0) overlap += overlaps(tr)
    if (!car) return
    if (car.siren !== 1) {
      end ??= { t: tr.t, edge: car.edge }
      return car.siren !== 0
    }
    top = Math.max(top, car.v)
    const e = car.edge
    // (its slowest within a few metres of the line, and over it: on red, with anyone in the box?)
    if (e.road && e.len - car.s - car.len / 2 < 4) slow = Math.min(slow, car.v)
    if (was?.road && e.move) {
      const node = NODES[was.to]
      if (signal(node, was.dir, tr.t) === RED) {
        let busy = 0
        for (const arm of node.inc)
          if (arm)
            for (const L of arm)
              for (const m of L.next)
                for (const o of m.cars) if (o !== car) busy++
        reds.push({ slow, busy })
      }
      slow = Infinity
    }
    was = e
  })
  assert.ok(car && end, 'a run, and its end')
  assert.ok(end.edge.move && end.edge.node === dest, 'it got there')
  assert.ok(top > 16.5 && top < 21.5, `up to ${(top * 3.6).toFixed(0)} km/h`)
  assert.ok(reds.length > 0, 'it went over on red')
  for (const r of reds) {
    assert.ok(r.slow < 3, `at a crawl at the line (${r.slow.toFixed(1)} m/s)`)
    assert.equal(r.busy, 0, 'with the junction clear')
  }
  assert.equal(overlap, 0, 'no two cars through each other')
})

test('drivers ahead pull over for it, each at their own moment, and pull out again once it has gone by', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  // the eastbound street along the park's north side, the lights held green; four cars on it, in
  // both lanes, and the police car coming up from the block before
  const e = LANES.find(
    l =>
      !l.closed &&
      l.dir === 0 &&
      l.lane === 0 &&
      Math.abs(l.z0 - PARK.z0) < 12 &&
      l.x0 < PARK.x1 &&
      l.x0 + l.len > PARK.x0
  )
  const e0 = LANES.find(l => l.to === e.from && l.dir === 0 && l.lane === 0)
  holdLight(NODES[e.from], 0, 0)
  holdLight(NODES[e.to], 0, 0)
  const put = (L, s, v) => {
    const c = tr.make(0)
    c.edge = L
    c.s = s
    c.v = c.v0 = v
    tr.insert(L, c)
    c.next = L.next.find(o => o.move === 'S')
    tr.place(c)
    tr.n++
    return c
  }
  const ahead = [
    put(e, 6, 6),
    put(e, 22, 6),
    put(e.twin, 12, 6),
    put(e.twin, 28, 6)
  ]
  tr.plan(NODES[e.to].i + 2, e0)
  tr.send(e0, 30)
  const S = tr.call.car
  const seen = new Map(
    ahead.map(c => [
      c,
      {
        lane: c.edge.lane,
        t0: null,
        off: 0,
        right: false,
        slow: Infinity,
        by: null,
        out: null
      }
    ])
  )
  run(sim, tr, 40, () => {
    for (const c of ahead) {
      const k = seen.get(c)
      if (c.pull === 1 && k.t0 === null) k.t0 = tr.t
      k.off = Math.max(k.off, c.off)
      if (c.pull === 1 && c.sig === 2) k.right = true
      const along = (c.x - S.x) * S.hx + (c.z - S.z) * S.hz
      if (k.by === null) k.slow = Math.min(k.slow, c.v)
      if (along < -(c.len + S.len) / 2 && k.by === null) k.by = tr.t
      if (k.by !== null && k.out === null && Math.abs(c.off) < 0.15 && c.v > 3)
        k.out = tr.t
    }
  })
  NODES[e.from].hold = NODES[e.to].hold = null
  const starts = []
  for (const c of ahead) {
    const k = seen.get(c)
    assert.ok(k.t0 !== null, 'pulls over')
    starts.push(k.t0)
    assert.ok(
      k.off > (k.lane === 0 ? 0.8 : 0.4),
      `in towards the kerb (${k.off.toFixed(2)} m, lane ${k.lane})`
    )
    assert.ok(k.right, 'signalling as it does')
    assert.ok(k.slow < 1, `slowing to a stop for it (${k.slow.toFixed(1)} m/s)`)
    assert.ok(k.by !== null, 'it goes by')
    assert.ok(
      k.out !== null && k.out - k.by < 12,
      `then out again and on its way (${(k.out - k.by).toFixed(1)} s)`
    )
  }
  const spread = Math.max(...starts) - Math.min(...starts)
  assert.ok(
    spread > 0.3,
    `each at their own moment (${spread.toFixed(2)} s apart)`
  )
})

test('the traffic coming up to the junction it crosses holds at the line, and nobody crashes', () => {
  const sim = parked()
  const tr = new Traffic({ count: 110, radius: 300, seed: 5 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.call.next = 3
  let crossing = 0,
    into = 0,
    overlap = 0
  run(sim, tr, 120, i => {
    const S = tr.call.car
    if (i % 30 === 0) overlap += overlaps(tr)
    if (!S || S.siren !== 1) return !S || S.siren !== 0
    const e = S.edge
    if (!e.move) return
    crossing++
    // (anyone else coming into the junction from another way while it is in it)
    const node = NODES[e.node]
    for (let k = 0; k < 4; k++)
      if (k !== e.dir && node.inc[k])
        for (const L of node.inc[k])
          for (const m of L.next) for (const o of m.cars) if (o.s < 0.3) into++
  })
  assert.ok(crossing > 120, 'it crossed junctions')
  assert.equal(
    into,
    0,
    'nobody came into a junction from another way as it crossed'
  )
  assert.equal(overlap, 0, 'no two cars through each other')
})

test('people waiting at the crossing stay on the kerb while it is coming over the junction', () => {
  const sim = parked()
  const tr = new Traffic({ count: 0, seed: 2 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ count: 0, seed: 4 })
  peds.reset(sim.pos.x, sim.pos.z)
  // someone waiting at a corner of the park's block to cross the street along z, held at red
  const pick = crossings(PARK, 0).find(c => c.axis === 1)
  const node = pick.node
  holdLight(node, 0, 0) // (east-west green: red for the street they cross, and the walk on it)
  const p = peds.spawnAt(ring(PARK, 1.05), 0, 1)
  p.cross = { ...pick, j: 0 }
  p.state = 'wait'
  p.x = pick.from[0]
  p.z = pick.from[1]
  // a police car on a call coming over that junction
  tr.call.on = true
  tr.call.node = node
  let held = 0,
    went = null
  run(
    sim,
    tr,
    60,
    () => {
      if (walkOn(node, 1, tr.t) && p.state === 'wait') held++
      if (tr.t > 30) tr.call.on = false
      if (p.state === 'cross' && went === null) went = tr.t
    },
    null,
    peds
  )
  node.hold = null
  assert.ok(held > 60, 'it waited through the walk')
  assert.ok(
    went > 30,
    `and crossed once the junction was clear (${went?.toFixed(1)} s)`
  )
})

test('the Roadster sitting in its way: it slows, flashes and whoops, then goes round without touching it', () => {
  const e = LANES.find(
    l =>
      !l.closed &&
      l.dir === 0 &&
      l.lane === 0 &&
      NODES[l.to].ix === 7 &&
      NODES[l.to].iz === 3
  )
  const sim = new Sim()
  sim.reset('city', { x: e.x0 + e.dx * 50, z: e.z0 + e.dz * 50, yaw: 0 })
  const tr = new Traffic({ count: 0, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.plan(NODES[e.to].i + 2, e)
  tr.send(e, 0)
  const S = tr.call.car
  S.v = 12
  const c = idle()
  c.brake = 1
  let slow = Infinity,
    flash = false,
    by = null,
    bumps = 0
  for (let i = 0; i < 30 / H && by === null; i++) {
    sim.step(H, c)
    tr.step(H, sim)
    bumps += sim.events.filter(ev => ev.type === 'bump').length
    sim.events.length = 0
    if (S.x < sim.pos.x - 6) slow = Math.min(slow, S.v)
    flash ||= S.flash
    if (S.x - S.len / 2 > sim.pos.x + 2.3) by = tr.t
  }
  assert.ok(slow < 1, `it slows behind it (${slow.toFixed(1)} m/s)`)
  assert.ok(flash, 'flashes its headlights')
  assert.ok(tr.call.whoops > 0, 'gives a whoop of the siren')
  assert.ok(by !== null && by < 20, `goes round it (${by?.toFixed(1)} s)`)
  assert.equal(bumps, 0, 'without touching it')
})

test('once there it switches off, and drives on as ordinary traffic at its own pace', () => {
  const sim = parked()
  const tr = new Traffic({ count: 60, radius: 300, seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  tr.call.next = 3
  let car = null,
    own = 0,
    off = null,
    after = 0
  // (driving on: moving at some point in the 15 s after, as it may first sit at a red; since the
  // city grew, its call goes elsewhere and ends with it at a light)
  run(sim, tr, 200, () => {
    if (!car && tr.call.car) {
      car = tr.call.car
      own = tr.call.saved.v0
    }
    if (car && car.siren === 0 && off === null) off = tr.t
    if (off !== null && tr.t > off + 2) after = Math.max(after, car.v)
    return off === null || tr.t < off + 15
  })
  assert.ok(off !== null, 'the run ends')
  assert.ok(tr.cars.includes(car), 'and the car is still on the road')
  assert.equal(car.siren, 0, 'lights and siren off')
  assert.ok(Math.abs(car.v0 - own) < 1e-6, 'back to its own pace')
  assert.ok(after > 1, 'driving on')
  assert.equal(tr.call.car, null, 'the call over')
})
