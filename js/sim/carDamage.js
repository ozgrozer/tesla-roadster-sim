// Damage, GTA-style, for the traffic's cars and the Roadster's lamps and glass. Each hit lands
// somewhere on a car's footprint (in its own frame: +x its nose, +z its right) at some closing
// speed, and what it does there builds up. The body crumples in round where it landed, held as
// twelve zones round the footprint (the four corners, the middle of the nose and the tail, and
// three along each flank), each pushed in so many metres: the renderer bends the car's meshes from
// these (render/carDents.js). A hit from about 20 km/h breaks the headlight or the tail light on
// the side and at the end it lands on (both, from the middle of the nose or the tail, a little
// harder), from about 30 km/h the glass on that face crazes, and from about 50 km/h side and rear
// glass shatters and falls out (a windscreen, laminated, only ever crazes). The hits add up as
// harm: a car with some drives on slower, one with more steams from under the bonnet, and one hit
// hard enough, or often enough, is a wreck, which smokes and stays where it stops (wrecks.js). How
// much a hit does goes by how hard it was and by the masses: the lighter car takes more of it, a
// wall the most; and the touches of one crash count once, at its hardest. Nothing here draws
// random numbers: each car's crumples are its own by its paint (render side).
import { CAR, clamp } from './constants.js'

export const MIN_HIT = 2.5 // m/s closing speed below which a knock leaves no mark (as damage.js)
export const DENT_MAX = 0.5 // m, the furthest a zone is ever pushed in
const DEPTH = 0.019 // m of crumple per m/s past MIN_HIT, for a car taking the whole of the blow
const MAX_DEPTH = 0.32 // m, the deepest one hit goes
const LAMP_HIT = 5.5 // m/s: a hit at an end breaks the lamp on that side (about 20 km/h)
const CRAZE = 8.5 // m/s: the glass on the face hit crazes (about 30 km/h)
const SHATTER = 14 // m/s: and side or rear glass shatters (about 50 km/h)
const WRECK = 1 // harm: a wreck (one hit at about 58 km/h, three at 30, two at 36)
const STEAM = 0.5 // harm (or a nose crumpled STEAM_NOSE m): the engine steams
const STEAM_NOSE = 0.16

// What a hit broke, for its sound and its debris (events.js): bits
export const BROKE = {
  dent: 1,
  lamp: 2,
  craze: 4,
  shatter: 8,
  wreck: 16,
  steam: 32
}
// the lamps (dmg.lamps): which are broken, by end and side
export const LAMPS = { FL: 1, FR: 2, RL: 4, RR: 8 }
// The panes (dmg.glass, 3 bits each: 0 whole, 1 to 6 crazed, more and more, 7 gone): the
// windscreen, the rear window, the left and the right side windows
export const PANE = { front: 1, rear: 8, left: 64, right: 512 }
const GONE = 7

// The zones round the footprint (dmg.dents, m pushed in), as [x / half length, z / half width],
// clockwise seen from above from the nose's left corner: the nose (left corner, middle, right
// corner), the right flank (front, middle, back), the tail (right corner, middle, left corner) and
// the left flank (back, middle, front). The renderer reads them in the same order.
// prettier-ignore
export const ZONES = [
  [1, -1], [1, 0], [1, 1], [0.5, 1], [0, 1], [-0.5, 1],
  [-1, 1], [-1, 0], [-1, -1], [-0.5, -1], [0, -1], [0.5, -1]
]
// each face's zones in order along it, and where along it they lie (from u or v, -1 to 1)
const FACES = [
  { zones: [0, 1, 2], at: [-1, 0, 1] }, // the nose, along v (left to right)
  { zones: [2, 3, 4, 5, 6], at: [1, 0.5, 0, -0.5, -1] }, // the right flank, along u (front to back)
  { zones: [6, 7, 8], at: [1, 0, -1] }, // the tail, along v (right to left)
  { zones: [8, 9, 10, 11, 0], at: [-1, -0.5, 0, 0.5, 1] } // the left flank, along u (back to front)
]
const smooth = t => t * t * (3 - 2 * t)
const W = new Float32Array(5) // (scratch: one face's share of a hit, zone by zone)

// Where a contact between rectangles A and B (collide.js's { x, z, fx, fz, hl, hw }) landed: the
// middle of the patch they overlap in (A clipped by each of B's sides in turn, and the clipped
// shape's centroid). The contact the collisions push apart at is the deepest corner, one of two by
// a tie-break for a square hit, so the middle of a nose would dent a corner; this is where the two
// bodies really met, a corner's sliver for a corner clipped, a band across the middle for a square
// hit. Into LANDED, which comes back (null if they don't overlap).
export const LANDED = { x: 0, z: 0 }
const PX = new Float64Array(12),
  PZ = new Float64Array(12),
  QX = new Float64Array(12),
  QZ = new Float64Array(12)
export function landed (A, B) {
  for (let k = 0; k < 4; k++) {
    const sl = k === 0 || k === 3 ? 1 : -1,
      sw = k < 2 ? 1 : -1
    PX[k] = A.x + A.fx * A.hl * sl - A.fz * A.hw * sw
    PZ[k] = A.z + A.fz * A.hl * sl + A.fx * A.hw * sw
  }
  let n = 4
  for (let k = 0; k < 4 && n; k++) {
    // (B's side k: out along u, at c)
    const g = k & 1 ? -1 : 1,
      ux = (k < 2 ? B.fx : -B.fz) * g,
      uz = (k < 2 ? B.fz : B.fx) * g
    n = clip(n, ux, uz, B.x * ux + B.z * uz + (k < 2 ? B.hl : B.hw))
  }
  if (n < 3) return null
  let a = 0,
    cx = 0,
    cz = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n,
      w = PX[i] * PZ[j] - PX[j] * PZ[i]
    a += w
    cx += (PX[i] + PX[j]) * w
    cz += (PZ[i] + PZ[j]) * w
  }
  if (Math.abs(a) < 1e-9) {
    // (a sliver with no area to speak of: the middle of its corners)
    cx = cz = 0
    for (let i = 0; i < n; i++) {
      cx += PX[i] / n
      cz += PZ[i] / n
    }
  } else {
    cx /= 3 * a
    cz /= 3 * a
  }
  LANDED.x = cx
  LANDED.z = cz
  return LANDED
}
// the polygon PX, PZ (n corners) cut to the side of the line p·u = c it lies under: the corners
// left, back in PX, PZ
function clip (n, ux, uz, c) {
  let m = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const di = PX[i] * ux + PZ[i] * uz - c,
      dj = PX[j] * ux + PZ[j] * uz - c
    if (di <= 0) {
      QX[m] = PX[i]
      QZ[m++] = PZ[i]
    }
    if (di <= 0 !== dj <= 0) {
      const t = di / (di - dj)
      QX[m] = PX[i] + (PX[j] - PX[i]) * t
      QZ[m++] = PZ[i] + (PZ[j] - PZ[i]) * t
    }
  }
  for (let i = 0; i < m; i++) {
    PX[i] = QX[i]
    PZ[i] = QZ[i]
  }
  return m
}

// The share of a blow a car of mass m takes from one of mass mo (null: something fixed)
export function share (m, mo) {
  return mo ? clamp((2 * mo) / (m + mo), 0.35, 1.6) : 1.6
}

// A car's damage (car.dmg, made at the first hit that leaves a mark): the zones pushed in (m), the
// lamps broken (LAMPS'), the glass (PANE's), the harm it has taken, wrecked, smoking (1 steam, 2
// a wreck's dark smoke), the share of its own pace it still drives at (drivers.js), s out of sight
// (a wreck is towed: wrecks.js), its driver got out, the smoke owed (render/wreckSmoke.js), and
// when the crash it is in began and its hardest hit so far (onset)
function fresh () {
  return {
    dents: new Float32Array(ZONES.length),
    lamps: 0,
    glass: 0,
    harm: 0,
    wreck: false,
    smoke: 0,
    limp: 1,
    unseen: 0,
    alight: 0,
    puff: 0,
    t: -1,
    v: 0
  }
}
// What of a hit at impact, at time t (s), is new to o (a car's damage, or the Roadster's Wear): the
// same crash still pushing them together a step or two later (within CRASH s of the last touch, as
// a car shoved along by the Roadster is) counts once, at its hardest. The impact it counts from
// (MIN_HIT, for a crash of its own), or -1 if nothing is new.
const CRASH = 0.3
function onset (o, impact, t) {
  const again = t - o.t < CRASH
  o.t = t
  if (!again) {
    o.v = impact
    return MIN_HIT
  }
  if (impact <= o.v) return -1
  const from = o.v
  o.v = impact
  return from
}
// the harm in a hit at v m/s
const bite = v => ((Math.max(v, MIN_HIT) - MIN_HIT) / 14) ** 1.3

// A hit on a traffic car at (px, pz) in the world, closing at impact m/s, from something of mass
// mo (null for a wall or a post), at time t (s: the traffic's clock). What it broke comes back
// (BROKE's bits; 0 for nothing).
export function hurt (car, px, pz, impact, mo, t) {
  if (!(impact > MIN_HIT)) return 0
  const D = car.dmg || (car.dmg = fresh())
  const from = onset(D, impact, t)
  if (from < 0) return 0
  const dx = px - car.x,
    dz = pz - car.z
  const lx = dx * car.hx + dz * car.hz,
    lz = dz * car.hx - dx * car.hz
  const hl = car.len / 2,
    hw = car.wid / 2
  const k = share(car.m, mo)
  const depth = Math.min(MAX_DEPTH, (impact - from) * DEPTH * k)
  crumple(D.dents, lx, lz, hl, hw, depth)
  const again = from > MIN_HIT
  let broke = BROKE.dent | breakage(D, lx / hl, lz / hw, impact, true, again)
  D.harm += k * (bite(impact) - bite(from))
  D.limp = 1 - 0.5 * Math.min(1, D.harm)
  if (D.harm >= WRECK && !D.wreck) {
    D.wreck = true
    broke |= BROKE.wreck
  }
  const nose = Math.max(D.dents[0], D.dents[1], D.dents[2])
  const smoke = D.wreck ? 2 : D.harm >= STEAM || nose >= STEAM_NOSE ? 1 : 0
  if (smoke === 1 && D.smoke === 0) broke |= BROKE.steam
  D.smoke = Math.max(D.smoke, smoke)
  return broke
}

// Push the zones in round a hit at (lx, lz) on a footprint hl by hw, depth deep: on the face it is
// nearest, spread over that face's zones round it (wider the harder the hit), so that the body is
// pushed in by depth just where it landed. A hit at a corner lands in the corner's zone, which both
// faces share.
function crumple (dents, lx, lz, hl, hw, depth) {
  const dN = hl - lx,
    dT = hl + lx,
    dR = hw - lz,
    dL = hw + lz
  const m = Math.min(dN, dT, dR, dL)
  const f = m === dN ? 0 : m === dR ? 1 : m === dT ? 2 : 3
  const F = FACES[f]
  // where along the face, as its zones are placed (-1 to 1), and their spacing in metres
  const along = f === 0 || f === 2 ? lz / hw : lx / hl
  const metres = f === 0 || f === 2 ? hw : hl
  // (each zone's share falls off with its distance from the hit, over a zone and a quarter's
  // spacing, or two's for the hardest)
  const gap = Math.abs(F.at[1] - F.at[0]) * metres
  const reach = gap * (1.25 + Math.min(1, depth / 0.2) * 0.75)
  const n = F.zones.length
  for (let i = 0; i < n; i++)
    W[i] = Math.max(0, 1 - (Math.abs(F.at[i] - along) * metres) / reach)
  // (scaled so that the profile the renderer draws through the zones is depth deep at the hit)
  let i0 = 0
  const up = F.at[1] > F.at[0]
  while (i0 < n - 2 && (up ? F.at[i0 + 1] < along : F.at[i0 + 1] > along)) i0++
  const t = clamp((along - F.at[i0]) / (F.at[i0 + 1] - F.at[i0]), 0, 1)
  const at = W[i0] + (W[i0 + 1] - W[i0]) * smooth(t)
  const s = at > 1e-3 ? depth / at : 0
  for (let i = 0; i < n; i++) {
    const z = F.zones[i]
    dents[z] = Math.min(DENT_MAX, dents[z] + W[i] * s)
  }
}

// The lamps and glass a hit at (u, v) breaks (u: along the car, -1 the tail to 1 the nose; v:
// across, -1 the left to 1 the right), on anything with lamps and glass fields (a traffic car's
// damage, or the Roadster's Wear); shatter: whether its side and rear glass can go; again: a
// harder push in the same crash (onset). BROKE's bits.
export function breakage (o, u, v, impact, shatter, again) {
  let broke = 0
  // (the end it lands on: the nose or the tail, or a flank near either, round which the lamps wrap)
  const flank = Math.abs(v) > 0.85 && Math.abs(u) < 0.92
  const end = u > (flank ? 0.7 : 0.5) ? 1 : u < (flank ? -0.7 : -0.5) ? -1 : 0
  if (impact >= LAMP_HIT && end) {
    const mid = Math.abs(v) < 0.3,
      both = mid && impact >= LAMP_HIT * 1.6
    let bits = 0
    if (v <= -0.3 || both) bits |= end > 0 ? LAMPS.FL : LAMPS.RL
    if (v >= 0.3 || both) bits |= end > 0 ? LAMPS.FR : LAMPS.RR
    if (bits & ~o.lamps) broke |= BROKE.lamp
    o.lamps |= bits
  }
  if (impact < CRAZE) return broke
  // the pane on the face it lands on (and, at a corner, the end's too, a little less)
  const corner = Math.abs(u) > 0.75 && Math.abs(v) > 0.75
  if (flank || (!end && Math.abs(v) > 0.5) || corner)
    broke |= pane(o, v > 0 ? PANE.right : PANE.left, impact, shatter, again)
  if (end && (!flank || corner)) {
    const p = end > 0 ? PANE.front : PANE.rear
    broke |= pane(o, p, impact - (corner ? 2 : 0), shatter, again)
  }
  return broke
}
// one pane (PANE's), hit at impact: crazed more (by a new crash, or to how hard this one is now),
// or gone
function pane (o, p, impact, shatter, again) {
  if (impact < CRAZE) return 0
  const was = Math.floor(o.glass / p) % 8
  if (was === GONE) return 0
  const hard = 2 + Math.floor((impact - CRAZE) / 1.5)
  let lv = Math.min(6, Math.max(again ? was : was + 1, hard))
  // (side and rear glass is toughened: it shatters at once, hit hard enough, or crazed right
  // through and hit again)
  const go =
    shatter && p !== PANE.front && (impact >= SHATTER || (was === 6 && !again))
  if (go) lv = GONE
  o.glass += (lv - was) * p
  return go ? BROKE.shatter : lv > was ? BROKE.craze : 0
}
// of pane p (PANE's), 0 whole to 7 gone
export const paneOf = (o, p) => Math.floor(o.glass / p) % 8

// As new: a parked car put back in its place (wrecks.js restore; a car recycled is a new one)
export function mend (car) {
  car.dmg = null
}

// The Roadster's lamps and glass (render/damage.js keeps one, and repairs it with the dents): a
// hard knock breaks the lamps on that side and crazes the glass of the face it lands on. Its glass
// only crazes (none falls out), and nothing it takes stops it: it stays fully drivable.
export class Wear {
  constructor (hl = CAR.halfL, hw = CAR.halfW) {
    this.hl = hl
    this.hw = hw
    this.lamps = 0
    this.glass = 0
    this.t = -1 // (when the crash it is in began, and its hardest hit so far: onset)
    this.v = 0
  }
  // a knock at (lx, lz) in the car's frame, impact m/s, at time t (s: the sim's clock): what broke
  // (BROKE's bits)
  hit (lx, lz, impact, t) {
    if (!(impact > MIN_HIT)) return 0
    const from = onset(this, impact, t)
    if (from < 0) return 0
    const u = clamp(lx / this.hl, -1, 1),
      v = clamp(lz / this.hw, -1, 1)
    return breakage(this, u, v, impact, false, from > MIN_HIT)
  }
  // a crash landing on the face at (lx, lz): its lamps and glass, at once
  crash (lx, lz, impact) {
    const u = clamp(lx / this.hl, -1, 1),
      v = clamp(lz / this.hw, -1, 1)
    return breakage(this, u, v, impact, false, false)
  }
  // a crash onto its roof: all the glass over it crazes
  roof (impact) {
    let broke = 0
    for (const p of [PANE.front, PANE.rear, PANE.left, PANE.right])
      broke |= pane(this, p, impact, false, false)
    return broke
  }
  repair () {
    this.lamps = this.glass = this.v = 0
    this.t = -1
  }
}
