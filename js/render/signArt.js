// The artwork for the signs' atlas (signTex.js): drawing helpers (lettering that fits its space,
// gradients, a border of bulbs, a palm's silhouette), the billboards' eight designs, the made-up
// names (hotels, films, blade signs, fast food, gas brands) and the murals. Every name and brand is
// made up.
import { rng } from '../sim/city.js'

const R = rng(31)
export const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif'
export const SERIF = 'Georgia, "Times New Roman", serif'

// ---------- drawing helpers ----------
export function text (g, s, x, y, px, o = {}) {
  g.save()
  g.font = `${o.weight || 'bold'} ${px}px ${o.font || SANS}`
  g.textAlign = o.align || 'center'
  g.textBaseline = 'middle'
  if (o.glow) {
    g.shadowColor = o.glow
    g.shadowBlur = o.blur ?? px * 0.35
  }
  const w = g.measureText(s).width
  const sx = o.maxW && w > o.maxW ? o.maxW / w : 1
  g.translate(x, y)
  g.scale(sx * (o.sx || 1), 1)
  if (o.stroke) {
    g.lineWidth = o.lw || px * 0.12
    g.strokeStyle = o.stroke
    g.strokeText(s, 0, 0)
  }
  g.fillStyle = o.color || '#fff'
  g.fillText(s, 0, 0)
  g.restore()
}
export const grad = (g, x, y, w, h, stops, horiz = false) => {
  const gr = horiz
    ? g.createLinearGradient(x, 0, x + w, 0)
    : g.createLinearGradient(0, y, 0, y + h)
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c))
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
}
export function bulbs (g, x, y, w, h, gap, color = '#fff6c8') {
  g.save()
  g.fillStyle = color
  g.shadowColor = '#ffd27a'
  g.shadowBlur = gap * 0.6
  for (let t = x + gap / 2; t < x + w; t += gap) {
    g.fillRect(t - 1.5, y + 1, 3, 3)
    g.fillRect(t - 1.5, y + h - 4, 3, 3)
  }
  for (let t = y + gap / 2; t < y + h; t += gap) {
    g.fillRect(x + 1, t - 1.5, 3, 3)
    g.fillRect(x + w - 4, t - 1.5, 3, 3)
  }
  g.restore()
}
function palmSil (g, x, y, h, color) {
  g.save()
  g.strokeStyle = g.fillStyle = color
  g.lineWidth = Math.max(2, h * 0.03)
  g.beginPath()
  g.moveTo(x, y)
  g.quadraticCurveTo(x + h * 0.08, y - h * 0.5, x + h * 0.04, y - h)
  g.stroke()
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.45
    g.beginPath()
    g.moveTo(x + h * 0.04, y - h)
    g.quadraticCurveTo(
      x + h * 0.04 + Math.cos(a) * h * 0.22,
      y - h + Math.sin(a) * h * 0.12 - h * 0.05,
      x + h * 0.04 + Math.cos(a) * h * 0.3,
      y - h + h * 0.12
    )
    g.stroke()
  }
  g.restore()
}

// ---------- the cells ----------
export const BILLBOARDS = [
  // a film: night sky, a moon, the title and when
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#0b1030', '#2b1a4a', '#a3402f'])
    g.fillStyle = '#f6e7c1'
    g.beginPath()
    g.arc(x + w * 0.78, y + h * 0.36, h * 0.22, 0, Math.PI * 2)
    g.fill()
    text(g, 'STARFALL', x + w * 0.38, y + h * 0.42, h * 0.32, {
      color: '#f4d58d',
      maxW: w * 0.62,
      font: SERIF
    })
    text(g, 'IN THEATERS FRIDAY', x + w * 0.38, y + h * 0.78, h * 0.11, {
      color: '#fff'
    })
  },
  // a fizzy drink: red, a white wave
  (g, x, y, w, h) => {
    g.fillStyle = '#c8102e'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#fff'
    g.beginPath()
    g.moveTo(x, y + h * 0.7)
    g.bezierCurveTo(
      x + w * 0.3,
      y + h * 0.4,
      x + w * 0.6,
      y + h * 1.0,
      x + w,
      y + h * 0.6
    )
    g.lineTo(x + w, y + h * 0.75)
    g.bezierCurveTo(
      x + w * 0.6,
      y + h * 1.1,
      x + w * 0.3,
      y + h * 0.55,
      x,
      y + h * 0.85
    )
    g.fill()
    text(g, 'STAY COOL', x + w * 0.42, y + h * 0.36, h * 0.34, {
      color: '#fff',
      font: SERIF,
      weight: 'bold italic'
    })
  },
  // a phone
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#f4f4f2', '#d9dde2'])
    g.fillStyle = '#16181c'
    g.fillRect(x + w * 0.72, y + h * 0.1, h * 0.42, h * 0.8)
    g.fillStyle = '#4c7bd9'
    g.fillRect(x + w * 0.72 + 5, y + h * 0.1 + 7, h * 0.42 - 10, h * 0.8 - 14)
    text(g, 'Thinner. Faster.', x + w * 0.36, y + h * 0.42, h * 0.2, {
      color: '#16181c',
      weight: '600'
    })
    text(g, 'PHONE 9', x + w * 0.36, y + h * 0.7, h * 0.13, { color: '#555' })
  },
  // an injury lawyer, as on every LA bus bench
  (g, x, y, w, h) => {
    g.fillStyle = '#f7d117'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#1b1b1b'
    g.fillRect(x, y + h * 0.72, w, h * 0.28)
    text(g, 'HURT IN A CRASH?', x + w * 0.5, y + h * 0.3, h * 0.26, {
      color: '#1b1b1b',
      maxW: w * 0.92
    })
    text(g, 'CALL 1-800-555-0199', x + w * 0.5, y + h * 0.86, h * 0.16, {
      color: '#f7d117',
      maxW: w * 0.9
    })
  },
  // tequila: dark blue and gold
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#0c2340', '#14365e'], true)
    g.fillStyle = '#c99b3b'
    g.fillRect(x + w * 0.75, y + h * 0.15, h * 0.2, h * 0.75)
    g.fillRect(x + w * 0.75 - 4, y + h * 0.35, h * 0.2 + 8, h * 0.55)
    text(g, 'AÑEJO DE ORO', x + w * 0.38, y + h * 0.45, h * 0.24, {
      color: '#e2b65a',
      font: SERIF,
      maxW: w * 0.66
    })
    text(g, 'SIP RESPONSIBLY', x + w * 0.38, y + h * 0.78, h * 0.09, {
      color: '#9fb2c8'
    })
  },
  // an electric car
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#e9f1f6', '#9fc3d9'])
    g.fillStyle = '#20252b'
    g.beginPath()
    g.moveTo(x + w * 0.5, y + h * 0.78)
    g.lineTo(x + w * 0.56, y + h * 0.56)
    g.quadraticCurveTo(x + w * 0.7, y + h * 0.42, x + w * 0.86, y + h * 0.56)
    g.lineTo(x + w * 0.95, y + h * 0.62)
    g.lineTo(x + w * 0.95, y + h * 0.78)
    g.fill()
    text(g, 'GO ELECTRIC', x + w * 0.27, y + h * 0.42, h * 0.22, {
      color: '#16303f',
      maxW: w * 0.48
    })
    text(g, 'zero tailpipe', x + w * 0.27, y + h * 0.72, h * 0.12, {
      color: '#2f5970',
      weight: 'normal'
    })
  },
  // a radio station
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#ff5f6d', '#ffc371'], true)
    text(g, 'KLAX', x + w * 0.3, y + h * 0.5, h * 0.52, {
      color: '#fff',
      weight: '900'
    })
    text(g, '97.1 FM', x + w * 0.72, y + h * 0.4, h * 0.22, {
      color: '#2a1033'
    })
    text(g, 'THE BEACH', x + w * 0.72, y + h * 0.7, h * 0.14, {
      color: '#2a1033'
    })
  },
  // a television series
  (g, x, y, w, h) => {
    grad(g, x, y, w, h, ['#3a0d5c', '#c2185b'], true)
    g.fillStyle = 'rgba(255,255,255,0.18)'
    for (let i = 0; i < 6; i++) g.fillRect(x + w * (0.55 + i * 0.07), y, 6, h)
    text(g, 'SILVER LAKE', x + w * 0.36, y + h * 0.42, h * 0.26, {
      color: '#fff',
      maxW: w * 0.62
    })
    text(g, 'SEASON 4 · NOW STREAMING', x + w * 0.36, y + h * 0.75, h * 0.1, {
      color: '#ffd6e8',
      maxW: w * 0.64
    })
  }
]
export const HOTELS = [
  'HOTEL ALEXANDER',
  'THE PALISADE',
  'HOTEL BELMONT',
  'OCEAN VIEW',
  'HOTEL SAN MARCO',
  'MIRADOR'
]
export const FILMS = ['STARFALL', 'MIDNIGHT RUN', 'SILVER CITY', 'DESERT ROSE']
export const BLADES = [
  'PALACE',
  'REGENT',
  'VOGUE',
  'RIALTO',
  'BAR',
  'HOTEL',
  'CAFE',
  'LIQUOR',
  'DINER',
  'PAWN'
]
export const NEON = [
  '#ff3b6b',
  '#36e2ff',
  '#ffd23b',
  '#7dff6a',
  '#ff7a2f',
  '#c86bff'
]
export const FOODS = [
  ['BURGERS', '#d62828', '#fcbf49'],
  ['TACOS', '#2a9d8f', '#f4a261'],
  ['CHICKEN', '#f77f00', '#fff3b0'],
  ['DONUTS', '#e56b9f', '#fff']
]
export const BRANDS = [
  ['PACIFIC', '#0b4ea2', '#ffffff'],
  ['GLOBE', '#d1202f', '#ffffff'],
  ['SUN OIL', '#f2b705', '#c8102e'],
  ['XPRESS', '#138a52', '#ffffff']
]
export function mural (g, x, y, w, h, k) {
  if (k === 0) {
    // a sunset over the sea, palms against it
    grad(g, x, y, w, h * 0.7, ['#ff7e5f', '#feb47b', '#ffd38a'])
    g.fillStyle = '#ffe9a8'
    g.beginPath()
    g.arc(x + w * 0.5, y + h * 0.66, h * 0.2, Math.PI, 0)
    g.fill()
    grad(g, x, y + h * 0.66, w, h * 0.34, ['#1d6fa3', '#0b3a5c'])
    palmSil(g, x + w * 0.18, y + h * 0.95, h * 0.8, '#2b1b2e')
    palmSil(g, x + w * 0.82, y + h * 0.95, h * 0.65, '#2b1b2e')
  } else if (k === 1) {
    // shapes, bright on white
    g.fillStyle = '#fbf6ec'
    g.fillRect(x, y, w, h)
    for (let i = 0; i < 14; i++) {
      g.fillStyle = NEON[i % NEON.length]
      g.beginPath()
      g.arc(x + R() * w, y + R() * h, 8 + R() * h * 0.25, 0, Math.PI * 2)
      g.fill()
    }
  } else if (k === 2) {
    // waves
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f'][i % 4]
      g.fillRect(x, y + (h * i) / 8, w, h / 8 + 1)
    }
    text(g, 'VENICE', x + w / 2, y + h * 0.5, h * 0.42, {
      color: '#fff',
      stroke: '#0b3954',
      weight: '900',
      maxW: w * 0.9
    })
  } else if (k === 3) {
    // a face in profile, in blocks of colour
    grad(g, x, y, w, h, ['#ffcf56', '#ff6f59'], true)
    g.fillStyle = '#2d1e2f'
    g.beginPath()
    g.ellipse(x + w * 0.45, y + h * 0.55, h * 0.32, h * 0.42, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#43aa8b'
    g.fillRect(x + w * 0.62, y, w * 0.2, h)
  } else if (k === 4) {
    // a rainbow in stripes
    const c = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#6a4c93']
    c.forEach((s, i) => {
      g.fillStyle = s
      g.fillRect(x + (w * i) / c.length, y, w / c.length + 1, h)
    })
  } else {
    // the city's name in big letters, a postcard
    grad(g, x, y, w, h, ['#4cc9f0', '#f72585'], true)
    text(g, 'LOS ANGELES', x + w / 2, y + h * 0.52, h * 0.34, {
      color: '#ffe066',
      stroke: '#2b2d42',
      weight: '900',
      maxW: w * 0.92
    })
  }
}
