// The palms' shapes (cityTrees.js plants them, treeWind.js moves them), each in two: the full one
// for those near the camera and a cheap one for the rest, alike in outline and colour so that one
// hands over to the other unseen. The Mexican fan palm: a slender grey-brown trunk ringed with old
// leaf scars, flared and darker at its foot, swelling a little under its head where the old leaf
// bases are; the head a dense ball of stiff pleated fans on long stalks, the young ones standing
// up, the old ones drooping; under it the skirt of dead fronds hanging against the trunk, as long
// as each palm's own (the shader stretches it: a trimmed palm's short collar, an untrimmed one's
// shag many metres long), dead leaves hanging over it. The Canary Island date palm: a thick trunk
// patterned with the diamonds of old leaf bases, a knob of fresher ones under its crown, and a big
// crown of long arching feather fronds folded into a V along their ribs, a few dead ones hanging
// under them (trimmed off some palms).
import * as THREE from 'three'
import {
  Shape,
  PART,
  tube,
  barkUV,
  card,
  add,
  scale,
  cross,
  norm
} from './treeShapes.js'
import { SHEET, SIZE, FAN_AT, FAN_R } from './treeTex.js'
import { rng } from '../sim/city.js'
import { TAU } from '../sim/constants.js'

export const FAN_H = 24 // m: a fan palm as built (each is scaled to its own height)
export const DATE_H = 10 // m: a date palm
// m up: where a fan palm's skirt starts to hang (built 1 m long, for the shader to stretch)
export const SKIRT_Y = FAN_H - 0.55

const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const hex = h => new THREE.Color(h)
const YOUNG = hex(0x7fa548),
  MATURE = hex(0x5f8a3a),
  OLD = hex(0x8c9a48),
  STALK = hex(0x8e9258),
  STRAW = hex(0xa48c62)
const FROND_YOUNG = hex(0x66903a),
  FROND = hex(0x4e7430),
  FROND_OLD = hex(0x7a8c42),
  PETIOLE = hex(0xa49c5c),
  DEAD = hex(0x9a8058)

// ---------- the Mexican fan palm ----------
// its trunk's radius at y: flared at the foot, tapering, swelling under the head
const fanR = y =>
  0.165 +
  0.04 * (1 - y / FAN_H) +
  0.13 * Math.exp(-y / 0.45) +
  0.06 * smooth((y - FAN_H + 2.6) / 1.8)
// its colour (on the bark texture) at y: darkened at the foot, browner among the old leaf bases
const fanTrunk = (y, c) => {
  const f = 0.55 + 0.45 * smooth(y / 1.4),
    b = smooth((y - 20.5) / 2.6)
  return c.setRGB(f * (1 - 0.1 * b), f * (1 - 0.24 * b), f * (1 - 0.4 * b))
}
// A fan leaf on its stalk from foot (on the crown) out along d (azimuth a) to at, its blade br m
// across, t how old it is (0 young and standing up, 1 old and drooping). The blade is a fan of
// triangles over the leaf's picture, every other spoke raised (the pleats, near), folded down
// either side of its rib and drooping at its edges.
function fan (sh, foot, at, d, a, br, t, near, phase) {
  const l = [-Math.sin(a), 0, Math.cos(a)],
    f = norm(add(d, [0, -(0.3 + 0.5 * t), 0])),
    nb = norm(cross(l, f))
  const J = near ? 6 : 4,
    span = 1.9,
    half = span / (J - 1),
    rim = br / Math.cos(half),
    ruv = FAN_R / Math.cos(half)
  const cx = SHEET.fan[0] + FAN_AT[0],
    cy = SHEET.fan[1] + FAN_AT[1]
  const green =
    t < 0.5
      ? YOUNG.clone().lerp(MATURE, t * 2)
      : MATURE.clone().lerp(OLD, (t - 0.5) * 2)
  const dark = green.clone().multiplyScalar(0.7)
  const sway = g => [1, g, phase, PART.leaf]
  // (every normal leans out from the head's middle, so the head reads round)
  const round = scale(d, 0.35)
  const h0 = sh.vert(at, add(nb, round), cx / SIZE, cy / SIZE, dark, sway(0.35))
  const rims = []
  for (let j = 0; j < J; j++) {
    const th = -span + 2 * half * j,
      s = Math.abs(Math.sin(th)),
      up = j % 2 ? 1 : -1,
      pleat = near ? (up > 0 ? 0.07 : -0.05) * br : 0
    const dir = add(scale(f, Math.cos(th)), scale(l, Math.sin(th))),
      droop = -(0.1 + 0.25 * t) * br * (0.6 + 0.4 * s)
    const p = add(
      add(at, scale(dir, rim)),
      add(scale(nb, pleat - 0.3 * br * s), [0, droop, 0])
    )
    const n = add(add(nb, round), scale(l, near ? 0.3 * up : 0))
    const u = (cx + ruv * Math.sin(th)) / SIZE,
      v = (cy - ruv * Math.cos(th)) / SIZE
    rims.push(sh.vert(p, n, u, v, green, sway(1)))
  }
  for (let j = 0; j + 1 < J; j++) sh.tri(h0, rims[j + 1], rims[j])
  if (!near) return
  // the stalk, a narrow strip of the picture's solid middle
  const pu = cx / SIZE,
    pv = (cy + 3) / SIZE,
    dim = STALK.clone().multiplyScalar(0.8)
  const k = [
    [add(foot, scale(l, -0.045)), dim, 0],
    [add(foot, scale(l, 0.045)), dim, 0],
    [add(at, scale(l, 0.03)), STALK, 0.35],
    [add(at, scale(l, -0.03)), STALK, 0.35]
  ].map(([p, c, g]) => sh.vert(p, add(nb, round), pu, pv, c, sway(g)))
  sh.quad(k[0], k[1], k[2], k[3])
}
// The skirt of dead fronds: a shoulder from the trunk's top out to where they fold down, then
// hanging (built 1 m long, below SKIRT_Y, for the shader to stretch); near, dead leaves hanging
// over it, stretched with it.
function skirt (sh, near, R) {
  const [x0, y0, w] = SHEET.skirt,
    c = new THREE.Color()
  // [y, radius, part, px down the skirt's picture, shade]
  const rows = near
    ? [
        [FAN_H - 0.12, 0.32, PART.dead, 2, 0.42],
        [SKIRT_Y, 1.0, PART.dead, 40, 0.62],
        [SKIRT_Y - 0.35, 0.97, PART.skirt, 114, 0.85],
        [SKIRT_Y - 0.7, 0.9, PART.skirt, 188, 1],
        [SKIRT_Y - 1, 0.8, PART.skirt, 252, 1]
      ]
    : [
        [SKIRT_Y, 1.02, PART.dead, 40, 0.62],
        [SKIRT_Y - 1, 0.84, PART.skirt, 252, 1]
      ]
  tube(
    sh,
    rows.map(r => [0, r[0], 0]),
    rows.map(r => r[1]),
    near ? 9 : 5,
    (u, i) => [(x0 + u * w) / SIZE, (y0 + rows[i][3]) / SIZE],
    i => c.copy(STRAW).multiplyScalar(rows[i][4]),
    i => [1, 0.7 * (SKIRT_Y - Math.min(SKIRT_Y, rows[i][0])), 0.5, rows[i][2]]
  )
  if (!near) return
  // its underside, seen from below: the dead fronds' ends packed round the trunk
  const under = STRAW.clone().multiplyScalar(0.45),
    y = SKIRT_Y - 0.97,
    sw = [1, 0.6, 0.5, PART.skirt],
    ring = []
  for (let k = 0; k <= 9; k++) {
    const a = (k / 9) * TAU,
      u = (x0 + (k / 9) * w) / SIZE,
      at = r => [Math.cos(a) * r, y, Math.sin(a) * r]
    ring.push([
      sh.vert(at(0.78), [0, -1, 0], u, (y0 + 60) / SIZE, under, sw),
      sh.vert(at(0.28), [0, -1, 0], u, (y0 + 30) / SIZE, under, sw)
    ])
  }
  for (let k = 0; k < 9; k++)
    sh.quad(ring[k][0], ring[k + 1][0], ring[k + 1][1], ring[k][1])
  // and dead leaves hanging over it
  const [dx, dy, ds] = SHEET.dead
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + R() * 0.6,
      out = [Math.cos(a), 0, Math.sin(a)],
      k = 0.8 + 0.3 * R(),
      phase = R()
    card(
      sh,
      add(scale(out, 1.04), [0, SKIRT_Y - 0.5, 0]),
      out,
      1,
      [dx, dy, ds],
      () => out,
      () => c.copy(STRAW).multiplyScalar(k),
      p => [1, 0.7 * Math.max(0, SKIRT_Y - p[1]), phase, PART.skirt]
    )
  }
}
// A Mexican fan palm, as built: 24 m to the middle of its head.
export function fanPalm (near) {
  const R = rng(near ? 1101 : 1102)
  const sh = new Shape(),
    c = new THREE.Color()
  const ys = near
    ? [0, 0.3, 0.9, 2.2, 5, 9, 13, 17, 20.5, 22.3, 23.6]
    : [0, 1.2, 12, 23.6]
  tube(
    sh,
    ys.map(y => [0, y, 0]),
    ys.map(y => fanR(y) * (near ? 1 : 1.1)),
    near ? 8 : 5,
    barkUV(2.5),
    i => fanTrunk(ys[i], c),
    i => [Math.min(0.99, ys[i] / FAN_H), 0, 0, PART.bark]
  )
  skirt(sh, near, R)
  // the leaves, round the head in a spiral, the youngest at the top
  const n = near ? 36 : 14
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1),
      a = i * 2.39996 + (R() - 0.5) * 0.4,
      e = 1.05 - 2.05 * Math.pow(t, 0.9) + (R() - 0.5) * 0.16,
      ce = Math.cos(e)
    const d = [ce * Math.cos(a), Math.sin(e), ce * Math.sin(a)]
    const foot = [Math.cos(a) * 0.22, FAN_H - 0.18, Math.sin(a) * 0.22],
      stalk = near ? 0.85 + 0.3 * R() : 0.8,
      at = add(foot, add(scale(d, stalk), [0, -0.1 * stalk * t, 0]))
    const br = (near ? 1.02 : 1.12) * (0.92 + 0.18 * R())
    fan(sh, foot, at, d, a, br, t, near, R())
  }
  return sh.geometry()
}

// ---------- the Canary Island date palm ----------
// its trunk's radius at y: flared at the foot, the knob of leaf bases under the crown
const dateR = y =>
  0.36 +
  0.06 * (1 - y / DATE_H) +
  0.14 * Math.exp(-y / 0.35) +
  0.2 * Math.sin(Math.PI * smooth((y - 8.4) / 1.55))
const dateTrunk = (y, c) => {
  const f = 0.6 + 0.4 * smooth(y / 1.2),
    k = smooth((y - 8.2) / 0.6)
  return c.setRGB(f * (1 + 0.12 * k), f * (1 - 0.08 * k), f * (1 - 0.3 * k))
}
// A feather frond from the crown, f: { a, e, len, sag, segs, vee, roll }: along azimuth a, rising
// at e, len m long and arching down (sag: how far its tip falls, as a share of its length), segs
// pieces along; vee: folded into a V along its rib (near), or flat and rolled about its rib by roll
// (rad, so that far off, where the fronds are flat, some of them face the camera from any side).
// col(s): its colour s of the way along.
function frond (sh, f, col, phase, part) {
  const { a, e, len, sag, segs, vee, roll = 0 } = f
  const hd = [Math.cos(a), 0, Math.sin(a)],
    lat = [-Math.sin(a), 0, Math.cos(a)]
  const [x0, y0, w, h] = SHEET.frond
  const ce = Math.cos(e),
    se = Math.sin(e),
    cf = Math.cos(vee ? 0.5 : 0),
    sf = Math.sin(vee ? 0.5 : 0),
    round = scale(hd, 0.3)
  let last = null
  for (let k = 0; k <= segs; k++) {
    // (from a foot just out from the crown's middle)
    const s = k / segs,
      out = 0.25 + len * s * ce,
      rise = len * (s * se - sag * s * s),
      p = [hd[0] * out, DATE_H - 0.1 + rise, hd[2] * out]
    const tan = norm(add(scale(hd, ce), [0, se - 2 * sag * s, 0])),
      up = norm(cross(lat, tan))
    // (across it and up from it, rolled about its rib)
    const side = add(scale(lat, Math.cos(roll)), scale(up, Math.sin(roll))),
      top = add(scale(up, Math.cos(roll)), scale(lat, -Math.sin(roll)))
    const bulge = Math.sin(Math.PI * Math.min(1, s * 1.1)),
      wid = 0.6 * (0.1 + 0.9 * Math.pow(bulge, 0.7))
    const u = (x0 + Math.min(s, 0.995) * w) / SIZE,
      c = col(s),
      sw = [1, s, phase, part],
      lift = scale(top, wid * sf)
    const L = sh.vert(
      add(p, add(scale(side, -wid * cf), lift)),
      add(add(scale(top, cf), scale(side, sf)), round),
      u,
      (y0 + 1) / SIZE,
      c,
      sw
    )
    const Rr = sh.vert(
      add(p, add(scale(side, wid * cf), lift)),
      add(add(scale(top, cf), scale(side, -sf)), round),
      u,
      (y0 + h - 1) / SIZE,
      c,
      sw
    )
    const M = vee
      ? sh.vert(p, add(top, round), u, (y0 + h / 2) / SIZE, c, sw)
      : -1
    if (last) {
      if (!vee) sh.quad(last[0], last[1], Rr, L)
      else {
        sh.quad(last[0], last[2], M, L)
        sh.quad(last[2], last[1], Rr, M)
      }
    }
    last = [L, Rr, M]
  }
}
// A Canary Island date palm, as built: 10 m to the middle of its crown.
export function datePalm (near) {
  const R = rng(near ? 2101 : 2102)
  const sh = new Shape(),
    c = new THREE.Color()
  const ys = near
    ? [0, 0.3, 1.5, 3.5, 5.5, 7.5, 8.4, 8.9, 9.4, 9.95]
    : [0, 8.4, 9.2, 9.95]
  tube(
    sh,
    ys.map(y => [0, y, 0]),
    ys.map(y => dateR(y) * (near ? 1 : 1.08)),
    near ? 9 : 5,
    barkUV(2),
    i => dateTrunk(ys[i], c),
    i => [Math.min(0.99, ys[i] / DATE_H), 0, 0, PART.bark]
  )
  // the fronds, round the crown in a spiral, the youngest (and shortest) at the top
  const n = near ? 32 : 20
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1),
      a = i * 2.39996 + (R() - 0.5) * 0.3,
      e = 1.0 - 1.3 * t + (R() - 0.5) * 0.12,
      len = (3.9 + 1.3 * R()) * (0.78 + 0.22 * Math.min(1, 3 * t)),
      sag = 0.22 + 0.5 * t,
      segs = near ? 4 : 2,
      roll = near ? 0 : i % 2 ? 0.7 : -0.7
    const colour = s =>
      c
        .copy(FROND_YOUNG)
        .lerp(FROND, Math.min(1, t * 2))
        .lerp(FROND_OLD, Math.max(0, t * 2 - 1) * 0.7)
        .lerp(PETIOLE, 1 - smooth(s / 0.18))
        .multiplyScalar(0.65 + 0.35 * smooth(s / 0.5))
    const f = { a, e, len, sag, segs, vee: near, roll }
    frond(sh, f, colour, R(), PART.leaf)
  }
  // the dead ones hanging under them
  const dead = s => c.copy(DEAD).multiplyScalar(0.75 + 0.3 * s)
  for (let i = 0; i < (near ? 5 : 3); i++) {
    const a = i * 2.4 + R(),
      e = -1.15 - 0.25 * R(),
      len = 2.8 + 0.6 * R(),
      segs = near ? 3 : 1
    frond(sh, { a, e, len, sag: 0.05, segs }, dead, R(), PART.dead)
  }
  return sh.geometry()
}
