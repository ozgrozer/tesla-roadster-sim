// The city's traffic lights (city.js re-exports all of it): every junction's cycle, east-west then
// north-south with an all-red gap between, lights held one way for Autopilot, and how long an amber
// has left or a red has been on.
// Left turns go on the same green and give way to oncoming traffic.
export const RED = 0
export const YELLOW = 1
export const GREEN = 2
export const SIGNAL = { green: 13, yellow: 3, clear: 1.2 }
export const CYCLE = 2 * (SIGNAL.green + SIGNAL.yellow + SIGNAL.clear)
// State of the light for traffic travelling `dir` into `node` at time t (held, or on its cycle).
export function signal (node, dir, t) {
  const h = node.hold
  if (h)
    return (dir & 1) === h.axis
      ? t >= h.t0 + h.wait
        ? GREEN
        : RED
      : t < h.yellowEnd
      ? YELLOW
      : RED
  return cycle(node, dir, t)
}
// A light held green one way (axis 0 east-west, 1 north-south) from t, for as long as it is held:
// Autopilot's green wave on its way to the gridlock, and the red that holds the gridlock up. The
// other way finishes its green on a (short) yellow and an all-red first.
const HOLD = { yellow: 2, clear: 0.6 }
export function holdLight (node, axis, t) {
  if (node.hold?.axis === axis) return
  node.hold = null
  const mine = cycle(node, axis, t),
    theirs = cycle(node, axis ^ 1, t)
  let yellowEnd = t
  if (theirs === GREEN) yellowEnd = t + HOLD.yellow
  else if (theirs === YELLOW) {
    // what is left of their yellow
    let u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
    u -= ((axis ^ 1) * CYCLE) / 2
    yellowEnd = t + Math.min(HOLD.yellow, SIGNAL.green + SIGNAL.yellow - u)
  }
  const wait = mine === RED ? yellowEnd - t + HOLD.clear : 0
  node.hold = { axis, t0: t, wait, yellowEnd }
}
// Back to its cycle, picking it up at the start of a green for the way it was held, so nothing
// changes in front of anyone the moment it lets go.
export function releaseLight (node, t) {
  const h = node.hold
  if (!h) return
  node.hold = null
  node.offset = ((((h.axis * CYCLE) / 2 - t) % CYCLE) + CYCLE) % CYCLE
}
// Seconds of amber left for traffic travelling `dir` into `node` at time t (0 unless it is amber).
export function amberLeft (node, dir, t) {
  const h = node.hold
  if (h) return (dir & 1) !== h.axis ? Math.max(0, h.yellowEnd - t) : 0
  let u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  u -= ((dir & 1) * CYCLE) / 2
  const left = SIGNAL.green + SIGNAL.yellow - u
  return u >= SIGNAL.green && left > 0 ? left : 0
}
// Seconds since the light for traffic travelling `dir` into `node` turned red (Infinity if it isn't
// red, or has been held red).
export function redAge (node, dir, t) {
  const h = node.hold
  if (h) return (dir & 1) !== h.axis && t >= h.yellowEnd ? t - h.yellowEnd : Infinity
  let u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  u -= ((dir & 1) * CYCLE) / 2 + SIGNAL.green + SIGNAL.yellow
  return u >= 0 ? u : u + CYCLE < CYCLE / 2 ? u + CYCLE : Infinity
}
function cycle (node, dir, t) {
  let u = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE
  const axis = u < CYCLE / 2 ? 0 : 1 // 0 east-west, 1 north-south
  if ((dir & 1) !== axis) return RED
  u -= (axis * CYCLE) / 2
  return u < SIGNAL.green
    ? GREEN
    : u < SIGNAL.green + SIGNAL.yellow
    ? YELLOW
    : RED
}
