// Traffic knocked out of its lane: the Roadster's hits on cars, the slide to a stop on locked-up
// tyres (off walls and posts), and pulling back into the lane when a car was only nudged.
import { CAR } from './constants.js'
import { query } from './city.js'
import {
  BODY,
  nudge,
  impulse,
  carRect,
  rectRect,
  rectPost,
  boxRect,
  loadBody,
  storeBody,
  crashInto,
  playerRect,
  CRASH_SPEED
} from './collide.js'

const near = []

// knocked out of its lane: slide on locked-up tyres until it stops
function loosen (tr, car) {
  if (car.loose) return
  tr.detach(car)
  car.loose = true
  car.looseT = 0
  car.lc = 0
  car.vx = car.hx * car.v
  car.vz = car.hz * car.v
  car.w = 0
  car.v = 0
  car.brake = false
}
export function slide (tr, car, dt) {
  const sp = Math.hypot(car.vx, car.vz)
  if (sp > 1e-4) {
    const k = Math.max(0, sp - 6.5 * dt) / sp
    car.vx *= k
    car.vz *= k
  }
  car.w *= Math.exp(-3 * dt)
  car.x += car.vx * dt
  car.z += car.vz * dt
  tr.setYaw(car, car.yaw + car.w * dt)
  car.odo += (car.vx * car.hx + car.vz * car.hz) * dt
  car.looseT += dt
  // walls and posts
  const r = carRect(car)
  for (const c of query(car.x - 7, car.z - 7, car.x + 7, car.z + 7, near)) {
    if (c.y0 > 1.2 || c.down) continue
    const hit = c.r ? rectPost(r, c) : rectRect(r, boxRect(c))
    if (!hit) continue
    car.x += hit.nx * hit.depth
    car.z += hit.nz * hit.depth
    r.x = car.x
    r.z = car.z
    impulse(car, null, hit, 0.2, 0.4)
  }
  if (sp < 0.15 && Math.abs(car.w) < 0.05 && car.looseT > 2.5) rejoin(tr, car)
}
// a car nudged only slightly out of line drives on once it has stopped
function rejoin (tr, car) {
  const e = car.edge
  if (car.parked || !e || e.kind !== 0) return
  const dx = car.x - e.x0,
    dz = car.z - e.z0
  const s = dx * e.dx + dz * e.dz
  if (s < 1 || s > e.len - 1) return
  if (Math.abs(dz * e.dx - dx * e.dz) > 0.8) return
  if (car.hx * e.dx + car.hz * e.dz < 0.97) return
  if (e.cars.some(o => Math.abs(o.s - s) < (o.len + car.len) / 2 + 1)) return
  car.loose = false
  car.s = s
  car.v = 0
  car.go = null
  tr.insert(e, car)
  tr.place(car)
}

// the Roadster against the traffic: push apart by mass, trade momentum, knock the car loose
export function collidePlayer (tr, sim) {
  if (sim.mode === 'ramp') return
  const me = playerRect(sim)
  const bottom = sim.mode === 'ground' ? 0 : sim.com.y - 0.9
  for (const car of tr.cars) {
    if (Math.abs(car.x - me.x) > 9 || Math.abs(car.z - me.z) > 9) continue
    if (bottom > car.hgt) continue
    const hit = rectRect(me, carRect(car))
    if (!hit) continue
    loosen(tr, car)
    // share out the overlap by mass, then trade momentum
    const share = car.m / (car.m + CAR.mass)
    nudge(sim, hit.nx * hit.depth * share, hit.nz * hit.depth * share)
    car.x -= hit.nx * hit.depth * (1 - share)
    car.z -= hit.nz * hit.depth * (1 - share)
    const impact = impulse(loadBody(sim), car, hit, 0.25, 0.3)
    storeBody(sim)
    me.x = BODY.x
    me.z = BODY.z
    if (impact > 0.6) sim.emit('bump', { impact, what: 'car' })
    if (impact > CRASH_SPEED && sim.mode === 'ground') {
      sim.syncPose()
      crashInto(sim, hit, impact, 'Hit a car')
      return
    }
  }
  if (sim.mode === 'ground') sim.syncPose()
}
