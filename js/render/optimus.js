// Optimus, the Roadster's driver: a humanoid robot in gloss white panels over black joints, with a
// black glass face. Built from simple solids on a skeleton of joints (facing +x, up +y, hips at the
// root), posed by blending a walk cycle, a seated pose and hands on the yoke.
import * as THREE from 'three'

const WHITE = new THREE.MeshPhysicalMaterial({
  color: 0xf1f2f3,
  roughness: 0.28,
  metalness: 0.05,
  clearcoat: 0.8,
  clearcoatRoughness: 0.15
})
const BLACK = new THREE.MeshStandardMaterial({
  color: 0x15161a,
  roughness: 0.42,
  metalness: 0.35
})
const VISOR = new THREE.MeshPhysicalMaterial({
  color: 0x050506,
  roughness: 0.04,
  metalness: 0.6,
  clearcoat: 1,
  clearcoatRoughness: 0.02
})
export const HIP_STAND = 0.92 // hip height standing, m
export const HIP_SIT = 0.3 // in the Roadster's seat

const joint = (parent, x, y, z) => {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}
const part = (parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  parent.add(m)
  return m
}
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 12)
const ball = r => new THREE.SphereGeometry(r, 16, 12)

export function buildOptimus () {
  const root = new THREE.Group()
  const hips = joint(root, 0, 0, 0)
  part(
    hips,
    capsule(0.08, 0.14).rotateX(Math.PI / 2),
    WHITE,
    0,
    0.0,
    0,
    0.9,
    0.85,
    1
  )
  // torso: a black waist, a white chest tapering down to it, a black stripe down the front
  const waist = joint(hips, 0, 0.06, 0)
  part(
    waist,
    new THREE.CylinderGeometry(0.085, 0.1, 0.16, 16),
    BLACK,
    0,
    0.1,
    0
  )
  part(
    waist,
    new THREE.CylinderGeometry(0.18, 0.12, 0.32, 20).translate(0, 0, 0),
    WHITE,
    0,
    0.33,
    0,
    0.62,
    1,
    1
  )
  part(
    waist,
    capsule(0.075, 0.26).rotateX(Math.PI / 2),
    WHITE,
    0,
    0.45,
    0,
    1,
    0.8,
    1
  )
  part(waist, new THREE.BoxGeometry(0.02, 0.2, 0.05), BLACK, 0.112, 0.33, 0)
  part(
    waist,
    new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12),
    BLACK,
    0,
    0.53,
    0
  )
  const head = joint(waist, 0, 0.62, 0)
  part(head, ball(0.105), WHITE, -0.01, 0, 0, 1, 1.12, 0.95)
  // the face: the front of the head in black glass
  part(
    head,
    new THREE.SphereGeometry(
      0.108,
      20,
      14,
      Math.PI - Math.PI / 2.4,
      Math.PI / 1.2,
      0.5,
      1.75
    ),
    VISOR,
    -0.005,
    0,
    0,
    1,
    1.1,
    0.93
  )
  const arms = [],
    legs = []
  for (const s of [-1, 1]) {
    const sh = joint(waist, 0, 0.44, s * 0.2)
    part(sh, ball(0.058), WHITE, 0, 0, 0)
    part(sh, capsule(0.04, 0.18), WHITE, 0, -0.14, 0)
    const el = joint(sh, 0, -0.28, 0)
    part(el, ball(0.042), BLACK, 0, 0, 0)
    part(el, capsule(0.035, 0.17), BLACK, 0, -0.12, 0)
    part(el, capsule(0.038, 0.08), WHITE, 0, -0.08, 0)
    const hand = joint(el, 0, -0.26, 0)
    part(hand, new THREE.BoxGeometry(0.07, 0.11, 0.035), BLACK, 0, -0.04, 0)
    arms.push({ sh, el, hand, s })
    const hip = joint(hips, 0, -0.02, s * 0.1)
    part(hip, capsule(0.058, 0.27), WHITE, 0, -0.2, 0)
    const kn = joint(hip, 0, -0.42, 0)
    part(kn, ball(0.047), BLACK, 0, 0, 0)
    part(kn, capsule(0.047, 0.28), WHITE, 0.01, -0.2, 0)
    part(kn, capsule(0.034, 0.24), BLACK, -0.03, -0.2, 0)
    const ank = joint(kn, 0, -0.43, 0)
    part(ank, new THREE.BoxGeometry(0.21, 0.055, 0.09), BLACK, 0.045, -0.032, 0)
    legs.push({ hip, kn, ank, s })
  }
  return { root, hips, waist, head, arms, legs, phase: 0 }
}

const mix = (a, b, t) => a + (b - a) * t

// Pose: walk (0-1, how much of the walk cycle shows), phase (radians through the stride), sit (0-1),
// drive (0-1, hands up on the yoke), duck (0-1, leaning in under the door frame), look (head yaw).
export function poseOptimus (
  O,
  { walk = 0, phase = 0, sit = 0, drive = 0, duck = 0, look = 0 }
) {
  const sw = Math.sin(phase)
  for (const L of O.legs) {
    // the legs half a stride apart: each swings forward with the knee bent, then plants and pushes
    // back straight, the foot kept flat on the ground
    const p = phase + (L.s < 0 ? 0 : Math.PI)
    const wHip = 0.36 * Math.sin(p),
      wKnee =
        -0.75 *
        Math.max(0, Math.cos(p)) *
        (0.4 + 0.6 * Math.max(0, Math.sin(p) + 0.3))
    L.hip.rotation.z = mix(wHip * walk, 1.5, sit)
    L.kn.rotation.z = mix(wKnee * walk, -1.45, sit)
    L.ank.rotation.z = mix(-(wHip + wKnee) * 0.85 * walk, -0.05, sit)
    L.hip.rotation.x = L.s * 0.04 * sit // knees a little apart
  }
  for (const A of O.arms) {
    const k = A.s < 0 ? -sw : sw
    const swing = 0.32 * k * walk
    A.sh.rotation.z = mix(mix(swing, 0.25, sit), 1.18, drive)
    A.el.rotation.z = mix(
      mix(0.25 + 0.2 * Math.max(0, k) * walk, 0.5, sit),
      0.36,
      drive
    )
    A.sh.rotation.x = A.s * mix(0.08, 0.16, drive)
    A.hand.rotation.x = A.s * 0.3 * drive
  }
  O.waist.rotation.z = mix(-0.05 * walk, 0.12, sit) - 0.45 * duck
  O.head.rotation.y = look
  O.head.rotation.z = 0.15 * duck
  // a small bob up and down with each step
  O.hips.position.y = walk * 0.025 * Math.abs(Math.cos(phase))
}
