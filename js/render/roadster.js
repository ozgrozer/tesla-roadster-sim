// The Roadster model: lofted angular wedge body, gold-tinted canopy, light bars, 10 gold-ringed nozzles,
// active rear wing, underfloor suction fan, skirts and wheels; plus per-frame pose and animation.
import * as THREE from 'three'
import { scene, MAT } from './scene.js'
import { buildWheels, updateWheels, withWheelArches } from './wheels.js'
import { TAU, clamp } from '../sim/constants.js'

const _a = new THREE.Vector3()

// ---------- the Roadster ----------
function loft (stations, matFor, capMat) {
  const buckets = new Map()
  const push = (mat, ...v) => {
    if (!buckets.has(mat)) buckets.set(mat, [])
    buckets.get(mat).push(...v)
  }
  for (let k = 0; k < stations.length - 1; k++) {
    const A = stations[k],
      B = stations[k + 1]
    for (let j = 0; j < A.p.length - 1; j++) {
      const mat = matFor(j, A.x, B.x)
      for (const sg of [1, -1]) {
        const a = [A.x, A.p[j][1], sg * A.p[j][0]],
          b = [A.x, A.p[j + 1][1], sg * A.p[j + 1][0]]
        const c = [B.x, B.p[j][1], sg * B.p[j][0]],
          d = [B.x, B.p[j + 1][1], sg * B.p[j + 1][0]]
        if (sg > 0) push(mat, ...a, ...c, ...b, ...c, ...d, ...b)
        else push(mat, ...a, ...b, ...c, ...c, ...b, ...d)
      }
    }
  }
  const cap = (S, front) => {
    const ringPts = [
      ...S.p.map(([z, y]) => [z, y]),
      ...S.p
        .slice(1, -1)
        .reverse()
        .map(([z, y]) => [-z, y])
    ]
    const cy = S.p.reduce((s, p) => s + p[1], 0) / S.p.length
    for (let i = 0; i < ringPts.length; i++) {
      const p = ringPts[i],
        q = ringPts[(i + 1) % ringPts.length]
      const O = [S.x, cy, 0],
        P1 = [S.x, p[1], p[0]],
        P2 = [S.x, q[1], q[0]]
      if (front) push(capMat, ...O, ...P2, ...P1)
      else push(capMat, ...O, ...P1, ...P2)
    }
  }
  cap(stations[0], false)
  cap(stations[stations.length - 1], true)
  const group = new THREE.Group()
  for (const [mat, arr] of buckets) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  return group
}

export function buildRoadster () {
  const car = new THREE.Group()
  const body = new THREE.Group()
  car.add(body)
  // stations: x, bottom y, half width, belt y, shoulder half width, top y, crown, fender lift
  // (the fenders rise over the wheels and stay flat across the well, so the arches have bodywork
  // above them; the extra point at z = 0.46 sits just inboard of the wheel well)
  const S = [
    [-2.22, 0.3, 0.9, 0.8, 0.8, 0.86, 0.0, 0],
    [-2.0, 0.18, 0.96, 0.8, 0.84, 0.88, 0.01, 0],
    [-1.35, 0.12, 0.99, 0.78, 0.86, 0.86, 0.02, 0.05],
    [-0.6, 0.12, 0.99, 0.74, 0.84, 0.8, 0.02, 0],
    [0.4, 0.12, 0.99, 0.7, 0.84, 0.76, 0.02, 0],
    [1.0, 0.12, 0.984, 0.649, 0.84, 0.697, 0.026, 0.09],
    [1.35, 0.12, 0.98, 0.62, 0.84, 0.66, 0.03, 0.17],
    [1.72, 0.133, 0.953, 0.539, 0.827, 0.572, 0.023, 0.1],
    [1.9, 0.14, 0.94, 0.5, 0.82, 0.53, 0.02, 0],
    [2.22, 0.17, 0.84, 0.36, 0.74, 0.4, 0.0, 0]
  ].map(([x, yb, hw, yBelt, hwT, yTop, cr, f]) => ({
    x,
    p: [
      [0, yb],
      [hw - 0.1, yb],
      [hw, yb + 0.17],
      [hw, yBelt + f],
      [hwT, yTop + f],
      [0.46, yTop + f + cr * (1 - 0.46 / hwT)],
      [0, yTop + cr]
    ]
  }))
  const shell = withWheelArches(MAT.paint)
  const shellTrim = withWheelArches(MAT.trim)
  body.add(loft(S, j => (j <= 1 ? shellTrim : shell), shellTrim))
  // canopy: gold-tinted glass greenhouse
  const C = [
    [-1.6, 0.76, 0.87, 0.5, 0.88],
    [-1.1, 0.8, 0.84, 0.52, 1.02],
    [-0.6, 0.8, 0.8, 0.54, 1.12],
    [0.0, 0.8, 0.77, 0.52, 1.12],
    [0.85, 0.72, 0.71, 0.5, 0.72]
  ].map(([x, hwB, yB, hwT, yT]) => ({
    x,
    p: [
      [0, yB - 0.06],
      [hwB, yB - 0.02],
      [hwT, yT],
      [0, yT + 0.015]
    ]
  }))
  body.add(loft(C, () => MAT.glass, MAT.glass))
  // Starman in the driver's seat
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 12),
    MAT.suit
  )
  helmet.position.set(-0.22, 0.93, -0.36)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.32), MAT.suit)
  torso.position.set(-0.35, 0.72, -0.36)
  body.add(helmet, torso)
  // light bars
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.028, 1.46),
    MAT.headlight
  )
  front.position.set(2.215, 0.385, 0)
  body.add(front)
  const rear = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.04, 1.66),
    MAT.taillight.clone()
  )
  rear.position.set(-2.225, 0.79, 0)
  body.add(rear)
  // rear diffuser + 4 main nozzles
  const diff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.6), MAT.trim)
  diff.position.set(-2.1, 0.3, 0)
  body.add(diff)
  const nozzles = []
  const ringGeo = new THREE.TorusGeometry(0.065, 0.017, 8, 20),
    holeGeo = new THREE.CircleGeometry(0.06, 16)
  function nozzle (x, y, z, dir, kind) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    const r = new THREE.Mesh(ringGeo, MAT.gold),
      h = new THREE.Mesh(holeGeo, MAT.hole)
    h.position.z = 0.004
    g.add(r, h)
    g.lookAt(_a.set(x, y, z).add(dir)) // local +z along the exhaust
    body.add(g)
    nozzles.push({
      kind,
      local: new THREE.Vector3(x, y, z),
      dir: dir.clone(),
      group: g
    })
  }
  for (const z of [-0.55, -0.2, 0.2, 0.55])
    nozzle(-2.26, 0.3, z, new THREE.Vector3(-1, 0, 0), 'main')
  for (const [x, z] of [
    [1.95, -0.62],
    [1.95, 0.62],
    [-1.95, -0.62],
    [-1.95, 0.62]
  ])
    nozzle(x, 0.115, z, new THREE.Vector3(0, -1, 0), 'lift')
  nozzle(-0.35, 0.44, -1.0, new THREE.Vector3(0, 0, -1), 'sideL')
  nozzle(-0.35, 0.44, 1.0, new THREE.Vector3(0, 0, 1), 'sideR')
  // active rear wing
  const wing = new THREE.Group()
  wing.position.set(-1.92, 0.9, 0)
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.035, 1.66),
    MAT.trim
  )
  blade.position.set(-0.08, 0.16, 0)
  blade.castShadow = true
  wing.add(blade)
  for (const z of [-0.5, 0.5]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.03), MAT.trim)
    st.position.set(0, 0.07, z)
    wing.add(st)
  }
  body.add(wing)
  // underfloor suction fan + skirts
  const fan = new THREE.Group()
  fan.position.set(-0.9, 0.105, 0)
  const duct = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.03, 8, 28),
    MAT.darkMetal
  )
  duct.rotation.x = Math.PI / 2
  fan.add(duct)
  const blades = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.07), MAT.steel)
    b.position.x = 0.14
    const p = new THREE.Group()
    p.rotation.y = (i * TAU) / 7
    b.rotation.x = 0.4
    p.add(b)
    blades.add(p)
  }
  fan.add(blades)
  body.add(fan)
  const skirts = []
  for (const z of [-0.96, 0.96]) {
    // between the wheel wells
    const sk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.03), MAT.trim)
    sk.position.set(0, 0.1, z)
    body.add(sk)
    skirts.push(sk)
  }
  const { wheels, axles } = buildWheels(car, body)
  car.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true
    }
  })
  scene.add(car)
  return {
    car,
    body,
    wheels,
    axles,
    nozzles,
    wing,
    wingAng: 0.06,
    blades,
    skirts,
    taillight: rear.material
  }
}

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)

// Pose the model from the sim and animate wheels, suspension, body roll/pitch, fan, skirts, wing and brake light.
export function updateRoadster (RS, sim, ctl, dt) {
  RS.car.position.copy(sim.pos)
  RS.car.quaternion.copy(sim.quat)
  RS.body.position.y = clamp(sim.susp, -0.12, 0.06) * 0.6
  const onGround = sim.mode === 'ground'
  const pitchVis = onGround ? clamp(-sim.accLong * 0.0022, -0.035, 0.035) : 0
  const rollVis = onGround ? clamp(sim.latAcc * 0.0035, -0.05, 0.05) : 0
  RS.body.rotation.z += (pitchVis - RS.body.rotation.z) * lerpK(6, dt)
  RS.body.rotation.x += (rollVis - RS.body.rotation.x) * lerpK(6, dt)
  updateWheels(RS, sim, dt)
  RS.blades.rotation.y += sim.suction * dt * 60
  for (const sk of RS.skirts) sk.position.y = 0.1 - 0.05 * sim.suction
  const spd = sim.groundSpeed()
  const wingT =
    sim.mode === 'ramp' || (sim.suction > 0.5 && spd < 35)
      ? 0.38
      : sim.mode === 'air'
      ? 0.15
      : 0.06
  RS.wingAng += (wingT - RS.wingAng) * lerpK(4, dt)
  RS.wing.rotation.z = -RS.wingAng
  const braking = (ctl.brake > 0 || ctl.ebrake) && spd > 0.5
  RS.taillight.color.setRGB(braking ? 7 : 2.6, braking ? 0.3 : 0.12, 0.1)
}
