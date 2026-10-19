// One physics step for any car in the city with someone at its wheel: createVehicleBody(kind) and
// stepVehicle(body, input, dt, world), for the player's drivable adapter (drivable.js) to call for
// whatever they drive. A bicycle model on the Roadster's own tyre curve (tyres.js), each axle's
// grip from the load on it: the weight thrown forward under braking and back pulling away (eased
// through the springs), and the outside wheels' extra load in a corner costing an axle some of its
// grip (more for a tall car). The engine's torque curve through an automatic gearbox (the gear and
// rpm kept for the engine note), the brakes shared out by the load on each axle, steering that
// loses lock with speed, the driver's hands catching a slide, the handbrake locking the rears and
// swinging the tail, and the grip coming back as they spin up again. The body pitches and rolls on
// its springs and is jolted by kerbs; it hits buildings and posts with its mass and momentum
// (vehicleHit.js) and takes damage the way the traffic does (carDamage.js). The Roadster keeps its
// own physics: its body wraps a Sim and is stepped by it, stunts and all.
// The body has the traffic car's shape where they overlap (x, z, hx, hz, len, wid, hgt, m, I, vx,
// vz, w, dmg), so collide.js's impulses and carDamage.js's dents work on it unchanged.
import { G, clamp, wrapPi, makeControls } from './constants.js'
import { tyreCurve, smooth } from './tyres.js'
import { Sim } from './sim.js'
import {
  handlingFor,
  torqueAt,
  rpmAt,
  lockAt,
  yawInertia
} from './handling.js'
import { collideWorld, kerbs } from './vehicleHit.js'

const MAX_DT = 1 / 120
const TRANSFER = 0.12 // s the weight's shift onto an axle lags the acceleration
const EB_ON = 0.06 // s for the handbrake to lock the rears
const SPIN_UP = 1.6 // per s: how fast locked rears get their grip back once it is let go
const SHIFT_T = 0.22 // s a gear change cuts the drive
const REV_MAX = 7 // m/s backing up
const EFF = 0.88 // the drivetrain's efficiency
const SENS = 0.35 // load sensitivity: a loaded tyre grips less per newton
const SPIN_OK = 0.35 // rad/s a car may turn faster than its grip carries it before it is caught
const SPIN_K = 7 // N m per kg per rad/s of that, at most SPIN_MAX N m per kg
const SPIN_MAX = 6
const HB_RATE = 1.6 // rad/s: the most the handbrake's swing turns the car at
const RECOVER = 1.2 // rad/s^2 per rad the nose is off the way the car is going

let IDS = 0
// A body for a car of handling class kind (handling.js), at (x, z) facing yaw, standing still.
// opts: { x, z, yaw, paint, id }
export function createVehicleBody (kind, opts = {}) {
  const h = handlingFor(kind)
  const b = {
    id: opts.id ?? `v${IDS++}`,
    kind,
    spec: h,
    sim: null,
    x: opts.x || 0,
    y: 0,
    z: opts.z || 0,
    yaw: opts.yaw || 0,
    hx: 1,
    hz: 0,
    vx: 0,
    vz: 0,
    w: 0, // yaw rate (rad/s, positive turning left)
    u: 0, // speed along the car (m/s), negative backing up
    lat: 0, // and across it
    len: h.len,
    wid: h.wid,
    hgt: h.hgt,
    m: h.mass,
    I: h.sim ? 4300 : yawInertia(h),
    paint: opts.paint ?? 0.5,
    steerAng: 0,
    gear: 1, // 1 to n forwards, -1 reverse, 0 neutral (for the HUD and the engine note)
    rpm: h.rpmIdle || 0,
    rpmN: 0, // rpm as a share of the red line (0 to 1)
    shiftT: 0,
    load: 0, // the throttle reaching the engine (0 to 1)
    dN: 0, // the weight moved onto the rear axle (N)
    accLong: 0,
    latAcc: 0,
    ebLock: 0,
    rearGrip: 1,
    spin: 0, // how much the driven wheels spin past the road (0 to 1)
    skid: 0, // how much the tyres slide (0 to 1), for marks, smoke and squeal
    slip: 0, // the rear axle's slip angle (rad)
    drifting: false,
    pitch: 0, // body on its springs: rad nose down, rad rolled right, m of heave
    pitchV: 0,
    roll: 0,
    rollV: 0,
    heave: 0,
    heaveV: 0,
    kerbF: false, // (each axle up on a kerb a step ago)
    kerbR: false,
    lights: { brake: false, reverse: false, indicator: 0, head: true },
    dmg: null, // damage, as a traffic car's (carDamage.js)
    limp: 1, // the share of its power the damage leaves it
    dead: false, // wrecked: the engine is gone
    t: 0,
    events: [] // what happened this step: { type: 'bump' | 'crash' | 'kerb', ... }
  }
  if (h.sim) {
    const s = (b.sim = new Sim())
    s.world = 'city'
    s.reset('city', { x: b.x, z: b.z, yaw: b.yaw })
  }
  b.hx = Math.cos(b.yaw)
  b.hz = -Math.sin(b.yaw)
  return b
}

// The keys as controls: throttle, brake, steer (-1 right to 1 left), handbrake. GTA-style, the
// brake held at a standstill (or already backing up) reverses.
export function makeVehicleInput () {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false }
}

const _c = makeControls()
function stepRoadster (b, inp, dt, world) {
  const s = b.sim
  const c = _c
  c.fan = false
  c.throttle = inp.throttle
  const back = inp.brake > 0 && s.speed < 0.5 && inp.throttle === 0
  c.brake = back ? 0 : inp.brake
  c.reverse = back ? inp.brake : 0
  c.steer = inp.steer
  c.ebrake = !!inp.handbrake
  s.world = world && world.city !== false ? 'city' : 'site'
  s.step(dt, c)
  const p = s.mode === 'ground' ? s.pos : s.com
  b.x = p.x
  b.y = p.y
  b.z = p.z
  b.yaw = s.yaw
  b.hx = Math.cos(b.yaw)
  b.hz = -Math.sin(b.yaw)
  b.vx = s.vel.x
  b.vz = s.vel.z
  b.w = s.yawRate
  b.u = s.speed
  b.steerAng = s.steerAng
  b.skid = s.skid
  b.gear = c.reverse ? -1 : 1
  b.rpmN = clamp(Math.abs(s.speed) / 103, 0, 1)
  b.lights.brake = c.brake > 0.05
  b.lights.reverse = c.reverse > 0
  for (const e of s.events) b.events.push(e)
  s.events.length = 0
}

// One step of dt for body b with the controls inp. world: { city: true (the city's buildings, posts
// and kerbs), solids: [...] (extra boxes to hit, in collide.js's collider shape), grip: 0 to 1 (the
// road's, wet or dry), t: the clock (for the damage) }; null for open, flat ground.
export function stepVehicle (b, inp, dt, world = null) {
  b.events.length = 0
  if (b.sim) return stepRoadster(b, inp, dt, world)
  const n = Math.max(1, Math.ceil(dt / MAX_DT - 1e-9))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    b.t += h
    move(b, inp, h, world)
    if (world) {
      if (world.city !== false) kerbs(b)
      collideWorld(b, world)
    }
  }
  body(b, dt)
  b.lights.brake = !b.dead && inp.brake > 0.05 && b.gear > 0 && b.u > 0.2
  b.lights.reverse = b.gear === -1
}

// the car's motion through one step: tyres, engine, brakes
function move (b, inp, dt, world) {
  const S = b.spec,
    m = b.m
  const cy = Math.cos(b.yaw),
    sy = Math.sin(b.yaw)
  const fx = cy,
    fz = -sy,
    lx = -sy,
    lz = -cy
  const u = b.vx * fx + b.vz * fz,
    w = b.vx * lx + b.vz * lz,
    r = b.w
  const a = S.wb * (1 - S.wf), // the centre of mass to the front axle, and to the rear
    bb = S.wb * S.wf
  const N = m * G
  // weight transfer: along the car through the springs, a moment behind the acceleration ...
  const dNT = clamp((m * b.accLong * S.comH) / S.wb, -0.35 * N, 0.35 * N)
  b.dN += (dNT - b.dN) * Math.min(1, dt / TRANSFER)
  const Nf = N * S.wf - b.dN,
    Nr = N * (1 - S.wf) + b.dN
  // ... and across it in a corner: the outside tyres' extra load buys less than the inside ones'
  // loss costs (load sensitivity), more the taller the car is on its track
  const across = Math.min(0.9, Math.abs(b.latAcc * S.comH) / (G * S.track / 2))
  const kLat = 1 - SENS * across * across
  const mu = S.mu * (world?.grip ?? 1)
  // the handbrake locks the rears; let go, they spin back up and grip again
  const hb = !!inp.handbrake && !b.dead
  b.ebLock = hb ? Math.min(1, b.ebLock + dt / EB_ON) : 0
  const locked = b.ebLock >= 1 && Math.abs(u) > 1
  b.rearGrip = locked ? S.slideMu : Math.min(1, b.rearGrip + dt * SPIN_UP)
  const FmaxF = mu * S.gripF * Math.max(0, Nf) * kLat,
    FmaxR = mu * S.gripR * Math.max(0, Nr) * kLat * b.rearGrip
  const au = Math.abs(u),
    su = u > 0.05 ? 1 : u < -0.05 ? -1 : 0
  const beta = Math.atan2(w - bb * r, Math.max(au, 2))
  b.slip = beta

  // the steering: speed-sensitive lock, the rack at the speed of hands, and the hands catching a
  // slide (the fronts follow it on their caster, as the Roadster's do: tyres.js steer)
  let target = inp.steer * lockAt(S, au)
  const slide = smooth((Math.abs(beta) - 0.1) / 0.15)
  if (u > 3 && !hb) {
    const aKin = Math.atan2(w + a * r, au)
    target += (aKin + inp.steer * 0.5 * S.lock - target) * slide * S.assist
  }
  target = clamp(target, -S.lock, S.lock)
  const centring = Math.abs(target) < Math.abs(b.steerAng)
  const rate = S.steerRate * (1 + slide) + (centring ? 0.06 * au : 0)
  b.steerAng += clamp(target - b.steerAng, -rate * dt, rate * dt)
  const cd = Math.cos(b.steerAng),
    sd = Math.sin(b.steerAng)

  // the pedals: forwards, braking, or (the brake held at a standstill) backing up
  let thr = b.dead ? 0 : clamp(inp.throttle, 0, 1)
  let brk = clamp(inp.brake, 0, 1)
  let rev = 0
  if (b.gear === -1 && thr > 0 && u < 0.5) {
    // (backing up, the throttle is the brake)
    brk = Math.max(brk, thr)
    thr = 0
    if (u > -0.3) b.gear = 1
  } else if (brk > 0 && thr === 0 && u < 0.6 && !b.dead) {
    rev = brk
    brk = 0
    b.gear = -1
  } else if (b.gear === -1 && u > -0.2 && brk === 0 && thr === 0) b.gear = 1
  if (b.gear === -1 && rev === 0 && u < -0.3 && thr === 0) brk = Math.max(brk, 0.3)
  // the gearbox: an automatic, shifting up near the red line and down as the revs fall, the drive
  // cut while it changes
  let Fdrive = 0
  const n = S.gears.length
  if (b.gear >= 1) {
    let g = Math.min(b.gear - 1, n - 1)
    if (b.shiftT <= 0) {
      const now = rpmAt(S, au, g)
      // (up near the red line; down once the revs fall well below the torque peak, or kicked down
      // on full throttle when the gear below has room)
      const up = g < n - 1 && now > 0.88 * S.rpmRed
      const down =
        g > 0 &&
        rpmAt(S, au, g - 1) < 0.8 * S.rpmRed &&
        (now < 0.5 * S.rpmPeak || (thr > 0.9 && now < 0.7 * S.rpmPeak))
      if (up || down) {
        g += up ? 1 : -1
        b.gear = g + 1
        b.shiftT = SHIFT_T
      }
    }
    b.rpm = rpmAt(S, au, g)
    if (au < 3) b.rpm = Math.max(b.rpm, S.rpmIdle + thr * (S.rpmPeak - S.rpmIdle) * 0.6)
    const T = S.torque * torqueAt(S, b.rpm) * thr * b.limp
    Fdrive = (T * S.gears[g] * S.final * EFF) / S.wheelR
    // (the governor: no more pull at the top speed)
    Fdrive *= smooth((S.vMax - u) / (0.06 * S.vMax))
    if (b.shiftT > 0) Fdrive *= 0.25
  } else if (b.gear === -1) {
    b.rpm = rpmAt(S, au, 0)
    Fdrive = -rev * m * 3.5 * clamp((REV_MAX + u) / 1.5, 0, 1) * b.limp
  }
  // (and stability control takes the power away in a slide, so the rears can grip again)
  // (the rears' share only: pulling front wheels straighten the car)
  if (Fdrive > 0)
    Fdrive *= 1 - (1 - S.front) * (S.tc ?? 1) * smooth((Math.abs(beta) - 0.12) / 0.25)
  b.shiftT = Math.max(0, b.shiftT - dt)
  b.rpmN = clamp(b.rpm / (S.rpmRed || 1), 0, 1)
  b.load = thr || rev
  // brakes, shared by the load on each axle; and the engine braking when coasting
  const coast = thr === 0 && rev === 0 && brk === 0 ? 0.35 * m * clamp(au / 3, 0, 1) : 0
  const Fbrake = brk * m * S.brake + coast
  const bias = clamp(Nf / N, 0.3, 0.8)
  const drvF = S.front
  let Fxf = drvF * Fdrive - su * bias * Fbrake
  let Fxr = (1 - drvF) * Fdrive - su * (1 - bias) * Fbrake
  // traction: the driven wheels spin past what the tyres can take (a rear-driven car steps out on
  // the power); the brakes are held at the limit (ABS)
  // (traction control, all but off on a sports car or a pickup, keeps the rest from spinning up)
  b.spin = 0
  if (Math.abs(Fxr) > 0.95 * FmaxR && Fdrive * Fxr > 0)
    b.spin = clamp(Math.abs(Fxr) / Math.max(FmaxR, 1) - 0.95, 0, 1) * (1 - (S.tc ?? 1))
  Fxf = clamp(Fxf, -FmaxF, FmaxF)
  Fxr = clamp(Fxr, -FmaxR, FmaxR)
  if (hb) Fxr = -su * Math.max(Math.abs(Fxr), b.ebLock * FmaxR)

  // front tyres, in the steered wheels' frame
  const wfA = w + a * r
  const uwf = u * cd + wfA * sd,
    wwf = -u * sd + wfA * cd
  const alphaF = Math.atan2(wwf, Math.max(Math.abs(uwf), 2))
  let Fyf = -FmaxF * tyreCurve((S.cornF * alphaF) / Math.max(FmaxF, 1), S.slideMu)
  const limF = Math.sqrt(Math.max(0, FmaxF * FmaxF - Fxf * Fxf))
  Fyf = clamp(Fyf, -limF, limF)
  let Fu = Fxf * cd - Fyf * sd,
    Fw = Fxf * sd + Fyf * cd
  let Mz = a * Fw
  // rear tyres: rolling, or locked by the handbrake and sliding
  const wr = w - bb * r
  let Fyr
  if (locked) {
    const vr = Math.hypot(u, wr),
      k = FmaxR / Math.max(vr, 0.6)
    Fxr = -u * k
    Fyr = -wr * k
  } else {
    const alphaR = Math.atan2(wr, Math.max(au, 2))
    Fyr = -FmaxR * tyreCurve((S.cornR * alphaR) / Math.max(FmaxR, 1), S.slideMu)
    const limR = Math.sqrt(Math.max(0, FmaxR * FmaxR - Fxr * Fxr)) * (1 - 0.6 * b.spin)
    Fyr = clamp(Fyr, -limR, limR)
  }
  Fu += Fxr
  Fw += Fyr
  Mz -= bb * Fyr
  // the handbrake's swing (going forwards, fading as the car comes round), and catching the slide
  // once it is let go: a car turning faster than its tyres could carry it round is eased back
  if (hb && inp.steer !== 0 && u > 2)
    Mz +=
      inp.steer *
      S.hbYaw *
      (m / 1000) *
      b.ebLock *
      smooth((u - 2) / 8) *
      (1 - smooth((Math.abs(Math.atan2(w, u)) - 0.6) / 0.5))
  // (the swing held to a rate a driver can catch)
  if (hb && Math.abs(r) > HB_RATE) Mz -= Math.sign(r) * 3 * m * (Math.abs(r) - HB_RATE)
  const spd = Math.hypot(u, w)
  if (!hb && spd > 4) {
    const rOk = Math.max(Math.abs(u * Math.tan(b.steerAng)) / S.wb, (mu * G) / spd)
    const over = Math.abs(r) - rOk - SPIN_OK
    if (over > 0) Mz -= Math.sign(r) * Math.min(SPIN_K * m * over, SPIN_MAX * m) * S.stab
    // (and the nose brought back round to where the car is going, as a driver's hands and the
    // power do coming out of a slide: the recovery, less the more the throttle is held)
    const off = Math.atan2(w, u)
    if (u > 2 && Math.abs(off) < 1.7)
      Mz += S.stab * b.I * (RECOVER * off * (1 - 0.5 * thr) - 0.2 * r * smooth(Math.abs(off) / 0.3))
  }
  b.drifting = !locked && Math.abs(beta) > 0.18 && au > 6
  // rolling resistance and drag
  const Fres = S.rollRes * N * Math.min(1, spd / 0.5) + S.drag * spd * spd
  if (spd > 1e-4) {
    Fu -= (Fres * u) / spd
    Fw -= (Fres * w) / spd
  }
  b.vx += ((Fu * fx + Fw * lx) / m) * dt
  b.vz += ((Fu * fz + Fw * lz) / m) * dt
  b.w += (Mz / b.I) * dt
  b.yaw = wrapPi(b.yaw + b.w * dt)
  b.hx = Math.cos(b.yaw)
  b.hz = -Math.sin(b.yaw)
  // brakes and drag stop the car but never push it backwards
  let uN = b.vx * b.hx + b.vz * b.hz
  const pushing = Fdrive !== 0
  if (!pushing && u * uN < 0) {
    b.vx -= uN * b.hx
    b.vz -= uN * b.hz
    uN = 0
  }
  if (!pushing && Math.hypot(b.vx, b.vz) < (brk > 0 || hb ? 0.3 : 0.05)) {
    b.vx = b.vz = b.w = 0
    uN = 0
  }
  b.accLong = clamp(Fu / m, -20, 20)
  b.latAcc = clamp(Fw / m, -20, 20)
  b.u = uN
  b.lat = b.vx * b.hz - b.vz * b.hx
  b.x += b.vx * dt
  b.z += b.vz * dt
  // how much the tyres slide, for marks and squeal
  const sF = clamp(((S.cornF * Math.abs(alphaF)) / Math.max(FmaxF, 1) - 1.4) / 0.8, 0, 1)
  const sR = locked
    ? clamp(Math.hypot(u, wr) / 3, 0, 1)
    : clamp(((S.cornR * Math.abs(beta)) / Math.max(FmaxR, 1) - 1.2) / 0.8, 0, 1)
  b.skid = Math.max(sF, sR, b.spin) * clamp(spd / 3, 0, 1)
}

// the body on its springs: pitching under braking and acceleration, rolling in corners, bouncing
// over kerbs, each a damped spring at the class's bounce frequency, within its travel
function body (b, dt) {
  const S = b.spec,
    k = (2 * Math.PI * S.suspHz) ** 2,
    c = 2 * S.damp * 2 * Math.PI * S.suspHz
  const pT = clamp((-b.accLong / G) * S.pitchK, -0.12, 0.12),
    rT = clamp((b.latAcc / G) * S.rollK, -0.15, 0.15)
  b.pitchV += (-k * (b.pitch - pT) - c * b.pitchV) * dt
  b.pitch += b.pitchV * dt
  b.rollV += (-k * (b.roll - rT) - c * b.rollV) * dt
  b.roll += b.rollV * dt
  b.heaveV += (-k * b.heave - c * b.heaveV) * dt
  b.heave = clamp(b.heave + b.heaveV * dt, -S.travel, S.travel)
}

// the speed along and across the car, and its pose, for anyone drawing it
export const speedOf = b => Math.hypot(b.vx, b.vz)
