// Wheels and wheel wells: arch openings cut into the body shell with dark well liners, tyres with
// rounded sidewalls and recessed aero rims, Ackermann steering, free-spinning wheels in the air
// and a motion-blur disc so fast spokes don't strobe.
import * as THREE from 'three'
import { MAT } from './scene.js'
import { CAR, clamp } from '../sim/constants.js'

export const ARCH_R = 0.41 // arch opening radius around each axle (tyre radius 0.36)
const WELL_IN = 0.5 // inner wall of the wheel well, from the centre line
const HALF_TRACK = 0.87 // wheel centre from the centre line
const BODY_SIDE = 0.995 // outer skin of the body at the wheels
const lerpK = (k, dt) => 1 - Math.exp(-k * dt)

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

// Tyre cross-section (radius, axial offset), revolved: bead, rounded shoulder, flat tread.
const TYRE_PROFILE = [
  [0.252, -0.128],
  [0.29, -0.147],
  [0.33, -0.15],
  [0.35, -0.142],
  [0.358, -0.125],
  [0.36, -0.1],
  [0.36, 0.1],
  [0.358, 0.125],
  [0.35, 0.142],
  [0.33, 0.15],
  [0.29, 0.147],
  [0.252, 0.128]
].map(([r, y]) => new THREE.Vector2(r, y))

const liner = new THREE.MeshStandardMaterial({
  color: 0x0a0b0d,
  roughness: 0.95,
  side: THREE.DoubleSide
})
const blurMat = () =>
  new THREE.MeshBasicMaterial({
    color: 0x34373d,
    transparent: true,
    opacity: 0,
    depthWrite: false
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
    0.253,
    0.253,
    0.25,
    28,
    1,
    true
  ).rotateX(Math.PI / 2)
  const faceGeo = new THREE.CylinderGeometry(0.248, 0.248, 0.012, 28).rotateX(
    Math.PI / 2
  )
  const spokeGeo = new THREE.BoxGeometry(0.47, 0.05, 0.022)
  const capGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16).rotateX(
    Math.PI / 2
  )
  const blurGeo = new THREE.CircleGeometry(0.247, 28)
  const axles = {
    front: { rate: 0, angle: 0, blur: blurMat() },
    rear: { rate: 0, angle: 0, blur: blurMat() }
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
      const axle = sx > 0 ? axles.front : axles.rear
      // rim face recessed ~3 cm inside the sidewall on both sides, three-blade aero spokes
      for (const side of [-1, 1]) {
        const face = new THREE.Mesh(faceGeo, MAT.rim)
        face.position.z = side * 0.112
        spin.add(face)
        for (let i = 0; i < 3; i++) {
          const sp = new THREE.Mesh(spokeGeo, MAT.trim)
          sp.rotation.z = (i * Math.PI) / 3
          sp.position.z = side * 0.124
          spin.add(sp)
        }
        const cap = new THREE.Mesh(capGeo, MAT.darkMetal)
        cap.position.z = side * 0.128
        spin.add(cap)
        const blur = new THREE.Mesh(blurGeo, axle.blur)
        blur.position.z = side * 0.137
        if (side < 0) blur.rotation.y = Math.PI
        spin.add(blur)
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
    if (grounded) axle.rate = name === 'rear' && sim.ebrakeOn ? 0 : roll
    else axle.rate *= Math.exp(-0.35 * dt)
    axle.angle += axle.rate * dt
    // above ~70 km/h the spokes blur into a disc instead of strobing
    const blur = clamp((Math.abs(axle.rate) - 20) / 45, 0, 0.88)
    axle.blur.opacity += (blur - axle.blur.opacity) * lerpK(10, dt)
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
