// Drifting, driven through the keyboard as a player drives it (Space and A to flick it, W and the
// steering keys to hold it), against stand-ins for the browser's window and document: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

const on = {}
globalThis.window = { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document = { querySelectorAll: () => [] }
const { Input } = await import('../js/ui/input.js')
const { Sim } = await import('../js/sim/sim.js')
const { DEG, wrapPi } = await import('../js/sim/constants.js')

const H = 1 / 120
const A = 'KeyA',
  D = 'KeyD',
  W = 'KeyW',
  S = 'KeyS',
  SPACE = 'Space'

// hold exactly these keys
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

// From `kmh` on open ground, holding keys(t) at t s, for `secs` s: each frame's drift angle (degrees,
// positive with the nose left of the way the car is going), speed (km/h), how far round its path
// has turned (degrees), yaw rate, Track Mode and distance; the sim and the drifts scored
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
  input.controls(sim, 'off') // (a frame first, as in the game)
  const log = [],
    drifts = []
  let turned = 0,
    head = 0,
    dist = 0
  for (let t = 0; t < secs; t += H) {
    hold(keys(t))
    sim.step(H, input.controls(sim, 'off'))
    drifts.push(...sim.events.filter(e => e.type === 'drift'))
    sim.events.length = 0
    const v = sim.vel,
      sp = Math.hypot(v.x, v.z),
      h = Math.atan2(-v.z, v.x)
    if (sp > 0.5) turned += wrapPi(h - head)
    head = h
    dist += sp * H
    const cy = Math.cos(sim.yaw),
      sy = Math.sin(sim.yaw)
    const u = v.x * cy - v.z * sy,
      w = -v.x * sy - v.z * cy
    log.push({
      t,
      angle: sp > 3 ? -Math.atan2(w, Math.abs(u)) / DEG : 0,
      kmh: sp * 3.6,
      turned: turned / DEG,
      r: sim.yawRate,
      track: sim.track,
      dist
    })
  }
  hold([])
  return { sim, log, drifts }
}
const from = (log, t0, t1 = Infinity) => log.filter(l => l.t >= t0 && l.t < t1)
const range = (rows, k) => [
  Math.min(...rows.map(l => l[k])),
  Math.max(...rows.map(l => l[k]))
]
// a tap of the e-brake on the turn: Space and A for a third of a second
const FLICK = 0.35

test('a tap of the e-brake on the turn flicks the car into a drift that W and the wheel hold, from 40 to 130 km/h', () => {
  for (const kmh of [40, 70, 100, 130]) {
    const r = drive(kmh, t => (t < FLICK ? [A, SPACE] : [A, W]), 5)
    const late = from(r.log, 2)
    const [lo, hi] = range(late, 'angle')
    assert.ok(
      lo > 25 && hi < 58,
      `at ${kmh} km/h held at ${lo.toFixed(0)}-${hi.toFixed(0)}°`
    )
    assert.ok(hi - lo < 8, `at ${kmh} km/h steady (${(hi - lo).toFixed(0)}°)`)
    assert.ok(
      Math.max(...r.log.map(l => l.angle)) < 70,
      `at ${kmh} km/h it never spins`
    )
    assert.ok(r.sim.track, `at ${kmh} km/h still in Track Mode`)
  }
})

test('held in a drift, W keeps its pace, so the tyres carry the car round a corner instead of out wide', () => {
  // into a right-angled corner: the path comes round 90° in a corner's length, and the car doesn't
  // pile on speed doing it (full throttle on a drift used to run it from 64 to 115 km/h)
  for (const [kmh, metres] of [
    [50, 40],
    [70, 55]
  ]) {
    const r = drive(kmh, t => (t < FLICK ? [A, SPACE] : [A, W]), 5)
    const at90 = r.log.find(l => l.turned >= 90)
    assert.ok(
      at90 && at90.dist < metres,
      `from ${kmh} km/h round 90° in ${at90?.dist.toFixed(0)} m`
    )
    assert.ok(
      at90.kmh < kmh + 5,
      `from ${kmh} km/h at ${at90.kmh.toFixed(0)} km/h by then`
    )
  }
  // held on and on, it circles at a steady pace and a tight radius
  const r = drive(70, t => (t < FLICK ? [A, SPACE] : [A, W]), 9)
  const late = from(r.log, 2)
  const [slow, fast] = range(late, 'kmh')
  assert.ok(
    fast - slow < 12,
    `a steady pace (${slow.toFixed(0)}-${fast.toFixed(0)} km/h)`
  )
  const rate =
    ((late.at(-1).turned - late[0].turned) / (late.at(-1).t - late[0].t)) * DEG
  const radius = (slow + fast) / 2 / 3.6 / rate
  assert.ok(radius < 35, `round a ${radius.toFixed(0)} m circle`)
})

test('the drift answers the keys: deep holding the turn, shallower tapping it, unwinding with the wheel left alone', () => {
  const deep = drive(70, t => (t < FLICK ? [A, SPACE] : [A, W]), 6)
  const tapped = drive(
    70,
    t => (t < FLICK ? [A, SPACE] : t % 0.5 < 0.2 ? [A, W] : [W]),
    6
  )
  const [tlo, thi] = range(from(tapped.log, 1.5), 'angle')
  const [dlo] = range(from(deep.log, 1.5), 'angle')
  assert.ok(
    tlo > 12 && thi < dlo - 10,
    `tapping holds ${tlo.toFixed(0)}-${thi.toFixed(0)}° (holding it, ${dlo.toFixed(
      0
    )}°+)`
  )
  // the wheel let go on the power: it unwinds and drives on straight, no swing past
  const alone = drive(70, t => (t < FLICK ? [A, SPACE] : t < 1.85 ? [A, W] : [W]), 6)
  const after = from(alone.log, 1.85)
  const straight = after.find(l => Math.abs(l.angle) < 3)
  assert.ok(
    straight && straight.t - 1.85 < 3.2,
    `straight ${(straight?.t - 1.85).toFixed(1)} s after the wheel is let go`
  )
  assert.ok(range(after, 'angle')[0] > -5, 'without swinging past straight')
  assert.ok(!alone.sim.track, 'and the electronics are back')
})

test('out of a drift without a snap: lifting off or a tap the other way straightens it', () => {
  for (const [how, keys, within, maxR] of [
    [
      'lifting off',
      t => (t < FLICK ? [A, SPACE] : t < 1.85 ? [A, W] : []),
      1.8,
      1.6
    ],
    [
      'tapping the other way',
      t => (t < FLICK ? [A, SPACE] : t < 1.85 ? [A, W] : t < 2.15 ? [D, W] : [W]),
      2.3,
      1.2
    ],
    [
      'steering the other way off the power',
      t => (t < FLICK ? [A, SPACE] : t < 1.85 ? [A, W] : [D]),
      Infinity,
      1.8
    ]
  ]) {
    const r = drive(70, keys, 5)
    const after = from(r.log, 1.85)
    const straight = after.find(l => Math.abs(l.angle) < 3)
    if (within < Infinity)
      assert.ok(
        straight && straight.t - 1.85 < within,
        `${how}: straight after ${(straight?.t - 1.85).toFixed(1)} s`
      )
    assert.ok(
      range(after, 'angle')[0] > -5,
      `${how}: never flicked round the other way`
    )
    const r0 = Math.max(...after.map(l => Math.abs(l.r)))
    assert.ok(r0 < maxR, `${how}: no snap (${r0.toFixed(2)} rad/s)`)
    assert.ok(!r.sim.track, `${how}: out of Track Mode`)
  }
})

test('steering out with the power on links it into a drift the other way, and the two score as one', () => {
  const r = drive(
    70,
    t => (t < FLICK ? [A, SPACE] : t < 1.85 ? [A, W] : t < 4.5 ? [D, W] : [W]),
    8
  )
  // swung through (in about a second and a half) and held the other way, without spinning
  const right = from(r.log, 3.4, 4.5)
  const share = right.filter(l => l.angle < -20 && l.angle > -60).length
  assert.ok(
    share / right.length > 0.9,
    `held the other way (${range(right, 'angle')
      .map(a => a.toFixed(0))
      .join(' to ')}°)`
  )
  const swing = Math.max(...from(r.log, 1.85, 3).map(l => Math.abs(l.r)))
  assert.ok(swing < 2.2, `a swing, not a snap (${swing.toFixed(2)} rad/s)`)
  // and the linked drift answers the keys as the first did: the wheel let go, it unwinds gently
  // rather than snapping straight
  const unwind = from(r.log, 4.5)
  const swing2 = Math.max(...unwind.map(l => Math.abs(l.r)))
  assert.ok(swing2 < 0.9, `unwinding gently (${swing2.toFixed(2)} rad/s)`)
  assert.ok(
    r.log.find(l => l.t >= 4.8).track,
    'still drifting a moment after the wheel is let go'
  )
  // then the electronics come back, and it scores as one linked drift
  assert.ok(Math.abs(r.log.at(-1).angle) < 5, 'straight by the end')
  assert.ok(!r.sim.track, 'out of Track Mode')
  assert.equal(r.drifts.length, 1, 'one drift')
  assert.equal(r.drifts[0].links, 1, 'linked once')
  assert.ok(r.drifts[0].t > 3.5, `${r.drifts[0].t.toFixed(1)} s of it`)
})

test('braking in a drift brings its pace down, and the drift goes on at it', () => {
  const plain = drive(70, t => (t < FLICK ? [A, SPACE] : [A, W]), 4)
  const braked = drive(
    70,
    t => (t < FLICK ? [A, SPACE] : t > 2 && t < 2.4 ? [A, W, S] : [A, W]),
    4
  )
  const v = plain.log.at(-1).kmh,
    vb = braked.log.at(-1).kmh
  assert.ok(vb < v - 8, `${vb.toFixed(0)} km/h, against ${v.toFixed(0)} held on`)
  assert.ok(braked.sim.track, 'still drifting')
  assert.ok(
    braked.log.at(-1).angle > 30,
    `at ${braked.log.at(-1).angle.toFixed(0)}°`
  )
})
