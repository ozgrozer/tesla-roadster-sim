// Headless physics checks: npm test
import { test } from 'node:test'
import { Sim } from '../js/sim/sim.js'
import assert from 'node:assert/strict'
import { LINEUP, TRACK } from '../js/sim/track.js'
import { Autopilot } from '../js/sim/autopilot.js'
import { tyreCurve } from '../js/sim/ground.js'
import {
  G,
  CAR,
  DEG,
  AX_X,
  wrapPi,
  CORNERS,
  makeControls
} from '../js/sim/constants.js'

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
    maxSlip = 0,
    maxG = 0 // the most the car was pushed or pulled about by its tyres (in g)
  while (t < secs) {
    const c = makeControls()
    c.fan = false
    after(c, t)
    const vx = sim.vel.x,
      vz = sim.vel.z
    sim.step(H, c)
    maxG = Math.max(maxG, Math.hypot(sim.vel.x - vx, sim.vel.z - vz) / H / G)
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
    maxSlip,
    maxG
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
  // the e-brake locks only the rear wheels: a long stop, at about half a g
  const eb = from60(c => {
    c.ebrake = true
  })
  assert.ok(
    eb.dist > 1.8 * brake.dist && eb.dist < 40,
    `e-brake distance ${eb.dist.toFixed(1)} m`
  )
  assert.ok(
    Math.abs(eb.turned) < 2,
    'straight-line e-brake stop stays straight'
  )
  // and with W held the front motor pulls against the locked rears, as on a real car
  const ebW = from60(c => {
    c.ebrake = true
    c.throttle = 1
  }, 3)
  assert.ok(
    ebW.sim.groundSpeed() > 12,
    `the fronts pull it along on locked rears (${ebW.sim
      .groundSpeed()
      .toFixed(1)} m/s after 3 s)`
  )
})

test('e-brake plus steering rotates the car into a drift', () => {
  const r = from60((c, t) => {
    c.ebrake = t < 0.8
    c.steer = t < 1.5 ? 1 : 0
  })
  assert.ok(r.maxSlip > 45, `drift slip ${r.maxSlip.toFixed(0)}°`)
})

test('a handbrake turn swings the car round, and on the power it drives off the way it points', () => {
  // a tap of the e-brake on full lock at 60 km/h, then the wheel straight and the throttle on: the
  // locked rears swing round, and once they spin up again the car slides on until its tyres bite,
  // no harder than they can pull (nothing snaps it onto its new heading), and drives off that way
  const tap = (c, t) => {
    c.ebrake = t < 0.6
    c.steer = t < 0.6 ? 1 : 0
    c.throttle = t > 0.6 ? 0.6 : 0
  }
  const r = from60(tap, 3)
  const mid = from60(tap, 1.4)
  assert.ok(r.turned > 45 && r.turned < 140, `turned ${r.turned.toFixed(0)}°`)
  assert.ok(r.maxSlip > 20, `slid through it (${r.maxSlip.toFixed(0)}°)`)
  assert.ok(
    mid.maxSlip > 25 && r.maxSlip > 25,
    `still sliding after the release (${mid.maxSlip.toFixed(0)}°)`
  )
  assert.ok(
    r.maxG < 1.45,
    `no more force than the tyres have (${r.maxG.toFixed(2)} g)`
  )
  const v = r.sim.vel
  const drift = wrapPi(Math.atan2(-v.z, v.x) - r.sim.yaw) / DEG
  assert.ok(
    Math.abs(drift) < 5,
    `then drives off the way it points (${drift.toFixed(1)}° off)`
  )
})

// Track Mode: a handbrake flick at 70 km/h on open ground, then t s of whatever steer() and
// throttle() ask for; the rear axle's slip every tenth of a second, and the sim at the end
function flick (steer, throttle, t) {
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-100, 0, 300) // open desert, clear of everything
  sim.suction = 0
  sim.syncPose()
  sim.vel.set(70 / 3.6, 0, 0)
  sim.speed = 70 / 3.6
  const slip = []
  for (let i = 0; i < (0.45 + t) / H; i++) {
    const c = makeControls(),
      s = i * H - 0.45
    c.fan = false
    if (s < 0) {
      c.ebrake = true
      c.steer = 1
    } else {
      c.steer = steer(s)
      c.throttle = throttle(s)
    }
    sim.step(H, c)
    if (i % 12 === 0) slip.push(Math.abs(sim.slipR) / DEG)
  }
  return { sim, slip }
}

test('Track Mode: on the power after a handbrake flick the car holds a drift for as long as it is asked', () => {
  // into the turn and on the power: a drift held, deep, for as long as the steering asks
  const held = flick(
    () => 1,
    () => 1,
    5
  )
  const late = held.slip.slice(15) // (from 1.5 s on)
  assert.ok(
    late.every(a => a > 30 && a < 65),
    `held at ${Math.min(...late).toFixed(0)}-${Math.max(...late).toFixed(0)}°`
  )
  assert.ok(held.sim.track, 'still in Track Mode')
  assert.ok(held.sim.groundSpeed() > 15, 'and still going at a pace')
  // the wheel left alone: it slowly unwinds and the car drives on, the electronics back on
  const alone = flick(
    () => 0,
    () => 1,
    8
  )
  assert.ok(alone.slip[10] > 15, 'still drifting a second later')
  assert.ok(alone.slip.slice(-5).every(a => a < 5), 'unwound by the end')
  assert.ok(!alone.sim.track, 'and out of Track Mode')
  // steering out of it, or lifting off: straight in a moment, and never over into a drift the
  // other way
  for (const [how, steer, throttle] of [
    ['steering out', () => -1, () => 1],
    ['lifting off', () => 0, s => (s < 1 ? 1 : 0)]
  ]) {
    const r = flick(steer, throttle, 3.5)
    assert.ok(r.slip.slice(-10).every(a => a < 8), `${how} straightens it`)
    assert.ok(!r.sim.track, `${how}: out of Track Mode`)
  }
})

test('the steering turns at the speed of hands, and the tyres corner to their limit', () => {
  // a step of full lock at walking pace: the wheels take about a third of a second to get there
  const sim = new Sim()
  sim.reset('start')
  sim.pos.set(-300, 0, 60)
  sim.vel.set(3, 0, 0)
  sim.speed = 3
  sim.syncPose()
  const c = makeControls()
  c.fan = false
  c.steer = 1
  for (let i = 0; i < 12; i++) sim.step(H, c)
  assert.ok(
    sim.steerAng > 0.15 && sim.steerAng < 0.25,
    `a tenth of a second in: ${(sim.steerAng / DEG).toFixed(0)}°`
  )
  for (let i = 0; i < 36; i++) sim.step(H, c)
  assert.ok(sim.steerAng > 0.55, 'at full lock by 0.4 s')
  // and at 60 km/h, full lock held: the car corners at the grip of its tyres (1.26 g)
  const fast = from60((c, t) => {
    c.steer = t > 0.2 ? 1 : 0
    c.throttle = 0.25
  }, 1.5)
  const g = Math.abs(fast.sim.latAcc) / G
  assert.ok(g > 1.05 && g < 1.3, `cornering at ${g.toFixed(2)} g`)
  // a tyre pushed past its peak gives less, down to what a sliding tyre keeps
  assert.ok(Math.abs(tyreCurve(Math.PI / 2) - 1) < 1e-9, 'the peak')
  assert.ok(tyreCurve(0.01) > 0.0099, 'stiff from the start')
  assert.ok(tyreCurve(2.5) < 0.95 && tyreCurve(2.5) > CAR.slideMu, 'past it')
  assert.ok(Math.abs(tyreCurve(-8) + CAR.slideMu) < 0.01, 'sliding')
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
  }, 3)
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
  assert.ok(
    rolls[0] * rolls[1] < 0,
    'A and D roll it off its roof opposite ways'
  )
  for (const r of rolls.slice(2))
    assert.ok(Math.abs(r) < 2, 'off its side the short way, whichever key')
})

test('a wreck that comes to rest on its wheels drives on with W', () => {
  const sim = wreck(0)
  assert.equal(sim.mode, 'crash')
  assert.ok(driveOff(sim) > 15, 'drives on')
})

test('the parked lineup bounces the Roadster off instead of crashing it', () => {
  const sim = new Sim()
  sim.reset('lineup') // 40 m short of the Cybercab, facing it
  const events = []
  for (let i = 0; i < 120 * 5; i++) {
    const c = makeControls()
    c.throttle = 1
    sim.step(H, c)
    events.push(...sim.events)
    sim.events.length = 0
  }
  assert.ok(
    events.some(e => e.type === 'bump' && e.impact > 10),
    'hits it hard'
  )
  assert.ok(!events.some(e => e.type === 'crash'), 'without a crash')
  assert.equal(sim.mode, 'ground')
  const cab = LINEUP.find(c => c.kind === 'cab')
  assert.ok(sim.pos.x - 2.22 > cab.box.x1 - 0.05, 'and stays clear of it')
})

// Drop the car onto open ground beside the runway, rolled `roll` and falling at `vy`, going 30 m/s.
function drop (roll, vy) {
  const sim = new Sim()
  sim.pos.set(-150, 0, 40)
  sim.syncPose()
  sim.setMode('air')
  sim.quat.setFromAxisAngle(AX_X, roll)
  sim.com.set(-150, 2.5, 40)
  sim.vel.set(30, vy, 0)
  const events = []
  for (let i = 0; i < 120; i++) {
    sim.step(H, makeControls())
    events.push(...sim.events)
    sim.events.length = 0
  }
  return { sim, events }
}

test('hard and tilted landings come down on the wheels, and the car drives on', () => {
  for (const [roll, vy] of [
    [0, -30],
    [0.9, -12],
    [-1.2, -20]
  ]) {
    const { sim, events } = drop(roll, vy)
    assert.ok(!events.some(e => e.type === 'crash'), `no crash at ${vy} m/s`)
    assert.ok(
      events.some(e => e.type === 'touchdown'),
      'a touchdown'
    )
    assert.equal(sim.mode, 'ground')
    assert.ok(driveOff(sim) > 15, 'and drives on')
  }
  const roof = drop(Math.PI, -5)
  assert.ok(
    roof.events.some(e => e.type === 'crash'),
    'coming down on its roof still tumbles (A/D rolls it back)'
  )
})
