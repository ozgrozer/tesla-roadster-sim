// The city's signs and pictures, drawn into one atlas at startup: billboards, old hotels' names for
// their roofs, theatre marquees and blade signs, a motel's neon, fast-food and strip-mall signs on
// poles, gas prices and a gas station's canopy fascia, murals for the walls, a helipad's H and a
// pool's water. Every name and brand is made up. Lit signs use the atlas as their own glow too
// (citySigns.js), so what is bright here glows at night: the letters on a dark sign, the whole face
// of a billboard under its lamps.
import * as THREE from 'three'
import { rng } from '../sim/city.js'
import { renderer } from './scene.js'
import {
  SERIF,
  text,
  grad,
  bulbs,
  BILLBOARDS,
  HOTELS,
  FILMS,
  BLADES,
  NEON,
  FOODS,
  BRANDS,
  mural
} from './signArt.js'

const R = rng(31)
const W = 2048,
  H = 2048

// the cells, in the order they are packed: kind -> [[w, h], ...] (px)
const SIZES = {
  billboard: Array(8).fill([512, 168]),
  hotel: Array(6).fill([660, 146]),
  marquee: Array(4).fill([512, 70]),
  blade: Array(10).fill([80, 320]),
  mural: Array(6).fill([360, 160]),
  motel: [[240, 216]],
  food: Array(4).fill([240, 164]),
  mall: Array(2).fill([150, 234]),
  price: Array(4).fill([150, 208]),
  fascia: Array(4).fill([1000, 36]),
  helipad: [[256, 256]],
  pool: [[128, 128]],
  door: Array(4).fill([48, 96]),
  panel: [[128, 128]], // a canopy's lit ceiling
  bulbs: [[128, 64]], // a marquee's underside
  light: [[16, 16]], // a lamp: white
  green: [[16, 16]] // a helipad's edge lights
}

// Shelf-pack every cell into the atlas: tallest rows first. Returns kind -> [uv rect, ...] with
// each rect [u0, v0, u1, v1] (v up), and the px box to draw it in.
function pack () {
  const all = []
  for (const [kind, list] of Object.entries(SIZES))
    list.forEach(([w, h], i) => all.push({ kind, i, w, h }))
  all.sort((a, b) => b.h - a.h)
  let x = 0,
    y = 0,
    row = 0
  for (const c of all) {
    if (x + c.w > W) {
      x = 0
      y += row + 2
      row = 0
    }
    c.x = x
    c.y = y
    x += c.w + 2
    row = Math.max(row, c.h)
  }
  if (y + row > H) throw new Error('signTex.js: the atlas is full')
  const out = {}
  for (const c of all) {
    ;(out[c.kind] = out[c.kind] || [])[c.i] = c
    // (half a pixel in, so a cell's edge never picks up its neighbour)
    c.uv = [
      (c.x + 0.5) / W,
      1 - (c.y + c.h - 0.5) / H,
      (c.x + c.w - 0.5) / W,
      1 - (c.y + 0.5) / H
    ]
  }
  return out
}

function draw (g, c) {
  const { kind, i, x, y, w, h } = c
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  if (kind === 'billboard') BILLBOARDS[i](g, x, y, w, h)
  else if (kind === 'hotel') {
    // letters only (the rest stays clear: cut away by the material)
    text(g, HOTELS[i], x + w / 2, y + h * 0.52, h * 0.72, {
      color: ['#ff4d4d', '#fff4d6', '#36e2ff'][i % 3],
      maxW: w * 0.96
    })
  } else if (kind === 'marquee') {
    g.fillStyle = '#f5ecd2'
    g.fillRect(x, y, w, h)
    bulbs(g, x, y, w, h, 10)
    text(g, 'NOW SHOWING', x + w / 2, y + h * 0.3, h * 0.2, {
      color: '#a51c1c'
    })
    text(g, FILMS[i], x + w / 2, y + h * 0.66, h * 0.36, {
      color: '#1b1b1b',
      maxW: w * 0.8
    })
  } else if (kind === 'blade') {
    // vertical letters in neon on a dark face, a border of bulbs (the theatres' first)
    g.fillStyle = i < 4 ? '#7a1712' : '#16161c'
    g.fillRect(x, y, w, h)
    if (i < 4) bulbs(g, x, y, w, h, 12)
    const s = BLADES[i],
      n = s.length,
      col = NEON[i % NEON.length]
    for (let k = 0; k < n; k++)
      text(
        g,
        s[k],
        x + w / 2,
        y + h * ((k + 0.6) / (n + 0.2)),
        Math.min(w * 0.72, (h / n) * 0.8),
        { color: i < 4 ? '#fff4c2' : col, glow: col }
      )
  } else if (kind === 'mural') mural(g, x, y, w, h, i)
  else if (kind === 'motel') {
    g.fillStyle = '#103a4a'
    g.fillRect(x, y, w, h)
    text(g, 'SUNSET LODGE', x + w / 2, y + h * 0.15, h * 0.1, {
      color: '#ffd23b',
      glow: '#ffd23b'
    })
    text(g, 'MOTEL', x + w / 2, y + h * 0.45, h * 0.3, {
      color: '#ff3b6b',
      glow: '#ff3b6b',
      font: SERIF
    })
    text(g, 'VACANCY', x + w / 2, y + h * 0.78, h * 0.13, {
      color: '#36e2ff',
      glow: '#36e2ff'
    })
    g.strokeStyle = '#ffd23b'
    g.lineWidth = 3
    g.strokeRect(x + 6, y + 6, w - 12, h - 12)
  } else if (kind === 'food') {
    const [s, bg, fg] = FOODS[i]
    g.fillStyle = bg
    g.fillRect(x, y, w, h)
    g.fillStyle = fg
    g.beginPath()
    g.ellipse(x + w / 2, y + h / 2, w * 0.46, h * 0.4, 0, 0, Math.PI * 2)
    g.fill()
    text(g, s, x + w / 2, y + h / 2, h * 0.26, {
      color: bg,
      maxW: w * 0.8,
      weight: '900'
    })
  } else if (kind === 'mall') {
    g.fillStyle = '#efe9dc'
    g.fillRect(x, y, w, h)
    text(
      g,
      i ? 'PICO PLAZA' : 'LA BREA CENTER',
      x + w / 2,
      y + h * 0.1,
      h * 0.07,
      { color: '#7a1712', maxW: w * 0.9 }
    )
    const shops = [
      'DONUTS',
      'NAILS',
      'THAI FOOD',
      'CLEANERS',
      'LIQUOR',
      'TACOS',
      'PHONES',
      'PHO'
    ]
    for (let k = 0; k < 5; k++) {
      const yy = y + h * (0.2 + k * 0.16)
      g.fillStyle = NEON[(k + i * 2) % NEON.length]
      g.fillRect(x + 6, yy, w - 12, h * 0.13)
      text(
        g,
        shops[(k + i * 3) % shops.length],
        x + w / 2,
        yy + h * 0.065,
        h * 0.075,
        { color: '#fff', maxW: w * 0.8 }
      )
    }
  } else if (kind === 'price') {
    const [s, bg, fg] = BRANDS[i]
    g.fillStyle = '#1a1a1a'
    g.fillRect(x, y, w, h)
    g.fillStyle = bg
    g.fillRect(x, y, w, h * 0.26)
    text(g, s, x + w / 2, y + h * 0.13, h * 0.12, { color: fg, maxW: w * 0.86 })
    const p = [4.89, 5.09, 5.29].map(v => v + i * 0.06)
    ;['REG', 'PLUS', 'PREM'].forEach((l, k) => {
      const yy = y + h * (0.4 + k * 0.2)
      text(g, l, x + w * 0.2, yy, h * 0.06, { color: '#ddd' })
      text(g, p[k].toFixed(2), x + w * 0.64, yy, h * 0.14, {
        color: '#ff4d2e',
        glow: '#ff4d2e',
        blur: 6
      })
    })
  } else if (kind === 'fascia') {
    const [s, bg, fg] = BRANDS[i]
    g.fillStyle = bg
    g.fillRect(x, y, w, h)
    g.fillStyle = fg
    g.fillRect(x, y + h - 6, w, 3)
    for (let k = 0; k < 3; k++)
      text(g, s, x + w * (0.17 + k * 0.33), y + h * 0.45, h * 0.62, {
        color: fg
      })
  } else if (kind === 'helipad') {
    // a pad's markings: a circle, its H, clear between (cut away)
    const cx = x + w / 2,
      cy = y + h / 2
    g.strokeStyle = '#f2c230'
    g.lineWidth = w * 0.05
    g.beginPath()
    g.arc(cx, cy, w * 0.42, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#f4f4f0'
    const s = w * 0.3
    g.fillRect(cx - s * 0.5, cy - s * 0.6, s * 0.2, s * 1.2)
    g.fillRect(cx + s * 0.3, cy - s * 0.6, s * 0.2, s * 1.2)
    g.fillRect(cx - s * 0.3, cy - s * 0.1, s * 0.6, s * 0.2)
  } else if (kind === 'pool') {
    g.fillStyle = '#e9e4da' // the coping
    g.fillRect(x, y, w, h)
    grad(g, x + 8, y + 8, w - 16, h - 16, ['#64d6e6', '#2aa6c4'])
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 1.5
    for (let k = 0; k < 10; k++) {
      g.beginPath()
      g.moveTo(x + 8 + R() * (w - 16), y + 8 + R() * (h - 16))
      g.quadraticCurveTo(
        x + R() * w,
        y + R() * h,
        x + 8 + R() * (w - 16),
        y + 8 + R() * (h - 16)
      )
      g.stroke()
    }
  } else if (kind === 'door') {
    // a front door in its surround: dark oak, painted red, blue or white, panels and a small light
    const col = ['#4a2f1f', '#9e2a2b', '#2c4a6e', '#e9e4da'][i]
    g.fillStyle = '#f2ede4'
    g.fillRect(x, y, w, h)
    g.fillStyle = col
    g.fillRect(x + 6, y + 10, w - 12, h - 10)
    g.strokeStyle = 'rgba(0,0,0,0.3)'
    g.lineWidth = 2
    for (const [px, py] of [
      [0.22, 0.2],
      [0.56, 0.2],
      [0.22, 0.58],
      [0.56, 0.58]
    ])
      g.strokeRect(x + w * px, y + h * py, w * 0.22, h * 0.3)
    g.fillStyle = '#c9a54a'
    g.fillRect(x + w * 0.72, y + h * 0.55, 3, 3)
    grad(g, x + 10, y + 2, w - 20, 6, ['#fff3d0', '#e0c27a'])
  } else if (kind === 'panel') {
    g.fillStyle = '#d8dadc'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#fffdf6'
    for (let r = 0; r < 4; r++)
      for (let q = 0; q < 2; q++)
        g.fillRect(x + 10 + q * 60, y + 8 + r * 30, 48, 14)
  } else if (kind === 'bulbs') {
    g.fillStyle = '#3a2a20'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#fff6c8'
    for (let r = 4; r < h; r += 8)
      for (let q = 4; q < w; q += 8) g.fillRect(x + q, y + r, 3, 3)
  } else if (kind === 'light') {
    g.fillStyle = '#fffaf0'
    g.fillRect(x, y, w, h)
  } else if (kind === 'green') {
    g.fillStyle = '#7dff8a'
    g.fillRect(x, y, w, h)
  }
  g.restore()
}

// The atlas texture, and where each cell is in it: CELLS.kind[i].uv
export const CELLS = pack()
export function signAtlas () {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
  g.clearRect(0, 0, W, H)
  for (const list of Object.values(CELLS)) for (const c of list) draw(g, c)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return t
}
export const SIGN_COUNTS = Object.fromEntries(
  Object.entries(SIZES).map(([k, l]) => [k, l.length])
)
