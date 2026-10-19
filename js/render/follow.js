// The follow camera, GTA-style: a spring arm close behind the car's heading (camera.js runs it).
import * as THREE from 'three'
import { clamp, wrapPi } from '../sim/constants.js'

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
const SWING = 3.4 // rad/s: the fastest the follow camera swings round behind the car
// The follow camera's arm, GTA-style: close behind and a little above the car, so the car fills the
// lower middle of the picture rather than shrinking into the road ahead. ARM m behind at rest (the
// mouse wheel zooms it), REACH m further per m/s of speed up to REACH_MAX, so speed opens it out a
// little; tipped up PITCH rad and raised RISE m, aimed AIM m above the car and, at speed, up to AHEAD
// m down the road, so the faster it goes the more of the road ahead is in view.
export const ARM = 6.3,
  REACH = 0.028,
  REACH_MAX = 1.7,
  PITCH = 0.17,
  RISE = 1.15,
  AIM = 0.85,
  AHEAD = 2.4
const _f = new THREE.Vector3(),
  _u = new THREE.Vector3()

// GTA-style: sit behind the car's heading (not its velocity), ignore pitch and roll so flips never
// throw the camera, and hold the heading through the wall ride and any manoeuvre. A car spun round
// by a knock, sliding sideways or tumbling is followed the way it is going instead: chasing its
// whirling nose would whip the camera round and round it.
// rig: the CameraRig (its follow state f, the pose it sets, pos and aim, and any mouse drag); returns
// the field of view
export function follow (rig, dt, sim, P) {
  const f = rig.f,
    fw = sim.fwd(_f),
    up = sim.up(_u),
    v = sim.vel,
    hv = Math.hypot(v.x, v.z)
  const nose = Math.atan2(-fw.z, fw.x),
    along = Math.atan2(-v.z, v.x),
    off = wrapPi(along - nose),
    ao = Math.abs(off)
  const wild =
    sim.mode === 'crash' ||
    (sim.mode === 'ground' && Math.abs(sim.yawRate) > 2.5)
  if (wild) {
    if (hv > 3) f.targetHeading = along
  } else if (sim.burning) {
    // (a burnout or a donut is watched from where the camera stands: chasing the nose round and
    // round would spin the picture)
  } else if (
    up.y > 0.55 &&
    Math.hypot(fw.x, fw.z) > 0.3 &&
    sim.mode !== 'ramp'
  ) {
    // sliding (not reversing), it looks partly along the slide, the more the further sideways the
    // car goes: a drift is seen from its outside, the car's flank to the camera
    const x = (ao - 0.17) / 0.6,
      k =
        sim.mode === 'ground' && hv > 4 && ao < 1.87
          ? 0.85 * (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
          : 0
    f.targetHeading = nose + off * k
  }
  if (!f.init) {
    const v = sim.vel
    if (!(up.y > 0.55) && Math.hypot(v.x, v.z) > 1)
      f.targetHeading = Math.atan2(-v.z, v.x)
    f.init = true
    f.heading = f.targetHeading
    f.target.copy(P)
    f.elev = sim.mode === 'ramp' ? up.y : 1
    f.reach = Math.min(REACH_MAX, sim.groundSpeed() * REACH)
    f.ahead = 0
    f.surge = 0
  }
  f.heading += clamp(
    wrapPi(f.targetHeading - f.heading) * lerpK(3.2, dt),
    -SWING * dt,
    SWING * dt
  )
  f.idle += dt
  if (f.idle > 1.5 && !rig.drag) {
    const k = lerpK(2, dt)
    f.yawOff -= f.yawOff * k
    f.pitchOff -= f.pitchOff * k
  }
  // on the wall the arm follows the car's up vector, so it drops below the car when it hangs inverted
  f.elev += ((sim.mode === 'ramp' ? up.y : 1) - f.elev) * lerpK(3, dt)
  const speed = sim.groundSpeed()
  f.reach += (Math.min(REACH_MAX, speed * REACH) - f.reach) * lerpK(1.5, dt)
  // (looking down the road the way the car is going, not while it backs up)
  const fwdSpeed = sim.mode === 'ground' ? Math.max(0, sim.speed) : 0
  f.ahead += (Math.min(AHEAD, fwdSpeed * 0.06) - f.ahead) * lerpK(1.2, dt)
  // it falls back as the car launches and closes in under hard braking
  const acc = sim.mode === 'ground' ? clamp(sim.accLong, -14, 16) : 0
  f.surge += (acc * 0.05 - f.surge) * lerpK(2.5, dt)
  // (a van's or a bus's arm further out and higher: carCam.js armScale, set by polish.js; V's Far
  // camera lets it out further still)
  f.size = (f.size ?? 1) + ((rig.armK || 1) - (f.size ?? 1)) * lerpK(2, dt)
  f.up = (f.up ?? 0) + ((rig.armUp || 0) - (f.up ?? 0)) * lerpK(2, dt)
  f.far = (f.far ?? 0) + ((rig.mode === 'far' ? 1 : 0) - (f.far ?? 0)) * lerpK(4, dt)
  const dist = (f.dist * f.size + f.reach + f.surge) * (1 + 0.5 * f.far)
  // looking back (rig.behind: Z, or a pad's right stick pressed in, as in GTA): the arm swung round
  // in front of the car at once, looking back over it the way it has come, and straight back again
  // when it is let go
  const yaw = f.heading + f.yawOff + (rig.behind ? Math.PI : 0),
    pitch = PITCH + f.pitchOff + 0.06 * f.far
  // (carried along with the car first, so only its jolts are smoothed away: chasing it from
  // behind would leave the arm trailing a few metres longer the faster it went)
  f.target.addScaledVector(v, rig.simDt ?? dt)
  f.target.x += (P.x - f.target.x) * lerpK(12, dt)
  f.target.z += (P.z - f.target.z) * lerpK(12, dt)
  f.target.y += (P.y - f.target.y) * lerpK(6, dt)
  const h = Math.cos(pitch) * dist
  rig.pos.set(
    f.target.x - Math.cos(yaw) * h,
    f.target.y + (Math.sin(pitch) * dist + RISE + f.up) * f.elev,
    f.target.z + Math.sin(yaw) * h
  )
  rig.pos.y = Math.max(rig.pos.y, 0.7)
  // (not when looking round or back, nor further than the car is going the way the camera faces)
  const way = Math.cos(f.heading) * v.x - Math.sin(f.heading) * v.z,
    along2 = hv > 1 && !rig.behind ? Math.max(0, way / hv) : 0
  const ah = f.ahead * along2 * (1 - Math.min(1, Math.abs(f.yawOff)))
  // and into a turn: the aim led a little to the inside of the bend, the faster the more
  const leadT = rig.behind ? 0 : clamp((sim.yawRate || 0) * fwdSpeed * 0.045, -1.4, 1.4)
  f.lead = (f.lead ?? 0) + (leadT - (f.lead ?? 0)) * lerpK(2.5, dt)
  const sh = Math.sin(f.heading),
    ch = Math.cos(f.heading)
  rig.aim.set(
    f.target.x + ch * ah - sh * f.lead,
    f.target.y + (AIM + 0.6 * f.up) * f.elev,
    f.target.z - sh * ah - ch * f.lead
  )
  // wider with speed, and a kick wider still while the main thrusters fire
  f.kick += (sim.thrMain - f.kick) * lerpK(4, dt)
  return 55 + Math.min(11, speed * 0.1) + 7 * f.kick
}

// The camera kept out of the traffic, as the city's clip keeps it out of the buildings: a car on
// the line from the aim to the camera pulls the camera in short of it, ROOM m clear, at once, and
// once the way is clear the arm lets back out over CLEAR s. A van, a bus or anything else TALL m
// high or more counts wherever it is on the line (the camera would end up inside it, or see only
// its side); a lower car only if the camera itself is in it, as the line passes over its roof. So
// a bus that pulls up behind at the lights brings the camera in close behind the car, not inside
// the bus.
const TALL = 2.2,
  ROOM = 0.4,
  CLEAR = 0.6
let T0 = 0,
  T1 = 1
// (narrows [T0, T1] to the part of the line p + d t inside lo to hi; false once nothing is left)
function slab (p, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return p > lo && p < hi
  const u = (lo - p) / d,
    w = (hi - p) / d
  T0 = Math.max(T0, Math.min(u, w))
  T1 = Math.min(T1, Math.max(u, w))
  return T0 <= T1
}
// rig: the CameraRig (rig.reach: how far from the aim the traffic lets the camera be, eased); aim,
// pos: the camera's aim and its place, pos moved in; cars: the traffic (as drawn this frame)
export function clipTraffic (rig, aim, pos, cars, dt) {
  const dx = pos.x - aim.x,
    dy = pos.y - aim.y,
    dz = pos.z - aim.z,
    len = Math.hypot(dx, dy, dz)
  if (len < 0.5) return
  const mx = aim.x + dx / 2,
    mz = aim.z + dz / 2
  let hit = Infinity
  for (const c of cars) {
    if (c.player) continue // (the car the camera follows)
    const near = len / 2 + c.len / 2 + ROOM
    if (Math.abs(c.x - mx) > near || Math.abs(c.z - mz) > near) continue
    // (the line in the car's own frame: along it, across it and up)
    const hx = Math.cos(c.yaw),
      hz = -Math.sin(c.yaw),
      ax = aim.x - c.x,
      az = aim.z - c.z,
      hl = c.len / 2 + ROOM,
      hw = c.wid / 2 + ROOM
    T0 = 0
    T1 = 1
    if (!slab(ax * hx + az * hz, dx * hx + dz * hz, -hl, hl)) continue
    if (!slab(az * hx - ax * hz, dz * hx - dx * hz, -hw, hw)) continue
    if (!slab(aim.y, dy, -1, c.hgt + ROOM)) continue
    // (not from inside it: the car is in a crash with it; nor a low one the line clears)
    if (T0 <= 0 || (c.hgt < TALL && T1 < 1)) continue
    hit = Math.min(hit, Math.max(0.6, T0 * len))
  }
  // (in at once; out again over CLEAR s, as far as the arm or the next car allows)
  const k = lerpK(1 / CLEAR, dt)
  if (hit < rig.reach) rig.reach = hit
  else if (rig.reach < len) rig.reach += (Math.min(hit, len) - rig.reach) * k
  if (rig.reach > len - 0.01) rig.reach = Infinity
  else pos.lerpVectors(aim, pos, rig.reach / len)
}
