// What flies over the city: an airliner every minute or two, high up on its way down to LAX (to
// the south-west), its wingtips' red and green and its white strobes blinking at night; and a
// helicopter, a police one or a news one, circling low over some part of town for a while, then
// moving on to another, its beacon flashing, and at night its searchlight sweeping the streets
// under it: a pale beam down through the air and a bright spot of light moving over the ground.
// Low-poly, a few meshes each, nothing on the ground's shaders: the searchlight's spot is a soft
// disc of light laid on the street. AIR says where they are, for the sound (audio/air.js).
import * as THREE from 'three'
import { merge, box, tint } from './geo.js'
import { GROUND } from './mirror.js'
import { softTex } from './scene.js'
import { HALF, BUILDINGS } from '../sim/city.js'

const R = Math.random
// where the aircraft are, for their sound: the helicopter, and the airliner (each its position
// and velocity; on: whether it is up at all)
export const AIR = {
  heli: { on: false, x: 0, y: 0, z: 0, vx: 0, vz: 0 },
  plane: { on: false, x: 0, y: 0, z: 0, vx: 0, vz: 0 }
}

// (a light, seen through the haze: the fog doesn't swallow it)
const lampMat = (r, g, b) =>
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(r, g, b),
    toneMapped: false,
    fog: false
  })
// how high the helicopter flies over a circle (cx, cz, r): clear of the tallest building under it;
// and on its way in and out, clear of the city's tallest (and the masts on top)
const clearOver = (cx, cz, r) =>
  BUILDINGS.reduce(
    (h, b) =>
      b.x1 > cx - r && b.x0 < cx + r && b.z1 > cz - r && b.z0 < cz + r
        ? Math.max(h, b.h + 45)
        : h,
    0
  )
let TOP = 0
const _from = new THREE.Vector3(),
  _to = new THREE.Vector3(),
  _down = new THREE.Vector3(0, -1, 0)

// ---------- the airliner: a twin-engined jet, about 40 m long, white with a grey belly ----------
function airliner () {
  const parts = [
    tint(
      new THREE.CylinderGeometry(1.9, 1.9, 34, 10, 1).rotateZ(Math.PI / 2),
      0xe8e9ea
    ),
    tint(
      new THREE.ConeGeometry(1.9, 5, 10)
        .rotateZ(-Math.PI / 2)
        .translate(19.5, 0, 0),
      0xe8e9ea
    ),
    tint(
      new THREE.ConeGeometry(1.9, 7, 10)
        .rotateZ(Math.PI / 2)
        .translate(-20.5, 0.6, 0),
      0xe8e9ea
    ),
    tint(box(-4, -0.8, -17, 4, -0.3, 17), 0xc9cbcd), // the wings
    tint(box(-22, 0.4, -6, -18.5, 0.7, 6), 0xc9cbcd), // the tailplane
    tint(box(-23, 0.5, -0.25, -17, 7.5, 0.25), 0x2f4a7a), // the fin
    tint(
      new THREE.CylinderGeometry(1.1, 1.1, 4.5, 8)
        .rotateZ(Math.PI / 2)
        .translate(1, -1.6, -6.5),
      0x9ea2a6
    ),
    tint(
      new THREE.CylinderGeometry(1.1, 1.1, 4.5, 8)
        .rotateZ(Math.PI / 2)
        .translate(1, -1.6, 6.5),
      0x9ea2a6
    )
  ]
  const g = new THREE.Group()
  g.add(
    new THREE.Mesh(
      merge(parts),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })
    )
  )
  // its lights: red to port (left), green to starboard, white strobes on the tips and the tail
  const red = lampMat(8, 0.3, 0.2),
    green = lampMat(0.3, 8, 1),
    strobe = lampMat(12, 12, 12)
  const dot = (mat, x, y, z, r = 0.6) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), mat)
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  dot(red, 0, -0.5, -17.3)
  dot(green, 0, -0.5, 17.3)
  g.userData.strobes = [
    dot(strobe, -0.2, -0.5, -17.6, 0.7),
    dot(strobe, -0.2, -0.5, 17.6, 0.7),
    dot(strobe, -23.4, 7.6, 0, 0.7)
  ]
  return g
}

// ---------- the helicopter: a light twin, black and white, about 13 m with its rotor ----------
function helicopter () {
  const g = new THREE.Group()
  const body = [
    tint(
      new THREE.SphereGeometry(1.25, 12, 8)
        .scale(1.7, 1, 1)
        .translate(0, 1.6, 0),
      0x15171a
    ),
    // the windscreen
    tint(
      new THREE.SphereGeometry(1.0, 10, 6)
        .scale(1.2, 0.8, 0.95)
        .translate(1.3, 1.5, 0),
      0x5d7b94
    ),
    tint(box(-0.9, 2.2, -0.95, 0.9, 2.55, 0.95), 0xe6e6e6), // a white roof band
    tint(
      new THREE.CylinderGeometry(0.22, 0.32, 5.6, 8)
        .rotateZ(Math.PI / 2)
        .translate(-4.4, 1.9, 0),
      0x15171a
    ),
    tint(box(-7.4, 1.7, -0.06, -6.6, 3.2, 0.06), 0xe6e6e6), // the tail fin
    tint(box(-1.6, 0.25, -1.05, 1.6, 0.35, -0.95), 0x2a2c30), // the skids
    tint(box(-1.6, 0.25, 0.95, 1.6, 0.35, 1.05), 0x2a2c30),
    tint(box(-0.6, 0.3, -1.0, -0.5, 0.9, 1.0), 0x2a2c30),
    tint(box(0.7, 0.3, -1.0, 0.8, 0.9, 1.0), 0x2a2c30),
    tint(box(-0.25, 2.5, -0.25, 0.25, 2.95, 0.25), 0x2a2c30) // the mast
  ]
  g.add(
    new THREE.Mesh(
      merge(body),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })
    )
  )
  // the rotor: a blurred disc, faint, and two blades turning in it
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(5.3, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x111214,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  blur.position.y = 3.0
  const blades = new THREE.Mesh(
    merge([
      box(-5.3, -0.02, -0.12, 5.3, 0.02, 0.12),
      box(-0.12, -0.02, -5.3, 0.12, 0.02, 5.3)
    ]),
    new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 })
  )
  blades.position.y = 3.0
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), blur.material)
  tail.position.set(-7.0, 2.4, 0.15)
  g.add(blur, blades, tail)
  g.userData.blades = blades
  // a red beacon flashing on its belly and tail
  const beacon = lampMat(9, 0.4, 0.2)
  for (const [x, y] of [
    [0, 0.45],
    [-7.3, 3.25]
  ]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), beacon)
    m.position.set(x, y, 0)
    g.add(m)
  }
  g.userData.beacon = beacon
  // the searchlight under its nose, and its beam down through the air
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0),
    new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 } },
      vertexShader: `varying float vT; varying vec3 vN, vV;
        void main(){
          vT = -position.y;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uI; varying float vT; varying vec3 vN, vV;
        void main(){
          float e = abs(dot(normalize(vN), normalize(vV)));
          gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * uI * e * e * (1.0 - 0.6 * vT), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  )
  beam.layers.set(GROUND)
  g.userData.beam = beam
  return g
}

export class Aircraft {
  constructor (group) {
    this.plane = airliner()
    this.plane.visible = false
    this.heli = helicopter()
    this.heli.visible = false
    this.beam = this.heli.userData.beam
    this.beam.visible = false
    // the searchlight's spot on the street
    this.spot = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: softTex,
        color: new THREE.Color(1.6, 1.65, 1.8),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6
      })
    )
    this.spot.layers.set(GROUND)
    this.spot.visible = false
    group.add(this.plane, this.heli, this.beam, this.spot)
    this.planeT = 25 + R() * 40 // s until the next airliner
    this.flight = null
    this.heliT = 10 + R() * 20 // s until the helicopter turns up
    this.orbit = null
    this.t = 0
  }
  // once a frame (dt: the world's s); dark: how dark it is (the lights); camera: where to keep the
  // helicopter in view of (not right over the camera, a few blocks off)
  update (dt, dark, camera) {
    this.t += dt
    this.flyPlane(dt, dark)
    this.flyHeli(dt, dark, camera)
  }
  flyPlane (dt, dark) {
    const p = this.plane,
      A = AIR.plane
    if (!this.flight) {
      if ((this.planeT -= dt) > 0) {
        p.visible = A.on = false
        return
      }
      // from the north-east, down over the city towards the airport, a little to one side each time
      const off = (R() - 0.5) * 900
      this.flight = {
        x: 2600 + off,
        z: -2600 + off,
        y: 1100 + R() * 500,
        vx: -62,
        vz: 62,
        sink: -1.5
      }
    }
    const f = this.flight
    f.x += f.vx * dt
    f.z += f.vz * dt
    f.y += f.sink * dt
    p.position.set(f.x, f.y, f.z)
    p.rotation.set(0, Math.atan2(-f.vz, f.vx), 0)
    p.visible = A.on = true
    Object.assign(A, f)
    const blink = (this.t * 1.1) % 1 < 0.08 ? 1 : 0
    for (const s of p.userData.strobes) s.visible = blink > 0 && dark > 0.2
    if (f.x < -2800) {
      this.flight = null
      this.planeT = 60 + R() * 90
    }
  }
  flyHeli (dt, dark, camera) {
    const h = this.heli,
      A = AIR.heli
    if (!this.orbit) {
      if ((this.heliT -= dt) > 0) {
        h.visible = this.beam.visible = this.spot.visible = A.on = false
        return
      }
      // somewhere a few blocks from the camera, but not over it
      const a = R() * Math.PI * 2,
        d = 160 + R() * 160
      const c = camera.position,
        cx = Math.max(-HALF, Math.min(HALF, c.x + Math.cos(a) * d)),
        cz = Math.max(-HALF, Math.min(HALF, c.z + Math.sin(a) * d))
      const r = 70 + R() * 60
      TOP = TOP || clearOver(0, 0, HALF + 100)
      this.orbit = {
        cx,
        cz,
        r,
        y: Math.max(130 + R() * 60, clearOver(cx, cz, r + 40)),
        a: R() * Math.PI * 2,
        w: (R() < 0.5 ? -1 : 1) * (0.09 + R() * 0.05),
        left: 50 + R() * 50, // s it circles before it moves on
        // flying in from the edge of town to its circle, and out again
        x: cx + Math.cos(a) * 900,
        z: cz + Math.sin(a) * 900,
        alt: TOP // (it comes in high, and comes down to its circle)
      }
    }
    const o = this.orbit
    o.left -= dt
    let tx, tz
    if (o.left > 0) {
      o.a += o.w * dt
      tx = o.cx + Math.cos(o.a) * o.r
      tz = o.cz + Math.sin(o.a) * o.r
    } else {
      tx = o.cx + (o.cx - camera.position.x) * 8
      tz = o.cz + (o.cz - camera.position.z) * 8
    }
    // towards where it is going at up to 40 m/s, turning to face its way, banking into the turn
    const dx = tx - o.x,
      dz = tz - o.z,
      d = Math.hypot(dx, dz),
      sp = Math.min(40, d * 0.8)
    const vx = d > 0.01 ? (dx / d) * sp : 0,
      vz = d > 0.01 ? (dz / d) * sp : 0
    o.x += vx * dt
    o.z += vz * dt
    // (down to its circle's height once it is over it, up clear of everything on its way)
    const over =
      o.left > 0 && Math.hypot(o.x - o.cx, o.z - o.cz) < o.r + 120
    o.alt += ((over ? o.y : Math.max(o.y, TOP)) - o.alt) * Math.min(1, dt * 0.4)
    const yaw = Math.atan2(-vz, vx)
    h.position.set(o.x, o.alt, o.z)
    h.rotation.set(0, yaw, -0.05 - 0.004 * sp, 'YXZ')
    h.userData.blades.rotation.y += dt * 28
    h.userData.beacon.color.setScalar(Math.sin(this.t * 6) > 0.7 ? 9 : 0.4)
    h.visible = A.on = true
    Object.assign(A, { x: o.x, y: o.alt, z: o.z, vx, vz })
    // its searchlight at night, on the street under its circle, wandering
    const lit = dark > 0.35 && o.left > 0
    this.beam.visible = this.spot.visible = lit
    if (lit) {
      const sx = o.cx + Math.cos(this.t * 0.37) * o.r * 0.5,
        sz = o.cz + Math.sin(this.t * 0.29) * o.r * 0.5
      _from.set(o.x, o.alt - 0.5, o.z)
      _to.set(sx, 0, sz)
      const len = _from.distanceTo(_to)
      this.beam.position.copy(_from)
      this.beam.scale.set(9, len, 9)
      this.beam.quaternion.setFromUnitVectors(
        _down,
        _to.sub(_from).normalize()
      )
      this.beam.material.uniforms.uI.value = 0.07 * dark
      this.spot.position.set(sx, 0.1, sz)
      this.spot.scale.set(22, 1, 22)
      this.spot.material.opacity = 0.75 * dark
    }
    if (o.left < -30) {
      this.orbit = null
      this.heliT = 40 + R() * 80
    }
  }
}
