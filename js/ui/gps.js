// The GPS: the waypoint set on the pause menu's map (map.js) and the route to it along the lanes
// (sim/route.js), kept up from wherever the car is: the plan to the waypoint covers every lane, so
// the moment the car turns onto a lane the route didn't take, the route is read off the plan again
// from there. The radar (minimap.js) updates it as it draws it, and the map draws it too. Within
// REACH of the waypoint it is reached and cleared (onReach: the help box says so). Autopilot is
// told of each new waypoint (onGoal), so P drives there.
import {
  snap,
  laneOf,
  routeTo,
  pathFrom,
  lengthOf,
  lanePoint,
  routeLine,
  REACH
} from '../sim/route.js'

const _p = { x: 0, z: 0 }

class Gps {
  constructor () {
    this.goal = null // the waypoint (route.js snap): { x, z, street, area, stops }
    this.plan = null // the way to it from every lane
    this.pieces = [] // the route from the car (route.js pathFrom)...
    this.line = [] // ...as a line to draw: x, z, x, z, ...
    this.left = 0 // m of it to go
    this.at = { lane: null, s: 0 } // the lane the car is on, and where
    this.armed = false // the car has been away from the waypoint (one set right by it waits)
    this.onGoal = null // (plan or null, reached): where Autopilot heads
    this.onReach = null // the car got there
  }

  // a waypoint on the street nearest (x, z)
  set (x, z) {
    const goal = snap(x, z)
    if (!goal) return
    this.goal = goal
    this.plan = routeTo(goal)
    this.at.lane = null
    this.line.length = 0
    this.left = 0
    this.armed = false
    this.onGoal?.(this.plan, false)
  }
  // no waypoint (reached: because the car got there)
  clear (reached = false) {
    if (!this.goal) return
    this.goal = this.plan = null
    this.line.length = this.pieces.length = 0
    this.onGoal?.(null, reached)
  }

  // The car (sim) where it is now: whether it has got there, and the route from it. arrive: false
  // to only work the route out (the map does, a waypoint set while the game is paused).
  update (sim, arrive = true) {
    if (!this.plan) return
    const p = sim.mode === 'ground' ? sim.pos : sim.com
    const d = Math.hypot(p.x - this.goal.x, p.z - this.goal.z)
    if (arrive && this.armed && d < REACH) {
      this.clear(true)
      this.onReach?.()
      return
    }
    if (arrive && d > REACH + 5) this.armed = true
    const f = sim.fwd(),
      was = this.at.lane,
      first = this.pieces[0]
    laneOf(p.x, p.z, f.x, f.z, was, this.at)
    // along the lane it was on: the line starts where the car is now
    if (this.at.lane === was && first?.e === was && this.at.s <= first.s1) {
      this.left += first.s0 - this.at.s
      first.s0 = this.at.s
      lanePoint(was, this.at.s, _p)
      this.line[0] = _p.x
      this.line[1] = _p.z
      return
    }
    // onto another lane: the route from there
    pathFrom(this.plan, this.at.lane, this.at.s, this.pieces)
    routeLine(this.pieces, this.line)
    this.left = lengthOf(this.pieces)
  }
}

export const gps = new Gps()
