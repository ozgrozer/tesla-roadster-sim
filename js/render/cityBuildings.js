// City buildings: procedural facades (glass curtain wall, office, brick, stucco) with windows lit for
// the evening, storefronts under canopies along the street, setbacks, cornices, roof lips, rooftop
// plant and antenna beacons. Each style is one merged mesh, so seven hundred buildings draw in a few
// calls. Every window is its own (facade.js): lit or dark, warm or cool, blinds up or down, and a
// glass pane catches the sky at its own slight angle.
import * as THREE from 'three'
import { LIP, LIP_H } from '../sim/roofs.js'
import { facadeMaterial } from './facade.js'
import { BUILDINGS, rng } from '../sim/city.js'
import { canvasTex, speckle, hdr } from './scene.js'

const COL = 3 // m per window bay
const FLOOR = 3.5 // m per storey
const CELLS = 8 // bays and storeys in one texture tile
const SHOP = 4.6 // height of the storefront band
const R = rng(77)

// ---------- facade textures: a colour map and a lit-window map per style ----------
function lighten (g, x, y, w, h, top, bottom) {
  const gr = g.createLinearGradient(0, y, 0, y + h)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bottom)
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
}
// window rectangle inside a 64 px cell, per style
const WIN = {
  glass: [2, 2, 60, 52],
  office: [6, 14, 52, 36],
  brick: [18, 12, 28, 38],
  stucco: [16, 14, 32, 34]
}
function drawWall (g, style, S) {
  const c = S / CELLS
  if (style === 'glass') {
    g.fillStyle = '#6f7f8c'
    g.fillRect(0, 0, S, S)
  } else if (style === 'brick') {
    g.fillStyle = '#a89a8c' // mortar
    g.fillRect(0, 0, S, S)
    for (let y = 0, r = 0; y < S; y += 6, r++)
      for (let x = (r % 2) * -7; x < S; x += 14) {
        const v = 0.82 + R() * 0.3
        g.fillStyle = `rgb(${(124 * v) | 0},${(66 * v) | 0},${(54 * v) | 0})`
        g.fillRect(x + 1, y + 1, 12, 5)
      }
  } else {
    g.fillStyle = style === 'office' ? '#d8d3ca' : '#efebe4'
    g.fillRect(0, 0, S, S)
    speckle(g, 7000, S, 0.12, false)
    speckle(g, 3000, S, 0.1, true)
  }
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++) {
      const x = i * c,
        y = j * c,
        [wx, wy, ww, wh] = WIN[style]
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
        g.fillRect(x, y + c - 10, c, 10)
        continue
      }
      if (style === 'office') {
        g.fillStyle = 'rgba(0,0,0,0.12)' // floor band
        g.fillRect(x, y + c - 8, c, 8)
      }
      if (style === 'brick') {
        g.fillStyle = '#d9cfc2' // stone lintel and sill
        g.fillRect(x + wx - 3, y + wy - 5, ww + 6, 5)
        g.fillRect(x + wx - 2, y + wy + wh, ww + 4, 4)
      }
      lighten(g, x + wx, y + wy, ww, wh, '#5d6f80', '#2c3742')
      g.fillStyle = 'rgba(25,28,32,0.9)' // frame and mullion
      g.fillRect(x + wx + ww / 2 - 1, y + wy, 2, wh)
      g.strokeStyle = 'rgba(25,28,32,0.8)'
      g.lineWidth = 2
      g.strokeRect(x + wx, y + wy, ww, wh)
      if (style === 'stucco' && j % 2 === 0) {
        g.fillStyle = 'rgba(40,40,42,0.85)' // balcony railing
        g.fillRect(x + 10, y + wy + wh + 4, c - 20, 2)
        for (let b = x + 10; b <= x + c - 10; b += 4)
          g.fillRect(b, y + wy + wh + 4, 1, 9)
      }
    }
}
// every window's glow, brightest at its head (which windows are lit, and in what light, is picked
// per window in the shader: facade.js)
function drawLit (g, style, S) {
  const c = S / CELLS,
    [wx, wy, ww, wh] = WIN[style]
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++)
      lighten(
        g,
        i * c + wx,
        j * c + wy,
        ww,
        wh - (style === 'glass' ? 8 : 0),
        '#ffffff',
        '#3a3a3a'
      )
}
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
function facadeMaps (style) {
  const S = 512
  return {
    map: canvasTex(S, g => drawWall(g, style, S)),
    lit: canvasTex(S, g => drawLit(g, style, S))
  }
}
function shopMaps () {
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
function roofTex () {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#6a6862'
    g.fillRect(0, 0, S, S)
    speckle(g, 9000, S, 0.3, false)
    speckle(g, 4000, S, 0.15, true)
  })
}

// ---------- geometry ----------
class Builder {
  constructor () {
    this.p = []
    this.n = []
    this.uv = []
    this.c = []
  }
  // quad a-b-c-d counter-clockwise seen from outside; uv = [u0, v0, u1, v1] across a-b and up b-c
  quad (a, b, c, d, nrm, uv, col) {
    const [u0, v0, u1, v1] = uv
    const V = [a, b, c, a, c, d],
      T = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1]
    for (let i = 0; i < 6; i++) {
      this.p.push(...V[i])
      this.n.push(...nrm)
      this.uv.push(T[i * 2], T[i * 2 + 1])
      this.c.push(col.r, col.g, col.b)
    }
  }
  // the four walls of a box from y0 to y1; uvFn(width, y0, y1) gives each wall's uv
  walls (x0, x1, z0, z1, y0, y1, col, uvFn) {
    const P = (x, y, z) => [x, y, z]
    this.quad(
      P(x0, y0, z1),
      P(x1, y0, z1),
      P(x1, y1, z1),
      P(x0, y1, z1),
      [0, 0, 1],
      uvFn(x1 - x0, 0),
      col
    )
    this.quad(
      P(x1, y0, z0),
      P(x0, y0, z0),
      P(x0, y1, z0),
      P(x1, y1, z0),
      [0, 0, -1],
      uvFn(x1 - x0, 1),
      col
    )
    this.quad(
      P(x1, y0, z1),
      P(x1, y0, z0),
      P(x1, y1, z0),
      P(x1, y1, z1),
      [1, 0, 0],
      uvFn(z1 - z0, 2),
      col
    )
    this.quad(
      P(x0, y0, z0),
      P(x0, y0, z1),
      P(x0, y1, z1),
      P(x0, y1, z0),
      [-1, 0, 0],
      uvFn(z1 - z0, 3),
      col
    )
  }
  bottom (x0, x1, z0, z1, y, col) {
    this.quad(
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
      [0, -1, 0],
      [0, 0, 0, 0],
      col
    )
  }
  // a band standing out o m round the walls of [x0, x1] x [z0, z1], from y0 to y1, with its
  // underside: a cornice, a parapet or a shop canopy
  band (x0, x1, z0, z1, o, y0, y1, col) {
    for (const [a, b, c, d] of [
      [x0 - o, x1 + o, z0 - o, z0],
      [x0 - o, x1 + o, z1, z1 + o],
      [x0 - o, x0, z0, z1],
      [x1, x1 + o, z0, z1]
    ]) {
      this.cuboid(a, b, c, d, y0, y1, col)
      this.bottom(a, b, c, d, y0, col)
    }
  }
  top (x0, x1, z0, z1, y, col) {
    this.quad(
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
      [0, 1, 0],
      [x0 / 4, z1 / 4, x1 / 4, z0 / 4],
      col
    )
  }
  cuboid (x0, x1, z0, z1, y0, y1, col) {
    this.walls(x0, x1, z0, z1, y0, y1, col, w => [0, y0 / 4, w / 4, y1 / 4])
    this.top(x0, x1, z0, z1, y1, col)
  }
  geometry () {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.computeBoundingSphere()
    return g
  }
}

// antenna beacons, blinked from update()
export const BEACON = new THREE.MeshBasicMaterial({
  color: hdr(5, 0.2, 0.12),
  toneMapped: false
})

export function buildBuildings (group) {
  const styles = ['glass', 'office', 'brick', 'stucco']
  const B = Object.fromEntries(styles.map(s => [s, new Builder()]))
  const shops = new Builder(),
    roofs = new Builder(),
    ledges = new Builder(),
    beacons = new Builder()
  const col = new THREE.Color(),
    white = new THREE.Color(1, 1, 1),
    metal = new THREE.Color(0.32, 0.34, 0.37)
  for (const b of BUILDINGS) {
    const out = B[b.style]
    col.setHex(b.tint).multiplyScalar(0.94 + R() * 0.12)
    const roofCol = new THREE.Color().setScalar(0.75 + R() * 0.3)
    const awning = new THREE.Color().setScalar(0.16 + R() * 0.08)
    b.tiers.forEach((t, k) => {
      const base = k === 0 && b.shop ? SHOP : t.y0
      if (base > t.y0)
        shops.walls(t.x0, t.x1, t.z0, t.z1, t.y0, base, white, (w, side) => {
          const u = b.u * 4 + side * 0.37
          return [u, 0, u + w / 24, 1]
        })
      // whole bays across each wall and whole storeys up it
      const floors = Math.max(1, Math.round((t.y1 - base) / FLOOR))
      out.walls(t.x0, t.x1, t.z0, t.z1, base, t.y1, col, (w, side) => {
        const u = b.u * CELLS + side * 3,
          v = (base - (b.shop ? SHOP : 0)) / FLOOR / CELLS
        return [
          u / CELLS,
          v,
          (u + Math.max(1, Math.round(w / COL))) / CELLS,
          v + floors / CELLS
        ]
      })
      roofs.top(t.x0, t.x1, t.z0, t.z1, t.y1, roofCol)
      // a cornice round the top of each tier (a slim metal parapet on glass), and a canopy over
      // the shops
      const glass = b.style === 'glass',
        o = glass ? 0.1 : b.style === 'office' ? 0.22 : 0.34
      ledges.band(
        t.x0,
        t.x1,
        t.z0,
        t.z1,
        o,
        t.y1 - (glass ? 0.5 : 0.42),
        t.y1 + LIP_H + 0.02,
        glass ? metal : col
      )
      if (base > t.y0)
        ledges.band(
          t.x0,
          t.x1,
          t.z0,
          t.z1,
          1.1,
          SHOP - 0.14,
          SHOP + 0.02,
          awning
        )
      // a low lip round the roof edge (the wheels roll over it)
      const p = LIP,
        h = t.y1 + LIP_H
      roofs.cuboid(t.x0, t.x1, t.z0, t.z0 + p, t.y1, h, col)
      roofs.cuboid(t.x0, t.x1, t.z1 - p, t.z1, t.y1, h, col)
      roofs.cuboid(t.x0, t.x0 + p, t.z0, t.z1, t.y1, h, col)
      roofs.cuboid(t.x1 - p, t.x1, t.z0, t.z1, t.y1, h, col)
    })
    // rooftop plant on the top tier (solid, so laid out by the sim: roofs.js)
    const t = b.tiers[b.tiers.length - 1],
      y = t.y1
    const grey = new THREE.Color().setScalar(0.55 + R() * 0.25)
    for (const p of b.plant)
      roofs.cuboid(p.x0, p.x1, p.z0, p.z1, p.y0, p.y1, grey)
    if (b.antenna) {
      const cx = (t.x0 + t.x1) / 2,
        cz = (t.z0 + t.z1) / 2,
        top = y + 14 + R() * 12
      roofs.cuboid(cx - 0.25, cx + 0.25, cz - 0.25, cz + 0.25, y, top, grey)
      beacons.cuboid(
        cx - 0.45,
        cx + 0.45,
        cz - 0.45,
        cz + 0.45,
        top,
        top + 0.9,
        white
      )
    }
  }

  const add = (builder, mat) => {
    const m = new THREE.Mesh(builder.geometry(), mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    return m
  }
  for (const s of styles) {
    const { map, lit } = facadeMaps(s)
    const glass = s === 'glass'
    add(
      B[s],
      facadeMaterial(
        {
          map,
          emissiveMap: lit,
          emissive: 0xffffff,
          emissiveIntensity: 1.25,
          vertexColors: true,
          roughness: glass ? 0.1 : 0.86,
          metalness: glass ? 0.7 : 0,
          envMapIntensity: glass ? 1.7 : 1
        },
        {
          cells: CELLS,
          win: WIN[s].map(v => v / 64),
          lit: glass ? 0.2 : 0.28,
          blinds: glass ? 0.2 : 0.45,
          tilt: glass ? 0.14 : 0.05
        }
      )
    )
  }
  add(
    ledges,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  )
  const sm = shopMaps()
  add(
    shops,
    new THREE.MeshStandardMaterial({
      map: sm.map,
      emissiveMap: sm.lit,
      emissive: 0xffffff,
      emissiveIntensity: 1.4,
      roughness: 0.55
    })
  )
  const rt = roofTex()
  rt.repeat.set(1, 1)
  add(
    roofs,
    new THREE.MeshStandardMaterial({
      map: rt,
      vertexColors: true,
      roughness: 0.95
    })
  )
  group.add(new THREE.Mesh(beacons.geometry(), BEACON))
}
