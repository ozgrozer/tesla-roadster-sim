// The marks the radar (minimap.js) and the pause menu's map (mapDraw.js) share: GTA's round blips
// with a glyph for each place (the gridlock, the pier, the sign, the observatory, the waypoint), the
// Roadster's arrow, and the colours of the waypoint and the GPS route to it (GTA's purple).
const TAU = Math.PI * 2

export const COLOR = {
  jam: '#f0c24b',
  waypoint: '#c460f2',
  route: '#b24ff0', // the GPS line, over a darker edge
  routeEdge: 'rgba(36, 6, 54, 0.8)'
}
// a blip's glyph, drawn round (0, 0) at scale k
export const GLYPHS = {
  // the gridlock: a jump
  jam (g, k) {
    g.moveTo(-3 * k, 1.8 * k)
    g.lineTo(0, -1.6 * k)
    g.lineTo(3 * k, 1.8 * k)
  },
  // the pier: its big wheel
  pier (g, k) {
    const r = 3.3 * k
    g.moveTo(r, 0)
    g.arc(0, 0, r, 0, TAU)
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r)
    }
  },
  // the sign on the hills: the peaks it stands on
  sign (g, k) {
    g.moveTo(-4 * k, 2.6 * k)
    g.lineTo(-1.2 * k, -2 * k)
    g.lineTo(0.6 * k, 0.6 * k)
    g.lineTo(1.9 * k, -0.9 * k)
    g.lineTo(4 * k, 2.6 * k)
  },
  // the observatory: its dome on the hall
  observatory (g, k) {
    g.moveTo(-3.6 * k, 2 * k)
    g.lineTo(3.6 * k, 2 * k)
    g.moveTo(2.3 * k, 2 * k)
    g.arc(0, 2 * k, 2.3 * k, 0, Math.PI, true)
  },
  // the waypoint: a flag
  waypoint (g, k) {
    g.moveTo(-1.6 * k, 3.4 * k)
    g.lineTo(-1.6 * k, -3.2 * k)
    g.lineTo(2.9 * k, -1.7 * k)
    g.lineTo(-1.6 * k, -0.2 * k)
  }
}

// a round blip at (x, y): a disc in its colour with a dark rim, its glyph over it
export function blip (g, x, y, k, fill, glyph) {
  g.save()
  g.translate(x, y)
  g.beginPath()
  g.arc(0, 0, 6.5 * k, 0, TAU)
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 1.5 * k
  g.strokeStyle = 'rgba(10, 12, 18, 0.9)'
  g.stroke()
  if (glyph) {
    g.beginPath()
    glyph(g, k)
    g.stroke()
  }
  g.restore()
}

// the Roadster: a white arrow with a dark edge at (x, y), pointing a radians clockwise from up
export function arrow (g, x, y, a, k) {
  g.save()
  g.translate(x, y)
  g.rotate(a)
  const s = 7.5 * k
  g.beginPath()
  g.moveTo(0, -s)
  g.lineTo(s * 0.72, s * 0.85)
  g.lineTo(0, s * 0.42)
  g.lineTo(-s * 0.72, s * 0.85)
  g.closePath()
  g.fillStyle = '#fff'
  g.fill()
  g.lineWidth = 1.6 * k
  g.strokeStyle = 'rgba(0, 0, 0, 0.75)'
  g.stroke()
  g.restore()
}

// the GPS route (x, z, x, z, ...) as GTA draws it, w wide over a darker edge, in whatever units the
// canvas is in (the radar's and the map's are in metres, so w is too)
export function routeLine (g, line, w) {
  if (line.length < 4) return
  g.beginPath()
  g.moveTo(line[0], line[1])
  for (let i = 2; i < line.length; i += 2) g.lineTo(line[i], line[i + 1])
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = COLOR.routeEdge
  g.lineWidth = w * 1.5
  g.stroke()
  g.strokeStyle = COLOR.route
  g.lineWidth = w
  g.stroke()
}
