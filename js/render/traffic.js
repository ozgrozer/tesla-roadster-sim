// Traffic cars: seven body types lofted with rounded bodies, glass cabins and open wheel arches
// (carShapes.js), instanced per type, with paint per car, spinning wheels, headlights, tail lights
// that brighten under braking, and amber indicators that blink for lane changes and turns (and both
// at once, hazards, for a car knocked out of its lane).
import * as THREE from 'three'
import { hdr } from './scene.js'
import { merge, tint } from './geo.js'
import { TYPES } from '../sim/traffic.js'
import { carShape, archMaterial } from './carShapes.js'

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

// a wheel of radius 1 and width 1 along z: a tyre with a silver hub cap on each face
function wheelGeometry () {
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2)
  const parts = [tint(tyre, 0x141416)]
  for (const s of [-1, 1]) {
    const hub = new THREE.CylinderGeometry(0.64, 0.64, 0.04, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, s * 0.5)
    parts.push(tint(hub, 0xb4b8bd))
    const cap = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10)
      .rotateX(Math.PI / 2)
      .translate(0, 0, s * 0.52)
    parts.push(tint(cap, 0x55595f))
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
const TAIL = hdr(1.6, 0.04, 0.03),
  BRAKE = hdr(4, 0.12, 0.06),
  AMBER = hdr(3, 1.1, 0.05),
  AMBER_OFF = hdr(0.25, 0.1, 0.02)

export class TrafficView {
  constructor (group, max = 420) {
    const paint = new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      metalness: 0.45,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0b0f14,
      roughness: 0.05,
      metalness: 0.75,
      envMapIntensity: 1.5
    })
    const trim = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: THREE.DoubleSide
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
      const sh = carShape(T)
      const parts = {
        body: mesh(sh.paint, archMaterial(paint, sh.arch)),
        glass: mesh(sh.glass, glass),
        trim: mesh(sh.trim, trim)
      }
      parts.body.setColorAt(0, PALETTE[0]) // allocates the per-car paint
      return { T, S: sh.S, ...parts }
    })
    this.wheels = mesh(
      wheelGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      max * 4,
      false
    )
    const lamp = new THREE.BoxGeometry(0.05, 0.11, 0.34)
    const lit = () => new THREE.MeshBasicMaterial({ toneMapped: false })
    this.heads = mesh(lamp, lit(), max * 2, false)
    this.heads.material.color = hdr(2.6, 2.6, 2.4)
    this.tails = mesh(lamp, lit(), max * 2, false)
    this.tails.setColorAt(0, TAIL)
    this.blinkers = mesh(
      new THREE.BoxGeometry(0.05, 0.07, 0.1),
      lit(),
      max * 4,
      false
    )
    this.blinkers.setColorAt(0, AMBER)
    this.max = max
  }

  update (traffic) {
    const counts = this.types.map(() => 0)
    let w = 0,
      l = 0,
      b = 0
    // indicators flash at 1.5 Hz
    const flash = Math.sin(traffic.t * Math.PI * 3) > 0
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
      ty.glass.setMatrixAt(i, _m)
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
            _p.set(ax, S.r, side * (T.wid / 2 - 0.17)),
            _q.setFromAxisAngle(_z, spin),
            _sc.set(S.r, S.r, 0.24)
          )
          this.wheels.setMatrixAt(w++, _w.premultiply(_m))
        }
      for (const side of [-1, 1]) {
        const z = side * (T.wid / 2 - 0.3)
        _w.makeTranslation(T.len / 2 + 0.01, S.lights[0], z)
        this.heads.setMatrixAt(l, _w.premultiply(_m))
        _w.makeTranslation(-T.len / 2 - 0.01, S.lights[1], z)
        this.tails.setMatrixAt(l, _w.premultiply(_m))
        this.tails.setColorAt(l, car.brake ? BRAKE : TAIL)
        l++
        // indicators at each corner: side -1 is the car's left
        const on =
          flash &&
          (car.sig === 3 ||
            (car.sig === 1 && side < 0) ||
            (car.sig === 2 && side > 0))
        for (const end of [1, -1]) {
          _w.makeTranslation(
            end * (T.len / 2 + 0.005),
            S.lights[end > 0 ? 0 : 1] - 0.03,
            side * (T.wid / 2 - 0.1)
          )
          this.blinkers.setMatrixAt(b, _w.premultiply(_m))
          this.blinkers.setColorAt(b++, on ? AMBER : AMBER_OFF)
        }
      }
    }
    this.types.forEach((ty, k) => {
      for (const m of [ty.body, ty.trim, ty.glass]) {
        m.count = counts[k]
        m.instanceMatrix.needsUpdate = true
      }
      ty.body.instanceColor.needsUpdate = true
    })
    this.wheels.count = w
    this.heads.count = this.tails.count = l
    this.blinkers.count = b
    for (const m of [this.wheels, this.heads, this.tails, this.blinkers])
      m.instanceMatrix.needsUpdate = true
    this.tails.instanceColor.needsUpdate = true
    this.blinkers.instanceColor.needsUpdate = true
  }
}
