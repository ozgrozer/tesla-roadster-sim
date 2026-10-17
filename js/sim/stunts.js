// Street stunts, scored alongside the flips and landings (sim.js): a drift, the car held well
// sideways at speed, scored once it straightens up by how long it lasted and how far sideways it
// went (lost if it ends in a crash); and a near miss, flashing past a car in traffic close enough to
// touch without touching it, worth more the faster it went by and double if it was coming the other
// way.
import { CAR } from './constants.js'

const SIDEWAYS = 0.26 // rad of slip (15 degrees) that counts as a drift; past 1.4 it is a spin
const DRIFT_SPEED = 9 // m/s, about 30 km/h
const MISS = 1 // m of daylight between the cars that still counts as a near miss
const MISS_SPEED = 12 // m/s they pass each other at, at least

// each step of a burnout: every full turn of a donut scores, more for each one on top (to a point)
const DONUT_PTS = 250
export function donuts (s, dt) {
  if (!s.burning) {
    s.donutTurn = 0
    s.donutCount = 0
    return
  }
  s.donutTurn = (s.donutTurn || 0) + s.yawRate * dt
  if (Math.abs(s.donutTurn) < 2 * Math.PI) return
  s.donutTurn -= Math.sign(s.donutTurn) * 2 * Math.PI
  s.donutCount = (s.donutCount || 0) + 1
  const n = s.donutCount
  s.emit('trick', {
    text: n > 1 ? `${n}× Donut` : 'Donut',
    pts: DONUT_PTS * Math.min(n, 4) // (up to four times as much: holding on isn't a jackpot)
  })
}

// each step: the drift so far (s.drifting), and its score once it is over
export function drift (s, dt) {
  const d = s.drifting || (s.drifting = { t: 0, sum: 0, calm: 0 })
  const sp = Math.hypot(s.vel.x, s.vel.z)
  let slip = 0
  if (s.mode === 'ground' && sp > 3) {
    const c = Math.cos(s.yaw),
      sn = Math.sin(s.yaw)
    const u = s.vel.x * c - s.vel.z * sn,
      w = -s.vel.x * sn - s.vel.z * c
    slip = Math.abs(Math.atan2(w, Math.abs(u)))
  }
  if (s.mode === 'ground' && sp > DRIFT_SPEED && slip > SIDEWAYS && slip < 1.4) {
    d.t += dt
    d.sum += slip * dt
    d.calm = 0
    return
  }
  if (d.t === 0) return
  d.calm += dt
  if (d.calm < 0.35 && s.mode === 'ground') return
  if (d.t > 0.8 && s.mode === 'ground') {
    const angle = d.sum / d.t
    s.emit('drift', {
      t: d.t,
      angle,
      pts: Math.round((d.t * angle * 57.3 * 12) / 10) * 10
    })
  }
  d.t = d.sum = d.calm = 0
}

// each step, once traffic has moved: each car the Roadster has just drawn level with and passed
export function nearMisses (tr, sim) {
  if (sim.mode !== 'ground') return
  const v = sim.vel,
    hx = Math.cos(sim.yaw),
    hz = -Math.sin(sim.yaw)
  const sp = v.x * hx + v.z * hz
  for (const car of tr.cars) {
    const dx = car.x - sim.pos.x,
      dz = car.z - sim.pos.z
    if (car.loose || Math.abs(dx) > 14 || Math.abs(dz) > 14) {
      car.miss = undefined
      continue
    }
    const along = dx * hx + dz * hz,
      gap = Math.abs(dz * hx - dx * hz) - CAR.halfW - car.wid / 2
    const was = car.miss
    car.miss = along
    if (!(was > 0 && along <= 0) || gap > MISS || gap < 0) continue
    const theirs = car.v * (car.hx * hx + car.hz * hz),
      rel = sp - theirs
    if (rel < MISS_SPEED) continue
    const oncoming = theirs < -2,
      pts = Math.round((100 + (rel - MISS_SPEED) * 10) / 10) * 10
    sim.emit('nearMiss', { pts: oncoming ? pts * 2 : pts, oncoming })
  }
}
