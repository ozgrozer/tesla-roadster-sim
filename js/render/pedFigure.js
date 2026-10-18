// The figure every person on foot is drawn from (peds.js), standing facing +x with their right side
// to +z, about 1.75 m tall: a trunk lofted through rings from the hips in at the waist and out to
// the chest and shoulders, a neck, a head a little longer than it is wide with a jaw and a nose,
// limbs that taper (thighs to the knee, a calf, an ankle; a deltoid, the elbow, a forearm, the
// wrist) with hands and trainers, and the pieces only some have: hair cut short, worn long, in a
// ponytail, a bun or curls, a cap, a hoodie's hood, a skirt, a shoulder bag, a backpack and a phone.
// Each piece is tagged with what it is (aPart), which decides how it moves and what colour it is
// (pedShader.js); the pieces only some have fold away to nothing on everyone else. Indexed, so the
// vertex shader poses each corner once.
import * as THREE from 'three'

export const PART = {
  TORSO: 0,
  HEAD: 1,
  HIPS: 2,
  L_THIGH: 3,
  L_SHIN: 4,
  R_THIGH: 5,
  R_SHIN: 6,
  L_UPPER: 7,
  L_FORE: 8,
  R_UPPER: 9,
  R_FORE: 10,
  HAIR: 11,
  PHONE: 12,
  LONG_HAIR: 13,
  SKIRT: 14,
  BAG: 15,
  PACK: 16,
  NECK: 17,
  PONY: 18,
  CURLS: 19,
  BUN: 20,
  CAP: 21,
  HOOD: 22
}
// the head's middle (the face's features are placed from it: pedShader.js)
export const HEAD_AT = [0.012, 1.645, 0]

// A tube through rings { y, rx, rz, cx, cz } (half depth along x, half width along z, its centre),
// n round, each ring a rounded rectangle-ish ellipse; closed at the bottom with cap0, the top with cap1
function rings (list, n, cap0 = false, cap1 = false, square = 0.82) {
  const pos = [],
    idx = []
  for (const r of list)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a)
      // (a superellipse: flatter at the front, back and sides than an ellipse)
      const k = v => Math.sign(v) * Math.pow(Math.abs(v), square)
      pos.push(r.cx + r.rx * k(c), r.y, (r.cz || 0) + r.rz * k(s))
    }
  for (let j = 0; j < list.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i,
        b = j * n + ((i + 1) % n),
        c = a + n,
        d = b + n
      idx.push(a, b, c, b, d, c)
    }
  const fan = (j, up) => {
    const r = list[j],
      o = pos.length / 3
    pos.push(r.cx, r.y + (up ? 0.004 : -0.004), r.cz || 0)
    for (let i = 0; i < n; i++) {
      const a = j * n + i,
        b = j * n + ((i + 1) % n)
      if (up) idx.push(a, b, o)
      else idx.push(b, a, o)
    }
  }
  if (cap0) fan(0, false)
  if (cap1) fan(list.length - 1, true)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
// a limb: a tube through [radius, y] from bottom to top, n round, at (x, z); its ends left open
// where they are hidden inside the next piece (caps: [bottom, top])
const limb = (prof, n, x, z, back = 0, caps = [false, false]) =>
  rings(
    prof.map(([r, y, k = 1]) => ({
      y,
      rx: r * k,
      rz: r,
      cx: x - back * r * (k - 1),
      cz: z
    })),
    n,
    caps[0],
    caps[1],
    1
  )

// a trainer: rounded at the toe, its sole a little wider, the heel at x = -0.06
function shoe (z) {
  const g = new THREE.BoxGeometry(0.27, 0.085, 0.1, 3, 1, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      zz = p.getZ(i)
    const t = (x + 0.135) / 0.27 // heel 0 to toe 1
    // the toe narrower and lower, rounded off in plan
    zz *= 1 - (0.25 * Math.max(0, t - 0.6)) / 0.4
    if (y > 0) y -= (0.035 * Math.max(0, t - 0.45)) / 0.55
    x -= (((0.03 * Math.abs(zz)) / 0.05) * Math.max(0, t - 0.7)) / 0.3
    p.setXYZ(i, x + 0.075, y + 0.0425, zz + z)
  }
  g.computeVertexNormals()
  return g
}

// the head: a squashed sphere, deeper than it is wide, the jaw narrower and the chin forward
function head () {
  const g = new THREE.SphereGeometry(1, 10, 8)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    const low = Math.max(0, -y)
    z *= 1 - 0.22 * low // the jaw
    x *= x > 0 ? 0.93 + 0.08 * low : 1.04 - 0.15 * low // a flatter face, the skull's back
    if (x > 0 && y < -0.55) x += 0.06 * (1 - (y + 1) / 0.45) // the chin
    p.setXYZ(i, HEAD_AT[0] + x * 0.098, HEAD_AT[1] + y * 0.118, z * 0.079)
  }
  g.computeVertexNormals()
  // the nose: a little wedge down the middle of the face
  const n = new THREE.BufferGeometry()
  const [cx, cy] = HEAD_AT
  n.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        cx + 0.088,
        cy + 0.008,
        0,
        cx + 0.112,
        cy - 0.032,
        0,
        cx + 0.093,
        cy - 0.04,
        -0.017,
        cx + 0.093,
        cy - 0.04,
        0.017
      ],
      3
    )
  )
  n.setIndex([0, 2, 1, 0, 1, 3, 1, 2, 3])
  n.computeVertexNormals()
  return [g, n]
}

// hair cut short: a cap over the skull, down to the nape behind and the hairline in front
function hairCap (scale = 1) {
  const g = new THREE.SphereGeometry(
    1,
    10,
    4,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62
  )
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    // (the front's edge lifted to the hairline, the sides' to above the ears)
    if (x > 0.2) y = Math.max(y, 0.25 + 0.35 * (x - 0.2))
    else if (y < -0.1) y = Math.max(y, -0.1 - 0.5 * Math.max(0, -x))
    p.setXYZ(
      i,
      HEAD_AT[0] - 0.006 + x * 0.106 * scale,
      HEAD_AT[1] + 0.012 + y * 0.124 * scale,
      z * 0.088 * scale
    )
  }
  g.computeVertexNormals()
  return g
}

export function figure () {
  const parts = []
  const put = (g, part) => {
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()])
    g.deleteAttribute('uv')
    g.setAttribute(
      'aPart',
      new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count).fill(part),
        1
      )
    )
    parts.push(g)
  }
  // the trunk: the hips up to the waist, the chest and shoulders above it, the neck on top
  // prettier-ignore
  put(rings([
    { y: 0.8, rx: 0.072, rz: 0.104, cx: 0 }, { y: 0.86, rx: 0.102, rz: 0.158, cx: -0.006 },
    { y: 0.93, rx: 0.108, rz: 0.172, cx: -0.012 }, { y: 1.0, rx: 0.1, rz: 0.162, cx: -0.004 },
    { y: 1.075, rx: 0.094, rz: 0.148, cx: 0.004 }
  ], 10, true, false), PART.HIPS)
  // prettier-ignore
  put(rings([
    { y: 1.07, rx: 0.094, rz: 0.148, cx: 0.004 }, { y: 1.16, rx: 0.099, rz: 0.155, cx: 0.01 },
    { y: 1.26, rx: 0.11, rz: 0.17, cx: 0.015 }, { y: 1.35, rx: 0.108, rz: 0.18, cx: 0.01 },
    { y: 1.425, rx: 0.088, rz: 0.19, cx: 0.0 }, { y: 1.465, rx: 0.072, rz: 0.15, cx: -0.006 },
    { y: 1.495, rx: 0.05, rz: 0.065, cx: 0.0 }
  ], 10, false, true), PART.TORSO)
  put(
    limb(
      [
        [0.05, 1.42],
        [0.046, 1.5],
        [0.045, 1.57]
      ],
      6,
      0.002,
      0
    ),
    PART.NECK
  )
  const [h, nose] = head()
  put(h, PART.HEAD)
  put(nose, PART.HEAD)
  // hair, cut short, worn long down the back, in a ponytail, a bun or curls; a cap
  put(hairCap(), PART.HAIR)
  put(
    new THREE.LatheGeometry(
      [
        [0.07, 1.36],
        [0.1, 1.45],
        [0.11, 1.58],
        [0.104, 1.7]
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      7,
      Math.PI * 0.75,
      Math.PI * 1.5
    ).translate(HEAD_AT[0] - 0.012, 0, 0),
    PART.LONG_HAIR
  )
  put(
    limb(
      [
        [0.006, 0],
        [0.024, 0.06],
        [0.03, 0.14],
        [0.022, 0.2]
      ],
      5,
      0,
      0,
      0,
      [true, false]
    )
      .rotateZ(-0.35)
      .translate(HEAD_AT[0] - 0.13, 1.47, 0),
    PART.PONY
  )
  {
    const g = new THREE.SphereGeometry(1, 8, 5)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i)
      const b = 1 + 0.07 * Math.sin(x * 17 + y * 11) * Math.cos(z * 13 - y * 7)
      // (pulled back off the face below the hairline)
      const f = x > 0 && y < 0.35 ? 0.2 : 1
      p.setXYZ(
        i,
        HEAD_AT[0] - 0.03 + x * 0.125 * b * f,
        HEAD_AT[1] + 0.035 + y * 0.12 * b,
        z * 0.118 * b
      )
    }
    g.computeVertexNormals()
    put(g, PART.CURLS)
  }
  put(
    new THREE.SphereGeometry(0.042, 5, 3).translate(
      HEAD_AT[0] - 0.085,
      HEAD_AT[1] + 0.105,
      0
    ),
    PART.BUN
  )
  {
    const crown = new THREE.SphereGeometry(
      1,
      8,
      3,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.5
    )
      .scale(0.104, 0.085, 0.091)
      .translate(HEAD_AT[0] - 0.004, HEAD_AT[1] + 0.045, 0)
    put(crown, PART.CAP)
    const brim = new THREE.CircleGeometry(0.08, 6, -Math.PI / 2, Math.PI)
      .scale(1.05, 1, 1)
      .rotateX(-Math.PI / 2)
      .rotateZ(-0.12)
      .translate(HEAD_AT[0] + 0.07, HEAD_AT[1] + 0.05, 0)
    put(brim, PART.CAP)
  }
  // a hoodie's hood, bunched behind the neck
  put(
    new THREE.TorusGeometry(0.085, 0.035, 3, 6, Math.PI)
      .rotateX(Math.PI / 2)
      .rotateY(Math.PI / 2)
      .scale(1, 1, 1.15)
      .translate(-0.02, 1.47, 0),
    PART.HOOD
  )
  // legs: thigh, shin and trainer each side
  for (const [k, z] of [
    [0, -0.092],
    [2, 0.092]
  ]) {
    // prettier-ignore
    put(limb([[0.052, 0.46], [0.06, 0.55], [0.071, 0.7], [0.081, 0.84], [0.083, 0.94]], 7, 0.004, z), PART.L_THIGH + k)
    // prettier-ignore
    put(limb([[0.033, 0.07], [0.037, 0.15], [0.05, 0.3, 1.12], [0.054, 0.38, 1.12], [0.048, 0.47], [0.048, 0.53]], 7, 0, z, 1), PART.L_SHIN + k)
    put(shoe(z), PART.L_SHIN + k)
  }
  // arms: upper arm, forearm and hand each side, hanging a little out from the hips
  for (const [k, z] of [
    [0, -0.192],
    [2, 0.192]
  ]) {
    const s = Math.sign(z)
    // (the shoulder rounded over the top of the upper arm)
    // prettier-ignore
    put(limb([[0.042, 1.13], [0.045, 1.2], [0.05, 1.32], [0.055, 1.4], [0.05, 1.435], [0.034, 1.458], [0.012, 1.468]], 6, 0, z, 0, [false, true]), PART.L_UPPER + k)
    put(
      limb(
        [
          [0.028, 0.865],
          [0.031, 0.92],
          [0.041, 1.06],
          [0.042, 1.12],
          [0.04, 1.17]
        ],
        6,
        0,
        z + s * 0.008
      ),
      PART.L_FORE + k
    )
    put(
      new THREE.SphereGeometry(1, 6, 4)
        .scale(0.042, 0.082, 0.021)
        .translate(0.006, 0.79, z + s * 0.01),
      PART.L_FORE + k
    )
  }
  // a skirt or a dress's, flaring from the waist
  put(
    new THREE.CylinderGeometry(0.15, 0.27, 0.52, 10, 1, true)
      .scale(0.82, 1, 1)
      .translate(0, 0.79, 0),
    PART.SKIRT
  )
  put(
    new THREE.BoxGeometry(0.2, 0.22, 0.06).translate(0.02, 0.98, -0.25),
    PART.BAG
  ) // (at the left hip)
  put(
    new THREE.BoxGeometry(0.13, 0.36, 0.27).translate(-0.17, 1.22, 0),
    PART.PACK
  ) // (on the back)
  // a phone in the right hand (folded away to nothing when it isn't out)
  put(
    new THREE.BoxGeometry(0.075, 0.15, 0.012).translate(0.03, 0.8, 0.215),
    PART.PHONE
  )
  return mergeParts(parts)
}

// merge the pieces, keeping their indices: position, normal, aPart
function mergeParts (parts) {
  let n = 0
  for (const g of parts) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['aPart', 1]
  ]) {
    const arr = new Float32Array(n * size)
    let o = 0
    for (const g of parts) {
      if (!g.attributes.normal) g.computeVertexNormals()
      arr.set(g.attributes[name].array, o)
      o += g.attributes.position.count * size
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  const idx = []
  let o = 0
  for (const g of parts) {
    for (const i of g.index.array) idx.push(i + o)
    o += g.attributes.position.count
  }
  out.setIndex(idx)
  return out
}
