// Handling metrics for every drivable class (vehicleSim.js), on open flat ground: 0-60 mph,
// braking from 100 km/h, the most lateral g it holds on a ramped circle, the turn radius at full
// lock at 8 and 20 m/s, and the body's worst pose under dt spikes. Used by phys.test.mjs and run
// directly (node --import ./tools/node-loader/register.mjs tests/physMetrics.mjs) for a table.
import { HANDLING, KINDS } from '../js/sim/handling.js'
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'

const H = 1 / 120
const OPEN = { x: -100, z: 300 }
export const CLASSES = KINDS.filter(k => !HANDLING[k].sim)
const inp = o => Object.assign(makeVehicleInput(), o)
const spd = b => Math.hypot(b.vx, b.vz)

export function zeroTo (k, v = 26.82) {
  const b = createVehicleBody(k, OPEN)
  let t = 0
  while (spd(b) < v && t < 60) {
    stepVehicle(b, inp({ throttle: 1 }), H)
    t += H
  }
  return t
}
export function brakeDist (k, v = 27.78) {
  const b = createVehicleBody(k, OPEN)
  b.vx = v
  let d = 0, t = 0
  while (spd(b) > 0.05 && t < 30) {
    const x = b.x, z = b.z
    stepVehicle(b, inp({ brake: 1 }), H)
    d += Math.hypot(b.x - x, b.z - z)
    t += H
  }
  return d
}
// held at speed v at steer s until it settles: its lateral g and the radius it turns on
export function circle (k, v, s = 1, secs = 6, dt = H) {
  const b = createVehicleBody(k, OPEN)
  b.vx = v
  let lat = 0, r = 0
  const ctl = inp({ steer: s, throttle: 0 })
  for (let t = 0; t < secs; t += dt) {
    // (a cruise control holding the speed)
    ctl.throttle = Math.max(0, Math.min(1, (v - b.u) * 0.5 + 0.25))
    stepVehicle(b, ctl, dt)
    if (t > secs - 1) {
      lat = Math.max(lat, Math.abs(b.latAcc) / 9.81)
      r = spd(b) / Math.max(Math.abs(b.w), 1e-3)
    }
  }
  return { lat, r, v: spd(b), slip: Math.abs(b.slip) }
}
// the most lateral g it holds: the speed raised until it can no longer keep the circle
export function maxLat (k) {
  let best = 0
  for (const v of [10, 14, 18, 22, 26, 30]) best = Math.max(best, circle(k, v, 1, 5).lat)
  return best
}
// the body under a dt spike: one stepVehicle of dt after hard braking from 25 m/s
export function spike (k, dt = 0.5) {
  const b = createVehicleBody(k, OPEN)
  b.vx = 25
  let worst = 0
  for (let i = 0; i < 12; i++) {
    stepVehicle(b, inp({ brake: 1, steer: i % 2 ? 1 : -1 }), dt)
    worst = Math.max(worst, Math.abs(b.pitch), Math.abs(b.roll), Math.abs(b.heave))
    if (!Number.isFinite(b.x + b.pitch + b.roll + b.heave)) return Infinity
  }
  return worst
}
export function table () {
  const rows = []
  for (const k of CLASSES) {
    const c8 = circle(k, 8), c20 = circle(k, 20)
    rows.push({ k, t60: zeroTo(k), brake: brakeDist(k), latG: maxLat(k), r8: c8.r, r20: c20.r, spike: spike(k) })
  }
  return rows
}
if (process.argv[1]?.endsWith('physMetrics.mjs')) {
  const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : String(x))
  console.log('class   0-60s  brake100m latG  R@8  R@20  spikePose')
  for (const r of table())
    console.log(r.k.padEnd(7), f(r.t60).padStart(6), f(r.brake, 1).padStart(8), f(r.latG).padStart(6), f(r.r8, 1).padStart(5), f(r.r20, 1).padStart(5), f(r.spike, 3).padStart(9))
}
