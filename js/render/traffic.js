// Traffic cars: seven body types extruded from side profiles, instanced per type, with paint per
// car, spinning wheels, headlights, and tail lights that brighten under braking.
import * as THREE from 'three'
import { hdr, MAT } from './scene.js'
import { TYPES } from '../sim/traffic.js'
import { merge, box, tint } from './geo.js'

// side profiles (x forward, y up, metres) for the body and the glasshouse, wheel radius and
// positions, and the heights of the head and tail lights
const SHAPES = {
  sedan: {
    body: [
      [-2.35, 0.3],
      [2.35, 0.3],
      [2.35, 0.66],
      [2.1, 0.8],
      [1.05, 0.88],
      [-1.75, 0.92],
      [-2.3, 0.86],
      [-2.35, 0.66]
    ],
    glass: [
      [1.02, 0.86],
      [0.2, 1.4],
      [-0.95, 1.44],
      [-1.72, 0.9]
    ],
    r: 0.33,
    axles: [1.42, -1.42],
    lights: [0.66, 0.78]
  },
  hatch: {
    body: [
      [-2.05, 0.3],
      [2.05, 0.3],
      [2.05, 0.66],
      [1.8, 0.82],
      [0.95, 0.92],
      [-1.92, 0.98],
      [-2.05, 0.9]
    ],
    glass: [
      [0.92, 0.9],
      [0.15, 1.46],
      [-1.6, 1.48],
      [-1.92, 0.98]
    ],
    r: 0.31,
    axles: [1.3, -1.28],
    lights: [0.68, 0.86]
  },
  suv: {
    body: [
      [-2.42, 0.38],
      [2.42, 0.38],
      [2.42, 0.86],
      [2.15, 1.0],
      [1.15, 1.08],
      [-2.3, 1.12],
      [-2.42, 1.02]
    ],
    glass: [
      [1.12, 1.06],
      [0.35, 1.7],
      [-1.95, 1.73],
      [-2.3, 1.12]
    ],
    r: 0.38,
    axles: [1.48, -1.45],
    lights: [0.86, 0.98]
  },
  pickup: {
    body: [
      [-2.7, 0.42],
      [2.7, 0.42],
      [2.7, 0.95],
      [2.42, 1.1],
      [1.25, 1.16],
      [-2.7, 1.2]
    ],
    glass: [
      [1.22, 1.14],
      [0.55, 1.8],
      [-0.62, 1.84],
      [-0.72, 1.18]
    ],
    r: 0.4,
    axles: [1.75, -1.8],
    lights: [0.95, 1.0]
  },
  van: {
    body: [
      [-3.2, 0.42],
      [3.2, 0.42],
      [3.2, 1.0],
      [2.95, 1.25],
      [2.25, 1.5],
      [1.65, 2.7],
      [-3.2, 2.76]
    ],
    glass: [
      [2.92, 1.27],
      [2.26, 1.52],
      [1.78, 2.35],
      [1.62, 2.36],
      [1.66, 1.4]
    ],
    r: 0.4,
    axles: [2.15, -2.2],
    lights: [1.0, 1.1]
  },
  bus: {
    body: [
      [-5.8, 0.38],
      [5.8, 0.38],
      [5.8, 3.0],
      [5.62, 3.15],
      [-5.62, 3.15],
      [-5.8, 3.0]
    ],
    glass: null,
    r: 0.5,
    axles: [3.65, -3.45],
    lights: [0.75, 0.9]
  }
}
SHAPES.taxi = SHAPES.sedan

// paint by type: realistic street colours, yellow cabs, white buses and vans
const PALETTE = [
  0xe9e9e6, 0x15171b, 0xa9adb2, 0x5c6168, 0x1f2f55, 0x8f1219, 0xbcae90,
  0x23392e, 0x7d9fc2, 0xb9561e, 0x3d4e63, 0xd8d0c0
].map(c => new THREE.Color(c))
const FIXED = {
  taxi: [new THREE.Color(0xf0b400)],
  bus: [new THREE.Color(0xe4e8ea), new THREE.Color(0x2a6a9c)],
  van: [
    new THREE.Color(0xeeeeec),
    new THREE.Color(0xd9d9d6),
    new THREE.Color(0x2b3a52)
  ]
}

function extrude (pts, depth, bevel) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  return new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1
  }).translate(0, 0, -depth / 2)
}
// bumpers, grille, the taxi's roof sign and the bus's window band: dark trim baked with vertex colours
function trimFor (T, S) {
  const L = T.len / 2,
    W = T.wid / 2,
    y = S.body[0][1]
  const parts = [
    tint(
      box(L - 0.08, y - 0.02, -W + 0.06, L + 0.06, y + 0.24, W - 0.06),
      0x1b1c1f
    ),
    tint(
      box(-L - 0.06, y - 0.02, -W + 0.06, -L + 0.08, y + 0.24, W - 0.06),
      0x1b1c1f
    )
  ]
  if (T.name === 'taxi')
    parts.push(tint(box(-0.45, 1.42, -0.32, 0.15, 1.64, 0.32), 0xf6f1d8))
  if (T.name === 'bus') {
    parts.push(tint(box(-5.3, 1.5, -W - 0.01, 5.3, 2.7, W + 0.01), 0x10151a))
    parts.push(tint(box(5.62, 1.2, -W + 0.12, 5.82, 2.8, W - 0.12), 0x10151a))
    parts.push(tint(box(-5.0, 0.45, W, -3.6, 2.6, W + 0.015), 0x202428)) // rear door
  }
  return merge(parts)
}

const _m = new THREE.Matrix4(),
  _w = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  _y = new THREE.Vector3(0, 1, 0),
  _z = new THREE.Vector3(0, 0, 1),
  _sc = new THREE.Vector3()
const TAIL = hdr(2.4, 0.1, 0.08),
  BRAKE = hdr(7, 0.3, 0.15)

export class TrafficView {
  constructor (group, max = 420) {
    const paint = new THREE.MeshPhysicalMaterial({
      roughness: 0.32,
      metalness: 0.45,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0d1117,
      roughness: 0.06,
      metalness: 0.7,
      envMapIntensity: 1.4
    })
    const trim = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6
    })
    const mesh = (geo, mat, cap = max, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, cap)
      m.castShadow = shadow
      m.receiveShadow = true
      m.frustumCulled = false
      m.count = 0
      group.add(m)
      return m
    }
    this.types = TYPES.map(T => {
      const S = SHAPES[T.name]
      const parts = {
        body: mesh(extrude(S.body, T.wid - 0.1, 0.05), paint),
        trim: mesh(trimFor(T, S), trim)
      }
      if (S.glass)
        parts.glass = mesh(extrude(S.glass, T.wid - 0.28, 0.04), glass)
      parts.body.setColorAt(0, PALETTE[0]) // allocates the per-car paint
      return { T, S, ...parts }
    })
    this.wheels = mesh(
      new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2),
      MAT.tire,
      max * 4,
      false
    )
    const lamp = new THREE.BoxGeometry(0.06, 0.13, 0.34)
    this.heads = mesh(
      lamp,
      new THREE.MeshBasicMaterial({
        color: hdr(2.6, 2.6, 2.4),
        toneMapped: false
      }),
      max * 2,
      false
    )
    this.tails = mesh(
      lamp,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      max * 2,
      false
    )
    this.tails.setColorAt(0, TAIL)
    this.max = max
  }

  update (traffic) {
    const counts = this.types.map(() => 0)
    let w = 0,
      l = 0
    for (const car of traffic.cars) {
      const ty = this.types[car.type],
        i = counts[car.type]
      if (i >= this.max) continue
      counts[car.type]++
      const { T, S } = ty
      _q.setFromAxisAngle(_y, car.yaw)
      _m.compose(_p.set(car.x, 0, car.z), _q, _s)
      ty.body.setMatrixAt(i, _m)
      ty.trim.setMatrixAt(i, _m)
      ty.glass?.setMatrixAt(i, _m)
      const fixed = FIXED[T.name]
      const col = fixed
        ? fixed[Math.floor(car.paint * fixed.length)]
        : PALETTE[Math.floor(car.paint * PALETTE.length)]
      ty.body.setColorAt(i, col)
      // wheels, turning with the distance driven
      const spin = -car.odo / S.r
      for (const ax of S.axles)
        for (const side of [-1, 1]) {
          _w.compose(
            _p.set(ax, S.r, side * (T.wid / 2 - 0.2)),
            _q.setFromAxisAngle(_z, spin),
            _sc.set(S.r, S.r, 0.26)
          )
          this.wheels.setMatrixAt(w++, _w.premultiply(_m))
        }
      for (const side of [-1, 1]) {
        const z = side * (T.wid / 2 - 0.28)
        _w.makeTranslation(T.len / 2 + 0.01, S.lights[0], z)
        this.heads.setMatrixAt(l, _w.premultiply(_m))
        _w.makeTranslation(-T.len / 2 - 0.01, S.lights[1], z)
        this.tails.setMatrixAt(l, _w.premultiply(_m))
        this.tails.setColorAt(l, car.brake ? BRAKE : TAIL)
        l++
      }
    }
    this.types.forEach((ty, k) => {
      for (const m of [ty.body, ty.trim, ty.glass]) {
        if (!m) continue
        m.count = counts[k]
        m.instanceMatrix.needsUpdate = true
      }
      ty.body.instanceColor.needsUpdate = true
    })
    this.wheels.count = w
    this.heads.count = this.tails.count = l
    for (const m of [this.wheels, this.heads, this.tails])
      m.instanceMatrix.needsUpdate = true
    this.tails.instanceColor.needsUpdate = true
  }
}
