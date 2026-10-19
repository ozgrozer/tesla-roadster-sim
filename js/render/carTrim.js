// The trim on the traffic's bodies (carShapes.js), in vertex colours (carParts.js): the black round
// the glass (the window surrounds, chrome on the old and the stately, the pillars, the frit at the
// edges of the windscreen and rear window, the cowl and its wipers), the doors' shut lines and
// flush handles, wing mirrors on the doors with their indicators (a truck's big ones out on their
// arms), dark wheel wells, grilles and intakes, the bumpers' shut lines, California plates front
// and back, and each type's own pieces (carExtras.js). Chrome and gloss black are tagged for the
// trim's material (carLamps.js) to give them their shine.
import * as THREE from 'three'
import { at } from './loft.js'
import { P, sideAt, lerp } from './carBody.js'
import {
  LAMP,
  LENS,
  BLACK,
  GLOSS,
  CHROME,
  paint,
  box,
  piece,
  rounded,
  wrap,
  band,
  across
} from './carParts.js'
import { extras } from './carExtras.js'

// The trim of type T on its body (lines B, stations st); paint_ and glass: body-coloured pieces and
// glass go in them
export function trimFor (T, B, st, paint_, glass) {
  const out = []
  // (a piece already coloured goes in as it is)
  const put = (g, c, lamp = LAMP.none) =>
    out.push(c === undefined ? g : paint(g, c, lamp))
  const name = T.name
  const g0 = Math.max(B.glass[0], B.cp),
    g1 = B.glass[1]
  // round the side windows: gloss black (or chrome) along their tops and the backs of them, a slim
  // strip along their feet, and the black pillars between them
  const frame = B.chromed ? [CHROME, LAMP.chrome] : [GLOSS, LAMP.gloss]
  if (g1 > g0) {
    put(band(st, P.rail, P.belt, g0, g1, 0.035), ...frame)
    put(band(st, P.belt, P.rail, g0 + 0.02, g1, 0.02, 0.003), ...frame)
  }
  for (const x of B.pillars || [])
    put(across(st, x, P.belt, P.rail, 0.09), GLOSS, LAMP.gloss)
  // the windscreen's black frit up its sides and along its top, the cowl at its foot
  if (B.ws - B.rf > 0.05 && name !== 'bus') {
    put(band(st, P.rail, P.edge, B.rf, B.ws, 0.05, 0.003), BLACK)
    put(across(st, B.rf + 0.02, P.rail, P.crown, 0.05, 0.003), BLACK)
    put(across(st, B.ws - 0.02, P.belt, P.crown, 0.05, 0.004), BLACK)
    wipers(B, st, put)
  }
  // and round the rear window
  if (B.rr - B.rw > 0.05) {
    put(band(st, P.edge, P.crown, B.rw, B.rr, 0.045, 0.003), BLACK)
    put(across(st, B.rr - 0.02, P.edge, P.crown, 0.04, 0.003), BLACK)
    put(across(st, B.rw + 0.02, P.edge, P.crown, 0.04, 0.003), BLACK)
  }
  // the doors' shut lines, from the sill (over an arch, from above it) to the beltline
  const overArch = x => B.axles.some(a => Math.abs(x - a) < B.r + 0.12)
  for (const x of B.doors) {
    const k0 = overArch(x) ? P.crease : P.sill
    put(across(st, x, k0, P.belt, 0.009, 0.002), 0x08090b)
  }
  // flush door handles, just under the shoulder (a police car's black, the rest chrome)
  const handle = name === 'police' ? [GLOSS, LAMP.gloss] : [CHROME, LAMP.chrome]
  if (name !== 'bus')
    for (let i = 0; i + 1 < B.doors.length && i < 2; i++) {
      const x = B.doors[i] - 0.14,
        y = B.belt(x) - 0.12
      const o = { side: [x - 0.16, x], yb: [y, y], yt: [y + 0.022, y + 0.022] }
      wrap(st, 1, o, [[0, 1, ...handle]], 0.004, out)
    }
  mirrors(B, st, put, paint_)
  wells(B, put)
  faces(T, B, st, put, out)
  extras(T, B, st, put, glass)
  return out
}

// wing mirrors on the doors: a housing in the body colour (into paint; chrome on the chromed ones),
// rounded in front and flat behind, on a black arm, the glass facing back, an indicator along its
// outer edge; a van's, an ambulance's and a box truck's bigger, and a bus's and a fire engine's
// tall rectangles out on their arms
const BIG = { van: 1.35, ambulance: 1.55, truck: 1.55 }
// (the mirror's foot and top)
const TALL = { bus: [1.95, 2.55], fire: [1.85, 2.4] }
function mirrors (B, st, put, paint_) {
  const mx = B.mirror
  const big = BIG[B.name] || 1,
    tall = TALL[B.name]
  for (const s of [-1, 1]) {
    const zw = sideAt(st, mx, B.belt(mx) - 0.02)
    if (tall) {
      const [y0, y1] = tall,
        z = s * (B.W + 0.32)
      const z0 = s > 0 ? B.W - 0.05 : -B.W - 0.3,
        z1 = s > 0 ? B.W + 0.3 : -B.W + 0.05
      put(box(mx - 0.03, y1, z0, mx + 0.03, y1 + 0.05, z1), BLACK)
      put(box(mx - 0.05, y0, z - 0.12, mx + 0.04, y1, z + 0.12), BLACK)
      const gx = mx - 0.058
      put(box(gx, y0 + 0.03, z - 0.1, gx + 0.008, y1 - 0.03, z + 0.1), 0x1a2632)
      continue
    }
    const my = B.belt(mx) + 0.07 * big,
      zc = zw + 0.13 * big
    const cap = new THREE.SphereGeometry(1, 6, 4, Math.PI / 2, Math.PI)
      .scale(0.075 * big, 0.072 * big, 0.125 * big)
      .translate(mx - 0.035 * big, my, s * zc)
    if (B.chromed) put(cap, CHROME, LAMP.chrome)
    else paint_.push(cap)
    const a0 = s > 0 ? zw - 0.02 : -zc,
      a1 = s > 0 ? zc : -zw + 0.02
    const arm = box(
      mx - 0.035,
      my - 0.055 * big,
      a0,
      mx + 0.025,
      my - 0.025 * big,
      a1
    )
    put(arm, GLOSS, LAMP.gloss)
    const frame = rounded(0.23 * big, 0.12 * big, 0.04),
      mirror = rounded(0.2 * big, 0.1 * big, 0.035)
    put(piece(frame, 'x-', mx - 0.037 * big, my, s * zc, 0x0a0c0e))
    put(piece(mirror, 'x-', mx - 0.04 * big, my, s * zc, 0x2a3a48))
    const zi = s * (zc + 0.105 * big),
      ind = s > 0 ? LAMP.right : LAMP.left
    const strip = box(
      mx - 0.03,
      my - 0.03,
      zi - 0.012,
      mx + 0.025,
      my - 0.012,
      zi + 0.012
    )
    put(strip, LENS[ind], ind)
  }
}

// the wheel wells: an inner wall and a dark roof over each wheel, out to the body's side there
function wells (B, put) {
  const r = B.r + 0.045,
    inner = B.track - B.tyre / 2 - 0.05
  for (const s of [-1, 1])
    for (const ax of B.axles) {
      const W = B.W - B.inset(ax)
      const wall = new THREE.CircleGeometry(r, 10, 0, Math.PI)
      put(wall.translate(ax, B.r, s * inner), BLACK)
      const arc = new THREE.CylinderGeometry(
        r,
        r,
        W - inner + 0.02,
        10,
        1,
        true,
        Math.PI * 0.5,
        Math.PI
      )
        .rotateX(Math.PI / 2)
        .translate(ax, B.r, (s * (inner + W)) / 2)
      put(arc, BLACK)
    }
}

// the windscreen wipers, parked along the foot of the glass: each a blade lying on it
function wipers (B, st, put) {
  const x = B.ws - 0.06
  const y = z => {
    // (the glass's height across at x)
    let prev = at(st, x, P.crown)
    for (let k = P.crown - 1; k >= P.belt; k--) {
      const p = at(st, x, k)
      if (z <= p[0])
        return lerp(prev[1], p[1], (z - prev[0]) / (p[0] - prev[0] || 1))
      prev = p
    }
    return prev[1]
  }
  for (const [z0, z1] of [
    [-0.5, -0.04],
    [0.06, 0.48]
  ]) {
    const zm = (z0 + z1) / 2
    const blade = new THREE.BoxGeometry(0.024, 0.014, z1 - z0)
      .rotateX(-Math.atan2(y(z1) - y(z0), z1 - z0))
      .translate(x, y(zm) + 0.012, zm)
    put(blade, BLACK)
  }
}

// What sits on the nose and the tail's faces: grilles ([bottom, top, half width]), intakes, plates
// (their heights, front and back), the bumpers' shut lines (their heights, front and back). (A
// fire engine's, a box truck's, a lowrider's and a limousine's grilles are their own: carRigs.js,
// carClassics.js.)
// prettier-ignore
const FACE = {
  sedan: { grille: [0.62, 0.66, 0.3], intake: [0.36, 0.56, 0.5], plate: [0.46, 0.62], lines: [0.6, 0.835] },
  hatch: { grille: [0.6, 0.66, 0.28], intake: [0.36, 0.56, 0.48], plate: [0.46, 0.64], lines: [0.6, 0.82] },
  suv: { grille: [0.62, 0.82, 0.38], intake: [0.48, 0.6, 0.5], plate: [0.66, 0.78], lines: [0.8, 0.96] },
  taxi: { intake: [0.32, 0.5, 0.5], plate: [0.42, 0.66], lines: [0.55, 0.8] },
  pickup: { grille: [0.68, 1.13, 0.48], chrome: true, plate: [0.52, 0.94] },
  van: { grille: [0.66, 0.94, 0.42], plate: [0.5, 0.86] },
  bus: { plate: [0.6, 1.32] },
  police: { grille: [0.62, 0.82, 0.38], intake: [0.48, 0.6, 0.5], plate: [0.66, 0.78], lines: [0.8, 0.96] },
  sports: { intake: [0.26, 0.44, 0.62], plate: [0.4, 0.6], lines: [0.5, 0.78] },
  ambulance: { grille: [0.68, 1.16, 0.4], chrome: true, plate: [0.54, 0.95] },
  fire: { plate: [0.7, 0.98] },
  truck: { plate: [0.6, 1.05] },
  lowrider: { plate: [0.42, 0.58] },
  limo: { plate: [0.42, 0.64], lines: [0.62, 0.82] }
}
function faces (T, B, st, put, out) {
  const F = FACE[T.name],
    { L } = B
  if (F.lines) {
    // the bumpers' shut lines across the nose and the tail, round the corners to the arches
    const [f, r] = F.lines
    const reach = [L - B.axles[0] - B.r - 0.09, L + B.axles[1] - B.r - 0.09]
    for (const [e, y, d] of [
      [1, f, reach[0]],
      [-1, r, reach[1]]
    ]) {
      const o = { z0: 0, d, yb: [y, y], yt: [y + 0.008, y + 0.008] }
      wrap(st, e, o, [[0, 1, 0x070809, LAMP.none]], 0.0025, out)
    }
  }
  if (F.grille) {
    const [y0, y1, w] = F.grille,
      ym = (y0 + y1) / 2
    const surround = F.chrome ? [CHROME, LAMP.chrome] : [GLOSS, LAMP.gloss]
    const outer = rounded(w * 2 + 0.04, y1 - y0 + 0.04, 0.05)
    put(piece(outer, 'x+', L + 0.003, ym, 0, ...surround))
    put(piece(rounded(w * 2, y1 - y0, 0.04), 'x+', L + 0.006, ym, 0, 0x060707))
    if (F.chrome)
      for (const y of [0.85, 0.98]) {
        const bar = rounded(w * 2 - 0.04, 0.035, 0.01, 1)
        put(piece(bar, 'x+', L + 0.009, y, 0, CHROME, LAMP.chrome))
      }
  }
  if (F.intake) {
    const [y0, y1, w] = F.intake
    const half = Math.min(w, sideAt(st, L, y1) - 0.08)
    const g = rounded(half * 2, y1 - y0, 0.045)
    put(piece(g, 'x+', L + 0.004, (y0 + y1) / 2, 0, 0x070808))
  }
  // California plates: white, the state's name in red across the top, the number in dark blue
  const [pf, pr] = F.plate
  for (const [x, y, face] of [
    [L + 0.008, pf, 'x+'],
    [-L - 0.008, pr, 'x-']
  ]) {
    const f = face === 'x+' ? 1 : -1
    const frame = rounded(0.33, 0.175, 0.012),
      plate = rounded(0.305, 0.152, 0.008)
    const state = rounded(0.16, 0.022, 0.004, 1),
      number = rounded(0.24, 0.055, 0.004, 1)
    put(piece(frame, face, x, y, 0, BLACK))
    put(piece(plate, face, x + f * 0.003, y, 0, 0xc4c5c0))
    put(piece(state, face, x + f * 0.005, y + 0.048, 0, 0xb3242c))
    put(piece(number, face, x + f * 0.005, y - 0.012, 0, 0x1c2a5c))
  }
}
