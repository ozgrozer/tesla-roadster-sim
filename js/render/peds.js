// People on foot (the sim is peds.js and crowd.js), all in one instanced mesh: a figure with a
// shaped trunk, tapered limbs, hands and trainers, a head with a face, and the pieces only some
// have (hair in its several cuts, a cap, a hood, a skirt, a bag, a backpack, a phone, an umbrella;
// pedFigure.js), posed and dressed in the vertex shader from each one's stride, what they are doing
// and their look (pedShader.js), so a whole crowd walks in one draw call. Each foot is planted
// through its stance and travels back at the pace the body moves on (the sim times the stride to
// the speed and the legs' length, so feet don't slide), the knee folds as the leg swings through,
// arms swing against the legs, the body rises over each step, and running they lean in with their
// elbows bent. Heads turn to follow the Roadster; standing about they look down at a phone held up
// in front of them, or talk with their hands; diving out of the Roadster's way, or running from
// it, arms fly up. In the rain umbrellas go up, or hoods; on a bench they sit. Each stands their
// own height and build. At night each is lit by the street light nearest them (pedLight.js). Their
// dogs are a second instanced mesh hung from this one (dogs.js). Only those the camera can see (or
// whose shadows it can) are drawn.
import * as THREE from 'three'
import { CURB_H } from '../sim/city.js'
import { ENV } from '../sim/env.js'
import { kerbDist } from '../sim/street.js'
import { NEAR } from './traffic.js'
import { NIGHT } from './facade.js'
import { DogView } from './dogs.js'
import { lampOn } from './pedLight.js'
import { figure } from './pedFigure.js'
import { posed } from './pedShader.js'
import { shown } from './drawnOnly.js'

const _sp = new THREE.Sphere()
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _fall = new THREE.Quaternion(),
  _side = new THREE.Vector3(0, 0, 1),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3()
const LAMP = { x: 0, y: 0, z: 0, w: 0 }
const TAU = Math.PI * 2
const TURN = 12 // 1/s: how fast someone drawn turns to the way the sim faces them
const RISE = 7 // 1/s: and gets up off the ground

export class PedView {
  constructor (group, max = 360) {
    const g = figure()
    const at = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(max * size),
        size
      )
      a.setUsage(THREE.DynamicDrawUsage)
      g.setAttribute(name, a)
      return a
    }
    this.pose = at('aPose', 4)
    this.act = at('aAct', 4)
    this.look = at('aLook', 1)
    this.gear = at('aGear', 4)
    this.lamp = at('aLamp', 4)
    // (the colours and roughness are worked out in the shader, pedShader.js)
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    mat.onBeforeCompile = shader => posed(shader, true)
    mat.customProgramCacheKey = () => 'pedestrian'
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide
    })
    depth.onBeforeCompile = shader => posed(shader, false)
    depth.customProgramCacheKey = () => 'pedestrian depth'
    this.mesh = new THREE.InstancedMesh(g, mat, max)
    this.mesh.customDepthMaterial = depth
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    group.add(this.mesh)
    this.attrs = [this.pose, this.act, this.look, this.gear, this.lamp]
    // into the shadow map, only the people near the Roadster (the first `near`)
    this.near = 0
    const mesh = this.mesh
    mesh.onBeforeShadow = () => {
      mesh.full = mesh.count
      mesh.count = Math.min(mesh.count, this.near)
    }
    mesh.onAfterShadow = () => {
      mesh.count = mesh.full
    }
    this.max = max
    // their dogs, hung from this mesh (so that they are left out of the city's sun shadow with it)
    this.dogs = new DogView(mesh)
  }
  // view: a THREE.Frustum of what the camera sees (none: draw everyone)
  // People within NEAR of the Roadster go first, and only they are drawn into its shadow map.
  update (peds, view = null) {
    const sim = peds.traffic?.sim,
      me = sim ? (sim.mode === 'ground' ? sim.pos : sim.com) : null
    // (the street lights: on at night, at dusk and in a storm's gloom)
    const on = Math.max(NIGHT.value, ENV.dark)
    // (the frame's own time, for the turns and the getting up eased over a few frames: put)
    const now = performance.now()
    this.dt = Math.min(0.1, Math.max(0, (now - (this.at || now)) / 1000))
    this.at = now
    this.n = (this.n || 0) + 1
    let i = 0
    for (let pass = 0; pass < 2; pass++) {
      for (const d of peds.list) {
        if (i >= this.max) break
        const dx = me ? d.x - me.x : 0,
          dz = me ? d.z - me.z : 0
        if (dx * dx + dz * dz < NEAR * NEAR !== (pass === 0)) continue
        if (view) {
          _sp.center.x = d.x
          _sp.center.y = 0.9
          _sp.center.z = d.z
          _sp.radius = 4.5 // (and their shadow, a few metres long)
          if (!view.intersectsSphere(_sp)) continue
        }
        this.put(d, i++, on)
      }
      if (pass === 0) this.near = i
    }
    shown(this.mesh, i, this.near) // (nobody there: not drawn at all)
    this.dogs.update(peds.dogs || [], view, me, on)
    // (only the people drawn go up to the GPU, not the whole buffer)
    if (!i) return
    const m = this.mesh.instanceMatrix
    m.clearUpdateRanges()
    m.addUpdateRange(0, i * 16)
    m.needsUpdate = true
    for (const a of this.attrs) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, i * a.itemSize)
      a.needsUpdate = true
    }
  }
  put (d, i, on) {
    // up on the pavement, down in the road
    const h = kerbDist(d.x, d.z) > 0 ? 0 : CURB_H
    // (a turn and a getting up eased over a few frames rather than in one: the sim snaps them, a
    // jacked driver up off the road and away, anyone back from a dive; someone not drawn the frame
    // before is put as they are)
    if (d.rN !== this.n - 1) {
      d.ry = d.yaw
      d.rf = d.fall
    } else {
      const a = d.yaw - d.ry
      d.ry += (a - Math.round(a / TAU) * TAU) * Math.min(1, this.dt * TURN)
      d.rf = d.fall >= d.rf ? d.fall : d.rf + (d.fall - d.rf) * Math.min(1, this.dt * RISE)
    }
    d.rN = this.n
    const fall = d.rf > 0.01 ? d.rf : 0
    // (fields and arrays written directly: no numbers passed to calls)
    _q._x = _q._z = 0
    _q._y = Math.sin(d.ry / 2)
    _q._w = Math.cos(d.ry / 2)
    // knocked down (sim/pedBrain.js): tipped over backwards onto the road, lying there
    // (thrown by a car: up in the air and turning over, sim/pedBrain.js lie)
    const air = d.air > 0 ? d.air : 0
    if (fall > 0 || air > 0) {
      _fall.setFromAxisAngle(_side, (fall * Math.PI) / 2.1 + (air > 0 ? d.spin : 0))
      _q.multiply(_fall)
    }
    _p.x = d.x
    _p.y = h + (fall > 0 ? 0.12 * fall : 0) + air + (air > 0 ? 0.6 : 0)
    _p.z = d.z
    _s.x = _s.y = d.tall
    _s.z = d.wide
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(i, _m)
    const P = this.pose.array,
      A = this.act.array,
      G = this.gear.array,
      L = this.lamp.array,
      j = i * 4
    P[j] = d.phase
    P[j + 1] = d.gait
    P[j + 2] = d.fright
    P[j + 3] = d.hop
    A[j] = d.head
    // (on the phone; or fists up, fighting, the punch's reach past 3: sim/brawl.js, -1 - punch)
    A[j + 1] = d.act === 1 ? 1 : d.act >= 3 ? -1 - (d.act - 3) : 0
    A[j + 2] = d.act === 2 ? 1 : 0
    A[j + 3] = d.phase
    this.look.array[i] = d.look
    // the rain's umbrella and hood, a seat, and the hand on the dog's side holding its lead (unless
    // it has dived off out of reach)
    const dog = d.dog
    G[j] = d.umb || 0
    G[j + 1] = d.hunch || 0
    G[j + 2] = d.sit || 0
    G[j + 3] =
      dog && (dog.x - d.x) ** 2 + (dog.z - d.z) ** 2 < 4.8 ? dog.side : 0
    lampOn(d.x, d.z, on, LAMP)
    L[j] = LAMP.x
    L[j + 1] = LAMP.y - h
    L[j + 2] = LAMP.z
    L[j + 3] = LAMP.w
  }
}
