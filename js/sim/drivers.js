// The people at the wheel of the traffic, mixed into Traffic (traffic.js). Each driver is their own:
// how fast they like to go (a few dawdle, most keep to about the limit, a fifth press on), how close
// they follow, how hard they pull away and brake, how quickly they react, how bold they are at an
// amber light, and how patient. And they drive like people: the pedals move smoothly (the
// acceleration changes at a limited rate, quicker when they have to brake hard, and at once in an
// emergency), a queue moves off at a green in a wave, each driver a moment after the one ahead has
// moved, they stop a little short of the line and creep up to it, a bold one goes on at an amber
// they could have stopped for, and nobody pulls into a junction with no room to get out of it. A
// lane change is signalled first, then eased over (laneChange.js), and anything that takes a car
// off its lane's line (a swerve, going round a wreck, pulling back into lane after a knock) is
// steered: the heading turns no faster than the tyres allow at that speed, and the car only moves
// sideways as it rolls forward.
import { LOOK, OB, put } from './sight.js'
import { temper } from './manners.js'
import { clamp, wrapPi } from './constants.js'
import {
  RED,
  NODES,
  GREEN,
  YELLOW,
  redAge,
  signal,
  pointAt,
  LANE_OFF,
  amberLeft
} from './city.js'

const QUINTIC = u => u * u * u * (10 + u * (-15 + 6 * u)) // 0 to 1, flat at both ends
const P = { x: 0, z: 0, hx: 1, hz: 0 }

// Who is at the wheel: drawn once per car. T: its type (traffic.js TYPES).
export function temperament (car, R, T) {
  const r = R()
  const pace =
    r < 0.16
      ? 0.8 + R() * 0.1
      : r < 0.8
      ? 0.93 + R() * 0.14
      : 1.1 + R() * 0.24
  const bold = clamp((pace - 0.8) * 1.5 + (R() - 0.5) * 0.6, 0, 1)
  car.bold = bold
  car.v0 = T.cruise * pace // the speed they like, m/s
  car.a = T.acc * (0.8 + bold * 0.45) // pulling away, m/s^2
  car.b = T.brake * (0.85 + bold * 0.35) // the braking they are comfortable with
  car.T = 1.7 - bold * 0.75 + (R() - 0.5) * 0.2 // time gap to the car ahead, s
  car.s0 = 2.8 - bold * 1.1 + R() * 0.3 // gap kept at a standstill, m
  car.react = 0.45 + R() * 0.45 + (1 - bold) * 0.35 // s to move off once they can
  car.jerk = 2.4 + bold * 3 // how quickly the pedals go on and off, m/s^3
  car.lat = T.lat * (0.85 + bold * 0.35) // round a corner, m/s^2
  car.amber = 4.6 - bold * 1.9 // on amber, stops if that takes no harder braking than this
  car.runner = bold > 0.8 && R() < 0.4 // goes on through an amber whenever it can make it
  car.patience = 3 + (1 - bold) * 8 + R() * 4 // s held up before honking or going round
  car.lead = 0.8 + (1 - bold) * 1.5 // s of indicator before moving over
  car.short0 = 0.6 + R() * 2.2 // how far short of the line they first stop, m
  car.gapT = 4.7 - bold * 1.4 // s of gap in the oncoming traffic they take to turn across it
}

export const DRIVE = {
  // the speed a driver takes a turn at
  corner (car, e) {
    return e.kind === 1 ? Math.sqrt(car.lat * e.r) : Infinity
  },

  // (its step, car.lodT, is read from the car: a number passed in costs an allocation)
  drive (car) {
    const e = car.edge,
      dt = car.lodT
    if (car.rev) {
      this.backUp(car, dt) // (react.js)
      const yaw = car.yaw
      this.place(car)
      car.yr = wrapPi(car.yaw - yaw) / dt
      return
    }
    this.lanes(car, dt)
    let gap = this.leader(car),
      vl = this.vl,
      blk = this.lead, // what holds it up (for sorting out a standoff)
      mine = false, // what holds it up is the Roadster
      red = false // (and not a red light it would be waiting at anyway)
    // changing lanes: the car ahead in the lane it is leaving is still in the way
    if (car.lc && car.from)
      for (const o of car.from.cars)
        if (o.s > car.s) {
          const g = o.s - car.s - (o.len + car.len) / 2
          if (g < gap) {
            gap = g
            vl = o.v
            blk = o
          }
          break
        }
    // whatever else is in the way: the Roadster, people in the road, wrecks, cars in the junction
    const W = this.seen
    W.gap = gap
    W.vl = vl
    W.blk = blk
    const me = this.me
    if (me) {
      const mv = this.mev
      put(me.x, me.z, mv.x, mv.z, this.mhx, this.mhz, 2.22, 0.99)
      // (stopped, it is crept past like a wreck)
      this.margin = mv.x * mv.x + mv.z * mv.z < 0.25 ? Math.min(0.5, 0.15 + car.v * 0.06) : 0.5
      this.obstacle(car, OB, me)
      this.margin = 0.5
      this.alert(car)
    }
    const w = this.walker // Optimus, on foot
    if (w) {
      put(w.x, w.z, 0, 0, 1, 0, 0.3, 0.3)
      this.obstacle(car, OB, w)
    }
    for (const p of this.peds) {
      put(p.x, p.z, 0, 0, 1, 0, 0.35, 0.35)
      this.obstacle(car, OB, p)
    }
    // (a wreck at rest is edged round if it reaches into the lane a little, and crept past closer
    // than one still sliding)
    if (!car.panic && !car.tuck && (car.offT || this.loose.length))
      car.offT = e.road && !car.lc ? this.roomRound(car) : 0
    for (const o of this.loose) {
      put(o.x, o.z, o.vx, o.vz, o.hx, o.hz, o.len / 2, o.wid / 2)
      this.margin =
        o.vx * o.vx + o.vz * o.vz < 0.25 ? Math.min(0.5, 0.15 + car.v * 0.06) : 0.5
      this.obstacle(car, OB, o)
    }
    // (a car already crossing the junction when this one comes into it is given room to get by;
    // squeezing out of a standoff, only the cars' bodies count; on a call, going by those pulled
    // over for it, a little closer than usual)
    const late = car.squeeze ? -Infinity : e.move ? car.boxT : Infinity
    this.margin = car.squeeze ? 0.06 : car.siren === 1 ? 0.3 : 0.5
    for (const o of this.box)
      if (o !== car && o.edge !== e) {
        const k = o.boxT < late && o.edge.move ? 1 : 0
        put(o.x, o.z, o.hx * o.v, o.hz * o.v, o.hx, o.hz, o.len / 2 + k * 1.5, o.wid / 2 + k)
        this.obstacle(car, OB, o)
      }
    this.margin = 0.5
    // (a bus swings its nose wide round a corner: the cars at the lines count too)
    if (car.big && car.next) {
      const turn = e.move ? e : car.next.kind === 1 && e.len - car.s < 30 ? car.next : null
      if (turn) this.atLines(car, NODES[turn.node], turn.next[0]?.twin)
    }
    if (car.siren === 1) this.callSees(car) // (on a call: responder.js)
    gap = W.gap
    vl = W.vl
    blk = W.blk
    car.clear = gap
    mine = W.blk === me && !!me
    // (pulling up behind something stopped mid-block that isn't traffic, the Roadster or a wreck, a
    // driver leaves room to pull out round it)
    const odd = vl < 0.5 && (mine || blk?.loose) && e.road && e.twin && !car.lc
    if (odd && car.s + gap < e.len - 15 && gap > car.s0)
      gap = Math.max(car.s0, gap - (this.pullOut(car) + 0.4 - car.s0))
    // the signal at the end of this lane (on a call, its own way over: responder.js; held up in the
    // junction on a left turn, the oncoming traffic: sight.js), and a police car on a call to make
    // way for (makeway.js)
    let g =
      e.move === 'L'
        ? this.turnHold(car, e)
        : !e.road || !car.next
        ? Infinity
        : car.siren === 1
        ? this.callLights(car, e, dt)
        : this.lights(car, e, dt)
    if (car.pull || this.call.on) g = Math.min(g, this.giveWay(car, dt))
    if (g < gap) {
      gap = g
      vl = 0
      blk = null
      mine = false
      red = true
    }
    // held up: by what, for how long
    car.blk = blk
    car.stuck = this.held(car, blk, gap, red) ? car.stuck + dt : 0
    this.unjam(car, dt)
    // the speed it wants: its own, slowing in time for the turn ahead
    let v0 = Math.min(car.v0, this.corner(car, e))
    if (car.next) {
      const vc = this.corner(car, car.next)
      if (vc < v0)
        v0 = Math.min(
          v0,
          Math.sqrt(vc * vc + 1.2 * car.b * Math.max(0, e.len - car.s - 1))
        )
    }
    if (car.tuck) v0 *= 0.7 // tucked in to let the Roadster by
    if (car.squeeze) v0 = Math.min(v0, 1.5)
    const v = car.v
    // intelligent driver model, with the driver's own settings
    let want = car.a * (1 - (v / Math.max(v0, 0.1)) ** 4)
    if (gap < LOOK) {
      const ss =
        car.s0 +
        Math.max(0, v * car.T + (v * (v - vl)) / (2 * Math.sqrt(car.a * car.b)))
      want -= car.a * (ss / Math.max(gap, 0.2)) ** 2
    }
    // startled (react.js): on the brakes, hard
    if (car.panic > 0) {
      car.panic -= dt
      if (car.scare) want = Math.min(want, -car.b * 2.2)
      if (car.panic <= 0) car.offT = 0
    }
    want = clamp(want, -9, car.a)
    // standing: off again once there is a reason to go (the car ahead has moved off, the light
    // has changed), and the driver has reacted to it
    if (v < 0.1 && car.acc <= 0.1) {
      if (want > 0.2 && gap > car.s0 + 0.6) car.wake += dt
      else car.wake = 0
      // (one waiting to turn left is watching for the gap, and quicker off)
      if (car.wake < (car.lw > 2 ? 0.25 : car.react)) want = Math.min(want, 0)
    } else car.wake = 0
    // the pedals: eased on and off, quicker for hard braking
    const da = want - car.acc
    const rate = da > 0 ? car.jerk : want < -car.b ? 40 : car.jerk * 2.5
    car.acc += clamp(da, -rate * dt, rate * dt)
    // about to run into something: the brakes go on at once
    if (gap < LOOK && v > vl + 0.5) {
      const need = (v * v - vl * vl) / (2 * Math.max(gap - 0.3, 0.1))
      if (need > 5) car.acc = Math.min(car.acc, want)
    }
    let nv = v + car.acc * dt
    if (nv <= 0) {
      nv = 0
      // stopped: the brakes hold it, nothing pitches it
      car.acc = Math.max(car.acc, 0)
    }
    car.brake = want < -0.6 || car.acc < -0.8 || nv < 0.3
    car.still = nv < 0.1 ? car.still + dt : 0
    temper(this, car, dt, mine && !red, gap, want)
    car.v = nv
    // never into the car ahead in the lane, whatever else happens (and off its line on a turn, on
    // a wider or a tighter curve: as far round the turn as its speed takes it on that one)
    const o = this.ahead
    let ds = nv * dt
    if (e.kind === 1 && car.off) ds *= e.r / Math.max(1, e.r - e.sg * car.off)
    if (o) {
      const room = o.s - (o.len + car.len) / 2 - 0.25 - car.s
      if (ds > room) {
        ds = Math.max(0, room)
        car.v = Math.min(car.v, o.v)
        car.acc = Math.min(car.acc, 0)
      }
    }
    car.s += ds
    car.odo += ds
    this.steer(car, dt)
    if (car.lc && (car.lc += ds / car.lcLen) >= 1) {
      car.lc = 0
      car.from = null
    }
    const yaw = car.yaw
    while (car.s > car.edge.len) {
      const nx = car.next
      if (!nx) {
        car.s = car.edge.len
        car.v = 0
        break
      }
      car.s -= car.edge.len
      this.detach(car)
      // (on a call, a turn from the lane beside, cut across: it starts it where it is)
      car.off += LANE_OFF[car.edge.lane] - LANE_OFF[nx.lane]
      car.edge = nx
      car.go = car.stop = null
      car.short = car.short0
      if (nx.move) car.boxT = this.t
      this.insert(nx, car)
      car.next = this.choose(nx, car)
    }
    this.place(car)
    car.yr = wrapPi(car.yaw - yaw) / dt // (its yaw rate, for the body's lean)
  },

  // The light at the end of lane e: the gap to where the driver means to stop for it, or Infinity
  // if they go on. A left turn also waits for a gap in the oncoming traffic, and nobody pulls into
  // the junction without room to get out of it on the far side.
  lights (car, e, dt) {
    const toLine = e.len - car.s - car.len / 2
    if (toLine > LOOK || toLine < -car.len / 2) return Infinity
    const node = NODES[e.to],
      st = signal(node, e.dir, this.t),
      v = car.v
    // (moved off into a gap to turn left, but brought to a stop at the line since: it looks again,
    // and at red stays where it is)
    if (car.go === e && st !== YELLOW && v < 0.3 && car.next.move === 'L')
      car.go = null
    // gone on at the amber but held up since, or misjudged it: at red, they stop if they can (and
    // once the red is a second and a half old, anyone who can still stop short of the junction)
    if (car.go === e && st === RED) {
      const room = toLine + car.len / 2 - 0.5
      if (
        (toLine > 0.4 && (v < 0.5 || v * v < 2 * car.b * (toLine - 0.3))) ||
        (room > 0 && v * v < 12 * room && redAge(node, e.dir, this.t) > 1.5)
      )
        car.go = null
    }
    // held up with its nose over the line: at red, it stays put if it can still stop short of the
    // junction proper (moving on, it carries on through); turning left and not yet committed to it,
    // it waits there while anything is coming that it can't get across ahead of
    if (toLine < 0) {
      const room = toLine + car.len / 2 - 0.5,
        toGo = e.len - car.s + 14 + car.len / 2
      if (
        car.go !== e &&
        st !== RED &&
        car.next.move === 'L' &&
        this.coming(car, node, e.dir, toGo)
      )
        return v < 0.3 ? car.s0 - 0.05 : Math.max(0.1, room) + car.s0
      if (st !== RED || car.go === e) return Infinity
      if (v < 0.3) return car.s0 - 0.05 // (stopped: it stays stopped)
      // (and one creeping up to where it can stop stays short of it, not on over it)
      return v * v < 12 * Math.max(room, 0.1)
        ? Math.max(room, 0) + car.s0
        : Infinity
    }
    let stop = car.go !== e && st !== GREEN
    if (stop && st === YELLOW && car.stop !== e) {
      // the amber: stop, if that needs no harder braking than this driver will brake for it; a
      // bold one goes on whenever they will be over the line before it turns red
      const need = (v * v) / (2 * Math.max(0.3, toLine - 0.5))
      const make = toLine < v * (amberLeft(node, e.dir, this.t) - 0.3)
      if (need > car.amber || (car.runner && make)) {
        car.go = e
        stop = false
      } else car.stop = e
    }
    const left = car.next.move === 'L'
    if (!stop && left && toLine < 30 && car.go !== e) {
      stop = this.oncoming(node, e.dir, false, car.gapT)
      // waiting at the line to turn across the oncoming traffic (and moving off into a gap,
      // committed to it)
      car.lw = stop && toLine < 5 ? car.lw + dt : 0
      if (!stop && toLine < 1.5 && v > 1) car.go = e
    } else if (
      stop &&
      left &&
      car.lw > 4 &&
      toLine < 5 &&
      this.sneak(
        car,
        toLine,
        st === YELLOW
          ? amberLeft(node, e.dir, this.t)
          : -redAge(node, e.dir, this.t)
      ) &&
      !this.oncoming(node, e.dir, true)
    ) {
      // as the light changes, the oncoming traffic stops and whoever waited to turn left goes
      car.go = e
      stop = false
    }
    // keep the junction clear: with no room beyond it, wait at the line (if it can still stop)
    if (
      !stop &&
      toLine > 0.5 &&
      toLine < 18 &&
      v * v < 2 * car.b * toLine &&
      !this.room(car)
    )
      stop = true
    if (!stop) return Infinity
    // stopped at the line a while: creep up to it
    if (v < 0.1 && toLine < car.short + 1.5) {
      car.idle += dt
      // (one waiting to turn left edges right up to it)
      if (car.idle > (car.lw > 2 ? 0.5 : 2 + car.react * 2))
        car.short = Math.max(0.3, car.short - dt * 0.4)
    } else car.idle = 0
    // (the IDM keeps s0 back from whatever it stops for: here, that is the line less `short`)
    return toLine - 0.3 - car.short + car.s0
  },

  // Waiting to turn left, can it get going and into the junction before the red is a couple of
  // seconds old? (It has to react first, and pull away from a standstill.)
  sneak (car, toLine, left) {
    const wait = car.v < 0.1 ? Math.max(0, 0.25 - car.wake) : 0
    return wait + Math.sqrt((2 * (toLine + car.len / 2)) / car.a) < left + 2.5
  },

  // Off the lane's line: steered back towards offT (0, or a swerve, or room round a wreck). The
  // heading psi (positive to the right of the lane's) turns at a curvature the tyres can hold at
  // this speed, and the car only moves sideways as it rolls forward.
  steer (car, dt) {
    if (!car.off && !car.psi && !car.offT) return
    const v = car.v
    const grip = car.panic > 0 ? 6 : 3.5
    const kmax = Math.min(0.2, grip / Math.max(v * v, 1))
    const k = clamp(
      0.1 * (car.offT - car.off) - 0.6 * Math.sin(car.psi),
      -kmax,
      kmax
    )
    car.psi = clamp(car.psi + v * k * dt, -0.9, 0.9)
    car.off += v * Math.sin(car.psi) * dt
    if (
      !car.offT &&
      Math.abs(car.off) < 0.01 &&
      Math.abs(car.psi) < 0.003
    )
      car.off = car.psi = 0
  },

  // where the car stands on its lane: changing lanes, eased across from the old one on a smooth
  // S (its nose turned into the move), and any steered offset on top
  place (car) {
    pointAt(car.edge, car.s, P)
    let lat = car.off,
      turn = car.psi
    if (car.lc) {
      const u = car.lc
      lat += car.lat0 * (1 - QUINTIC(u))
      // the slope of the S, across over along
      turn -= Math.atan((car.lat0 * 30 * u * u * (1 - u) * (1 - u)) / car.lcLen)
    }
    car.x = P.x - P.hz * lat
    car.z = P.z + P.hx * lat
    this.setYaw(car, Math.atan2(-P.hz, P.hx) - turn)
  }
}
