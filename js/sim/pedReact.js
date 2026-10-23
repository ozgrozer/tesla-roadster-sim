// How someone on foot takes a car bearing down on them (pedBrain.js dodge), GTA V-style: most are
// too slow. Nobody senses a car from afar: they notice it only once it is close in their path (no
// more than SEE m ahead of it, about TIME s off, within LANE m of its side), and then each takes it
// their own way after their own reaction time. Most freeze where they stand, facing it (the
// profile's cower share more, and anyone on the phone); some stumble a step back; some dive late;
// about one in five dives clear after 0.4-0.8 s, and none faster than a lunge (about a metre). A
// stable draw per person (pedProfile.js drawOf), so nothing comes from the people's random numbers.
// Mixed into Peds.
import { drawOf } from './living/pedProfile.js'

const SEE = 18 // m ahead of the car's nose
const TIME = 1.7 // s before it would reach them
const LANE = 1.3 // m out past its side
export const FREEZE = 1,
  STUMBLE = 2,
  LATE = 3,
  DIVE = 4
// how fast each goes (m/s, falling away over the dodge's 0.7 s: crowd.js / peds.js 'dodge')
const PACE = [0, 0, 1.5, 3, 3.6]

export const PED_REACT = {
  // what p does when they see a car coming: freeze, stumble, late or dive
  reactKind (p) {
    const T = this.traits ? this.traits(p) : null
    const u = drawOf(p, 41)
    const phone = p.state === 'idle' && p.act === 1
    const dive = Math.min(0.3, (phone ? 0.08 : 0.2) * (T ? T.alert : 1))
    if (u < dive) return DIVE
    const late = dive + 0.15,
      stumble = late + 0.25 * (1 - (T ? T.cower : 0.2))
    return u < late ? LATE : u < stumble ? STUMBLE : FREEZE
  },
  // s from noticing it to moving
  reactDelay (p, k) {
    const u = drawOf(p, 43)
    if (k === DIVE) return 0.4 + 0.4 * u
    if (k === LATE) return 0.9 + 0.4 * u
    return k === STUMBLE ? 0.35 + 0.35 * u : 0.15 + 0.25 * u
  },
  // th coming at sp m/s, p at (dx, dz) from it, now: the people's clock (s)
  carComing (p, th, sp, dx, dz, now) {
    const st = p.state
    if (st === 'dodge' || st === 'back' || st === 'down' || st === 'brawl') return
    const a = (dx * th.vx + dz * th.vz) / sp - th.hl,
      l = (dz * th.vx - dx * th.vz) / sp
    const near = a > -th.hl * 2 && a < SEE && a < sp * TIME && Math.abs(l) < th.hw + LANE
    if (!p.rk) {
      // (seen it: what they will do, and when)
      if (near && now >= p.rkT) {
        p.rk = this.reactKind(p)
        p.rkT = now + this.reactDelay(p, p.rk)
      }
      return
    }
    if (now < p.rkT) return
    const k = p.rk
    p.rk = 0
    p.rkT = now + 1.5 // (and not again for a moment)
    if (!near) return // (gone by, or turned away)
    if (k === FREEZE) return this.freeze(p, th)
    // sideways from its line, away from it (a stumble half back along the way it is going)
    const sg = Math.abs(l) > 0.15 ? Math.sign(l) : drawOf(p, 47) < 0.5 ? 1 : -1
    const v = PACE[k],
      ux = th.vx / sp,
      uz = th.vz / sp
    const b = k === STUMBLE ? 0.7 : 0,
      s = k === STUMBLE ? 0.7 : 1
    this.lunge(p, (-uz * sg * s + ux * b) * v, (ux * sg * s + uz * b) * v)
  },
  // rooted to the spot, turned to it, a flinch
  freeze (p, th) {
    p.fright = 1
    p.hop = 0.25
    if (p.state !== 'walk' && p.state !== 'idle') return // (crossing, waiting, running: as they were)
    p.state = 'idle'
    p.act = 0
    p.idleT = 1.2 + drawOf(p, 49)
    p.lead = null
    p.yaw = Math.atan2(-(th.z - p.z), th.x - p.x)
  },
  // a dive or a step at (vx, vz) m/s (crowd.js dodge's, slower)
  lunge (p, vx, vz) {
    if (p.state === 'linger') this.leave(p, true) // (up off a bench)
    p.vx = vx
    p.vz = vz
    p.state = 'dodge'
    p.t = 0
    p.hop = 0.35
    p.fright = 1
    p.gait = 1.6
    p.cross = p.aside = null
    p.lead = null
    p.act = 0
  }
}
