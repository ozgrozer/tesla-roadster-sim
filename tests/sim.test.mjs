// Headless physics checks: npm test
import { test } from 'node:test'
import { Sim } from '../js/sim/sim.js'
import assert from 'node:assert/strict'
import { LINEUP, TRACK } from '../js/sim/track.js'
import { Autopilot } from '../js/sim/autopilot.js'
import { AX_X, CORNERS, DEG, makeControls, wrapPi } from '../js/sim/constants.js'

const H = 1 / 120

function runAutopilot () {
  const sim = new Sim(),
    ap = new Autopilot(sim),
    events = [],
    phases = []
  let minClear = Infinity,
    holdPitch = null,
    reverseStopX = null,
    firstLandingX = null,
    fallThrust = 0,
    climbTop = 0,
    climbDrop = 0,
    jumpSpeed = 0,
    maxLat = 0
  for (let i = 0; i < 120 * 90 && !ap.restart; i++) {
    const before = ap.phase
    sim.step(H, ap.update(H))
    events.push(...sim.events)
    sim.events.length = 0
    if (ap.phase !== before) phases.push(ap.phase)
    maxLat = Math.max(maxLat, Math.abs(sim.pos.z))
    if (ap.phase === 'jump' && before === 'rollout') jumpSpeed = sim.speed
    if (ap.phase === 'charge' && sim.mode === 'ramp') {
      climbTop = Math.max(climbTop, sim.v)
      climbDrop = Math.max(climbDrop, climbTop - sim.v)
    }
    if (before === 'descend' && ap.phase === 'descend')
      fallThrust = Math.max(fallThrust, sim.thrLift)
    if (ap.phase === 'ready' && before === 'reverse') reverseStopX = sim.pos.x
    if (
      firstLandingX === null &&
      sim.events.length === 0 &&
      events.some(e => e.type === 'touchdown')
    ) {
      firstLandingX = sim.pos.x
    }
    if (ap.phase === 'hold' && holdPitch === null) holdPitch = sim.pitchDeg()
    if (ap.phase === 'jump' || ap.phase === 'kickflip') {
      let low = Infinity
      for (const p of CORNERS)
        low = Math.min(low, p.clone().applyQuaternion(sim.quat).add(sim.pos).y)
      for (const v of LINEUP)
        if (sim.pos.x < v.box.x1 + 2.2 && sim.pos.x > v.box.x0 - 2.2)
          minClear = Math.min(minClear, low - v.h)
    }
  }
  return {
    sim,
    ap,
    events,
    phases,
    minClear,
    holdPitch,
    reverseStopX,
    firstLandingX,
    fallThrust,
    climbDrop,
    jumpSpeed,
    maxLat
  }
}

test('autopilot flies the whole reveal sequence without crashing', () => {
  const r = runAutopilot()
  // from the foot of the wall: climb, hang, reverse back, full-speed climb, drop off the lip,
  // free fall, full bottom thrust near the floor, then full speed and full thrust over the lineup
  for (const p of [
    'climb',
    'hold',
    'reverse',
    'ready',
    'charge',
    'halfroll',
    'descend',
    'burn',
    'settle',
    'rollout',
    'jump',
    'kickflip',
    'done'
  ]) {
    assert.ok(r.phases.includes(p), `missing phase ${p}`)
  }
  assert.equal(r.events.filter(e => e.type === 'crash').length, 0)
  assert.ok(
    Math.abs(r.holdPitch - 170) < 1,
    `hangs at 170°, got ${r.holdPitch}`
  )
  const landings = r.events.filter(e => e.type === 'landing')
  assert.equal(landings.length, 2)
  assert.deepEqual(
    landings[0].tricks,
    ['Half roll'],
    'stunt 1 flies without flips'
  )
  assert.ok(
    landings[1].tricks.includes('Kickflip'),
    'kickflips over the lineup'
  )
  for (const l of landings)
    assert.ok(l.g < 3, `thruster landing, got ${l.g.toFixed(2)} G`)
  assert.ok(r.minClear > 1, `clears the lineup by ${r.minClear.toFixed(2)} m`)
  assert.ok(
    r.maxLat < 2,
    `stays on the centre line of the pad, strayed ${r.maxLat.toFixed(2)} m`
  )
  assert.ok(
    r.jumpSpeed > 45,
    `main thrusters build ${(r.jumpSpeed * 3.6).toFixed(
      0
    )} km/h for the lineup jump`
  )
  assert.ok(
    r.climbDrop < 0.3,
    `full power up the wall never slows, lost ${r.climbDrop.toFixed(2)} m/s`
  )
  assert.equal(
    r.fallThrust,
    0,
    'falls with the bottom thrusters idle until the burn'
  )
  assert.ok(
    r.firstLandingX < -60 && r.firstLandingX > -100,
    `stunt 1 lands a short way out from the wall, at x=${r.firstLandingX.toFixed(
      1
    )}`
  )
  assert.ok(
    r.reverseStopX > TRACK.X0 && r.reverseStopX < TRACK.X0 + 4,
    `stops on the flat beginning of the platform, at x=${r.reverseStopX.toFixed(
      1
    )}`
  )
})

test('0-60 mph in under a second with tires plus main thrusters', () => {
  const sim = new Sim()
  for (let i = 0; i < 240 && !sim.z60.last; i++) {
    const c = makeControls()
    c.throttle = 1
    c.main = 1
    sim.step(H, c)
  }
  assert.ok(
    sim.z60.last > 0.7 && sim.z60.last < 1.0,
    `0-60 mph in ${sim.z60.last}`
  )
})

// Accelerate to 60 km/h on open ground (fan off), then apply `after` until the car stops.
function from60 (after, secs = 30) {
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-300, 0, 60) // open ground beside the runway, clear of the wall and the lineup
  sim.syncPose()
  sim.suction = 0
  while (sim.speed < 16.67) {
    const c = makeControls()
    c.fan = false
    c.throttle = 1
    sim.step(H, c)
  }
  const x0 = sim.pos.x,
    z0 = sim.pos.z,
    yaw0 = sim.yaw
  let t = 0,
    maxSlip = 0
  while (t < secs) {
    const c = makeControls()
    c.fan = false
    after(c, t)
    sim.step(H, c)
    t += H
    const lat = -sim.vel.x * Math.sin(sim.yaw) - sim.vel.z * Math.cos(sim.yaw)
    if (sim.groundSpeed() > 2)
      maxSlip = Math.max(
        maxSlip,
        Math.abs(Math.atan2(lat, Math.max(0.5, Math.abs(sim.speed)))) / DEG
      )
    if (sim.groundSpeed() < 0.001 && t > 0.5) break
  }
  return {
    sim,
    t,
    dist: Math.hypot(sim.pos.x - x0, sim.pos.z - z0),
    turned: wrapPi(sim.yaw - yaw0) / DEG,
    maxSlip
  }
}

test('lifting off the throttle coasts the car to a stop', () => {
  const r = from60(() => {})
  assert.equal(r.sim.groundSpeed(), 0)
  assert.ok(r.t > 8 && r.t < 25, `coast took ${r.t.toFixed(1)} s`)
})

test('brakes and e-brake stop the car in realistic distances', () => {
  const brake = from60(c => {
    c.brake = 1
  })
  assert.ok(brake.dist < 15, `brake distance ${brake.dist.toFixed(1)} m`)
  const eb = from60(c => {
    c.ebrake = true
  })
  assert.ok(
    eb.dist > 15 && eb.dist < 45,
    `e-brake distance ${eb.dist.toFixed(1)} m`
  )
  assert.ok(
    Math.abs(eb.turned) < 2,
    'straight-line e-brake stop stays straight'
  )
})

test('e-brake plus steering rotates the car into a drift', () => {
  const r = from60((c, t) => {
    c.ebrake = t < 0.8
    c.steer = t < 1.5 ? 1 : 0
  })
  assert.ok(r.maxSlip > 45, `drift slip ${r.maxSlip.toFixed(0)}°`)
})

test('stability control keeps normal driving from spinning', () => {
  const slalom = from60((c, t) => {
    c.steer = Math.sin(t * 3) > 0 ? 1 : -1
    c.throttle = 0.4
  }, 5)
  assert.ok(slalom.maxSlip < 20, `slalom slip ${slalom.maxSlip.toFixed(0)}°`)
  const corner = from60(c => {
    c.steer = 1
    c.throttle = 0.3
  }, 4)
  assert.ok(
    corner.maxSlip < 20 && Math.abs(corner.turned) > 60,
    'holds a steady corner'
  )
})

test('edge cases end in a clean crash or stop, never NaN', () => {
  const cases = [
    [
      'top',
      c => {
        c.fan = false
      }
    ],
    [
      'top',
      c => {
        c.throttle = 1
        c.main = 1
        c.assist = false
      }
    ],
    [
      'start',
      c => {
        c.fan = false
        c.throttle = 1
      }
    ],
    [
      'lineup',
      c => {
        c.throttle = 1
      }
    ]
  ]
  for (const [spot, fn] of cases) {
    const sim = new Sim()
    sim.reset(spot)
    for (let i = 0; i < 120 * 14; i++) {
      const c = makeControls()
      fn(c)
      sim.step(H, c)
    }
    assert.ok(
      Number.isFinite(sim.pos.x + sim.pos.y + sim.pos.z + sim.quat.w),
      `${spot}: finite state`
    )
  }
})

test('a nose dipped into the pad while climbing on the thrusters scrapes, not lands', () => {
  const sim = new Sim()
  sim.reset('lineup')
  sim.pos.x = -60 // the open runway, heading for the lineup
  sim.syncPose()
  while (sim.speed < 50) {
    const c = makeControls()
    c.fan = false
    c.throttle = 1
    c.main = 1
    sim.step(H, c)
  }
  const events = []
  let air = 0
  for (let i = 0; i < 120 * 1.2; i++) {
    const c = makeControls()
    c.fan = false
    c.lift = 1
    if (sim.mode === 'air') air += H
    c.pitch = air > 0 && air < 0.25 ? -1 : 0 // a stab of nose-down just after lift-off
    sim.step(H, c)
    events.push(...sim.events)
    sim.events.length = 0
  }
  assert.deepEqual(
    events.filter(e => e.type === 'touchdown' || e.type === 'crash'),
    [],
    'no touchdown while climbing'
  )
  assert.equal(sim.mode, 'air')
  assert.ok(sim.com.y > 3, `climbs away, at ${sim.com.y.toFixed(1)} m`)
})

// A crash on open ground beside the runway, rolled `ang` about the long axis, left to come to rest.
function wreck (ang) {
  const sim = new Sim()
  sim.pos.set(-150, 0, 40)
  sim.syncPose()
  sim.setMode('air')
  sim.quat.setFromAxisAngle(AX_X, ang)
  sim.com.set(-150, 1.4, 40)
  sim.vel.set(3, 0, 1)
  sim.toCrash('test')
  for (let i = 0; i < 120 * 4; i++) sim.step(H, makeControls())
  return sim
}
function driveOff (sim) {
  for (let i = 0; i < 120 * 2; i++) {
    const c = makeControls()
    c.fan = false
    c.throttle = 1
    sim.step(H, c)
  }
  return sim.speed
}

test('a wreck rolls back onto its wheels with A or D and drives on, GTA-style', () => {
  const rolls = []
  for (const [ang, steer] of [
    [Math.PI, 1],
    [Math.PI, -1],
    [Math.PI / 2, 1],
    [-Math.PI / 2, 1]
  ]) {
    const sim = wreck(ang)
    assert.equal(sim.mode, 'crash', 'a wreck left alone stays put')
    assert.ok(sim.up().y < 0.5, 'at rest on its roof or side')
    let t = 0
    while (sim.mode === 'crash' && t < 2) {
      const c = makeControls()
      c.steer = steer
      sim.step(H, c)
      if (sim.righting && !sim.righting.t) rolls.push(sim.righting.roll)
      t += H
    }
    assert.equal(sim.mode, 'ground', 'back on its wheels')
    assert.ok(t < 1.2, `in ${t.toFixed(2)} s`)
    assert.ok(driveOff(sim) > 15, 'and drives on')
  }
  assert.ok(rolls[0] * rolls[1] < 0, 'A and D roll it off its roof opposite ways')
  for (const r of rolls.slice(2))
    assert.ok(Math.abs(r) < 2, 'off its side the short way, whichever key')
})

test('a wreck that comes to rest on its wheels drives on with W', () => {
  const sim = wreck(0)
  assert.equal(sim.mode, 'crash')
  assert.ok(driveOff(sim) > 15, 'drives on')
})
