// The palms' and trees' leaves, drawn once at start-up on one sheet: everything cut out of a
// picture (a fan palm's leaf, a dead one hanging, the skirt of dead fronds under its crown, a date
// palm's feather frond, a spray of each street tree's leaves, a ficus's, a plane's and a
// jacaranda's, and the dense clump that stands for it far off, and the jacaranda's flowers). They
// are drawn in greys, so that each part's own colour tints them. (Their bark: treeBark.js.)
import * as THREE from 'three'
import { rng } from '../sim/city.js'
import { TAU } from '../sim/constants.js'

export const SIZE = 1024 // px: the sheet's side
// Where each picture lies on the sheet, in px: [x, y, width, height]. A tree's leaves and its
// clump lie at these, the other kinds' 256 px along from them (in the order of KINDS: ficus,
// plane, jacaranda), and the jacaranda's flowers after them, 768 px along.
export const SHEET = {
  fan: [0, 0, 256, 256],
  dead: [256, 0, 256, 256],
  skirt: [512, 0, 512, 256],
  frond: [0, 256, 1024, 128],
  leaves: [0, 384, 256, 256],
  clump: [0, 640, 256, 256]
}
// px in the fan leaf's square: where the stalk meets the blade, and the blade's radius
export const FAN_AT = [128, 140]
export const FAN_R = 100

const grey = (v, a = 1) => {
  const c = Math.max(0, Math.min(255, Math.round(v)))
  return `rgba(${c},${c},${c},${a})`
}
// a narrow leaf or leaflet from (x0, y0) to (x1, y1), widest a third of the way along
function blade (g, x0, y0, x1, y1, wid) {
  const dx = x1 - x0,
    dy = y1 - y0,
    l = Math.hypot(dx, dy) || 1
  const nx = (-dy / l) * wid,
    ny = (dx / l) * wid
  g.beginPath()
  g.moveTo(x0, y0)
  g.quadraticCurveTo(x0 + dx * 0.35 + nx, y0 + dy * 0.35 + ny, x1, y1)
  g.quadraticCurveTo(x0 + dx * 0.35 - nx, y0 + dy * 0.35 - ny, x0, y0)
  g.fill()
}

// A Mexican fan palm's leaf, flat: forty-odd stiff segments fanning out from the stalk, joined for
// half their length and split apart beyond, each folded along its middle (a light ridge), most of
// their tips split in two.
function fanLeaf (g, R) {
  const cx = SHEET.fan[0] + FAN_AT[0],
    cy = SHEET.fan[1] + FAN_AT[1]
  const at = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const n = 44,
    span = 1.9,
    da = (2 * span) / (n - 1)
  // the joined half, in the grey of the folds' valleys
  g.fillStyle = grey(150)
  g.beginPath()
  g.moveTo(cx, cy)
  for (let a = -span - da / 2; a < span + da; a += da / 4)
    g.lineTo(...at(Math.min(a, span + da / 2), FAN_R * 0.52))
  g.fill()
  for (let k = 0; k < n; k++) {
    const a = -span + k * da,
      tip = FAN_R * (0.84 + 0.16 * R()),
      v = 205 + 40 * R()
    g.fillStyle = grey(v)
    g.beginPath()
    g.moveTo(...at(a - da * 0.42, FAN_R * 0.06))
    g.lineTo(...at(a - da * 0.42, FAN_R * 0.5))
    g.lineTo(...at(a - da * 0.3, tip * 0.78))
    if (R() < 0.65) {
      g.lineTo(...at(a - da * 0.2, tip))
      g.lineTo(...at(a, tip * 0.86))
      g.lineTo(...at(a + da * 0.2, tip * 0.97))
    } else g.lineTo(...at(a, tip))
    g.lineTo(...at(a + da * 0.3, tip * 0.78))
    g.lineTo(...at(a + da * 0.42, FAN_R * 0.5))
    g.lineTo(...at(a + da * 0.42, FAN_R * 0.06))
    g.fill()
    // the fold along its middle, catching the light
    g.strokeStyle = grey(v + 35)
    g.lineWidth = 1.3
    g.beginPath()
    g.moveTo(...at(a, FAN_R * 0.12))
    g.lineTo(...at(a, tip * 0.8))
    g.stroke()
  }
  // the rib the stalk runs on into the blade, and where they meet (solid, for the stalk)
  g.fillStyle = grey(225)
  blade(g, cx, cy + 4, cx, cy - FAN_R * 0.4, 4)
  g.beginPath()
  g.arc(cx, cy, 7, 0, TAU)
  g.fill()
}

// A dead fan leaf hanging off its stalk, its segments folded shut into a bundle that frays out
// toward their tips.
function deadLeaf (g, R) {
  const [x0, y0] = SHEET.dead,
    cx = x0 + 128
  g.lineCap = 'round'
  for (let i = 0; i < 54; i++) {
    const a = (R() - 0.5) * 0.75,
      len = 150 + 62 * R(),
      top = y0 + 30 + 14 * R()
    g.strokeStyle = grey(140 + 90 * R())
    g.lineWidth = 2 + 4.5 * R()
    g.beginPath()
    g.moveTo(cx + (R() - 0.5) * 14, top)
    g.quadraticCurveTo(
      cx + Math.sin(a) * len * 0.25,
      top + len * 0.55,
      cx + Math.sin(a) * len * 0.75,
      Math.min(y0 + 252, top + len)
    )
    g.stroke()
  }
  g.strokeStyle = grey(170)
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(cx, y0 + 2)
  g.lineTo(cx, y0 + 46)
  g.stroke()
  g.lineCap = 'butt'
}

// The skirt of dead fronds round a fan palm's trunk under its crown, unrolled (it repeats across):
// the old leaf bases packed close at the top, in shade, then the dead leaves hanging over one
// another, each a bundle of straw-coloured strands, down to a ragged edge.
function skirt (g, R) {
  const [x0, y0, w, h] = SHEET.skirt
  g.save()
  g.beginPath()
  g.rect(x0, y0, w, h)
  g.clip()
  g.fillStyle = grey(92)
  g.fillRect(x0, y0, w, h * 0.6)
  g.lineCap = 'round'
  // (the leaf bases criss-crossing at the top)
  for (let i = 0; i < 70; i++) {
    const x = R() * w,
      s = R() < 0.5 ? -1 : 1
    for (const ox of [-w, 0, w]) {
      g.strokeStyle = grey(70 + 60 * R(), 0.8)
      g.lineWidth = 3 + 3 * R()
      g.beginPath()
      g.moveTo(x0 + x + ox, y0)
      g.lineTo(x0 + x + ox + s * 18, y0 + 42)
      g.stroke()
    }
  }
  for (let i = 0; i < 330; i++) {
    const x = R() * w,
      top = y0 + 26 + R() * 70,
      end = y0 + Math.min(h - 3, 150 + R() * 104),
      bend = (R() - 0.5) * 16,
      v = 110 + 110 * R(),
      lw = 2.5 + 5 * R()
    for (const ox of [-w, 0, w]) {
      g.strokeStyle = grey(v)
      g.lineWidth = lw
      g.beginPath()
      g.moveTo(x0 + x + ox, top)
      g.quadraticCurveTo(
        x0 + x + ox + bend,
        (top + end) / 2,
        x0 + x + ox + bend * 0.3,
        end
      )
      g.stroke()
    }
  }
  g.restore()
}

// A Canary Island date palm's feather frond, flat, its foot at the left: the rib along the middle
// and stiff narrow leaflets close along it on both sides, angled toward the tip, short spines at
// the foot.
function frond (g, R) {
  const [x0, y0, w, h] = SHEET.frond,
    cy = y0 + h / 2
  g.save()
  g.beginPath()
  g.rect(x0, y0, w, h)
  g.clip()
  for (let x = 12; x < w - 4; x += 4.6 + 2.2 * R()) {
    const spine = x < 96
    for (const side of [-1, 1]) {
      const len = spine ? 18 + 26 * R() : 80 + 9 * R(),
        a = spine ? 0.9 : 0.66 + 0.16 * R()
      g.fillStyle = grey(spine ? 130 : 170 + 75 * R())
      blade(
        g,
        x0 + x,
        cy + side * 1.5,
        x0 + x + Math.cos(a) * len,
        cy + side * Math.min(h / 2 - 1, Math.sin(a) * len),
        spine ? 0.8 : 1.7
      )
    }
  }
  g.strokeStyle = grey(215)
  for (let x = 0; x < w; x += 64) {
    g.lineWidth = 5.5 - (4.5 * x) / w
    g.beginPath()
    g.moveTo(x0 + x, cy)
    g.lineTo(x0 + x + 66, cy)
    g.stroke()
  }
  g.restore()
}

// n points inside a leafy outline round the middle of a square ([x, y, side]), each fn(x, y, a,
// h): a, its angle from the middle; h, how low it lies (-1 at the top to 1 at the foot). The
// outline's radius wanders with the angle, and the points fill it more thickly toward the middle
// (dense over 0.5) or evenly (0.5).
function scatter (R, [x0, y0, w], dense, n, fn) {
  const cx = x0 + w / 2,
    cy = y0 + w / 2,
    p1 = R() * TAU,
    p2 = R() * TAU
  for (let i = 0; i < n; i++) {
    const a = R() * TAU,
      wob = 0.05 * Math.sin(3 * a + p1) + 0.03 * Math.sin(5 * a + p2),
      edge = w * (0.38 + wob),
      r = edge * Math.pow(R(), dense),
      y = Math.sin(a) * r
    fn(cx + Math.cos(a) * r, cy + y, a, y / edge)
  }
}
// twigs from the middle out, dark between the leaves
function twigs (g, R, [x0, y0, w], n) {
  g.strokeStyle = grey(60)
  for (let i = 0; i < n; i++) {
    const a = R() * TAU,
      r = w * (0.25 + 0.15 * R())
    g.lineWidth = 2.4
    g.beginPath()
    g.moveTo(x0 + w / 2, y0 + w / 2)
    g.quadraticCurveTo(
      x0 + w / 2 + Math.cos(a + 0.4) * r * 0.5,
      y0 + w / 2 + Math.sin(a + 0.4) * r * 0.5,
      x0 + w / 2 + Math.cos(a) * r,
      y0 + w / 2 + Math.sin(a) * r
    )
    g.stroke()
  }
}
// a ficus's leaf: small, oval and glossy
function oval (g, x, y, s, a, v) {
  g.fillStyle = grey(v)
  g.beginPath()
  g.ellipse(x, y, s, s * 0.45, a, 0, TAU)
  g.fill()
  g.strokeStyle = grey(v - 55, 0.7)
  g.lineWidth = 0.8
  g.stroke()
  g.fillStyle = grey(v + 30, 0.6)
  g.beginPath()
  g.ellipse(x - s * 0.15, y - s * 0.12, s * 0.4, s * 0.15, a, 0, TAU)
  g.fill()
}
// a plane's leaf: five pointed lobes from its stalk, its veins lighter
const LOBES = [0.55, 0.85, 1, 0.85, 0.55]
function lobed (g, x, y, s, a, v) {
  g.fillStyle = grey(v)
  g.beginPath()
  g.moveTo(x, y)
  for (let j = 0; j < 9; j++) {
    const t = a + (j - 4) * 0.36,
      r = j % 2 ? s * 0.45 : s * LOBES[j / 2]
    g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r)
  }
  g.closePath()
  g.fill()
  g.strokeStyle = grey(v - 60, 0.6)
  g.lineWidth = 0.8
  g.stroke()
  g.strokeStyle = grey(v + 30, 0.7)
  for (const k of [-2, -1, 0, 1, 2]) {
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(
      x + Math.cos(a + k * 0.58) * s * 0.75,
      y + Math.sin(a + k * 0.58) * s * 0.75
    )
    g.stroke()
  }
}
// a jacaranda's leaf: a fern of tiny leaflets on side stalks off a stalk (each leaflet a short
// stroke with round ends, the whole fern drawn as one path)
function fern (g, x, y, s, a, v) {
  const dx = Math.cos(a),
    dy = Math.sin(a)
  g.strokeStyle = grey(v)
  g.lineWidth = 2.1
  g.lineCap = 'round'
  g.beginPath()
  for (let i = 1; i <= 8; i++) {
    const t = (i / 8) * s,
      px = x + dx * t,
      py = y + dy * t,
      pl = s * 0.32 * (1 - (0.6 * i) / 8)
    for (const side of [-1, 1]) {
      const b = a + side * 1.1,
        lx = Math.cos(b + 1.3) * 1.3,
        ly = Math.sin(b + 1.3) * 1.3
      for (let j = 1; j <= 7; j++) {
        const q = (j / 7) * pl,
          qx = px + Math.cos(b) * q,
          qy = py + Math.sin(b) * q
        g.moveTo(qx - lx, qy - ly)
        g.lineTo(qx + lx, qy + ly)
      }
    }
  }
  g.stroke()
  g.lineCap = 'butt'
}
// a jacaranda's flowers: a loose cone of little purple bells (purple in its colour), drawn as one
// path
function bells (g, R, x, y, s, a, v) {
  g.beginPath()
  for (let i = 0; i < 34; i++) {
    const t = R(),
      w = s * 0.45 * (1 - t) * (R() - 0.5)
    const px = x + Math.cos(a) * t * s - Math.sin(a) * w,
      py = y + Math.sin(a) * t * s + Math.cos(a) * w,
      r = R() * 3
    g.moveTo(px + 3.2 * Math.cos(r), py + 3.2 * Math.sin(r))
    g.ellipse(px, py, 3.2, 2.3, r, 0, TAU)
  }
  g.fillStyle = grey(v)
  g.fill()
  g.strokeStyle = grey(v - 70, 0.5)
  g.lineWidth = 0.7
  g.stroke()
}

// Each street tree's spray of leaves (seen near) and its dense clump (far off), and the
// jacaranda's flowers: each leaf a grey of its own, the lower part of a spray a shade darker (and
// of a clump more so), as leaves are lit from above.
function trees (g, R) {
  const near = k => [SHEET.leaves[0] + 256 * k, SHEET.leaves[1], 256],
    far = k => [SHEET.clump[0] + 256 * k, SHEET.clump[1], 256],
    tone = (lo, span, h) => lo + span * R() - 34 * h,
    turn = (a, k) => a + (R() - 0.5) * k
  // a ficus's, small and oval
  const ficus = (x, y, a, h) =>
    oval(g, x, y, 7 + 4 * R(), turn(a, 1.8), tone(165, 75, h))
  const ficusFar = (x, y, a, h) =>
    oval(g, x, y, 6 + 3 * R(), R() * 6, tone(150, 85, 1.6 * h))
  twigs(g, R, near(0), 7)
  scatter(R, near(0), 0.62, 170, ficus)
  scatter(R, far(0), 0.5, 520, ficusFar)
  // a plane's, big and lobed
  const plane = (x, y, a, h) =>
    lobed(g, x, y, 20 + 9 * R(), turn(a, 1.4), tone(160, 80, h))
  const planeFar = (x, y, a, h) =>
    lobed(g, x, y, 15 + 7 * R(), R() * 6, tone(150, 85, 1.6 * h))
  twigs(g, R, near(1), 5)
  scatter(R, near(1), 0.55, 34, plane)
  scatter(R, far(1), 0.5, 120, planeFar)
  // a jacaranda's, feathery
  const jacaranda = (x, y, a, h) =>
    fern(g, x, y, 44 + 26 * R(), turn(a, 1), tone(170, 70, h))
  const jacarandaFar = (x, y, a, h) =>
    fern(g, x, y, 30 + 14 * R(), R() * 6, tone(160, 80, 1.6 * h))
  twigs(g, R, near(2), 6)
  scatter(R, near(2), 0.7, 34, jacaranda)
  scatter(R, far(2), 0.5, 70, jacarandaFar)
  // and its flowers
  const flowers = (x, y, a, h) =>
    bells(g, R, x, y, 30 + 16 * R(), a, tone(205, 40, h))
  const flowersFar = (x, y, a, h) =>
    bells(g, R, x, y, 22 + 10 * R(), R() * 6, tone(195, 50, 1.6 * h))
  scatter(R, near(3), 0.6, 44, flowers)
  scatter(R, far(3), 0.5, 90, flowersFar)
}

// The sheet, as a texture: the canvas as the browser keeps it, each colour multiplied by its
// opacity (so the texture's smaller copies blend a picture's edges with nothing rather than with
// black) and still in sRGB; the shader divides the opacity out and decodes the colour
// (treeWind.js). Its top row is at v = 0: v counts down the sheet, as y does.
export function foliageSheet () {
  const R = rng(4242)
  const cv = document.createElement('canvas')
  cv.width = cv.height = SIZE
  const g = cv.getContext('2d')
  fanLeaf(g, R)
  deadLeaf(g, R)
  skirt(g, R)
  frond(g, R)
  trees(g, R)
  const t = new THREE.CanvasTexture(cv)
  t.flipY = false
  t.premultiplyAlpha = true
  t.anisotropy = 4
  return t
}
