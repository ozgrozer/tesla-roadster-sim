// One-shot sounds, mixed into the SoundEngine (sound.js): each can sit anywhere left to right
// (pan), dulled by distance or a building in the way (lp), and send some of itself into the reverb
// (verb). By default they are out in the world; o.to 'car' puts one at the Roadster, 'ui' straight
// into the mix (the game's own chimes, never muffled or echoed).
import { clamp } from '../sim/constants.js'

const R = Math.random

// a few stock two-tone horns (Hz): traffic picks one per car
export const HORNS = [
  [415, 520],
  [370, 466],
  [440, 554],
  [330, 415],
  [494, 587]
]
// a bus's air horn: three bells
export const AIR_HORN = [220, 277, 330]

export const ONE_SHOTS = {
  // where a one-shot goes: panned into the mix, with a share of it into the reverb
  out (g, o) {
    const ctx = this.ctx
    if (o.to === 'ui') return g.connect(this.mixIn)
    let node = g
    if (o.lp && o.lp < 19000) {
      const b = ctx.createBiquadFilter()
      b.type = 'lowpass'
      b.frequency.value = o.lp
      b.Q.value = 0.5
      node = node.connect(b)
    }
    if (o.pan) {
      const p = ctx.createStereoPanner()
      p.pan.value = clamp(o.pan, -1, 1)
      node = node.connect(p)
    }
    node.connect(o.to === 'car' ? this.carBus : this.world)
    const v = o.verb ?? 0.25
    if (v > 0) {
      const s = ctx.createGain()
      s.gain.value = v
      node.connect(s).connect(this.verb)
    }
  },
  // o.filter ([type, Hz, Q]) shapes a buzzy wave, the way a housing muffles what is inside it;
  // o.wave: a periodic wave in place of the stock type
  tone (f0, f1, dur, type, vol, delay = 0, o = {}) {
    if (vol < 0.002 || !this.playing()) return
    const t = this.ctx.currentTime + delay,
      osc = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    if (o.wave) osc.setPeriodicWave(o.wave)
    else osc.type = type
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
    if (vol < 0.002 || !this.playing()) return
    const t = this.ctx.currentTime + delay,
      s = this.ctx.createBufferSource(),
      b = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain()
    s.buffer = o.brown ? this.brown : this.white
    b.type = type
    b.frequency.setValueAtTime(f0, t)
    b.frequency.exponentialRampToValueAtTime(f1, t + dur)
    if (o.q) b.Q.value = o.q
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.01))
    if (o.hold) g.gain.setValueAtTime(vol, t + o.hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(b).connect(g)
    this.out(g, o)
    s.start(t, R())
    s.stop(t + dur + 0.05)
  },
  // something flashing past close by (v: how fast, pan: which side, d: how close): the air torn by
  // a post or a tree, or by a car or a bus, a longer, lower rush; the band falls as it goes by,
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
  // a bus pulling up: the air brakes' "pssht" (a sharp release, then the hiss dying away), from
  // somewhere left or right
  airbrake (vol, pan = 0, lp = 0) {
    const o = { pan, lp, verb: 0.35 }
    this.noise(0.04, 0.35 * vol, 'highpass', 2500, 2500, 0, o)
    this.noise(1.1, 0.45 * vol, 'bandpass', 5200, 3000, 0.02, {
      ...o,
      attack: 0.02,
      q: 0.6
    })
    this.noise(0.5, 0.15 * vol, 'lowpass', 900, 300, 0.02, o)
  },
  // brakes squealing as a car or bus slows to a stop: a thin, wavering tone, the pads ringing
  brakeSqueal (vol, pan = 0, lp = 0, big = false) {
    if (vol < 0.01 || !this.playing()) return
    const ctx = this.ctx,
      t = ctx.currentTime,
      dur = 0.5 + R() * 0.7,
      f = (big ? 2600 : 3400) * (0.9 + R() * 0.25)
    const o = ctx.createOscillator(),
      lfo = ctx.createOscillator(),
      depth = ctx.createGain(),
      g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 0.97, t + dur)
    lfo.frequency.value = 5 + R() * 4
    depth.gain.value = f * 0.008
    lfo.connect(depth).connect(o.frequency)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.03 * vol, t + 0.12)
    g.gain.setValueAtTime(0.03 * vol, t + dur - 0.1)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    this.out(g, { pan, lp, verb: 0.35 })
    o.start(t)
    lfo.start(t)
    o.stop(t + dur + 0.05)
    lfo.stop(t + dur + 0.05)
  },
  // Optimus's footfall: a hard sole on the road, heavier than a person's, and the whir of the leg's
  // actuators driving the stride
  robotStep (k, pan = 0) {
    this.play('step', 0.12 * k, { world: true, pan, rate: 0.72, verb: 0.2 })
    this.play('thud', 0.05 * k, { world: true, pan, rate: 1.4, verb: 0.1 })
    this.tone(320, 520, 0.16, 'sawtooth', 0.006 * k, 0.02, {
      pan,
      verb: 0.1,
      attack: 0.04,
      filter: ['bandpass', 900, 2]
    })
  },
  // a gull's cry, a few falling "kyow"s, off over the water
  gull (vol, pan) {
    const n = 2 + Math.floor(R() * 3),
      f = 1300 + R() * 500
    for (let i = 0; i < n; i++)
      this.tone(f * (1 - i * 0.04), f * 0.68, 0.26, 'sawtooth', vol, i * 0.32, {
        pan,
        verb: 0.5,
        attack: 0.04,
        filter: ['bandpass', 1700, 1.6]
      })
  },
  beep (go) {
    this.tone(
      go ? 990 : 660,
      go ? 985 : 655,
      go ? 0.5 : 0.16,
      'sine',
      0.16,
      0,
      { to: 'ui' }
    )
  },
  chime () {
    this.tone(880, 880, 0.14, 'triangle', 0.07, 0, { to: 'ui' })
    this.tone(1320, 1320, 0.22, 'triangle', 0.06, 0.09, { to: 'ui' })
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
    const o = { to: 'car', verb: 0 }
    for (let i = 0; i < 3; i++)
      this.noise(0.03, 0.18, 'highpass', 2600, 2400, i * 0.045, o)
    this.tone(220, 180, 0.06, 'square', 0.03, 0, o)
    this.noise(0.18, 0.07, 'bandpass', 900, 500, 0.12, o)
  },
  // the thrusters' valves opening: a sharp blast of gas and a punch; and closing again
  ignite (k) {
    this.noise(0.35, 0.3 * k + 0.1, 'highpass', 500, 2600, 0, {
      to: 'car',
      verb: 0.4
    })
    this.tone(95, 38, 0.32, 'sine', 0.35 * k + 0.1, 0, { to: 'car' })
  },
  shutoff () {
    this.noise(0.45, 0.12, 'highpass', 3200, 900, 0, { to: 'car', verb: 0.4 })
  },
  // a car's horn (freqs: its pair of disc horns' pitches; a bus's air horn has three, lower), from
  // somewhere left or right, lp dulling it with distance and walls in the way. A tap, a double
  // toot, or (long) leaning on it, sometimes after a short stab first. Each note blips sharp as the
  // diaphragm starts and sags a little as it holds.
  honk (freqs, vol, pan = 0, long = false, lp = 0) {
    const bus = freqs.length > 2
    const notes = long
      ? R() < 0.35
        ? [
            [0, 0.3],
            [0.42, 1 + R() * 0.9]
          ]
        : [[0, 0.8 + R() * 1.3]]
      : R() < 0.55
        ? [
            [0, 0.11 + R() * 0.04],
            [0.2 + R() * 0.05, 0.13 + R() * 0.05]
          ]
        : [[0, 0.15 + R() * 0.15]]
    const o = { pan, lp, verb: 0.5 }
    for (const [t0, d] of notes)
      for (const f of freqs)
        this.hornNote(f, d, (vol * 0.6) / freqs.length, t0, bus, o)
  },
  hornNote (f, dur, vol, delay, bus, o) {
    if (vol < 0.002 || !this.playing()) return
    const ctx = this.ctx,
      t = ctx.currentTime + delay,
      osc = ctx.createOscillator(),
      g = ctx.createGain(),
      bite = ctx.createBiquadFilter()
    osc.setPeriodicWave(bus ? this.airHornWave : this.hornWave)
    osc.frequency.setValueAtTime(f * 1.025, t)
    osc.frequency.setTargetAtTime(f, t, 0.012)
    osc.frequency.setTargetAtTime(f * 0.985, t + 0.1, dur)
    const a = bus ? 0.035 : 0.006
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + a)
    g.gain.setValueAtTime(vol, t + dur)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
    bite.type = 'peaking'
    bite.frequency.value = bus ? 1800 : 2900
    bite.Q.value = 1.1
    bite.gain.value = 7
    osc.connect(bite).connect(g)
    this.out(g, o)
    osc.start(t)
    osc.stop(t + dur + 0.08)
  },
  // a bird: a sparrow's run of chirps, a blackbird's warbled phrase, or a pigeon cooing
  bird (pan) {
    const o = { pan, verb: 0.5, attack: 0.005 },
      r = R()
    if (r < 0.5) {
      const f = 2600 + R() * 1800,
        n = 2 + Math.floor(R() * 4)
      for (let i = 0; i < n; i++)
        this.tone(f, f * (1.2 + R() * 0.3), 0.07, 'sine', 0.014, i * 0.11, o)
    } else if (r < 0.8) {
      let t = 0
      const n = 4 + Math.floor(R() * 5)
      for (let i = 0; i < n; i++) {
        const f = 1800 + R() * 2200,
          d = 0.06 + R() * 0.16
        this.tone(f, f * (0.75 + R() * 0.6), d, 'sine', 0.011, t, {
          ...o,
          attack: 0.015
        })
        t += d + 0.02 + R() * 0.06
      }
    } else {
      const f = 480 + R() * 80
      for (let i = 0; i < 3; i++)
        this.tone(f * 0.92, f, i === 1 ? 0.5 : 0.28, 'sine', 0.02, i * 0.45, {
          ...o,
          attack: 0.08,
          verb: 0.3,
          filter: ['lowpass', 900, 0.7]
        })
    }
  }
}
