// The driver's door of a city car, opened and shut as the player gets in or out (sim/boarding.js):
// its own skin, cut from the car's body between the door's shut lines (sim/vehicles.js DOORS, the
// shut lines carSpecs.js draws) and from the sill up to the beltline, its window up to the glass's
// top (following the A-pillar), so shut it lies exactly over the body; drawn with the traffic's own
// paint and glass materials (its colour, finish and livery: a police car's white door), inside it
// the dark door card, and where it stood the opening (a dark aperture over the body's own door
// while it is open). It swings out on a vertical hinge at its front edge (the A-pillar), eased in
// and out, to ~66° (a van's or a truck's to ~72°, a bus's folding door further), riding the car's
// body (its springs and the slope: render/traffic.js hands over the car's matrix).
import * as THREE from 'three'
import { sectionAt, P } from './carBody.js'

export const SWING = { default: 1.15, van: 1.25, truck: 1.25, fire: 1.25, ambulance: 1.25, bus: 1.45 }
// eased in and out (the door's weight: it starts, swings and is checked by its strap)
export const easeDoor = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
export const swingOf = name => SWING[name] ?? SWING.default

const OUT = 0.006 // m the door's skin stands proud of the body's (no flicker between them)
const N = 9 // stations along it

// The door's skin for body lines B on side sd (-1 left): { paint, glass, hinge: { x, z } } in the
// car's frame, the skin at its shut place. x0, x1: the door's back and front edges
export function doorShape (B, x0, x1, sd, out = OUT) {
  const g0 = Math.max(x0, B.glass[0]),
    g1 = Math.min(x1, B.glass[1], B.ws)
  const paint = [],
    glass = []
  const quads = (rows, list) => {
    // rows: per station, [[x, y, z], ...] bottom to top
    const pos = [],
      idx = []
    const m = rows[0].length
    for (const r of rows) for (const q of r) pos.push(q[0], q[1], q[2] * sd)
    for (let j = 0; j + 1 < rows.length; j++)
      for (let i = 0; i + 1 < m; i++) {
        const a = j * m + i,
          b = (j + 1) * m + i,
          c = a + 1,
          d = b + 1
        // (outward on the right; the left's mirror image winds the other way)
        if (sd > 0) idx.push(a, b, c, b, d, c)
        else idx.push(a, c, b, b, c, d)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    list.push(g)
  }
  const proud = (q, k = 1) => [q[0] + out * k, q[1]]
  const rows = []
  for (let j = 0; j <= N; j++) {
    const x = x0 + ((x1 - x0) * j) / N
    const s = sectionAt(B, x)
    const row = []
    for (let i = P.sill; i <= P.belt; i++) {
      const [z, y] = proud(s[i])
      row.push([x, y, z])
    }
    rows.push(row)
  }
  quads(rows, paint)
  if (g1 - g0 > 0.08) {
    const gr = []
    for (let j = 0; j <= N; j++) {
      const x = g0 + ((g1 - g0) * j) / N
      const s = sectionAt(B, x)
      gr.push([s[P.belt], s[P.rail]].map(q => { const [z, y] = proud(q, 0.7); return [x, y, z] }))
    }
    quads(gr, glass)
  }
  const h = sectionAt(B, x1)
  return { paint: paint[0], glass: glass[0] || null, hinge: { x: x1, z: h[P.wide][0] * sd + sd * out } }
}

const _m = new THREE.Matrix4(),
  _r = new THREE.Matrix4(),
  _t = new THREE.Matrix4(),
  _v = new THREE.Vector3()

export class CarDoors {
  constructor (group, city) {
    this.city = city // (its cars: the traffic's view, the types' materials and the car's matrix, once built)
    this.group = new THREE.Group()
    this.group.name = 'car door'
    group.add(this.group)
    this.cache = new Map()
    this.card = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.85, side: THREE.BackSide })
    this.hole = new THREE.MeshStandardMaterial({
      color: 0x08090b,
      roughness: 0.95,
      transparent: true,
      opacity: 0.93,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
    // the door's own window: lighter and see-through, so an open door reads as glass against the
    // dark cabin behind it (the body's glass is near black head on; a broken one isn't drawn crazed)
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x5d7486,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.6,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide
    })
    this.cur = null
    this.angle = 0
    this.mat = new THREE.Matrix4() // the car's body, as drawn
  }
  // the meshes for type k on side sd (made once each)
  parts (k, sd, e) {
    const key = k * 2 + (sd > 0 ? 1 : 0)
    let c = this.cache.get(key)
    if (c) return c
    const ty = this.cars.types[k],
      B = ty.S
    const [x0, x1] = e.doorSpan
    const sh = doorShape(B, x0 + 0.01, x1 - 0.01, sd)
    const hole = doorShape(B, x0 + 0.01, x1 - 0.01, sd, 0.003)
    const inst = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, 1)
      geo.setAttribute('aDent', new THREE.InstancedBufferAttribute(new Float32Array(4), 4))
      const hurt = new THREE.InstancedBufferAttribute(new Float32Array(4), 4)
      hurt.array[2] = k
      geo.setAttribute('aHurt', hurt)
      m.frustumCulled = false
      m.castShadow = true
      m.receiveShadow = true
      m.customDepthMaterial = ty.body.customDepthMaterial
      return m
    }
    const paint = inst(sh.paint, ty.body.material)
    sh.paint.setAttribute('aPaint', new THREE.InstancedBufferAttribute(new Float32Array(1), 1))
    paint.setColorAt(0, new THREE.Color())
    const glass = sh.glass ? inst(sh.glass, this.glass) : null
    const card = new THREE.Mesh(sh.paint, this.card)
    const holes = [new THREE.Mesh(hole.paint, this.hole)]
    if (hole.glass) holes.push(new THREE.Mesh(hole.glass, this.hole))
    for (const m of [card, ...holes]) {
      m.matrixAutoUpdate = false
      m.frustumCulled = false
    }
    card.castShadow = true
    const door = [paint, card, ...(glass ? [glass] : [])]
    c = { door, holes, hinge: sh.hinge, paint, glass, all: [...door, ...holes] }
    for (const m of c.all) {
      m.visible = false
      this.group.add(m)
    }
    this.cache.set(key, c)
    return c
  }
  get cars () {
    return this.city?.cars || null
  }

  // Door of entry e (a city car) on side sd open by share k (0 shut, 1 open): eased to its swing
  show (e, sd, k) {
    const car = e.car
    if (!car || !this.cars?.types) return this.hide()
    const c = this.parts(car.type, sd, e)
    if (this.cur && this.cur !== c) this.hide()
    this.cur = c
    const cv = this.cars
    cv.doorCar = car // (its matrix, as drawn: render/traffic.js put)
    if (cv.doorMat && cv.doorFor === car) this.mat.copy(cv.doorMat)
    else this.mat.makeRotationY(car.yaw).setPosition(car.x, car.y || 0, car.z)
    const ty = cv.types[car.type]
    const pe = ty.pal[Math.floor(car.paint * 256) & 255]
    c.paint.setColorAt(0, pe.c)
    c.paint.instanceColor.needsUpdate = true
    const fin = c.paint.geometry.getAttribute('aPaint')
    fin.array[0] = pe.metal
    fin.needsUpdate = true
    const a = swingOf(e.type) * easeDoor(Math.max(0, Math.min(1, k)))
    this.angle = a
    // about the hinge: out from the side (the left's back edge swings to -z)
    _t.makeTranslation(c.hinge.x, 0, c.hinge.z)
    _r.makeRotationY(sd < 0 ? -a : a)
    _m.copy(this.mat).multiply(_t).multiply(_r).multiply(_t.makeTranslation(-c.hinge.x, 0, -c.hinge.z))
    const open = k > 0.004
    for (const m of c.door) {
      m.visible = open
      if (m.isInstancedMesh) {
        m.setMatrixAt(0, _m)
        m.instanceMatrix.needsUpdate = true
      } else m.matrix.copy(_m)
    }
    for (const m of c.holes) {
      m.visible = open
      m.matrix.copy(this.mat)
    }
  }
  // a point on the door's outside (lx along the car, y up, car frame) where the door is now, in the
  // world: for a hand on its handle or its edge. inside: on the door card instead
  pointOn (e, sd, lx, y, inside = false, out = [0, 0, 0]) {
    const c = this.cur
    if (!c) return null
    const ty = this.cars.types[e.car.type]
    const z = sectionAt(ty.S, lx)[P.crease][0] * sd + (inside ? -0.08 : 0.035) * sd
    const a = sd < 0 ? -this.angle : this.angle
    const dx = lx - c.hinge.x,
      dz = z - c.hinge.z,
      ca = Math.cos(a),
      sa = Math.sin(a)
    _v.set(c.hinge.x + dx * ca + dz * sa, y, c.hinge.z - dx * sa + dz * ca).applyMatrix4(this.mat)
    out[0] = _v.x
    out[1] = _v.y
    out[2] = _v.z
    return out
  }
  hide () {
    if (this.cur) for (const m of this.cur.all) m.visible = false
    this.cur = null
    this.angle = 0
    if (this.cars) this.cars.doorCar = null
  }
}
