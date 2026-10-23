// City buildings: procedural facades (glass curtain wall, office, brick, stucco, stone and
// terracotta, a house's wall) with windows lit for the evening, storefronts under canopies along
// the street, setbacks, cornices, roof lips, rooftop plant and antenna beacons; houses under clay tile
// hip roofs; towers shaped round or three-sided, a stepped cylinder's glass crown and a sail of glass
// lit at night, spires, and the red lights that blink on the tallest. Each style is one merged mesh,
// so six hundred buildings draw in a few calls (the cornices and roofs, heavy with corners, one a
// district: chunks.js). Every window is its own (facade.js): set back in its opening with a room
// behind it, lit or dark, warm or cool, blinds up or down, and a glass pane catches the sky at its
// own slight angle; and every shop too, with the shop inside it (shopfronts.js). (Signs, billboards
// and helipads: citySigns.js; hedges and walls: cityYards.js.)
import * as THREE from 'three'
import { canyonLit } from './canyon.js'
import { LIP, LIP_H } from '../sim/roofs.js'
import { facadeMaterial } from './facade.js'
import { district, DISTRICTS } from './chunks.js'
import { BUILDINGS, rng } from '../sim/city.js'
import { hdr } from './scene.js'
import { Builder } from './builder.js'
import { buildSigns } from './citySigns.js'
import { buildYards } from './cityYards.js'
import { shopfronts } from './shopfronts.js'
import { buildVariety, variedTint, awningFor } from './cityVariety.js'
import {
  COL,
  FLOOR,
  CELLS,
  SHOP,
  INSET,
  WIN,
  STYLES,
  facadeMap,
  roofTex,
  tileTex,
  crownTex
} from './buildingTex.js'

const R = rng(77)

// how each style's windows are lit and dressed (facade.js)
const LOOK = {
  glass: { lit: 0.2, litNight: 0.5, blinds: 0.2, tilt: 0.14 },
  office: { lit: 0.28, litNight: 0.62, blinds: 0.45, tilt: 0.05 },
  brick: { lit: 0.28, litNight: 0.62, blinds: 0.45, tilt: 0.05 },
  stucco: { lit: 0.28, litNight: 0.62, blinds: 0.45, tilt: 0.05 },
  stone: { lit: 0.26, litNight: 0.6, blinds: 0.5, tilt: 0.04 },
  house: { lit: 0.22, litNight: 0.55, blinds: 0.55, tilt: 0.03, fill: 0.5 },
  metal: { lit: 0.1, litNight: 0.35, blinds: 0.1, tilt: 0.02 },
  concrete: { lit: 0.2, litNight: 0.45, blinds: 0.4, tilt: 0.04 },
  garage: { lit: 0, litNight: 0.1, blinds: 0, tilt: 0 }
}
// clay tiles in Beverly Hills, a bungalow's shingles in Venice
const TILE = [0xb5543a, 0xa94b33, 0xc0603f, 0x9e4a35]
const SHINGLE = [0x6f6a64, 0x5d6a5e, 0x7a6555, 0x58606a, 0x8a7a68]

// antenna beacons and the red lights on the tallest roofs, blinked from update()
export const BEACON = new THREE.MeshBasicMaterial({
  color: hdr(5, 0.2, 0.12),
  toneMapped: false
})

const col = new THREE.Color(),
  white = new THREE.Color(1, 1, 1),
  metal = new THREE.Color(0.32, 0.34, 0.37)
const tone = hex => new THREE.Color().setHex(hex)

export function buildBuildings (group) {
  const F = Object.fromEntries(STYLES.map(s => [s, new Builder()]))
  const shops = shopfronts(),
    beacons = new Builder(),
    tiles = new Builder(),
    crowns = new Builder()
  const byDistrict = () =>
    Array.from({ length: DISTRICTS }, () => new Builder())
  const roofsBy = byDistrict(),
    ledgesBy = byDistrict()
  for (const b of BUILDINGS) {
    const t0 = b.tiers[0],
      d = district((t0.x0 + t0.x1) / 2, (t0.z0 + t0.z1) / 2),
      roofs = roofsBy[d],
      ledges = ledgesBy[d]
    col.setHex(variedTint(b)).multiplyScalar(0.94 + R() * 0.12)
    const c = col.clone()
    // a pale membrane on some roofs, grey on the rest
    const roofCol = new THREE.Color().setScalar(
      R() < 0.35 ? 1.05 + R() * 0.15 : 0.55 + R() * 0.3
    )
    const awning = awningFor(b, new THREE.Color().setScalar(0.16 + R() * 0.08))
    const tileCol = tone(
      b.roofs === 'shingle'
        ? SHINGLE[Math.floor(R() * 5)]
        : TILE[Math.floor(R() * 4)]
    )
    if (b.form === 'shaft') shafts(b, F, roofs, ledges, crowns, c, roofCol)
    b.tiers.forEach((t, k) => {
      if (t.strip) return // (a shaped tower's boxes: drawn as its shafts)
      const style = t.style || b.style,
        tc = t.tint ? tone(t.tint) : c
      const base = k === 0 && b.shop ? SHOP : t.y0
      if (base > t.y0) shops.add(b, t, base, tc)
      // (the top storeys of the top tier in a band of lit glass, on some towers)
      const top =
        b.crownBand && k === b.tiers.length - 1 ? t.y1 - b.crownBand : t.y1
      if (top < t.y1)
        crowns.walls(t.x0, t.x1, t.z0, t.z1, top, t.y1, white, (w, side) => [
          side * 0.25,
          0,
          side * 0.25 + w / 6,
          b.crownBand / 7
        ])
      if (t.blank || (top - base < 2.6 && base > t.y0)) {
        // one storey of shops: a plain parapet over the storefronts (or a wall with no windows)
        ledges.walls(t.x0, t.x1, t.z0, t.z1, base, top, tc, w => [
          0,
          0,
          w / 4,
          1
        ])
      } else {
        // whole bays across each wall and whole storeys up it
        const floors = Math.max(1, Math.round((top - base) / FLOOR))
        F[style].walls(t.x0, t.x1, t.z0, t.z1, base, top, tc, (w, side) => {
          const u = b.u * CELLS + side * 3,
            v = (base - (b.shop ? SHOP : 0)) / FLOOR / CELLS
          return [
            u / CELLS,
            v,
            (u + Math.max(1, Math.round(w / COL))) / CELLS,
            v + floors / CELLS
          ]
        })
      }
      if (t.hip) {
        tiles.hip(t.x0, t.x1, t.z0, t.z1, t.y1, t.hip, t.eave || 0, tileCol)
        return
      }
      roofs.top(t.x0, t.x1, t.z0, t.z1, t.y1, roofCol)
      // a cornice round the top of each tier (a slim metal parapet on glass), and a canopy over
      // the shops
      const glass = style === 'glass',
        o = glass
          ? 0.1
          : style === 'house'
          ? 0.12
          : style === 'office'
          ? 0.22
          : style === 'stone'
          ? 0.45
          : 0.34
      ledges.band(
        t.x0,
        t.x1,
        t.z0,
        t.z1,
        o,
        t.y1 - (glass ? 0.5 : style === 'stone' ? 0.9 : 0.42),
        t.y1 + LIP_H + 0.02,
        glass ? metal : tc
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
      roofs.cuboid(t.x0, t.x1, t.z0, t.z0 + p, t.y1, h, tc)
      roofs.cuboid(t.x0, t.x1, t.z1 - p, t.z1, t.y1, h, tc)
      roofs.cuboid(t.x0, t.x0 + p, t.z0, t.z1, t.y1, h, tc)
      roofs.cuboid(t.x1 - p, t.x1, t.z0, t.z1, t.y1, h, tc)
    })
    if (b.fins) fins(b, ledges, c)
    // rooftop plant on the top tier (solid, so laid out by the sim: roofs.js)
    const t = b.tiers[b.tiers.length - 1],
      y = t.y1
    const grey = new THREE.Color().setScalar(0.55 + R() * 0.25)
    for (const p of b.plant)
      if (!p.look) roofs.cuboid(p.x0, p.x1, p.z0, p.z1, p.y0, p.y1, grey)
    if (b.antenna) {
      const cx = (t.x0 + t.x1) / 2,
        cz = (t.z0 + t.z1) / 2,
        top = y + 14 + R() * 12
      roofs.cuboid(cx - 0.25, cx + 0.25, cz - 0.25, cz + 0.25, y, top, grey)
      beacon(beacons, cx, top, cz, 0.45)
    }
    if (b.spire) spire(b.spire, ledges, beacons)
    // the red lights at the corners of the tallest roofs
    if (b.h > 120 && b.form !== 'shaft')
      for (const [x, z] of [
        [t.x0 + 0.6, t.z0 + 0.6],
        [t.x1 - 0.6, t.z1 - 0.6],
        [t.x0 + 0.6, t.z1 - 0.6],
        [t.x1 - 0.6, t.z0 + 0.6]
      ])
        beacon(beacons, x, y + 0.6, z, 0.25)
  }

  const add = (builder, mat, name, shadow = true) => {
    if (builder.empty) return null
    const m = new THREE.Mesh(builder.geometry(), mat)
    m.castShadow = shadow
    m.receiveShadow = true
    m.name = name
    group.add(m)
    return m
  }
  for (const s of STYLES) {
    const glass = s === 'glass',
      L = LOOK[s]
    add(
      F[s],
      canyonLit(facadeMaterial(
        {
          map: facadeMap(s),
          emissive: 0xffffff,
          emissiveIntensity: 1.25,
          vertexColors: true,
          roughness: glass ? 0.1 : 0.86,
          metalness: glass ? 0.7 : 0,
          envMapIntensity: glass ? 1.7 : 1.2
        },
        {
          cells: CELLS,
          win: WIN[s].map(v => v / 64),
          lit: L.lit,
          litNight: L.litNight,
          blinds: L.blinds,
          tilt: L.tilt,
          inset: INSET[s],
          glassMetal: glass ? 0.6 : 0,
          fill: L.fill ?? 1
        }
      )),
      `facades ${s}`
    )
  }
  const ledgeMat = canyonLit(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  )
  for (const l of ledgesBy) add(l, ledgeMat, 'cornices')
  const shopLight = shops.build(group)
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofTex(),
    vertexColors: true,
    roughness: 0.95
  })
  for (const r of roofsBy) add(r, roofMat, 'roofs')
  add(
    tiles,
    new THREE.MeshStandardMaterial({
      map: tileTex(),
      vertexColors: true,
      roughness: 0.8
    }),
    'tile roofs'
  )
  const ct = crownTex()
  const crownMat = new THREE.MeshStandardMaterial({
    map: ct,
    emissiveMap: ct,
    emissive: 0xfff2dc,
    emissiveIntensity: 0.35,
    vertexColors: true,
    roughness: 0.2,
    metalness: 0.3
  })
  const variety = buildVariety(group, { beacons, crowns }) // (roofs, balconies, landmarks)
  add(crowns, crownMat, 'crowns')
  add(beacons, BEACON, 'beacons', false)
  const signs = buildSigns(group)
  buildYards(group)
  // night (0 to 1): the crowns and every sign lit, the shops' light on the pavement (the windows:
  // facade.js; the shops follow NIGHT themselves: shopShader.js)
  return {
    night (k) {
      shopLight.night(k)
      crownMat.emissiveIntensity = 0.35 + 2.4 * k
      signs.night(k)
      variety.night(k)
    },
    update (dt) {
      variety.update(dt)
    }
  }
}

// A shaped tower: each shaft's walls round its plan with whole storeys up them (and whole bays
// across each flat wall; round, the bays run on round it), its top and its cornice; a lit glass
// crown, a sail of glass sloping up to its spire, or a round tower's floors stacked like records
function shafts (b, F, roofs, ledges, crowns, c, roofCol) {
  const glass = b.style === 'glass'
  for (const s of b.shafts) {
    const out = s.crown ? crowns : F[b.style]
    const floors = Math.max(1, Math.round((s.y1 - s.y0) / FLOOR)),
      v0 = s.y0 / FLOOR / CELLS,
      v1 = v0 + floors / CELLS
    const per = s.pts.reduce((a, p, i) => {
      const q = s.pts[(i + 1) % s.pts.length]
      return a + Math.hypot(q[0] - p[0], q[1] - p[1])
    }, 0)
    const k = Math.max(1, Math.round(per / COL)) / per // bays a metre round a round one
    const u0 = b.u * CELLS
    out.prism(
      s.pts,
      s.y0,
      s.y1,
      s.crown ? white : c,
      (i, len, from) =>
        s.smooth
          ? [(u0 + from * k) / CELLS, v0, (u0 + (from + len) * k) / CELLS, v1]
          : [
              (u0 + i * 3) / CELLS,
              v0,
              (u0 + i * 3 + Math.max(1, Math.round(len / COL))) / CELLS,
              v1
            ],
      s.smooth
    )
    roofs.cap(s.pts, s.y1, roofCol)
    ledges.ring(
      s.pts,
      glass ? 0.12 : 0.3,
      s.y1 - 0.5,
      s.y1 + 0.12,
      glass ? metal : c
    )
    if (b.records)
      for (let y = FLOOR; y < s.y1 - 1; y += FLOOR)
        ledges.ring(s.pts, 1.2, y - 0.14, y + 0.04, white)
  }
  if (b.sail) {
    // the sail: walls and a top sloping up from the west end to the east
    const { pts, y0, y1 } = b.sail
    const xs = pts.map(p => p[0]),
      lo = Math.min(...xs),
      hi = Math.max(...xs)
    const tops = pts.map(p => y0 + ((y1 - y0) * (p[0] - lo)) / (hi - lo))
    crowns.prism(
      pts,
      y0,
      y1,
      white,
      (i, len) => [i * 2, 0, i * 2 + len / 6, (y1 - y0) / 12],
      false,
      tops
    )
    crowns.cap(pts, y0, white, tops)
  }
}

// Art Deco: slim fins standing up the walls between every other bay, past the parapet
function fins (b, ledges, c) {
  const t = b.tiers[0],
    y0 = b.shop ? SHOP + 0.3 : 0.4,
    y1 = t.y1 + 1.2
  const pale = c.clone().lerp(white, 0.35)
  for (const side of [0, 1, 2, 3]) {
    const along = side % 2 === 0,
      L = along ? t.x1 - t.x0 : t.z1 - t.z0,
      n = Math.floor(L / 6)
    for (let i = 1; i < n; i++) {
      const u = (along ? t.x0 : t.z0) + (L * i) / n
      const o =
          side === 0 ? t.z0 : side === 2 ? t.z1 : side === 1 ? t.x1 : t.x0,
        s = side === 0 || side === 3 ? -1 : 1
      if (along)
        ledges.cuboid(
          u - 0.18,
          u + 0.18,
          Math.min(o, o + s * 0.5),
          Math.max(o, o + s * 0.5),
          y0,
          y1,
          pale
        )
      else
        ledges.cuboid(
          Math.min(o, o + s * 0.5),
          Math.max(o, o + s * 0.5),
          u - 0.18,
          u + 0.18,
          y0,
          y1,
          pale
        )
    }
  }
}

// a spire tapering to its tip, a red light on it
function spire (s, ledges, beacons) {
  const g = new THREE.CylinderGeometry(0.08, 0.9, s.h, 4, 1).translate(
    0,
    s.h / 2,
    0
  )
  ledges.add(
    g,
    new THREE.Matrix4().makeTranslation(s.x, s.y, s.z),
    new THREE.Color(0.7, 0.72, 0.75)
  )
  beacon(beacons, s.x, s.y + s.h, s.z, 0.35)
}
const beacon = (beacons, x, y, z, r) =>
  beacons.cuboid(x - r, x + r, z - r, z + r, y, y + 2 * r, white)
