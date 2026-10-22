// The city's variety, drawn (sim/variety.js lays it out): the districts' own palettes for their
// walls and awnings, balconies down the apartments' street fronts, and on the roofs the water
// tanks, terraces, solar panels, sawtooth factory roofs and gardens; and three landmarks seen from
// afar: the Meridian's stepped crown with its rings of light (slowly changing colour after dark) and
// its spire, the broadcast masts on the peak with red lights up them, and the lighthouse on the
// groyne, its beam sweeping the sea at night. All of it in five draws for the whole city: the lit
// pieces, the crown rings, what glows, the beacons (cityBuildings.js's, blinking) and the beam.
import * as THREE from 'three'
import { Builder } from './builder.js'
import { ROOFTOPS, LANDMARKS_V2 } from '../sim/world.js'
import { BUILDINGS, ROADS } from '../sim/city.js'
import { FLOOR, SHOP } from './buildingTex.js'

// a building's own number from where it stands (no random draws: the layout's streams untouched)
const hash = (b, k = 0) => {
  const v = Math.sin(b.x0 * 12.9898 + b.z0 * 78.233 + k * 37.719) * 43758.5453
  return v - Math.floor(v)
}
// ---------- the palettes ----------
// facade tints by neighbourhood and style (multiplied over each facade texture's own colour: near
// white keeps it, warmer or greyer shifts it); null keeps the building's own
const PAL = {
  brick: [0xffffff, 0xf0c8b4, 0xd8cfc8, 0xfff0d6, 0xc9ae9c, 0xe4d2c8],
  'beach:stucco': [0xf6efe2, 0xf3d9c4, 0xdcebe3, 0xf4dfe0, 0xe8eef4, 0xf2e6c4],
  'strip:stucco': [0xf0d6b0, 0xe9b89a, 0xdcd2a4, 0xc9d6b8, 0xf2e1c8, 0xe4c2a6],
  'boulevard:stucco': [0xf4ead4, 0xd6eadf, 0xf2d0d6, 0xe0d6ee, 0xf6f2ea, 0xefd9b4],
  'suburb:stucco': [0xeee0c8, 0xe2c4a4, 0xd8d0b0, 0xf2e8d0, 0xd6c0b0, 0xe8dcc0],
  'downtown:glass': [0x8fb8d0, 0x7fa8b4, 0xb49a78, 0x9cc4bf, 0x8a96b0],
  'towers:glass': [0xa3b8c9, 0xc4ab88, 0x9aa8b8, 0xb8c4cc],
  'industrial:concrete': [0xd8d4cc, 0xc8c0b0, 0xb8bcc0, 0xd0c4b0]
}
export function variedTint (b) {
  const p = PAL[`${b.area}:${b.style}`] || (b.style === 'brick' ? PAL.brick : null)
  if (!p || hash(b) < 0.3) return b.tint
  return p[Math.floor(hash(b, 1) * p.length)]
}
// a shop's awning: a colour of the street's (dark grey, as it was, elsewhere)
const AWN = {
  beach: [0x2e6f8e, 0xc8553d, 0xf2f2ea, 0x3d7a5a, 0x1c2a44],
  boulevard: [0x8a1c2c, 0x1c1c1c, 0x2d4f8a, 0xc89a2a, 0x5a2a6a],
  venice: [0xe8742a, 0x2ab0b8, 0xf2c14e, 0xd94f8a, 0x4f9a3a],
  strip: [0xc8402a, 0x2a5a9a, 0xe8b02a, 0x3a3a3a]
}
export function awningFor (b, grey) {
  const p = AWN[b.area]
  if (!p || hash(b, 2) < 0.25) return grey
  return new THREE.Color(p[Math.floor(hash(b, 3) * p.length)]).multiplyScalar(0.8)
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _s = new THREE.Vector3(1, 1, 1),
  _p = new THREE.Vector3()
const C = hex => new THREE.Color(hex)
const at = (x, y, z, rx = 0, ry = 0, rz = 0) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1),
  CONE = new THREE.ConeGeometry(1, 1, 12, 1),
  CONE8 = new THREE.ConeGeometry(1, 1, 8, 1),
  BOX = new THREE.BoxGeometry(1, 1, 1),
  BUSH = new THREE.IcosahedronGeometry(1, 0)
// a geometry scaled (sx, sy, sz) and placed
function put (B, geo, col, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _s.set(sx, sy, sz)
  B.add(geo, at(x, y, z, rx, ry, rz), col)
  _s.set(1, 1, 1)
}

// ---------- the roofs ----------
const WOOD = C(0x7a5a3a),
  DARK = C(0x3a2e26),
  STEEL = C(0x5a5e64),
  DECK = C(0xa87b55),
  WHITE = C(0xf2efe8),
  PANEL = C(0x1b2a4a),
  GREEN = C(0x4f7a3a),
  SAW = C(0x8a8e94),
  GLAZE = C(0x9fb8c8)
function tank (B, r) {
  const x = (r.x0 + r.x1) / 2,
    z = (r.z0 + r.z1) / 2,
    y = r.y
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cuboid(x + dx * 1.3 - 0.12, x + dx * 1.3 + 0.12, z + dz * 1.3 - 0.12, z + dz * 1.3 + 0.12, y, y + 3.4, STEEL)
  B.cuboid(x - 1.9, x + 1.9, z - 1.9, z + 1.9, y + 3.2, y + 3.4, DARK)
  put(B, CYL, WOOD, x, y + 5.2, z, r.r, 3.6, r.r)
  for (const h of [4, 5.2, 6.4]) put(B, CYL, DARK, x, y + h, z, r.r + 0.04, 0.12, r.r + 0.04)
  put(B, CONE, DARK, x, y + 7.7, z, r.r + 0.2, 1.4, r.r + 0.2)
}
function terrace (B, r) {
  const { x0, x1, z0, z1, y } = r
  B.cuboid(x0, x1, z0, z1, y, y + 0.12, DECK)
  // the pergola along the north side, its slats
  const p0 = x0 + 0.4,
    p1 = x1 - 0.4
  for (const x of [p0, p1]) for (const z of [z0 + 0.4, z0 + 2.6]) B.cuboid(x - 0.1, x + 0.1, z - 0.1, z + 0.1, y, y + 2.6, WHITE)
  for (let x = p0; x <= p1; x += 0.6) B.cuboid(x - 0.05, x + 0.05, z0 + 0.3, z0 + 2.7, y + 2.6, y + 2.7, WHITE)
  // umbrellas and loungers out in the open
  const hues = [0xd94f3a, 0x2a8ab8, 0xf2c14e, 0x3d9a6a]
  const n = Math.max(1, Math.floor((x1 - x0) / 4))
  for (let i = 0; i < n; i++) {
    const x = x0 + 2 + i * 4,
      z = (z0 + 2.7 + z1) / 2 + 0.6
    if (x > x1 - 1.5) break
    B.cuboid(x - 0.04, x + 0.04, z - 0.04, z + 0.04, y, y + 2.2, STEEL)
    put(B, CONE8, C(hues[Math.floor(r.hue * 4 + i) % 4]), x, y + 2.35, z, 1.3, 0.5, 1.3)
    B.cuboid(x + 0.6, x + 1.2, z - 0.9, z + 0.9, y + 0.12, y + 0.42, WHITE)
  }
}
function solar (B, r) {
  const { x0, x1, z0, z1, y } = r
  for (let z = z0 + 0.2; z + 1.4 <= z1; z += 1.9) put(B, BOX, PANEL, (x0 + x1) / 2, y + 0.38, z + 0.7, x1 - x0 - 0.2, 0.06, 1.4, -0.32, 0, 0)
  B.cuboid(x0, x1, z0, z1, y, y + 0.12, STEEL)
}
function saw (B, r) {
  const { x0, x1, y } = r
  for (const z of r.teeth) {
    // a slope up over 4.6 m to the glazing standing at the high side
    const [lo, hi] = r.flip ? [z + 4.6, z] : [z, z + 4.6]
    const n = r.flip ? [0, 0.97, -0.26] : [0, 0.97, 0.26]
    B.quad([x0, y, lo], [x1, y, lo], [x1, y + 1.2, hi], [x0, y + 1.2, hi], n, [0, 0, 1, 1], SAW)
    B.quad([x1, y, hi], [x0, y, hi], [x0, y + 1.2, hi], [x1, y + 1.2, hi], [0, 0, r.flip ? -1 : 1], [0, 0, 1, 1], GLAZE)
    B.quad([x0, y + 1.2, hi], [x1, y + 1.2, hi], [x1, y, hi], [x0, y, hi], [0, 0, r.flip ? 1 : -1], [0, 0, 1, 1], GLAZE)
    for (const x of [x0, x1]) B.tri([x, y, lo], [x, y, hi], [x, y + 1.2, hi], [x === x0 ? -1 : 1, 0, 0], [0, 0, 1, 0, 1, 1], SAW)
  }
}
function garden (B, r) {
  const { x0, x1, z0, z1, y } = r
  B.cuboid(x0, x1, z0, z1, y, y + 0.35, GREEN)
  for (let x = x0 + 1; x < x1 - 0.5; x += 2.6) for (let z = z0 + 1; z < z1 - 0.5; z += 2.6) put(B, BUSH, C(0x3f6a2f), x, y + 0.8, z, 0.7, 0.6, 0.7)
}

// ---------- balconies ----------
// down the street front of about half the apartment blocks: a slab and a railing a floor apart,
// every other bay, from the first floor (over the shops) up to the floor under the roof
const HOMES = new Set(['beach', 'strip', 'boulevard', 'venice', 'suburb'])
function balconies (B) {
  let n = 0
  for (const b of BUILDINGS) {
    if (!HOMES.has(b.area) || b.style !== 'stucco' || b.form === 'shaft' || b.tiers.length !== 1) continue
    if (b.h < 6.5 || b.h > 30 || hash(b, 4) < 0.5) continue
    const t = b.tiers[0]
    // the wall nearest a street: 0 north, 1 east, 2 south, 3 west
    const gap = v => Math.min(...ROADS.map(r => Math.abs(r - v)))
    const d = [gap(t.z0), gap(t.x1), gap(t.z1), gap(t.x0)]
    const s = d.indexOf(Math.min(...d))
    const along = s % 2 === 0
    const a0 = along ? t.x0 : t.z0,
      a1 = along ? t.x1 : t.z1
    const face = [t.z0, t.x1, t.z1, t.x0][s],
      out = s === 0 || s === 3 ? -1 : 1
    const rail = C(hash(b, 5) < 0.5 ? 0x2b2f36 : 0xe8e4dc)
    const slab = C(0xe8e2d6)
    const y0 = (b.shop ? SHOP : 0) + FLOOR
    for (let y = y0; y < t.y1 - 1.6; y += FLOOR)
      for (let a = a0 + 1.6; a + 2.4 < a1 - 1; a += 6) {
        const box = (u0, u1, o0, o1, h0, h1, c) =>
          along
            ? B.cuboid(u0, u1, Math.min(face + out * o0, face + out * o1), Math.max(face + out * o0, face + out * o1), h0, h1, c)
            : B.cuboid(Math.min(face + out * o0, face + out * o1), Math.max(face + out * o0, face + out * o1), u0, u1, h0, h1, c)
        box(a, a + 2.4, 0, 1.1, y - 0.15, y, slab)
        box(a, a + 2.4, 1.04, 1.1, y, y + 1, rail)
        n++
      }
  }
  return n
}

// ---------- the landmarks ----------
function crown (B, rings, beacons, crowns) {
  const L = LANDMARKS_V2.crown
  if (!L) return
  const white = new THREE.Color(1, 1, 1)
  for (const s of L.steps) {
    crowns.walls(s.x0, s.x1, s.z0, s.z1, s.y0, s.y1 - 0.6, white, w => [0, 0, w / 6, (s.y1 - s.y0) / 7])
    B.cuboid(s.x0 - 0.2, s.x1 + 0.2, s.z0 - 0.2, s.z1 + 0.2, s.y1 - 0.6, s.y1, STEEL)
    rings.band(s.x0, s.x1, s.z0, s.z1, 0.35, s.y1 - 0.9, s.y1 - 0.6, white)
  }
  const p = L.spire
  put(B, CONE, STEEL, p.x, p.y + p.h / 2, p.z, 0.9, p.h, 0.9)
  for (let k = 1; k <= 3; k++) rings.cuboid(p.x - 1.2 + k * 0.2, p.x + 1.2 - k * 0.2, p.z - 1.2 + k * 0.2, p.z + 1.2 - k * 0.2, p.y + k * 7, p.y + k * 7 + 0.4, white)
  beacons.cuboid(p.x - 0.4, p.x + 0.4, p.z - 0.4, p.z + 0.4, p.y + p.h, p.y + p.h + 0.8, white)
}
function masts (B, beacons) {
  const RED = C(0xc0302a)
  for (const m of LANDMARKS_V2.masts) {
    const { x, z, y, h } = m
    for (let k = 0; k * 10 < h; k++) {
      const c = k % 2 ? WHITE : RED,
        y0 = y + k * 10,
        y1 = Math.min(y + h, y0 + 10)
      const r = 1.3 * (1 - (k * 10) / h) + 0.35
      for (const [dx, dz] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) B.cuboid(x + dx * r - 0.1, x + dx * r + 0.1, z + dz * r - 0.1, z + dz * r + 0.1, y0, y1, c)
      B.cuboid(x - r, x + r, z - r, z + r, y1 - 0.2, y1, c)
    }
    for (let yy = y + 30; yy < y + h; yy += 30) beacons.cuboid(x - 0.5, x + 0.5, z - 0.5, z + 0.5, yy, yy + 0.8, WHITE)
    beacons.cuboid(x - 0.7, x + 0.7, z - 0.7, z + 0.7, y + h, y + h + 1.2, WHITE)
  }
}
function lighthouse (B, glow) {
  const L = LANDMARKS_V2.lighthouse
  if (!L) return
  const { x, z, y, h } = L
  const RED = C(0xb02a26)
  B.add(new THREE.CylinderGeometry(1.9, 2.6, h * 0.5, 16), at(x, y + h * 0.25, z), WHITE)
  B.add(new THREE.CylinderGeometry(1.5, 1.9, h * 0.25, 16), at(x, y + h * 0.625, z), RED)
  B.add(new THREE.CylinderGeometry(1.3, 1.5, h * 0.17, 16), at(x, y + h * 0.835, z), WHITE)
  B.add(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 16), at(x, y + h * 0.92, z), DARK)
  glow.add(new THREE.CylinderGeometry(1.1, 1.1, 2, 12), at(x, y + h * 0.92 + 1.15, z), C(0xfff2c8))
  B.add(new THREE.ConeGeometry(1.5, 1.6, 12), at(x, y + h * 0.92 + 2.95, z), RED)
}

export function buildVariety (group, { beacons, crowns }) {
  const B = new Builder(),
    rings = new Builder(),
    glow = new Builder()
  const DRAW = { tank, terrace, solar, saw, garden }
  for (const r of ROOFTOPS) DRAW[r.kind](B, r)
  const nBalc = balconies(B)
  crown(B, rings, beacons, crowns)
  masts(B, beacons)
  lighthouse(B, glow)
  const lit = new THREE.Mesh(B.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }))
  lit.castShadow = lit.receiveShadow = true
  lit.name = 'variety'
  group.add(lit)
  const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1) })
  const rm = new THREE.Mesh(rings.geometry(), ringMat)
  rm.name = 'crown rings'
  group.add(rm)
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1) })
  const gm = new THREE.Mesh(glow.geometry(), glowMat)
  group.add(gm)
  // the lighthouse's beam: two long fading blades crossed, turning round the lantern
  const L = LANDMARKS_V2.lighthouse
  const beamGeo = new THREE.PlaneGeometry(260, 7).translate(130, 0, 0)
  const pos = beamGeo.attributes.position,
    cols = []
  for (let i = 0; i < pos.count; i++) {
    const f = Math.max(0, 1 - pos.getX(i) / 260)
    cols.push(f, f * 0.95, f * 0.8)
  }
  beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  const blade = beamGeo.clone().rotateX(Math.PI / 2)
  const beam = new THREE.Mesh(
    new THREE.BufferGeometry().copy(beamGeo),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  )
  beam.add(new THREE.Mesh(blade, beam.material))
  beam.position.set(L.x, L.y + L.h * 0.92 + 1.15, L.z)
  beam.visible = false
  group.add(beam)
  let dark = 0,
    t = 0
  const hue = new THREE.Color()
  return {
    balconies: nBalc,
    night (k) {
      dark = k
      glowMat.color.setScalar(0.6 + 2.4 * k)
      beam.visible = k > 0.35
    },
    update (dt) {
      t += dt
      // the crown's rings: a soft white by day, slowly round the colours after dark
      hue.setHSL((t * 0.02) % 1, 0.85, 0.55)
      ringMat.color.setRGB(1, 1, 1).lerp(hue, dark).multiplyScalar(0.9 + 2.6 * dark)
      if (beam.visible) beam.rotation.y = -t * 0.9
    }
  }
}
