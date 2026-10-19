// Traffic knocked out of its lane: the Roadster's hits on cars, the slide to a stop on locked-up
// tyres (off walls and posts, through a post it hits hard enough to snap, and into other cars, which
// it knocks loose in turn), and what the driver does then: sits there a few seconds with the hazards
// on (leaning on the horn if the Roadster is still about), then, if the car is still more or less
// on its road and facing the right way, steers back into the lane and drives on. Every one of those
// hits damages the cars in it where it lands (carDamage.js): a damaged car drives on slower, and a
// wreck stays where it stops, hazards on and smoking, while its driver climbs out and goes off to
// the pavement (alight.js); it is towed once it has been out of sight a while. A parked car knocked
// out of its place is put back in it a while later, once nobody can see it go, as good as new.
import { query } from './city.js'
import { honk } from './manners.js'
import { CAR } from './constants.js'
import { kerbDist } from './street.js'
import { snap } from './breakables.js'
import { hurt, mend, landed, MIN_HIT } from './carDamage.js'
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
export const TOW = 15 // s a wreck is out of sight before it is towed (traffic.js recycle)

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
  if (car.drop) car.drop.k = 0 // (a box truck's delivery stop is off: delivery.js)
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
      hurt(car, hit.px, hit.pz, e.impact, c.mass, tr.t) // (the post takes a bite out of it)
      continue
    }
    // (where it lands on the car: the point nearest a post, the middle of where it meets a wall)
    const at = c.r ? null : landed(r, boxRect(c))
    const ax = at ? at.x : hit.px,
      az = at ? at.z : hit.pz
    car.x += hit.nx * hit.depth
    car.z += hit.nz * hit.depth
    r.x = car.x
    r.z = car.z
    const v = impulse(car, null, hit, 0.2, 0.4)
    // (into a wall or a post that stands: dented where it hit, heard and seen there, events.js)
    if (v > MIN_HIT) {
      const broke = hurt(car, ax, az, v, null, tr.t)
      sim?.emit('clash', {
        x: ax,
        z: az,
        impact: v,
        what: c.kind,
        broke,
        peds: true
      })
      tr.hear(ax, az, 16)
    }
  }
  // a moment after the Roadster hits a car, its driver leans on the horn
  if (car.honkIn > 0 && (car.honkIn -= dt) <= 0 && !car.parked)
    honk(tr, car, true)
  if (sp > 0.15 || Math.abs(car.w) > 0.05 || car.looseT < 2.5) return
  // a wreck at rest stays where it is, hazards on; a moment later (half the time a shaken driver
  // sits there) its driver climbs out
  const D = car.dmg
  if (D?.wreck) {
    if (!D.alight && (car.shaken -= 2 * dt) <= 0) climbOut(tr, car, D)
    return
  }
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
// The driver of a wreck out of a front door, on whichever side the pavement is nearer (over the
// seats if need be: not out into the traffic), for the people to take on from there (alight.js:
// traffic.exits, with the way out from that side); a parked car's is empty (but the gridlock's
// are sat in)
function climbOut (tr, car, D) {
  D.alight = 1
  if ((car.parked && !car.jam) || tr.exits.length >= 8) return
  const lx = car.len * 0.08,
    out = car.wid / 2 + 0.45
  const x = car.x + lx * car.hx,
    z = car.z + lx * car.hz
  // (the car's right, and which side is nearer the pavement)
  const rx = -car.hz,
    rz = car.hx
  const right = kerbDist(x + rx * out, z + rz * out),
    left = kerbDist(x - rx * out, z - rz * out)
  const s = right < left ? 1 : -1
  tr.exits.push({
    x: x + rx * out * s,
    z: z + rz * out * s,
    ox: rx * s,
    oz: rz * s
  })
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

// A parked car knocked out of its place a while ago, out of sight both where it lies and where it
// belongs, and not close to the Roadster (a wrecked one, out of sight for a while): back in its
// place, as if towed and parked again, as good as new, so wrecks don't pile up (from the traffic's
// recycle, every quarter of a second; x, z: the Roadster, view: the camera)
export function restore (tr, c, x, z, view) {
  for (const [px, pz] of [[c.x, c.z], [c.homeX, c.homeZ]]) {
    const d = Math.sqrt((px - x) ** 2 + (pz - z) ** 2)
    const seen =
      view &&
      d < 260 &&
      (px - view.x) * view.fx + (pz - view.z) * view.fz > -12
    if (d < 60 || seen) {
      if (c.dmg) c.dmg.unseen = 0
      return
    }
  }
  if (c.dmg?.wreck && (c.dmg.unseen += 0.25) < TOW) return
  mend(c)
  c.loose = false
  c.x = c.homeX
  c.z = c.homeZ
  tr.setYaw(c, c.homeYaw)
  c.vx = c.vz = c.w = c.yr = 0
  c.sig = 0
  c.honkIn = 0
}

// A car knocked loose (c) out of sight (seen: whether the camera can see it, every quarter of a
// second, traffic.js recycle) to be taken off the road: a wreck once it has been for a while, towed
export function gone (c, seen) {
  const D = c.dmg
  if (!D?.wreck) return !seen
  D.unseen = seen ? 0 : D.unseen + 0.25
  return D.unseen >= TOW
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
      // (where they met, for their damage, before they move apart)
      const at = landed(A, carRect(b))
      const ax = at ? at.x : hit.px,
        az = at ? at.z : hit.pz
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
        // (each dented where they met, by its share of the blow)
        const broke =
          hurt(a, ax, az, v, b.m, tr.t) | hurt(b, ax, az, v, a.m, tr.t)
        sim?.emit('clash', {
          x: ax,
          z: az,
          impact: v,
          broke,
          peds: true
        })
        tr.hear(ax, az, 20)
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
    // (the normal from the car towards the Roadster, before anything else reuses the contact, and
    // where they met: for the damage to both, the sparks and where it is heard)
    const { nx, nz } = hit
    const at = landed(me, carRect(car))
    const px = at ? at.x : hit.px,
      pz = at ? at.z : hit.pz
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
    // (the car dented where it was hit; what broke on it goes with the knock, for its sound)
    const broke = hurt(car, px, pz, impact, CAR.mass, tr.t)
    if (impact > 0.6)
      sim.emit('bump', {
        impact,
        what: 'car',
        px,
        pz,
        nx,
        nz,
        broke,
        peds: true
      })
    if (impact > 5) tr.hear(me.x, me.z, 22)
    if (impact > 2.5 && car.honkT <= 0 && !car.honkIn) car.honkIn = 1.2
    if (impact > 4) tr.shock(car.x, car.z)
  }
  if (sim.mode === 'ground') sim.syncPose()
}
