// The Roadster's drive units, mixed into the SoundEngine (sound.js). Three motors: one on the front
// axle and a pair on the rear, one per wheel, each through a two-stage reduction gearbox. What a
// real one sings with is its orders, tones locked to the shaft's speed: the electromagnetic ones
// (twice the electrical frequency, the torque ripple, the stator's slots going by) and the gear
// mesh (teeth meshing per second on each stage, with sidebands a shaft's turn either side). They
// are all built into one periodic wave per shaft, so a single oscillator plays a whole spectrum
// that keeps its shape as it sweeps; a few fixed resonances of the housing and body make it swell
// and fade as the orders sweep through them. Under power the drive flank of the teeth sings (and
// the motor's own orders with the current); lifting off onto regen the coast flank does, thinner
// and with more sidebands. The two rear motors split apart in a corner (the outer wheel turns
// faster) and beat against each other; on the e-brake they stop with the wheels, and spinning up in
// a drift they race ahead of the front one. Below about 40 km/h the inverter's switching is heard
// as well: two tones either side of its carrier, one rising and one falling as the car speeds up,
// that step up a carrier at a time, like a real Tesla's at walking pace; then a low hum through the
// drivetrain under load, and a soft clunk as the gears' lash is taken up when the torque reverses.
import { clamp } from '../sim/constants.js'
import { wave } from './buffers.js'

const WHEEL_R = 0.36
// teeth: stage 1 (on the motor shaft) and stage 2 (on the intermediate shaft), and the reduction
const UNITS = {
  front: { z1: 21, g1: 68, z2: 23, g2: 56 },
  rear: { z1: 19, g1: 63, z2: 25, g2: 56 }
}
for (const u of Object.values(UNITS)) {
  u.ratio = (u.g1 / u.z1) * (u.g2 / u.z2)
  u.mid = u.z1 / u.g1 // the intermediate shaft's speed, as a share of the motor's
}
const FMAX = 2200 * 15 // N, the most the motors push
const FREGEN = 2200 * 1.3 // N, lift-off regen
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// the motor shaft's orders: electromagnetic (6: twice the electrical frequency with three pole
// pairs, 18: torque ripple, 36: slot passing) and the first stage's mesh (z1, its sidebands, its
// harmonics); coast: the other flank, the motor's orders weaker
function motorWave (ctx, z, coast) {
  const c = coast ? 1 : 0
  return wave(ctx, {
    1: 0.03,
    2: 0.02,
    6: 0.16 - 0.1 * c,
    12: 0.05,
    18: 0.11 - 0.06 * c,
    24: 0.03,
    36: 0.18 - 0.1 * c,
    72: 0.04,
    [z - 1]: 0.1 + 0.15 * c,
    [z]: 1 - 0.25 * c,
    [z + 1]: 0.11 + 0.17 * c,
    [2 * z - 1]: 0.04 + 0.05 * c,
    [2 * z]: 0.28 + 0.2 * c,
    [2 * z + 1]: 0.05 + 0.06 * c,
    [3 * z]: 0.08 + 0.08 * c
  })
}
// the intermediate shaft: the second stage's mesh
function meshWave (ctx, z) {
  return wave(ctx, {
    1: 0.03,
    [z - 1]: 0.22,
    [z]: 1,
    [z + 1]: 0.24,
    [2 * z]: 0.32,
    [3 * z]: 0.08
  })
}

export const DRIVE = {
  buildDrive () {
    const { ctx, n, gain, filt, osc } = this
    // the housing and body: a few fixed resonances the orders swell through
    n.motor = gain(1)
    const res = [
      [1250, 3, 7],
      [2700, 4, 6],
      [4600, 3, 4]
    ].map(([f, q, db]) => {
      const b = filt('peaking', f, q)
      b.gain.value = db
      return b
    })
    n.motorLP = filt('lowpass', 7000, 0.6)
    n.motor
      .connect(res[0])
      .connect(res[1])
      .connect(res[2])
      .connect(n.motorLP)
      .connect(this.carBus)
    const unit = (name, twin) => {
      const U = UNITS[name],
        drive = motorWave(ctx, U.z1, false),
        coast = motorWave(ctx, U.z1, true)
      const u = { U, gD: gain(0), gC: gain(0), g2: gain(0), d: [] }
      for (let i = 0; i < (twin ? 2 : 1); i++) {
        const o = osc('sine', 50)
        o.setPeriodicWave(drive)
        o.connect(u.gD)
        u.d.push(o)
      }
      u.c = osc('sine', 50)
      u.c.setPeriodicWave(coast)
      u.c.connect(u.gC)
      u.m = osc('sine', 15)
      u.m.setPeriodicWave(meshWave(ctx, U.z2))
      u.m.connect(u.g2)
      // (each joins the motor's bus only while it sounds: see SoundEngine.lane)
      for (const g of [u.gD, u.gC, u.g2]) this.lane([g.gain], g, n.motor)
      return u
    }
    n.front = unit('front', false)
    n.rear = unit('rear', true)
    // the inverter: its carrier, ring-modulated by twice the electrical frequency into a pair of
    // sidebands, and a little of the carrier itself
    n.inv = gain(0)
    n.carrier = osc('sine', 1950)
    n.fe2 = osc('sine', 10)
    const ring = gain(0)
    n.carrier.connect(ring)
    n.fe2.connect(ring.gain)
    ring.connect(n.inv)
    n.carrier.connect(gain(0.25)).connect(n.inv)
    this.lane([n.inv.gain], n.inv, this.carBus)
    // the drivetrain under load: a low hum at the wheels' turn and the shafts', and a rumble
    n.hum = gain(0)
    n.humO = osc('triangle', 10)
    n.humO.connect(n.hum)
    n.rumble = gain(0)
    this.lane(
      [n.rumble.gain],
      this.src.brown.connect(n.rumble).connect(filt('lowpass', 110, 0.7)),
      this.carBus
    )
    this.lane([n.hum.gain], n.hum, this.carBus)
    // the pedestrian warning sound every electric car makes below 30 km/h: a soft, rounded hum from
    // a speaker in the front bumper, rising a little with speed (heard from outside only)
    n.pws = gain(0)
    n.pwsO = osc('sine', 180)
    n.pwsO.setPeriodicWave(
      wave(ctx, { 1: 1, 2: 0.45, 3: 0.3, 4: 0.1, 5: 0.12 })
    )
    this.lane(
      [n.pws.gain],
      n.pwsO.connect(n.pws).connect(filt('lowpass', 1400, 0.7)),
      this.carBus
    )
    this.lastF = 0
    this.lashT = 0
  },
  // the gears' lash taken up the other way as the torque reverses: a soft clunk
  lash (st, v, F, k) {
    this.lashT -= st.dt
    const was = this.lastF
    if (
      this.lashT < 0 &&
      v < 25 &&
      st.grounded &&
      ((was > 3000 && F < -400) || (was < -400 && F > 3000))
    ) {
      this.lashT = 0.6
      this.play('clank', 0.05 * k, { rate: 0.6, lp: 600, verb: 0 })
    }
    this.lastF = F
  },
  // a drive unit at f Hz (its motor shaft), the twins split apart by split, pulling d (0 to 1) or
  // regenerating rv (0 to 1), k: how loud
  unit (u, f, split, d, rv, k) {
    const R = this.R
    if (k === 0) {
      R(u.gD.gain, 0, 0.05)
      R(u.gC.gain, 0, 0.08)
      R(u.g2.gain, 0, 0.06)
      return
    }
    R(u.d[0].frequency, f * (1 - split), 0.03)
    if (u.d[1]) R(u.d[1].frequency, f * (1 + split), 0.03)
    R(u.c.frequency, f, 0.03)
    R(u.m.frequency, f * u.U.mid, 0.03)
    R(u.gD.gain, k * 0.08 * (0.02 + Math.pow(d, 0.7)), 0.05)
    // (the coast flank only sings under regen: without it, at no torque, it is silent and rests)
    R(u.gC.gain, k * 0.04 * rv, 0.08)
    R(u.g2.gain, k * 0.03 * (0.03 + Math.pow(d, 0.7) + 0.6 * rv), 0.06)
  },
  // st.wheelSpeed (m/s, spinning down in the air), st.force (N: + drive, - regen), st.spin (m/s the
  // rears run ahead of the car), st.yawRate, st.ebrake, st.track, st.inside, st.pitch
  updateDrive (st) {
    const { n, R } = this,
      ps = st.pitch,
      v = st.wheelSpeed,
      inside = st.inside
    const wheel = v / (6.2832 * WHEEL_R)
    const rearV = st.ebrake ? 0 : v + (st.spin || 0)
    const fF = wheel * UNITS.front.ratio * ps,
      fR = (rearV / (6.2832 * WHEEL_R)) * UNITS.rear.ratio * ps
    // in a corner the outer rear wheel turns faster than the inner one (half the track, 0.8 m)
    const split = clamp(((st.yawRate || 0) * 0.8) / Math.max(v, 3), -0.15, 0.15)
    const F = st.grounded ? st.force : 0
    const drive = clamp(F / FMAX, 0, 1),
      regen = clamp(-F / FREGEN, 0, 1)
    // the front motor takes some of the drive, none of it in Track Mode (the rears do the work)
    const share = st.track ? 0.15 : 0.45
    const here = smooth(0.2, 3, v) * (0.55 + 0.45 * Math.min(1, v / 30))
    // (none of it in a car with an engine instead: engine.js, st.combustion)
    const k = st.combustion ? 0 : inside ? 1.5 : 1
    this.unit(n.front, fF, 0, drive * share, regen, here * k)
    this.unit(
      n.rear,
      fR,
      split,
      drive * (1 - share),
      regen,
      smooth(0.2, 3, rearV) * k
    )
    // the inverter, below about 40 km/h: the carrier steps up as the car speeds up
    const fe = 3 * fR,
      fc = rearV < 3.2 ? 1950 : rearV < 6.8 ? 2950 : 3900
    const amps = Math.max(drive, regen * 0.5)
    const inv =
      smooth(0.05, 0.6, rearV) *
      (1 - smooth(9, 13, rearV)) *
      (0.2 + 0.8 * amps) *
      0.012 *
      k
    R(n.inv.gain, inv, 0.03)
    if (inv > 0) {
      R(n.carrier.frequency, fc * ps, 0.006)
      R(n.fe2.frequency, 2 * fe, 0.03)
    }
    // (the slow rest on the mix's world frames, every other one)
    if (st.world === false) return this.lash(st, v, F, k)
    R(n.motorLP.frequency, inside ? 5000 : 6500, 0.2)
    // the drivetrain: twice a turn of the wheels (a tyre's out-of-round) and the load's rumble
    R(n.humO.frequency, Math.max(2, wheel * 2 * ps), 0.05)
    R(n.hum.gain, smooth(1, 8, v) * (inside ? 0.05 : 0.02), 0.2)
    R(
      n.rumble.gain,
      Math.sqrt(drive) * smooth(0, 4, v + 4 * drive) * (inside ? 0.12 : 0.04),
      0.06
    )
    R(n.pwsO.frequency, (170 + v * 9) * ps, 0.1)
    R(
      n.pws.gain,
      inside || !st.grounded || st.combustion
        ? 0
        : smooth(0.15, 0.8, v) * (1 - smooth(6.5, 8.4, v)) * 0.012,
      0.15
    )
    this.lash(st, v, F, k)
  }
}
