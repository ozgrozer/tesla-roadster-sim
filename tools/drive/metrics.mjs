// Driving metrics for every class the player can drive (the Roadster's own sim and every handling
// class of vehicleSim.js), driven through the real keyboard mapping (ui/input.js against stand-ins
// for the browser) on open flat ground, as a player's keys would: 0-100 km/h, braking 100-0, how
// fast the car answers the wheel and lets go of it, the most lateral g, the turning circle, the
// handbrake's 180 and a J-turn, slow manoeuvring (stop, then reverse) and the body's pitch and roll.
//   node --import ./tools/node-loader/register.mjs tools/drive/metrics.mjs [--md] [--wet]
import { HANDLING, KINDS } from '../../js/sim/handling.js'
import { Sim } from '../../js/sim/sim.js'
import { createVehicleBody, stepVehicle } from '../../js/sim/vehicleSim.js'
import { carInput } from '../../js/sim/drivable.js'
import { GRIP } from '../../js/sim/roadGrip.js'

globalThis.navigator ??= {}
const on = {}
globalThis.window ??= { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document ??= { querySelectorAll: () => [] }
globalThis.performance ??= { now: () => 0 }
const { Input } = await import('../../js/ui/input.js')

export const H = 1 / 120
const G = 9.81
const DEG = 180 / Math.PI
export const CLASSES = ['roadster', ...KINDS.filter(k => !HANDLING[k].sim)]
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))

// A car of class k driven by held keys: .keys(set), .step(), and its state read the same way for
// the Roadster (a Sim) and any other class (a body)
export class Rig {
  constructor (k, opts = {}) {
    this.k = k
    this.grip = opts.grip ?? 1
    this.input = new Input({ onDrive () {}, onCommand () {} })
    this.held = new Set()
    if (k === 'roadster') {
      this.s = new Sim()
      this.s.reset('start')
      this.s.pos.set(-400, 0, 400)
      this.s.yaw = 0
      this.s.suction = 0
      this.s.syncPose()
      this.view = this.s
    } else {
      this.b = createVehicleBody(k, { x: -400, z: 400, yaw: 0 })
      this.view = new Sim()
      this.view.reset('start')
      this.world = null
      if (this.grip !== 1) this.world = { city: false, grip: this.grip }
      this.mirror()
    }
    this.t = 0
  }
  mirror () {
    const s = this.view,
      b = this.b
    s.mode = 'ground'
    s.pos.set(b.x, 0, b.z)
    s.vel.set(b.vx, 0, b.vz)
    s.yaw = b.yaw
    s.yawRate = b.w
    s.speed = b.u
    s.slipR = b.slip
    s.steerAng = b.steerAng
    s.accLong = b.accLong
    s.latAcc = b.latAcc
    s.world = 'city'
  }
  // press exactly these keys (codes)
  keys (...codes) {
    for (const c of [...this.held]) if (!codes.includes(c)) {
      this.held.delete(c)
      on.keyup({ code: c })
    }
    for (const c of codes) if (!this.held.has(c)) {
      this.held.add(c)
      on.keydown({ code: c, repeat: false, preventDefault () {} })
    }
  }
  step () {
    this.t += H
    const c = (this.c = this.input.controls(this.view, 'off'))
    if (this.s) {
      // (the Roadster's wet: the grip hook, which its tyres read off the city's streets and the
      // open ground alike: roadGrip.js)
      GRIP.scale = this.grip
      this.s.step(H, c)
      GRIP.scale = 1
    } else {
      this.view.time += H
      stepVehicle(this.b, carInput(c), H, this.world)
      this.mirror()
    }
  }
  run (secs, until) {
    for (let t = 0; t < secs; t += H) {
      this.step()
      if (until && until(this)) return true
    }
    return false
  }
  // state, either kind
  get x () { return this.s ? this.s.pos.x : this.b.x }
  get z () { return this.s ? this.s.pos.z : this.b.z }
  get yaw () { return this.s ? this.s.yaw : this.b.yaw }
  get w () { return this.s ? this.s.yawRate : this.b.w }
  get u () { return this.s ? this.s.speed : this.b.u }
  get v () { return this.s ? Math.hypot(this.s.vel.x, this.s.vel.z) : Math.hypot(this.b.vx, this.b.vz) }
  get lat () { return this.s ? this.s.latAcc : this.b.latAcc }
  get slip () { return this.s ? this.s.slipR : this.b.slip }
  get steerAng () { return this.s ? this.s.steerAng : this.b.steerAng }
  // the body's pitch (rad, + nose down) and roll (rad): the Roadster's as roadster.js draws it
  get pitch () { return this.s ? -Math.max(-0.06, Math.min(0.06, this.s.accLong * 0.0042)) : this.b.pitch }
  get roll () { return this.s ? Math.max(-0.09, Math.min(0.09, this.s.latAcc * 0.0068)) : this.b.roll }
  // put it at speed v going straight, as if cruised there
  at (v) {
    if (this.s) {
      this.s.vel.set(v, 0, 0)
      this.s.speed = v
    } else {
      this.b.vx = v
      this.b.u = v
      this.mirror()
    }
  }
  // hold speed v with W pulses (as a player feathers it) for secs, steering keys as given
  cruise (v, secs, steerKey = null) {
    for (let t = 0; t < secs; t += H) {
      const k = steerKey ? [steerKey] : []
      if (this.u < v) k.push('KeyW')
      this.keys(...k)
      this.step()
    }
  }
}

export function zeroTo100 (k, o) {
  const r = new Rig(k, o)
  r.keys('KeyW')
  r.run(60, r => r.u >= 27.78)
  return r.t
}
// S held from 100 km/h: distance and time to a stop, and the deepest nose dive (deg)
export function brake100 (k, o) {
  const r = new Rig(k, o)
  r.at(27.78)
  r.keys('KeyS')
  let d = 0,
    dive = 0
  while (r.u > 0.05 && r.t < 20) {
    const x = r.x,
      z = r.z
    r.step()
    d += Math.hypot(r.x - x, r.z - z)
    dive = Math.max(dive, r.pitch)
  }
  return { d, t: r.t, dive: dive * DEG }
}
// at v m/s, A pressed: s until the yaw rate reaches 90% of where it settles (after 1.5 s); then let
// go: s until it is back under 10% of that
export function steerResponse (k, v = 20, o) {
  const r = new Rig(k, o)
  r.at(v)
  r.cruise(v, 0.5)
  const trace = []
  const t0 = r.t
  r.cruise(v, 1.5, 'KeyA')
  // (the response read off the run, not a second one)
  const r2 = new Rig(k, o)
  r2.at(v)
  r2.cruise(v, 0.5)
  for (let t = 0; t < 1.5; t += H) {
    r2.cruise(v, H, 'KeyA')
    trace.push(r2.w)
  }
  const ss = Math.abs(trace[trace.length - 1])
  const tIn = trace.findIndex(w => Math.abs(w) >= 0.9 * ss) * H
  // let go
  let tOut = 0
  for (; tOut < 3; tOut += H) {
    r2.cruise(v, H)
    if (Math.abs(r2.w) < 0.1 * ss) break
  }
  return { tIn, tOut, w: ss, t0 }
}
// the most lateral g on full lock at a held speed, the speeds tried in turn, and its roll (deg)
export function maxLat (k, o) {
  let best = 0,
    roll = 0
  for (const v of [8, 12, 16, 20, 25, 30]) {
    const r = new Rig(k, o)
    r.at(v)
    r.cruise(v, 0.3)
    for (let t = 0; t < 3; t += H) {
      r.cruise(v, H, 'KeyA')
      if (t > 1.5) {
        best = Math.max(best, Math.abs(r.lat) / G)
        roll = Math.max(roll, Math.abs(r.roll))
      }
    }
  }
  return { g: best, roll: roll * DEG }
}
// the turning circle (kerb to kerb diameter, m) at 4 m/s on full lock
export function turningCircle (k, o) {
  const r = new Rig(k, o)
  r.at(4)
  r.cruise(4, 4, 'KeyA')
  return (2 * r.v) / Math.max(Math.abs(r.w), 1e-3) + (HANDLING[k].wid || 2)
}
// the handbrake 180 at 60 km/h: A and Space together, let go when it has come 170 degrees round
// (or after 3 s): s to 170, the speed left (km/h) and where it settles 2 s on (deg turned)
export function handbrake180 (k, o) {
  const r = new Rig(k, o)
  r.at(16.67)
  r.cruise(16.67, 0.3)
  const y0 = r.yaw
  let turned = 0,
    last = r.yaw,
    t180 = NaN
  r.keys('KeyA', 'Space')
  for (let t = 0; t < 3; t += H) {
    r.step()
    turned += wrap(r.yaw - last)
    last = r.yaw
    if (Math.abs(turned) >= 170 * Math.PI / 180) {
      t180 = t
      break
    }
  }
  const left = r.v * 3.6
  r.keys()
  for (let t = 0; t < 2; t += H) {
    r.step()
    turned += wrap(r.yaw - last)
    last = r.yaw
  }
  return { t180, left, end: Math.abs(turned) * DEG, y0 }
}
// a J-turn: backing up flat out (S held from a standstill for 3 s), then A with Space: deg turned
// after 1.5 s, and the speed it then pulls away forwards at once W is pressed (1 s on, km/h)
export function jTurn (k, o) {
  const r = new Rig(k, o)
  r.keys('KeyS')
  r.run(3)
  const vRev = -r.u
  let turned = 0,
    last = r.yaw
  r.keys('KeyA', 'Space')
  for (let t = 0; t < 1.2; t += H) {
    r.step()
    turned += wrap(r.yaw - last)
    last = r.yaw
  }
  r.keys('KeyW')
  for (let t = 0; t < 1; t += H) {
    r.step()
    turned += wrap(r.yaw - last)
    last = r.yaw
  }
  return { vRev: vRev * 3.6, turned: Math.abs(turned) * DEG, out: r.u * 3.6 }
}
// slow manoeuvring: braked to a stop from 20 km/h with S held, s from the stop until it backs up at
// 1 m/s; and from a standstill, W pressed, s to 10 km/h (the creep off the line)
export function slow (k, o) {
  const r = new Rig(k, o)
  r.at(5.56)
  r.keys('KeyS')
  r.run(10, r => r.u < 0.05)
  const tStop = r.t
  r.run(10, r => r.u < -1)
  const tRev = r.t - tStop
  const r2 = new Rig(k, o)
  r2.keys('KeyW')
  r2.run(10, r => r.u > 2.78)
  return { tRev, t10: r2.t }
}
// a RWD car's power slide: from 8 m/s, W and A held 2 s: the most the rear axle slides (deg)
export function powerSlide (k, o) {
  const r = new Rig(k, o)
  r.at(8)
  r.keys('KeyW', 'KeyA')
  let slip = 0
  for (let t = 0; t < 2; t += H) {
    r.step()
    slip = Math.max(slip, Math.abs(r.slip))
  }
  return slip * DEG
}

// a lane change at 120 km/h (or the class's top speed): A 0.35 s, D 0.35 s, then hands off: the
// most the rear slides (deg) and s until the yaw rate settles under 0.03 rad/s (twitch or sway)
export function laneChange (k, o) {
  const v = Math.min(33.3, (HANDLING[k].vMax || 40) * 0.92)
  const r = new Rig(k, o)
  r.at(v)
  r.cruise(v, 0.3)
  let slip = 0
  r.cruise(v, 0.35, 'KeyA')
  r.cruise(v, 0.35, 'KeyD')
  let tSettle = 0
  for (let t = 0; t < 4; t += H) {
    r.cruise(v, H)
    slip = Math.max(slip, Math.abs(r.slip))
    if (Math.abs(r.w) > 0.03) tSettle = t + H
  }
  return { slip: slip * DEG, settle: tSettle }
}
// the handbrake into a held drift at 60 km/h: A and Space 0.5 s, then Space let go with A and W
// held for 2 s: the mean drift angle in the last second (deg) and how far round it went (deg)
export function hbDrift (k, o) {
  const r = new Rig(k, o)
  r.at(16.67)
  r.cruise(16.67, 0.3)
  let turned = 0,
    last = r.yaw,
    sum = 0,
    n = 0
  const track = () => {
    turned += wrap(r.yaw - last)
    last = r.yaw
  }
  r.keys('KeyA', 'Space')
  for (let t = 0; t < 0.5; t += H) r.step(), track()
  r.keys('KeyA', 'KeyW')
  for (let t = 0; t < 2; t += H) {
    r.step()
    track()
    if (t > 1) {
      sum += Math.abs(r.slip)
      n++
    }
  }
  return { angle: (sum / n) * DEG, turned: Math.abs(turned) * DEG, v: r.v * 3.6 }
}

// a handbrake flick at 100 km/h: A and Space 0.5 s, then W and A 0.35 s, then W 1.5 s: the most
// the car came round (deg off the way it was going) and the speed it ends at (km/h) - a slide, not
// a spin
export function hbFast (k, o) {
  const r = new Rig(k, o)
  const v = Math.min(27.8, (HANDLING[k].vMax || 40) * 0.9)
  r.at(v)
  r.cruise(v, 0.3)
  let most = 0
  const off = () => (most = Math.max(most, Math.abs(Math.atan2(r.s ? r.s.vel.z * Math.cos(r.yaw) + r.s.vel.x * Math.sin(r.yaw) : r.b.vz * Math.cos(r.yaw) + r.b.vx * Math.sin(r.yaw), r.u))))
  r.keys('KeyA', 'Space')
  for (let t = 0; t < 0.5; t += H) r.step(), off()
  r.keys('KeyA', 'KeyW')
  for (let t = 0; t < 0.35; t += H) r.step(), off()
  r.keys('KeyW')
  for (let t = 0; t < 1.5; t += H) r.step(), off()
  return { most: most * DEG, kmh: r.u * 3.6 }
}

export function row (k, o) {
  const b = brake100(k, o),
    s20 = steerResponse(k, 20, o),
    lat = maxLat(k, o),
    hb = handbrake180(k, o),
    j = jTurn(k, o),
    sl = slow(k, o)
  return {
    k,
    t100: zeroTo100(k, o),
    brakeD: b.d,
    brakeT: b.t,
    dive: b.dive,
    steerIn: s20.tIn,
    steerOut: s20.tOut,
    latG: lat.g,
    roll: lat.roll,
    circle: turningCircle(k, o),
    hb180: hb.t180,
    hbLeft: hb.left,
    hbEnd: hb.end,
    jTurn: j.turned,
    jOut: j.out,
    rev: sl.tRev,
    t10: sl.t10,
    pslide: powerSlide(k, o),
    ...(() => {
      const l = laneChange(k, o),
        d = hbDrift(k, o),
        f = hbFast(k, o)
      return { lcSlip: l.slip, lcSettle: l.settle, drift: d.angle, driftTurn: d.turned, driftV: d.v, fastOff: f.most, fastV: f.kmh }
    })()
  }
}
export const COLS = [
  ['k', 'class', 0],
  ['t100', '0-100 s', 2],
  ['brakeD', '100-0 m', 1],
  ['brakeT', '100-0 s', 2],
  ['dive', 'dive°', 1],
  ['steerIn', 'steer in s', 2],
  ['steerOut', 'centre s', 2],
  ['latG', 'lat g', 2],
  ['roll', 'roll°', 1],
  ['circle', 'circle m', 1],
  ['hb180', 'HB 170° s', 2],
  ['hbLeft', 'HB km/h', 0],
  ['hbEnd', 'HB end°', 0],
  ['jTurn', 'J-turn°', 0],
  ['rev', 'stop→rev s', 2],
  ['t10', '0-10 s', 2],
  ['pslide', 'W+A slip°', 1],
  ['lcSlip', 'LC slip°', 1],
  ['lcSettle', 'LC settle s', 2],
  ['drift', 'drift°', 0],
  ['driftTurn', 'drift turn°', 0],
  ['driftV', 'drift km/h', 0],
  ['fastOff', 'HB@100 off°', 0],
  ['fastV', 'HB@100 km/h', 0]
]
export function table (o) {
  return CLASSES.map(k => row(k, o))
}
const fmt = (v, n) => (typeof v === 'string' ? v : Number.isFinite(v) ? v.toFixed(n) : '—')
export function markdown (rows) {
  const head = '| ' + COLS.map(c => c[1]).join(' | ') + ' |'
  const sep = '| ' + COLS.map(() => '---').join(' | ') + ' |'
  return [head, sep, ...rows.map(r => '| ' + COLS.map(c => fmt(r[c[0]], c[2])).join(' | ') + ' |')].join('\n')
}
if (process.argv[1]?.endsWith('metrics.mjs')) {
  const wet = process.argv.includes('--wet')
  const rows = table(wet ? { grip: 0.7 } : {})
  if (process.argv.includes('--md')) console.log(markdown(rows))
  else {
    console.log(COLS.map(c => c[1].padStart(Math.max(8, c[1].length))).join(' '))
    for (const r of rows) console.log(COLS.map(c => fmt(r[c[0]], c[2]).padStart(Math.max(8, c[1].length))).join(' '))
  }
}
