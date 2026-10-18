// The shops' signs, drawn into one atlas at startup: a name board for each kind of shop (cafés and
// restaurants, clothes shops, convenience stores and pharmacies, salons and barbers, bars), and the
// things stuck in the windows (a FOR LEASE board, an OPEN sign in neon, a bar's cocktail glass in
// neon). Every name is made up. The colour is in the texture's red, green and blue and how much
// each texel glows at night in its alpha: a lightbox's whole face, a sign's lit letters, a neon
// tube; a painted board only faintly, as the light from under the canopy catches it. The texture is
// built from the canvas's pixels by hand (a canvas keeps its colours premultiplied by their alpha,
// which would lose the colour of everything that doesn't glow).
import * as THREE from 'three'
import { renderer } from './scene.js'
import { SANS, SERIF, text } from './signArt.js'

// the kinds of shop, in the order the shader knows them (shopShader.js)
export const KINDS = ['cafe', 'clothes', 'store', 'salon', 'bar', 'empty']
export const W = 1024
export const H = 1280
// a name board's cell, and how many there are across the atlas; the window signs' cells, in a row
// under the boards
export const BOARD = [512, 80]
export const DECAL = [256, 160]
export const DECAL_Y = 1120

// Each kind's names: [name, board, letters, font, how it is lit]: 'paint', a painted board;
// 'box', a lightbox (its whole face glows); 'letters', lit letters on a dark board; 'neon'
const NAMES = {
  cafe: [
    ['LUNA CAFE', '#1f3b2d', '#f3e6c4', SERIF, 'letters'],
    ['DAILY GRIND', '#2b1d16', '#f2c46d', SANS, 'letters'],
    ['PICO DELI', '#b8332e', '#ffffff', SANS, 'paint'],
    ['TAQUERIA', '#e2a72e', '#5b1a12', SANS, 'paint'],
    ['NOODLE HOUSE', '#8e1b1b', '#ffd75e', SANS, 'letters'],
    ['PIZZA', '#f4efe2', '#b8332e', SERIF, 'box'],
    ['SUSHI', '#121212', '#f5f5f5', SANS, 'letters'],
    ['BAKERY', '#f2d5c4', '#6b3a2a', SERIF, 'paint']
  ],
  clothes: [
    ['BOUTIQUE', '#111111', '#f0e6d2', SERIF, 'letters'],
    ['VINTAGE', '#d9c9a8', '#3a2a1e', SERIF, 'paint'],
    ['DENIM CO', '#1f3550', '#f4f4f4', SANS, 'letters'],
    ['SURF SHOP', '#2a9fb5', '#ffffff', SANS, 'paint'],
    ['SHOES', '#f6f2ea', '#1b1b1b', SANS, 'box'],
    ['THREADS', '#5a2b4f', '#f6d6e8', SERIF, 'letters']
  ],
  store: [
    ['MINI MARKET', '#f7f3e8', '#c8102e', SANS, 'box'],
    ['LIQUOR', '#151515', '#ff3b3b', SANS, 'neon'],
    ['PHARMACY', '#ffffff', '#1a7a3c', SANS, 'box'],
    ['24 HR MART', '#ffd23b', '#1b3a8c', SANS, 'box'],
    ['DRUGS', '#f4f4f4', '#d1202f', SANS, 'box']
  ],
  salon: [
    ['HAIR SALON', '#f6dfe6', '#7a2a4a', SERIF, 'paint'],
    ['NAILS', '#2a1a2e', '#ff7ac8', SANS, 'neon'],
    ['BARBER', '#1c2a44', '#f2f2f2', SERIF, 'letters'],
    ['BEAUTY', '#ffffff', '#c03c7a', SERIF, 'box']
  ],
  bar: [
    ['COCKTAILS', '#120d14', '#ff4fa0', SERIF, 'neon'],
    ['TAVERN', '#2a1810', '#f2c46d', SERIF, 'letters'],
    ['LOUNGE', '#0d1424', '#36e2ff', SANS, 'neon'],
    ['THE BLUE ROOM', '#101828', '#5da8ff', SERIF, 'neon']
  ]
}
// every board in atlas order: { kind, name, board, letters, font, lit }; and, by kind, the boards'
// indices in it
export const BOARDS = []
export const BY_KIND = KINDS.map(k =>
  (NAMES[k] || []).map(([name, board, letters, font, lit]) => {
    BOARDS.push({ kind: k, name, board, letters, font, lit })
    return BOARDS.length - 1
  })
)
// the window signs: a FOR LEASE board, OPEN in neon, a cocktail glass in neon, OPEN 24 HRS
export const DECALS = { lease: 0, open: 1, glass: 2, allNight: 3 }

// a board: the name across it, its glow (how much each part lights up at night) into the mask
function board (g, m, b, x, y) {
  const [w, h] = BOARD
  const glow = { paint: [0.1, 0.22], box: [0.75, 0.55], letters: [0, 1] }[
    b.lit
  ] || [0, 1]
  g.fillStyle = b.board
  g.fillRect(x, y, w, h)
  m.fillStyle = grey(glow[0])
  m.fillRect(x, y, w, h)
  // a thin edge round the board, darker, and a lighter line under its top
  g.strokeStyle = 'rgba(0,0,0,0.35)'
  g.lineWidth = 4
  g.strokeRect(x + 2, y + 2, w - 4, h - 4)
  const px = b.name.length > 10 ? h * 0.5 : h * 0.6
  const o = { color: b.letters, maxW: w * 0.86, font: b.font }
  if (b.lit === 'neon') o.weight = 'normal'
  text(g, b.name, x + w / 2, y + h * 0.54, px, o)
  text(m, b.name, x + w / 2, y + h * 0.54, px, { ...o, color: grey(glow[1]) })
}
const grey = v => {
  const c = Math.round(v * 255)
  return `rgb(${c},${c},${c})`
}

// the window signs
function decal (g, m, i, x, y) {
  const [w, h] = DECAL
  if (i === DECALS.lease) {
    // a white board with a red border: FOR LEASE, and a telephone number
    g.fillStyle = '#f4f2ec'
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#c8102e'
    g.lineWidth = 8
    g.strokeRect(x + 6, y + 6, w - 12, h - 12)
    text(g, 'FOR', x + w / 2, y + h * 0.24, h * 0.16, { color: '#c8102e' })
    text(g, 'LEASE', x + w / 2, y + h * 0.5, h * 0.3, { color: '#c8102e' })
    text(g, '310 555 0144', x + w / 2, y + h * 0.78, h * 0.13, {
      color: '#1b1b1b'
    })
    m.fillStyle = '#000'
    m.fillRect(x, y, w, h)
    return
  }
  // neon: the tubes in their colour, glowing; dark round them (the shader adds only the glow)
  g.fillStyle = '#000'
  g.fillRect(x, y, w, h)
  m.fillStyle = '#000'
  m.fillRect(x, y, w, h)
  const tube = (ctx, col, draw) => {
    ctx.save()
    ctx.strokeStyle = col
    ctx.lineWidth = 6
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.beginPath()
    draw(ctx)
    ctx.stroke()
    ctx.restore()
  }
  const both = (col, draw) => {
    tube(g, col, draw)
    tube(m, '#fff', draw)
  }
  const word = (s, cy, px, col) => {
    text(g, s, x + w / 2, y + cy, px, { color: col, weight: 'normal' })
    text(m, s, x + w / 2, y + cy, px, { color: '#fff', weight: 'normal' })
  }
  if (i === DECALS.open || i === DECALS.allNight) {
    both('#3aa0ff', c => roundRect(c, x + 14, y + 26, w - 28, h - 52, 22))
    word('OPEN', h * (i === DECALS.open ? 0.5 : 0.42), h * 0.3, '#ff3040')
    if (i === DECALS.allNight) word('24 HRS', h * 0.68, h * 0.14, '#ffd23b')
  } else {
    // a cocktail glass, an olive in it, and BAR under it
    both('#ff4fa0', c => {
      c.moveTo(x + w * 0.3, y + h * 0.12)
      c.lineTo(x + w * 0.7, y + h * 0.12)
      c.lineTo(x + w * 0.5, y + h * 0.45)
      c.closePath()
      c.moveTo(x + w * 0.5, y + h * 0.45)
      c.lineTo(x + w * 0.5, y + h * 0.66)
      c.moveTo(x + w * 0.4, y + h * 0.68)
      c.lineTo(x + w * 0.6, y + h * 0.68)
    })
    both('#7dff6a', c => c.arc(x + w * 0.56, y + h * 0.2, 8, 0, Math.PI * 2))
    word('BAR', h * 0.85, h * 0.18, '#36e2ff')
  }
}
function roundRect (c, x, y, w, h, r) {
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// where board k's cell starts in the atlas (px)
export const boardAt = k => [(k % 2) * BOARD[0], Math.floor(k / 2) * BOARD[1]]

export function shopSigns () {
  const canvas = () => {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    return cv.getContext('2d', { willReadFrequently: true })
  }
  const g = canvas(),
    m = canvas()
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  m.fillStyle = '#000'
  m.fillRect(0, 0, W, H)
  BOARDS.forEach((b, k) => board(g, m, b, ...boardAt(k)))
  for (let i = 0; i < 4; i++) decal(g, m, i, i * DECAL[0], DECAL_Y)
  // (the colour from one canvas, the glow from the other into its alpha)
  const c = g.getImageData(0, 0, W, H).data,
    a = m.getImageData(0, 0, W, H).data
  for (let i = 0; i < c.length; i += 4) c[i + 3] = a[i]
  const t = new THREE.DataTexture(c, W, H, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  t.needsUpdate = true
  return t
}
