// Getting into a car and out of it, as timed phases (pure: the render poses the body and the door
// from them, onFoot.js runs them). Into a car: walk round to the driver's door (the car's other
// side, its nose or tail in the way, walked round), then
//   the Roadster:        the reveal's own way in (intro.js keys): the door swings up, in, door down
//   a car left unlocked: the door opens, slide in, the door shuts
//   a parked car:        break in first (a couple of seconds at the window or the lock: now and
//                        then the window goes, and now and then the alarm), then as above
//   a car with a driver: the door opens, the driver is pulled out (and runs), slide in
// Out of one: the door opens, slide out onto a free spot beside it, the door shuts.
import { stepFoot, freeSpot, FOOT } from './player.js'
import { vehicles } from './vehicles.js'
import { wrapPi } from './constants.js'

export const BOARD = {
  walkV: 2.6, // m/s walking up to the door
  near: 0.18, // m from a point on the way that counts as there
  stuck: 3, // s without getting closer before it gives up walking and steps to the door
  jimmy: 2.2, // s breaking into a parked car
  smashAt: 0.7, // (and when, into that, a window goes)
  smash: 0.5, // the share of break-ins through the window rather than the lock
  alarm: 0.45, // the share that set the alarm off
  open: 0.45, // s for the door to open
  pull: 1.3, // s pulling a driver out (out at pullAt)
  pullAt: 0.55,
  slide: 0.9, // s sliding into the seat
  close: 0.4, // s for the door to shut
  outSlide: 0.75, // s out of the seat
  roadIn: 3.2, // s of the Roadster's own way in (its keys, sped up: intro.js)
  roadOut: 2.6, // and out
  jackV: 3, // m/s: a car slower than this can be taken from its driver
  exitV: 6 // m/s: the most the car may still be rolling to get out
}

// How the player gets into entry e: 'roadster', 'open' (unlocked, empty), 'theft' (parked, locked)
// or 'jack' (a driver in it); null if not now (a driver on the move: why says so)
export function howToEnter (e) {
  if (!e || e.occupant === 'player') return null
  if (e.kind === 'roadster') return 'roadster'
  if (e.occupant === 'npc') return e.speed < BOARD.jackV ? 'jack' : null
  return e.locked ? 'theft' : 'open'
}

// the way round to the door, in the car's frame, from where the player is (car frame)
function route (e, l) {
  const hw = e.wid / 2,
    hl = e.len / 2,
    out = []
  const A = (l.x >= 0 ? 1 : -1) * (hl + 0.8)
  const side = -(hw + 0.6)
  if (l.z > -hw + 0.05) {
    // (on the far side or off an end: round the nearer end)
    if (Math.abs(l.x) <= hl + 0.4) out.push({ x: A, z: hw + 0.8 })
    out.push({ x: A, z: side })
  }
  out.push({ x: e.door.x, z: e.door.z })
  return out
}

// A walk up to e's door to get in by `how`; rng: Math.random-like (the break-in's luck)
export function startEnter (e, how, p, rng = Math.random) {
  const l = vehicles.toLocal(e, p.pos.x, p.pos.z)
  return {
    dir: 'in',
    entry: e,
    how,
    phase: 'walk',
    t: 0,
    path: route(e, l),
    best: Infinity,
    stuckT: 0,
    smash: how === 'theft' && rng() < BOARD.smash,
    alarm: how === 'theft' && rng() < BOARD.alarm,
    spot: null,
    done: false
  }
}
// Getting out of e: where to (the first free spot round the door), worked out now
export function startExit (e, world) {
  const spots = []
  const hw = e.wid / 2,
    hl = e.len / 2
  for (const [x, z] of [
    [e.door.x, e.door.z],
    [e.door.x - 1, e.door.z - 0.4],
    [e.door.x + 1, e.door.z - 0.4],
    [e.door.x, hw + 0.6],
    [-hl - 0.9, 0],
    [hl + 0.9, 0]
  ])
    spots.push(vehicles.toWorld(e, x, z))
  const spot = freeSpot(spots, world) || {
    ...vehicles.toWorld(e, e.door.x, e.door.z),
    y: null
  }
  return {
    dir: 'out',
    entry: e,
    how: e.kind === 'roadster' ? 'roadster' : 'open',
    phase: 'open',
    t: 0,
    spot,
    done: false
  }
}

// how far open the door is (0 to 1), for the render; the Roadster's own (intro.js) while it runs
export function doorOf (a) {
  if (!a) return 0
  const { phase, t } = a
  if (phase === 'open') return Math.min(1, t / BOARD.open)
  if (phase === 'close') return Math.max(0, 1 - t / BOARD.close)
  if (phase === 'pull' || phase === 'in' || phase === 'out') return 1
  return 0
}
// the share of the slide done (0 at the door, 1 in the seat), for the body and the camera
export function seatShare (a) {
  if (!a) return 0
  if (a.dir === 'in') {
    if (a.phase === 'in') return Math.min(1, a.t / BOARD.slide)
    return a.phase === 'close' || a.phase === 'roadster' ? 1 : 0
  }
  if (a.phase === 'open') return 1
  if (a.phase === 'out') return Math.max(0, 1 - a.t / BOARD.outSlide)
  return 0
}

const NEXT_IN = {
  theft: ['jimmy', 'open', 'in', 'close'],
  open: ['open', 'in', 'close'],
  jack: ['open', 'pull', 'in', 'close'],
  roadster: ['roadster']
}
const NEXT_OUT = { open: ['open', 'out', 'close'], roadster: ['roadster', 'close'] }
const LEN = a => {
  switch (a.phase) {
    case 'jimmy':
      return BOARD.jimmy
    case 'open':
      return BOARD.open
    case 'pull':
      return BOARD.pull
    case 'in':
      return BOARD.slide
    case 'out':
      return BOARD.outSlide
    case 'close':
      return a.how === 'roadster' ? 0.6 : BOARD.close
    case 'roadster':
      return a.dir === 'in' ? BOARD.roadIn : BOARD.roadOut
  }
  return Infinity
}

const _ctl = { x: 0, z: 0, mag: 0, run: false, jump: false },
  _w = { x: 0, z: 0 }
// One step of it: p the player (moved along on the walk, stood still otherwise), world the feet's
// (player.js). Returns what happened this step, in order: 'arrived', 'smash', 'alarm', 'pulled',
// 'seated' (in: the end), 'out' (out of the seat: the feet on the ground), 'closed' (out: the end).
export function stepBoard (a, dt, p, world) {
  const ev = []
  const e = a.entry
  if (a.phase === 'walk') {
    const wp = a.path[0]
    const w = vehicles.toWorld(e, wp.x, wp.z, _w)
    const dx = w.x - p.pos.x,
      dz = w.z - p.pos.z,
      d = Math.hypot(dx, dz)
    if (d < BOARD.near) {
      a.path.shift()
      a.best = Infinity
      a.stuckT = 0
    } else {
      _ctl.x = dx / d
      _ctl.z = dz / d
      _ctl.mag = Math.min(1, (d / dt / BOARD.walkV) * 0.5 + 0.2)
      const v = p.vel,
        k = Math.min(1, (d / dt) / BOARD.walkV)
      // (straight there at the walking pace, through stepFoot for the walls and the kerbs)
      v.x = _ctl.x * BOARD.walkV * k
      v.z = _ctl.z * BOARD.walkV * k
      stepFoot(p, dt, null, world)
      p.heading = Math.atan2(-dz, dx)
      if (d < a.best - 0.05) {
        a.best = d
        a.stuckT = 0
      } else if ((a.stuckT += dt) > BOARD.stuck) {
        // (held up by something: step to the door)
        const door = vehicles.toWorld(e, e.door.x, e.door.z)
        p.pos.x = door.x
        p.pos.z = door.z
        a.path.length = 0
      }
    }
    if (!a.path.length) {
      a.phase = NEXT_IN[a.how][0]
      a.t = 0
      p.vel.x = p.vel.z = 0
      ev.push('arrived')
    }
    return ev
  }
  // at the door: facing the car, side on to it (the Roadster's way in faces along it)
  if (a.dir === 'in' && a.phase !== 'roadster')
    p.heading = wrapPi(e.heading - Math.PI / 2)
  const t0 = a.t
  a.t += dt
  if (a.phase === 'jimmy') {
    if (a.smash && t0 < BOARD.smashAt && a.t >= BOARD.smashAt) ev.push('smash')
  } else if (a.phase === 'pull') {
    if (t0 < BOARD.pullAt && a.t >= BOARD.pullAt) ev.push('pulled')
  }
  if (a.t >= LEN(a)) {
    const list = a.dir === 'in' ? NEXT_IN[a.how] : NEXT_OUT[a.how]
    const i = list.indexOf(a.phase)
    if (a.phase === 'jimmy' && a.alarm) ev.push('alarm')
    if (a.dir === 'out' && (a.phase === 'out' || a.phase === 'roadster'))
      ev.push('out')
    if (i + 1 < list.length) {
      a.phase = list[i + 1]
      a.t = 0
    } else {
      a.done = true
      ev.push(a.dir === 'in' ? 'seated' : 'closed')
    }
  }
  return ev
}

// may this walk up be called off (a move key)? Not once a driver is being taken from their car.
export const cancellable = a =>
  a.dir === 'in' && a.phase === 'walk' && a.how !== 'jack'

