// The player on foot, drawn: Optimus (optimus.js), out of the Roadster and walking the city, its
// legs and arms swinging with its pace (a longer, quicker stride and a lean running), legs tucked in
// a jump, flat on its back knocked over; and getting into a car and out of it (boarding.js): at the
// window breaking in, a hand on the door as it opens, reaching in for a driver, ducking and sliding
// in sideways into the seat. The Roadster's own door and its own Optimus do the Roadster's way in
// (intro.js boardRoadster); any other car gets a door of its own drawn over its side, in its paint,
// that swings open on its front hinge.
import * as THREE from 'three'
import { buildOptimus, poseOptimus, HIP_STAND } from './optimus.js'
import { poseGait, ampFor, strideFor } from './optimusGait.js'
import { poseFists } from './optimusFists.js'
import { punchPose } from '../sim/melee.js'
import { boardRoadster, BOARD_T } from './intro.js'
import { doorOf, seatShare, BOARD } from '../sim/boarding.js'
import { vehicles } from '../sim/vehicles.js'
import { clamp, wrapPi } from '../sim/constants.js'

const ease = t => t * t * (3 - 2 * t)
const lerp = (a, b, k) => a + (b - a) * k
const _w = { x: 0, z: 0 }

export class FootView {
  constructor (scene, RS, cars = null) {
    this.RS = RS
    this.cars = cars // the traffic's view (its paint, for a door)
    this.group = new THREE.Group()
    scene.add(this.group)
    const O = (this.O = buildOptimus())
    O.root.rotation.order = 'YXZ'
    O.root.traverse(o => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true
    })
    this.group.add(O.root)
    O.root.visible = false
    this.phase = 0
    this.lastDist = 0
    this.walk = 0 // how much of the walk shows, eased
    // a car door, for any car not the Roadster: a hinge, the panel in paint and its window
    this.paint = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.36,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.05
    })
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x10161c,
      roughness: 0.05,
      clearcoat: 1
    })
    const box = new THREE.BoxGeometry(1, 1, 1)
    this.door = new THREE.Group() // in the car's frame
    this.hinge = new THREE.Group()
    this.panel = new THREE.Mesh(box, this.paint)
    this.window = new THREE.Mesh(box, this.glass)
    this.panel.castShadow = true
    this.hinge.add(this.panel, this.window)
    this.door.add(this.hinge)
    this.door.visible = false
    this.group.add(this.door)
    this.doorFor = null
  }

  // the figure where the player is (pos: drawn between physics steps), posed for what they do
  update (dt, p, pos, action) {
    const O = this.O,
      RS = this.RS
    const a = action
    const roadster = a && a.entry.kind === 'roadster'
    this.doorPanel(a)
    // the Roadster's way in and out, on its own Optimus
    if (roadster && a.phase === 'roadster') {
      O.root.visible = false
      const k = clamp(a.t / (a.dir === 'in' ? BOARD.roadIn : BOARD.roadOut), 0, 1)
      const t =
        a.dir === 'in'
          ? lerp(BOARD_T.start, BOARD_T.end, k)
          : lerp(BOARD_T.doorDown, BOARD_T.start, k)
      RS.optimus.root.visible = true
      boardRoadster(RS, t)
      return
    }
    if (roadster && a.dir === 'out' && a.phase === 'close') RS.door = doorOf(a)
    if (p.mode === 'car' || (a && seatShare(a) > 0.72)) {
      O.root.visible = false
      return
    }
    O.root.visible = true
    if (a && a.phase !== 'walk' && !(a.dir === 'out' && a.phase === 'close'))
      return this.boarding(a, p, pos)
    this.onFoot(dt, p, pos)
  }

  onFoot (dt, p, pos) {
    const O = this.O
    const run = p.run
    // the swing with the pace, the stride's phase with the distance walked at that swing's stride
    // (optimusGait.js: the planted foot keeps its place on the ground)
    const d = p.dist - this.lastDist
    this.lastDist = p.dist
    const want = p.grounded ? ampFor(p.speed) : 0
    this.walk += (want - this.walk) * Math.min(1, dt * 12)
    if (d > 0 && d < 3) this.phase += (Math.PI * 2 * d) / strideFor(this.walk)
    O.root.position.set(pos.x, pos.y + HIP_STAND + (p.lift || 0), pos.z) // (easing up a step: player.js)
    O.root.rotation.set(0, p.heading, 0)
    if (p.down > 0) {
      // flat on its back, then getting up
      const up = clamp((0.5 - p.down) / 0.5, 0, 1)
      O.root.rotation.set(0, p.heading, lerp(Math.PI / 2 - 0.1, 0, ease(up)))
      O.root.position.y = pos.y + lerp(0.25, HIP_STAND, ease(up))
      poseOptimus(O, { lean: -0.2 * (1 - up) })
      return
    }
    if (!p.grounded) {
      // a jump: knees up under it, arms out
      const h = p.heading,
        fx = Math.cos(h),
        fz = -Math.sin(h)
      const tuck = clamp(p.airT * 4, 0, 1) * clamp(1 - Math.max(0, -p.vel.y) / 8, 0.3, 1)
      const feet = [-1, 1].map(s => ({
        at: [
          pos.x + fx * 0.12 * tuck - fz * 0.11 * s,
          pos.y + HIP_STAND - 0.86 + 0.32 * tuck,
          pos.z + fz * 0.12 * tuck + fx * 0.11 * s
        ],
        knee: [fx, 0.4, fz]
      }))
      poseOptimus(O, { feet, lean: 0.1 * tuck, walk: 0.3, phase: 1.2 })
      return
    }
    // fists: a punch being thrown, or up in guard a moment after (optimusFists.js)
    const m = this.melee,
      pp = m ? punchPose(m) : null
    if (pp || (m && m.since < 1.1)) return poseFists(O, p, pos, pp, this.walk, this.phase)
    poseGait(O, this.walk, this.phase, run)
  }

  // at the door, and sliding in or out (pos: the feet at the door, or where it gets out)
  boarding (a, p, pos) {
    const O = this.O,
      e = a.entry
    const sg = a.side || 1 // (-1: in by the other side's door, the driver's blocked: boarding.js)
    const side = wrapPi(e.heading - (Math.PI / 2) * sg) // (facing the car, from its left)
    const door = vehicles.toWorld(e, e.door.x, e.door.z * sg, _w)
    const dx = door.x,
      dz = door.z
    const gy = pos.y
    const k = seatShare(a)
    const hgt = e.hgt
    // a point on the car (its frame) into the world, at height y
    const W = (lx, y, lz) => {
      const w = vehicles.toWorld(e, lx, lz)
      return [w.x, y, w.z]
    }
    if (a.dir === 'out' && a.phase === 'out') {
      // out of the seat onto the spot beside it
      const seat = vehicles.toWorld(e, e.seat.x, e.seat.z)
      const u = ease(1 - k)
      const x = lerp(seat.x, a.spot.x, u),
        z = lerp(seat.z, a.spot.z, u)
      O.root.position.set(x, gy + lerp(e.seat.y + 0.1, HIP_STAND, u), z)
      O.root.rotation.set(0, 0, 0)
      O.root.rotation.y = lerp(e.heading, side + Math.PI, u)
      poseOptimus(O, { lean: 0.4 * (1 - u), walk: 0 })
      return
    }
    if (a.phase === 'in') {
      // ducking in sideways: the hips from the door to the seat, turning to face ahead
      const seat = vehicles.toWorld(e, e.seat.x, e.seat.z)
      const u = ease(k)
      O.root.position.set(
        lerp(dx, seat.x, u),
        gy + lerp(HIP_STAND, e.seat.y + 0.1, u),
        lerp(dz, seat.z, u)
      )
      O.root.rotation.set(0, side + wrapPi(e.heading - side) * u, 0)
      poseOptimus(O, { lean: 0.45 * Math.sin(Math.PI * u), walk: 0, look: 0.3 * u })
      return
    }
    O.root.position.set(dx, gy + HIP_STAND, dz)
    O.root.rotation.set(0, side, 0)
    const t = a.t
    let hands = null
    let lean = 0.05
    if (a.phase === 'jimmy') {
      // at the window: worrying the lock, or a sharp blow through the glass
      const j = Math.sin(t * 18) * 0.02
      const win = W(e.door.x + 0.15, gy + Math.min(hgt * 0.7, 1.3), (-e.wid / 2 - 0.05) * sg)
      const lock = W(e.door.x + 0.45 + j, gy + Math.min(hgt * 0.5, 1.0), (-e.wid / 2 - 0.05) * sg)
      const blow = a.smash && t > BOARD.smashAt - 0.35 && t < BOARD.smashAt + 0.15
      hands = [
        { at: lock, w: 1 },
        { at: blow ? win : W(e.door.x + 0.3, gy + 1.05 + j, (-e.wid / 2 - 0.08) * sg), w: 1 }
      ]
      lean = blow ? 0.25 : 0.12
    } else if (a.phase === 'open' || (a.dir === 'out' && a.phase === 'close')) {
      const h = W(e.door.x + 0.5, gy + Math.min(hgt * 0.55, 1.05), (-e.wid / 2 - 0.1) * sg)
      hands = [{ at: h, w: a.dir === 'in' ? 1 : 0.5 }, null]
    } else if (a.phase === 'pull') {
      // in after the driver, and hauling them out
      const s = Math.sin(Math.PI * clamp(t / BOARD.pull, 0, 1))
      const at = W(lerp(e.door.x, e.seat.x, s), gy + e.seat.y + 0.45, lerp(e.door.z * sg, e.seat.z, s))
      hands = [{ at, w: 1 }, { at: [at[0], at[1] + 0.1, at[2]], w: 1 }]
      lean = 0.3 * s
    }
    poseOptimus(O, { hands, lean, walk: 0 })
  }

  // a door of its own over the side of a car that isn't the Roadster, swinging on its front hinge
  doorPanel (a) {
    const show = a && a.entry.kind !== 'roadster' && a.phase !== 'walk' && a.phase !== 'jimmy'
    this.door.visible = !!show
    if (!show) return
    const e = a.entry
    if (this.doorFor !== e) {
      this.doorFor = e
      const len = e.doorLen,
        y0 = 0.32,
        y1 = Math.min(e.hgt * 0.6, e.hgt - 0.5),
        y2 = Math.min(e.hgt - 0.12, y1 + 0.55)
      this.hingeX = e.door.x - 0.15 + len * 0.55
      this.panel.scale.set(len, y1 - y0, 0.06)
      this.panel.position.set(-len / 2, (y0 + y1) / 2, 0)
      this.window.scale.set(len * 0.85, y2 - y1, 0.03)
      this.window.position.set(-len / 2 - 0.05, (y1 + y2) / 2, 0)
      const ty = this.cars?.types?.[e.car?.type]
      const pe = ty?.pal?.[Math.floor((e.car?.paint || 0) * 256) & 255]
      if (pe) this.paint.color.copy(pe.c)
    }
    this.door.position.set(e.pos.x, (e.car?.alt || 0) + e.pos.y, e.pos.z)
    this.door.rotation.set(0, e.heading, 0)
    this.hinge.position.set(this.hingeX, 0, -e.wid / 2 - 0.035)
    this.hinge.rotation.y = -1.1 * ease(doorOf(a))
  }

  hide () {
    this.O.root.visible = false
    this.door.visible = false
  }
}
