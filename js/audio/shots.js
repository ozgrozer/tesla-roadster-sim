// One-shot sounds, mixed into the SoundEngine (sound.js): each can sit anywhere left to right (pan)
// and send some of itself into the street's echo (verb).
import { clamp } from '../sim/constants.js'

export const ONE_SHOTS = {
  // where a one-shot goes: panned into the mix, with a share of it into the echo
  out (g, o) {
    const ctx = this.ctx
    let node = g
    if (o.pan) {
      const p = ctx.createStereoPanner()
      p.pan.value = clamp(o.pan, -1, 1)
      g.connect(p)
      node = p
    }
    node.connect(this.master)
    const v = o.verb ?? 0.25
    if (v > 0) {
      const s = ctx.createGain()
      s.gain.value = v
      node.connect(s).connect(this.verb)
    }
  },
  // o.filter ([type, Hz, Q]) shapes a buzzy wave, the way a housing muffles what is inside it
  tone (f0, f1, dur, type, vol, delay = 0, o = {}) {
    if (!this.ctx || !this.enabled || vol < 0.002) return
    const t = this.ctx.currentTime + delay,
      osc = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.012))
    if (o.hold) g.gain.setValueAtTime(vol, t + o.hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    if (o.filter) {
      const b = this.ctx.createBiquadFilter()
      b.type = o.filter[0]
      b.frequency.value = o.filter[1]
      b.Q.value = o.filter[2] ?? 0.7
      osc.connect(b).connect(g)
    } else osc.connect(g)
    this.out(g, o)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  },
  noise (dur, vol, type, f0, f1, delay = 0, o = {}) {
    if (!this.ctx || !this.enabled || vol < 0.002) return
    const t = this.ctx.currentTime + delay,
      s = this.ctx.createBufferSource(),
      b = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain()
    s.buffer = o.brown ? this.brown : this.white
    b.type = type
    b.frequency.setValueAtTime(f0, t)
    b.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.01))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(b).connect(g)
    this.out(g, o)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  },
  thump (g) {
    const k = clamp(g / 3, 0.3, 1.4)
    this.tone(120, 36, 0.5, 'sine', 0.55 * k)
    this.noise(0.35, 0.35 * k, 'lowpass', 700, 90)
    // the suspension hitting its bump stops, and the body shell flexing
    this.tone(260, 180, 0.12, 'triangle', 0.05 * k, 0.02)
  },
  // a knock against a car, a post or a wall (what: the sim's kind for it): a dull thud with a
  // crunch on top, pitched a little differently every time. Into a car, its panels ring as they
  // buckle; into a wall, the thud is heavier and grit rattles down after it.
  bump (v, what = 'car') {
    const k = clamp(v / 10, 0.15, 1),
      r = 0.85 + Math.random() * 0.3
    const wall = what === 'building' || what === 'plant'
    this.tone((wall ? 110 : 150) * r, wall ? 38 : 50, 0.28, 'sine', 0.55 * k)
    this.noise(0.22, 0.4 * k, 'bandpass', (wall ? 1500 : 2400) * r, 700)
    if (what === 'car' && v > 2.5)
      // sheet steel: a few inharmonic modes, each dying away at its own rate
      for (const [f, d] of [
        [430, 0.22],
        [690, 0.16],
        [1040, 0.12],
        [1580, 0.09]
      ])
        this.tone(f * r, f * r * 0.97, d, 'triangle', 0.035 * k, 0.005)
    if (wall && v > 4)
      for (let i = 0; i < 4; i++)
        this.noise(0.05, 0.05 * k, 'bandpass', 3000, 2000, 0.08 + i * 0.07)
    if (v > 6) {
      // panels buckling and glass going
      this.noise(0.5, 0.18 * k, 'highpass', 5000, 2500, 0.03)
      this.tone(640 * r, 600 * r, 0.3, 'triangle', 0.04 * k, 0.01)
    }
  },
  // the tyres hitting the kerb going up it (a sharp slap and a thump through the car), or dropping
  // off it (a softer one)
  kerb (v, up) {
    const k = clamp(v / 15, 0.15, 1) * (up ? 1 : 0.6)
    this.tone(95, 42, 0.22, 'sine', 0.5 * k, 0, { verb: 0.1 })
    this.noise(0.09, 0.3 * k, 'bandpass', 900, 350, 0, { verb: 0.1 })
    if (up) this.noise(0.04, 0.16 * k, 'highpass', 2600, 1800, 0, { verb: 0.1 })
    this.tone(220, 170, 0.08, 'triangle', 0.04 * k, 0.015, { verb: 0 })
  },
  // a wheel over a manhole's lid: the iron rocking in its frame, a "clank" over a dull thud
  clunk (v) {
    const k = clamp(v / 20, 0.2, 1)
    this.tone(70, 45, 0.15, 'sine', 0.3 * k, 0, { verb: 0.1 })
    this.tone(330, 318, 0.16, 'triangle', 0.05 * k, 0.004, { verb: 0.2 })
    this.tone(910, 890, 0.08, 'triangle', 0.025 * k, 0.004, { verb: 0.2 })
    this.noise(0.05, 0.12 * k, 'bandpass', 1400, 700, 0, { verb: 0.1 })
  },
  // something flashing past close by (v: how fast, pan: which side, d: how close, m): the air torn
  // by a post or a tree, or by a car or a bus, a longer, lower rush; the band falls as it goes by,
  // like a doppler
  whoosh (v, pan, big, d = 2) {
    const k = clamp((v - 8) / 35, 0, 1) * clamp(2.2 / Math.max(d, 1), 0.25, 1),
      dur = (big ? 0.5 : 0.24) * clamp(25 / v, 0.6, 1.4)
    const o = { pan, verb: 0.12, attack: dur * 0.4 }
    if (big) {
      this.noise(dur, 0.3 * k, 'bandpass', 1100, 320, 0, o)
      this.noise(dur, 0.22 * k, 'lowpass', 420, 110, 0, { ...o, brown: true })
    } else this.noise(dur, 0.17 * k, 'bandpass', 1700, 600, 0, o)
  },
  // a bus pulling up: the air brakes' "pssht", from somewhere left or right
  airbrake (vol, pan = 0) {
    this.noise(0.03, 0.4 * vol, 'highpass', 3000, 3000, 0, { pan, verb: 0.3 })
    this.noise(0.9, 0.5 * vol, 'highpass', 4200, 2400, 0.02, {
      pan,
      verb: 0.4,
      attack: 0.03
    })
  },
  // a gull's cry, a few falling "kyow"s, off over the water
  gull (vol, pan) {
    const n = 2 + Math.floor(Math.random() * 3),
      f = 1300 + Math.random() * 500
    for (let i = 0; i < n; i++)
      this.tone(f * (1 - i * 0.04), f * 0.68, 0.26, 'sawtooth', vol, i * 0.32, {
        pan,
        verb: 0.5,
        attack: 0.04,
        filter: ['bandpass', 1700, 1.6]
      })
  },
  // a post snapping off at its foot (v: how hard it was hit, already scaled for distance): the crack
  // of a splitting trunk and a rustle of leaves, or the clang of a steel pole shearing
  snap (kind, v, pan = 0) {
    const k = clamp(v / 16, 0.08, 1),
      o = { pan }
    if (kind === 'tree' || kind === 'palm') {
      this.noise(0.07, 0.55 * k, 'highpass', 3200, 1600, 0, o)
      this.noise(0.16, 0.4 * k, 'bandpass', 1500, 500, 0.04, o)
      this.noise(0.9, 0.16 * k, 'highpass', 6000, 3500, 0.06, o)
      this.tone(120, 55, 0.3, 'sine', 0.4 * k, 0, o)
    } else {
      // a ringing pole: a fundamental and an inharmonic overtone, the heavy mast lower
      const f = kind === 'signal' ? 430 : 610
      this.tone(f, f * 0.98, 0.7, 'triangle', 0.1 * k, 0, { pan, verb: 0.5 })
      this.tone(f * 2.63, f * 2.6, 0.5, 'triangle', 0.06 * k, 0, o)
      this.noise(0.25, 0.4 * k, 'bandpass', 2600, 1100, 0, o)
      this.tone(150, 50, 0.3, 'sine', 0.45 * k, 0, o)
    }
  },
  // something long and heavy hitting the ground: a pole, or a tree onto its crown
  fall (kind, k, pan = 0) {
    if (k < 0.02) return
    const tree = kind === 'tree' || kind === 'palm',
      o = { pan }
    this.tone(90, 38, 0.5, 'sine', 0.5 * k, 0, o)
    this.noise(
      tree ? 0.8 : 0.35,
      0.3 * k,
      'lowpass',
      tree ? 2500 : 1600,
      120,
      0,
      o
    )
    if (!tree)
      this.tone(780, 770, 0.35, 'triangle', 0.05 * k, 0, { pan, verb: 0.6 })
  },
  crash () {
    this.noise(1.1, 0.7, 'lowpass', 4000, 150, 0, { verb: 0.5 })
    this.tone(190, 55, 0.7, 'sawtooth', 0.16)
    this.noise(0.4, 0.25, 'bandpass', 3200, 1800, 0.05)
    this.tone(140, 40, 0.6, 'sine', 0.5)
    // glass and loose trim skittering away
    for (let i = 0; i < 5; i++)
      this.tone(
        2500 + Math.random() * 2500,
        1800 + Math.random() * 1000,
        0.08,
        'triangle',
        0.03,
        0.12 + Math.random() * 0.5,
        { pan: Math.random() - 0.5 }
      )
  },
  beep (go) {
    this.tone(go ? 990 : 660, go ? 985 : 655, go ? 0.5 : 0.16, 'sine', 0.2)
  },
  chime () {
    this.tone(880, 880, 0.14, 'triangle', 0.1, 0, { verb: 0 })
    this.tone(1320, 1320, 0.22, 'triangle', 0.09, 0.09, { verb: 0 })
  },
  // A door's lock actuator, heard through the door: its little motor whirring up through the gears
  // for a few hundredths of a second, then the snap of the latch rod hitting its stop, the panel's
  // dull thunk round it, and a faint tick as the motor's clutch lets go. k: how loud, f: its pitch.
  actuator (delay, k, f, o) {
    const whirr = { ...o, attack: 0.005 },
      snap = { ...o, attack: 0.002 },
      stop = delay + 0.05
    this.tone(260 * f, 430 * f, 0.055, 'sawtooth', 0.08 * k, delay, {
      ...whirr,
      hold: 0.042,
      filter: ['bandpass', 1100 * f, 1.2]
    })
    this.noise(0.05, 0.045 * k, 'bandpass', 1700 * f, 2500 * f, delay, whirr)
    this.noise(0.02, 0.2 * k, 'bandpass', 3200 * f, 2000 * f, stop, snap)
    this.tone(1250 * f, 1180 * f, 0.045, 'triangle', 0.04 * k, stop, snap)
    this.tone(230 * f, 110 * f, 0.09, 'sine', 0.2 * k, stop, snap)
    this.noise(0.07, 0.12 * k, 'lowpass', 900, 150, stop, snap)
    this.noise(0.008, 0.03 * k, 'highpass', 4500, 4000, delay + 0.13, snap)
  },
  // the car unlocking as its key walks up: both doors' actuators, the far one a beat behind and
  // fainter, a light, quick "ka-chack"
  unlock (pan = 0) {
    const o = { pan, verb: 0.15 }
    this.actuator(0, 0.85, 1, o)
    this.actuator(0.025, 0.55, 1.07, o)
  },
  // and locking once the door is down, the driver inside: the same pair, lower and firmer, a
  // solid "ka-chunk"
  lock (pan = 0) {
    const o = { pan, verb: 0.15 }
    this.actuator(0, 1.05, 0.88, o)
    this.actuator(0.018, 0.7, 0.93, o)
  },
  // the e-brake: a ratchet clicking up and the rear calipers biting
  ratchet () {
    for (let i = 0; i < 3; i++)
      this.noise(0.03, 0.22, 'highpass', 2600, 2400, i * 0.045, { verb: 0 })
    this.tone(220, 180, 0.06, 'square', 0.04, 0, { verb: 0 })
    this.noise(0.18, 0.08, 'bandpass', 900, 500, 0.12, { verb: 0 })
  },
  // the thrusters' valves opening: a sharp blast of gas and a punch; and closing again
  ignite (k) {
    this.noise(0.35, 0.3 * k + 0.1, 'highpass', 500, 2600, 0, { verb: 0.4 })
    this.tone(95, 38, 0.32, 'sine', 0.35 * k + 0.1)
  },
  shutoff () {
    this.noise(0.45, 0.12, 'highpass', 3200, 900, 0, { verb: 0.4 })
  },
  // a car's two-tone horn (freqs), a short toot or a long blast, from somewhere left or right
  honk (freqs, vol, pan = 0, long = false) {
    const dur = long ? 0.7 + Math.random() * 0.4 : 0.22
    const go = (delay, d) => {
      for (const f of freqs)
        this.tone(f, f * 0.995, d, 'sawtooth', vol * 0.5, delay, {
          pan,
          verb: 0.6,
          attack: 0.008,
          hold: d - 0.05
        })
    }
    go(0, dur)
    if (!long && Math.random() < 0.6) go(0.3, 0.2) // the double toot
  },
  // a songbird's quick run of chirps
  bird (pan) {
    const f = 2600 + Math.random() * 1800,
      n = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < n; i++)
      this.tone(
        f,
        f * (1.2 + Math.random() * 0.3),
        0.07,
        'sine',
        0.018,
        i * 0.11,
        {
          pan,
          verb: 0.5,
          attack: 0.005
        }
      )
  }
}
