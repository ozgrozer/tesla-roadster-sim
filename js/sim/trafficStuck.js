// The watchdog for cars that have stopped going anywhere, mixed into Traffic (traffic.js), on top
// of the standoffs react.js sorts out and the last-resort gridlock rule (handover.js). Called for
// each car a few times a second (recycle). A car stood still for STUCK_LINE s at the end of its lane
// waiting to turn left (a stream of oncoming traffic that never lets up) gives up and goes another
// way (rerouted: straight on, or right); one stood still in the middle of a junction for STUCK_BOX s
// edges out at a crawl; and one stood still for STUCK_DROP s out of sight and not near the player is
// taken off the road, to be refilled elsewhere. (A box truck making a delivery, a car pulled over
// for a siren, one taken over by the game, and the jammed street are left be.) Pure: no DOM.
export const STUCK_LINE = 20
export const STUCK_BOX = 12
export const STUCK_DROP = 35

export const TRAFFIC_STUCK = {
  // true: take the car off the road
  unstuck (c, d, seen) {
    if (c.still < STUCK_BOX || c.ctl || c.jam || c.siren || c.pull || c.drop?.k > 0) return false
    const e = c.edge
    if (c.still > STUCK_DROP && d > 60 && !seen) {
      this.stuckN.drop++
      return true
    }
    if (e.move) {
      if (!c.squeeze && !c.rev && c.still > STUCK_BOX) {
        c.squeeze = 3
        this.stuckN.squeeze++
      }
      return false
    }
    if (c.still > STUCK_LINE && e.road && c.next?.move === 'L' && e.len - c.s - c.len / 2 < 6) {
      const alt = e.next.find(o => o.move !== 'L' && !o.next[0].closed)
      if (alt) {
        c.next = alt
        c.go = c.stop = null
        c.lw = 0
        c.still = 0
        this.stuckN.reroute++
      }
    }
    return false
  }
}
