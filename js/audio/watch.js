// What happens round the camera that the sound engine hears as one-shots, watched each frame from
// the sim's state: things rushing past the Roadster, brakes squealing and buses' air brakes, parked
// cars' alarms, wrecks hitting each other, Optimus's footsteps, and the car's side grinding along a
// wall or its wreck along the road; and where the siren of a police car on a call is heard from
// (siren.js).
import { CAR } from '../sim/constants.js'
import { query } from '../sim/city.js'
import { hearSiren } from './siren.js'
import { hearing, panOf, dullness, placeOf } from './ears.js'

const NONE = []

// Things the Roadster passes close and fast: the moment each one is abeam (it stops closing and
// starts drawing away), a rush of air from its side. last: each thing's closing rate last frame.
const last = new Map(),
  seen = new Set(),
  _near = []
function passBy (sound, sim, traffic) {
  const p = sim.mode === 'ground' ? sim.pos : sim.com,
    v = sim.vel
  seen.clear()
  const check = (key, x, z, vx, vz, reach, big) => {
    const rx = x - p.x,
      rz = z - p.z,
      wx = vx - v.x,
      wz = vz - v.z
    const closing = rx * wx + rz * wz,
      w = Math.hypot(wx, wz)
    seen.add(key)
    const before = last.get(key)
    last.set(key, closing)
    const d = Math.hypot(rx, rz)
    if (before < 0 && closing >= 0 && w > 10 && d < reach)
      sound.whoosh(w, panOf(x, z), big, d)
  }
  if (p.y < 8)
    for (const c of query(p.x - 8, p.z - 8, p.x + 8, p.z + 8, _near))
      if (c.r && !c.down) check(c, c.x, c.z, 0, 0, 4.5, false)
  if (p.y < 3.5)
    for (const c of traffic.cars) {
      if (Math.abs(c.x - p.x) > 12 || Math.abs(c.z - p.z) > 12) continue
      const vx = c.loose ? c.vx : c.hx * c.v,
        vz = c.loose ? c.vz : c.hz * c.v
      check(c, c.x, c.z, vx, vz, 6, true)
    }
  for (const k of last.keys()) if (!seen.has(k)) last.delete(k)
}
// a bus coming to a stop lets its air brakes go; as it slows the last few km/h its brakes may
// squeal (and now and then a car's worn pads)
function brakes (sound, traffic) {
  for (const c of traffic.cars) {
    if (c.parked || c.loose) continue
    const was = c.sndV ?? c.v
    c.sndV = c.v
    const squeal =
      was >= 2.2 && c.v < 2.2 && (c.paint * 17.3) % 1 < (c.big ? 0.6 : 0.08)
    const stop = c.big && was > 0.8 && c.v < 0.25
    if (!squeal && !stop) continue
    const k = hearing(c.x, c.z)
    if (k < 0.05) continue
    if (squeal)
      sound.brakeSqueal(0.6 * k, panOf(c.x, c.z), dullness(c.x, c.z), c.big)
    if (stop) sound.airbrake(0.3 * k, panOf(c.x, c.z), dullness(c.x, c.z))
  }
}
// a parked car knocked loose sets its alarm off: one at a time, heard from where it is
export const ALARM = { on: false, k: 0, pan: 0, lp: 20000 }
let alarmCar = null
function alarms (sound, traffic) {
  for (const c of traffic.loose || NONE)
    if (c.parked && !c.jam && !c.sndAlarm) {
      c.sndAlarm = true
      if (!alarmCar) {
        alarmCar = c
        sound.alarm()
      }
    }
  ALARM.on = !!alarmCar && sound.alarmOn()
  if (!ALARM.on) {
    alarmCar = null
    return
  }
  ALARM.k = hearing(alarmCar.x, alarmCar.z)
  ALARM.pan = panOf(alarmCar.x, alarmCar.z)
  ALARM.lp = dullness(alarmCar.x, alarmCar.z)
}

// Grinding along a wall: the sim's bumps come only as the car bounces back into it, a few tenths
// apart, so instead: how near the nearest corner of the car's footprint is to a building's side (m)
const _grind = []
function wallGap (sim) {
  const p = sim.pos,
    fx = Math.cos(sim.yaw),
    fz = -Math.sin(sim.yaw)
  let best = Infinity
  for (const c of query(p.x - 4, p.z - 4, p.x + 4, p.z + 4, _grind)) {
    if (c.r || c.down || c.y0 > p.y + 1 || c.y1 <= p.y + 0.3) continue
    for (let k = 0; k < 4; k++) {
      const a = (k & 1 ? 1 : -1) * CAR.halfL,
        b = (k & 2 ? 1 : -1) * CAR.halfW
      const x = p.x + fx * a + fz * b,
        z = p.z + fz * a - fx * b
      const dx = Math.max(c.x0 - x, 0, x - c.x1),
        dz = Math.max(c.z0 - z, 0, z - c.z1)
      best = Math.min(best, Math.hypot(dx, dz))
    }
  }
  return best
}

// cars knocked loose hitting each other or a post away from the Roadster (whose own knocks the sim
// reports): a sudden loss of speed is a knock where they are (unless the sim reports these itself,
// as 'clash' events)
function wreckHits (sound, traffic, sim) {
  if (sound.clashed) return
  for (const c of traffic.loose || NONE) {
    const v = Math.hypot(c.vx || 0, c.vz || 0),
      was = c.sndLv ?? v
    c.sndLv = v
    if (was - v < 2.5 || Math.hypot(c.x - sim.pos.x, c.z - sim.pos.z) < 7)
      continue
    if (hearing(c.x, c.z) < 0.04) continue
    sound.bump(was - v, 'car', placeOf(c.x, c.z))
  }
}

// Optimus walking up to the car in the opening scene: a footfall each half stride
const walk = { x: 0, z: 0, d: 0, on: false }
function walker (sound, app, traffic) {
  const w = app.intro && traffic.walker
  if (!w) return (walk.on = false)
  if (walk.on) {
    walk.d += Math.hypot(w.x - walk.x, w.z - walk.z)
    if (walk.d > 0.72) {
      walk.d = 0
      sound.robotStep(hearing(w.x, w.z), panOf(w.x, w.z))
    }
  } else walk.d = 0.5
  walk.on = true
  walk.x = w.x
  walk.z = w.z
}

// After a pause (muted, a hidden tab): forget what was seen before it, so nothing goes off at once
// for what changed meanwhile (cars that stopped, slowed, were passed)
export function forget (traffic) {
  last.clear()
  for (const c of traffic.cars) {
    c.sndV = c.v
    c.sndLv = Math.hypot(c.vx || 0, c.vz || 0)
  }
  walk.on = false
}
// all of it, on the mix's world frames in the city (every other frame; the slower watches every
// other one of those)
let frame = 0
export function watch (sound, app, traffic) {
  const sim = app.sim
  frame++
  passBy(sound, sim, traffic)
  if ((frame & 1) === 0) brakes(sound, traffic)
  else alarms(sound, traffic)
  hearSiren(traffic, sound.now)
  walker(sound, app, traffic)
  wreckHits(sound, traffic, sim)
  // the car's side grinding along a wall (any corner within a hand's breadth of it, sliding by)
  if (
    sim.mode === 'ground' &&
    Math.abs(sim.speed) > 1.5 &&
    wallGap(sim) < 0.12
  )
    sound.contact('building', sim.vel.length())
  // the wreck sliding on its roof or side: metal grinding on the road
  if (
    sim.mode === 'crash' &&
    !sim.crashSettled &&
    sim.com.y - (sim.floor || 0) < 1.3
  ) {
    const v = sim.vel.length()
    if (v > 1) sound.contact('ground', v)
  }
}
