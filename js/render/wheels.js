// Wheels and wheel wells: arch openings cut into the body shell with dark well liners, tyres with
// rounded sidewalls round the reveal car's wheels (six black twin spokes over white aero inserts),
// Ackermann steering and free-spinning wheels in the air.
import * as THREE from 'three'
import { MAT } from './scene.js'
import { CAR } from '../sim/constants.js'

export const ARCH_R = 0.4 // arch opening radius around each axle (tyre radius 0.36)
const WELL_IN = 0.5 // inner wall of the wheel well, from the centre line
const HALF_TRACK = 0.87 // wheel centre from the centre line
const BODY_SIDE = 0.995 // outer skin of the body at the wheels

// A copy of a body material that discards the shell inside each wheel arch, so the wheels sit in
// open wells instead of cutting through the panels when they steer.
export function withWheelArches (mat) {
  const m = mat.clone()
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBodyPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBodyPos = position;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBodyPos;')
      .replace(
        'void main() {',
        `void main() {
  if (abs(vBodyPos.z) > ${WELL_IN.toFixed(3)}) {
    vec2 arch = vec2(abs(vBodyPos.x) - ${CAR.halfWB.toFixed(
      3
    )}, vBodyPos.y - ${CAR.wheelR.toFixed(3)});
    if (dot(arch, arch) < ${(ARCH_R * ARCH_R).toFixed(4)}) discard;
  }`
      )
  }
  m.customProgramCacheKey = () => 'wheel-arches'
  return m
}

// Tyre cross-section (radius, axial offset), revolved: bead, rounded shoulder, flat tread. Low
// profile round a big rim.
const TYRE_PROFILE = [
  [0.285, -0.13],
  [0.305, -0.148],
  [0.33, -0.151],
  [0.35, -0.142],
  [0.358, -0.125],
  [0.36, -0.1],
  [0.36, 0.1],
  [0.358, 0.125],
  [0.35, 0.142],
  [0.33, 0.151],
  [0.305, 0.148],
  [0.285, 0.13]
].map(([r, y]) => new THREE.Vector2(r, y))
const RIM_R = 0.285

// the wheel face: white aero inserts between six black twin spokes, a dark gap down each pair, a
// black lip and centre cap (drawn once, mapped onto each disc)
function faceTexture () {
  const S = 512,
    c = S / 2
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  g.fillStyle = '#121316'
  g.fillRect(0, 0, S, S)
  const gr = g.createRadialGradient(c, c, 40, c, c, c * 0.95)
  gr.addColorStop(0, '#c9ccd0')
  gr.addColorStop(0.6, '#eceef0')
  gr.addColorStop(1, '#d9dce0')
  g.fillStyle = gr
  g.beginPath()
  g.arc(c, c, c * 0.93, 0, Math.PI * 2)
  g.fill()
  const at = (a, r) => [c + Math.cos(a) * r, c + Math.sin(a) * r]
  const wedge = (a0, a1, b0, b1, r0, r1, fill) => {
    g.fillStyle = fill
    g.beginPath()
    g.moveTo(...at(a0, r0))
    g.lineTo(...at(b0, r1))
    g.lineTo(...at(b1, r1))
    g.lineTo(...at(a1, r0))
    g.closePath()
    g.fill()
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    // the pair: one black blade narrow at the hub, fanning out to the rim, with a slot down its middle
    wedge(a - 0.09, a + 0.09, a - 0.2, a + 0.2, c * 0.2, c * 0.95, '#141518')
    wedge(a - 0.02, a + 0.02, a - 0.08, a + 0.08, c * 0.34, c * 0.9, '#050506')
    // a machined edge catching the light on one side of each blade
    wedge(a + 0.075, a + 0.09, a + 0.18, a + 0.2, c * 0.22, c * 0.93, '#4a4e55')
  }
  g.fillStyle = '#0d0e10'
  g.beginPath()
  g.arc(c, c, c * 0.2, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#2b2e33'
  g.lineWidth = 6
  g.stroke()
  g.fillStyle = '#9a9ea5' // the T on the centre cap
  g.fillRect(c - 22, c - 20, 44, 8)
  g.fillRect(c - 4, c - 14, 8, 36)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const liner = new THREE.MeshStandardMaterial({
  color: 0x0a0b0d,
  roughness: 0.95,
  side: THREE.DoubleSide
})
// the dark tub behind each arch: a curved roof that meets the arch cut, plus the inner wall
function wheelWell (x, sz) {
  const g = new THREE.Group()
  const depth = BODY_SIDE - WELL_IN
  // the floor sits 0.24 m below the axle: the well opens downward from there
  const floorAng = Math.acos((CAR.wheelR - 0.12) / ARCH_R)
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(
      ARCH_R,
      ARCH_R,
      depth,
      32,
      1,
      true,
      floorAng,
      Math.PI * 2 - 2 * floorAng
    ).rotateX(Math.PI / 2),
    liner
  )
  roof.position.z = sz * (WELL_IN + depth / 2)
  const wallAng = Math.asin((CAR.wheelR - 0.12) / ARCH_R)
  const wall = new THREE.Mesh(
    new THREE.CircleGeometry(ARCH_R, 32, -wallAng, Math.PI + 2 * wallAng),
    liner
  )
  wall.position.z = sz * WELL_IN
  g.add(roof, wall)
  g.position.set(x, CAR.wheelR, 0)
  return g
}

export function buildWheels (car, body) {
  const tyreGeo = new THREE.LatheGeometry(TYRE_PROFILE, 36).rotateX(Math.PI / 2)
  const barrelGeo = new THREE.CylinderGeometry(
    RIM_R + 0.002,
    RIM_R + 0.002,
    0.25,
    32,
    1,
    true
  ).rotateX(Math.PI / 2)
  const faceGeo = new THREE.CylinderGeometry(
    RIM_R - 0.004,
    RIM_R - 0.004,
    0.012,
    32
  ).rotateX(Math.PI / 2)
  const lipGeo = new THREE.RingGeometry(RIM_R - 0.014, RIM_R, 32)
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture(),
    roughness: 0.32,
    metalness: 0.25
  })
  const axles = {
    front: { rate: 0, angle: 0 },
    rear: { rate: 0, angle: 0 }
  }
  const wheels = []
  for (const sx of [1, -1]) {
    for (const sz of [-1, 1]) {
      body.add(wheelWell(sx * CAR.halfWB, sz))
      const pivot = new THREE.Group()
      pivot.position.set(sx * CAR.halfWB, CAR.wheelR, sz * HALF_TRACK)
      const spin = new THREE.Group()
      const tyre = new THREE.Mesh(tyreGeo, MAT.tire)
      tyre.castShadow = true
      spin.add(tyre, new THREE.Mesh(barrelGeo, MAT.darkMetal))
      // the wheel face recessed ~3 cm inside the sidewall on both sides, with a dark lip
      for (const side of [-1, 1]) {
        const face = new THREE.Mesh(faceGeo, faceMat)
        face.position.z = side * 0.112
        spin.add(face)
        const ring = new THREE.Mesh(lipGeo, MAT.rim)
        ring.position.z = side * 0.1185
        if (side < 0) ring.rotation.y = Math.PI
        spin.add(ring)
      }
      pivot.add(spin)
      car.add(pivot)
      wheels.push({ pivot, spin, front: sx > 0, side: sz })
    }
  }
  return { wheels, axles }
}

// Roll with the ground when the tyres touch it (rears stop dead on the e-brake), keep spinning and
// slowly run down in the air; steer the fronts with Ackermann geometry.
export function updateWheels (RS, sim, dt) {
  const grounded = sim.mode === 'ground' || sim.mode === 'ramp'
  const roll = (sim.mode === 'ramp' ? sim.v : sim.speed) / CAR.wheelR
  for (const [name, axle] of Object.entries(RS.axles)) {
    if (grounded)
      axle.rate =
        name === 'rear'
          ? sim.ebrakeOn
            ? 0
            : roll + (sim.burnSpin || 0) / CAR.wheelR // (spinning in a burnout)
          : roll
    else axle.rate *= Math.exp(-0.35 * dt)
    axle.angle += axle.rate * dt
  }
  const d = sim.steerAng
  const R = Math.abs(d) > 1e-4 ? CAR.wheelbase / Math.tan(d) : Infinity
  for (const w of RS.wheels) {
    const axle = w.front ? RS.axles.front : RS.axles.rear
    w.spin.rotation.z = -axle.angle
    if (w.front) {
      // inner wheel turns tighter than the outer one (turn centre on the inside of the bend)
      w.pivot.rotation.y =
        R === Infinity
          ? 0
          : Math.atan(CAR.wheelbase / (R + w.side * HALF_TRACK))
    }
  }
}
