// The Roadster model, measured off the Oct 15, 2026 reveal photos (a side-on shot at the event sets the
// proportions): a faceted wedge in satin Ano White with a tall blunt nose, sloped fender facets either
// side of a short hood, squinting triangular headlights, one dark gold-tinted canopy from a far-forward
// windshield over the roof to the tail lip, flanked by buttresses that run out to the tail corners, a
// black sill that rises to the rear, full-width light bars, a black diffuser frame carrying 4 nozzles
// over 4 fans, a closed, flush tail deck, underfloor suction fan, skirts and flat aero-disc wheels;
// plus per-frame pose and animation.
import * as THREE from 'three'
import { scene, MAT } from './scene.js'
import { TAU, clamp } from '../sim/constants.js'
import { buildWheels, updateWheels, withWheelArches } from './wheels.js'

const _a = new THREE.Vector3()

// ---------- lofting ----------
// Sweep a half section (z >= 0, from the bottom centre line round to the top one) through stations
// along x, mirrored to both sides. Faces stay flat-shaded, so every panel reads as a facet.
// Without capMat the ends stay open (used for the canopy).
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
  if (capMat) {
    cap(stations[0], false)
    cap(stations[stations.length - 1], true)
  }
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

// [z, y] of profile point k at x, linear between the stations either side
function at (stations, x, k) {
  let i = 0
  while (i < stations.length - 2 && stations[i + 1].x < x) i++
  const A = stations[i],
    B = stations[i + 1]
  const t = (x - A.x) / (B.x - A.x)
  return [0, 1].map(n => A.p[k][n] + (B.p[k][n] - A.p[k][n]) * t)
}

// A thin dark line across the surface at x, along section points k0..k1 on both sides, standing just
// proud of the panels so it never z-fights them.
function seam (stations, x, k0, k1, w = 0.008, lift = 0.0025) {
  const pos = []
  for (let k = k0; k < k1; k++) {
    const P = at(stations, x, k),
      Q = at(stations, x, k + 1)
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1
    const nz = ((Q[1] - P[1]) / len) * lift,
      ny = (-(Q[0] - P[0]) / len) * lift
    for (const sg of [1, -1]) {
      const v = (x2, [z, y]) => [x2, y + ny, sg * (z + nz)]
      const a = v(x - w / 2, P),
        b = v(x + w / 2, P),
        c = v(x - w / 2, Q),
        d = v(x + w / 2, Q)
      pos.push(...a, ...b, ...c, ...c, ...b, ...d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return new THREE.Mesh(g, SEAM)
}
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
  [-2.22, 0.14, [0.74, 0.66], [0.8, 0.74], [0.79, 0.9], [0.74, 0.915], [0.38, 0.915], 0.915],
  [-2.12, 0.13, [0.84, 0.65], [0.9, 0.73], [0.88, 0.905], [0.76, 0.925], [0.4, 0.92], 0.92],
  [-1.95, 0.13, [0.9, 0.6], [0.96, 0.71], [0.94, 0.91], [0.72, 0.952], [0.43, 0.932], 0.925],
  [-1.8, 0.13, [0.91, 0.55], [0.98, 0.68], [0.96, 0.915], [0.69, 0.995], [0.44, 0.962], 0.94],
  [-1.5, 0.12, [0.92, 0.5], [0.99, 0.67], [0.97, 0.915], [0.64, 1.065], [0.47, 1.025], 0.96],
  [-1.2, 0.12, [0.92, 0.46], [0.99, 0.65], [0.97, 0.905], [0.6, 1.11], [0.51, 1.085], 0.97],
  [-0.9, 0.12, [0.92, 0.42], [0.99, 0.63], [0.97, 0.89], [0.72, 1.0], [0.56, 0.95], 0.85],
  [-0.6, 0.12, [0.92, 0.36], [0.99, 0.62], [0.97, 0.885], [0.83, 0.89], [0.62, 0.81], 0.79],
  [0.4, 0.12, [0.92, 0.3], [0.99, 0.6], [0.97, 0.87], [0.84, 0.875], [0.62, 0.8], 0.78],
  [1.0, 0.12, [0.92, 0.28], [0.99, 0.58], [0.97, 0.855], [0.84, 0.86], [0.62, 0.8], 0.79],
  [1.2, 0.12, [0.92, 0.27], [0.99, 0.57], [0.97, 0.84], [0.8, 0.845], [0.6, 0.805], 0.795],
  [1.45, 0.12, [0.92, 0.26], [0.99, 0.56], [0.97, 0.815], [0.62, 0.8], [0.6, 0.796], 0.792],
  [1.55, 0.12, [0.92, 0.255], [0.99, 0.55], [0.965, 0.79], [0.59, 0.778], [0.585, 0.775], 0.772],
  [1.7, 0.12, [0.92, 0.25], [0.99, 0.53], [0.95, 0.745], [0.585, 0.73], [0.58, 0.727], 0.725],
  [1.85, 0.13, [0.9, 0.25], [0.96, 0.5], [0.93, 0.69], [0.595, 0.68], [0.59, 0.675], 0.672],
  [2.05, 0.14, [0.8, 0.255], [0.85, 0.46], [0.84, 0.615], [0.605, 0.6], [0.6, 0.597], 0.595],
  [2.22, 0.16, [0.58, 0.26], [0.63, 0.4], [0.62, 0.535], [0.61, 0.532], [0.605, 0.53], 0.528]
].map(([x, yb, sill, crease, sh, wt, wf, yc]) => ({
  x,
  p: [[0, yb], [crease[0] - 0.07, yb], sill, crease, sh, wt, wf, [0, yc]]
}))
const SILL = 1,
  WALL = 5,
  DECK = 6 // segment indices in the body section

// Canopy stations, tail to windshield foot: where the side glass meets the shoulder, the roof rail
// (the A-pillar on the windshield) and the centre line. x, base [z, y], rail [z, y], centre y
// prettier-ignore
const GLASS = [
  [-1.95, [0.41, 0.928], [0.39, 0.936], 0.94],
  [-1.5, [0.47, 1.02], [0.44, 1.045], 1.05],
  [-1.2, [0.62, 1.0], [0.5, 1.09], 1.1],
  [-0.9, [0.74, 0.95], [0.53, 1.14], 1.16],
  [-0.4, [0.82, 0.885], [0.55, 1.16], 1.19],
  [0.0, [0.83, 0.88], [0.56, 1.14], 1.165],
  [0.5, [0.83, 0.872], [0.62, 1.03], 1.05],
  [1.0, [0.83, 0.855], [0.77, 0.895], 0.915],
  [1.25, [0.74, 0.835], [0.72, 0.842], 0.86],
  [1.5, [0.33, 0.788], [0.32, 0.789], 0.79]
].map(([x, base, rail, yc]) => {
  // a thin painted strip runs along the rail, on the side-glass side
  const t = Math.min(
    0.5,
    0.018 / Math.hypot(base[0] - rail[0], base[1] - rail[1])
  )
  const edge = [0, 1].map(n => rail[n] + (base[n] - rail[n]) * t)
  return { x, p: [base, edge, rail, [0, yc]] }
})

function plateTexture () {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 128
  const g = cv.getContext('2d')
  g.fillStyle = '#dcdee1'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#9a9da3'
  g.lineWidth = 6
  g.strokeRect(6, 6, 244, 116)
  g.fillStyle = '#4a4d53'
  g.font = '600 76px "Saira Semi Condensed", "Arial Narrow", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('RDSTR', 128, 70)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

// A fan in a round duct, spinning about local y; blades go in `fans` for the per-frame spin.
function fanUnit (r, nBlades, fans) {
  const g = new THREE.Group()
  const duct = new THREE.Mesh(
    new THREE.TorusGeometry(r, r * 0.12, 8, 28),
    MAT.darkMetal
  )
  duct.rotation.x = Math.PI / 2
  const back = new THREE.Mesh(new THREE.CircleGeometry(r, 24), MAT.hole)
  back.rotation.x = -Math.PI / 2
  back.position.y = -r * 0.5
  const hub = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.32, r * 0.8, 12),
    MAT.darkMetal
  )
  hub.position.y = r * 0.15
  const blades = new THREE.Group()
  for (let i = 0; i < nBlades; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.85, r * 0.03, r * 0.24),
      MAT.darkMetal
    )
    b.position.x = r * 0.5
    b.rotation.x = 0.4
    const p = new THREE.Group()
    p.rotation.y = (i * TAU) / nBlades
    p.add(b)
    blades.add(p)
  }
  g.add(duct, back, hub, blades)
  fans.push(blades)
  return g
}

export function buildRoadster () {
  const car = new THREE.Group()
  const body = new THREE.Group()
  car.add(body)
  const shell = withWheelArches(MAT.paint)
  const shellTrim = withWheelArches(MAT.trim)
  // black floor and sill; dark cabin floor and inner walls under the glass; white everywhere else
  const bodyMat = (j, xA, xB) => {
    const x = (xA + xB) / 2
    if (j <= SILL) return shellTrim
    if (j === WALL && x > -1.0 && x < 1.3) return shellTrim
    if (j === DECK && x > -1.96 && x < 1.5) return shellTrim
    return shell
  }
  body.add(loft(BODY, bodyMat, shellTrim))
  body.add(loft(GLASS, j => (j === 1 ? MAT.paint : MAT.glass)))

  // Starman in the driver's seat
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 12),
    MAT.suit
  )
  helmet.position.set(-0.28, 0.98, -0.36)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.32), MAT.suit)
  torso.position.set(-0.4, 0.77, -0.36)
  body.add(helmet, torso)

  // front: light line along the hood's leading edge, squinting triangular headlights on the fenders'
  // facets, black splitter, amber markers behind the front arches and red ones ahead of the tail
  body.add(box(0.014, 0.014, 1.18, MAT.headlight, 2.224, 0.525, 0))
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
      markR.push(x, y, sg * (x < -2 ? 0.92 : 0.965))
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

  // shut lines: the butterfly doors' front and rear edges, and the divider in the side glass
  body.add(
    seam(BODY, 0.84, 2, 5),
    seam(BODY, -0.3, 2, 5),
    seam(GLASS, -0.52, 0, 1)
  )

  // rear: light bar in a deep black housing under the deck lip, tail panel with the plate and its two
  // lamps, then the diffuser: a black frame (a beam carrying the 4 main nozzles on two legs) round
  // the four fan bays
  body.add(box(0.012, 0.08, 1.58, MAT.trim, -2.232, 0.87, 0))
  const rear = box(0.012, 0.018, 1.54, MAT.taillight.clone(), -2.238, 0.872, 0)
  body.add(rear)
  body.add(box(0.012, 0.27, 1.52, MAT.paint, -2.226, 0.695, 0))
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.15),
    new THREE.MeshStandardMaterial({
      map: plateTexture(),
      roughness: 0.45,
      metalness: 0.3
    })
  )
  plate.rotation.y = -Math.PI / 2
  plate.position.set(-2.234, 0.68, 0)
  body.add(plate)
  for (const z of [-0.06, 0.06])
    body.add(box(0.01, 0.012, 0.03, MAT.headlight, -2.236, 0.776, z))
  body.add(box(0.06, 0.09, 1.2, MAT.trim, -2.24, 0.47, 0))
  for (const z of [-0.56, 0.56])
    body.add(box(0.06, 0.4, 0.07, MAT.trim, -2.24, 0.31, z))
  body.add(box(0.06, 0.04, 1.18, MAT.trim, -2.24, 0.13, 0))
  for (const z of [0, -0.26, 0.26])
    body.add(box(0.08, 0.3, 0.012, MAT.trim, -2.24, 0.3, z))
  // the four fans exhaust through the diffuser; one more draws air from under the floor
  const fans = []
  for (const z of [-0.39, -0.13, 0.13, 0.39]) {
    const f = fanUnit(0.09, 7, fans)
    f.rotation.z = Math.PI / 2 // local +y points aft
    f.position.set(-2.232, 0.27, z)
    body.add(f)
  }
  const floorFan = fanUnit(0.3, 7, fans)
  floorFan.rotation.x = Math.PI // opens downward
  floorFan.position.set(-0.9, 0.105, 0)
  body.add(floorFan)

  // 10 cold-gas nozzles: 4 main on the diffuser beam, 4 lift hanging under the body behind each wheel,
  // 2 attitude nozzles in the black sills ahead of the rear wheels
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
        kind.startsWith('side') ? MAT.darkMetal : MAT.gold
      ),
      h = new THREE.Mesh(holeGeo, MAT.hole)
    h.position.z = 0.004
    g.add(r, h)
    if (kind === 'main') g.add(new THREE.Mesh(tubeGeo, MAT.gold)) // stands proud of the beam
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
  for (const z of [-0.34, -0.115, 0.115, 0.34])
    nozzle(-2.285, 0.47, z, new THREE.Vector3(-1, 0, 0), 'main')
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
    taillight: rear.material,
    settle: { mode: null, k: 0, dy: 0, dq: new THREE.Quaternion() }
  }
}

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
const _sq = new THREE.Quaternion()

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

// Pose the model from the sim and animate wheels, suspension, body roll/pitch, fans, skirts and brake light.
export function updateRoadster (RS, sim, ctl, dt) {
  settle(RS, sim, dt)
  RS.car.position.copy(sim.pos)
  RS.car.quaternion.copy(sim.quat)
  if (RS.settle.k > 0.002) {
    RS.car.position.y += RS.settle.dy * RS.settle.k
    RS.car.quaternion.premultiply(_sq.identity().slerp(RS.settle.dq, RS.settle.k))
  }
  RS.body.position.y = clamp(sim.susp, -0.12, 0.06) * 0.6
  const onGround = sim.mode === 'ground'
  const pitchVis = onGround ? clamp(-sim.accLong * 0.0022, -0.035, 0.035) : 0
  const rollVis = onGround ? clamp(sim.latAcc * 0.0035, -0.05, 0.05) : 0
  RS.body.rotation.z += (pitchVis - RS.body.rotation.z) * lerpK(6, dt)
  RS.body.rotation.x += (rollVis - RS.body.rotation.x) * lerpK(6, dt)
  updateWheels(RS, sim, dt)
  for (const f of RS.fans) f.rotation.y += sim.suction * dt * 60
  for (const sk of RS.skirts) sk.position.y = 0.1 - 0.05 * sim.suction
  const spd = sim.groundSpeed()
  const braking = (ctl.brake > 0 || ctl.ebrake) && spd > 0.5
  RS.taillight.color.setRGB(braking ? 7 : 2.6, braking ? 0.3 : 0.12, 0.1)
}
