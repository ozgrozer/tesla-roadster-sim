// The Roadster's tail, as in the rear shot from the reveal: a full-width red light bar in a smoked
// black band under the ducktail lip, a satin panel with the plate and a camera, and the black lower
// fascia: a louvred housing for the 4 main nozzles over a diffuser of 4 fan bays split by strakes,
// with red reflectors at its corners. Plus the active rear wing: it rises out of the deck on swan-neck
// pylons at speed, folds its endplates down, and tips up as an air brake under hard braking.
import * as THREE from 'three'
import { MAT, hdr } from './scene.js'
import { TAU, clamp } from '../sim/constants.js'

const X = -2.22 // the tail's rear face

const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), mat)
  m.position.set(x, y, z)
  return m
}

function plateTexture () {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 128
  const g = cv.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 0, 128)
  gr.addColorStop(0, '#e9ebed')
  gr.addColorStop(1, '#cfd2d6')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#a6a9ae'
  g.lineWidth = 5
  g.strokeRect(5, 5, 246, 118)
  // embossed letters: a light edge above, a shadow below
  g.font = '600 74px "Saira Semi Condensed", "Arial Narrow", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#ffffff'
  g.fillText('RDSTR', 128, 68)
  g.fillStyle = '#8d9096'
  g.fillText('RDSTR', 129, 72)
  g.fillStyle = '#b7babf'
  g.fillText('RDSTR', 128, 70)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// A fan in a round duct, spinning about local y; blades go in `fans` for the per-frame spin.
export function fanUnit (r, nBlades, fans) {
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

// the tail's fittings; returns the light bar's material (brighter under braking)
export function buildTail (body, fans) {
  const smoked = new THREE.MeshPhysicalMaterial({
    color: 0x07080a,
    roughness: 0.12,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.05
  })
  // (the output pass tone-maps everything: past about 2 a red burns out to orange; marked as lamps
  // at the rear, to break: damage.js)
  const red = new THREE.MeshBasicMaterial({
    color: hdr(1.8, 0.03, 0.02),
    toneMapped: false,
    userData: { lamp: 'rear' }
  })
  // the light bar, full width under the deck lip, in its smoked band
  body.add(box(1.74, 0.085, 0.03, smoked, X - 0.004, 0.87, 0))
  body.add(box(1.7, 0.02, 0.012, red, X - 0.02, 0.885, 0))
  // the satin panel with the plate and the camera over it
  const satin = new THREE.MeshStandardMaterial({
    color: 0xb9bdc2,
    roughness: 0.42,
    metalness: 0.55
  })
  body.add(box(1.62, 0.22, 0.02, satin, X - 0.002, 0.715, 0))
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.155),
    new THREE.MeshStandardMaterial({
      map: plateTexture(),
      roughness: 0.4,
      metalness: 0.35
    })
  )
  plate.rotation.y = -Math.PI / 2
  plate.position.set(X - 0.016, 0.69, 0)
  body.add(plate)
  body.add(box(0.06, 0.018, 0.02, MAT.trim, X - 0.016, 0.78, 0))
  // the black lower fascia: reflectors at its outer corners
  const reflector = new THREE.MeshBasicMaterial({
    color: hdr(0.9, 0.02, 0.015),
    toneMapped: false,
    userData: { lamp: 'rear' }
  })
  for (const s of [-1, 1])
    body.add(box(0.15, 0.014, 0.01, reflector, X - 0.006, 0.57, s * 0.76))
  // the nozzle housing: a black beam with louvres across it, standing proud of the fascia
  body.add(box(1.26, 0.16, 0.06, MAT.trim, X - 0.03, 0.505, 0))
  for (const y of [0.455, 0.505, 0.555])
    body.add(box(1.2, 0.008, 0.012, MAT.darkMetal, X - 0.062, y, 0))
  // the diffuser: a frame round 4 fan bays, split by strakes that run back under the tail
  for (const s of [-1, 1])
    body.add(box(0.05, 0.36, 0.12, MAT.trim, X - 0.04, 0.25, s * 0.63))
  body.add(box(1.31, 0.05, 0.12, MAT.trim, X - 0.04, 0.095, 0))
  for (const z of [-0.315, 0, 0.315])
    body.add(box(0.014, 0.32, 0.16, MAT.trim, X - 0.02, 0.26, z))
  for (const z of [-0.47, -0.155, 0.155, 0.47]) {
    const f = fanUnit(0.12, 7, fans)
    f.rotation.z = Math.PI / 2 // local +y points aft
    f.position.set(X - 0.012, 0.27, z)
    body.add(f)
  }
  return red
}

// ---------- the active wing ----------
const SPAN = 0.93 // half span
const UP = 0.3 // how far it rises out of the deck

function plateShape (pts) {
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
}

export function buildWing (body) {
  const wing = new THREE.Group() // rises out of the deck
  const tilt = new THREE.Group() // the blade's angle of attack, about its leading edge
  wing.position.set(-1.9, 1.04 - UP, 0)
  tilt.position.set(0.04, 0, 0)
  wing.add(tilt)
  // the blade: a cambered section with a gurney flap at the trailing edge, dark on top
  const foil = plateShape([
    [0, 0],
    [-0.03, 0.022],
    [-0.11, 0.034],
    [-0.21, 0.03],
    [-0.3, 0.018],
    [-0.305, 0.04],
    [-0.315, 0.04],
    [-0.31, 0.004],
    [-0.2, -0.004],
    [-0.08, -0.008]
  ])
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(foil, {
      depth: SPAN * 2,
      bevelEnabled: false
    }).translate(0, 0, -SPAN),
    MAT.trim
  )
  tilt.add(blade)
  // endplates hinged along the blade's tips: down and canted out when deployed, folded flat on top
  // of the blade when stowed
  const ep = plateShape([
    [0.02, 0.02],
    [-0.33, 0.045],
    [-0.3, -0.06],
    [-0.12, -0.2],
    [-0.06, -0.19]
  ])
  const epGeo = new THREE.ExtrudeGeometry(ep, {
    depth: 0.012,
    bevelEnabled: false
  }).translate(0, 0, -0.006)
  const plates = []
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group()
    hinge.position.set(0, 0.02, s * SPAN)
    hinge.add(new THREE.Mesh(epGeo, MAT.paint))
    tilt.add(hinge)
    plates.push({ hinge, s })
  }
  // swan-neck pylons: up from the deck and over, holding the blade from above
  const neck = plateShape([
    [0.12, -0.36],
    [0.05, -0.36],
    [0.0, -0.1],
    [-0.04, 0.03],
    [-0.1, 0.075],
    [-0.19, 0.06],
    [-0.19, 0.03],
    [-0.11, 0.045],
    [-0.06, 0.0],
    [0.03, -0.2]
  ])
  const neckGeo = new THREE.ExtrudeGeometry(neck, {
    depth: 0.014,
    bevelEnabled: false
  }).translate(0, 0, -0.007)
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(neckGeo, MAT.trim)
    p.position.set(0, 0, s * 0.46)
    wing.add(p)
  }
  wing.traverse(o => {
    if (o.isMesh) o.castShadow = true
  })
  wing.visible = false
  body.add(wing)
  return { wing, tilt, plates, d: 0, aoa: 0, want: false }
}

// Up above 100 km/h (and kept up down to 60, or while it flies fast), stowed below; tipped up hard
// as an air brake under heavy braking.
export function updateWing (W, sim, ctl, dt) {
  const v = sim.groundSpeed()
  W.want = W.want ? v > 16.7 : v > 27.8
  W.d = clamp(W.d + (W.want ? dt : -dt) * 1.8, 0, 1)
  const e = W.d * W.d * (3 - 2 * W.d)
  const brake = (ctl.brake > 0 || ctl.ebrake) && v > 15 && sim.mode !== 'air'
  W.aoa += ((brake ? 0.62 : 0.06) - W.aoa) * Math.min(1, dt * 6)
  W.wing.visible = W.d > 0.001
  W.wing.position.y = 1.04 - UP * (1 - e)
  W.tilt.rotation.z = W.aoa * e
  // the endplates unfold over the last part of the rise
  const f = clamp((W.d - 0.45) / 0.55, 0, 1)
  for (const { hinge, s } of W.plates)
    hinge.rotation.x = s * (Math.PI / 2) * (1 - f) - s * 0.12 * f
}
