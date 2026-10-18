// The buildings' textures, drawn at startup: a facade per style (glass curtain wall, office ribbon
// windows, brick at its real size, stucco with balconies, pale stone or terracotta with tall windows
// between piers, a house's wall with its few windows), the storefronts' band, a flat roof's
// membrane, red clay tiles for hip roofs, and the glass of a tower's lit crown.
import { canvasTex, speckle } from './scene.js'
import { rng } from '../sim/city.js'

export const COL = 3 // m per window bay
export const FLOOR = 3.5 // m per storey
export const CELLS = 8 // bays and storeys in one texture tile
export const SHOP = 4.6 // height of the storefront band
const R = rng(77)

function lighten (g, x, y, w, h, top, bottom) {
  const gr = g.createLinearGradient(0, y, 0, y + h)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bottom)
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
}
// how far the glass sits back from the wall face (m): a curtain wall's panes are nearly flush, a
// brick wall's windows deep in their openings
export const INSET = {
  glass: 0.05,
  office: 0.14,
  brick: 0.24,
  stucco: 0.17,
  stone: 0.3,
  house: 0.16
}
// window rectangle inside a 64 px cell, per style
export const WIN = {
  glass: [2, 2, 60, 52],
  office: [6, 14, 52, 36],
  brick: [18, 12, 28, 38],
  stucco: [16, 14, 32, 34],
  stone: [21, 8, 22, 44],
  house: [19, 15, 26, 30]
}
export const STYLES = Object.keys(WIN)

function drawWall (g, style, S) {
  const c = S / CELLS,
    k = c / 64 // WIN is in a 64 px cell
  if (style === 'glass') {
    g.fillStyle = '#6f7f8c'
    g.fillRect(0, 0, S, S)
  } else if (style === 'brick') {
    // bricks at their real size, about 21 cm by 7.5 cm a course, mortar between, a few darker or
    // lighter than the rest
    g.fillStyle = '#a89a8c'
    g.fillRect(0, 0, S, S)
    const course = Math.max(2, Math.round((0.075 * c) / FLOOR)),
      len = Math.max(4, Math.round((0.215 * c) / COL))
    for (let y = 0, r = 0; y < S; y += course, r++)
      for (let x = (r % 2) * -(len >> 1); x < S; x += len) {
        const v = 0.8 + R() * 0.3 - (R() < 0.04 ? 0.18 : 0)
        g.fillStyle = `rgb(${(124 * v) | 0},${(66 * v) | 0},${(54 * v) | 0})`
        g.fillRect(x + 1, y + 1, len - 1, course - 1)
      }
    // soot and weathering: broad patches a shade darker
    for (let i = 0; i < 30; i++) {
      const x = R() * S,
        y = R() * S,
        rad = c * (0.3 + R() * 0.8)
      const gr = g.createRadialGradient(x, y, 0, x, y, rad)
      gr.addColorStop(0, 'rgba(40,24,18,0.12)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  } else if (style === 'stone') {
    // dressed stone or terracotta: fine grain, the courses' joints, piers between the windows
    g.fillStyle = '#e9e1d2'
    g.fillRect(0, 0, S, S)
    speckle(g, 20000, S, 0.1, false)
    speckle(g, 9000, S, 0.12, true)
    g.fillStyle = 'rgba(90,80,64,0.18)'
    for (let y = 0; y < S; y += c / 6) g.fillRect(0, y, S, Math.max(1, k))
  } else if (style === 'house') {
    // rough plaster, hand-trowelled
    g.fillStyle = '#f1ece2'
    g.fillRect(0, 0, S, S)
    speckle(g, 34000, S, 0.14, false)
    speckle(g, 16000, S, 0.12, true)
  } else {
    g.fillStyle = style === 'office' ? '#d8d3ca' : '#efebe4'
    g.fillRect(0, 0, S, S)
    speckle(g, 28000, S, 0.12, false)
    speckle(g, 12000, S, 0.1, true)
  }
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++) {
      const x = i * c,
        y = j * c,
        [wx, wy, ww, wh] = WIN[style].map(v => v * k)
      if (style === 'glass') {
        const v = 0.9 + R() * 0.2
        lighten(
          g,
          x + wx,
          y + wy,
          ww,
          wh,
          `rgb(${(226 * v) | 0},${(236 * v) | 0},${(244 * v) | 0})`,
          `rgb(${(150 * v) | 0},${(172 * v) | 0},${(190 * v) | 0})`
        )
        g.fillStyle = '#56636e' // spandrel at each floor slab
        g.fillRect(x, y + c - 10 * k, c, 10 * k)
        g.fillStyle = 'rgba(40,46,52,0.9)' // the mullions between panes
        g.fillRect(x, y, 2 * k, c)
        continue
      }
      if (style === 'office') {
        g.fillStyle = 'rgba(0,0,0,0.12)' // floor band
        g.fillRect(x, y + c - 8 * k, c, 8 * k)
      }
      if (style === 'brick') {
        g.fillStyle = '#d9cfc2' // stone lintel and sill
        g.fillRect(x + wx - 3 * k, y + wy - 5 * k, ww + 6 * k, 5 * k)
        g.fillRect(x + wx - 2 * k, y + wy + wh, ww + 4 * k, 4 * k)
        // a rain streak down from each sill
        const gr = g.createLinearGradient(0, y + wy + wh, 0, y + c)
        gr.addColorStop(0, 'rgba(50,34,28,0.18)')
        gr.addColorStop(1, 'rgba(50,34,28,0)')
        g.fillStyle = gr
        g.fillRect(x + wx, y + wy + wh + 4 * k, ww, c - wy - wh - 4 * k)
      }
      if (style === 'stone') {
        // a pier either side, standing proud and lit, and a sunk spandrel panel under the window
        g.fillStyle = 'rgba(255,255,255,0.28)'
        g.fillRect(x, y, 7 * k, c)
        g.fillStyle = 'rgba(70,60,48,0.16)'
        g.fillRect(x + 7 * k, y, 2 * k, c)
        g.fillStyle = 'rgba(96,82,64,0.3)'
        g.fillRect(x + wx, y + wy + wh + 2 * k, ww, c - wy - wh - 2 * k)
        g.fillStyle = 'rgba(255,248,236,0.5)'
        for (let t = 0; t < 3; t++)
          g.fillRect(
            x + wx + 3 * k,
            y + wy + wh + (4 + t * 3) * k,
            ww - 6 * k,
            k
          )
      }
      if (style === 'house') {
        // a painted surround and sill
        g.fillStyle = 'rgba(255,255,255,0.75)'
        g.fillRect(x + wx - 3 * k, y + wy - 3 * k, ww + 6 * k, wh + 7 * k)
      }
      lighten(g, x + wx, y + wy, ww, wh, '#5d6f80', '#2c3742')
      g.fillStyle = 'rgba(25,28,32,0.9)' // frame and mullion
      g.fillRect(x + wx + ww / 2 - k, y + wy, 2 * k, wh)
      if (style === 'house' || style === 'stone')
        g.fillRect(x + wx, y + wy + wh * 0.32, ww, 1.5 * k) // (and a transom)
      g.strokeStyle = 'rgba(25,28,32,0.8)'
      g.lineWidth = 2 * k
      g.strokeRect(x + wx, y + wy, ww, wh)
      if (style === 'stucco' && j % 2 === 0) {
        g.fillStyle = 'rgba(40,40,42,0.85)' // balcony railing
        g.fillRect(x + 10 * k, y + wy + wh + 4 * k, c - 20 * k, 2 * k)
        for (let b = x + 10 * k; b <= x + c - 10 * k; b += 4 * k)
          g.fillRect(b, y + wy + wh + 4 * k, k, 9 * k)
      }
    }
}
export const facadeMap = style =>
  canvasTex(1024, (g, S) => drawWall(g, style, S))

// storefronts: sign band, lit window, door and sometimes a striped awning (4 m per shop)
const AWNINGS = [
  '#b8332e',
  '#2e6b4f',
  '#1f4e8c',
  '#c98a1c',
  '#6d2f6b',
  '#2b2b2b',
  '#c45a2a'
]
function drawShops (g, lit, W, H) {
  const n = 6,
    w = W / n
  g.fillStyle = '#3b3631'
  g.fillRect(0, 0, W, H)
  lit.fillStyle = '#000'
  lit.fillRect(0, 0, W, H)
  for (let k = 0; k < n; k++) {
    const x = k * w,
      sign = AWNINGS[Math.floor(R() * AWNINGS.length)]
    g.fillStyle = sign
    g.fillRect(x + 6, 10, w - 12, 30)
    g.fillStyle = 'rgba(255,255,255,0.85)' // lettering, not words
    for (let t = x + 16; t < x + w - 20; t += 9 + R() * 6)
      g.fillRect(t, 19, 5 + R() * 4, 12)
    lit.fillStyle = 'rgba(255,240,220,0.55)'
    lit.fillRect(x + 14, 18, w - 28, 14)
    lighten(g, x + 8, 58, w - 16, H - 66, '#6b5a48', '#2a2420')
    g.fillStyle = '#1c1a18'
    g.fillRect(x + w * 0.62, 70, w * 0.22, H - 78) // door
    lighten(lit, x + 8, 58, w - 16, H - 66, '#ffcf8f', '#7a4a1c')
    if (R() < 0.6) {
      for (let s = 0; s < w - 8; s += 12) {
        g.fillStyle = (s / 12) % 2 ? '#e8e2d6' : sign
        g.fillRect(x + 4 + s, 44, 12, 12)
      }
      lit.fillStyle = '#000'
      lit.fillRect(x + 4, 44, w - 8, 12)
    }
    g.fillStyle = '#25211d' // pier between shops
    g.fillRect(x, 0, 5, H)
  }
}
export function shopMaps () {
  let litCtx = null
  const lit = canvasTex(
    1024,
    g => {
      litCtx = g
    },
    1,
    192
  )
  const map = canvasTex(1024, g => drawShops(g, litCtx, 1024, 192), 1, 192)
  lit.needsUpdate = true
  return { map, lit }
}
// a flat roof's membrane (4 m a tile): laid in metre-wide strips lapped at the seams, with the
// stains where rain stood in puddles
export function roofTex () {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#8a8780'
    g.fillRect(0, 0, S, S)
    speckle(g, 9000, S, 0.26, false)
    speckle(g, 4000, S, 0.15, true)
    for (let i = 0; i < 7; i++) {
      const x = R() * S,
        y = R() * S,
        r = 14 + R() * 40
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(40,38,34,0.16)')
      gr.addColorStop(0.8, 'rgba(40,38,34,0.1)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    for (let y = 0; y < S; y += S / 4) {
      g.fillStyle = 'rgba(30,29,26,0.32)'
      g.fillRect(0, y, S, 2)
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(0, y + 2, S, 3)
    }
  })
}
// Clay tiles, 2 m a tile (u along the eaves, v up the slope): courses of half-round tiles, each lit
// on its crown and shaded in its trough, a few darker or paler than the rest. Drawn near white, so
// the roof's own colour (vertex colour) makes them terracotta, or a bungalow's grey shingle.
export function tileTex () {
  const t = canvasTex(256, (g, S) => {
    g.fillStyle = '#d8d2cc'
    g.fillRect(0, 0, S, S)
    const across = 8, // tiles across a 2 m tile: 25 cm each
      up = 6 // courses up it
    const w = S / across,
      h = S / up
    for (let r = 0; r < up; r++)
      for (let i = 0; i < across; i++) {
        const x = i * w + (r % 2) * (w / 2),
          y = r * h,
          v = 0.86 + R() * 0.22
        const gr = g.createLinearGradient(x, 0, x + w, 0)
        gr.addColorStop(
          0,
          `rgba(${(120 * v) | 0},${(110 * v) | 0},${(104 * v) | 0},1)`
        )
        gr.addColorStop(
          0.45,
          `rgba(${(255 * v) | 0},${(250 * v) | 0},${(244 * v) | 0},1)`
        )
        gr.addColorStop(
          1,
          `rgba(${(110 * v) | 0},${(100 * v) | 0},${(94 * v) | 0},1)`
        )
        g.fillStyle = gr
        g.fillRect(x, y, w - 1, h)
        g.fillRect(x - S, y, w - 1, h) // (wrapping round)
        g.fillStyle = 'rgba(40,30,26,0.35)' // the course's shadow on the one below
        g.fillRect(x, y + h - 3, w - 1, 3)
      }
    speckle(g, 5000, S, 0.18, false)
  })
  t.repeat.set(0.5, 0.5)
  return t
}
// a lit crown's glass: tall panes between slim mullions, brighter towards their tops
export function crownTex () {
  return canvasTex(256, (g, S) => {
    const gr = g.createLinearGradient(0, 0, 0, S)
    gr.addColorStop(0, '#fffaf0')
    gr.addColorStop(1, '#9fb1c0')
    g.fillStyle = gr
    g.fillRect(0, 0, S, S)
    g.fillStyle = 'rgba(30,36,44,0.85)'
    for (let x = 0; x < S; x += S / 8) g.fillRect(x, 0, 3, S)
    g.fillRect(0, S / 2, S, 3)
  })
}
