// The city's opening scene: Optimus walks up to the parked Roadster from behind (the camera low at
// its heels, like the reveal's photo) as the driver's door swings up, and gets in the way a person
// gets into a low car: the inside foot over the sill into the footwell, ducking under the roof rail
// onto the edge of the seat, the outside leg lifted over the sill after it, then back into the seat
// and hands on the yoke, and the door comes down. The car unlocks as it walks up and locks once the
// door is down (onCue hears 'unlock' and 'lock'). Any drive key skips it, locking the car at once.
// While it runs it owns the camera; when it ends the follow camera eases in from wherever it left off.
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { DRIVER, YOKE } from './roadsterCabin.js'
import { poseOptimus, HIP_STAND, ANKLE_UP } from './optimus.js'

const T = {
  walk: 4.4, // reaches the door
  unlock: 2.6,
  doorUp: [3.1, 4.3],
  doorDown: [8.9, 9.9],
  lock: 10.2,
  end: 10.3
}
const FROM = [-6.4, -2.05] // car-frame x, z where it starts walking
const DOORSIDE = [-0.2, -1.32] // where it stands to get in, by the back of the door opening
const STRIDE = 1.45 // m per step pair, and its pace
const SPEED = (DOORSIDE[0] - FROM[0]) / T.walk

// Getting in, after the walk, as keys eased one into the next: the hips (car frame), the torso's lean
// and its tilt (out, to keep the head clear of the roof rail until it is low enough to pass under), the
// feet ([left, right] ankles, `up` lifting one over the sill on its way to this key) and which way
// the knees point, and what the hands hold on the way down: the left the roof rail over the door, the
// right the yoke, until each takes its own grip. The left leg is the one outside.
const G = ANKLE_UP, // ankle on the road
  F = 0.165 + ANKLE_UP // and on the cabin floor
const ahead = [1, 0, 0],
  splay = [1, 0.2, -0.5], // a knee forward and out, clear of the yoke
  elbows = [
    [-0.3, -1, -0.5],
    [-0.3, -1, 0.5]
  ]
const RAIL = [0.0, 1.04, -0.66], // the roof rail's edge over the door opening
  GRIP = DRIVER.hands.map(h => h.at),
  OUTER = [YOKE[0], YOKE[1], YOKE[2] - 0.12] // the right hand on the left grip
const KEYS = [
  {
    t: 4.7,
    hips: [DOORSIDE[0], HIP_STAND, DOORSIDE[1]],
    feet: [
      [DOORSIDE[0], G, DOORSIDE[1] - 0.105],
      [DOORSIDE[0], G, DOORSIDE[1] + 0.105]
    ]
  },
  {
    t: 5.5,
    hips: [-0.18, 0.84, -1.17],
    lean: 0.1,
    look: -0.3,
    feet: [
      [DOORSIDE[0], G, DOORSIDE[1] - 0.105],
      [0.12, F, -0.64, 0.3]
    ]
  },
  {
    t: 6.2,
    hips: [-0.16, 0.56, -0.8],
    lean: 0.35,
    look: -0.3,
    feet: [
      [-0.1, G, -1.12, 0.06],
      [0.12, F, -0.64]
    ],
    knees: [ahead, splay],
    hands: [RAIL, OUTER],
    elbows: [[-0.2, -0.6, -1], elbows[1]]
  },
  {
    t: 6.55,
    hips: [-0.2, 0.47, -0.64],
    lean: 0.4,
    tilt: -0.18,
    look: -0.25,
    feet: [
      [-0.1, G, -1.12],
      [0.14, F, -0.6]
    ],
    knees: [[0.2, 1, -0.3], splay],
    hands: [RAIL, OUTER],
    elbows: [[-0.2, -0.6, -1], elbows[1]]
  },
  {
    t: 6.75,
    hips: [-0.22, 0.41, -0.6],
    lean: 0.45,
    tilt: -0.15,
    look: -0.2,
    feet: [
      [-0.1, G, -1.12],
      [0.15, F, -0.57]
    ],
    knees: [[0.2, 1, -0.3], splay],
    hands: [RAIL, OUTER],
    elbows: [[-0.2, -0.6, -1], elbows[1]]
  },
  {
    t: 7.0,
    hips: [-0.24, 0.385, -0.55],
    lean: 0.45,
    look: -0.2,
    feet: [
      [-0.1, G, -1.12],
      [0.16, F, -0.55]
    ],
    knees: [[0.2, 1, -0.3], splay],
    hands: [RAIL, OUTER],
    elbows: [[-0.2, -0.6, -1], elbows[1]]
  },
  {
    t: 7.4,
    hips: [-0.3, 0.36, -0.5],
    lean: 0.3,
    feet: [
      [-0.02, 0.5, -1.0],
      [0.2, F, -0.45]
    ],
    knees: [[0.2, 1, -0.6], splay],
    hands: [RAIL, OUTER],
    elbows: [[-0.2, -0.6, -1], elbows[1]]
  },
  {
    t: 7.9,
    hips: [-0.34, 0.35, -0.42],
    lean: 0.25,
    feet: [
      [0.25, F, -0.5, 0.12],
      [0.3, F, -0.25]
    ],
    knees: [[1, 0.5, -0.4], ahead],
    hands: GRIP
  },
  {
    t: 8.6,
    hips: DRIVER.root,
    lean: DRIVER.lean,
    nod: DRIVER.nod,
    feet: DRIVER.feet.map(f => f.at),
    hands: GRIP
  }
]

const ease = t => t * t * (3 - 2 * t)
const span = (t, [a, b]) => ease(clamp((t - a) / (b - a), 0, 1))
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
const _p = new THREE.Vector3(),
  _l = new THREE.Vector3()

// the pose between the keys either side of t
function keyed (t) {
  let i = 0
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++
  const A = KEYS[i],
    B = KEYS[i + 1]
  const u = clamp((t - A.t) / (B.t - A.t), 0, 1),
    k = ease(u)
  const num = key => (A[key] ?? 0) + ((B[key] ?? 0) - (A[key] ?? 0)) * k
  return {
    hips: lerp(A.hips, B.hips, k),
    lean: num('lean'),
    tilt: num('tilt'),
    nod: num('nod'),
    look: num('look'),
    feet: [0, 1].map(n => {
      const at = lerp(A.feet[n], B.feet[n], k).slice(0, 3)
      at[1] += (B.feet[n][3] || 0) * Math.sin(Math.PI * u)
      const knee = lerp(A.knees?.[n] || ahead, B.knees?.[n] || ahead, k)
      return { at, knee }
    }),
    // a hand reaches for a hold, moves between holds, or lets go
    hands: [0, 1].map(n => {
      const a = A.hands?.[n],
        b = B.hands?.[n]
      const elbow = lerp(
        A.elbows?.[n] || elbows[n],
        B.elbows?.[n] || elbows[n],
        k
      )
      if (a && b) return { at: lerp(a, b, k), elbow, w: 1 }
      if (a || b) return { at: a || b, elbow, w: a ? 1 - k : k }
      return null
    })
  }
}

export class Intro {
  constructor (RS, rig) {
    this.RS = RS
    this.rig = rig
    this.active = false
    this.t = 0
    this.onDone = null
    this.onCue = null
  }
  start (onDone) {
    this.active = true
    this.t = 0
    this.onDone = onDone
    this.RS.seated = false
    this.apply()
  }
  // jump to the end: seated, door shut (quiet: without the follow-on hints)
  finish (quiet = false) {
    if (!this.active) return
    if (quiet) this.onDone = null
    else if (this.t < T.lock) this.onCue?.('lock')
    this.t = T.end
    this.apply()
  }
  // where Optimus is, for traffic to stop for
  where (out) {
    return this.RS.body.localToWorld(out.copy(this.RS.optimus.root.position))
  }
  update (dt) {
    if (!this.active) return
    const t0 = this.t
    this.t += dt
    for (const cue of ['unlock', 'lock'])
      if (t0 < T[cue] && this.t >= T[cue]) this.onCue?.(cue)
    this.apply()
  }
  apply () {
    const t = this.t,
      RS = this.RS,
      O = RS.optimus
    O.root.rotation.set(0, 0, 0)
    if (t < KEYS[0].t) {
      // walking up, the stride dying away as it stops by the door
      const k = clamp(t / T.walk, 0, 1)
      O.root.position.set(
        FROM[0] + (DOORSIDE[0] - FROM[0]) * k,
        HIP_STAND,
        FROM[1] + (DOORSIDE[1] - FROM[1]) * k
      )
      poseOptimus(O, {
        walk:
          t < T.walk ? 1 : clamp(1 - (t - T.walk) / (KEYS[0].t - T.walk), 0, 1),
        phase: (Math.PI * 2 * Math.min(t, T.walk) * SPEED) / STRIDE
      })
    } else {
      const P = keyed(t)
      O.root.position.set(...P.hips)
      poseOptimus(O, P)
    }
    RS.door = span(t, T.doorUp) - span(t, T.doorDown)
    this.camera(t)
    if (t >= T.end) {
      this.active = false
      RS.door = 0
      RS.seated = true
      // the follow camera picks up from here
      this.rig.shot = 'intro'
      this.rig.look.copy(_l)
      this.onDone?.()
    }
  }
  // low at Optimus's heels as it walks up, then out to the side of the door to watch it get in
  camera (t) {
    const RS = this.RS,
      cam = this.rig.camera,
      car = RS.car
    car.updateMatrixWorld()
    const O = RS.optimus.root.position
    const a = [O.x - 3.1, 0.7, O.z - 1.45],
      aim = [0.4, 0.65, -0.2]
    const b = [2.9, 1.45, -5.4],
      bAim = [-0.35, 0.78, -0.55]
    const k = span(t, [3.6, 5.0])
    _p.set(...a.map((v, i) => v + (b[i] - v) * k))
    _l.set(...aim.map((v, i) => v + (bAim[i] - v) * k))
    car.localToWorld(_p)
    car.localToWorld(_l)
    cam.position.copy(_p)
    cam.fov = 44 - 6 * k
    cam.updateProjectionMatrix()
    cam.up.set(0, 1, 0)
    cam.lookAt(_l)
  }
}
