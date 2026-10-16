// The Roadster's cabin, seen through the glass and the open doors and from the driver's seat (the
// Cockpit camera): a black tub with two bucket seats, the console between them, dark linings behind
// the doors, the dash under the windshield with a touchscreen on it (the speed, the drive selector,
// power and regen, and a map of the streets round the car, turning with it), and the yoke, which
// turns with the steering, Optimus's hands going round with its grips.
import * as THREE from 'three'
import { MAT } from './scene.js'
import { ROADS, ROAD_HW } from '../sim/city.js'
import { ANKLE_UP, poseOptimus } from './optimus.js'

// The yoke, its grips either side of the hub, and the driver: Optimus sat back in the bucket seat, feet
// on the floor and hands round the grips
export const YOKE = [-0.02, 0.7, -0.36]
export const DRIVER = {
  root: [-0.44, 0.33, -0.36],
  lean: -0.26,
  nod: 0.2,
  feet: [-0.13, 0.13].map(dz => ({
    at: [0.38, 0.165 + ANKLE_UP, YOKE[2] + dz]
  })),
  hands: [-0.18, 0.18].map(dz => ({ at: [YOKE[0], YOKE[1], YOKE[2] + dz] }))
}
const GRIP = 0.18 // each grip's distance from the hub
const RAKE = -0.2 // the yoke leans this far forward (rad)
// steer-by-wire: the yoke turns this far (rad) for the road wheels' full lock (0.6 rad), a little
// under half a turn either way
const YOKE_TURN = 2.4 / 0.6

const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// the touchscreen: a canvas redrawn a few times a second
const SW = 512,
  SH = 288
function screenTexture () {
  const cv = document.createElement('canvas')
  cv.width = SW
  cv.height = SH
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return { cv, g: cv.getContext('2d'), t }
}
function drawScreen (S, sim) {
  const g = S.g
  g.fillStyle = '#0b0c0f'
  g.fillRect(0, 0, SW, SH)
  // the map, the car's heading up: the street grid round it, the car a white arrow in the middle
  const cx = 360,
    cy = 150,
    k = 0.9 // px per m
  g.save()
  g.beginPath()
  g.rect(212, 14, 286, 260)
  g.clip()
  g.fillStyle = '#1a1f27'
  g.fillRect(212, 14, 286, 260)
  g.translate(cx, cy)
  g.rotate(sim.yaw - Math.PI / 2)
  g.fillStyle = '#3a4352'
  const x = sim.pos.x,
    z = sim.pos.z,
    w = ROAD_HW * 2 * k
  for (const r of ROADS) {
    g.fillRect((r - x) * k - w / 2, -400, w, 800) // roads along z
    g.fillRect(-400, (r - z) * k - w / 2, 800, w) // and along x
  }
  g.restore()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(cx, cy - 11)
  g.lineTo(cx + 7, cy + 8)
  g.lineTo(cx, cy + 4)
  g.lineTo(cx - 7, cy + 8)
  g.closePath()
  g.fill()
  // the speed and the drive selector
  const kmh = Math.round(Math.abs(sim.groundSpeed()) * 3.6)
  g.fillStyle = '#f2f3f5'
  g.textAlign = 'center'
  g.font = '600 92px "Saira Semi Condensed", sans-serif'
  g.fillText(String(kmh), 104, 128)
  g.font = '500 20px "JetBrains Mono", monospace'
  g.fillStyle = '#8b9099'
  g.fillText('km/h', 104, 156)
  const gear = sim.speed < -0.3 ? 'R' : 'D'
  'PRND'.split('').forEach((c, i) => {
    g.fillStyle = c === gear ? '#f2f3f5' : '#4b4f57'
    g.font = `${c === gear ? 700 : 500} 24px "Saira Semi Condensed", sans-serif`
    g.fillText(c, 50 + i * 36, 206)
  })
  // power out (gold) and regen back (green), from the middle of the bar
  const kw = (sim.drivePower || 0) / 1000
  g.fillStyle = '#25282e'
  g.fillRect(24, 236, 160, 6)
  const f = Math.max(-1, Math.min(1, kw / (kw >= 0 ? 1150 : 250)))
  g.fillStyle = f >= 0 ? '#d6a84e' : '#4fd08a'
  g.fillRect(f >= 0 ? 104 : 104 + f * 80, 236, Math.abs(f) * 80, 6)
  S.t.needsUpdate = true
}

// The cabin, built into the body. Returns what moves in it: { yoke, screen }.
export function buildCabin (body) {
  const dark = new THREE.MeshStandardMaterial({
    color: 0x18191c,
    roughness: 0.8
  })
  const seat = new THREE.MeshStandardMaterial({
    color: 0x2a2b2f,
    roughness: 0.6
  })
  const dash = new THREE.MeshStandardMaterial({
    color: 0x26272b,
    roughness: 0.55
  })
  const glow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.55, 0.7, 0.95)
  })
  const add = (w, h, d, mat, x, y, z, rz = 0) => {
    const m = box(w, h, d, mat, x, y, z)
    m.rotation.z = rz
    body.add(m)
  }
  add(2.1, 0.03, 1.64, dark, 0.1, 0.15, 0) // floor
  for (const sg of [-1, 1]) {
    add(1.16, 0.2, 0.1, dark, 0.27, 0.24, sg * 0.84) // the sill under the door
    add(0.5, 0.07, 0.48, seat, -0.32, 0.205, sg * 0.36) // seat base
    add(0.11, 0.66, 0.46, seat, -0.66, 0.56, sg * 0.36, 0.3) // backrest
    add(0.12, 0.08, 0.3, seat, -0.84, 0.92, sg * 0.36, 0.3) // head rest
    add(0.64, 0.72, 0.04, dark, -0.62, 0.525, sg * 0.86) // lining behind the door
  }
  add(1.2, 0.2, 0.22, dark, 0.05, 0.26, 0) // console
  add(0.08, 0.85, 1.64, dark, -0.98, 0.55, 0) // bulkhead behind the seats
  // the dash: soft-touch on top, a thin line of light across its face
  add(0.55, 0.16, 1.56, dash, 0.92, 0.6, 0)
  add(0.006, 0.006, 1.4, glow, 0.643, 0.63, 0)
  // the yoke, open at the top, its rim leaning a little forward, on a hub and a column that runs
  // down into the dash; spin turns it about the column
  const yoke = new THREE.Group()
  yoke.position.set(...YOKE)
  yoke.rotation.z = RAKE
  const spin = new THREE.Group()
  yoke.add(spin)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.018, 8, 24, Math.PI * 1.2),
    MAT.trim
  )
  rim.rotation.set(0, Math.PI / 2, Math.PI * 0.9, 'YXZ')
  spin.add(rim, box(0.03, 0.03, 0.28, MAT.trim, 0.01, 0, 0))
  spin.add(box(0.05, 0.08, 0.1, dark, 0.03, 0, 0))
  body.add(yoke)
  const col = [0.645 - YOKE[0], 0.58 - YOKE[1]]
  add(
    Math.hypot(...col),
    0.05,
    0.05,
    dark,
    YOKE[0] + col[0] / 2,
    YOKE[1] + col[1] / 2,
    YOKE[2],
    Math.atan2(col[1], col[0])
  )
  // the touchscreen, landscape, standing up off the middle of the dash and leaning back
  const S = screenTexture()
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.2),
    new THREE.MeshBasicMaterial({ map: S.t, color: 0xdddddd })
  )
  screen.rotation.set(0, -Math.PI / 2, 0)
  screen.rotateX(-0.3)
  screen.position.set(0.7, 0.8, 0)
  const bezel = box(0.02, 0.215, 0.375, dark, 0.712, 0.8, 0)
  bezel.rotation.z = -0.3
  body.add(bezel, screen)
  return { yoke: spin, screen: S, angle: 0, look: 0, posed: null, t: 0 }
}

// Each frame: the yoke turned to the steering, the driver's hands round its grips and head into the
// turn (once Optimus is sat at it: seated), and the screen redrawn now and then.
const _h = [0, 0, 0]
export function updateCabin (C, O, sim, seated, dt) {
  const a = -sim.steerAng * YOKE_TURN
  C.angle += (a - C.angle) * Math.min(1, dt * 20)
  C.yoke.rotation.x = C.angle
  C.look += (sim.steerAng * 1.4 - C.look) * Math.min(1, dt * 4)
  if (
    seated &&
    (!C.posed ||
      Math.abs(C.posed[0] - C.angle) > 0.003 ||
      Math.abs(C.posed[1] - C.look) > 0.003)
  ) {
    // each grip round the column (the yoke's x axis, raked forward)
    const hands = [-1, 1].map(sg => {
      const y = -sg * GRIP * Math.sin(C.angle),
        z = sg * GRIP * Math.cos(C.angle)
      _h[0] = YOKE[0] - y * Math.sin(RAKE)
      _h[1] = YOKE[1] + y * Math.cos(RAKE)
      _h[2] = YOKE[2] + z
      return { at: [..._h] }
    })
    poseOptimus(O, { ...DRIVER, hands, look: C.look })
    C.posed = [C.angle, C.look]
  }
  if ((C.t -= dt) < 0) {
    C.t = 0.12
    drawScreen(C.screen, sim)
  }
}
