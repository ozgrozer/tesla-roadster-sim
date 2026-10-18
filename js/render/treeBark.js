// The palms' and trees' bark, drawn once at start-up, each tiled once round its trunk and on up
// it: the Mexican fan palm's grey-brown, ringed every few centimetres with the scars of old leaves;
// the Canary Island date palm's diamonds of old leaf bases cut off close; the street trees'
// fissured bark (each kind of tree tints it its own way: treeShapes.js KINDS).
import { canvasTex, speckle } from './scene.js'
import { rng } from '../sim/city.js'
import { TAU } from '../sim/constants.js'

// fn(x, y) draws something at (x, y), reaching r round it, in a W x H tile: and again a tile over
// wherever it crosses an edge, so the tile repeats without a seam
function wrap (W, H, x, y, r, fn) {
  for (const ox of [-W, 0, W])
    for (const oy of [-H, 0, H])
      if (x + ox + r > 0 && x + ox - r < W && y + oy + r > 0 && y + oy - r < H)
        fn(x + ox, y + oy)
}
// a soft patch of lighter or darker weathering
function patch (g, W, H, R, light, alpha) {
  const r = 10 + R() * 40,
    col = light ? `rgba(220,214,204,${alpha})` : `rgba(40,34,28,${alpha})`
  wrap(W, H, R() * W, R() * H, r, (x, y) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, col)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, 2 * r, 2 * r)
  })
}
// A Mexican fan palm's trunk, 2.5 m of it: grey-brown, ringed every few centimetres by the scars
// of old leaves (a dark groove under a pale lip, never quite level), fine cracks up it between.
export function fanBark () {
  const R = rng(515)
  return canvasTex(
    128,
    (g, W, H) => {
      g.fillStyle = '#716a62'
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 40; i++) patch(g, W, H, R, i % 2 === 0, 0.14)
      for (let y = 0; y < H; y += 5 + 9 * R()) {
        const amp = 0.8 + 1.8 * R(),
          ph = R() * TAU,
          k = 1 + Math.floor(R() * 2),
          dark = 0.3 + 0.4 * R(),
          lines = [
            [`rgba(204,196,182,${dark * 0.6})`, -1.6, 1.2],
            [`rgba(52,46,40,${dark})`, 0, 1.1 + R()]
          ]
        for (const oy of [-H, 0, H])
          for (const [col, dy, lw] of lines) {
            g.strokeStyle = col
            g.lineWidth = lw
            g.beginPath()
            for (let x = 0; x <= W; x += 4)
              g.lineTo(x, y + oy + dy + amp * Math.sin((TAU * k * x) / W + ph))
            g.stroke()
          }
      }
      g.strokeStyle = 'rgba(48,42,36,0.3)'
      g.lineWidth = 1
      for (let i = 0; i < 90; i++) {
        const x = R() * W,
          y = R() * H,
          l = 8 + 26 * R()
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (R() - 0.5) * 3, y + l)
        g.stroke()
      }
      speckle(g, 20000, H, 0.16, false)
      speckle(g, 8000, H, 0.1, true)
    },
    1,
    512
  )
}
// A Canary Island date palm's trunk, 2 m of it: the diamonds of old leaf bases cut off close, in
// staggered rows, each raised (lit along its top, shaded under) round the dark scar of its cut.
export function dateBark () {
  const R = rng(616)
  return canvasTex(256, (g, W, H) => {
    g.fillStyle = '#4e3f32'
    g.fillRect(0, 0, W, H)
    const cols = 16,
      rows = 16,
      cw = W / cols,
      rh = H / rows
    g.strokeStyle = 'rgba(38,28,20,0.85)'
    g.lineWidth = 2
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const base = 104 + 44 * R(),
          top = `rgb(${base + 40},${base + 22},${base})`,
          foot = `rgb(${base - 40},${base - 52},${base - 62})`,
          x0 = (c + (r % 2) * 0.5 + 0.5) * cw
        wrap(W, H, x0, (r + 0.5) * rh, rh, (x, y) => {
          const gr = g.createLinearGradient(x, y - rh, x, y + rh)
          gr.addColorStop(0, top)
          gr.addColorStop(1, foot)
          g.fillStyle = gr
          g.beginPath()
          g.moveTo(x, y - rh * 0.92)
          g.lineTo(x + cw * 0.46, y)
          g.lineTo(x, y + rh * 0.92)
          g.lineTo(x - cw * 0.46, y)
          g.fill()
          g.beginPath()
          g.moveTo(x - cw * 0.3, y + 1)
          g.quadraticCurveTo(x, y + 3, x + cw * 0.3, y + 1)
          g.stroke()
        })
      }
    speckle(g, 30000, W, 0.18, false)
  })
}
// A street tree's bark, 1.5 m of it: grey-brown, with long fissures wandering up it and lighter
// patches between.
export function treeBark () {
  const R = rng(717)
  return canvasTex(
    128,
    (g, W, H) => {
      g.fillStyle = '#8a8076'
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 30; i++) patch(g, W, H, R, i % 3 === 0, 0.22)
      g.strokeStyle = 'rgba(44,36,30,0.55)'
      for (let i = 0; i < 26; i++) {
        // (a fissure wanders up the tile and comes back where it started, so it tiles)
        const x = R() * W,
          ph = R() * TAU,
          k = 1 + Math.floor(R() * 3)
        g.lineWidth = 1 + 2.2 * R()
        for (const ox of [-W, 0, W]) {
          g.beginPath()
          for (let y = 0; y <= H; y += 8)
            g.lineTo(x + ox + 4 * Math.sin((TAU * k * y) / H + ph), y)
          g.stroke()
        }
      }
      speckle(g, 12000, H, 0.18, false)
    },
    1,
    256
  )
}
