// The places of pois.js on the maps: a small rounded square in the place's colour with its glyph (a
// pump, P, a cross, a star, a bag, a door), so they read apart from the missions' round blips. On the
// radar only those in view and smaller (no rim: it would crowd it); on the pause map all of them.
import { pois, POI_KINDS } from '../sim/poi.js'

const GLYPH = {
  gas (g, k) {
    g.rect(-2.2 * k, -2.6 * k, 3.2 * k, 5.2 * k)
    g.moveTo(1 * k, -1.2 * k)
    g.lineTo(2.6 * k, 0)
    g.lineTo(2.6 * k, 2 * k)
  },
  garage (g, k) {
    g.moveTo(-1.6 * k, 2.8 * k)
    g.lineTo(-1.6 * k, -2.8 * k)
    g.lineTo(0.8 * k, -2.8 * k)
    g.arc(0.8 * k, -1.2 * k, 1.6 * k, -Math.PI / 2, Math.PI / 2)
    g.lineTo(-1.6 * k, 0.4 * k)
  },
  hospital (g, k) {
    g.moveTo(0, -2.8 * k)
    g.lineTo(0, 2.8 * k)
    g.moveTo(-2.8 * k, 0)
    g.lineTo(2.8 * k, 0)
  },
  police (g, k) {
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5
      const x = Math.cos(a) * 3 * k,
        y = Math.sin(a) * 3 * k
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    }
  },
  shop (g, k) {
    g.rect(-2.4 * k, -1 * k, 4.8 * k, 3.6 * k)
    g.moveTo(-1.2 * k, -1 * k)
    g.arc(0, -1 * k, 1.2 * k, Math.PI, 0)
  },
  interior (g, k) {
    g.rect(-1.8 * k, -2.8 * k, 3.6 * k, 5.6 * k)
    g.moveTo(0.8 * k, 0.2 * k)
    g.lineTo(0.8 * k, 0.6 * k)
  }
}

function mark (g, x, y, k, kind) {
  const c = POI_KINDS[kind]?.color || '#ccc',
    r = 5.2 * k
  g.save()
  g.translate(x, y)
  g.beginPath()
  g.roundRect ? g.roundRect(-r, -r, 2 * r, 2 * r, 1.6 * k) : g.rect(-r, -r, 2 * r, 2 * r)
  g.fillStyle = c
  g.fill()
  g.lineWidth = 1.3 * k
  g.strokeStyle = 'rgba(10, 12, 18, 0.9)'
  g.stroke()
  g.beginPath()
  GLYPH[kind]?.(g, k)
  g.lineWidth = 1.2 * k
  g.strokeStyle = '#101216'
  g.stroke()
  g.restore()
}

// at(x, z): where a place goes (null: off the map); k the marks' scale
export function drawPois (g, at, k) {
  for (const p of pois()) {
    const s = at(p.x, p.z)
    if (s) mark(g, s.x, s.y, k, p.kind)
  }
}
// the legend's swatch for a kind (an SVG of 16 x 16)
export function poiIcon (kind) {
  const c = POI_KINDS[kind]?.color || '#ccc'
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="${c}" stroke="#0a0c12" stroke-width="1.3"/></svg>`
}
