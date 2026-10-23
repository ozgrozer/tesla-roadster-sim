// Getting into a car and out of it, as timed phases (pure: the render poses the body and the door
// from them, onFoot.js runs them). Into a car: walk round to the driver's door (the car's other
// side, its nose or tail in the way, walked round), then
//   the Roadster:        the reveal's own way in (intro.js keys): the door swings up, in, door down
//   a car left unlocked: the door opens, slide in, the door shuts
//   a parked car:        break in first (a couple of seconds at the window or the lock: now and
//                        then the window goes, and now and then the alarm), then as above
//   a car with a driver: the door opens, the driver is pulled out (and runs), slide in
// Out of one: the door opens, slide out onto a free spot beside it, the door shuts.
// In a tight spot (parked hard up against a wall or another car): in by the other side's door if
// the driver's is blocked, and out onto the first free spot round the car (the door, along that
// side, the far side, either end, then anywhere free a few metres round), or up onto its roof if
// it is boxed in on every side.
import { stepFoot, freeSpot, blockedAt, floorAt, FOOT } from './player.js'
import { nearFree } from './footRescue.js'
import { vehicles } from './vehicles.js'
import { wrapPi } from './constants.js'

export const BOARD = {
  walkV: 3.4, // m/s walking up to the door (a brisk GTA trot)
  near: 0.18, // m from a point on the way that counts as there
  stuck: 2, // s without getting closer before it gives up walking and steps to the door
  jimmy: 0.9, // s breaking into a parked car
  smashAt: 0.4, // (and when, into that, a window goes)
  smash: 0.5, // the share of break-ins through the window rather than the lock
  alarm: 0.45, // the share that set the alarm off
  open: 0.3, // s for the door to open (eased in and out: render/carDoor.js)
  pull: 0.8, // s pulling a driver out (out at pullAt)
  pullAt: 0.35,
  slide: 0.5, // s stepping into the opening, sitting and swinging the legs in
  close: 0.3, // s for the door to shut: sat in and driving from its start (it shuts as the car goes)
  outSlide: 0.4, // s out of the seat: legs out, up and out of the opening
  roadIn: 1.1, // s of the Roadster's own way in (its keys, sped up: intro.js)
  roadOut: 0.8, // and out
  roadClose: 0.3, // s for its door to come down behind the player
  jackV: 3, // m/s: a car slower than this can be taken from its driver
  exitV: 6 // m/s: the most the car may still be rolling to get out (faster, E brakes it first)
}

// How the player gets into entry e: 'roadster', 'open' (unlocked, empty), 'theft' (parked, locked)
// or 'jack' (a driver in it); null if not now (a driver on the move: why says so)
export function howToEnter (e) {
  if (!e || e.occupant === 'player') return null
  if (e.kind === 'roadster') return 'roadster'
  if (e.occupant === 'npc') return e.speed < BOARD.jackV ? 'jack' : null
  return e.locked ? 'theft' : 'open'
}

// the side of the car the door in use is on (-1 left, 1 right): its own (a bus's on the kerb side),
// or the other if sg is -1 (the driver's blocked)
export const sideOf = (e, sg = 1) => (e.doorSide || -1) * sg
// the way round to the door, in the car's frame, from where the player is (car frame)
function route (e, l, sg = 1) {
  const hw = e.wid / 2,
    hl = e.len / 2,
    out = []
  const sd = sideOf(e, sg)
  const A = (l.x >= 0 ? 1 : -1) * (hl + 0.8)
  if (l.z * sd < hw - 0.05) {
    // (on the far side or off an end: round the nearer end)
    if (Math.abs(l.x) <= hl + 0.4) out.push({ x: A, z: -(hw + 0.8) * sd })
    out.push({ x: A, z: (hw + 0.6) * sd })
  }
  out.push({ x: e.door.x, z: e.door.z * sg })
  return out
}
// whether someone could stand at (lx, lz) in e's frame (the car itself aside)
function clear (e, lx, lz, world) {
  const w = vehicles.toWorld(e, lx, lz)
  const base = world.base(w.x, w.z)
  const y = floorAt(w.x, w.z, base + FOOT.stepUp, world)
  return y - base < 0.6 && !blockedAt(w.x, w.z, y, world)
}

// A walk up to e's door to get in by `how`; rng: Math.random-like (the break-in's luck)
export function startEnter (e, how, p, rng = Math.random, world = null) {
  const l = vehicles.toLocal(e, p.pos.x, p.pos.z)
  // (the driver's door against a wall, the other side's free: in that way, over the seats; the
  // Roadster's own way in is its own)
  const sg =
    world && e.kind !== 'roadster' && !clear(e, e.door.x, e.door.z, world) && clear(e, e.door.x, -e.door.z, world)
      ? -1
      : 1
  return {
    side: sg,
    dir: 'in',
    entry: e,
    how,
    phase: 'walk',
    t: 0,
    path: route(e, l, sg),
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
    [e.door.x - 1, hw + 0.6],
    [e.door.x + 1, hw + 0.6],
    [-hl - 0.9, 0],
    [hl + 0.9, 0],
    [-hl - 0.8, -hw - 0.5],
    [-hl - 0.8, hw + 0.5],
    [hl + 0.8, -hw - 0.5],
    [hl + 0.8, hw + 0.5]
  ])
    spots.push(vehicles.toWorld(e, x, z))
  const door = vehicles.toWorld(e, e.door.x, e.door.z)
  // (boxed in round the doors: anywhere free a few metres round; on every side: up on the roof)
  const spot = freeSpot(spots, world) ||
    nearFree(door.x, door.z, world, 4.4, true) || {
      ...vehicles.toWorld(e, 0, 0),
      y: (e.pos.y || 0) + (e.hgt || 1.4),
      roof: true
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
      return a.how === 'roadster' ? BOARD.roadClose : BOARD.close
    case 'roadster':
      return a.dir === 'in' ? BOARD.roadIn : BOARD.roadOut
  }
  return Infinity
}

const _ctl = { x: 0, z: 0, mag: 0, run: false, jump: false },
  _w = { x: 0, z: 0 }
// One step of it: p the player (moved along on the walk, stood still otherwise), world the feet's
// (player.js). Returns what happened this step, in order: 'arrived', 'smash', 'alarm', 'pulled',
// 'seated' (in: sat in, driving, the door still shutting), 'shut' (in: the end), 'out' (out of the
// seat: the feet on the ground), 'closed' (out: the end).
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
        const door = vehicles.toWorld(e, e.door.x, e.door.z * (a.side || 1))
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
    p.heading = wrapPi(e.heading + (Math.PI / 2) * sideOf(e, a.side || 1))
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
    // (in: sat in as the door starts to shut, or at the end of the Roadster's own way in)
    if (a.dir === 'in' && (list[i + 1] === 'close' || (a.phase === 'roadster' && i + 1 === list.length)))
      ev.push('seated')
    if (i + 1 < list.length) {
      a.phase = list[i + 1]
      a.t = 0
    } else {
      a.done = true
      ev.push(a.dir === 'in' ? 'shut' : 'closed')
    }
  }
  return ev
}

// A move key (or the throttle) pressed while getting in or out: the rest of it skipped, GTA-quick,
// straight to sat in (in) or the feet on the ground (out), the door left to shut behind. Returns the
// events skipped over, as stepBoard's ('pulled' first if a driver was still to be hauled out); none
// if it can't be hurried here (walking up, breaking in, the Roadster's own way, done already).
export function hurry (a) {
  if (a.done || a.phase === 'close' || a.how === 'roadster') return []
  if (a.dir === 'out') {
    if (a.phase !== 'open' && a.phase !== 'out') return []
    a.phase = 'close'
    a.t = 0
    a.hurried = true
    return ['out']
  }
  if (a.phase !== 'open' && a.phase !== 'pull' && a.phase !== 'in') return []
  const ev = []
  if (a.how === 'jack' && (a.phase === 'open' || (a.phase === 'pull' && a.t < BOARD.pullAt)))
    ev.push('pulled')
  a.phase = 'close'
  a.t = 0
  a.hurried = true
  ev.push('seated')
  return ev
}

// may this walk up be called off (a move key)? Not once a driver is being taken from their car.
export const cancellable = a =>
  a.dir === 'in' && a.phase === 'walk' && a.how !== 'jack'

