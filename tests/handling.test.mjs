// How the Roadster answers the keys in ordinary driving, as a player drives it: W held through a
// turn, and nothing in the tyres, the springs or the electronics chattering from one physics step to
// the next. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

const on = {}
globalThis.window = { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document = { querySelectorAll: () => [] }
const { Input } = await import('../js/ui/input.js')
const { Sim } = await import('../js/sim/sim.js')
const { G, DEG, wrapPi, makeControls } = await import(
  '../js/sim/constants.js'
)
const { ROADS, LANE_OFF, BUILDINGS, PROMENADE } = await import(
  '../js/sim/city.js'
)

const H = 1 / 120
const A = 'KeyA',
  D = 'KeyD',
  W = 'KeyW',
  S = 'KeyS',
  SPACE = 'Space'

const held = new Set()
function hold (keys) {
  for (const k of [...held])
    if (!keys.includes(k)) {
      on.keyup({ code: k })
      held.delete(k)
    }
  for (const k of keys)
    if (!held.has(k)) {
      on.keydown({ code: k, repeat: false, preventDefault () {} })
      held.add(k)
    }
}

// From `kmh` on open ground, holding keys(t) for `secs` s: each step's speed (km/h), how far round
// the car's path has turned (degrees), and its accelerations and yaw rate
function drive (kmh, keys, secs) {
  hold([])
  const input = new Input({ onDrive () {}, onCommand () {} })
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-100, 0, 300) // open desert, clear of everything
  sim.suction = 0
  sim.syncPose()
  sim.vel.set(kmh / 3.6, 0, 0)
  sim.speed = kmh / 3.6
  input.controls(sim, 'off')
  const log = []
  let turned = 0,
    head = 0
  for (let t = 0; t < secs; t += H) {
    hold(keys(t))
    sim.step(H, input.controls(sim, 'off'))
    sim.events.length = 0
    const v = sim.vel,
      sp = Math.hypot(v.x, v.z),
      h = Math.atan2(-v.z, v.x)
    if (sp > 0.5) turned += wrapPi(h - head)
    head = h
    log.push({
      t,
      kmh: sp * 3.6,
      turned: (turned * 180) / Math.PI,
      lon: sim.accLong,
      lat: sim.latAcc,
      r: sim.yawRate
    })
  }
  hold([])
  return { sim, log }
}

test('W held through a turn: the car comes round at the tyres limit instead of piling on speed and running wide', () => {
  // full lock and full throttle together, as on a keyboard: the stability control takes the power
  // away while the fronts are asked for more than they have, so the car corners at about the grip
  // of its tyres and holds its pace (before, at 80 km/h it ran out to a 195 m arc at 144 km/h)
  for (const [kmh, metres] of [
    [30, 12],
    [50, 25],
    [80, 60],
    [110, 110]
  ]) {
    const r = drive(kmh, t => [W, A], 2.5)
    const late = r.log.filter(l => l.t > 1)
    const top = Math.max(...late.map(l => l.kmh))
    assert.ok(top < kmh * 1.2, `from ${kmh} km/h: no faster than ${top.toFixed(0)}`)
    const g = Math.min(...late.map(l => Math.abs(l.lat))) / G
    assert.ok(g > 1.1, `from ${kmh} km/h: cornering at ${g.toFixed(2)} g or more`)
    const end = r.log.at(-1),
      radius = end.kmh / 3.6 / Math.abs(end.r)
    assert.ok(radius < metres, `from ${kmh} km/h: a ${radius.toFixed(0)} m arc`)
  }
  // and the wheel straight again, the power comes back at once
  const r = drive(50, t => (t < 1 ? [W, A] : [W]), 2.5)
  const after = r.log.filter(l => l.t > 1.6)
  assert.ok(
    Math.min(...after.map(l => l.lon)) > 0.8 * G,
    'full power once the wheel is straight'
  )
})

test('nothing chatters from one physics step to the next', () => {
  // an alternating sequence has a second difference of four times its swing: anything over a small
  // fraction of a g step to step, held, is the tyres, the springs and the electronics fighting each
  // other (the weight transfer once flipped the understeer control on and off every step at speed)
  const cases = [
    ['full throttle', 0, () => [W], 5],
    ['W and A at 50', 50, () => [W, A], 4],
    ['W and A at 150', 150, () => [W, A], 4],
    ['A at 80', 80, () => [A], 3],
    ['a slalom on the power', 90, t => [W, Math.sin(t * 3) > 0 ? A : D], 5],
    // (slowly the keys sweep the wheel through the understeer control's band within a step or two:
    // its cut once switched the power off and on in one)
    ['a slow slalom on the power', 30, t => [W, Math.sin(t * 4) > 0 ? A : D], 5],
    ['out of a corner on the power', 50, t => (t < 1.5 ? [W, A] : [W]), 3],
    ['a drift', 70, t => (t < 0.35 ? [A, SPACE] : [A, W]), 5],
    ['reversing', 0, () => [S], 4]
  ]
  for (const [name, kmh, keys, secs] of cases) {
    const { log } = drive(kmh, keys, secs)
    let sum = 0
    for (let i = 2; i < log.length; i++)
      for (const k of ['lon', 'lat'])
        sum += Math.abs(log[i][k] - 2 * log[i - 1][k] + log[i - 2][k])
    const mean = sum / (2 * (log.length - 2)) / G
    assert.ok(mean < 0.006, `${name}: ${mean.toFixed(4)} g step to step`)
  }
})

test('a kerb clipped fast unsettles the car: each axle loses speed climbing it, the nose knocked away', () => {
  // 60 km/h in the kerb lane, angled 30 degrees over towards the pavement on the right
  const sim = new Sim()
  const yaw = -30 * DEG
  sim.reset('city', { x: ROADS[3] + 20, z: ROADS[4] + LANE_OFF[1], yaw })
  sim.vel.set((Math.cos(yaw) * 60) / 3.6, 0, (-Math.sin(yaw) * 60) / 3.6)
  sim.speed = 60 / 3.6
  const c = makeControls()
  const hits = []
  for (let i = 0; i < 120 && hits.length < 2; i++) {
    const v0 = sim.groundSpeed() * 3.6,
      r0 = sim.yawRate
    sim.step(H, c)
    for (const e of sim.events)
      if (e.type === 'kerb' && e.up)
        hits.push({
          front: e.front,
          lost: v0 - sim.groundSpeed() * 3.6,
          kick: sim.yawRate - r0
        })
    sim.events.length = 0
  }
  assert.equal(hits.length, 2, 'the front axle mounts, then the rear')
  for (const h of hits)
    assert.ok(h.lost > 1 && h.lost < 6, `lost ${h.lost.toFixed(1)} km/h`)
  // (the front wheels meeting the kerb push the nose to the left, away from it; the rears push the
  // tail the same way, which swings the nose back)
  assert.ok(hits[0].kick > 0.3, `nose knocked away (${hits[0].kick.toFixed(2)})`)
  assert.ok(hits[1].kick < -0.2, `then the tail (${hits[1].kick.toFixed(2)})`)
})

// From (x, z) at `kmh` heading `yaw`: the speed lost (km/h) as each axle climbs the kerb
function climb (x, z, yaw, kmh) {
  const sim = new Sim()
  sim.reset('city', { x, z, yaw })
  sim.vel.set((Math.cos(yaw) * kmh) / 3.6, 0, (-Math.sin(yaw) * kmh) / 3.6)
  sim.speed = kmh / 3.6
  const c = makeControls(),
    lost = []
  for (let i = 0; i < 200 && lost.length < 2; i++) {
    const v0 = sim.groundSpeed() * 3.6
    sim.step(H, c)
    for (const e of sim.events)
      if (e.type === 'kerb' && e.up) lost.push(v0 - sim.groundSpeed() * 3.6)
    sim.events.length = 0
  }
  return lost
}

test('the kerb resists the climb from either side, and slamming into it square costs a jolt, not most of the speed', () => {
  // up from the beach onto the promenade, 30 degrees off square (its distance runs the other way
  // there: the strike once came out as nothing at all)
  const beach = climb(-PROMENADE - 6, 60, 30 * DEG, 60)
  assert.equal(beach.length, 2, 'both axles climb')
  for (const l of beach) assert.ok(l > 1, `from the beach: ${l.toFixed(1)} km/h`)
  // square into the ring road's outer kerb at 100 km/h: a fixed cost a strike (it took 40% of the
  // speed when the whole car lost what a wheel does)
  const square = climb(ROADS[0] + 3, 60, Math.PI, 100)
  const total = square.reduce((a, b) => a + b, 0)
  assert.ok(total > 5 && total < 15, `square at 100 km/h: ${total.toFixed(1)} km/h`)
})

test('driven off a roof towards a taller building across a narrow alley, the car drops into it rather than hanging there', () => {
  // a flat roof with a taller building across a gap narrower than the car (downtown has a few): the
  // edge the car left held it up while the wall in front pushed it back onto it, for ever
  let pair = null
  for (const a of BUILDINGS) {
    const t = a.tiers.at(-1)
    if (t.y1 < 8 || t.y1 > 40 || t.hip) continue
    const b = BUILDINGS.find(
      b =>
        b !== a &&
        b.x0 - t.x1 > 1 &&
        b.x0 - t.x1 < 3.5 &&
        Math.min(t.z1, b.z1) - Math.max(t.z0, b.z0) > 6 &&
        b.h > t.y1 + 3
    )
    if (b) {
      pair = { t, z: (Math.max(t.z0, b.z0) + Math.min(t.z1, b.z1)) / 2 }
      break
    }
  }
  assert.ok(pair, 'there is such an alley')
  const sim = new Sim()
  sim.reset('city', { x: pair.t.x1 - 6, z: pair.z, yaw: 0 })
  sim.floor = pair.t.y1
  sim.roof = pair.t
  sim.syncPose()
  sim.vel.set(3, 0, 0)
  sim.speed = 3
  const c = makeControls()
  c.throttle = 0.3
  for (let i = 0; i < 120 * 6; i++) {
    sim.step(H, c)
    sim.events.length = 0
  }
  assert.ok(
    sim.pos.y < pair.t.y1 - 3,
    `down in the alley (${sim.pos.y.toFixed(1)} m, the roof ${pair.t.y1.toFixed(1)} m)`
  )
})
