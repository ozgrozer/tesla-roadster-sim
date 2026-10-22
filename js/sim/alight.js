// Drivers getting out of their wrecks, mixed into Peds (peds.js). A wreck that has come to rest
// puts its driver on traffic.exits (wrecks.js): here each one becomes someone on foot, stood at the
// door on the side nearer the pavement, who hurries off to the pavement on that side as anyone does
// who has dived out of a car's way (peds.js 'back'), stepping round anything in the way (crowd.js
// clear), and walks on from there like everyone else. They are drawn from a random stream of their
// own, so the people's own sequences are as they were.
import { rng } from './city.js'
import { LINES, ringOf, nearestOn, blockNear } from './pavement.js'

export const ALIGHT = {
  // the drivers out of their wrecks since the people last looked (traffic: the city's traffic)
  alight (traffic) {
    const exits = traffic.exits
    for (let i = 0; i < exits.length; i++) this.climbOut(exits[i])
    exits.length = 0
  },
  // e: the door ({ x, z }) and the way out of it ({ ox, oz })
  climbOut (e) {
    const X = this.X || (this.X = rng(4021))
    const b = blockNear(e.x + e.ox * 3, e.z + e.oz * 3)
    const g = ringOf(b, Math.floor(X() * LINES.length))
    const s = nearestOn(g, e.x, e.z)
    // (someone new, from the stream of their own, then put at the door, on their way)
    const R = this.R,
      Q = this.Q
    this.R = this.Q = X
    const p = this.spawnAt(g, s, X() < 0.5 ? 1 : -1)
    this.R = R
    this.Q = Q
    p.x = e.x
    p.z = e.z
    p.state = 'back'
    p.back = b
    p.backRing = g
    p.backS = s
    p.t = 0
    p.fright = 0.6
    // (dragged out by the player: once on the pavement, they run: pedBrain.js)
    if (e.jacked) {
      p.jacked = true
      p.fromX = e.x
      p.fromZ = e.z
      p.fright = 1
      if (e.sx !== undefined) haul(p, e)
    }
    return p
  }
}

// The pull-out staged (a carjacking, onFoot.js pullOut): the driver comes out of the seat by the
// door, thrown out and back along the car, falling on their back as they go (the 'down' state's
// slide, pedBrain.js lie: an ease-out from the throw's speed), lies there a moment, gets up and
// hurries off to the pavement and runs. Nothing jumps: no shove from the player at the door
// (keepFrom leaves the 'down' alone) and no car's edge to be pushed out of (sx, sz: just clear).
export const HAUL = {
  dist: 1.6, // m the throw carries them (the slide's v0 / 4: lie's damping)
  back: 0.45, // of it along the car towards its tail, the rest out from its side
  fall: 0.3, // how far over they already are as they come out (lie tips them the rest in 0.14 s)
  down: 1.1 // s on the ground before they get up
}
export function haul (p, e) {
  const bx = -e.hx * HAUL.back + e.ox * (1 - HAUL.back),
    bz = -e.hz * HAUL.back + e.oz * (1 - HAUL.back)
  const l = Math.hypot(bx, bz) || 1,
    v0 = HAUL.dist * 4
  p.x = e.sx
  p.z = e.sz
  p.state = 'down'
  p.t = 0
  p.vx = (bx / l) * v0
  p.vz = (bz / l) * v0
  // (facing whoever pulls them out, so they go over backwards: render/peds.js tips them that way)
  p.yaw = Math.atan2(bz / l, -bx / l)
  p.fall = HAUL.fall
  p.gait = 0
  p.hop = 0
  p.dead = false
  p.downT = HAUL.down
  p.hauled = true
}
