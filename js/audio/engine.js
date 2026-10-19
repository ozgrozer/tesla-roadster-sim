// The engine of whatever the player drives that isn't the Roadster, synthesised: its firing
// frequency from the rpm and gear vehicleSim.js keeps (rpm / 60 x cylinders / 2), a sawtooth and a
// half-order rumble through a low-pass that opens with the throttle and the revs, a burble of
// filtered noise for the exhaust (a diesel's clatter on a truck or a bus), the note dipping and
// the drive cut through each gear change (body.shiftT), the limiter's stutter at the red line and
// a whine from a sports car's gearbox; heard where the car is (the SoundEngine's carBus, so the
// camera's distance and the walls' echo apply). And each class's own horn: the SoundEngine's horn
// retuned (a pair of disc horns, a deeper pair on an SUV or a pickup, an air horn on a bus or a
// truck).
//
//   new EngineVoice(sound)  .update(body | null, dt)   .hornFor(kind)
import { HORNS, AIR_HORN } from './shots.js'
import { clamp } from '../sim/constants.js'

// per handling class: cylinders, the note's level, the low-pass's floor and its reach (Hz), the
// exhaust's noise, a diesel's clatter, a gearbox whine
// prettier-ignore
const VOICE = {
  sedan: { cyl: 4, k: 0.9, lp: 380, open: 1700, burble: 0.25, diesel: 0, whine: 0 },
  sports: { cyl: 8, k: 1.15, lp: 420, open: 2600, burble: 0.55, diesel: 0, whine: 0.25 },
  suv: { cyl: 6, k: 1, lp: 340, open: 1500, burble: 0.3, diesel: 0, whine: 0 },
  pickup: { cyl: 8, k: 1.1, lp: 300, open: 1400, burble: 0.5, diesel: 0, whine: 0 },
  van: { cyl: 6, k: 0.95, lp: 300, open: 1200, burble: 0.25, diesel: 0.3, whine: 0 },
  truck: { cyl: 6, k: 1.2, lp: 220, open: 900, burble: 0.35, diesel: 1, whine: 0 },
  bus: { cyl: 6, k: 1.2, lp: 200, open: 850, burble: 0.3, diesel: 1, whine: 0 },
  police: { cyl: 8, k: 1.1, lp: 380, open: 2100, burble: 0.45, diesel: 0, whine: 0.1 }
}
// and its horn: [frequencies, air horn]
const HORN = {
  sedan: [HORNS[0], false],
  sports: [HORNS[4], false],
  suv: [HORNS[1], false],
  pickup: [HORNS[3], false],
  van: [HORNS[3], false],
  truck: [AIR_HORN, true],
  bus: [AIR_HORN, true],
  police: [HORNS[2], false],
  roadster: [HORNS[0], false]
}

export class EngineVoice {
  constructor (sound) {
    this.sound = sound
    this.n = null
    this.gear = 0
    this.dip = 0 // the note's dip through a gear change (0 to 1)
    this.horn = 'roadster'
  }
  build () {
    const s = this.sound,
      { gain, filt, osc } = s
    const n = (this.n = {})
    n.out = gain(0)
    n.lp = filt('lowpass', 400, 1.2)
    n.saw = osc('sawtooth', 40)
    n.sub = osc('triangle', 20)
    n.sq = osc('square', 80)
    n.sawG = gain(0.5)
    n.subG = gain(0.7)
    n.sqG = gain(0.12)
    n.saw.connect(n.sawG).connect(n.lp)
    n.sub.connect(n.subG).connect(n.lp)
    n.sq.connect(n.sqG).connect(n.lp)
    // the exhaust's burble: brown noise through a band at the firing frequency, pulsed by it
    n.bur = gain(0)
    n.burBP = filt('bandpass', 120, 1.4)
    n.pulse = gain(0.5)
    n.saw.connect(gain(0.5)).connect(n.pulse.gain)
    s.src.brown.connect(n.burBP).connect(n.pulse).connect(n.bur)
    // a diesel's clatter: white noise high up, pulsed the same way
    n.clat = gain(0)
    n.clatBP = filt('bandpass', 2400, 2)
    const cp = gain(0.4)
    n.sq.connect(gain(0.4)).connect(cp.gain)
    s.src.white.connect(n.clatBP).connect(cp).connect(n.clat)
    // a straight-cut gearbox's whine
    n.whine = gain(0)
    n.whO = osc('sine', 600)
    n.whO.connect(n.whine)
    for (const g of [n.lp, n.bur, n.clat, n.whine]) g.connect(n.out)
    s.lane([n.out.gain], n.out, s.carBus)
  }

  // each frame: the body the player drives (vehicleSim.js; null: none, the engine falls silent)
  update (b, dt) {
    const s = this.sound
    if (!s.ctx || !s.enabled) return
    if (!this.n) this.build()
    const n = this.n,
      R = s.R
    if (!b || b.dead || !VOICE[b.kind]) {
      R(n.out.gain, 0, 0.15)
      this.gear = 0
      return
    }
    const V = VOICE[b.kind],
      S = b.spec,
      ps = s.ps || 1
    // the gear change: the note dips and comes back as the clutch takes up
    if (b.gear !== this.gear && this.gear > 0 && b.gear > this.gear) this.dip = 1
    this.gear = b.gear
    this.dip = Math.max(0, this.dip - dt / 0.28)
    const rpm = b.rpm || S.rpmIdle,
      red = rpm > 0.98 * S.rpmRed
    // (the limiter cutting in and out at the red line)
    const cut = red && Math.sin(s.now * 70) > 0 ? 0.35 : 1
    const fire = ((rpm / 60) * V.cyl) / 2
    const load = clamp(b.load, 0, 1),
      dip = 1 - 0.45 * this.dip
    R(n.saw.frequency, fire * ps, 0.03)
    R(n.sub.frequency, fire * 0.5 * ps, 0.03)
    R(n.sq.frequency, fire * 2 * ps, 0.03)
    R(n.lp.frequency, (V.lp + V.open * (0.25 * b.rpmN + 0.75 * load * b.rpmN)) * dip, 0.04)
    R(n.burBP.frequency, fire * 1.5 * ps, 0.05)
    const lvl = 0.05 * V.k * (0.45 + 0.55 * load) * (0.7 + 0.5 * b.rpmN) * dip * cut
    R(n.out.gain, 1, 0.1)
    R(n.lp.Q, 1 + 3 * load * b.rpmN, 0.1)
    R(n.sawG.gain, lvl * 6, 0.03)
    R(n.subG.gain, lvl * 9, 0.03)
    R(n.sqG.gain, lvl * 1.5, 0.03)
    R(n.bur.gain, lvl * V.burble * (0.4 + (1 - load) * 0.8) * 3, 0.05)
    R(n.clat.gain, lvl * V.diesel * 0.9, 0.05)
    const whine = V.whine * clamp(Math.abs(b.u) / 30, 0, 1) * 0.012
    R(n.whine.gain, whine, 0.1)
    if (whine > 0) R(n.whO.frequency, (Math.abs(b.u) * 38 + 200) * ps, 0.05)
  }

  // the SoundEngine's horn retuned to a class's (handling kind; 'roadster' its own), before H
  hornFor (kind) {
    const s = this.sound
    if (kind === this.horn || !s.ctx || !s.n?.hornO) return
    this.horn = kind
    const [f, air] = HORN[kind] || HORN.sedan
    s.n.hornO.forEach((o, i) => {
      o.frequency.value = f[i]
      o.setPeriodicWave(air ? s.airHornWave : s.hornWave)
    })
  }
}
