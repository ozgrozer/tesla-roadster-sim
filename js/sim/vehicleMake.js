// A new body for a car of a handling class (vehicleSim.js steps it), and the controls it is driven
// by. Split out of vehicleSim.js (kept under 500 lines); vehicleSim.js exports both as before.
import { Sim } from './sim.js'
import { handlingFor, yawInertia } from './handling.js'

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
    hbDir: 0, // the way the car was going as the handbrake was pulled (1, -1; 0 off)
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
    kerbW: null, // (each wheel up on a kerb a step ago: vehicleHit.js kerbs)
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
