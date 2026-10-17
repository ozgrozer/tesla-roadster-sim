// Traffic cars: seven body types lofted with rounded bodies, glass cabins and open wheel arches
// (carShapes.js), instanced per type, painted in a real city's mix of colours, wheels with tyres and
// alloy or steel rims (carWheels.js) that roll with the distance driven and steer through the turns,
// bodies that ride on their springs (nose down under braking, squatting as they pull away, leaning
// out of a corner, a bus slower and softer), headlights, tail lights that brighten under braking,
// white reversing lights, amber indicators that blink for lane changes and turns, each car's in its
// own time (and both at once, hazards, for a car knocked out of its lane), and a soft shadow on the
// road under each car, where its body shuts out the sky. Parked in a lot, a car's lights are off; at
// night (this.night) the headlights throw their beams on the road ahead. Only the cars the camera
// can see are drawn (or whose shadows it can: the frustum is let out a little for those), in the
// view and in the sun's shadow map alike; out of sight a car costs nothing but its springs.
import * as THREE from 'three'
import { CURB_H } from '../sim/city.js'
import { clamp } from '../sim/constants.js'
import { TYPES } from '../sim/traffic.js'
import { carShape, archMaterial } from './carShapes.js'
import { lampMaterial } from './carLamps.js'
import {
  RIM_FINISH,
  rimMaterial,
  rimGeometry,
  tyreGeometry,
  farWheelGeometry
} from './carWheels.js'

// Paint the way a city's cars are painted: a quarter white, a fifth black, then greys and
// silvers, blues and reds, and only now and then a beige, a green or an orange (each with a weight);
// yellow cabs, white buses and vans
// prettier-ignore
const PAINTS = [
  [0xe9e9e6, 14], [0xf3f2ed, 9], [0x121316, 13], [0x1b1e23, 7], [0x4b5057, 9], [0x6e737a, 8],
  [0xa9adb2, 7], [0xc4c7ca, 5], [0x1f2f55, 5], [0x3d5a84, 3], [0x7d9fc2, 1.5], [0x8f1219, 5],
  [0xb01b1e, 3], [0xbcae90, 1.5], [0x5a4433, 1], [0x23392e, 1.2], [0xb9561e, 0.8], [0xd8b02a, 0.4]
]
// (a lookup from a car's paint draw, 0 to 1, to its colour)
const PALETTE = []
{
  const total = PAINTS.reduce((a, p) => a + p[1], 0)
  let k = 0,
    acc = PAINTS[0][1]
  for (let i = 0; i < 256; i++) {
    while ((i + 0.5) / 256 > acc / total && k < PAINTS.length - 1)
      acc += PAINTS[++k][1]
    PALETTE.push(new THREE.Color(PAINTS[k][0]))
  }
}
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
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  _sc = new THREE.Vector3()
const _sp = new THREE.Sphere()
// q, a turn of a about y, written straight into its fields
function yawTo (q, a) {
  q._x = q._z = 0
  q._y = Math.sin(a / 2)
  q._w = Math.cos(a / 2)
}
const SHADOW_REACH = 8 // m: the long evening shadow a car just out of sight throws into it
// m from the Roadster within which cars cast shadows (into its own shadow map, 60 m across) and
// have their full wheels
export const NEAR = 45

// The body on its springs: a damped spring each for pitch and roll, tuned per type (a car's body
// bobs at about 1.5 Hz, a van's or pickup's slower, a bus's under 1 Hz and softer still), so a car
// settles back with a slight bob after it stops. Pitch follows the acceleration the driver asks for
// (the nose dips about a degree and a half under ordinary braking, more under hard braking, and the
// tail squats as it pulls away), roll the sideways acceleration round a corner (more for the tall
// ones, most for a bus), and a car knocked sliding leans into the way it is sliding. The front
// wheels steer to the curve it is on.
const RIDE = {
  sedan: [1.55, 0.42, 1, 1],
  hatch: [1.6, 0.42, 1, 1],
  taxi: [1.5, 0.4, 1, 1.05],
  suv: [1.35, 0.4, 1.15, 1.3],
  pickup: [1.25, 0.38, 1.1, 1.3],
  van: [1.15, 0.38, 0.9, 1.5],
  bus: [0.9, 0.32, 0.55, 1.7]
} // per type: frequency (Hz), damping ratio, pitch and roll per m/s^2 (relative)
// (the frame's dt comes in RIDE.dt rather than as an argument: a number passed costs an allocation)
const RIDE_DT = { dt: 0.5 }
function ride (car, T, S) {
  const dt = RIDE_DT.dt
  if (dt <= 0) return
  const [f, zeta, kp, kr] = RIDE[T.name]
  const w = 2 * Math.PI * f,
    k = w * w,
    c = 2 * zeta * w
  const h = Math.min(dt, 1 / 30)
  let pitchT, rollT, sp
  if (car.loose) {
    sp = Math.hypot(car.vx, car.vz)
    // sliding sideways the tyres scrub, and the body leans the way it slides
    const side = -car.vx * car.hz + car.vz * car.hx
    pitchT = 0
    rollT = clamp(side * 0.012 * kr, -0.08, 0.08)
  } else {
    sp = car.v
    pitchT = clamp((car.acc || 0) * 0.0052 * kp, -0.06, 0.03)
    rollT = clamp(sp * (car.yr || 0) * 0.0085 * kr, -0.075, 0.075)
  }
  car.pitchV += (k * (pitchT - car.pitch) - c * car.pitchV) * h
  car.pitch += car.pitchV * h
  car.rollV += (k * (rollT - car.roll) - c * car.rollV) * h
  car.roll += car.rollV * h
  // the front wheels: to the curve it is on (from its yaw rate), eased like a driver's hands
  const wb = S.axles[0] - S.axles[1]
  const steerT =
    car.loose || Math.abs(sp) < 0.5
      ? car.steer
      : clamp(Math.atan((wb * (car.yr || 0)) / sp), -0.6, 0.6)
  car.steer += (steerT - car.steer) * Math.min(1, h * 10)
}

// Only the instances drawn this frame go up to the GPU, not the whole buffer (nothing, if none are)
function dirty (a, count) {
  if (!count) return
  a.clearUpdateRanges()
  a.addUpdateRange(0, count * a.itemSize)
  a.needsUpdate = true
}

export class TrafficView {
  constructor (group, max = 420) {
    // paint under a hard clear coat: the sky sharp in it, the colour beneath a little metallic
    const paint = new THREE.MeshPhysicalMaterial({
      roughness: 0.36,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.045
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
    // the trim, its lamps lit per car (carLamps.js)
    const trim = lampMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        side: THREE.DoubleSide
      })
    )
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
      // which of its lamps are lit, per car: headlights, tail lights, braking, flags
      const lit = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4)
      lit.setUsage(THREE.DynamicDrawUsage)
      sh.trim.setAttribute('aLit', lit)
      return { T, S: sh.S, steel: STEEL.has(T.name), lit, ...parts }
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
    // far off, a car's wheels are the plain ones (carWheels.js)
    this.farWheels = mesh(
      farWheelGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        metalness: 0.2
      }),
      max * 4,
      false
    )
    this.night = false
    this.max = max
    this.t = 0
    this.counts = new Int32Array(TYPES.length)
    this.near = new Int32Array(TYPES.length) // (how many of each type cast shadows)
    this.n = { tyre: 0, alloy: 0, steel: 0, far: 0, under: 0, beam: 0 }
    this.dynamic = [
      this.tyres,
      this.rims.alloy,
      this.rims.steel,
      this.farWheels,
      this.under,
      this.beams
    ]
    // into the shadow map, only the cars near the Roadster (the first near[type] instances)
    this.types.forEach((ty, k) => {
      for (const m of [ty.body, ty.trim, ty.glass]) {
        m.onBeforeShadow = () => {
          m.full = m.count
          m.count = Math.min(m.count, this.near[k])
        }
        m.onAfterShadow = () => {
          m.count = m.full
        }
      }
    })
  }

  // view: a THREE.Frustum of what the camera sees (none: draw every car)
  // view: a THREE.Frustum of what the camera sees (none: draw every car). Cars within NEAR of the
  // Roadster go first in each type's instances, and only they are drawn into its shadow map (the
  // shadow pass draws this.near[type] of them); further off, their wheels are the cheap ones.
  update (traffic, dt = 0, view = null) {
    const counts = this.counts,
      near = this.near
    counts.fill(0)
    this.t = traffic.t
    RIDE_DT.dt = dt
    const n = this.n
    n.tyre = n.alloy = n.steel = n.far = n.under = n.beam = 0
    const s = traffic.sim,
      p = s ? (s.mode === 'ground' ? s.pos : s.com) : null
    for (let pass = 0; pass < 2; pass++) {
      for (const car of traffic.cars) {
        const dx = p ? car.x - p.x : 0,
          dz = p ? car.z - p.z : 0
        if (dx * dx + dz * dz < NEAR * NEAR !== (pass === 0)) continue
        this.put(car, dt, view, pass === 0)
      }
      if (pass === 0) for (let k = 0; k < counts.length; k++) near[k] = counts[k]
    }
    for (let k = 0; k < this.types.length; k++) {
      const ty = this.types[k],
        c = counts[k]
      ty.body.count = ty.trim.count = ty.glass.count = c
      dirty(ty.body.instanceMatrix, c)
      dirty(ty.trim.instanceMatrix, c)
      dirty(ty.glass.instanceMatrix, c)
      dirty(ty.body.instanceColor, c)
      dirty(ty.lit, c)
    }
    this.tyres.count = n.tyre
    this.rims.alloy.count = n.alloy
    this.rims.steel.count = n.steel
    this.farWheels.count = n.far
    this.under.count = n.under
    this.beams.count = n.beam
    for (const m of this.dynamic) dirty(m.instanceMatrix, m.count)
    dirty(this.rims.alloy.instanceColor, n.alloy)
    dirty(this.rims.steel.instanceColor, n.steel)
  }
  // one car into the instances (near: close to the Roadster, with full wheels)
  put (car, dt, view, near) {
    const ty = this.types[car.type],
      i = this.counts[car.type],
      n = this.n
    // (each type's meshes, and the ones every car shares, the shade under it, beams and wheels,
    // are sized for max cars: past that, the rest, the far ones, go undrawn)
    if (i >= this.max || n.under >= this.max) return
    const { T, S } = ty
    if (!car.parked || car.loose) ride(car, T, S)
    if (view) {
      _sp.center.x = car.x
      _sp.center.y = 1
      _sp.center.z = car.z
      _sp.radius = T.len / 2 + SHADOW_REACH
      if (!view.intersectsSphere(_sp)) return
    }
    this.counts[car.type]++
    // the car where it stands (in a parking lot, up on its raised slab), and its body tipped on
    // its springs about the axles' height
    // (vectors and quaternions written field by field: no numbers passed to calls)
    const y = car.parked && !car.jam ? CURB_H : 0
    yawTo(_q, car.yaw)
    _p.x = car.x
    _p.y = y
    _p.z = car.z
    _m.compose(_p, _q, _s)
    _p.y = y + 0.012
    _sc.x = T.len + 0.5
    _sc.y = 1
    _sc.z = T.wid + 0.45
    this.under.setMatrixAt(n.under++, _w.compose(_p, _q, _sc))
    _b.copy(_m)
    if (!car.parked || car.loose) {
      // tipped about the axles' height: roll about x, then pitch about z
      const cr = Math.cos(car.roll),
        sr = Math.sin(car.roll),
        cp = Math.cos(car.pitch),
        sp = Math.sin(car.pitch)
      const r = S.r,
        e = _t.elements
      // Rx(roll) Rz(pitch), and the translation keeping (0, r, 0) where it was
      e[0] = cp
      e[1] = cr * sp
      e[2] = sr * sp
      e[4] = -sp
      e[5] = cr * cp
      e[6] = sr * cp
      e[8] = 0
      e[9] = -sr
      e[10] = cr
      e[12] = r * sp
      e[13] = r - r * cr * cp
      e[14] = -r * sr * cp
      e[3] = e[7] = e[11] = 0
      e[15] = 1
      _b.multiply(_t)
    }
    ty.body.setMatrixAt(i, _b)
    ty.trim.setMatrixAt(i, _b)
    ty.glass.setMatrixAt(i, _b)
    const fixed = FIXED[T.name]
    const col = fixed
      ? fixed[Math.floor(car.paint * fixed.length)]
      : PALETTE[Math.floor(car.paint * 256)]
    ty.body.setColorAt(i, col)
    // wheels, turning with the distance driven, the fronts steering (far off, the plain ones)
    const rims = ty.steel ? this.rims.steel : this.rims.alloy,
      finish = ty.steel ? RIM_FINISH.steel : RIM_FINISH.alloy
    const rimCol = finish[Math.floor(((car.paint * 7.7) % 1) * finish.length)]
    const spin = -car.odo / S.r
    _sc.x = _sc.y = S.r
    _sc.z = 0.24
    for (let a = 0; a < 2; a++) {
      const ax = S.axles[a]
      for (let side = -1; side <= 1; side += 2) {
        // turning about z with the distance driven, the fronts steered about y
        _q._x = _q._y = 0
        _q._z = Math.sin(spin / 2)
        _q._w = Math.cos(spin / 2)
        if (ax > 0 && car.steer) {
          yawTo(_r, car.steer)
          _q.premultiply(_r)
        }
        _p.x = ax
        _p.y = S.r
        _p.z = side * (T.wid / 2 - 0.17)
        _w.compose(_p, _q, _sc)
        _w.premultiply(_m)
        if (!near) this.farWheels.setMatrixAt(n.far++, _w)
        else {
          this.tyres.setMatrixAt(n.tyre++, _w)
          const k = ty.steel ? n.steel++ : n.alloy++
          rims.setMatrixAt(k, _w)
          rims.setColorAt(k, rimCol)
        }
      }
    }
    // (in a parking lot, its lights are off; on the road at night, its beams are on the road)
    const lit = !car.parked || car.jam,
      night = this.night
    if (lit && night) {
      _p.x = T.len / 2 + 7
      _p.y = 0.025
      _p.z = 0
      _p.applyMatrix4(_m)
      yawTo(_q, car.yaw)
      _sc.x = 14
      _sc.y = 1
      _sc.z = 6.5
      this.beams.setMatrixAt(n.beam++, _w.compose(_p, _q, _sc))
    }
    // its lamps: on in traffic (running lights by day, headlights at night), off parked in a lot;
    // each car's flasher keeps its own time, about one and a half flashes a second
    let flags = 0
    if (lit) {
      const on =
        car.sig &&
        Math.sin((this.t + car.paint * 3.1) * (8.6 + car.horn * 1.6)) > 0
      if (on) flags = car.sig === 3 ? 3 : car.sig
      if (car.v < -0.05) flags += 4
      if (car.big) flags += 8
      flags += 16 // (running lights)
    }
    const L = ty.lit.array,
      j = i * 4
    L[j] = lit ? (night ? 3.2 : 0.12) : 0
    L[j + 1] = lit ? (night ? 1.3 : 0.3) : 0
    L[j + 2] = lit && car.brake ? 1 : 0
    L[j + 3] = flags
  }
}
