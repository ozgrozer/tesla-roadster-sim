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
import { CarDoors } from './carDoor.js'
import { poseBoard, pushHands } from './boardPose.js'
import { doorOf, sideOf, BOARD } from '../sim/boarding.js'
import { clamp } from '../sim/constants.js'

const ease = t => t * t * (3 - 2 * t)
const lerp = (a, b, k) => a + (b - a) * k

export class FootView {
  constructor (scene, RS, city = null) {
    this.RS = RS
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
    // the door of any car not the Roadster (carDoor.js)
    this.doors = new CarDoors(this.group, city)
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
    if (p.mode === 'car') {
      O.root.visible = false
      return
    }
    O.root.visible = true
    if (a && !roadster && a.phase !== 'walk' && !(a.dir === 'out' && a.phase === 'close'))
      return poseBoard(O, a, p, pos, this.doors, this.base)
    this.onFoot(dt, p, pos, a && !roadster ? pushHands(a, pos, this.doors, this.base) : null)
  }

  onFoot (dt, p, pos, hands = null) {
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
    poseGait(O, this.walk, this.phase, run, hands ? { hands } : null)
  }

  // the door of a car that isn't the Roadster, as far open as the boarding has it
  doorPanel (a) {
    const show = a && a.entry.kind !== 'roadster' && a.phase !== 'walk' && a.phase !== 'jimmy'
    if (!show) {
      this.doors.hide()
      this.base = 0
      return
    }
    this.doors.show(a.entry, sideOf(a.entry, a.dir === 'in' ? a.side || 1 : 1), doorOf(a))
    this.base = this.doors.mat.elements[13] // (the car's drawn height: a lot's raised slab)
  }

  hide () {
    this.O.root.visible = false
    this.doors.hide()
  }
}
