// Handling classes, as data: how each kind of car in the city drives when someone is at its wheel
// (vehicleSim.js steps them; the traffic's own drivers keep to carTypes.js). Each class: its mass
// and size, where its weight sits, the engine's torque curve and the gearbox it is shifted through
// (the gears also set the engine note's pitch), its brakes, how far its wheels turn and how that
// lock falls away with speed, the grip front and rear and what a sliding tyre keeps, the springs
// (stiffness, travel, damping) and how far the body rolls and pitches, the handbrake's swing and
// the drivers' aids (catching a slide). The Roadster keeps its own physics (sim.js, ground.js,
// drift.js and the stunts): its entry only flags that and carries its figures for anyone reading.
// Pure data and maths: no DOM, no three.js.
import { CAR, clamp } from './constants.js'

// mass kg; len, wid, hgt m; wb wheelbase m; wf the share of the weight on the front axle; comH the
// centre of mass above the road (m); wheelR m; track m
// torque N m (peak, at rpmPeak); rpmIdle, rpmPeak, rpmRed; gears: ratios; final: the final drive;
// front: the share of the drive to the front wheels (1 front-wheel drive, 0 rear); vMax m/s
// brake: m/s^2 at full pedal on a dry road; lock: the road wheels' full lock at a standstill (rad);
// steerV: the speed (m/s) at which the lock on the keys has halved; steerRate: rad/s the rack turns
// mu: the tyres' grip; gripF, gripR: the axles' share of it; slideMu: what a sliding tyre keeps;
// cornF, cornR: cornering stiffness per axle (N/rad)
// suspHz: the springs' bounce frequency; travel: m either way; damp: damping ratio; rollK: rad of
// body roll per g of cornering; pitchK: rad of pitch per g of braking or pulling away
// hbYaw: N m per tonne the handbrake's swing adds at full lock; stab: how hard a slide is caught
// once the handbrake is off (1 an ordinary car); feel: how near the fronts' peak slip the
// driver's feel for the limit lets the keys turn them at speed (1 right to it; less: more
// understeer); assist: how much the driver's hands steer into a slide (0 to 1); tc: traction
// control (1 on, the default; 0 off: the driven wheels spin up and step out on the power); drag: aero, N per (m/s)^2; rollRes: rolling resistance coefficient
// GTA tuning (v3): hbGrip the share of their grip the handbrake's locked rears keep (low: the tail
// swings out and the car carries its speed round); hbRate the most it swings the car at (rad/s);
// slideHold how much the throttle holds a slide against the hands catching it (RWD high: a power
// slide; 0.5 the default); revMax, revAcc: backing up (m/s, m/s^2)
// prettier-ignore
export const HANDLING = {
  sedan: {
    mass: 1550, len: 4.7, wid: 1.85, hgt: 1.45, wb: 2.8, wf: 0.58, comH: 0.55, wheelR: 0.33, track: 1.58,
    torque: 320, rpmIdle: 800, rpmPeak: 4200, rpmRed: 6500, gears: [3.5, 2.1, 1.4, 1.0, 0.8, 0.65], final: 3.6, front: 1, vMax: 58,
    brake: 10.5, lock: 0.68, steerV: 18, steerRate: 3.4,
    mu: 1.08, gripF: 1.0, gripR: 1.02, slideMu: 0.78, cornF: 85000, cornR: 95000,
    suspHz: 1.4, travel: 0.12, damp: 0.35, rollK: 0.11, pitchK: 0.065,
    hbYaw: 3000, stab: 1, assist: 0.6, feel: 0.85, drag: 0.42, rollRes: 0.013,
    hbGrip: 0.45, hbRate: 2.6, slideHold: 0.55, revMax: 10, revAcc: 5
  },
  sports: {
    mass: 1450, len: 4.5, wid: 1.9, hgt: 1.28, wb: 2.6, wf: 0.47, comH: 0.45, wheelR: 0.34, track: 1.62,
    torque: 560, rpmIdle: 900, rpmPeak: 5500, rpmRed: 7800, gears: [3.1, 2.2, 1.65, 1.3, 1.05, 0.86, 0.72], final: 3.5, front: 0, vMax: 86,
    brake: 12, lock: 0.66, steerV: 22, steerRate: 4.0,
    mu: 1.22, gripF: 1.0, gripR: 1.0, slideMu: 0.8, cornF: 110000, cornR: 120000,
    suspHz: 2.0, travel: 0.08, damp: 0.45, rollK: 0.042, pitchK: 0.04,
    hbYaw: 3600, tc: 0.6, stab: 0.8, assist: 0.7, feel: 1.0, drag: 0.38, rollRes: 0.012,
    hbGrip: 0.42, hbRate: 3.0, slideHold: 0.72, revMax: 11, revAcc: 5.5
  },
  suv: {
    mass: 2150, len: 4.85, wid: 1.95, hgt: 1.75, wb: 2.9, wf: 0.55, comH: 0.72, wheelR: 0.37, track: 1.65,
    torque: 450, rpmIdle: 750, rpmPeak: 4000, rpmRed: 6000, gears: [3.6, 2.2, 1.5, 1.15, 0.9, 0.72], final: 3.7, front: 0.45, vMax: 55,
    brake: 9.5, lock: 0.64, steerV: 16, steerRate: 3.0,
    mu: 1.0, gripF: 0.98, gripR: 1.0, slideMu: 0.75, cornF: 95000, cornR: 110000,
    suspHz: 1.2, travel: 0.18, damp: 0.32, rollK: 0.13, pitchK: 0.07,
    hbYaw: 2600, stab: 1.2, assist: 0.5, feel: 0.82, drag: 0.55, rollRes: 0.015,
    hbGrip: 0.5, hbRate: 2.3, slideHold: 0.55, revMax: 9, revAcc: 4.5
  },
  pickup: {
    mass: 2300, len: 5.4, wid: 2.0, hgt: 1.85, wb: 3.4, wf: 0.6, comH: 0.75, wheelR: 0.38, track: 1.7,
    torque: 520, rpmIdle: 700, rpmPeak: 3500, rpmRed: 5600, gears: [3.5, 2.1, 1.4, 1.0, 0.75], final: 3.73, front: 0, vMax: 50,
    brake: 9.2, lock: 0.64, steerV: 15, steerRate: 2.8,
    mu: 0.98, gripF: 1.0, gripR: 1.0, slideMu: 0.72, cornF: 95000, cornR: 95000,
    suspHz: 1.3, travel: 0.2, damp: 0.3, rollK: 0.14, pitchK: 0.075,
    hbYaw: 2700, tc: 0.8, stab: 1, assist: 0.5, feel: 0.88, drag: 0.6, rollRes: 0.016,
    hbGrip: 0.48, hbRate: 2.4, slideHold: 0.55, revMax: 9, revAcc: 4.5
  },
  truck: {
    mass: 9500, len: 9.9, wid: 2.55, hgt: 3.8, wb: 5.6, wf: 0.45, comH: 1.3, wheelR: 0.5, track: 2.0,
    torque: 1500, rpmIdle: 600, rpmPeak: 1600, rpmRed: 2600, gears: [6.5, 4.0, 2.6, 1.7, 1.25, 1.0], final: 4.1, front: 0, vMax: 30,
    brake: 7, lock: 0.62, steerV: 11, steerRate: 1.8,
    mu: 0.85, gripF: 1.0, gripR: 1.0, slideMu: 0.7, cornF: 280000, cornR: 400000,
    suspHz: 1.1, travel: 0.15, damp: 0.35, rollK: 0.14, pitchK: 0.06,
    hbYaw: 600, stab: 1.4, assist: 0.3, feel: 0.75, drag: 2.5, rollRes: 0.02,
    hbGrip: 0.65, hbRate: 1.2, revMax: 6
  },
  van: {
    mass: 3200, len: 6.4, wid: 2.15, hgt: 2.8, wb: 3.7, wf: 0.55, comH: 1.0, wheelR: 0.36, track: 1.8,
    torque: 400, rpmIdle: 750, rpmPeak: 3200, rpmRed: 5000, gears: [4.0, 2.4, 1.5, 1.0, 0.8], final: 3.9, front: 0, vMax: 42,
    brake: 8.2, lock: 0.64, steerV: 13, steerRate: 2.5,
    mu: 0.93, gripF: 1.0, gripR: 1.0, slideMu: 0.72, cornF: 110000, cornR: 140000,
    suspHz: 1.2, travel: 0.14, damp: 0.32, rollK: 0.15, pitchK: 0.075,
    hbYaw: 1600, stab: 1.3, assist: 0.4, feel: 0.8, drag: 1.1, rollRes: 0.017,
    hbGrip: 0.55, hbRate: 1.9, revMax: 8, revAcc: 4
  },
  bus: {
    mass: 12500, len: 11.6, wid: 2.55, hgt: 3.15, wb: 6.2, wf: 0.4, comH: 1.2, wheelR: 0.5, track: 2.1,
    torque: 1500, rpmIdle: 600, rpmPeak: 1400, rpmRed: 2300, gears: [3.4, 2.0, 1.4, 1.0, 0.75], final: 5.2, front: 0, vMax: 26,
    brake: 6.5, lock: 0.62, steerV: 9, steerRate: 1.5,
    mu: 0.85, gripF: 1.0, gripR: 1.0, slideMu: 0.7, cornF: 350000, cornR: 520000,
    suspHz: 1.0, travel: 0.12, damp: 0.35, rollK: 0.13, pitchK: 0.04,
    hbYaw: 500, stab: 1.5, assist: 0.3, feel: 0.75, drag: 3.2, rollRes: 0.02,
    hbGrip: 0.7, hbRate: 1.0, revMax: 5.5
  },
  police: {
    mass: 1900, len: 5.05, wid: 2.0, hgt: 1.5, wb: 2.95, wf: 0.54, comH: 0.55, wheelR: 0.35, track: 1.65,
    torque: 520, rpmIdle: 800, rpmPeak: 4800, rpmRed: 6800, gears: [3.0, 2.0, 1.45, 1.12, 0.87, 0.7], final: 3.4, front: 0.35, vMax: 70,
    brake: 11.5, lock: 0.67, steerV: 20, steerRate: 3.8,
    mu: 1.15, gripF: 1.0, gripR: 1.02, slideMu: 0.8, cornF: 110000, cornR: 125000,
    suspHz: 1.7, travel: 0.11, damp: 0.4, rollK: 0.085, pitchK: 0.055,
    hbYaw: 3300, tc: 0.8, stab: 1, assist: 0.65, feel: 0.95, drag: 0.45, rollRes: 0.013,
    hbGrip: 0.45, hbRate: 2.8, slideHold: 0.7, revMax: 10.5, revAcc: 5
  },
  // the Roadster: its own physics, untouched (sim.js); these are its spec-sheet figures
  roadster: {
    sim: true, mass: CAR.mass, len: 2 * CAR.halfL, wid: 2 * CAR.halfW, hgt: CAR.height, wb: CAR.wheelbase, wf: 0.5,
    comH: CAR.comH, wheelR: CAR.wheelR, track: 1.7, vMax: CAR.vMax, brake: CAR.brakeAccel, mu: CAR.tireMu,
    slideMu: CAR.slideMu, cornF: CAR.corneringF, cornR: CAR.corneringR
  }
}
export const KINDS = Object.keys(HANDLING)

// The handling class a traffic type (carTypes.js) drives with once someone takes its wheel
export const TYPE_KIND = {
  sedan: 'sedan',
  hatch: 'sedan',
  taxi: 'sedan',
  suv: 'suv',
  pickup: 'pickup',
  van: 'van',
  bus: 'bus',
  police: 'police',
  sports: 'sports',
  ambulance: 'van',
  fire: 'truck',
  truck: 'truck',
  lowrider: 'sedan',
  limo: 'sedan'
}
export const kindOfType = name => TYPE_KIND[name] || 'sedan'
export function handlingFor (kind) {
  const h = HANDLING[kind]
  if (!h) throw new Error(`no handling class '${kind}'`)
  return h
}

const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
// the engine's torque at rpm, as a share of its peak: building from idle to the peak, falling away
// towards the red line, nothing past it (the limiter)
export function torqueAt (h, rpm) {
  if (rpm > h.rpmRed * 1.02) return 0
  if (rpm <= h.rpmPeak)
    return 0.7 + 0.3 * smooth((rpm - h.rpmIdle) / (h.rpmPeak - h.rpmIdle))
  const k = (rpm - h.rpmPeak) / (h.rpmRed - h.rpmPeak)
  return 1 - 0.25 * k * k
}
// the engine's rpm at road speed u (m/s) in gear g (0-based)
export function rpmAt (h, u, g) {
  const w = (Math.abs(u) / h.wheelR) * h.gears[g] * h.final
  return Math.max(h.rpmIdle, (w * 60) / (2 * Math.PI))
}
// how far full lock on the keys turns the road wheels at u m/s (rad): speed-sensitive steering
export const lockAt = (h, u) => h.lock / (1 + (u * u) / (h.steerV * h.steerV))
// the yaw inertia of a class (kg m^2), a box of its footprint with its mass towards the axles
export const yawInertia = h => (0.9 * h.mass * (h.len * h.len + h.wid * h.wid)) / 12
// (the gear an automatic box would pick at road speed u: the highest that keeps the engine above
// its torque peak's 60%, short of the red line)
export function gearFor (h, u) {
  let g = 0
  while (
    g < h.gears.length - 1 &&
    rpmAt(h, u, g) > 0.8 * h.rpmRed &&
    rpmAt(h, u, g + 1) > 0.6 * h.rpmPeak
  )
    g++
  return clamp(g, 0, h.gears.length - 1)
}
