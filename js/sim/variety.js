// What breaks up the city's sameness, laid out after everything else on its own random numbers
// (rng 20261020, so the layout, the parked cars and the traffic's dealing stay as they were): on the
// roofs, wooden water tanks on Downtown's and the Arts District's old brick and stone, terraces
// with a pergola and umbrellas on the beach towns' apartments, solar panels on the low flat roofs,
// sawtooth roofs on the factories, gardens on the lower office towers; and three landmarks seen from
// across the city: the Meridian's crown of lit glass and its spire on a Downtown tower, the
// broadcast masts on the highest peak of the hills, and a lighthouse on the north groyne. Each is
// solid as the sim's boxes (posts for the masts and the lighthouse) and kept on the building's
// b.plant with its look, so the roofs' rules (roofs.js) and the renderer see it; render/
// cityVariety.js draws it all.
import { BUILDINGS, rng, query, addCollider } from './city.js'
import { hillHeight, GROYNE, WALL } from './edge.js'
import { STEP } from './roofs.js' // (and so after the roofs' own plant is laid)

const R = rng(20261020)
// { kind: 'tank' | 'terrace' | 'solar' | 'saw' | 'garden', b, x0, x1, z0, z1, y (the roof), ... }
export const ROOFTOPS = []
export const LANDMARKS_V2 = { crown: null, masts: [], lighthouse: null }

const hits = []
// whether [x0, x1] x [z0, z1] on top of tier t is clear of what is already on the roof
function clear (b, t, x0, x1, z0, z1) {
  const pad = b.helipad
  if (pad && Math.max(x0 - pad.x, 0, pad.x - x1) ** 2 + Math.max(z0 - pad.z, 0, pad.z - z1) ** 2 < (pad.r + 1.5) ** 2) return false
  if (x0 < t.x0 + 0.6 || x1 > t.x1 - 0.6 || z0 < t.z0 + 0.6 || z1 > t.z1 - 0.6) return false
  for (const c of query(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, hits))
    if (c.y1 > t.y1 + STEP / 6 && c.y0 < t.y1 + 12) return false
  return true
}
function solidOn (b, x0, x1, z0, z1, y0, y1, look) {
  const c = addCollider({ x0, x1, z0, z1, y0, y1, kind: 'plant', look })
  b.plant.push(c)
  return c
}
const post = (x, z, r, y0, y1, look) =>
  addCollider({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0, y1, x, z, r, kind: 'mast', look })
// up to n tries at a free spot w by d somewhere on t
function spot (b, t, w, d, n = 6) {
  for (let k = 0; k < n; k++) {
    const x = t.x0 + 1 + R() * Math.max(0, t.x1 - t.x0 - w - 2),
      z = t.z0 + 1 + R() * Math.max(0, t.z1 - t.z0 - d - 2)
    if (clear(b, t, x, x + w, z, z + d)) return [x, x + w, z, z + d]
  }
  return null
}

// ---------- the roofs ----------
for (const b of BUILDINGS) {
  if (b.form === 'shaft' || !b.plant) continue
  const t = b.tiers[b.tiers.length - 1]
  if (t.hip || t.strip) continue
  const w = t.x1 - t.x0,
    d = t.z1 - t.z0,
    y = t.y1,
    u = R(),
    v = R()
  const old = (b.area === 'downtown' || b.area === 'industrial') && (b.style === 'brick' || b.style === 'stone')
  if (old && y > 8 && y < 70 && w > 9 && d > 9 && u < 0.42) {
    const s = spot(b, t, 4, 4)
    if (s) {
      solidOn(b, ...s, y, y + 8.4, 'tank')
      ROOFTOPS.push({ kind: 'tank', b, x0: s[0], x1: s[1], z0: s[2], z1: s[3], y, r: 1.75 + v * 0.3 })
    }
    continue
  }
  const homes = (b.area === 'beach' || b.area === 'venice' || b.area === 'strip' || b.area === 'boulevard') && b.style === 'stucco'
  if (homes && y > 6.5 && y < 30 && w > 9 && d > 9 && u < 0.32) {
    const s = spot(b, t, Math.min(8, w - 3), Math.min(6, d - 3))
    if (s) {
      solidOn(b, s[0] + 0.4, s[1] - 0.4, s[2] + 0.4, s[2] + 2.6, y, y + 2.7, 'pergola')
      ROOFTOPS.push({ kind: 'terrace', b, x0: s[0], x1: s[1], z0: s[2], z1: s[3], y, hue: v })
    }
    continue
  }
  if (b.style === 'metal' || (b.area === 'industrial' && b.style === 'concrete')) {
    if (w > 16 && d > 16 && u < 0.6) {
      // teeth along x, 5 m apart, each its own solid where the roof is clear
      const teeth = []
      for (let z = t.z0 + 1; z + 4.6 < t.z1 - 1; z += 5)
        if (clear(b, t, t.x0 + 0.8, t.x1 - 0.8, z, z + 4.6)) {
          solidOn(b, t.x0 + 0.8, t.x1 - 0.8, z, z + 4.6, y, y + 1.2, 'saw')
          teeth.push(z)
        }
      if (teeth.length) ROOFTOPS.push({ kind: 'saw', b, x0: t.x0 + 0.8, x1: t.x1 - 0.8, teeth, y, flip: v < 0.5 })
    }
    continue
  }
  if ((b.style === 'stucco' || b.style === 'concrete') && y < 9 && w > 8 && d > 8 && u < 0.3) {
    const s = spot(b, t, Math.min(9, w - 2.5), Math.min(6, d - 2.5))
    if (s) {
      solidOn(b, ...s, y, y + 0.55, 'solar')
      ROOFTOPS.push({ kind: 'solar', b, x0: s[0], x1: s[1], z0: s[2], z1: s[3], y })
    }
    continue
  }
  if ((b.style === 'office' || b.style === 'glass') && y > 25 && y < 140 && w > 14 && d > 14 && u < 0.35) {
    const s = spot(b, t, w * 0.5, d * 0.45)
    if (s) ROOFTOPS.push({ kind: 'garden', b, x0: s[0], x1: s[1], z0: s[2], z1: s[3], y })
  }
}

// ---------- the landmarks ----------
// The Meridian: Downtown's tallest plain glass box gets a stepped crown of lit glass, rings of light
// round each step (they change colour after dark: render/cityVariety.js), and a spire
{
  const b = BUILDINGS.filter(
    b => b.area === 'downtown' && b.form !== 'shaft' && !b.helipad && !b.crownBand && b.tiers.length
  ).sort((a, c) => c.h - a.h)[0]
  if (b) {
    const t = b.tiers[b.tiers.length - 1]
    const cx = (t.x0 + t.x1) / 2,
      cz = (t.z0 + t.z1) / 2
    const steps = []
    let hw = (t.x1 - t.x0) / 2 - 2,
      hd = (t.z1 - t.z0) / 2 - 2,
      y = t.y1
    for (let k = 0; k < 3; k++) {
      const h = 9 - k * 1.5
      steps.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, y0: y, y1: y + h })
      solidOn(b, cx - hw, cx + hw, cz - hd, cz + hd, y, y + h, 'crown')
      y += h
      hw *= 0.68
      hd *= 0.68
    }
    const spire = { x: cx, z: cz, y, h: 46 }
    post(cx, cz, 0.7, y, y + spire.h, 'spire')
    LANDMARKS_V2.crown = { b, steps, spire, name: 'The Meridian' }
  }
}
// three broadcast masts on the hills' highest peak, red lights up them
{
  let best = null
  for (let x = 200; x <= 1600; x += 20)
    for (let z = -1100; z >= -1900; z -= 20) {
      const h = hillHeight(x, z)
      if (!best || h > best.h) best = { x, z, h }
    }
  for (const [dx, dz, h] of [[0, 0, 118], [26, 12, 92], [-20, 18, 74]]) {
    const x = best.x + dx,
      z = best.z + dz,
      y = hillHeight(x, z) - 1
    post(x, z, 1.4, y, y + h, 'mast')
    LANDMARKS_V2.masts.push({ x, z, y, h })
  }
}
// a lighthouse at the end of the north groyne, out in the sea
{
  const x = GROYNE.x0 + 3.2,
    z = -WALL - GROYNE.w / 2,
    y = GROYNE.h
  post(x, z, 2.6, y, y + 27, 'lighthouse')
  LANDMARKS_V2.lighthouse = { x, z, y, h: 27 }
}
