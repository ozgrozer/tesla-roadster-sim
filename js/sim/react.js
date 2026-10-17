// How traffic reacts to the Roadster, mixed into Traffic (traffic.js), the way GTA's drivers do: one
// coming at a car, or cutting in hard in front of it, has its driver stamp on the brakes and swerve
// away from it with a blast of the horn; the Roadster coming down on the road from the air panics
// everyone in front of it; a hard hit on a car has the drivers round about braking and honking. And
// what drivers do about whatever holds them up: two cars each waiting for the other to move (turning
// across each other in a junction) sort it out, the one that came in later backing up to let the
// other by.
import { clamp } from './constants.js'
import { NODES, LANE_OFF, ROAD_HW } from './city.js'
import { honk } from './manners.js'

export const REACT = {
  // The Roadster bearing down on this car: closing fast, in its path (or about to be) within about a
  // second and a half.
  alert (car) {
    if (car.panic > 0) return
    const me = this.me,
      dx = me.x - car.x,
      dz = me.z - car.z
    if (Math.abs(dx) > 45 || Math.abs(dz) > 45) return
    const along = dx * car.hx + dz * car.hz
    if (along < -1) return
    const side = dz * car.hx - dx * car.hz // > 0: on the car's right
    if (Math.abs(side) > 6) return
    const rvx = this.mev.x - car.hx * car.v,
      rvz = this.mev.z - car.hz * car.v
    const d = Math.sqrt(dx * dx + dz * dz) || 1
    const closing = -(dx * rvx + dz * rvz) / d
    if (closing < 7) return
    const ttc = (d - car.len / 2 - 2.2) / closing
    if (ttc > 1.6) return
    // where it will be across the car's path by then: if well clear, it only goes by
    const then = side + (rvz * car.hx - rvx * car.hz) * Math.max(0, ttc)
    if (Math.abs(then) > car.wid / 2 + 1.8) return
    this.startle(car, then, along > 0)
  },
  // brake hard (if the trouble is ahead), swerve away from it, and lean on the horn
  startle (car, side, ahead) {
    car.panic = 1.4 + this.R() * 1.2
    car.scare = ahead
    car.offT =
      car.edge.road && !car.lc ? this.dodgeRoom(car, side > 0 ? -1 : 1) : 0
    if (car.honkT <= 0) honk(this, car, true)
    else car.honkT = Math.min(car.honkT, 0.6) // (a second blast, soon after)
  },
  // How far it can swerve to that side (-1 left, 1 right): within its own half of the road (a
  // little over the centre line, never up the kerb) and not into a car alongside in the other lane.
  dodgeRoom (car, dir) {
    const e = car.edge,
      c = LANE_OFF[e.lane]
    let room =
      dir > 0 ? ROAD_HW - 0.2 - c - car.wid / 2 : c - car.wid / 2 + 0.2
    const t = e.twin
    if (t && t.lane > e.lane === dir > 0)
      for (const o of t.cars)
        if (Math.abs(o.s - car.s) < (o.len + car.len) / 2 + 4)
          room = Math.min(room, 0.35)
    return dir * clamp(room, 0, 1.1)
  },
  // A wreck at rest just ahead reaching into the lane, by little enough to edge round within the
  // lane (or a little over its line): the offset to steer for, else 0 (it waits, then pulls out).
  roomRound (car) {
    let off = 0
    for (const o of this.loose) {
      if (o.vx * o.vx + o.vz * o.vz > 0.25) continue
      const dx = o.x - car.x,
        dz = o.z - car.z,
        along = dx * car.hx + dz * car.hz
      if (along < 0 || along > 25 + o.len) continue
      const side = dz * car.hx - dx * car.hz + car.off, // from the lane's line
        across =
          (o.len / 2) * Math.abs(o.hx * car.hz - o.hz * car.hx) +
          (o.wid / 2) * Math.abs(o.hx * car.hx + o.hz * car.hz)
      const need = car.wid / 2 + 0.3 - (Math.abs(side) - across)
      if (need <= 0) continue
      const way = side > 0 ? -1 : 1,
        room = this.dodgeRoom(car, way)
      if (need > Math.abs(room)) return 0 // (too far in: wait, then change lanes)
      if (need > Math.abs(off)) off = way * need
    }
    return off
  },
  // The Roadster has come down on the road at (x, z): everyone heading at it within 50 m brakes
  // hard and swerves; anyone else close by honks.
  landing (x, z) {
    for (const car of this.cars) {
      if (car.parked || car.loose) continue
      const dx = x - car.x,
        dz = z - car.z
      if (Math.abs(dx) > 50 || Math.abs(dz) > 50) continue
      const along = dx * car.hx + dz * car.hz,
        side = dz * car.hx - dx * car.hz
      if (along > -2 && along < 50 && Math.abs(side) < 6)
        this.startle(car, side, Math.abs(side) < car.wid / 2 + 3.5)
      else if (along * along + side * side < 400 && car.honkT <= 0)
        honk(this, car, this.R() < 0.5)
    }
  },
  // A hard hit at (x, z): the drivers round about brake and honk
  shock (x, z, r = 22) {
    for (const car of this.cars) {
      if (car.parked || car.loose || car.panic > 0) continue
      const dx = x - car.x,
        dz = z - car.z
      if (dx * dx + dz * dz > r * r) continue
      const along = dx * car.hx + dz * car.hz
      if (along > 0) {
        car.panic = 0.8 + this.R()
        car.scare = true
      }
      if (car.honkT <= 0 && this.R() < 0.6) {
        car.honkT = 0
        car.honkIn = 0.2 + this.R() * 0.8
      }
    }
  },

  // Held up, and why: the gap is closed and the car stopped, and what stops it isn't a red light
  // (that is just waiting) nor someone on foot, but something that isn't going anywhere: a wreck, a
  // parked car, the Roadster, or a car itself held up (or, round a ring of them, waiting on this one).
  held (car, blk, gap, red) {
    if (red || car.v > 0.5 || gap > car.s0 + 4 || !blk) return false
    if (blk === this.me) return true
    if (!blk.len) return false // a pedestrian: wait for them
    if (blk.loose || blk.parked) return true
    return (
      blk.v < 0.5 && (blk.stuck > 0 || blk.lw > 1.5 || this.ring(car) !== null)
    )
  },
  // Cars at a standstill in junctions, each waiting on the next round a ring (two turning across
  // each other, or three): of those in a junction with room behind them, the one that came in last,
  // or null if there is no such ring.
  ring (car) {
    let o = car.blk,
      best = this.fits(car, null)
    for (let n = 0; o !== car; n++) {
      if (!o || !o.edge || o.loose || o.v > 0.5 || n > 4) return null
      best = this.fits(o, best)
      o = o.blk
    }
    return best || car
  },
  // (c, if it can back up out of the way and came in later than best; else best)
  fits (c, best) {
    return this.canBack(c) && (!best || c.boxT > best.boxT) ? c : best
  },
  // in the junction (on a turn, or stopped with its nose over the line), with room to back up
  canBack (c) {
    return (
      (c.edge.move || c.s + c.len / 2 > c.edge.len) &&
      c.s > 0.6 &&
      this.behind(c) > 2
    )
  },
  // Round such a ring, that car backs up a few metres to let the others by. If none of them has
  // room to, the one that came in first edges past at a crawl, judging the gap by the cars' bodies
  // alone (without the room drivers usually leave), if there is a gap at all.
  unjam (car, dt) {
    car.squeeze = Math.max(0, car.squeeze - dt)
    if (car.stuck < 2.5 || car.rev || !car.blk?.edge) return
    const r = this.ring(car)
    if (r === car && this.canBack(car)) car.rev = 2.5 + this.R()
    else if (r === car && car.stuck > 6 && this.first(car)) car.squeeze = 3
  },
  // the first into the junction of the ring car is in
  first (car) {
    let o = car.blk
    for (let n = 0; o && o !== car && n < 5; n++) {
      if (o.boxT < car.boxT || (o.boxT === car.boxT && o.id < car.id)) return false
      o = o.blk
    }
    return true
  },
  // Backing up (car.rev s more of it), slowly, until there is no more room behind
  backUp (car, dt) {
    car.rev = Math.max(0, car.rev - dt)
    const room = this.behind(car)
    const vT = car.rev > 0.4 && room > 1 && car.s > 0.6 ? -1.3 : 0
    car.acc = clamp((vT - car.v) * 2.5, -2, 2)
    car.v = clamp(car.v + car.acc * dt, -1.3, 0)
    if (car.s + car.v * dt < 0.5) car.v = 0
    car.s += car.v * dt
    car.odo += car.v * dt
    car.brake = vT === 0
    car.sig = 0
    car.stuck = car.still = 0
    if (!car.rev) car.v = car.acc = 0
  },
  // The room behind a car in a junction: to the car behind it on its turn, or on the lane it came in
  // on (from its tail to their nose)
  behind (car) {
    const e = car.edge,
      list = e.cars,
      i = list.indexOf(car)
    if (i > 0) {
      const o = list[i - 1]
      return car.s - o.s - (o.len + car.len) / 2
    }
    const inc = e.move ? NODES[e.node].inc[e.dir]?.[e.lane] : null
    if (!inc) return 0
    const o = inc.cars[inc.cars.length - 1]
    return o ? inc.len - o.s - o.len / 2 + car.s - car.len / 2 : Infinity
  }
}
