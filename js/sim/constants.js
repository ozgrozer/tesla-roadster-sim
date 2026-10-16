// Physical constants, the car's spec sheet and small math helpers shared by the simulation.
import * as THREE from 'three'

export const G = 9.81
export const DEG = Math.PI / 180
export const TAU = Math.PI * 2
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const clamp01 = v => clamp(v, 0, 1)
export const wrapPi = a => {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}
export const AX_X = new THREE.Vector3(1, 0, 0)
export const AX_Y = new THREE.Vector3(0, 1, 0)
export const AX_Z = new THREE.Vector3(0, 0, 1)

// Figures from the Oct 15, 2026 reveal coverage where they exist; the rest are plausible fills.
export const CAR = {
  mass: 2200, // kg, includes 250 kg of compressed air
  wheelbase: 2.9, // measured off the event's side-on photo, scaled by the tyres
  halfWB: 1.45,
  halfL: 2.22,
  halfW: 0.99,
  height: 1.19,
  comH: 0.5, // centre of mass above the contact plane
  wheelR: 0.36,
  tireMu: 1.26, // "1.26 G from tires alone"
  driveAccelMax: 15, // m/s^2 at the tires
  powerW: 1.15e6,
  brakeAccel: 13,
  vMax: 103, // 370 km/h
  mainThrust: 36000, // 4 rear diffuser nozzles
  liftThrust: 68000, // 4 corner nozzles under the floor: ~3.1 G landing burn ("3.3 G at ~6.5 m")
  sideThrust: 2000, // 2 side nozzles (attitude) -> 10 nozzles, 106 kN total ("over 80 kN")
  airMass: 250, // kg of air in two COPVs (600 L, ~380 bar)
  ve: 1400, // effective exhaust velocity, m/s (generous, for a full demo on one tank)
  recharge: 6, // kg/s while driving without thrust (game assist)
  Iz: 4300, // yaw inertia, kg m^2
  rearGrip: 1.14, // staggered tyres: wider rears keep the car stable (understeer at the limit)
  corneringF: 105000,
  corneringR: 120000, // tyre cornering stiffness per axle, N/rad
  rollRes: 0.015, // rolling resistance coefficient
  regenAccel: 1.3, // lift-off regen (one-pedal driving), m/s^2
  regenPowerW: 250000,
  slideMu: 0.8, // a tyre sliding (past its peak, or locked by the e-brake) keeps 80% of its grip
  suctionG: 2.1, // fan suction, ~4,600 kg of downforce
  dragK: 1.6e-4,
  pitchAcc: 14,
  rollAcc: 16,
  yawAcc: 6 // rad/s^2 from attitude thrusters
}
export const LIFT_ACC = CAR.liftThrust / CAR.mass

export function makeControls () {
  return {
    throttle: 0,
    brake: 0,
    reverse: 0,
    steer: 0,
    main: 0,
    lift: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    fan: true,
    assist: true,
    flare: 0,
    latHold: false,
    ebrake: false
  }
}

// Body corners in the car frame (contact-plane origin), used for ground and obstacle contact.
export const CORNERS = []
for (const sx of [-1, 1])
  for (const sy of [0.06, 1.1])
    for (const sz of [-1, 1])
      CORNERS.push(new THREE.Vector3(sx * CAR.halfL, sy, sz * CAR.halfW))
