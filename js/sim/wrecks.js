// Traffic knocked out of its lane: the Roadster's hits on cars, the slide to a stop on locked-up
// tyres (off walls and posts, through a post it hits hard enough to snap, and into other cars, which
// it knocks loose in turn), and what the driver does then: sits there a few seconds with the hazards
// on (leaning on the horn if the Roadster is still about), then, if the car is still more or less
// on its road and facing the right way, steers back into the lane and drives on.
import { query } from './city.js'
import { honk } from './manners.js'
import { CAR } from './constants.js'
import { snap } from './breakables.js'
import {
  BODY,
  nudge,
  boxRect,
  impulse,
  carRect,
  rectRect,
  rectPost,
  loadBody,
  storeBody,
  playerRect
} from './collide.js'

const near = []
const A = { x: 0, z: 0, fx: 1, fz: 0, hl: 0, hw: 0 }

// knocked out of its lane: slide on locked-up tyres until it stops
function loosen (tr, car) {
  if (car.loose) return
  tr.detach(car)
  car.loose = true
  car.looseT = 0
  car.lc = car.off = car.psi = car.offT = car.acc = 0
  car.panic = 0
  car.vx = car.hx * car.v
  car.vz = car.hz * car.v
  car.w = 0
  car.v = 0
  car.brake = false
  car.sig = 3 // hazards
  car.shaken = 3 + tr.R() * 4
}
const NONE = []
// sim: where a post it snaps is reported (as a 'knock')
export function slide (tr, car, dt, sim) {
  const sp = Math.sqrt(car.vx * car.vx + car.vz * car.vz)
  if (sp > 1e-4) {
    const k = Math.max(0, sp - 6.5 * dt) / sp
    car.vx *= k
    car.vz *= k
  }
  car.w *= Math.exp(-3 * dt)
  car.x += car.vx * dt
  car.z += car.vz * dt
  tr.setYaw(car, car.yaw + car.w * dt)
  car.yr = car.w
  car.odo += (car.vx * car.hx + car.vz * car.hz) * dt
  car.looseT += dt
  // walls and posts (none new to run into at rest)
  const r = carRect(car)
  const moving = sp > 1e-3 || Math.abs(car.w) > 1e-3
  for (const c of moving ? query(car.x - 7, car.z - 7, car.x + 7, car.z + 7, near) : NONE) {
    if (c.y0 > 1.2 || c.down) continue
    const hit = c.r ? rectPost(r, c) : rectRect(r, boxRect(c))
    if (!hit) continue
    const e = c.breakAt && snap(car, c, hit.nx, hit.nz, car.m)
    if (e) {
      sim?.emit('knock', { ...e, by: 'traffic', peds: true })
      tr.hear(e.x, e.z, 20)
      continue
    }
    car.x += hit.nx * hit.depth
    car.z += hit.nz * hit.depth
    r.x = car.x
    r.z = car.z
    impulse(car, null, hit, 0.2, 0.4)
  }
  // a moment after the Roadster hits a car, its driver leans on the horn
  if (car.honkIn > 0 && (car.honkIn -= dt) <= 0 && !car.parked)
    honk(tr, car, true)
  if (sp > 0.15 || Math.abs(car.w) > 0.05 || car.looseT < 2.5) return
  // stopped: shaken a while, angry if the Roadster is still close, then back into the lane
  car.honkT -= dt
  if ((car.shaken -= dt) > 0) {
    const me = tr.me
    if (
      me &&
      !car.parked &&
      car.honkT <= 0 &&
      (me.x - car.x) ** 2 + (me.z - car.z) ** 2 < 900
    )
      honk(tr, car, true)
    return
  }
  rejoin(tr, car)
}
// Back into a lane of the road it was on (or the one beside it), if it stands within a few metres of
// one and faces within forty degrees of its way, with room there: it sets off from where it is, at
// the angle it is at, and steers back onto the lane's line (drivers.js, steer).
function rejoin (tr, car) {
  const e0 = car.edge
  if (car.parked || !e0 || e0.kind !== 0) return
  for (const e of [e0, e0.twin]) {
    if (!e || e.closed) continue
    const dx = car.x - e.x0,
      dz = car.z - e.z0
    const s = dx * e.dx + dz * e.dz
    if (s < 2 || s > e.len - 10) continue
    const lat = dz * e.dx - dx * e.dz // to the right of the lane's line
    if (Math.abs(lat) > 3) continue
    const cos = car.hx * e.dx + car.hz * e.dz
    if (cos < 0.77) continue
    const busy = L =>
      L?.cars.some(o => Math.abs(o.s - s) < (o.len + car.len) / 2 + 3)
    // (out over the other lane, that one has to be clear alongside too)
    if (busy(e) || (Math.abs(lat) > 1 && busy(e.twin))) continue
    car.loose = false
    car.edge = e
    car.s = s
    car.v = car.acc = car.wake = 0
    car.off = lat
    car.offT = 0
    const sin = car.hz * e.dx - car.hx * e.dz // (heading to the right of the lane's)
    car.psi = Math.asin(Math.max(-1, Math.min(1, sin)))
    car.go = car.stop = null
    car.sig = lat > 0.3 ? 1 : lat < -0.3 ? 2 : 0
    tr.insert(e, car)
    if (!e.next.includes(car.next)) car.next = tr.choose(e, car, true)
    tr.place(car)
    return
  }
}

// Cars knocked loose against everything else on the road: they push apart by mass, trade momentum,
// and a car in traffic or parked that one slides into is knocked loose too.
export function bumpLoose (tr, sim) {
  for (const a of tr.loose) {
    if (!a.loose || Math.abs(a.vx) + Math.abs(a.vz) + Math.abs(a.w) < 0.05)
      continue
    Object.assign(A, carRect(a))
    for (const b of tr.cars) {
      if (b === a || Math.abs(b.x - a.x) > 9 || Math.abs(b.z - a.z) > 9)
        continue
      const hit = rectRect(A, carRect(b))
      if (!hit) continue
      if (!b.loose) {
        loosen(tr, b)
        b.honkIn = 0.8 + tr.R()
      }
      const share = b.m / (a.m + b.m)
      a.x += hit.nx * hit.depth * share
      a.z += hit.nz * hit.depth * share
      b.x -= hit.nx * hit.depth * (1 - share)
      b.z -= hit.nz * hit.depth * (1 - share)
      A.x = a.x
      A.z = a.z
      const v = impulse(a, b, hit, 0.2, 0.4)
      if (v > 2) {
        sim?.emit('clash', { x: hit.px, z: hit.pz, impact: v, peds: true })
        tr.hear(hit.px, hit.pz, 20)
      }
    }
  }
}

// the Roadster against the traffic: push apart by mass, trade momentum, knock the car loose. However
// hard the hit, the Roadster stays drivable: it's a shove, not a crash.
export function collidePlayer (tr, sim) {
  if (sim.mode === 'ramp') return
  const me = playerRect(sim)
  const bottom = sim.mode === 'ground' ? sim.pos.y : sim.com.y - 0.9
  for (const car of tr.cars) {
    if (Math.abs(car.x - me.x) > 9 || Math.abs(car.z - me.z) > 9) continue
    if (bottom > car.hgt) continue
    const hit = rectRect(me, carRect(car))
    if (!hit) continue
    // (where it was hit, and the normal from the car towards the Roadster, before anything else
    // reuses the contact)
    const { px, pz, nx, nz } = hit
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
    if (impact > 0.6)
      sim.emit('bump', { impact, what: 'car', px, pz, nx, nz, peds: true })
    if (impact > 5) tr.hear(me.x, me.z, 22)
    if (impact > 2.5 && car.honkT <= 0 && !car.honkIn) car.honkIn = 1.2
    if (impact > 4) tr.shock(car.x, car.z)
  }
  if (sim.mode === 'ground') sim.syncPose()
}
