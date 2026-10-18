// Street furniture: street lights and a signal mast on every corner whose red, yellow and green
// lamps follow the intersection's signal plan; with the palms and trees (cityTrees.js), the power
// lines, benches, hydrants and bins (cityKerb.js). The street lights are Los Angeles' cobra heads:
// a tapered steel pole, its arm curving up and out over the road to a flattened head, its lens
// underneath; on Mid-City's and Venice's side streets the light hangs from a wooden power pole, a
// crossarm at its top carrying the wires. All instanced (one mesh a district: chunks.js), and all of
// it goes over when the Roadster hits it hard enough (the sim decides: breakables.js; the fall:
// fallers.js).
import * as THREE from 'three'
import { hdr, softTex } from './scene.js'
import { Instances } from './chunks.js'
import { merge, box, tint } from './geo.js'
import { Fallers, pose, instanced, one, subset } from './fallers.js'
import { greenery } from './cityTrees.js'
import { Wires, buildDecor } from './cityKerb.js'
import { nameSigns } from './cityNames.js'
import {
  NODES,
  CURB_H,
  LAMPS,
  POLES,
  DIRS,
  RED,
  YELLOW,
  GREEN,
  ROAD_HW,
  LANE_OFF,
  signal
} from '../sim/city.js'

const _m = new THREE.Matrix4(),
  _l = new THREE.Matrix4()
const metal = new THREE.MeshStandardMaterial({
  color: 0x34373c,
  roughness: 0.5,
  metalness: 0.6
})

// ---------- street lights ----------
const lampYaw = l => Math.atan2(-l.az, l.ax)
// an arm curving up from the pole at y0 and out over the road to its head at (x1, y1)
const arm = (y0, x1, y1) =>
  new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.02, y0, 0),
      new THREE.Vector3(0.06, y1 + 0.05, 0),
      new THREE.Vector3(x1, y1, 0)
    ),
    4,
    0.045,
    3
  )
// the cobra's head: wider at its far end, flattened, its lens underneath
const head = (x, y) =>
  new THREE.CylinderGeometry(0.09, 0.2, 0.8, 6)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.55, 1)
    .translate(x + 0.38, y, 0)
// where the head is on a steel pole, and on a wooden one
const HEAD = { steel: [1.97, 9.02], wood: [1.65, 8.25] }
function lamps (group) {
  const steel = subset(LAMPS, l => !l.wood),
    wood = subset(LAMPS, l => l.wood)
  const stand = l => pose(l.x, 0, l.z, lampYaw(l))
  // the steel pole, its arm and head
  const [sx, sy] = HEAD.steel,
    [wx, wy] = HEAD.wood
  const post = merge([
    new THREE.CylinderGeometry(0.07, 0.13, 8.5, 6, 1, true).translate(
      0,
      4.25,
      0
    ),
    arm(8.2, sx, sy),
    head(sx, sy)
  ])
  const posts = instanced(
    post,
    metal,
    steel.items,
    stand,
    true,
    'street lights'
  )
  // the wooden pole, its crossarm, a transformer, and the light's arm lower down
  const brown = 0x5f4c3a,
    grey = 0x3a3d42
  const pole = merge([
    tint(
      new THREE.CylinderGeometry(0.11, 0.16, 11, 6, 1, true).translate(
        0,
        5.5,
        0
      ),
      brown
    ),
    tint(box(-1.05, 10.28, -0.06, 1.35, 10.4, 0.06), brown),
    tint(
      new THREE.CylinderGeometry(0.28, 0.28, 0.9, 6, 1, true).translate(
        -0.42,
        9.2,
        0
      ),
      0x8d9296
    ),
    tint(arm(7.7, wx, wy), grey),
    tint(head(wx, wy), grey)
  ])
  const woods = instanced(
    pole,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    wood.items,
    stand,
    true,
    'power poles'
  )
  // each lens under its head, whichever pole it is on
  LENS.color = hdr(3.2, 2.5, 1.6)
  const lens = new THREE.PlaneGeometry(0.6, 0.24).rotateX(Math.PI / 2)
  const lenses = instanced(
    lens,
    LENS,
    LAMPS,
    l => {
      const [x, y] = l.wood ? HEAD.wood : HEAD.steel
      return stand(l).multiply(_l.makeTranslation(x + 0.42, y - 0.1, 0))
    },
    false,
    'lenses'
  )
  // at night, the light each throws on the ground under its head (on the pavement's height, so it
  // shows on the pavement as well as the road)
  const pools = instanced(
    new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2),
    POOL,
    LAMPS,
    l => pose(l.x + l.ax * 2.3, CURB_H + 0.02, l.z + l.az * 2.3, 0),
    false,
    'light pools'
  )
  pools.receiveShadow = false
  pools.visible = false
  group.add(...posts.meshes, ...woods.meshes, ...lenses.meshes, ...pools.meshes)
  return new Fallers(
    'lamp',
    LAMPS,
    [
      { inst: posts, of: steel.of },
      { inst: woods, of: wood.of },
      { inst: lenses, of: one, dark: true },
      { inst: pools, of: one, dark: true }
    ],
    {
      L: l => (l.wood ? 7.2 : 6),
      rest: () => 1.53,
      h: l => (l.wood ? 11 : 9),
      skid: 0.5
    }
  )
}
const LENS = new THREE.MeshBasicMaterial({ toneMapped: false })
const POOL = new THREE.MeshBasicMaterial({
  map: softTex,
  color: new THREE.Color(1, 0.74, 0.45),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4
})

// ---------- signal masts ----------
// In each mast's frame +x is the direction of the traffic it faces and +z that traffic's right.
// The pole stands on the far right corner; the arm reaches back over the lanes, a head over each.
const ARM_Y = 6.3
const HEAD_Z = LANE_OFF.map(o => o - (ROAD_HW + 2.2))
const LAMP_Y = [ARM_Y - 0.4, ARM_Y - 0.76, ARM_Y - 1.12] // red, yellow, green
const ON = [hdr(7, 0.25, 0.12), hdr(7, 3.6, 0.2), hdr(0.3, 6, 3)]
const OFF = ON.map(c => c.clone().multiplyScalar(0.035))
export class Signals {
  constructor (group) {
    const parts = [
      new THREE.CylinderGeometry(0.13, 0.17, ARM_Y + 0.5, 8).translate(
        0,
        (ARM_Y + 0.5) / 2,
        0
      ),
      box(-0.08, ARM_Y - 0.08, Math.min(...HEAD_Z) - 0.6, 0.08, ARM_Y + 0.08, 0)
    ]
    for (const z of HEAD_Z) {
      parts.push(box(-0.2, ARM_Y - 1.32, z - 0.2, 0.2, ARM_Y - 0.08, z + 0.2))
      parts.push(box(0.2, ARM_Y - 1.42, z - 0.36, 0.23, ARM_Y + 0.02, z + 0.36)) // back plate
    }
    // the box the street's name hangs in, under the arm by the pole
    parts.push(box(-0.11, ARM_Y - 0.7, -3.25, -0.06, ARM_Y - 0.08, -0.65))
    const yaw = p => Math.atan2(-DIRS[p.dir][1], DIRS[p.dir][0])
    const place = p => pose(p.x, 0, p.z, yaw(p))
    const masts = instanced(
      merge(parts),
      metal,
      POLES,
      place,
      true,
      'signal masts'
    )
    group.add(...masts.meshes)
    // the name of the street it crosses, lit (cityNames.js)
    this.names = nameSigns(POLES, place, [-0.12, ARM_Y - 0.44, -1.95])
    group.add(...this.names.signs.meshes)
    // (a lamp's disc in eight sides: at its size, as round as fourteen)
    const disc = new THREE.CircleGeometry(0.14, 8).rotateY(-Math.PI / 2)
    const per = HEAD_Z.length * 3,
      n = POLES.length * per
    this.lamps = new Instances(
      disc,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      n,
      k => POLES[Math.floor(k / per)],
      { cast: false, receive: false, split: false }
    )
    let k = 0
    for (const p of POLES) {
      const base = pose(p.x, 0, p.z, yaw(p)).clone()
      for (const z of HEAD_Z)
        for (const y of LAMP_Y)
          this.lamps.setMatrixAt(
            k++,
            _l.copy(base).multiply(_m.makeTranslation(-0.21, y, z))
          )
    }
    for (let i = 0; i < n; i++) this.lamps.setColorAt(i, OFF[i % 3])
    this.lamps.bounds()
    group.add(...this.lamps.meshes)
    this.state = new Int8Array(POLES.length).fill(-1)
    // a mast that is knocked down goes dark
    this.fallers = new Fallers(
      'signal',
      POLES,
      [
        { inst: masts, of: one },
        { inst: this.names.signs, of: one },
        {
          inst: this.lamps,
          of: i => Array.from({ length: per }, (_, j) => i * per + j),
          dark: true
        }
      ],
      { L: () => 5, rest: () => 1.5, h: () => ARM_Y, skid: 0.35 }
    )
  }
  update (t) {
    POLES.forEach((p, i) => {
      const st = signal(NODES[p.node], p.dir, t)
      if (st === this.state[i]) return
      this.state[i] = st
      const lit = st === RED ? 0 : st === YELLOW ? 1 : st === GREEN ? 2 : -1
      for (let h = 0; h < HEAD_Z.length; h++)
        for (let j = 0; j < 3; j++)
          this.lamps.setColorAt(
            (i * HEAD_Z.length + h) * 3 + j,
            j === lit ? ON[j] : OFF[j]
          )
    })
  }
}

// the street furniture, and what goes over when it is hit, by the sim's kind; night (0 to 1) lights
// the street lights up
export function buildProps (group) {
  const signals = new Signals(group)
  const green = greenery(group)
  const fallers = {
    lamp: lamps(group),
    palm: green.palm,
    tree: green.tree,
    signal: signals.fallers
  }
  // the wires come down with a wooden pole, and go back up with it
  const wires = new Wires(group)
  fallers.lamp.onKnock = i => wires.cut(i)
  fallers.lamp.onStandUp = () => wires.restore()
  buildDecor(group)
  const pools = fallers.lamp.parts[3].inst
  const night = k => {
    LENS.color.copy(hdr(3.2, 2.5, 1.6)).multiplyScalar(1 + 2 * k)
    POOL.opacity = 0.42 * k
    pools.visible = k > 0.01
    signals.names.night(k)
  }
  return { signals, fallers, night }
}
