// Traffic cars: fourteen body types (carShapes.js), instanced per type, painted the way Los
// Angeles' cars are (carPaint.js), each a solid or a metallic under the clear coat and some with a
// black roof, on low-profile tyres and rims of their own design (carWheels.js) that roll with the
// distance driven and steer through the turns; bodies that ride on their springs (carRide.js),
// headlights, tail lights that brighten under braking, white reversing lights, amber indicators
// that blink for lane changes and turns, each car's in its own time (and both at once, hazards, for
// a car knocked out of its lane or making a delivery), a police car's light bar flashing on some, a
// box truck's roller door run up at a delivery stop, and a soft shadow on the road under each car,
// where its body shuts out the sky. Parked in a lot, a car's lights are off. Drivers switch their
// headlights on as the city's light asks for them (sim/env.js headlights: dusk, the dark, the rain,
// the fog), each at their own moment, and their beams lie on the road once it is dark enough to see
// them; tail lights read brighter in the rain. A car on a call has its warning lamps going all the
// time, brighter at night, when it throws their red and blue (or red and white) on the road round
// it, and it flashes its headlights at the Roadster in its way; a lowrider's body rises off its
// wheels on its hydraulics (carRide.js). A car that has been hit shows it: crumpled where it was
// hit, lamps broken, glass crazed or gone (carDents.js), steam or smoke from under its bonnet
// (wreckSmoke.js). Only the cars the camera can see are drawn (or whose
// shadows it can: the frustum is let out a little for those), in the view and in the sun's shadow
// map alike; out of sight a car costs nothing but its springs.
import * as THREE from 'three'
import { ENV } from '../sim/env.js'
import { CURB_H } from '../sim/city.js'
import { clamp } from '../sim/constants.js'
import { TYPES } from '../sim/traffic.js'
import { ride, RIDE_DT } from './carRide.js'
import { wreckSmoke } from './wreckSmoke.js'
import { carShape, bodyMaterial } from './carShapes.js'
import { dentsFor, putDents, headlightsLeft } from './carDents.js'
import { lampMaterial, LAMP_T, LAMP_DARK, BARS } from './carLamps.js'
import {
  RIM_FINISH,
  ALLOY,
  rimMaterial,
  rimGeometry,
  tyreGeometry,
  farWheelGeometry
} from './carWheels.js'
import {
  paletteFor,
  blackRoofOf,
  RIMS,
  underTexture,
  beamTexture,
  glowTexture
} from './carPaint.js'

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

// How far into the city's light a car's driver switches on (0 to 1, by its paint: each their own
// moment), and a step a little soft at the edges
const switchAt = car => 0.06 + 0.5 * ((car.paint * 13.71) % 1)
const step = (a, x) => clamp((x - a) / 0.08, 0, 1)
const _c = new THREE.Color()

// Only the instances drawn this frame go up to the GPU, not the whole buffer (nothing, if none are)
function dirty (a, count) {
  if (!count) return
  a.clearUpdateRanges()
  a.addUpdateRange(0, count * a.itemSize)
  a.needsUpdate = true
}
// a per-instance attribute on g, sized for n
function perCar (g, name, n, size) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size)
  a.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute(name, a)
  return a
}

export class TrafficView {
  constructor (group, max = 420) {
    // paint under a hard clear coat: the sky sharp in it, the colour beneath solid or metallic per
    // car (bodyMaterial)
    const paint = new THREE.MeshPhysicalMaterial({
      roughness: 0.36,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.04
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
    this.types = TYPES.map((T, k) => {
      const sh = carShape(T)
      const parts = {
        body: mesh(sh.paint, bodyMaterial(paint, sh.arch)),
        glass: mesh(sh.glass, glass),
        trim: mesh(sh.trim, trim)
      }
      parts.body.setColorAt(0, new THREE.Color()) // allocates the per-car paint
      // each car's finish (bodyMaterial), and which of its lamps are lit: headlights, tail lights,
      // braking, flags; and its damage, which all its meshes read and are bent by (carDents.js)
      const finish = perCar(sh.paint, 'aPaint', max, 1)
      const lit = perCar(sh.trim, 'aLit', max, 4)
      return {
        T,
        S: sh.S,
        lit,
        finish,
        ...dentsFor(parts, max, k, sh.S),
        pal: paletteFor(T.name),
        roofs: blackRoofOf(T.name),
        rims: RIMS[T.name],
        rimOut: RIMS[T.name].out || 1,
        bar: BARS[T.name] || null,
        ...parts
      }
    })
    this.tyres = mesh(
      tyreGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.86 }),
      max * 4,
      false
    )
    const rg = rimGeometry()
    this.rimKind = perCar(rg, 'aRim', max * 4, 1)
    this.rims = mesh(rg, rimMaterial(), max * 4, false)
    this.rims.setColorAt(0, RIM_FINISH[0])
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
    this.beams.setColorAt(0, _c.setRGB(1, 1, 1)) // (each car's beams as bright as they are on)
    // the red and the blue of a light bar on a call, thrown on the road round the car at night
    this.glow = mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      }),
      8,
      false
    )
    this.glow.receiveShadow = false
    this.glow.setColorAt(0, _c.setRGB(1, 1, 1))
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
    this.night = false // (night all at once, as before the city's light: sim/env.js)
    this.env = ENV // the hour and the weather the lights follow
    this.lights = 0 // how far into needing their headlights drivers are (0 to 1)
    this.dark = 0 // and how dark it is for their beams to show
    this.max = max
    this.t = 0
    this.counts = new Int32Array(TYPES.length)
    this.near = new Int32Array(TYPES.length) // (how many of each type cast shadows)
    this.n = { tyre: 0, rim: 0, far: 0, under: 0, beam: 0, glow: 0 }
    this.dynamic = [
      this.tyres,
      this.rims,
      this.farWheels,
      this.under,
      this.beams,
      this.glow
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

  // view: a THREE.Frustum of what the camera sees (none: draw every car). Cars within NEAR of the
  // Roadster go first in each type's instances, and only they are drawn into its shadow map (the
  // shadow pass draws this.near[type] of them); further off, their wheels are the cheap ones.
  update (traffic, dt = 0, view = null) {
    const counts = this.counts,
      near = this.near
    counts.fill(0)
    this.t = traffic.t
    LAMP_T.value = traffic.t
    RIDE_DT.dt = dt
    // (the city's light: what drivers switch their headlights on for, and how dark it is for their
    // beams and a light bar's glow on the road; the night switch, while it is still about, as one)
    const night = this.night ? 1 : 0,
      env = this.env
    this.lights = Math.max(night, env.headlights)
    this.dark = Math.max(night, env.dark)
    LAMP_DARK.value = this.dark
    const n = this.n
    n.tyre = n.rim = n.far = n.under = n.beam = n.glow = 0
    const s = traffic.sim,
      p = s ? (s.mode === 'ground' ? s.pos : s.com) : null
    for (let pass = 0; pass < 2; pass++) {
      for (const car of traffic.cars) {
        const dx = p ? car.x - p.x : 0,
          dz = p ? car.z - p.z : 0
        if (dx * dx + dz * dz < NEAR * NEAR !== (pass === 0)) continue
        this.put(car, dt, view, pass === 0)
      }
      if (pass === 0)
        for (let k = 0; k < counts.length; k++) near[k] = counts[k]
    }
    if (p) wreckSmoke(traffic, dt, p, this.types) // (off damaged cars and wrecks)
    for (let k = 0; k < this.types.length; k++) {
      const ty = this.types[k],
        c = counts[k]
      ty.body.count = ty.trim.count = ty.glass.count = c
      dirty(ty.body.instanceMatrix, c)
      dirty(ty.trim.instanceMatrix, c)
      dirty(ty.glass.instanceMatrix, c)
      dirty(ty.body.instanceColor, c)
      dirty(ty.finish, c)
      dirty(ty.lit, c)
      dirty(ty.dent, c)
      dirty(ty.hurt, c)
    }
    this.tyres.count = n.tyre
    this.rims.count = n.rim
    this.farWheels.count = n.far
    this.under.count = n.under
    this.beams.count = n.beam
    this.glow.count = n.glow
    for (const m of this.dynamic) dirty(m.instanceMatrix, m.count)
    dirty(this.rims.instanceColor, n.rim)
    dirty(this.rimKind, n.rim)
    dirty(this.beams.instanceColor, n.beam)
    dirty(this.glow.instanceColor, n.glow)
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
    // (the player's car rides on its springs too: drivable.js, handover.js)
    const rides = !car.parked || car.loose || !!car.ctl
    if (rides && !car.posed) ride(car, T, S) // (the player's own: posed, playerCar.js)
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
    // (one the player drives or left in the street stands on the road, or what it was driven onto)
    const y = car.parked && !car.jam && !car.ctl && !car.abandoned ? CURB_H : 0
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
    if (rides) {
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
      e[13] = r - r * cr * cp + car.lift
      e[14] = -r * sr * cp
      e[3] = e[7] = e[11] = 0
      e[15] = 1
      _b.multiply(_t)
    }
    ty.body.setMatrixAt(i, _b)
    ty.trim.setMatrixAt(i, _b)
    ty.glass.setMatrixAt(i, _b)
    putDents(ty, i, car)
    // its paint: colour, solid or metallic, and a black roof on some
    const pe = ty.pal[Math.floor(car.paint * 256) & 255]
    ty.body.setColorAt(i, pe.c)
    ty.finish.array[i] =
      pe.metal + (pe.light && (car.paint * 37.3) % 1 < ty.roofs ? 2 : 0)
    // wheels, turning with the distance driven, the fronts steering (far off, the plain ones)
    const spin = -car.odo / S.r,
      wsp = car.wspin || 0 // (the player's rears, spun or locked: playerCar.js)
    const kinds = ty.rims.kinds,
      kind = kinds[Math.floor(((car.paint * 5.3) % 1) * kinds.length)]
    const rimCol = ALLOY.has(kind)
      ? RIM_FINISH[Math.floor(((car.paint * 7.7) % 1) * RIM_FINISH.length)]
      : RIM_FINISH[0]
    for (let a = 0; a < 2; a++) {
      const ax = S.axles[a]
      for (let side = -1; side <= 1; side += 2) {
        // turning about z with the distance driven, the fronts steered about y
        _q._x = _q._y = 0
        _q._z = Math.sin((ax > 0 ? spin : spin - wsp) / 2)
        _q._w = Math.cos((ax > 0 ? spin : spin - wsp) / 2)
        if (ax > 0 && car.steer) {
          yawTo(_r, car.steer)
          _q.premultiply(_r)
        }
        _p.x = ax
        _p.y = S.r
        _p.z = side * S.track
        _sc.x = _sc.y = S.r
        _sc.z = S.tyre
        _w.compose(_p, _q, _sc)
        _w.premultiply(_m)
        if (!near) this.farWheels.setMatrixAt(n.far++, _w)
        else {
          this.tyres.setMatrixAt(n.tyre++, _w)
          _sc.x = _sc.y = S.r * ty.rims.size
          _sc.z = S.tyre * ty.rimOut
          _w.compose(_p, _q, _sc)
          _w.premultiply(_m)
          const k = n.rim++
          this.rims.setMatrixAt(k, _w)
          this.rims.setColorAt(k, rimCol)
          this.rimKind.array[k] = kind
        }
      }
    }
    // (in a parking lot its lights are off; on the road its driver switches the headlights on at
    // their own moment as the light goes, and once it is dark enough their beams show on the road)
    const lit = !car.parked || car.jam || !!car.ctl
    const hl = lit ? step(car.player ? 0.1 : switchAt(car), this.lights) : 0,
      beam =
        hl * clamp((this.dark - 0.25) / 0.45, 0, 1) * headlightsLeft(car) * 0.5
    if (beam > 0.01 && n.beam < this.max) {
      _p.x = T.len / 2 + 7
      _p.y = 0.025
      _p.z = 0
      _p.applyMatrix4(_m)
      yawTo(_q, car.yaw)
      _sc.x = 14
      _sc.y = 1
      _sc.z = 6.5
      this.beams.setMatrixAt(n.beam, _w.compose(_p, _q, _sc))
      this.beams.setColorAt(n.beam++, _c.setRGB(beam, beam, beam))
    }
    // a police car on a call: its light bar going all the time, and at night its red and blue
    // thrown on the road round it with each flash (the bar's own pattern: carLamps.js)
    const call = car.siren === 1,
      phase = ((car.paint * 17.9) % 1) * 0.98
    if (call && this.dark > 0.15 && n.glow < 8) {
      const q = (this.t * 1.5 + phase) % 1
      const red = q < 0.1 || (q > 0.18 && q < 0.28),
        blue = (q > 0.5 && q < 0.6) || (q > 0.68 && q < 0.78)
      if (red || blue) {
        const k = Math.min(1, this.dark * 1.3)
        _p.x = car.x
        _p.y = y + 0.03
        _p.z = car.z
        yawTo(_q, car.yaw)
        _sc.x = 12
        _sc.y = 1
        _sc.z = 9
        this.glow.setMatrixAt(n.glow, _w.compose(_p, _q, _sc))
        const g = ty.bar.glow
        if (red) _c.setRGB(k, 0.04 * k, 0.03 * k)
        else _c.setRGB(g[0] * k, g[1] * k, g[2] * k)
        this.glow.setColorAt(n.glow++, _c)
      }
    }
    // its lamps: on in traffic (running lights by day, headlights once its driver switches them
    // on), off parked in a lot; each car's flasher keeps its own time, about one and a half flashes
    // a second; flashing its headlights at the Roadster in its way, about three times a second. A
    // police car's light bar flashes on about one in three, parked or not, in its own time (the
    // flags' fraction), and any car's warning lamps always on a call (brighter at night: 64); a box
    // truck's door up (128), how far in the fraction
    let flags = 0
    if (lit) {
      const on =
        car.sig &&
        Math.sin((this.t + car.paint * 3.1) * (8.6 + car.horn * 1.6)) > 0
      if (on) flags = car.sig === 3 ? 3 : car.sig
      if (car.v < -0.05 || car.revLamp) flags += 4
      if (car.big) flags += 8
      flags += 16 // (running lights)
    }
    if (ty.bar && (call || (car.paint * 11.3) % 1 < ty.bar.off))
      flags += 32 + (call ? 64 : 0) + phase
    else if (car.drop?.door > 0) flags += 128 + Math.min(car.drop.door, 0.999)
    const L = ty.lit.array,
      j = i * 4
    L[j] = !lit
      ? 0
      : car.flash
      ? Math.sin(this.t * 19) > 0
        ? 3.6
        : 0.12
      : 0.12 + 3.08 * hl
    L[j + 1] = lit ? 0.3 + hl + 0.5 * this.env.rain : 0
    L[j + 2] = lit && car.brake ? 1 : 0
    L[j + 3] = flags
  }
}
