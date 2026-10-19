// How the car on a call drives (calls.js), mixed into Traffic (traffic.js), on top of the driving
// every car does (drivers.js): fast, a police car up to about 75 km/h in town, an ambulance a
// little less and a fire engine, long and heavy, about 60 (all less in the wet or the fog), braking
// hard for each junction and going over it at a crawl, once it is clear, when its light is red or
// anyone is in it; past the traffic pulled over for it (makeway.js) slower, over towards the
// centre line; round a queue that can't get out of its way (or the Roadster) on the wrong side of
// the road when that is clear; and when the Roadster sits in its way, slowing, flashing its
// headlights and giving a whoop of the siren, then going round it when it can. Its siren wails on
// the open road and yelps at the junctions (an ambulance's goes to its hi-lo now and then), and a
// fire engine blows its air horn coming up to each junction.
import { ENV } from './env.js'
import { OB, put } from './sight.js'
import { clamp } from './constants.js'
import { NODES, GREEN, signal } from './city.js'

// The kinds that go on calls (carTypes.js TYPES' names), and how each drives a run: vmax, its top
// speed in town (m/s); pass, going by the cars pulled over for it; over, over a clear junction on a
// green; wrong, on the wrong side of the road; brake, what it slows at for a junction or the cars
// ahead (m/s^2); room, the room it needs beyond a police car's to be put down on a lane, to go
// round on the wrong side (m, and half as many s to get back in); and its driver's ways on the run
// (calls.js send): pulling away (a) and braking (b), the time gap (T) and the gap kept standing
// (s0), the reactions, the corners (lat) and the pedals (jerk). A fire engine is slowest to speed
// up and to stop, and takes the corners slowest.
export const KINDS = ['police', 'ambulance', 'fire']
// prettier-ignore
export const RUNS = [
  { vmax: 20.8, pass: 10, over: 15, wrong: 7, brake: 3.6, room: 0, a: 3.1, b: 4.2, T: 0.9, s0: 2.2, react: 0.35, lat: 3.5, jerk: 6 },
  { vmax: 19.4, pass: 9.5, over: 14, wrong: 6, brake: 3.2, room: 2, a: 2.5, b: 3.7, T: 1, s0: 2.4, react: 0.4, lat: 3, jerk: 5 },
  { vmax: 16.7, pass: 8, over: 11, wrong: 4.5, brake: 2.5, room: 6, a: 1.5, b: 2.9, T: 1.3, s0: 3, react: 0.5, lat: 2.3, jerk: 3.5 }
]
const CRAWL = 2 // up to the line of a junction it can't simply drive over
const SIDE = -3 // on the wrong side: off its lane's line, into the inner lane the other way
const HORN = 45 // m short of a junction a fire engine blows its air horn: a long blast, two short

export const RESPOND = {
  // each step, before it drives: the junction held for it, how fast it goes, where in the lane,
  // what the siren does
  respond (car, dt) {
    const C = this.call,
      H = RUNS[C.kind],
      e = car.edge,
      me = this.me
    // the junction it is crossing, or coming up to (or whose box its tail is still in)
    let node = null
    if (e.move) {
      node = NODES[e.node]
      C.dir = e.dir
      C.via = e
    } else if (e.road) {
      const toLine = e.len - car.s - car.len / 2
      if (C.via && C.via.node === e.from && car.s < car.len / 2 + 1.5) {
        node = NODES[e.from]
        C.dir = C.via.dir
      } else if (
        C.wrong ||
        toLine < 35 ||
        (toLine < 75 && toLine < 6 * Math.max(car.v, 1))
      ) {
        node = NODES[e.to]
        C.dir = e.dir
      }
    }
    C.node = node
    // how fast: its top speed in the weather, slower going by those pulled over, braking for the
    // junction ahead (over it at a crawl unless the light is green and the junction clear)
    const wet = Math.max(ENV.wet, 0.75 * ENV.rain)
    let v = H.vmax * (1 - 0.12 * wet - 0.1 * ENV.fog)
    const d = this.slowAhead(car)
    if (d < 70)
      v = Math.min(
        v,
        Math.sqrt(H.pass * H.pass + 2 * H.brake * Math.max(0, d - 6))
      )
    if (C.wrong) v = Math.min(v, H.wrong)
    if (e.road && car.next) {
      const toLine = e.len - car.s - car.len / 2,
        n = NODES[e.to]
      let vj =
        car.go === e ||
        (signal(n, e.dir, this.t) === GREEN && this.clearAt(n, car))
          ? H.over
          : CRAWL
      if (car.next.kind === 1) vj = Math.min(vj, this.corner(car, car.next))
      v = Math.min(
        v,
        Math.sqrt(vj * vj + 2 * H.brake * Math.max(0, toLine - 1))
      )
      if (C.kind === 2) this.airHorn(e, toLine)
    } else if (e.move) v = Math.min(v, H.over)
    car.v0 = Math.max(v, 0.5)
    // behind something that won't get out of its way it keeps well back, with room to pull out
    // round it; where in its lane: over towards the centre line past those pulled over, or round on
    // the wrong side of the road what can't get out of its way
    const b = car.blk
    C.stuck =
      !!b &&
      (b === me || (!!b.edge && !b.loose && b.v < 3 && !this.passable(car, b)))
    car.s0 = C.stuck && !C.wrong ? 9 + H.room : H.s0
    this.wayBy(car)
    // held up by the Roadster: its headlights flashing, and a whoop of the siren now and then
    const held =
      !!me && car.blk === me && car.clear < 28 && (car.v < 6 || car.clear < 12)
    C.blocked = held ? C.blocked + dt : Math.max(0, C.blocked - 2 * dt)
    car.flash = C.blocked > 0.3
    if (C.blocked > 0.6 && this.t >= C.whoopT) {
      C.whoops++
      C.whoopT = this.t + 2.2 + C.R() * 1.6
    }
    // the siren: the yelp coming up to a junction and over it, going by close, round a queue or
    // held up; the wail on the open road, with a spell of the yelp now and then on a long run (an
    // ambulance's wail and its hi-lo by turns instead: the other each time it is back on the open
    // road, and each ten seconds of it)
    const junction = e.move || (e.road && e.len - car.s - car.len / 2 < 35)
    const busy = junction || d < 30 || C.wrong || C.blocked > 0
    const want = busy ? 1 : C.open
    C.modeT += dt
    if (want !== C.mode && C.modeT > 2.5) {
      if (C.kind === 1 && want === 1) C.open = 2 - C.open
      C.mode = want
      C.modeT = 0
    } else if (C.mode !== 1 && C.modeT > 10) {
      if (C.kind === 1) C.open = C.mode = 2 - C.mode
      else C.mode = 1
      C.modeT = C.kind === 1 ? 0 : -1
    }
    // (a fire engine's blasts of the air horn, each when it is due)
    if (C.hornN > 0 && this.t >= C.hornT) {
      C.long = C.hornN === 3
      C.horns++
      C.hornT = this.t + (C.long ? 1.3 : 0.6) + 0.2 * ((C.horns * 0.618) % 1)
      C.hornN--
    }
  },
  // A fire engine coming up to junction e.to (toLine m off): its air horn, a long blast and two
  // short, once for each junction
  airHorn (e, toLine) {
    const C = this.call
    if (toLine > HORN || toLine < 4 || C.hornAt === e.to) return
    C.hornAt = e.to
    C.hornN = 3
    C.hornT = this.t
  },
  // where it steers in its lane (C.offT; drivers.js applies it as the car drives)
  wayBy (car) {
    const C = this.call,
      e = car.edge
    C.offT = 0
    // (in the kerb lane, back over to the inner one as soon as there is room)
    if (
      e.road &&
      e.lane === 1 &&
      e.twin &&
      !car.lc &&
      car.v > 2 &&
      car.s > 4 &&
      car.s < e.len - 25 &&
      Math.abs(car.off) < 0.4 &&
      this.canMerge(e.twin, car)
    )
      this.swap(car)
    if (!e.road || e.lane !== 0 || car.lc) {
      C.wrong = false
      return
    }
    // round on the wrong side until it is past (or over the line, into the junction)
    if (C.wrong && car.s > C.passEnd) C.wrong = false
    if (!C.wrong && C.stuck && car.v < 5 && car.clear < 30) {
      const end = this.queueEnd(car),
        line = e.len - car.len / 2 - 0.3
      const passEnd = Math.min(line, end + car.len / 2 + 6)
      if (end > car.s && this.wrongClear(car, passEnd)) {
        C.wrong = true
        C.passEnd = passEnd > line - 8 ? line : passEnd
      }
    }
    if (C.wrong) {
      C.offT = SIDE
      return
    }
    const need = this.squeeze(car),
      oncoming = need > 0 && this.oncomingNear(car)
    if (need > 0) C.offT = -clamp(need, 0.6, oncoming ? 1.1 : 1.45)
    // (never back over towards the kerb while going by them, unless to make room for one coming
    // the other way, nor while a car is still alongside)
    if (C.offT > car.off && ((need > 0 && !oncoming) || this.alongside(car)))
      C.offT = car.off
  },
  // a car in its lane, or the Roadster, alongside it (overlapping it along the lane)
  alongside (car) {
    for (const o of car.edge.cars)
      if (o !== car && Math.abs(o.s - car.s) < (o.len + car.len) / 2 + 1.5)
        return true
    const me = this.me
    if (!me) return false
    const dx = me.x - car.x,
      dz = me.z - car.z
    return (
      Math.abs(dx * car.hx + dz * car.hz) < car.len / 2 + 4 &&
      dz * car.hx - dx * car.hz > 0 &&
      dz * car.hx - dx * car.hz < 4
    )
  },
  // (as it drives, after the obstacles: its offset; the cars ahead in its own lane by their bodies
  // and its own way past them, not simply as the next in line (sight.js leader leaves them out),
  // so that it goes by those pulled over; and on the wrong side of the road, the cars coming the
  // other way in that lane)
  callSees (car) {
    const C = this.call,
      e = car.edge
    if (e.road && !car.lc && !car.panic) car.offT = C.offT
    this.margin = 0.3
    const list = e.cars
    if (!car.lc)
      for (let i = list.indexOf(car) + 1; i < list.length; i++) {
        const o = list[i]
        if (o.s - car.s > 70) break
        this.seeCar(car, o)
      }
    const back =
      e.road && car.off < -1.5 ? NODES[e.to].out[(e.dir + 2) % 4]?.[0] : null
    if (back) {
      for (const o of back.cars) this.seeCar(car, o)
      for (const f of back.feeds) for (const o of f.cars) this.seeCar(car, o)
    }
    this.margin = 0.5
    // (held up at a crawl by a car it has the room to get by, side by side in the lane, only as
    // its nose points a little towards it: it creeps on, straightening as it rolls)
    const W = this.seen,
      b = W.blk
    if (
      b?.edge === e &&
      W.gap < 5 &&
      car.v < 1 &&
      Math.abs(car.psi) < 0.06 &&
      this.passable(car, b)
    ) {
      W.gap = Math.max(W.gap, car.s0 + 2)
      W.vl = 0
    }
  },
  seeCar (car, o) {
    put(o.x, o.z, o.hx * o.v, o.hz * o.v, o.hx, o.hz, o.len / 2, o.wid / 2)
    this.obstacle(car, OB, o)
  },
  // The light at the end of lane e for the car on a call: over on a green if the junction is
  // clear; otherwise up to the line (at a crawl: respond) and over once it is clear.
  callLights (car, e, dt) {
    const toLine = e.len - car.s - car.len / 2
    if (toLine > 70 || toLine < -car.len / 2 || car.go === e) return Infinity
    const node = NODES[e.to]
    const clear = this.clearAt(node, car)
    if (clear && signal(node, e.dir, this.t) === GREEN) {
      if (toLine < 12) car.go = e
      return Infinity
    }
    if (clear && toLine < 2.5 && car.v < 3) {
      car.go = e
      return Infinity
    }
    return toLine - 0.3 + car.s0
  },
  // Nothing in junction node (but whoever is ahead of it on its own way over), and nobody coming up
  // to it too fast to stop: everyone else holds at their lines for it (makeway.js)
  clearAt (node, car) {
    const mine = car.edge.dir
    for (let k = 0; k < 4; k++) {
      const arm = node.inc[k]
      if (!arm) continue
      for (let l = 0; l < arm.length; l++) {
        const L = arm[l]
        for (const m of L.next)
          for (const o of m.cars)
            if (o !== car && !(m === car.next && o.v > 2)) return false
        if (k === mine) continue
        const o = L.cars[L.cars.length - 1]
        if (!o) continue
        const d = L.len - o.s - o.len / 2
        if (d < 30 && o.v > 1 && o.v * o.v > 6 * Math.max(0, d - 0.5))
          return false
      }
    }
    return true
  },
  // Can it get by o, ahead of it in its lane? Over far enough (and staying there) for it to pass
  // at its own offset with room to spare.
  passable (car, o) {
    if (o.lc || !o.edge) return false
    const side = o.off - car.off
    if (Math.abs(side) - (o.wid + car.wid) / 2 < 0.3) return false
    // (not on its way back over towards it)
    return (o.offT - o.off) * side > -0.02
  },
  // how far over it needs to be to get by those pulled over ahead in its lane (0: none to pass)
  squeeze (car) {
    const list = car.edge.cars
    let need = 0
    for (let i = list.indexOf(car) + 1; i < list.length; i++) {
      const o = list[i]
      if (o.s - car.s > 45) break
      if (o.pull === 1 || o.v < car.v - 3 || o.v < 2) {
        const off = Math.max(0, Math.min(o.off, o.offT))
        need = Math.max(need, (car.wid + o.wid) / 2 + 0.35 - off)
      }
    }
    return need
  },
  // the gap to the nearest car ahead of it going its way (in its lane or the one beside) that is
  // pulled over or slow: what it slows down to go by
  slowAhead (car) {
    const e = car.edge
    if (!e.road) return Infinity
    let best = Infinity
    for (let l = 0; l < 2; l++) {
      const L = l === 0 ? e : e.twin
      if (!L) continue
      for (const o of L.cars) {
        const d = o.s - car.s - (o.len + car.len) / 2
        if (o === car || d < -1 || d > best) continue
        if (o.pull === 1 || o.v < Math.min(8, car.v - 4)) best = Math.max(0, d)
      }
    }
    return best
  },
  // anyone coming the other way in the inner lane, within 50 m ahead
  oncomingNear (car) {
    const e = car.edge,
      back = NODES[e.to].out[(e.dir + 2) % 4]?.[0]
    if (!back) return false
    for (const o of back.cars) {
      const x = e.len - o.s - car.s
      if (x > -8 && x < 50) return true
    }
    return false
  },
  // The far end (m along its lane) of what holds it up: the Roadster, or a queue nose to tail (-1,
  // not to be gone round: a queue up to the line led by a car turning left, which would turn across
  // it there)
  queueEnd (car) {
    const me = this.me
    if (car.blk === me)
      return car.s + (me.x - car.x) * car.hx + (me.z - car.z) * car.hz + 2.4
    const e = car.edge,
      list = e.cars
    let end = -1,
      prev = car
    for (let i = list.indexOf(car) + 1; i < list.length; i++) {
      const o = list[i]
      if (o.s - o.len / 2 - (prev.s + prev.len / 2) > 12 || o.v > 4) break
      end = o.s + o.len / 2
      prev = o
    }
    if (prev !== car && prev.next?.move === 'L' && e.len - end < 8) return -1
    return end
  },
  // Clear to go round on the wrong side up to passEnd (m along its lane): the inner lane the other
  // way empty over that stretch for as long as it will take (with whatever is coming along it), and
  // nothing turning into it from the junction ahead, or about to
  wrongClear (car, passEnd) {
    const e = car.edge
    if (car.s < 2 || e.len - car.s > 80) return false
    const back = NODES[e.to].out[(e.dir + 2) % 4]?.[0]
    if (!back || back.closed) return false
    const H = RUNS[this.call.kind],
      T = (passEnd - car.s) / H.wrong + 2.5 + H.room / 2
    for (const o of back.cars) {
      const x = e.len - o.s
      if (x + o.len / 2 < car.s - car.len / 2 - 1) continue // (behind it)
      if (x - o.len / 2 - o.v * T < passEnd + 10 + H.room) return false
    }
    for (const f of back.feeds) {
      if (f.cars.length) return false
      const L = NODES[f.node].inc[f.dir]?.[f.lane],
        o = L?.cars[L.cars.length - 1]
      if (o && o.v > 1.5 && L.len - o.s - o.len / 2 < 6 + (o.v * o.v) / 6)
        return false
    }
    return !this.me || this.meClear(car, back)
  },
  // (the Roadster isn't in the lanes' lists: not in that lane ahead of it, nor coming along it)
  meClear (car, back) {
    const me = this.me,
      dx = me.x - car.x,
      dz = me.z - car.z
    const along = dx * car.hx + dz * car.hz,
      side = dz * car.hx - dx * car.hz
    return along < -4 || along > 80 || side > -1.6 || side < -6.5
  }
}
