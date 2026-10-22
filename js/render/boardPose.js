// Optimus getting into a city car and out of it (sim/boarding.js's phases), GTA's way: stood just
// behind the door's back edge, a hand on the handle pulling it open (the hand riding the handle as
// the door swings, then letting go), a step forward into the opening turning to face ahead, ducking
// under the roof and sitting down sideways onto the seat (the inner foot in first), the outer leg
// swung in after; seated, a hand out to the door card pulling it shut, then both on the wheel. Out
// is the same backwards: the door pushed open, the outer leg out, up out of the seat and a step
// out. A carjacking reaches in after the driver; a break-in works at the lock or the window. The
// door itself is carDoor.js's (pointOn: where its handle is as it swings).
import { poseOptimus, HIP_STAND, ANKLE_UP } from './optimus.js'
import { doorOf, seatShare, sideOf, BOARD } from '../sim/boarding.js'
import { vehicles } from '../sim/vehicles.js'
import { clamp, wrapPi } from '../sim/constants.js'

const ease = t => t * t * (3 - 2 * t)
const lerp = (a, b, k) => a + (b - a) * k
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1)
const _w = { x: 0, z: 0 }
const CAB = new Set(['bus', 'van', 'truck', 'fire', 'ambulance'])

// the points of the way in for e on side sd (car frame): A stood at the door, B in its opening, C
// sat on the seat's edge, S the seat (the hips), the floor's height, and the car's own height drawn
export function wayIn (e, sd) {
  const W = e.wid / 2,
    [x0] = e.doorSpan,
    s = e.seat
  const floor = Math.max(0.2, s.y - (CAB.has(e.type) ? 0.5 : 0.3))
  return {
    A: { x: e.door.x, z: sd * (W + 0.5) },
    B: { x: s.x + 0.02, z: sd * (W + 0.3) },
    C: { x: s.x, z: sd * Math.max(Math.abs(s.z), W - 0.28) },
    S: { x: s.x, z: s.z },
    x0,
    floor,
    hip: s.y + 0.08
  }
}

// O posed for action a (p the player, pos the feet drawn, base the car's floor's height in the
// world: its drawn y), doors the door (carDoor.js) for the hands
export function poseBoard (O, a, p, pos, doors, base = 0) {
  const e = a.entry,
    sd = sideOf(e, a.side || 1)
  const way = wayIn(e, sd)
  const gy = pos.y
  const hand = sd < 0 ? 0 : 1 // (the hand nearer the door's front: the left on the left)
  const facing = wrapPi(e.heading + (Math.PI / 2) * sd), // (facing the car, from its side)
    ahead = e.heading
  // a point of the car's frame in the world, at height y
  const W = (lx, y, lz) => {
    const w = vehicles.toWorld(e, lx, lz, _w)
    return [w.x, y, w.z]
  }
  const fwd = [Math.cos(ahead), 0, -Math.sin(ahead)]
  const t = a.t,
    k = seatShare(a)
  const belt = Math.min(e.hgt * 0.6, base + 1.15) - base
  // ---- sat in, or getting in or out ----
  if (a.phase === 'in' || a.phase === 'out' || (a.dir === 'in' && a.phase === 'close') || (a.dir === 'out' && a.phase === 'open')) {
    const u = a.phase === 'in' || a.phase === 'out' ? k : 1
    const end = a.dir === 'out' && a.spot ? vehicles.toLocal(e, a.spot.x, a.spot.z) : way.A
    // the hips: A (or the spot got out onto) -> B -> C -> S
    const s1 = ease(seg(u, 0, 0.35)),
      s2 = ease(seg(u, 0.35, 0.7)),
      s3 = ease(seg(u, 0.7, 1))
    let x = lerp(end.x, way.B.x, s1),
      z = lerp(end.z, way.B.z, s1)
    x = lerp(x, way.C.x, s2)
    z = lerp(z, way.C.z, s2)
    x = lerp(x, way.S.x, s3)
    z = lerp(z, way.S.z, s3)
    const sitY = base + way.hip
    const y = lerp(gy + HIP_STAND, sitY, s2)
    const hips = vehicles.toWorld(e, x, z, { x: 0, z: 0 })
    O.root.position.set(hips.x, y + (a.dir === 'in' ? 0.04 * Math.sin(Math.PI * s1) : 0), hips.z)
    // turning from facing the car to facing ahead as they step in (out: ahead all the way)
    O.root.rotation.set(0, a.dir === 'in' ? lerp(0, wrapPi(ahead - facing), s1) + facing : ahead, 0)
    // the feet: on the road outside, the inner one in first, then the outer swung in over the sill
    const fl = base + way.floor + ANKLE_UP
    const inX = way.S.x + 0.5
    const zi = way.S.z - sd * 0.14,
      zo = way.S.z + sd * 0.14
    const outIn = W(lerp(x + 0.05, inX, s2), lerp(gy + ANKLE_UP, fl, s2) + 0.25 * Math.sin(Math.PI * s2), lerp(sd * (Math.abs(z) - 0.12), zi, s2 + s3 * 0))
    const gx = lerp(x + 0.05, way.B.x + 0.1, s2)
    const outO = s3 > 0
      ? W(lerp(gx, inX, s3), lerp(gy + ANKLE_UP, fl, s3) + 0.3 * Math.sin(Math.PI * s3), lerp(sd * (Math.abs(way.B.z) + 0.05), zo, s3))
      : W(gx, gy + ANKLE_UP, lerp(sd * (Math.abs(z) + 0.12), sd * (Math.abs(way.B.z) + 0.05), s2))
    // (left and right: on the left side, the inner foot is the right one)
    const feet = sd < 0 ? [{ at: outO, knee: fwd }, { at: outIn, knee: fwd }] : [{ at: outIn, knee: fwd }, { at: outO, knee: fwd }]
    if (u < 0.02) {
      // (stood: the walk's pose)
      poseOptimus(O, { walk: 0 })
      return
    }
    // the hands: on the wheel once in; reaching for the door card to pull it shut or push it open
    let hands = null
    if (u > 0.85) {
      const wy = base + way.hip + 0.42
      const wheel = s => W(way.S.x + 0.42, wy, way.S.z + s * 0.17)
      hands = [{ at: wheel(-1), w: 1 }, { at: wheel(1), w: 1 }]
      const pull = (a.dir === 'in' && a.phase === 'close') || (a.dir === 'out' && a.phase === 'open')
      if (pull && doors?.cur) {
        const dk = a.dir === 'in' ? 1 - clamp(t / BOARD.close, 0, 1) : clamp(t / BOARD.open, 0, 1)
        const at = doors.pointOn(e, sd, way.x0 + 0.3, base + belt - 0.12, true)
        if (at) hands[hand === 0 ? 0 : 1] = { at, w: clamp(1.4 - dk * 0.9, 0, 1) }
      }
    }
    poseOptimus(O, {
      feet,
      hands,
      lean: 0.35 * Math.sin(Math.PI * s2) + 0.1 * s1 - 0.08 * s3,
      nod: 0.35 * Math.sin(Math.PI * s2),
      walk: 0
    })
    return
  }
  // ---- at the door ----
  const A = W(way.A.x, 0, way.A.z)
  O.root.position.set(A[0], gy + HIP_STAND, A[2])
  O.root.rotation.set(0, facing, 0)
  let hands = null,
    lean = 0.05
  const x0 = way.x0
  if (a.phase === 'jimmy') {
    // at the window: worrying the lock, or a sharp blow through the glass
    const j = Math.sin(t * 18) * 0.02
    const side = sd * (e.wid / 2 + 0.05)
    const win = W(x0 + 0.35, gy + Math.min(e.hgt * 0.7, 1.3), side)
    const lock = W(x0 + 0.1 + j, gy + Math.min(e.hgt * 0.5, 1.0), side)
    const blow = a.smash && t > BOARD.smashAt - 0.35 && t < BOARD.smashAt + 0.15
    hands = [{ at: lock, w: 1 }, { at: blow ? win : W(x0 + 0.25, gy + 1.05 + j, side * 1.04), w: 1 }]
    if (hand === 1) hands.reverse()
    lean = blow ? 0.25 : 0.12
  } else if (a.phase === 'open' || a.phase === 'pull') {
    // the handle, riding it as the door swings out, then let go as it gets out of reach
    const at = doors?.cur ? doors.pointOn(e, sd, x0 + 0.12, base + belt - 0.08) : W(x0 + 0.12, gy + 1, sd * (e.wid / 2 + 0.05))
    const dk = doorOf(a)
    const reach = Math.hypot(at[0] - A[0], at[2] - A[2])
    hands = [null, null]
    hands[hand] = { at, w: a.phase === 'open' ? clamp(1.6 - reach * 1.4, 0, 1) * (dk < 0.95 ? 1 : 0.5) : 0 }
    lean = 0.08 + 0.1 * dk
    if (a.phase === 'pull') {
      // in after the driver, and hauling them out
      const s = Math.sin(Math.PI * clamp(t / BOARD.pull, 0, 1))
      const at2 = W(lerp(x0 - 0.1, way.S.x, s), base + way.hip + 0.4, lerp(sd * (e.wid / 2 + 0.3), way.S.z, s))
      hands = [{ at: at2, w: 1 }, { at: [at2[0], at2[1] + 0.1, at2[2]], w: 1 }]
      lean = 0.35 * s
      const B = W(lerp(way.A.x, x0 + 0.05, s), 0, lerp(way.A.z, sd * (e.wid / 2 + 0.35), s))
      O.root.position.set(B[0], gy + HIP_STAND, B[2])
    }
  }
  poseOptimus(O, { hands, lean, walk: 0 })
}

// after getting out, the door shutting: a hand pushing it to, if the player is still beside it
export function pushHands (a, pos, doors, base = 0) {
  if (!doors?.cur || a.dir !== 'out' || a.phase !== 'close') return null
  const e = a.entry,
    sd = sideOf(e, 1)
  const [x0] = e.doorSpan
  const at = doors.pointOn(e, sd, x0 + 0.25, base + Math.min(e.hgt * 0.6, 1.1) - 0.1)
  const d = Math.hypot(at[0] - pos.x, at[2] - pos.z)
  if (d > 1.1) return null
  const w = clamp((1.1 - d) * 3, 0, 1) * clamp(1 - a.t / BOARD.close, 0, 1)
  const h = [null, null]
  h[sd < 0 ? 0 : 1] = { at, w }
  return h
}
