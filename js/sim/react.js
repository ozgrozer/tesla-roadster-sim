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

// m off the inner lane's line going round a wreck on the wrong side: in the inner lane the other
// way (as responder.js goes round a queue), or further over, round one reaching across the line
const WRONG_OFF = -3,
  WRONG_MOST = -4.6

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
  // A wrecked car (carDamage.js), which nobody will drive away, too far in to edge round, is gone
  // round on the wrong side of the road by the one held up behind it in the inner lane, once it
  // has waited a while and that side is clear, as a police car goes round a queue (responder.js);
  // once over there, it keeps on round until it is past. (Changing lanes, it does only that: one
  // pulling out into the inner lane behind it goes on round it.)
  roomRound (car) {
    let off = 0
    const e = car.edge,
      round = e.lane === 0 && (car.off < -1.2 || car.offT <= WRONG_OFF)
    for (const o of this.loose) {
      if (o.vx * o.vx + o.vz * o.vz > 0.25) continue
      // (a wreck, or changing lanes, by the lane's own line and way: the car may be turned across
      // it, pulling out)
      const wreck = !!o.dmg?.wreck,
        lined = wreck || !!car.lc,
        hx = lined ? e.dx : car.hx,
        hz = lined ? e.dz : car.hz
      const dx = o.x - car.x,
        dz = o.z - car.z,
        along = dx * hx + dz * hz
      const over = round && wreck
      if (along < (over ? -(o.len + car.len) / 2 - 2 : 0) || along > 25 + o.len)
        continue
      const side = lined
          ? (o.z - e.z0) * e.dx - (o.x - e.x0) * e.dz // (from the lane's line)
          : dz * hx - dx * hz + car.off,
        across =
          (o.len / 2) * Math.abs(o.hx * hz - o.hz * hx) +
          (o.wid / 2) * Math.abs(o.hx * hx + o.hz * hz)
      const need = car.wid / 2 + 0.3 - (Math.abs(side) - across)
      if (over && need > -1) {
        if (car.blk === o && car.clear < 0.8) this.backOff(car) // (wedged)
        return Math.min(car.offT, WRONG_OFF)
      }
      if (need <= 0) continue
      const way = side > 0 ? -1 : 1,
        room = this.dodgeRoom(car, way)
      // (too far in: wait, then change lanes, or go round on the wrong side; changing lanes,
      // only that)
      if (need > Math.abs(room) || car.lc)
        return this.wrongRound(car, o, along, side - across)
      if (need > Math.abs(off)) off = way * need
    }
    return off
  },
  // How far off the lane's line to go round wreck o on the wrong side of the road (along: m ahead
  // of car; left: how far its left side is from the line, m to the right), or 0: from the inner
  // lane, held up behind it a few seconds, with room past it in the inner lane the other way, and
  // that clear until it is past
  wrongRound (car, o, along, left) {
    const e = car.edge
    if (!o.dmg?.wreck || e.lane !== 0 || car.blk !== o || car.v > 3) return 0
    // (one pulling out into its lane goes on round, as it goes)
    if (car.stuck < 3 && !car.lc) return 0
    const off = Math.min(WRONG_OFF, left - car.wid / 2 - 0.5)
    if (off < WRONG_MOST) return 0
    if (car.clear < 4.5) {
      if (car.stuck > 3) this.backOff(car)
      return 0
    }
    const end = car.s + along + o.len / 2 + car.len / 2 + 4
    const clear = this.wrongClear(car, Math.min(end, e.len - car.len / 2 - 0.3))
    return clear ? off : 0
  },
  // (going round a wreck on the wrong side of the road: the cars coming the other way in the lane
  // it is in, and those turning into it, as the police car on a call sees them, responder.js)
  wrongSees (car) {
    const e = car.edge,
      back = e.road ? NODES[e.to].out[(e.dir + 2) % 4]?.[0] : null
    if (!back) return
    for (const o of back.cars) this.seeCar(car, o)
    for (const f of back.feeds) for (const o of f.cars) this.seeCar(car, o)
  },
  // (held up by o coming the other way on this side of the road, round a wreck: it backs up a
  // little to give it room to get by, if there is room behind)
  makeRoom (car, o) {
    if (o.siren !== 1 && o.edge?.dir !== car.edge.dir) this.backOff(car)
  },
  // (too close to a wreck to turn out round it: it backs up a little first, if there is room)
  backOff (car) {
    if (car.v < 0.1 && this.behind(car) > 2 && this.clearBehind(car) > 2)
      car.rev = 2
  },
  // (changing lanes, far enough over into the new one to clear a car o held up in the old one by
  // the time it gets to it, g m on, with a wreck about: o is no longer in its way, or the two could
  // wait on each other for good, o for the wreck and this one for o. How far over: the S of place,
  // drivers.js)
  besideStuck (car, o, g) {
    const u = Math.min(1, car.lc + Math.max(0, g) / car.lcLen),
      over = Math.abs(car.lat0) * u * u * u * (10 - 15 * u + 6 * u * u)
    return (
      over > (car.wid + o.wid) / 2 + 0.2 &&
      o.stuck > 3 &&
      this.loose.some(w => w.dmg?.wreck)
    )
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
      c.s > 1 &&
      this.behind(c) > 2 &&
      this.clearBehind(c) > 2
    )
  },
  // the room behind a car to anything else in the junction (come into it since, from another way):
  // what it would back into
  clearBehind (car) {
    let room = Infinity
    for (const o of this.box) {
      const dx = o.x - car.x,
        dz = o.z - car.z
      if (o === car || Math.abs(dx) > 12 || Math.abs(dz) > 12) continue
      const along = -(dx * car.hx + dz * car.hz),
        side = dz * car.hx - dx * car.hz
      const cos = Math.abs(o.hx * car.hx + o.hz * car.hz),
        sin = Math.abs(o.hx * car.hz - o.hz * car.hx)
      const across = (o.len / 2) * sin + (o.wid / 2) * cos,
        deep = (o.len / 2) * cos + (o.wid / 2) * sin
      if (along < 0 || Math.abs(side) > car.wid / 2 + across + 0.3) continue
      room = Math.min(room, along - car.len / 2 - deep)
    }
    return room
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
  // Backing up (car.rev s more of it), slowly, until there is no more room behind, and easing to a
  // stop at the end of it (it carries on until it has stopped)
  backUp (car, dt) {
    car.rev = Math.max(car.v < -0.05 ? 1e-3 : 0, car.rev - dt)
    const room = Math.min(
      this.behind(car) - 0.9,
      this.clearBehind(car) - 0.9,
      car.s - 0.75
    )
    const vT =
      car.rev > 0.6 ? -Math.min(1.3, Math.sqrt(3 * Math.max(0, room))) : 0
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
  // on (from its tail to their nose), or to one that came in from that lane another way over
  behind (car) {
    const e = car.edge,
      list = e.cars,
      i = list.indexOf(car)
    const inc = e.move ? NODES[e.node].inc[e.dir]?.[e.lane] : null
    let room = Infinity
    if (i > 0) {
      const o = list[i - 1]
      room = car.s - o.s - (o.len + car.len) / 2
    } else if (!inc) return 0
    else {
      const o = inc.cars[inc.cars.length - 1]
      if (o) room = inc.len - o.s - o.len / 2 + car.s - car.len / 2
    }
    if (inc)
      for (const m of inc.next)
        if (m !== e)
          for (const o of m.cars)
            if (o.s <= car.s)
              room = Math.min(room, car.s - o.s - (o.len + car.len) / 2)
    return room
  }
}
