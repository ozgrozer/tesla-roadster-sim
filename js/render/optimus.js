// Optimus, the Roadster's driver, after the Gen 2 robot: satin white shells over black actuators, a
// gloss black egg of a head ringed in cyan, a black yoke across the shoulders, a boxy chest over a
// black belly, ribbed elbow pads, black shin actuators and jointed silver hands. Built on a skeleton
// of joints (facing +x, up +y, hips at the root), each joint's parts merged into one mesh per
// material, and posed by a walk cycle or by reaching its feet and hands for given points.
import * as THREE from 'three'
import { merge } from './geo.js'
import { creaseNormals } from './loft.js'

const WHITE = new THREE.MeshPhysicalMaterial({
  color: 0xd8dadd,
  roughness: 0.4,
  metalness: 0.15,
  clearcoat: 0.35,
  clearcoatRoughness: 0.3
})
const BLACK = new THREE.MeshStandardMaterial({
  color: 0x18191c,
  roughness: 0.5,
  metalness: 0.3
})
// the exposed mechanism at the waist, hips and wrists
const GUNMETAL = new THREE.MeshStandardMaterial({
  color: 0x3b3e44,
  roughness: 0.5,
  metalness: 0.8
})
const SILVER = new THREE.MeshStandardMaterial({
  color: 0xb9bcc1,
  roughness: 0.3,
  metalness: 0.85
})
const VISOR = new THREE.MeshPhysicalMaterial({
  color: 0x060608,
  roughness: 0.05,
  metalness: 0.5,
  clearcoat: 1,
  clearcoatRoughness: 0.03
})
const GLOW = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0.3, 1.45, 2.1),
  toneMapped: false
})
export const HIP_STAND = 0.93 // hip height standing, m

// A solid swept up y through rings [y, back x, front x, half width (z), power?]: each a rounded
// square (a superellipse, 2 an ellipse and higher squarer), the ends capped flat. Normals smooth
// round the section and crease where rings step in, so a bevel reads as a crisp panel edge.
function pod (rings, n = 4, seg = 24, crease = 40) {
  const pts = rings.map(([y, xb, xf, w, p = n]) => {
    const cx = (xb + xf) / 2,
      d = (xf - xb) / 2,
      out = []
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a)
      out.push([
        cx + d * Math.sign(c) * Math.abs(c) ** (2 / p),
        y,
        w * Math.sign(s) * Math.abs(s) ** (2 / p)
      ])
    }
    return out
  })
  const v = []
  for (let k = 0; k < pts.length - 1; k++)
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg
      const A = pts[k][i],
        B = pts[k][j],
        C = pts[k + 1][i],
        D = pts[k + 1][j]
      v.push(...A, ...C, ...B, ...B, ...C, ...D)
    }
  for (const [R, up] of [
    [pts[0], false],
    [pts[pts.length - 1], true]
  ]) {
    const O = [
      R.reduce((s, p) => s + p[0], 0) / seg,
      R[0][1],
      R.reduce((s, p) => s + p[2], 0) / seg
    ]
    for (let i = 0; i < seg; i++) {
      const P = R[i],
        Q = R[(i + 1) % seg]
      if (up) v.push(...O, ...Q, ...P)
      else v.push(...O, ...P, ...Q)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return creaseNormals(g, crease)
}

// an egg up y, `h` tall, half depth `d` and half width `w` at its widest, fuller at the top, with
// the lower half pushed forward by `jut`
function egg (h, d, w, jut = 0) {
  const rings = []
  for (let i = 0; i <= 14; i++) {
    const t = -0.9 + (1.9 * i) / 14,
      r = Math.sqrt(Math.max(0.0004, 1 - t * t)) * (1 + 0.08 * t),
      x = jut * Math.max(0, -t)
    rings.push([(t * h) / 2, x - d * r, x + d * r, w * r])
  }
  return pod(rings, 2.2, 28, 60)
}

const cyl = (r, len, n = 16) => new THREE.CylinderGeometry(r, r, len, n)
// a cylinder lying along z (a joint's axle) or x
const axle = (r, len, n) => cyl(r, len, n).rotateX(Math.PI / 2)
const along = (r, len, n) => cyl(r, len, n).rotateZ(Math.PI / 2)

export function buildOptimus () {
  const parts = [] // [joint, material, geometry], merged per joint and material at the end
  const put = (j, mat, geo) => parts.push([j, mat, geo])
  const joint = (parent, x, y, z) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }

  const root = new THREE.Group()
  const hips = joint(root, 0, 0, 0)
  // pelvis: a black block between the legs, round actuators ahead of each hip, a gunmetal bar
  // across under the waist
  put(
    hips,
    BLACK,
    pod([
      [-0.075, -0.05, 0.05, 0.035],
      [-0.05, -0.075, 0.075, 0.07],
      [0.04, -0.085, 0.085, 0.085],
      [0.065, -0.07, 0.07, 0.07]
    ])
  )
  put(
    hips,
    GUNMETAL,
    new THREE.BoxGeometry(0.12, 0.05, 0.3).translate(0, 0.03, 0)
  )
  for (const s of [-1, 1]) {
    put(hips, BLACK, along(0.047, 0.15, 20).translate(0.008, 0.0, s * 0.1))
    put(hips, GUNMETAL, along(0.022, 0.01, 16).translate(0.085, 0.0, s * 0.1))
  }

  // torso: a gunmetal spine at the waist, the black belly, the white chest and the black yoke over
  // the shoulders, a black neck
  const waist = joint(hips, 0, 0.06, 0)
  put(
    waist,
    GUNMETAL,
    new THREE.BoxGeometry(0.1, 0.12, 0.09).translate(-0.01, 0.02, 0)
  )
  put(waist, BLACK, axle(0.045, 0.16, 18))
  for (const s of [-1, 1])
    put(waist, GUNMETAL, cyl(0.012, 0.11).translate(-0.045, 0.04, s * 0.045))
  put(
    waist,
    BLACK,
    pod([
      [0.055, -0.07, 0.07, 0.08],
      [0.08, -0.09, 0.095, 0.105],
      [0.155, -0.1, 0.105, 0.118]
    ])
  )
  put(
    waist,
    WHITE,
    pod(
      [
        [0.14, -0.088, 0.09, 0.118],
        [0.175, -0.105, 0.115, 0.148],
        [0.3, -0.112, 0.124, 0.165],
        [0.42, -0.112, 0.122, 0.17],
        [0.465, -0.104, 0.114, 0.164],
        [0.485, -0.09, 0.1, 0.15]
      ],
      5
    )
  )
  put(
    waist,
    BLACK,
    pod(
      [
        [0.452, -0.113, 0.123, 0.196],
        [0.465, -0.115, 0.125, 0.2],
        [0.478, -0.11, 0.119, 0.19],
        [0.505, -0.085, 0.09, 0.13],
        [0.53, -0.06, 0.06, 0.07],
        [0.545, -0.045, 0.045, 0.045]
      ],
      4,
      28
    )
  )
  put(waist, BLACK, cyl(0.028, 0.1).translate(-0.005, 0.58, 0))
  // the wordmark across the top of the chest
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 48
  const g2 = cv.getContext('2d')
  g2.font = '600 38px "Arial Narrow", Arial, sans-serif'
  g2.textAlign = 'center'
  g2.textBaseline = 'middle'
  g2.fillStyle = '#4a4d53'
  g2.fillText('T  E  S  L  A', 256, 26)
  const mark = new THREE.CanvasTexture(cv)
  mark.colorSpace = THREE.SRGBColorSpace
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.014).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: mark, transparent: true })
  )
  badge.position.set(0.1232, 0.425, 0)
  waist.add(badge)

  // head: a gloss black egg, the face ringed from temple to temple under the chin in cyan
  const head = joint(waist, 0, 0.62, 0)
  put(head, VISOR, egg(0.18, 0.086, 0.069, 0.01).translate(-0.008, 0.042, 0))
  const arc = (Math.PI * 4) / 3
  put(
    head,
    GLOW,
    new THREE.TorusGeometry(1, 0.045, 5, 40, arc)
      .rotateZ(-Math.PI / 2 - arc / 2)
      .rotateY(Math.PI / 2)
      .scale(0.07, 0.083, 0.068)
      .rotateZ(-0.38)
      .translate(0.016, 0.036, 0)
  )

  const arms = [],
    legs = []
  for (const s of [-1, 1]) {
    // arm: a black shoulder actuator, a long white upper arm, a ribbed black pad on the outside of
    // the elbow, a white forearm shell over black, a gunmetal wrist
    const sh = joint(waist, 0, 0.44, s * 0.215)
    put(sh, BLACK, axle(0.04, 0.07, 18))
    put(
      sh,
      WHITE,
      pod([
        [-0.25, -0.036, 0.036, 0.036],
        [-0.225, -0.046, 0.046, 0.045],
        [-0.1, -0.05, 0.05, 0.05],
        [-0.02, -0.054, 0.054, 0.054],
        [0.02, -0.052, 0.052, 0.052, 3],
        [0.042, -0.03, 0.03, 0.03, 3]
      ])
    )
    const el = joint(sh, 0, -0.28, 0)
    put(el, BLACK, axle(0.032, 0.08, 18))
    for (let i = 0; i < 6; i++) {
      const y = 0.045 - i * 0.017,
        h = 1 - Math.abs(i - 2.5) / 4.5
      put(
        el,
        BLACK,
        pod(
          [
            [y - 0.0055, -0.034 * h, 0.034 * h, 0.012],
            [y + 0.0055, -0.034 * h, 0.034 * h, 0.012]
          ],
          3,
          16
        ).translate(-0.004, 0, s * 0.04)
      )
    }
    put(
      el,
      BLACK,
      pod([
        [-0.235, -0.028, 0.026, 0.028],
        [-0.04, -0.036, 0.032, 0.036]
      ])
    )
    put(
      el,
      WHITE,
      pod([
        [-0.2, -0.034, 0.03, 0.036],
        [-0.185, -0.039, 0.036, 0.041],
        [-0.07, -0.046, 0.042, 0.047],
        [-0.05, -0.042, 0.038, 0.043]
      ]).translate(0, 0, s * 0.006)
    )
    put(
      el,
      GUNMETAL,
      new THREE.BoxGeometry(0.04, 0.04, 0.045).translate(0, -0.24, 0)
    )
    // hand: a silver back over a black palm, four fingers curled in towards the body and the thumb
    // on the front edge
    const hand = joint(el, 0, -0.26, 0)
    put(
      hand,
      SILVER,
      pod([
        [-0.088, -0.038, 0.04, 0.013],
        [-0.015, -0.036, 0.038, 0.016],
        [0.005, -0.022, 0.022, 0.014]
      ]).translate(0, 0, s * 0.004)
    )
    put(
      hand,
      BLACK,
      new THREE.BoxGeometry(0.07, 0.072, 0.016).translate(0, -0.05, -s * 0.009)
    )
    const m4 = new THREE.Matrix4(),
      bend = new THREE.Matrix4()
    for (let f = 0; f < 4; f++) {
      const x = 0.027 - f * 0.018,
        len = [0.03, 0.025, 0.02].map(l => l * (f === 3 ? 0.8 : 1))
      m4.makeTranslation(x, -0.09, 0)
      len.forEach((l, k) => {
        m4.multiply(bend.makeRotationX(s * (0.16 + 0.1 * k)))
        put(hand, BLACK, axle(0.0072, 0.013, 8).applyMatrix4(m4))
        const seg = new THREE.BoxGeometry(0.016, l - 0.004, 0.015)
          .translate(0, -l / 2, 0)
          .applyMatrix4(m4)
        put(hand, SILVER, seg)
        m4.multiply(new THREE.Matrix4().makeTranslation(0, -l, 0))
      })
    }
    m4.makeTranslation(0.04, -0.03, -s * 0.004)
    m4.multiply(bend.makeRotationZ(0.5))
    for (const [k, l] of [0.032, 0.028].entries()) {
      m4.multiply(bend.makeRotationX(s * 0.3))
      put(hand, BLACK, axle(0.008, 0.014, 8).applyMatrix4(m4))
      put(
        hand,
        SILVER,
        new THREE.BoxGeometry(0.017, l - 0.004, 0.016)
          .translate(0, -l / 2, 0)
          .applyMatrix4(m4)
      )
      m4.multiply(new THREE.Matrix4().makeTranslation(0, -l, 0))
    }
    arms.push({ sh, el, hand, s })

    // leg: a black hip actuator, a tapering white thigh, a white knee cap over a black joint, a
    // white shin shell with black actuators either side and a black calf, a black foot
    const hip = joint(hips, 0, -0.02, s * 0.105)
    put(hip, BLACK, axle(0.055, 0.11, 20))
    put(
      hip,
      WHITE,
      pod([
        [-0.405, -0.042, 0.046, 0.042],
        [-0.375, -0.05, 0.058, 0.05],
        [-0.3, -0.058, 0.066, 0.056],
        [-0.15, -0.07, 0.074, 0.064],
        [-0.075, -0.072, 0.075, 0.066],
        [-0.045, -0.06, 0.064, 0.056]
      ])
    )
    const kn = joint(hip, 0, -0.42, 0)
    put(kn, BLACK, axle(0.042, 0.09, 18))
    put(
      kn,
      WHITE,
      pod(
        [
          [-0.06, 0.012, 0.05, 0.038],
          [-0.03, 0.006, 0.062, 0.046],
          [0.035, 0.004, 0.06, 0.044],
          [0.055, 0.012, 0.046, 0.032]
        ],
        3
      )
    )
    put(
      kn,
      WHITE,
      pod([
        [-0.37, -0.012, 0.036, 0.03],
        [-0.33, -0.018, 0.042, 0.034],
        [-0.15, -0.022, 0.052, 0.043],
        [-0.075, -0.018, 0.05, 0.045],
        [-0.055, -0.01, 0.042, 0.038]
      ])
    )
    put(
      kn,
      BLACK,
      pod([
        [-0.385, -0.032, -0.006, 0.022],
        [-0.3, -0.042, -0.01, 0.026],
        [-0.15, -0.055, -0.005, 0.036],
        [-0.04, -0.045, 0.0, 0.032]
      ])
    )
    for (const t of [-1, 1])
      put(
        kn,
        BLACK,
        pod([
          [-0.39, -0.022, 0.026, 0.012],
          [-0.2, -0.02, 0.03, 0.013],
          [-0.17, -0.012, 0.02, 0.01]
        ]).translate(0.004, 0, t * 0.04)
      )
    const ank = joint(kn, 0, -0.43, 0)
    put(ank, GUNMETAL, axle(0.026, 0.07, 14))
    put(
      ank,
      BLACK,
      pod(
        [
          [-0.058, -0.075, 0.17, 0.05],
          [-0.042, -0.078, 0.172, 0.052],
          [-0.03, -0.076, 0.165, 0.05],
          [-0.012, -0.068, 0.11, 0.046],
          [0.012, -0.045, 0.045, 0.034]
        ],
        3.2
      )
    )
    legs.push({ hip, kn, ank, s })
  }

  const byJoint = new Map()
  for (const [j, mat, geo] of parts) {
    if (!byJoint.has(j)) byJoint.set(j, new Map())
    const m = byJoint.get(j)
    if (!m.has(mat)) m.set(mat, [])
    m.get(mat).push(geo)
  }
  for (const [j, mats] of byJoint)
    for (const [mat, geos] of mats) {
      const mesh = new THREE.Mesh(merge(geos), mat)
      mesh.castShadow = mat !== GLOW
      j.add(mesh)
    }
  return { root, hips, waist, head, arms, legs, phase: 0 }
}

const mix = (a, b, t) => a + (b - a) * t
const THIGH = 0.42,
  SHIN = 0.43,
  UPPER = 0.28,
  FORE = 0.32 // elbow to the middle of the palm
export const ANKLE_UP = 0.058 // ankle joint above the sole
const _t = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _k = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _w = new THREE.Vector3(),
  _x = new THREE.Vector3(),
  _y = new THREE.Vector3(),
  _z = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion()

// p, in the frame Optimus stands in (its root's parent), seen from joint j's parent less j's offset;
// a direction likewise
function pointAt (O, j, p, out) {
  out.set(p[0], p[1], p[2])
  if (O.root.parent) O.root.parent.localToWorld(out)
  return j.parent.worldToLocal(out).sub(j.position)
}
function dirAt (O, j, d, out) {
  out.set(d[0], d[1], d[2])
  if (O.root.parent) out.transformDirection(O.root.parent.matrixWorld)
  return out.transformDirection(_m.copy(j.parent.matrixWorld).invert())
}

// Two bones from a joint reaching for t (in the joint's parent frame, from the joint), the middle
// joint bowed towards `pole`: sets the joint's orientation (its -y down the first bone) and returns
// the bend at the middle joint. A knee folds its shin back (-x), an elbow its forearm forward (+x).
// Out of reach, the limb points straight at t.
function limb (j, t, a, b, pole, knee) {
  const d = Math.min(Math.max(t.length(), Math.abs(a - b) + 1e-4), a + b - 1e-4)
  _d.copy(t).normalize()
  const along = (a * a - b * b + d * d) / (2 * d),
    r = Math.sqrt(Math.max(0, a * a - along * along))
  _s.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_s.lengthSq() < 1e-8) _s.set(1, 0, 0).addScaledVector(_d, -_d.x)
  _s.normalize()
  _k.copy(_d).multiplyScalar(along).addScaledVector(_s, r) // the middle joint
  _u.copy(_k).normalize() // first bone
  _w.copy(_d).multiplyScalar(d).sub(_k).normalize() // second bone
  _y.copy(_u).negate()
  _x.copy(_s).addScaledVector(_u, -_s.dot(_u)).normalize()
  if (!knee) _x.negate()
  _z.crossVectors(_x, _y)
  j.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z))
  return Math.acos(Math.min(1, Math.max(-1, _u.dot(_w))))
}

// Pose: walk (0-1, how much of the walk cycle shows) and phase (radians through the stride) for the
// legs and the arm swing, unless feet places them: [left, right], each { at: the ankle, knee: the
// way the knee points, toe: the foot's heading (rad) }, the points and directions in the frame the
// root sits in (knees forward and the feet straight ahead by default), soles kept level. lean (rad)
// bends the torso forward at the waist (back, negative) and tilt to its right (left, negative), nod
// the head down; look turns it. hands
// ([left, right], each { at: the middle of the palm, elbow: the way it points, w: 0-1 }) blends each
// arm from its swing to reaching there.
export function poseOptimus (
  O,
  {
    walk = 0,
    phase = 0,
    feet = null,
    lean = 0,
    tilt = 0,
    nod = 0,
    look = 0,
    hands = null
  }
) {
  // a small bob up and down with each step
  O.hips.position.y = walk * 0.025 * Math.abs(Math.cos(phase))
  O.waist.rotation.set(tilt, 0, -0.05 * walk - lean)
  O.head.rotation.y = look
  O.head.rotation.z = -nod
  O.root.updateWorldMatrix(true, true)
  const sw = Math.sin(phase),
    yaw = O.root.rotation.y
  O.legs.forEach((L, i) => {
    const f = feet && feet[i]
    if (f) {
      pointAt(O, L.hip, f.at, _t)
      const pole = f.knee
        ? dirAt(O, L.hip, f.knee, _z)
        : _z.set(1, 0, 0.12 * L.s)
      const bend = limb(L.hip, _t, THIGH, SHIN, pole, true)
      L.kn.rotation.set(0, 0, -bend)
      // the sole level, the toes along the heading: the foot's own frame against the leg's
      const h = (f.toe ?? yaw) - yaw
      _x.set(Math.cos(h), 0, -Math.sin(h))
      _y.set(0, 1, 0)
      _z.crossVectors(_x, _y)
      _q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z))
      _q2.copy(L.hip.quaternion).multiply(L.kn.quaternion).invert()
      L.ank.quaternion.copy(_q2.multiply(_q))
      return
    }
    // the legs half a stride apart: each swings forward with the knee bent, then plants and pushes
    // back straight, the foot kept flat on the ground
    const p = phase + (L.s < 0 ? 0 : Math.PI)
    const wHip = 0.36 * Math.sin(p),
      wKnee =
        -0.75 *
        Math.max(0, Math.cos(p)) *
        (0.4 + 0.6 * Math.max(0, Math.sin(p) + 0.3))
    L.hip.rotation.set(0, 0, wHip * walk)
    L.kn.rotation.set(0, 0, wKnee * walk)
    L.ank.rotation.set(0, 0, -(wHip + wKnee) * 0.85 * walk)
  })
  O.arms.forEach((A, i) => {
    const k = A.s < 0 ? -sw : sw
    A.sh.rotation.set(A.s * 0.08, 0, 0.32 * k * walk)
    let e = 0.25 + 0.2 * Math.max(0, k) * walk
    const g = hands && hands[i]
    const w = g ? g.w ?? 1 : 0
    if (w > 0) {
      _q.copy(A.sh.quaternion)
      pointAt(O, A.sh, g.at, _t)
      const pole = g.elbow
        ? dirAt(O, A.sh, g.elbow, _z)
        : _z.set(-0.3, -1, 0.5 * A.s)
      const bend = limb(A.sh, _t, UPPER, FORE, pole, false)
      A.sh.quaternion.slerpQuaternions(_q, _q2.copy(A.sh.quaternion), w)
      e = mix(e, bend, w)
    }
    A.el.rotation.set(0, 0, e)
    A.hand.rotation.set(A.s * 0.3 * w, 0, 0)
  })
}
