// What makes each traffic type itself, on top of its trim (carTrim.js): an SUV's roof rails, a shark
// fin aerial on the cars, a pickup's open bed, chrome bumpers and step, a van's and a bus's black
// bumpers, a van's split back doors, a bus's glass doors, the fairing over the gas tanks on its roof,
// its engine grille and the bike rack folded up on its nose, a cab's lit roof sign, a police car's
// light bar (red on the driver's side, blue on the other), push bar and spotlight, and a sports
// car's quad exhausts.
import * as THREE from 'three'
import { lerp, sideAt } from './carBody.js'
import {
  LAMP,
  LENS,
  BLACK,
  GLOSS,
  CHROME,
  box,
  piece,
  rounded
} from './carParts.js'

const LINER = 0x18191b

// put(geometry, colour, lamp tag) adds a trim piece; glass: pieces of glass
export function extras (T, B, st, put, glass) {
  const { L, W } = B
  const name = T.name
  if (name === 'suv') {
    // roof rails, on feet
    const y = lerp(B.railY(0), B.top(0), B.edgeUp)
    const z = B.roofW - B.edgeIn * 0.6
    for (const s of [-1, 1]) {
      put(
        box(
          B.dTop + 0.1,
          y + 0.035,
          s * z - 0.018,
          B.rf - 0.1,
          y + 0.062,
          s * z + 0.018
        ),
        GLOSS,
        LAMP.gloss
      )
      for (const x of [B.dTop + 0.12, B.rf - 0.14])
        put(
          box(
            x - 0.04,
            y - 0.01,
            s * z - 0.02,
            x + 0.04,
            y + 0.04,
            s * z + 0.02
          ),
          GLOSS,
          LAMP.gloss
        )
    }
  }
  if (name !== 'bus' && name !== 'van' && name !== 'pickup') {
    // the shark fin aerial
    const x = Math.max(B.rr, B.dTop) + 0.18,
      y = B.top(x)
    const fin = new THREE.ConeGeometry(0.035, 0.12, 4)
      .rotateZ(Math.PI / 2)
      .scale(1, 0.5, 0.7)
      .translate(x, y + 0.025, 0)
    put(fin, GLOSS, LAMP.gloss)
  }
  if (name === 'pickup') pickup(B, put)
  if (name === 'van' || name === 'bus') {
    // black bumpers
    const y = B.bot(L) + 0.02
    put(box(L - 0.1, y, -W * 0.86, L + 0.07, y + 0.22, W * 0.86), 0x1b1c1f)
    put(
      box(-L - 0.07, y + 0.04, -W * 0.9, -L + 0.08, y + 0.26, W * 0.9),
      0x1b1c1f
    )
  }
  if (name === 'van') {
    // the back doors, split down the middle, with their windows
    for (const s of [-1, 1])
      glass.push(
        box(
          -L - 0.006,
          1.45,
          s > 0 ? 0.06 : -(W - 0.22),
          -L + 0.004,
          2.25,
          s > 0 ? W - 0.22 : -0.06
        )
      )
    const split = rounded(0.012, 2.0, 0.004, 1),
      foot = rounded(1.6, 0.01, 0.004, 1)
    put(piece(split, 'x-', -L - 0.004, 1.55, 0, 0x070809))
    put(piece(foot, 'x-', -L - 0.004, 0.56, 0, 0x070809))
  }
  if (name === 'bus') bus(B, put, glass)
  if (name === 'taxi') {
    // the roof sign: lit front and back
    const x = -0.32,
      y = B.top(x)
    put(box(x - 0.11, y - 0.01, -0.29, x + 0.11, y + 0.025, 0.29), BLACK)
    put(
      box(x - 0.09, y + 0.025, -0.27, x + 0.09, y + 0.165, 0.27),
      LENS[LAMP.taxi],
      LAMP.taxi
    )
    put(box(x - 0.095, y + 0.15, -0.275, x + 0.095, y + 0.175, 0.275), 0xf2b705)
  }
  if (name === 'police') police(B, st, put)
  if (name === 'sports')
    // twin exhausts each side, under the tail
    for (const s of [-1, 1])
      for (const z of [0.42, 0.52]) {
        const pipe = new THREE.CylinderGeometry(0.038, 0.038, 0.12, 10, 1, true)
          .rotateZ(Math.PI / 2)
          .translate(-L + 0.03, 0.3, s * z)
        put(pipe, CHROME, LAMP.chrome)
      }
}

// a pickup's open bed (black liner, rail caps), a step bumper and a chrome front bumper
function pickup (B, put) {
  const { L, W } = B
  const f = B.bedFloor,
    x0 = -L + 0.05,
    x1 = B.rw - 0.02,
    zi = W - 0.14
  const rail = B.belt(-1.8)
  put(box(x0, f - 0.04, -zi, x1, f, zi), LINER)
  for (const s of [-1, 1]) {
    put(
      box(
        x0,
        f,
        s > 0 ? zi - 0.02 : -zi,
        x1,
        rail - 0.005,
        s > 0 ? zi : -zi + 0.02
      ),
      LINER
    )
    put(
      box(
        x0 - 0.02,
        rail - 0.01,
        s > 0 ? zi - 0.025 : -(W - 0.075),
        x1,
        rail + 0.022,
        s > 0 ? W - 0.075 : -zi + 0.025
      ),
      0x101113
    )
  }
  put(box(x1 - 0.03, f, -zi, x1, B.top(B.rw) - 0.01, zi), LINER)
  put(box(x0, f, -zi, x0 + 0.03, rail - 0.005, zi), LINER)
  put(
    box(L - 0.12, 0.4, -W * 0.8, L + 0.07, 0.64, W * 0.8),
    CHROME,
    LAMP.chrome
  )
  put(
    box(-L - 0.08, 0.46, -W * 0.86, -L + 0.06, 0.66, W * 0.86),
    CHROME,
    LAMP.chrome
  )
  put(box(-L - 0.1, 0.62, -0.25, -L + 0.02, 0.665, 0.25), 0x1b1c1f)
}

// a city bus: its doors (glass panels framed in black, on the kerb side), the fairing over the gas
// tanks on its roof, the engine's grille low on its back, and the bike rack folded up on its nose
function bus (B, put, glass) {
  const { L, W } = B
  for (const [x0, x1] of [
    [4.45, 5.4],
    [-0.15, 1.05]
  ]) {
    const xm = (x0 + x1) / 2
    glass.push(box(x0, 0.36, W - 0.01, x1, 2.42, W + 0.01))
    put(box(x0 - 0.04, 0.34, W - 0.012, x0, 2.44, W + 0.014), BLACK)
    put(box(x1, 0.34, W - 0.012, x1 + 0.04, 2.44, W + 0.014), BLACK)
    put(box(xm - 0.02, 0.34, W - 0.012, xm + 0.02, 2.44, W + 0.014), BLACK)
    put(box(x0, 2.42, W - 0.012, x1, 2.46, W + 0.014), BLACK)
  }
  put(box(-1.3, 3.0, -0.98, 4.6, 3.3, 0.98), 0xe6e8e8)
  put(box(4.6, 3.0, -0.92, 4.9, 3.2, 0.92), 0xe6e8e8)
  put(piece(rounded(1.5, 0.5, 0.04), 'x-', -L - 0.006, 0.95, 0, 0x101113))
  for (const y of [0.8, 0.9, 1.0, 1.1]) {
    const slat = rounded(1.42, 0.025, 0.01, 1)
    put(piece(slat, 'x-', -L - 0.01, y, 0, 0x2a2c30))
  }
  for (const z of [-0.42, 0.42])
    put(box(L + 0.02, 0.45, z - 0.02, L + 0.06, 1.0, z + 0.02), 0x1a1b1d)
  put(box(L + 0.02, 0.96, -0.44, L + 0.06, 1.0, 0.44), 0x1a1b1d)
  put(box(L + 0.02, 0.45, -0.5, L + 0.12, 0.5, 0.5), 0x1a1b1d)
}

// a police car's light bar (red on the driver's side, blue on the other), push bar and spotlight
function police (B, st, put) {
  const x = 0.0,
    y = B.top(x) + 0.03
  put(box(x - 0.13, y - 0.035, -0.5, x + 0.13, y, 0.5), BLACK)
  const red = box(x - 0.11, y, -0.62, x + 0.11, y + 0.075, -0.06),
    blue = box(x - 0.11, y, 0.06, x + 0.11, y + 0.075, 0.62)
  put(red, LENS[LAMP.barRed], LAMP.barRed)
  put(blue, LENS[LAMP.barBlue], LAMP.barBlue)
  put(box(x - 0.1, y, -0.06, x + 0.1, y + 0.07, 0.06), 0xd8dadc)
  const { L } = B
  for (const z of [-0.3, 0.3])
    put(box(L + 0.04, 0.42, z - 0.025, L + 0.1, 0.92, z + 0.025), 0x0b0b0c)
  for (const y0 of [0.5, 0.86])
    put(box(L + 0.06, y0, -0.36, L + 0.11, y0 + 0.05, 0.36), 0x0b0b0c)
  const sx = B.ws - 0.08,
    sy = B.belt(sx)
  const lamp = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8)
    .rotateZ(Math.PI / 2)
    .translate(sx, sy + 0.09, -(sideAt(st, sx, sy - 0.02) + 0.02))
  put(lamp, CHROME, LAMP.chrome)
}
