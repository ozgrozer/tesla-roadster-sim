// Emergency runs, as in GTA V's living city, mixed into Traffic (traffic.js): now and then (every
// two to four minutes or so, never in the city's first minute) a police car answers a call. It sets
// off out of sight, a couple of hundred metres from the Roadster and heading its way, with its
// light bar flashing and its siren on, and drives a route through the grid to a junction a block or
// two past the Roadster, so that it comes by (responder.js: how it drives; makeway.js: how everyone
// else gets out of its way). Once there it switches off and drives on as ordinary traffic. The run
// keeps its own random numbers: nothing in the traffic's own sequence changes until a car is sent.
import { rng, NODES, LANES, raycast } from './city.js'

const FIRST = [60, 110] // s after the city starts: the first call comes between these
const EVERY = [120, 240] // and between the end of one run and the next call
const LONGEST = 200 // s: a run that hasn't got there by then is called off
const WIND = 8 // s it takes, siren off, to settle back to its own pace
const TURN = { S: 0, L: 0.35, R: 0.35 } // a turn costs a little more than a block straight on
const CUT = 0.3 // and a turn cut across from the other lane a little more again
const P = { x: 0, z: 0 }

// a new run's state (Traffic.call): the car on it, the junction it is crossing (others hold at
// their lines there), the siren's mode, and the whoops given to whatever holds it up
export function newCall (seed) {
  return {
    R: rng(seed * 977 + 31),
    J: new Float32Array(NODES.length * 4), // cost to the destination, by junction and heading
    car: null,
    on: false, // the car on it has its lights and siren on
    next: FIRST[0], // when the next call comes (traffic.t)
    t0: 0,
    dest: -1, // the junction it is going to
    node: null, // the junction it is crossing or about to: held for it
    dir: 0, // and the way it comes into it
    via: null, // the last turn it drove (its way into the junction behind it)
    offT: 0, // where it steers in its lane (responder.js)
    wrong: false, // over on the wrong side of the road, going round a queue
    passEnd: 0, // (and how far along its lane it stays over there)
    stuck: false, // held up by something that won't get out of its way
    mode: 0, // the siren: 0 wail, 1 yelp
    modeT: 0,
    whoops: 0, // how many whoops it has given (the sound plays one each time this goes up)
    whoopT: 0,
    blocked: 0, // s held up by the Roadster
    windT: 0,
    saved: null // its driver's own ways, to go back to
  }
}

export const CALLS = {
  // a new city: the first call a minute or two in
  callReset () {
    const C = this.call
    C.car = null
    C.on = false
    C.node = C.via = null
    C.next = FIRST[0] + C.R() * (FIRST[1] - FIRST[0])
  },
  // each step: a call when one is due, the run under way, its end
  calls (dt, x, z, view) {
    const C = this.call
    const car = C.car
    if (!car) {
      if (this.t >= C.next && !this.dispatch(x, z, view)) C.next = this.t + 5
      return
    }
    if (car.siren === 2) {
      // (siren off: back to its own pace, gently)
      if ((C.windT += dt) > WIND) this.callDone()
      else car.v0 = Math.max(C.saved.v0, car.v0 - 1.5 * dt)
      return
    }
    const e = car.edge
    if (
      car.loose ||
      !e ||
      this.t - C.t0 > LONGEST ||
      (e.move && e.node === C.dest)
    )
      return this.standDown()
    this.inOrder(car)
    this.respond(car, dt) // (responder.js)
  },
  // (it goes by cars in its own lane, pulled over: its lane's list kept in order along it, which
  // is how everyone else finds the car ahead of them)
  inOrder (car) {
    const list = car.edge.cars
    let i = list.indexOf(car)
    while (i >= 0 && i < list.length - 1 && list[i + 1].s < car.s) {
      list[i] = list[i + 1]
      list[++i] = car
    }
  },

  // A police car out of sight 160 to 280 m from (x, z) in an inner lane heading its way, sent to a
  // junction a block or two past (x, z); false if there is nowhere to send one from just now.
  dispatch (x, z, view) {
    const C = this.call,
      R = C.R
    for (let tries = 0; tries < 60; tries++) {
      const e = LANES[Math.floor(R() * LANES.length)]
      if (e.closed || e.lane !== 0) continue
      const s = 8 + R() * (e.len - 40)
      const px = e.x0 + e.dx * s,
        pz = e.z0 + e.dz * s
      const d = Math.hypot(px - x, pz - z)
      if (d < 160 || d > 280) continue
      // (heading towards the Roadster, and never where the camera can see it: behind it, or with
      // buildings in the way)
      if (((x - px) * e.dx + (z - pz) * e.dz) / d < 0.35) continue
      if (
        view &&
        (px - view.x) * view.fx + (pz - view.z) * view.fz > -20 &&
        raycast(view.x, 2, view.z, px, 1.5, pz) > 0.97
      )
        continue
      const near = o => Math.abs(o.s - s) < o.len + 14 + o.v * 1.5
      if (e.cars.some(near) || e.twin?.cars.some(near)) continue
      const by = o => Math.abs(o.x - px) < 14 && Math.abs(o.z - pz) < 14
      if (this.peds.some(by) || this.loose.some(by)) continue
      // where it goes: the junction nearest a point a block or two past the Roadster
      const k = (96 + R() * 110) / d
      P.x = x + (x - px) * k
      P.z = z + (z - pz) * k
      const dest = this.nearestNode(P.x, P.z)
      if (dest === e.to || dest === e.from || !this.plan(dest, e)) continue
      // (it takes the place of a car on the road out of sight: as many out as ever)
      if (this.n >= this.want()) this.leave(x, z, view, false)
      this.send(e, s)
      return true
    }
    return false
  },
  nearestNode (x, z) {
    let best = -1,
      bd = Infinity
    for (const n of NODES) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2
      if (d < bd) {
        bd = d
        best = n.i
      }
    }
    return best
  },
  // The cost to get to junction dest from each junction, arriving with each heading, over the open
  // streets (a turn from either lane: on a call, it cuts across the other lane to make it): true if
  // it can get there from the end of lane e.
  plan (dest, e) {
    const C = this.call,
      J = C.J
    J.fill(Infinity)
    for (let k = 0; k < 4; k++) J[dest * 4 + k] = 0
    for (let pass = 0, moved = true; moved && pass < 60; pass++) {
      moved = false
      for (const n of NODES)
        for (let k = 0; k < 4; k++) {
          const i = n.i * 4 + k,
            arm = n.inc[k]
          if (!arm || n.i === dest) continue
          for (const lane of arm)
            for (const m of lane.next) {
              const o = m.next[0]
              if (o.closed) continue
              const c =
                1 + TURN[m.move] + (lane.lane ? CUT : 0) + J[o.to * 4 + o.dir]
              if (c < J[i] - 1e-6) {
                J[i] = c
                moved = true
              }
            }
        }
    }
    C.dest = dest
    return J[e.to * 4 + e.dir] < Infinity
  },
  // the police car itself, on lane e at s, already on its way
  send (e, s) {
    const C = this.call
    const car = this.make(this.police, true, C.R)
    car.edge = e
    car.s = s
    car.v = 11
    car.siren = 1
    this.insert(e, car)
    // (its driver's own ways, and those of a run: quick, braking hard, no honking, no overtaking)
    C.saved = {
      v0: car.v0,
      a: car.a,
      b: car.b,
      T: car.T,
      s0: car.s0,
      react: car.react,
      lat: car.lat,
      jerk: car.jerk,
      patience: car.patience
    }
    Object.assign(car, {
      a: 3.1,
      b: 4.2,
      T: 0.9,
      s0: 2.2,
      react: 0.35,
      lat: 3.5,
      jerk: 6,
      patience: 1.5,
      passT: 1e9,
      honkT: 1e9
    })
    car.next = this.choose(e, car)
    this.place(car)
    this.n++
    C.car = car
    C.on = true
    C.t0 = this.t
    C.node = C.via = null
    C.offT = 0
    C.wrong = C.stuck = false
    C.mode = C.modeT = C.blocked = 0
    C.whoopT = 0
  },
  // Where the car on a call goes at the end of lane e: the move that costs least to get there, from
  // its own lane or (cut across at the junction: drivers.js) the one beside it; and out of a turn,
  // on into the inner lane (easing over to it from where it comes out).
  route (e, car) {
    const C = this.call,
      J = C.J
    if (e.move) {
      const o = e.next[0]
      return o.lane === 1 && o.twin && !o.twin.closed ? o.twin : o
    }
    let best = null,
      bc = Infinity
    for (let l = 0; l < 2; l++) {
      const L = l === 0 ? e : e.twin
      if (!L) continue
      for (const m of L.next) {
        const o = m.next[0]
        if (o.closed) continue
        const c =
          TURN[m.move] +
          (L !== e ? CUT : 0) +
          (e.to === C.dest ? 0 : J[o.to * 4 + o.dir])
        if (c < bc) {
          bc = c
          best = m
        }
      }
    }
    return best || e.next[0] || null
  },
  // There: the siren and the lights off, and back to its own ways over a few seconds
  standDown () {
    const C = this.call,
      car = C.car
    C.on = false
    C.node = C.via = null
    car.siren = 2
    car.flash = false
    const v0 = car.v0
    Object.assign(car, C.saved)
    car.v0 = Math.max(C.saved.v0, Math.min(v0, car.v))
    car.passT = 2
    car.honkT = 2
    car.offT = 0
    C.windT = 0
    C.next = this.t + EVERY[0] + C.R() * (EVERY[1] - EVERY[0])
  },
  callDone () {
    const C = this.call
    if (C.car) {
      if (C.car.siren === 1) this.standDown()
      C.car.siren = 0
      C.car.v0 = C.saved.v0
    }
    C.car = null
  },
  // (the car on the call taken off the road: the run is over)
  callGone (car) {
    const C = this.call
    if (car !== C.car) return
    if (car.siren === 1) this.standDown()
    C.car = null
  },
  // Is a car on a call crossing, or about to cross, junction node? (People waiting to cross there
  // stay on the kerb: peds.js)
  urgent (node) {
    const C = this.call
    return C.on && C.node === node
  }
}
