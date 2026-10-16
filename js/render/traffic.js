// Traffic cars: seven body types lofted with rounded bodies, glass cabins and open wheel arches
// (carShapes.js), instanced per type, with paint per car, wheels with tyres and alloy or steel rims
// (carWheels.js) that roll with the distance driven and steer through the turns, bodies that ride on
// their springs (nose down under braking, squatting as they pull away, leaning out of a corner),
// headlights, tail lights that brighten under braking, amber indicators that blink for lane changes
// and turns (and both at once, hazards, for a car knocked out of its lane), and a soft shadow on the
// road under each car, where its body shuts out the sky. Parked in a lot, a car's lights are off; at
// night (this.night) the headlights throw their beams on the road ahead.
import * as THREE from 'three'
import { hdr } from './scene.js'
import { CURB_H } from '../sim/city.js'
import { clamp, wrapPi } from '../sim/constants.js'
import { TYPES } from '../sim/traffic.js'
import { carShape, archMaterial } from './carShapes.js'
import {
  RIM_FINISH,
  rimMaterial,
  rimGeometry,
  tyreGeometry
} from './carWheels.js'

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
// cabs, vans and buses run on steel wheels, everyone else on alloys
const STEEL = new Set(['taxi', 'van', 'bus'])

// the dark under a car: a rounded rectangle, blurred, darkest in the middle
function underTexture () {
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
// a headlight's throw on the road: a cone, brightest just ahead of the car, widening and fading
// as it goes
function beamTexture () {
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

const _m = new THREE.Matrix4(),
  _b = new THREE.Matrix4(),
  _w = new THREE.Matrix4(),
  _t = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _r = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  _y = new THREE.Vector3(0, 1, 0),
  _z = new THREE.Vector3(0, 0, 1),
  _sc = new THREE.Vector3()
const TAIL = hdr(1.6, 0.04, 0.03),
  BRAKE = hdr(4, 0.12, 0.06),
  TAIL_OFF = hdr(0.12, 0.01, 0.01),
  HEAD = hdr(2.6, 2.6, 2.4),
  HEAD_OFF = hdr(0.14, 0.14, 0.15),
  AMBER = hdr(3, 1.1, 0.05),
  AMBER_OFF = hdr(0.25, 0.1, 0.02)

// The body on its springs: a damped spring each for pitch and roll, about 1.4 Hz and a little
// under-damped, so a car settles back with a slight bob after it stops. Pitch follows the car's
// acceleration (about 1.5 degrees under ordinary braking), roll its cornering (more for the tall
// ones); the front wheels steer to the curve it is on.
const SPRING = 78,
  DAMP = 8.5
function ride (car, T, S, dt) {
  const sp = car.loose ? Math.hypot(car.vx, car.vz) : car.v
  if (car.rv === undefined) {
    car.rv = sp
    car.ryaw = car.yaw
    car.pitch = car.pitchV = car.roll = car.rollV = car.steer = 0
  }
  if (dt <= 0) return
  const h = Math.min(dt, 1 / 30)
  const acc = clamp((sp - car.rv) / dt, -12, 6)
  let rate = wrapPi(car.yaw - car.ryaw) / dt
  if (Math.abs(rate) > 4) rate = 0 // (a car recycled somewhere else)
  car.rv = sp
  car.ryaw = car.yaw
  const tall = T.hgt / 1.5
  const pitchT = clamp(acc * 0.0055, -0.045, 0.03)
  const rollT = car.loose ? 0 : clamp(sp * rate * 0.009 * tall, -0.07, 0.07)
  car.pitchV += (SPRING * (pitchT - car.pitch) - DAMP * car.pitchV) * h
  car.pitch += car.pitchV * h
  car.rollV += (SPRING * (rollT - car.roll) - DAMP * car.rollV) * h
  car.roll += car.rollV * h
  const wb = S.axles[0] - S.axles[1]
  const steerT =
    car.loose || sp < 0.5
      ? car.steer
      : clamp(Math.atan((wb * rate) / sp), -0.6, 0.6)
  car.steer += (steerT - car.steer) * Math.min(1, h * 10)
}

export class TrafficView {
  constructor (group, max = 420) {
    const paint = new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      metalness: 0.45,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12
    })
    // clear glass over a dark cabin: nearly black head on, the sky in it at a glancing angle
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x10161c,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.2
    })
    const trim = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: THREE.DoubleSide
    })
    this.meshes = [] // (all of them: kept out of the city's shadow map)
    const mesh = (geo, mat, cap = max, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, cap)
      this.meshes.push(m)
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
      return { T, S: sh.S, steel: STEEL.has(T.name), ...parts }
    })
    this.tyres = mesh(
      tyreGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.88 }),
      max * 4,
      false
    )
    this.rims = {}
    for (const kind of ['alloy', 'steel']) {
      const m = mesh(rimGeometry(), rimMaterial(kind), max * 4, false)
      m.setColorAt(0, RIM_FINISH[kind][0])
      this.rims[kind] = m
    }
    const lamp = new THREE.BoxGeometry(0.05, 0.11, 0.34)
    const lit = () => new THREE.MeshBasicMaterial({ toneMapped: false })
    this.heads = mesh(lamp, lit(), max * 2, false)
    this.heads.setColorAt(0, HEAD)
    this.tails = mesh(lamp, lit(), max * 2, false)
    this.tails.setColorAt(0, TAIL)
    this.blinkers = mesh(
      new THREE.BoxGeometry(0.05, 0.07, 0.1),
      lit(),
      max * 4,
      false
    )
    this.blinkers.setColorAt(0, AMBER)
    this.under = mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: underTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      }),
      max,
      false
    )
    this.under.receiveShadow = false
    this.beams = mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: beamTexture(),
        color: new THREE.Color(1, 0.9, 0.72),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      }),
      max,
      false
    )
    this.beams.receiveShadow = false
    this.night = false
    this.max = max
  }

  update (traffic, dt = 0) {
    const counts = this.types.map(() => 0)
    const rimN = { alloy: 0, steel: 0 }
    let w = 0,
      l = 0,
      b = 0,
      u = 0,
      hb = 0
    // indicators flash at 1.5 Hz
    const flash = Math.sin(traffic.t * Math.PI * 3) > 0
    for (const car of traffic.cars) {
      const ty = this.types[car.type],
        i = counts[car.type]
      if (i >= this.max) continue
      counts[car.type]++
      const { T, S } = ty
      if (!car.parked) ride(car, T, S, dt)
      // the car where it stands (in a parking lot, up on its raised slab), and its body tipped on
      // its springs about the axles' height
      const y = car.parked && !car.jam ? CURB_H : 0
      _q.setFromAxisAngle(_y, car.yaw)
      _m.compose(_p.set(car.x, y, car.z), _q, _s)
      this.under.setMatrixAt(
        u++,
        _w.compose(
          _p.set(car.x, y + 0.012, car.z),
          _q,
          _sc.set(T.len + 0.5, 1, T.wid + 0.45)
        )
      )
      _b.copy(_m)
      if (!car.parked) {
        _e.set(car.roll || 0, 0, car.pitch || 0)
        _t.makeRotationFromEuler(_e)
        _t.setPosition(_p.set(0, S.r, 0).sub(_sc.set(0, S.r, 0).applyEuler(_e)))
        _b.multiply(_t)
      }
      ty.body.setMatrixAt(i, _b)
      ty.trim.setMatrixAt(i, _b)
      ty.glass.setMatrixAt(i, _b)
      const fixed = FIXED[T.name]
      const col = fixed
        ? fixed[Math.floor(car.paint * fixed.length)]
        : PALETTE[Math.floor(car.paint * PALETTE.length)]
      ty.body.setColorAt(i, col)
      // wheels, turning with the distance driven, the fronts steering
      const kind = ty.steel ? 'steel' : 'alloy',
        rims = this.rims[kind],
        finish = RIM_FINISH[kind]
      const rimCol = finish[Math.floor(((car.paint * 7.7) % 1) * finish.length)]
      const spin = -car.odo / S.r
      for (const ax of S.axles)
        for (const side of [-1, 1]) {
          _q.setFromAxisAngle(_z, spin)
          if (ax > 0 && car.steer)
            _q.premultiply(_r.setFromAxisAngle(_y, car.steer))
          _w.compose(
            _p.set(ax, S.r, side * (T.wid / 2 - 0.17)),
            _q,
            _sc.set(S.r, S.r, 0.24)
          )
          _w.premultiply(_m)
          this.tyres.setMatrixAt(w++, _w)
          rims.setMatrixAt(rimN[kind], _w)
          rims.setColorAt(rimN[kind]++, rimCol)
        }
      // (in a parking lot, its lights are off; on the road at night, its beams are on the road)
      const lit = !car.parked || car.jam
      if (lit && this.night)
        this.beams.setMatrixAt(
          hb++,
          _w.compose(
            _p.set(T.len / 2 + 7, 0.025, 0).applyMatrix4(_m),
            _q.setFromAxisAngle(_y, car.yaw),
            _sc.set(14, 1, 6.5)
          )
        )
      for (const side of [-1, 1]) {
        const z = side * (T.wid / 2 - 0.3)
        _w.makeTranslation(T.len / 2 + 0.01, S.lights[0], z)
        this.heads.setMatrixAt(l, _w.premultiply(_b))
        this.heads.setColorAt(l, lit ? HEAD : HEAD_OFF)
        _w.makeTranslation(-T.len / 2 - 0.01, S.lights[1], z)
        this.tails.setMatrixAt(l, _w.premultiply(_b))
        this.tails.setColorAt(l, lit ? (car.brake ? BRAKE : TAIL) : TAIL_OFF)
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
          this.blinkers.setMatrixAt(b, _w.premultiply(_b))
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
    this.tyres.count = w
    for (const [kind, m] of Object.entries(this.rims)) {
      m.count = rimN[kind]
      m.instanceMatrix.needsUpdate = true
      m.instanceColor.needsUpdate = true
    }
    this.heads.count = this.tails.count = l
    this.blinkers.count = b
    this.under.count = u
    this.beams.count = hb
    for (const m of [
      this.tyres,
      this.heads,
      this.tails,
      this.blinkers,
      this.under,
      this.beams
    ])
      m.instanceMatrix.needsUpdate = true
    this.heads.instanceColor.needsUpdate = true
    this.tails.instanceColor.needsUpdate = true
    this.blinkers.instanceColor.needsUpdate = true
  }
}
