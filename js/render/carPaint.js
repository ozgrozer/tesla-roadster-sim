// How the traffic is painted, and shod: the colours Los Angeles' cars come in (about a quarter
// white, a fifth black, a third greys and silvers, then dark blues and reds and the odd bright
// one), each a solid gloss or a metallic under the clear coat, some with a black roof; sports cars
// in brighter colours more often, cabs yellow, police cars black (their white goes on in the body's
// shader), buses in their operators' orange, blue or red, vans mostly white; ambulances white, fire
// engines red, box trucks' cabs mostly white (their boxes are, in the body's shader), lowriders in
// candy and pearl, deep and metallic, some with a white top, and limousines black or white. And the
// rims each car rolls on (carWheels.js draws them: a lowrider's wire wheels on whitewall tyres),
// and the textures for the shade under a car and its beams.
import * as THREE from 'three'

// [colour, weight, metallic share]
// prettier-ignore
const CARS = [
  [0xdedfdb, 11, 0], [0xd9d8d1, 10, 0.25], [0xdcdad2, 3, 0],
  [0x0b0c0e, 9, 0], [0x15171b, 10, 0.55],
  [0x2d3035, 7, 0.6], [0x4b4f55, 7, 0.6], [0x6b6f74, 4, 0.55], [0x878b8e, 2.5, 0.05],
  [0xa7abaf, 8, 0.7], [0xc4c7ca, 5, 0.7],
  [0x16233f, 4, 0.6], [0x264a80, 2.5, 0.6], [0x4f7ab0, 1.2, 0.5],
  [0x7a0c12, 3, 0.55], [0xa8141b, 3.5, 0.3], [0x4c0d12, 1, 0.5],
  [0x1f3a2c, 1, 0.5], [0x5d6b52, 0.6, 0.1], [0xb3a07c, 1.2, 0.5], [0x4c3a2c, 0.6, 0.5],
  [0xc9581b, 0.6, 0.35], [0xe3b52a, 0.35, 0.2], [0x2f8f96, 0.3, 0.4]
]
// prettier-ignore
const SPORTS = [
  [0xb3141b, 6, 0.35], [0xdedfdb, 5, 0], [0x0b0c0e, 5, 0], [0x1a1c20, 3, 0.55], [0x9da1a5, 4, 0.7],
  [0x868a8d, 3, 0.05], [0xe0a91a, 2, 0.2], [0xd2561a, 2, 0.3], [0x1d4fa3, 3, 0.5], [0x2b6b3e, 1.5, 0.5],
  [0x5a2f8a, 0.6, 0.5], [0x7fc8d6, 0.5, 0.3]
]
// prettier-ignore
const FIXED = {
  taxi: [[0xf0b404, 10, 0.15], [0xf4c41f, 3, 0.2]],
  police: [[0x0a0b0d, 1, 0.1]],
  bus: [[0xe0661e, 6, 0], [0x1f4f9c, 3, 0], [0xb8232a, 1, 0]],
  van: [[0xe0e0dc, 12, 0], [0xa7abaf, 2, 0.7], [0x0b0c0e, 1.5, 0], [0x2d3035, 1, 0.5], [0x264a80, 0.5, 0.5]],
  ambulance: [[0xe8e9e6, 1, 0]],
  fire: [[0xa50f18, 1, 0.25]],
  truck: [[0xe2e2de, 10, 0], [0xb8232a, 1.5, 0.2], [0x1f4f9c, 1.5, 0.3], [0x0b0c0e, 1.2, 0], [0x9da1a5, 1.5, 0.6], [0xe3b52a, 0.6, 0.1], [0x2b6b3e, 0.5, 0.3]],
  lowrider: [[0x8f0c19, 4, 0.85], [0x0f3a8a, 3, 0.85], [0x4a1660, 2.5, 0.85], [0x0b5a33, 2, 0.8], [0xb8600f, 1.5, 0.8], [0x5a2410, 1.2, 0.85],
    [0xe6e2d8, 2.5, 0.4], [0x0a0a0c, 1.5, 0.5], [0x168a86, 1.2, 0.7], [0x7a1a3c, 1, 0.85], [0xc9a227, 0.8, 0.8]],
  limo: [[0x0b0c0e, 6, 0.3], [0xe4e4e0, 3, 0.15], [0xa7abaf, 1, 0.7], [0x1a1c20, 1, 0.6]]
}
// how often a type's cars have a black roof (a lowrider's is white instead: carShapes.js)
const BLACK_ROOF = {
  sedan: 0.1,
  hatch: 0.16,
  suv: 0.14,
  sports: 0.22,
  lowrider: 0.35,
  limo: 0.45
}

// (a lookup from a car's paint draw, 0 to 1, to its colour and finish)
function palette (list) {
  const total = list.reduce((a, p) => a + p[1], 0)
  const out = []
  let k = 0,
    acc = list[0][1]
  for (let i = 0; i < 256; i++) {
    while ((i + 0.5) / 256 > acc / total && k < list.length - 1)
      acc += list[++k][1]
    const c = new THREE.Color(list[k][0])
    // (a black roof only shows on a lighter car)
    out.push({ c, metal: list[k][2], light: c.r + c.g + c.b > 0.08 })
  }
  return out
}
const CAR = palette(CARS)
export function paletteFor (name) {
  return name === 'sports'
    ? palette(SPORTS)
    : FIXED[name]
    ? palette(FIXED[name])
    : CAR
}
export function blackRoofOf (name) {
  return BLACK_ROOF[name] || 0
}

// the rims each type rolls on (the designs in carWheels.js), and how big they are (their share of
// the tyre's radius; a lowrider's wire wheels take in the whitewall tyre's sidewall too, set out
// over it: out, their face's distance out as a share of the tyre's)
// prettier-ignore
export const RIMS = {
  sedan: { kinds: [0, 1, 2, 3], size: 0.72 },
  hatch: { kinds: [0, 1, 3], size: 0.7 },
  suv: { kinds: [0, 1, 7], size: 0.72 },
  taxi: { kinds: [2], size: 0.68 },
  pickup: { kinds: [7, 1], size: 0.66 },
  van: { kinds: [5], size: 0.6 },
  bus: { kinds: [6], size: 0.58 },
  police: { kinds: [4], size: 0.64 },
  sports: { kinds: [1, 3, 0], size: 0.75 },
  ambulance: { kinds: [6], size: 0.6 },
  fire: { kinds: [6], size: 0.6 },
  truck: { kinds: [5], size: 0.58 },
  lowrider: { kinds: [8], size: 0.92, out: 1.07 },
  limo: { kinds: [0, 2], size: 0.7 }
}

// the dark under a car: a rounded rectangle, blurred, darkest in the middle
export function underTexture () {
  const S = 128,
    cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  // (drawn off the canvas, so only its blurred shadow lands on it)
  g.shadowColor = 'rgba(0,0,0,1)'
  g.shadowBlur = 22
  g.shadowOffsetX = S * 2
  g.beginPath()
  g.roundRect(22 - S * 2, 26, S - 44, S - 52, 18)
  g.fill()
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
// a light bar's glow on the road round the car: soft, brightest at the car and gone by its edge
export function glowTexture () {
  const S = 64,
    cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d'),
    grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
// a headlight's throw on the road: a cone, brightest just ahead of the car, widening and fading
// as it goes
export function beamTexture () {
  const W = 128,
    Hh = 64,
    cv = document.createElement('canvas')
  cv.width = W
  cv.height = Hh
  const g = cv.getContext('2d'),
    img = g.createImageData(W, Hh)
  for (let y = 0; y < Hh; y++)
    for (let x = 0; x < W; x++) {
      const u = x / W,
        v = (y + 0.5) / Hh - 0.5,
        wide = 0.06 + 0.36 * u
      const a = Math.pow(1 - u, 1.6) * Math.exp(-(v * v) / (2 * wide * wide))
      const i = (y * W + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      const fade = Math.min(1, a * 1.3) * Math.min(1, u * 12) // (in from the lamp)
      img.data[i + 3] = Math.round(255 * fade)
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
