// The Roadster model, measured off the Oct 15, 2026 reveal photos (a side-on shot at the event sets the
// proportions, a top-down one the canopy, a rear one the tail): a wedge in satin Ano White, smooth
// panels with crisp creases, a tall blunt nose, sloped fender facets either side of a short hood,
// squinting triangular headlights, one bronze-tinted canopy from a windshield nearly as wide as the car
// over the roof to a narrow tip at the tail, flanked by buttresses that run out to the tail corners, a
// black sill that rises to the rear, full-width light bars, the black tail with 4 nozzles over 4 fans
// (roadsterRear.js), an active rear wing, underfloor suction fan, skirts and twin-spoke aero wheels,
// the cabin with its yoke and touchscreen (roadsterCabin.js); plus per-frame pose and animation.
import * as THREE from 'three'
import { scene, MAT } from './scene.js'
import { CURB_H } from '../sim/city.js'
import { CAR, clamp, AX_Z } from '../sim/constants.js'
import { buildOptimus, poseOptimus } from './optimus.js'
import { DRIVER, buildCabin, updateCabin } from './roadsterCabin.js'
import { loft, loftGeos, at, seam, withStations } from './loft.js'
import { buildWheels, updateWheels, withWheelArches } from './wheels.js'
import { buildTail, buildWing, updateWing, fanUnit } from './roadsterRear.js'

const _a = new THREE.Vector3()
const SEAM = new THREE.MeshStandardMaterial({
  color: 0x0b0c0e,
  roughness: 0.7,
  side: THREE.DoubleSide
})

// ---------- shape ----------
// Body stations, tail to nose. The half section runs: floor centre, floor edge, top of the black sill,
// the side crease (widest point), the shoulder crest, the top and foot of the inner wall (the flying
// buttress's inner face at the rear; up front it shrinks to the hood's edge) and the centre of the
// hood or deck.
// Over each wheel everything outboard of the well wall (z > 0.5) stays above the arch cut.
// x, floor y, sill [z, y], crease [z, y], shoulder [z, y], wall top [z, y], wall foot [z, y], centre y
// prettier-ignore
const BODY = [
  [-2.22, 0.14, [0.8, 0.64], [0.86, 0.76], [0.87, 0.9], [0.8, 0.915], [0.27, 0.915], 0.915],
  [-2.12, 0.13, [0.88, 0.64], [0.93, 0.74], [0.92, 0.905], [0.78, 0.928], [0.27, 0.92], 0.92],
  [-1.95, 0.13, [0.91, 0.6], [0.97, 0.71], [0.95, 0.91], [0.72, 0.952], [0.29, 0.932], 0.93],
  [-1.8, 0.13, [0.92, 0.55], [0.98, 0.68], [0.96, 0.915], [0.69, 0.995], [0.33, 0.965], 0.95],
  [-1.5, 0.12, [0.92, 0.5], [0.99, 0.67], [0.97, 0.915], [0.64, 1.065], [0.4, 1.03], 0.98],
  [-1.2, 0.12, [0.92, 0.46], [0.99, 0.65], [0.97, 0.905], [0.6, 1.11], [0.51, 1.085], 0.99],
  [-0.9, 0.12, [0.92, 0.42], [0.99, 0.63], [0.97, 0.89], [0.72, 1.0], [0.56, 0.95], 0.85],
  [-0.6, 0.12, [0.92, 0.36], [0.99, 0.62], [0.97, 0.885], [0.85, 0.885], [0.62, 0.81], 0.79],
  [0.4, 0.12, [0.92, 0.3], [0.99, 0.6], [0.97, 0.87], [0.85, 0.872], [0.62, 0.8], 0.78],
  [1.0, 0.12, [0.92, 0.28], [0.99, 0.58], [0.97, 0.855], [0.85, 0.857], [0.62, 0.8], 0.79],
  [1.2, 0.12, [0.92, 0.27], [0.99, 0.57], [0.97, 0.84], [0.84, 0.84], [0.62, 0.805], 0.795],
  [1.45, 0.12, [0.92, 0.26], [0.99, 0.56], [0.97, 0.815], [0.81, 0.8], [0.79, 0.796], 0.792],
  [1.55, 0.12, [0.92, 0.255], [0.99, 0.55], [0.965, 0.79], [0.78, 0.782], [0.76, 0.776], 0.772],
  [1.7, 0.12, [0.92, 0.25], [0.99, 0.53], [0.95, 0.745], [0.7, 0.735], [0.68, 0.729], 0.725],
  [1.85, 0.13, [0.9, 0.25], [0.96, 0.5], [0.93, 0.69], [0.64, 0.682], [0.62, 0.676], 0.672],
  [2.05, 0.14, [0.8, 0.255], [0.85, 0.46], [0.84, 0.615], [0.61, 0.601], [0.6, 0.597], 0.595],
  [2.22, 0.16, [0.58, 0.26], [0.63, 0.4], [0.62, 0.535], [0.61, 0.532], [0.605, 0.53], 0.528]
].map(([x, yb, sill, crease, sh, wt, wf, yc]) => ({
  x,
  p: [[0, yb], [crease[0] - 0.07, yb], sill, crease, sh, wt, wf, [0, yc]]
}))
const SILL = 1,
  WALL = 5,
  DECK = 6 // segment indices in the body section
// the butterfly doors: from the front shut line to the rear one, sill to roof rail, hinged at the
// top of the front edge, swinging up and out
const DOOR = [-0.3, 0.84]
const HINGE = [0.84, 0.97, 0.76] // x, y, |z|
// the cabin's length under the canopy, open from the floor to the glass
const CABIN = [-0.8, 0.7]

// Canopy stations, tail to windshield foot: where the side glass meets the shoulder (or, at the rear,
// the buttress), the roof rail (the windshield's edge up front) and the centre line. Seen from above
// it is a teardrop: the windshield's foot spans nearly the whole car, the tip is narrow at the tail.
// x, base [z, y], rail [z, y], centre y
// prettier-ignore
const GLASS = [
  [-1.98, [0.285, 0.93], [0.27, 0.935], 0.94],
  [-1.8, [0.33, 0.965], [0.31, 0.975], 0.985],
  [-1.5, [0.4, 1.03], [0.37, 1.055], 1.065],
  [-1.2, [0.52, 1.0], [0.44, 1.1], 1.11],
  [-0.9, [0.7, 0.95], [0.49, 1.14], 1.155],
  [-0.4, [0.84, 0.885], [0.545, 1.165], 1.19],
  [0.0, [0.85, 0.875], [0.58, 1.15], 1.175],
  [0.3, [0.85, 0.87], [0.61, 1.11], 1.135],
  [0.8, [0.85, 0.858], [0.69, 1.0], 1.02],
  [1.15, [0.85, 0.838], [0.78, 0.89], 0.905],
  [1.3, [0.83, 0.82], [0.815, 0.835], 0.855],
  [1.5, [0.79, 0.79], [0.78, 0.792], 0.795]
].map(([x, base, rail, yc]) => {
  // a thin painted strip runs along the rail, on the side-glass side
  const t = Math.min(
    0.5,
    0.018 / Math.hypot(base[0] - rail[0], base[1] - rail[1])
  )
  const edge = [0, 1].map(n => rail[n] + (base[n] - rail[n]) * t)
  return { x, p: [base, edge, rail, [0, yc]] }
})

const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
// a dark line along the roof glass at z, from x0 to x1 (the glass roof's panel joints)
function roofLine (z, x0, x1) {
  const pos = [],
    w = 0.006
  const yAt = x => {
    const [zr, yr] = at(GLASS, x, 2),
      yc = at(GLASS, x, 3)[1]
    return yc + (yr - yc) * (z / zr) + 0.003
  }
  for (let x = x0; x > x1; x -= 0.1) {
    const xb = Math.max(x1, x - 0.1)
    const a = [x, yAt(x), z - w],
      b = [x, yAt(x), z + w],
      c = [xb, yAt(xb), z - w],
      d = [xb, yAt(xb), z + w]
    pos.push(...a, ...b, ...c, ...c, ...b, ...d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return new THREE.Mesh(g, SEAM)
}

const DOOR_INSIDE = new THREE.MeshStandardMaterial({
  color: 0x1c1d20,
  roughness: 0.75,
  side: THREE.BackSide
})
// the canopy from inside: the bronze tint over everything outside, like sunglasses (what is seen
// through it is multiplied by its colour)
const GLASS_INSIDE = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0.78, 0.6, 0.42),
  transparent: true,
  blending: THREE.MultiplyBlending,
  side: THREE.BackSide,
  depthWrite: false
})
export function buildRoadster () {
  const car = new THREE.Group()
  const body = new THREE.Group()
  car.add(body)
  const shell = withWheelArches(MAT.paint)
  const shellTrim = withWheelArches(MAT.trim)
  // black floor and sill; dark cabin floor and inner walls under the glass; white everywhere else;
  // the doors' panels and glass apart, to swing open
  const inDoor = x => x > DOOR[0] && x < DOOR[1]
  const bodyMat = (j, xA, xB, sg) => {
    const x = (xA + xB) / 2
    if (j <= SILL) return shellTrim
    if (j <= WALL - 1 && j > SILL && inDoor(x)) return `door${sg}`
    if ((j === WALL || j === DECK) && x > CABIN[0] && x < CABIN[1]) return null
    if (j === WALL && x > -1.0 && x < 1.3) return shellTrim
    if (j === DECK && x > -1.96 && x < 1.5) return shellTrim
    return shell
  }
  const glassMat = (j, xA, xB, sg) =>
    j <= 1 && inDoor((xA + xB) / 2)
      ? `${j ? 'strip' : 'pane'}${sg}`
      : j === 1
      ? MAT.paint
      : MAT.glass
  const doors = []
  for (const sg of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(HINGE[0], HINGE[1], sg * HINGE[2])
    body.add(pivot)
    doors[sg] = pivot
  }
  const DOOR_MATS = { door: MAT.paint, strip: MAT.paint, pane: MAT.glass }
  const place = geos => {
    for (const [key, g] of geos) {
      if (typeof key !== 'string') {
        const m = new THREE.Mesh(g, key)
        m.castShadow = m.receiveShadow = true
        body.add(m)
        if (key === MAT.glass) body.add(new THREE.Mesh(g, GLASS_INSIDE))
        continue
      }
      const sg = key.endsWith('-1') ? -1 : 1,
        pivot = doors[sg]
      g.translate(-HINGE[0], -HINGE[1], -sg * HINGE[2])
      const m = new THREE.Mesh(g, DOOR_MATS[key.replace(/-?1$/, '')])
      m.castShadow = true
      pivot.add(m)
      // the inside of the door, dark, seen once it is up; and of its window, tinted
      if (key.startsWith('door')) pivot.add(new THREE.Mesh(g, DOOR_INSIDE))
      if (key.startsWith('pane')) pivot.add(new THREE.Mesh(g, GLASS_INSIDE))
    }
  }
  place(loftGeos(withStations(BODY, DOOR), bodyMat, shellTrim, 30))
  place(loftGeos(withStations(GLASS, DOOR), glassMat, undefined, 40))
  const cabin = buildCabin(body)

  // Optimus in the driver's seat
  const optimus = buildOptimus()
  body.add(optimus.root)
  optimus.root.position.set(...DRIVER.root)
  poseOptimus(optimus, DRIVER)

  // front: light line along the hood's leading edge, squinting triangular headlights on the fenders'
  // facets, black splitter, amber markers behind the front arches and red ones ahead of the tail
  body.add(box(0.014, 0.014, 1.18, MAT.headlight, 2.224, 0.525, 0))
  // at night the headlights light the road ahead, dipped like low beams so a car stopped in front
  // is lit rather than blown out (headlights.visible: main.js switches them)
  const headlights = new THREE.SpotLight(0xfff2e0, 500, 70, 0.38, 0.6, 2)
  headlights.position.set(2.1, 0.6, 0)
  headlights.target.position.set(24, -1.6, 0)
  headlights.visible = false
  body.add(headlights, headlights.target)
  const lamp = [],
    mark = [],
    markR = []
  for (const sg of [1, -1]) {
    // long side on the hood's edge, tip pointing out across the fender facet
    const [zt, yt] = at(BODY, 2.03, 5).map(
      (v, n) => v + (at(BODY, 2.03, 4)[n] - v) * 0.5
    )
    for (const [x, z, y] of [
      [2.19, ...at(BODY, 2.19, 5)],
      [1.9, ...at(BODY, 1.9, 5)],
      [2.03, zt, yt]
    ])
      lamp.push(x, y + 0.005, sg * z)
    for (const [x, y] of [
      [1.0, 0.69],
      [0.86, 0.69],
      [0.96, 0.66]
    ])
      mark.push(x, y, sg * 0.992)
    for (const [x, y] of [
      [-1.92, 0.665],
      [-2.06, 0.665],
      [-1.96, 0.64]
    ])
      markR.push(x, y, sg * (x < -2 ? 0.94 : 0.975))
  }
  const flat = (pos, mat) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const m = mat.clone()
    m.side = THREE.DoubleSide
    return new THREE.Mesh(g, m)
  }
  body.add(flat(lamp, MAT.headlight))
  body.add(
    flat(
      mark,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.5, 0.32, 0.05),
        toneMapped: false
      })
    ),
    flat(markR, MAT.ledRed)
  )
  body.add(box(0.28, 0.025, 1.56, MAT.trim, 2.12, 0.125, 0))
  // the side camera on each front fender, where a mirror would be
  for (const sg of [1, -1]) {
    const cam = box(0.09, 0.022, 0.012, MAT.trim, 1.02, 0.79, sg * 0.975)
    cam.rotation.x = sg * 0.35
    body.add(cam)
  }

  // shut lines: the butterfly doors' front and rear edges, the divider in the side glass and the
  // joints in the glass roof (windshield, a centre spine, rear glass)
  body.add(
    seam(BODY, DOOR[1], 2, 5, SEAM),
    seam(BODY, DOOR[0], 2, 5, SEAM),
    seam(GLASS, DOOR[0], 0, 1, SEAM),
    seam(GLASS, 0.3, 2, 3, SEAM, 0.006, 0.003),
    seam(GLASS, -0.62, 2, 3, SEAM, 0.006, 0.003),
    roofLine(0.11, 0.3, -0.62),
    roofLine(-0.11, 0.3, -0.62)
  )

  // the tail (light bar, plate, nozzle housing, diffuser and its fans) and the active wing
  const fans = []
  const taillight = buildTail(body, fans)
  const wing = buildWing(body)
  // one more fan draws air from under the floor
  const floorFan = fanUnit(0.3, 7, fans)
  floorFan.rotation.x = Math.PI // opens downward
  floorFan.position.set(-0.9, 0.105, 0)
  body.add(floorFan)

  // 10 cold-gas nozzles: 4 main on the housing over the diffuser, 4 lift hanging under the body
  // behind each wheel, 2 attitude nozzles in the black sills ahead of the rear wheels
  const nozzles = []
  const ringGeo = new THREE.TorusGeometry(0.046, 0.012, 8, 20),
    holeGeo = new THREE.CircleGeometry(0.044, 16),
    tubeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.025),
    stemGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.14, 16, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.07)
  function nozzle (x, y, z, dir, kind) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    const r = new THREE.Mesh(
        ringGeo,
        kind.startsWith('side') ? MAT.darkMetal : MAT.chrome
      ),
      h = new THREE.Mesh(holeGeo, MAT.hole)
    h.position.z = 0.004
    g.add(r, h)
    if (kind === 'main') g.add(new THREE.Mesh(tubeGeo, MAT.chrome)) // stands proud of the housing
    if (kind === 'lift') g.add(new THREE.Mesh(stemGeo, MAT.steel)) // hangs below the floor
    g.lookAt(_a.set(x, y, z).add(dir)) // local +z along the exhaust
    body.add(g)
    nozzles.push({
      kind,
      local: new THREE.Vector3(x, y, z),
      dir: dir.clone(),
      group: g
    })
  }
  for (const z of [-0.37, -0.125, 0.125, 0.37])
    nozzle(-2.31, 0.505, z, new THREE.Vector3(-1, 0, 0), 'main')
  for (const [x, z] of [
    [0.95, -0.8],
    [0.95, 0.8],
    [-2.0, -0.68],
    [-2.0, 0.68]
  ])
    nozzle(x, 0.11, z, new THREE.Vector3(0, -1, 0), 'lift')
  nozzle(-0.95, 0.3, -0.93, new THREE.Vector3(0, 0, -1), 'sideL')
  nozzle(-0.95, 0.3, 0.93, new THREE.Vector3(0, 0, 1), 'sideR')

  // ground-sealing skirts between the wheel wells
  const skirts = []
  for (const z of [-0.94, 0.94]) {
    const sk = box(1.85, 0.07, 0.03, MAT.trim, 0, 0.1, z)
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
    fans,
    skirts,
    wing,
    taillight,
    doors,
    door: 0, // how far the driver's door is open, 0 to 1
    optimus,
    cabin,
    headlights,
    settle: { mode: null, k: 0, dy: 0, dq: new THREE.Quaternion() },
    // body pitch and roll on their springs (rad) and how fast they are moving
    lean: { p: 0, pv: 0, r: 0, rv: 0 },
    // how far up each axle is: on a raised pavement or parking lot, front and rear
    kerb: { f: 0, r: 0 }
  }
}

const _sq = new THREE.Quaternion(),
  _kq = new THREE.Quaternion()

// The city's pavements, parking lots and parks are a kerb's height up from the road (the sim drives
// on one flat ground, and feels the kerb: street.js); the model rides up onto them, each axle as it
// mounts the kerb, so the car tips up onto it and back down off it.
function kerb (RS, sim, dt) {
  const K = RS.kerb,
    ft = sim.feel?.kerb,
    on = sim.world === 'city' && sim.mode === 'ground' && sim.floor === 0
  const k = 1 - Math.exp(-dt * 30)
  K.f += ((on && ft && !ft[0] ? CURB_H : 0) - K.f) * k
  K.r += ((on && ft && !ft[1] ? CURB_H : 0) - K.r) * k
  if (K.f + K.r < 1e-4) return
  RS.car.position.y += (K.f + K.r) / 2
  RS.car.quaternion.multiply(
    _kq.setFromAxisAngle(AX_Z, Math.atan2(K.f - K.r, CAR.wheelbase))
  )
}

// Landing (or getting back on the wheels after a crash) puts the sim's car flat on the road at once,
// however it came down; the model eases down onto its wheels from the pose it was in instead.
function settle (RS, sim, dt) {
  const st = RS.settle
  if (sim.mode === 'ground' && st.mode && st.mode !== 'ground') {
    st.dy = RS.car.position.y - sim.pos.y
    st.dq.copy(RS.car.quaternion).multiply(_sq.copy(sim.quat).invert())
    // (not across a reset to somewhere else)
    st.k = RS.car.position.distanceTo(sim.pos) < 6 ? 1 : 0
  }
  st.mode = sim.mode
  st.k *= Math.exp(-12 * dt)
}

// Pose the model from the sim and animate wheels, suspension, body roll/pitch, fans, skirts, the wing
// and the brake light. The body pitches and rolls on springs, so it dips and rocks back a little when
// the car brakes, launches or turns in, instead of just tilting.
export function updateRoadster (RS, sim, ctl, dt) {
  settle(RS, sim, dt)
  RS.car.position.copy(sim.pos)
  RS.car.quaternion.copy(sim.quat)
  kerb(RS, sim, dt)
  if (RS.settle.k > 0.002) {
    RS.car.position.y += RS.settle.dy * RS.settle.k
    RS.car.quaternion.premultiply(
      _sq.identity().slerp(RS.settle.dq, RS.settle.k)
    )
  }
  RS.body.position.y = clamp(sim.susp, -0.12, 0.06) * 0.6
  const onGround = sim.mode === 'ground'
  const pitchT = onGround ? clamp(-sim.accLong * 0.0028, -0.045, 0.045) : 0
  const rollT = onGround ? clamp(sim.latAcc * 0.0042, -0.06, 0.06) : 0
  const L = RS.lean,
    h = Math.min(dt, 1 / 30)
  L.pv += (90 * (pitchT - L.p) - 11 * L.pv) * h
  L.p += L.pv * h
  L.rv += (110 * (rollT - L.r) - 12 * L.rv) * h
  L.r += L.rv * h
  RS.body.rotation.z = L.p
  RS.body.rotation.x = L.r
  updateWheels(RS, sim, dt)
  updateWing(RS.wing, sim, ctl, dt)
  // the driver's door swings up and out about its hinge (RS.door: set by the intro)
  const k = RS.door * RS.door * (3 - 2 * RS.door)
  RS.doors[-1].rotation.set(-0.5 * k, 0, -1.4 * k)
  // the yoke turning with the steering, the driver's hands with it and head into the turn, and the
  // touchscreen
  updateCabin(RS.cabin, RS.optimus, sim, RS.seated !== false, dt)
  for (const f of RS.fans) f.rotation.y += sim.suction * dt * 60
  for (const sk of RS.skirts) sk.position.y = 0.1 - 0.05 * sim.suction
  const spd = sim.groundSpeed()
  const braking = (ctl.brake > 0 || ctl.ebrake) && spd > 0.5
  RS.taillight.color.setRGB(braking ? 4.2 : 1.8, braking ? 0.1 : 0.03, 0.02)
}
