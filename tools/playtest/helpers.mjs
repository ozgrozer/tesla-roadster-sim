// The flows' moves inside the page: put the player somewhere, find a car, put the driven car
// somewhere, read the game's event log. Each is a function evaluated in the page (g.ev(fn, arg)).

// the game's events from now on, kept in window.__evlog (game events: sim/gameEvents.js)
export const logEvents = () => {
  const R = window.__roadster
  window.__evlog = []
  const subs = R.events.subs
  const on = (k, fn) => (subs.has(k) ? subs : subs.set(k, new Set())).get(k).add(fn)
  // (a crime's payload carries its own type, which replaces 'crime': sim/gameEvents.js)
  on('*', e => window.__evlog.push({ type: e.type, how: e.how, model: e.model, alarm: e.alarm, by: e.by, speed: e.speed && +e.speed.toFixed(1) }))
  on('crime', e => window.__evlog.push({ type: 'crime', what: e.type, severity: e.severity }))
}
export const events = () => window.__evlog.splice(0)

// the player on foot put at (x, z), facing yaw
export const placeFoot = ({ x, z, yaw }) => {
  const R = window.__roadster,
    P = R.player
  P.pos.x = x
  P.pos.z = z
  P.vel.x = P.vel.z = 0
  if (yaw !== undefined) P.heading = yaw
  if (R.foot.prev) {
    R.foot.prev.x = x
    R.foot.prev.z = z
  }
}
// a car near the player: parked (kind 'parked') or driven by someone (kind 'driven'), within r,
// beyond skip of them; its index in traffic.cars
export const findCar = ({ kind, r = 150, skip = 0, not = [] }) => {
  const R = window.__roadster,
    P = R.player.pos
  let best = -1,
    bd = Infinity
  R.traffic.cars.forEach((c, i) => {
    if (c.player || not.includes(i) || c.police || c.mission) return
    if (kind === 'parked' ? !(c.parked && !c.ctl && !c.jam) : c.parked || c.ctl || !(Math.abs(c.v) > 1)) return
    const d = Math.hypot(c.x - P.x, c.z - P.z)
    if (d > skip && d < r && d < bd) {
      bd = d
      best = i
    }
  })
  return best
}
// the player put by the driver's door of traffic car i (vehicles.js: the door on its left, or the bus's right)
export const toDoor = i => {
  const R = window.__roadster,
    c = R.traffic.cars[i]
  R.vehicles.sync(R.traffic, R.sim)
  const e = R.vehicles.of(c)
  // (out from the door's side: the left for most, the bus's on its right)
  const sd = Math.sign(e.door.z) || -1
  const w = R.vehicles.toWorld(e, e.door.x, e.door.z + sd * 0.6)
  const P = R.player
  P.pos.x = w.x
  P.pos.z = w.z
  P.vel.x = P.vel.z = 0
  P.heading = c.yaw + (Math.PI / 2) * sd
  if (R.foot.prev) {
    R.foot.prev.x = w.x
    R.foot.prev.z = w.z
  }
  return { id: e.id, type: c.type }
}
// the car the player drives (not the Roadster) put at (x, z) facing yaw, at speed u
export const placeCar = ({ x, z, yaw, u = 0 }) => {
  const R = window.__roadster,
    b = R.foot.alt.body
  if (!b) return false
  // (room made there first, and the camera cut to it: a teleport, not a drive)
  R.traffic.clearAround(x, z, 14)
  R.rig.cut?.()
  b.x = x
  b.z = z
  b.yaw = yaw
  b.hx = Math.cos(yaw)
  b.hz = -Math.sin(yaw)
  b.u = u
  b.vx = b.hx * u
  b.vz = b.hz * u
  b.w = 0
  b.lat = 0
  return true
}
// the player put by the Roadster's door
export const toRoadster = () => {
  const R = window.__roadster,
    e = R.vehicles.roadster
  const w = R.vehicles.toWorld(e, e.door.x, e.door.z - 0.6)
  const P = R.player
  P.pos.x = w.x
  P.pos.z = w.z
  P.vel.x = P.vel.z = 0
  if (R.foot.prev) {
    R.foot.prev.x = w.x
    R.foot.prev.z = w.z
  }
  return { x: w.x, z: w.z }
}
// the driven car stopped where it is
export const stopCar = () => {
  const b = window.__roadster.foot.alt.body
  if (b) Object.assign(b, { u: 0, vx: 0, vz: 0, w: 0, lat: 0 })
}
// whether the player drives a city car (not the Roadster), and how damaged it is
export const inCityCar = () => {
  const a = window.__roadster.foot.alt
  return a.active && window.__roadster.player.mode === 'car' ? a.body.dmg?.harm || 0 : -1
}
