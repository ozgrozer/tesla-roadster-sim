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
    }
    return p
  }
}
