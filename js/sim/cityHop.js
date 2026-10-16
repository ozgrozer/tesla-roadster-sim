// Autopilot's way out of a traffic jam: the route to the gridlock, a clear spot on the road beyond
// whatever holds the car up, and the hop there: straight up on the lift thrusters until it clears the
// cars, along the street on the main thrusters, then down on a landing burn onto the open road.
import { JAM } from './jam.js'
import { LANES } from './city.js'
import { G, CAR, LIFT_ACC, clamp, wrapPi, makeControls } from './constants.js'

const ALT = 8.5 // m over the road: clear of a bus, and of the signal heads over the junctions
const CLEAR = 4.6 // m up before it moves forward over the car in front
const CRUISE = 25 // m/s along the street
const FLARE = 0.32 // rad nose-up on the way down: the lift thrusters tilt back and slow it

// Lanes into the jammed street: for each road lane, the turn to take to get closer to the gridlock,
// found by searching the lane graph back from the lanes that run straight into it. (Lane changes are
// free: a lane and the one beside it share their plan.)
export function routeToJam () {
  const plan = new Map()
  // the approach lanes: whatever goes straight on into a jammed lane
  const into = new Set(JAM)
  let front = []
  for (const L of LANES)
    for (const c of L.next)
      if (c.move === 'S' && into.has(c.next[0])) {
        plan.set(L, c)
        front.push(L)
      }
  // breadth-first, backwards: a lane that leads onto a planned lane (or the one beside it) takes
  // that turn
  const seen = new Set()
  const mark = L => {
    seen.add(L)
    if (L.twin) seen.add(L.twin)
  }
  front.forEach(mark)
  while (front.length) {
    const next = []
    for (const L of LANES) {
      if (seen.has(L) || L.closed) continue
      const c = L.next.find(c => !c.next[0].closed && seen.has(c.next[0]))
      if (!c) continue
      plan.set(L, c)
      next.push(L)
    }
    next.forEach(mark)
    front = next
  }
  return plan
}

// A clear spot to come down on, straight down the road ahead: on a lane (not in a junction), past
// `beyond` m, with nothing within 7 m and the lane clear for 40 m on (it rolls on after it lands).
// Returns { x, z, lane, s } or null.
export function landingSpot (edge, s0, traffic, beyond = 0, max = 160) {
  let e = edge,
    s = s0,
    run = 0
  for (let guard = 0; guard < 12 && e; guard++) {
    if (e.road && !e.closed)
      for (let t = Math.max(s, 9); t < e.len - 9; t += 3) {
        const d = run + t - s
        if (d < Math.max(14, beyond)) continue
        if (d > max) return null
        const x = e.x0 + e.dx * t,
          z = e.z0 + e.dz * t
        if (traffic.cars.every(c => clear(c, x, z, e.dx, e.dz)))
          return { x, z, lane: e, s: t }
      }
    run += e.len - s
    s = 0
    if (run > max) return null
    // on along the road: through the junction, straight on
    e = e.road ? e.next.find(c => c.move === 'S') : e.next[0]
  }
  return null
}

function clear (c, x, z, dx, dz) {
  const rx = c.x - x,
    rz = c.z - z
  const along = rx * dx + rz * dz,
    across = Math.abs(rz * dx - rx * dz)
  return Math.hypot(rx, rz) > 7 && !(across < 3.2 && along > -12 && along < 40)
}

// The flight to `to` (a landingSpot); update(dt) gives the controls, `done` once it is back on its
// wheels. Traffic keeps moving underneath, so it looks again at where it means to come down as it
// goes, moves on down the road if a car has turned up there, and never settles onto a car.
export class Hop {
  constructor (sim, to, traffic) {
    this.sim = sim
    this.to = to
    this.traffic = traffic
    this.down = false
    this.t = 0
    this.look = 0
    this.done = false
  }
  // a car under the Roadster (or about to be), too close to come down on
  under (p, v) {
    const x = p.x + v.x * 0.5,
      z = p.z + v.z * 0.5
    return this.traffic.cars.some(
      c => Math.hypot(c.x - x, c.z - z) < c.len / 2 + 3.5
    )
  }
  update (dt) {
    const s = this.sim,
      c = makeControls()
    c.fan = false
    this.t += dt
    if (s.mode === 'crash' || (s.mode === 'ground' && this.t > 0.6)) {
      this.done = true
      return c
    }
    if (s.mode !== 'air') {
      c.lift = 1 // off the road
      return c
    }
    const p = s.com,
      v = s.vel,
      f = s.fwd()
    const alt = p.y - CAR.comH - s.floor
    if ((this.look -= dt) < 0) {
      this.look = 0.25
      const T = this.to
      if (
        !this.traffic.cars.every(c => clear(c, T.x, T.z, T.lane.dx, T.lane.dz))
      ) {
        const on = landingSpot(T.lane, T.s + 6, this.traffic, 0, 90)
        if (on) {
          this.to = on
          this.down = false
        }
      }
    }
    const dx = this.to.x - p.x,
      dz = this.to.z - p.z,
      dist = Math.hypot(dx, dz)
    const hv = (v.x * dx + v.z * dz) / Math.max(dist, 1)
    // come down once the spot is a descent away: about 3 m/s down, slower near the road, slowing
    // about 3 m/s each second on the flare
    const td = alt / 3 + 0.5
    if (alt > CLEAR && dist < ((hv + Math.max(8, hv - 3 * td)) / 2) * td + 2)
      this.down = true
    let vyT = this.down
      ? -clamp(alt * 0.8, 0.9, 4)
      : clamp((ALT - alt) * 1.4, -2, 6)
    if (alt < 3.5 && this.under(p, v)) vyT = Math.max(vyT, 0.5)
    // nose up to bleed off speed on the way down, level again for the touchdown
    c.flare = this.down && alt > 1.2 && hv > 9 ? FLARE : 0
    const up = s.up().y
    c.lift = clamp(
      (G + 3.2 * (vyT - v.y)) / (LIFT_ACC * Math.max(up, 0.5)),
      0,
      1
    )
    // forward on the main thrusters once it is clear of the car in front
    c.main =
      !this.down && alt > CLEAR && hv < Math.min(CRUISE, dist * 0.5) ? 1 : 0
    // nose down the lane it is coming down on, turned a little towards the lane's line (never round
    // towards a spot it has overshot); the stability assist keeps it level
    const L = this.to.lane,
      across = (p.z - this.to.z) * L.dx - (p.x - this.to.x) * L.dz
    const yaw = Math.atan2(-f.z, f.x)
    const want = Math.atan2(-L.dz, L.dx) + clamp(across * 0.06, -0.3, 0.3)
    c.yaw = clamp(3 * wrapPi(want - yaw) - 1.5 * s.omega.y, -1, 1)
    return c
  }
}
