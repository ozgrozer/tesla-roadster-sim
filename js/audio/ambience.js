// Life in the city round the car, mixed into the SoundEngine (sound.js): now and then a bird by
// day, a horn a few streets away (once drivers honk at all), a siren wailing or yelping somewhere
// across town and drifting past, a dog barking, building work (a jackhammer, a reversing lorry's
// beeper, a steel beam's clang) by day; and the people on the pavement: a murmur of voices as the
// camera nears a crowd, and the footsteps of anyone walking close by. Everything far off is dulled
// by the distance and mostly heard in the reverb.
import { HORNS } from './shots.js'

const R = Math.random
// the first two formants (Hz) of a few vowels: as in "heed", "head", "had", "hod", "who'd", "hut"
const VOWELS = [
  [300, 2300],
  [500, 1850],
  [750, 1300],
  [550, 900],
  [330, 850],
  [650, 1200]
]
const side = () => R() * 1.6 - 0.8

export const AMBIENCE = {
  buildAmbience () {
    const { ctx, n, gain, filt, loop } = this
    this.birdT = 4
    this.farT = 9
    this.sirenT = 40 + R() * 60
    this.dogT = 20 + R() * 30
    this.workT = 25 + R() * 40
    // voices: three people talking (a voice's buzz, a man's or a woman's, through the first two
    // formants of the vowel being said, a new one every syllable, the pitch rising and falling as
    // people's does, coming and going in syllables), and a breath of the same noise through the
    // formants under them
    n.talk = gain(0)
    n.talkers = [118, 205, 160].map((f0, i) => {
      const o = this.osc('sawtooth', f0),
        f1 = filt('bandpass', 600, 6),
        f2 = filt('bandpass', 1500, 8),
        am = gain(0.2)
      o.connect(f1).connect(am)
      o.connect(f2).connect(gain(0.5)).connect(am)
      const s = loop(this.syllables)
      s.playbackRate.value = 0.8 + i * 0.27
      s.connect(gain(0.8)).connect(am.gain)
      am.connect(n.talk)
      return { o, f0, f1, f2, t: 0 }
    })
    n.murmur = gain(0)
    this.src.pink.connect(n.murmur)
    const voices = filt('lowpass', 3500, 0.5)
    n.syll = []
    for (const [f1, f2, rate] of [[580, 1650, 1.2]]) {
      const am = gain(0.2),
        src = n.murmur
      src.connect(filt('bandpass', f1, 2.5)).connect(am)
      src
        .connect(filt('bandpass', f2, 3))
        .connect(gain(0.6))
        .connect(am)
      const s = loop(this.syllables)
      s.playbackRate.value = rate
      n.syll.push(s)
      s.connect(gain(0.65)).connect(am.gain)
      am.connect(voices)
    }
    n.talk.connect(voices)
    this.lane(
      [n.murmur.gain, n.talk.gain],
      voices,
      this.world,
      voices.connect(gain(0.3)),
      this.verb
    )
    this.gateCurve = Float32Array.from([0, 0, 0, 1])
  },
  // st.peds: how many people are near the camera (0 to 1); st.steps: footsteps this frame,
  // [{ k, pan }]; st.honks: drivers may honk; st.night
  updateAmbience (st) {
    const { n, R: set } = this,
      dt = st.dt
    const talk = st.city ? (st.peds || 0) * (0.05 + 0.07 * (st.panic || 0)) : 0
    set(n.murmur.gain, talk, 0.4)
    set(n.talk.gain, talk * 0.5, 0.4)
    // (each talker a new vowel every syllable or so, and the pitch wandering round their own;
    // higher and quicker when frightened)
    if (talk > 0)
      for (const p of n.talkers)
        if ((p.t -= dt) < 0) {
          p.t = 0.12 + R() * 0.22
          const v = VOWELS[Math.floor(R() * VOWELS.length)]
          set(p.f1.frequency, v[0] * (0.92 + R() * 0.16), 0.03)
          set(p.f2.frequency, v[1] * (0.92 + R() * 0.16), 0.03)
          const up = 1 + 0.35 * (st.panic || 0)
          set(p.o.frequency, p.f0 * up * (0.85 + R() * 0.35), 0.12)
        }
    const a = st.alarm
    if (n.alarm) {
      set(n.alarm.gain, a && a.on && st.city ? a.k * 0.1 : 0, 0.05)
      if (a && a.on) {
        set(n.alarmPan.pan, a.pan, 0.05)
        set(n.alarmLP.frequency, a.lp, 0.1)
      }
    }
    if (!st.city) return
    // (a panicking crowd is louder, quicker and higher)
    set(n.syll[0].playbackRate, 1.2 + (st.panic || 0) * 0.9, 0.3)
    const sc = st.screams
    if (sc && sc.n > 0 && sc.k > 0.03)
      for (let i = 0; i < sc.n; i++)
        this.scream(
          sc.k,
          sc.pan + (R() - 0.5) * 0.3,
          sc.lp,
          i * (0.08 + R() * 0.25)
        )
    // (two footsteps a frame at most, the quiet ones left out)
    const steps = st.steps
    if (steps)
      for (let i = 0, n = 0; i < steps.length && n < 2; i++) {
        const s = steps[i]
        if (s.k < 0.15) continue
        n++
        this.play('step', s.k * 0.06, { world: true, pan: s.pan, verb: 0.15 })
      }
    if (!st.night) this.birdT -= dt
    if (st.honks) this.farT -= dt
    this.sirenT -= dt
    this.dogT -= dt * (st.night ? 1.6 : 1)
    if (!st.night) this.workT -= dt
    if (this.birdT < 0) {
      this.birdT = 2 + R() * 7
      this.bird(side())
    }
    if (this.farT < 0) {
      this.farT = 9 + R() * 18
      this.honk(
        HORNS[Math.floor(R() * HORNS.length)],
        0.1,
        side(),
        R() < 0.4,
        1600
      )
    }
    if (this.sirenT < 0) {
      this.sirenT = 70 + R() * 110
      this.siren()
    }
    if (this.dogT < 0) {
      this.dogT = 35 + R() * 70
      this.dog()
    }
    if (this.workT < 0) {
      this.workT = 45 + R() * 80
      this.work()
    }
  },
  // a car alarm going off: the classic cycle (whoops, a warble, beeps, a wail) twice through, from
  // a little horn speaker behind the grille; placed each frame where the car is (st.alarm)
  alarm () {
    if (!this.playing()) return
    const { ctx, n, gain, filt } = this
    if (!n.alarm) {
      n.alarm = gain(0)
      n.alarmO = this.osc('sine', 1000)
      n.alarmO.setPeriodicWave(this.airHornWave)
      n.alarmGate = gain(0)
      n.alarmLP = filt('lowpass', 20000, 0.5)
      n.alarmPan = ctx.createStereoPanner()
      const horn = filt('bandpass', 1800, 0.8)
      n.alarmO
        .connect(n.alarmGate)
        .connect(n.alarm)
        .connect(horn)
        .connect(n.alarmLP)
        .connect(n.alarmPan)
      this.lane(
        [n.alarm.gain],
        n.alarmPan,
        this.world,
        n.alarmPan.connect(gain(0.4)),
        this.verb
      )
    }
    const f = n.alarmO.frequency,
      g = n.alarmGate.gain,
      t0 = ctx.currentTime + 0.05
    f.cancelScheduledValues(t0)
    g.cancelScheduledValues(t0)
    let t = t0
    for (let round = 0; round < 2; round++) {
      // whoops
      for (let i = 0; i < 5; i++, t += 0.4) {
        f.setValueAtTime(600, t)
        f.linearRampToValueAtTime(1500, t + 0.38)
        g.setValueAtTime(1, t)
      }
      // a warble
      for (let i = 0; i < 12; i++, t += 0.16)
        f.setValueAtTime(i % 2 ? 1450 : 1050, t)
      // beeps
      for (let i = 0; i < 7; i++, t += 0.3) {
        f.setValueAtTime(1300, t)
        g.setValueAtTime(1, t)
        g.setValueAtTime(0, t + 0.15)
      }
      g.setValueAtTime(1, t)
      // a slow wail
      for (let i = 0; i < 2; i++, t += 1.2) {
        f.setValueAtTime(700, t)
        f.linearRampToValueAtTime(1500, t + 0.6)
        f.linearRampToValueAtTime(700, t + 1.2)
      }
    }
    g.setValueAtTime(0, t)
    this.alarmEnd = t
  },
  alarmOn () {
    return !!this.ctx && this.ctx.currentTime < (this.alarmEnd || 0)
  },
  // someone screaming in fright: a voice's buzz (a woman's or a man's) swooping up and falling
  // away, shaking with fear, through the formants of an open "aah", and the breath behind it
  scream (k, pan, lp, delay = 0) {
    if (!this.playing() || this.screams > 3) return
    const ctx = this.ctx,
      t = ctx.currentTime + delay,
      f0 = (R() < 0.6 ? 820 : 430) * (0.85 + R() * 0.3),
      dur = 0.45 + R() * 0.7
    const o = ctx.createOscillator(),
      shake = ctx.createOscillator(),
      depth = ctx.createGain(),
      g = ctx.createGain(),
      breath = ctx.createBufferSource(),
      air = ctx.createBiquadFilter()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0 * 0.8, t)
    o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.12)
    o.frequency.linearRampToValueAtTime(f0, t + dur * 0.6)
    o.frequency.linearRampToValueAtTime(f0 * 0.72, t + dur)
    shake.frequency.value = 5.5 + R() * 2.5
    depth.gain.value = f0 * 0.03
    shake.connect(depth).connect(o.frequency)
    for (const [f, q, a] of [
      [1.0, 6, 1],
      [1.55, 7, 0.55],
      [3.1, 8, 0.25]
    ]) {
      const b = ctx.createBiquadFilter(),
        m = ctx.createGain()
      b.type = 'bandpass'
      b.frequency.value = Math.max(f0 * 1.1, 850) * f
      b.Q.value = q
      m.gain.value = a
      o.connect(b).connect(m).connect(g)
    }
    breath.buffer = this.white
    air.type = 'bandpass'
    air.frequency.value = 2600
    const puff = ctx.createGain()
    puff.gain.value = 0.25
    breath.connect(air).connect(puff).connect(g)
    const peak = 0.05 * k
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.06)
    g.gain.setValueAtTime(peak * 0.8, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    this.out(g, { pan, lp, verb: 0.5 })
    for (const s of [o, shake, breath]) {
      s.start(t, s === breath ? R() : undefined)
      s.stop(t + dur + 0.05)
    }
    this.screams = (this.screams || 0) + 1
    o.onended = () => this.screams--
  },
  // where far-off sounds go: dulled, panned, mostly reverb
  far (node, pan, lp, verb = 0.8) {
    const { ctx } = this,
      b = ctx.createBiquadFilter(),
      p = ctx.createStereoPanner(),
      s = ctx.createGain()
    b.type = 'lowpass'
    b.frequency.value = lp
    s.gain.value = verb
    node.connect(b).connect(p).connect(this.world)
    p.connect(s).connect(this.verb)
    return p
  },
  // an emergency vehicle across town: a wail sweeping up and down, or a yelp, drifting from one
  // side to the other and coming nearer, then going
  siren () {
    if (!this.playing()) return
    const ctx = this.ctx,
      t = ctx.currentTime,
      dur = 10 + R() * 6,
      yelp = R() < 0.3
    const o = ctx.createOscillator(),
      lfo = ctx.createOscillator(),
      depth = ctx.createGain(),
      g = ctx.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(1000, t)
    o.frequency.linearRampToValueAtTime(980, t + dur)
    lfo.type = 'triangle'
    lfo.frequency.value = yelp ? 3.2 : 0.22
    depth.gain.value = yelp ? 380 : 430
    lfo.connect(depth).connect(o.frequency)
    const peak = 0.012 + R() * 0.01
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.4)
    g.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.6)
    g.gain.linearRampToValueAtTime(0, t + dur)
    const p = this.far(o.connect(g), 0, 1300 + R() * 600)
    const a = side()
    p.pan.setValueAtTime(a, t)
    p.pan.linearRampToValueAtTime(-a * 0.6, t + dur)
    o.start(t)
    lfo.start(t)
    o.stop(t + dur + 0.1)
    lfo.stop(t + dur + 0.1)
  },
  // a dog a few gardens away: two to four barks
  dog () {
    const pan = side(),
      n = 2 + Math.floor(R() * 3),
      f = 420 + R() * 200,
      o = { pan, lp: 1700, verb: 0.7 }
    let t = 0
    for (let i = 0; i < n; i++) {
      this.tone(f * 1.3, f * 0.8, 0.13, 'sawtooth', 0.012, t, {
        ...o,
        attack: 0.01,
        filter: ['bandpass', 1000, 1.6]
      })
      this.noise(0.1, 0.008, 'bandpass', 1400, 900, t, o)
      t += 0.25 + R() * 0.25
    }
  },
  // building work: a jackhammer's bursts, a reversing lorry's beeper, or a steel beam's clang
  work () {
    if (!this.playing()) return
    const ctx = this.ctx,
      t0 = ctx.currentTime,
      pan = side(),
      r = R()
    if (r < 0.45) {
      // the jackhammer: a burst of noise gated at its blow rate, a few bursts with breaks between
      const s = ctx.createBufferSource(),
        bp = ctx.createBiquadFilter(),
        gate = ctx.createGain(),
        g = ctx.createGain(),
        rate = ctx.createOscillator(),
        rect = ctx.createWaveShaper()
      s.buffer = this.white
      s.loop = true
      bp.type = 'bandpass'
      bp.frequency.value = 1500
      bp.Q.value = 0.9
      rect.curve = this.gateCurve
      rate.type = 'square'
      rate.frequency.value = 21 + R() * 5
      gate.gain.value = 0
      rate.connect(rect).connect(gate.gain)
      g.gain.value = 0
      let t = t0
      for (let i = 0; i < 2 + Math.floor(R() * 3); i++) {
        const d = 0.8 + R() * 1.8
        g.gain.setTargetAtTime(0.03, t, 0.02)
        g.gain.setTargetAtTime(0, t + d, 0.03)
        t += d + 0.6 + R() * 1.2
      }
      this.far(s.connect(bp).connect(gate).connect(g), pan, 2200, 0.6)
      s.start(t0)
      rate.start(t0)
      s.stop(t + 0.5)
      rate.stop(t + 0.5)
    } else if (r < 0.75) {
      const o = { pan, lp: 2500, verb: 0.7, attack: 0.01, hold: 0.38 }
      for (let i = 0; i < 6; i++)
        this.tone(1100, 1100, 0.42, 'sine', 0.008, i * 0.85, o)
    } else
      this.play('pole', 0.06, {
        world: true,
        pan,
        rate: 0.55,
        lp: 2500,
        verb: 0.8
      })
  }
}
