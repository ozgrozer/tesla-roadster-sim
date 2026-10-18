// The pier's amusement park: the Ferris wheel, white steel turning slowly on its A-frames with its
// gondolas hanging level, its rim and spokes lit at night in colours that chase round it; and the
// roller coaster looping round the park on its columns (sim/edge.js COASTER), a train running round it,
// hauled slowly up the lift hill and racing down.
import * as THREE from 'three'
import { merge, box, tint } from './geo.js'
import { glowMaterial, glowPoints } from './cityGlow.js'
import { CURB_H } from '../sim/city.js'
import { WHEEL, COASTER } from '../sim/edge.js'

const TOP = CURB_H // the deck
const STEEL = 0xe9e7e1
const SPOKES = 16
const CARS = 20 // gondolas
const TURN = (2 * Math.PI) / 75 // rad/s: a turn every minute and a quarter
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  _t = new THREE.Vector3(),
  _up = new THREE.Vector3(0, 1, 0),
  X = new THREE.Vector3(1, 0, 0)

// the wheel, in its own frame: x across its face, y up, its axle along z
function wheelGeometry () {
  const parts = []
  for (const z of [-0.9, 0.9]) {
    parts.push(new THREE.TorusGeometry(WHEEL.r, 0.13, 5, 64).translate(0, 0, z))
    parts.push(new THREE.TorusGeometry(4, 0.1, 4, 24).translate(0, 0, z))
    for (let i = 0; i < SPOKES; i++)
      parts.push(
        box(0.6, -0.05, z - 0.05, WHEEL.r, 0.05, z + 0.05).rotateZ(
          (i / SPOKES) * Math.PI * 2
        )
      )
  }
  // cross-bars between the two rims, where each gondola hangs
  for (let i = 0; i < CARS; i++) {
    const a = (i / CARS) * Math.PI * 2
    parts.push(
      box(-0.07, -0.07, -0.95, 0.07, 0.07, 0.95).translate(
        Math.cos(a) * WHEEL.r,
        Math.sin(a) * WHEEL.r,
        0
      )
    )
  }
  parts.push(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 12).rotateX(Math.PI / 2))
  return tint(merge(parts), STEEL)
}

export function buildRides (group) {
  const steel = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.3
  })
  const yaw = -WHEEL.dir
  const hub = new THREE.Vector3(WHEEL.x, TOP + WHEEL.hub, WHEEL.z)
  // the turning part, and the lights on it
  const turning = new THREE.Group()
  turning.position.copy(hub)
  turning.rotation.set(0, yaw, 0)
  const wheel = new THREE.Mesh(wheelGeometry(), steel)
  wheel.castShadow = true
  turning.add(wheel)
  const bulbs = []
  for (const z of [-1, 1]) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      bulbs.push({
        x: Math.cos(a) * WHEEL.r,
        y: Math.sin(a) * WHEEL.r,
        z,
        color: 0xffffff,
        size: 0.9,
        k: 2.2
      })
    }
    for (let i = 0; i < SPOKES; i++)
      for (let k = 1; k <= 5; k++) {
        const a = (i / SPOKES) * Math.PI * 2,
          r = (k / 5.5) * WHEEL.r
        bulbs.push({
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          z,
          color: 0xffffff,
          size: 0.75,
          k: 1.6
        })
      }
  }
  const uTime = { value: 0 }
  const chase = glowMaterial({
    haze: 0.25,
    uniforms: { uTime },
    move: `float ang = atan(p.y, p.x), rad = length(p.xy);
      float h = fract(ang / 6.2832 * 2.0 + uTime * 0.15 - rad * 0.02);
      tint = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * 0.85 + 0.15;
      k = 0.65 + 0.35 * step(0.5, fract(rad * 0.4 - uTime * 1.2));`
  })
  chase.vertexShader = chase.vertexShader.replace(
    'void main(){',
    'uniform float uTime;\n      void main(){'
  )
  const lights = glowPoints(bulbs, chase)
  lights.visible = false
  turning.add(lights)
  // what stands still: its A-frames and platform, and the coaster's track and columns
  const fixed = []
  const along = new THREE.Vector3(Math.cos(WHEEL.dir), 0, Math.sin(WHEEL.dir)),
    axle = new THREE.Vector3(-Math.sin(WHEEL.dir), 0, Math.cos(WHEEL.dir))
  for (const f of WHEEL.feet) {
    const to = new THREE.Vector3(f.x, TOP, f.z)
    const side = Math.sign(_t.subVectors(to, hub).dot(axle))
    const from = hub.clone().addScaledVector(axle, side * 1.5)
    const len = from.distanceTo(to)
    const leg = box(-0.25, 0, -0.25, 0.25, len, 0.25)
    _q.setFromUnitVectors(_up, _t.subVectors(from, to).normalize())
    leg.applyMatrix4(_m.compose(to, _q, _s))
    fixed.push(tint(leg, STEEL))
  }
  fixed.push(
    tint(
      box(WHEEL.x - 5, TOP, WHEEL.z - 3, WHEEL.x + 5, TOP + 1.2, WHEEL.z + 3),
      0x9e9a92
    )
  )

  // the gondolas: they hang level as the wheel turns
  const cab = merge([
    tint(box(-0.8, -1.9, -0.75, 0.8, -0.4, 0.75), 0xffffff),
    tint(box(-0.95, -0.4, -0.9, 0.95, -0.25, 0.9), 0xd9d6cf),
    tint(box(-0.04, -0.4, -0.04, 0.04, 0.05, 0.04), 0x777777)
  ])
  const cabs = new THREE.InstancedMesh(
    cab,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    CARS
  )
  const paints = [0xd8392b, 0xf2b632, 0x2c7fb8, 0x38a169, 0xe46a2e]
  const c = new THREE.Color()
  for (let i = 0; i < CARS; i++)
    cabs.setColorAt(i, c.set(paints[i % paints.length]))
  cabs.castShadow = true
  // (they move: bounds round the whole wheel, set once, rather than none)
  cabs.boundingSphere = new THREE.Sphere(hub, WHEEL.r + 3)
  const cabTurn = new THREE.Quaternion().setFromAxisAngle(_up, yaw)

  // the coaster: two rails along a smooth loop through its points, ties across them, a column under
  // each point (where the sim has them), and a train
  const pts = COASTER.map(([x, y, z]) => new THREE.Vector3(x, TOP + y, z))
  const track = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  const N = 220,
    left = [],
    right = [],
    bulbs2 = []
  for (let i = 0; i < N; i++) {
    const p = track.getPointAt(i / N),
      t = track.getTangentAt(i / N)
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize()
    left.push(p.clone().addScaledVector(side, 0.55))
    right.push(p.clone().addScaledVector(side, -0.55))
    if (i % 2 === 0) {
      const tie = box(-0.12, -0.18, -0.65, 0.12, -0.06, 0.65)
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side)
      fixed.push(tint(tie.applyMatrix4(_m.compose(p, _q, _s)), 0x8a8780))
    }
    if (i % 3 === 0)
      bulbs2.push({
        x: p.x,
        y: p.y - 0.25,
        z: p.z,
        color: 0xffe6b0,
        size: 0.6,
        k: 1.8
      })
  }
  for (const rail of [left, right])
    fixed.push(
      tint(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(rail, true),
          N,
          0.09,
          5,
          true
        ),
        0xf0eee8
      )
    )
  for (const p of pts)
    if (p.y - TOP > 1.6)
      fixed.push(
        tint(
          new THREE.CylinderGeometry(0.3, 0.4, p.y - TOP - 0.2, 8).translate(
            p.x,
            TOP + (p.y - TOP - 0.2) / 2,
            p.z
          ),
          0xb9b5ad
        )
      )
  const still = new THREE.Mesh(merge(fixed), steel)
  still.castShadow = still.receiveShadow = true
  const train = new THREE.InstancedMesh(
    merge([
      tint(box(-0.95, 0, -0.6, 0.95, 0.75, 0.6), 0xc8352a),
      tint(box(-0.95, 0.75, -0.6, -0.6, 1.05, 0.6), 0x222222)
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    4
  )
  train.castShadow = true
  train.boundingSphere = new THREE.Box3()
    .setFromPoints(pts)
    .getBoundingSphere(new THREE.Sphere())
  train.boundingSphere.radius += 3
  const len = track.getLength()
  let s = 0,
    last = 0
  const glow2 = glowMaterial({ haze: 0.25 })
  const trackLights = glowPoints(bulbs2, glow2)
  trackLights.visible = false
  group.add(turning, still, cabs, train, trackLights)
  const top = Math.max(...pts.map(p => p.y))

  return {
    update (t) {
      const a = t * TURN
      turning.rotation.z = a
      uTime.value = t
      for (let i = 0; i < CARS; i++) {
        const b = a + (i / CARS) * Math.PI * 2
        _p.copy(hub)
          .addScaledVector(along, Math.cos(b) * WHEEL.r)
          .add(_t.set(0, Math.sin(b) * WHEEL.r, 0))
        cabs.setMatrixAt(i, _m.compose(_p, cabTurn, _s))
      }
      cabs.instanceMatrix.needsUpdate = true
      // the train: up the lift hill (the climb from the station) at a walk, and down the rest as
      // fast as its height lets it
      const dt = Math.min(0.1, Math.max(0, t - last))
      last = t
      const y = track.getPointAt(s / len).y
      const lift = s / len > 0.08 && s / len < 0.235
      s =
        (s + dt * (lift ? 3 : Math.sqrt(16 + 2 * 9.8 * Math.max(0, top - y)))) %
        len
      for (let i = 0; i < 4; i++) {
        const u = ((s - i * 2.1 + len) % len) / len
        // (the way it points: toward a point just ahead; three.js's getTangentAt makes new vectors)
        track.getPointAt(u, _p)
        track
          .getPointAt((u + 0.003) % 1, _t)
          .sub(_p)
          .normalize()
        _q.setFromUnitVectors(X, _t)
        train.setMatrixAt(i, _m.compose(_p, _q, _s))
      }
      train.instanceMatrix.needsUpdate = true
    },
    night (k) {
      chase.uniforms.uOn.value = k
      lights.visible = k > 0.01
      glow2.uniforms.uOn.value = k
      trackLights.visible = k > 0.01
    }
  }
}
