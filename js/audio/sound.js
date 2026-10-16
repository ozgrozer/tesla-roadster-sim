// Sound, synthesised with Web Audio (nothing to download): the drive units' whine, tyres, wind,
// thrusters, the fan and the horn; the city round the car (passing traffic with its doppler, honks, a
// street's hum, birds) and the echo between its buildings. One-shots are in shots.js.
import { ONE_SHOTS } from './shots.js'
import { clamp } from '../sim/constants.js'

// a few stock two-tone horns (Hz): traffic picks one per car
export const HORNS = [
  [415, 520],
  [370, 466],
  [440, 554],
  [330, 415],
  [494, 587]
]

export class SoundEngine {
  constructor () {
    this.ctx = null
    this.enabled = false
    this.userMuted = false
    this.hornOn = false
    this.thr = 0 // last frame's thrust, for the burst as the valves open
    this.birdT = 4
    this.farT = 9
  }
  ensure () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return true
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    const ctx = (this.ctx = new AC())
    const sr = ctx.sampleRate
    this.white = ctx.createBuffer(1, sr * 2, sr)
    this.brown = ctx.createBuffer(1, sr * 2, sr)
    this.pink = ctx.createBuffer(1, sr * 2, sr)
    const d = this.white.getChannelData(0),
      e = this.brown.getChannelData(0),
      p = this.pink.getChannelData(0)
    let last = 0,
      b0 = 0,
      b1 = 0,
      b2 = 0
    for (let i = 0; i < d.length; i++) {
      const x = Math.random() * 2 - 1
      d[i] = x
      last = (last + 0.02 * x) / 1.02
      e[i] = last * 3.5
      b0 = 0.99765 * b0 + x * 0.099
      b1 = 0.963 * b1 + x * 0.2965
      b2 = 0.57 * b2 + x * 1.0526
      p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2
    }
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 8
    comp.ratio.value = 5
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(comp)
    comp.connect(ctx.destination)
    const n = (this.n = {})
    const loop = buf => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.start(0, Math.random() * 1.5)
      return s
    }
    const gain = (v = 0) => {
      const g = ctx.createGain()
      g.gain.value = v
      return g
    }
    const filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter()
      b.type = type
      b.frequency.value = f
      b.Q.value = q
      return b
    }
    const osc = (type, f) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      o.start()
      return o
    }
    const pan = () => ctx.createStereoPanner()
    this.gain = gain
    this.filt = filt

    // the echo off the buildings: a short synthetic room the one-shots, horns and traffic send into
    this.verb = gain(1)
    const conv = ctx.createConvolver()
    conv.buffer = this.room(1.7)
    n.verbOut = gain(0.45)
    this.verb.connect(conv).connect(n.verbOut).connect(this.master)

    // drive units: the primary whine, a slow beat against a detuned copy, the gear mesh a fifth up, the
    // motor's body an octave down, a growl under full power and the inverter's thin tone on top
    n.motor = gain(0)
    n.motorLP = filt('lowpass', 3000, 0.5)
    n.motor.connect(n.motorLP).connect(this.master)
    n.w1 = osc('sine', 200)
    n.w1.connect(gain(0.5)).connect(n.motor)
    n.w1b = osc('sine', 200)
    n.w1b.connect(gain(0.22)).connect(n.motor)
    n.w2 = osc('sine', 300)
    n.w2g = gain(0.14)
    n.w2.connect(n.w2g).connect(n.motor)
    n.w3 = osc('triangle', 100)
    n.w3.connect(gain(0.24)).connect(n.motor)
    n.growl = gain(0)
    n.growlLP = filt('lowpass', 500, 4)
    n.g1 = osc('sawtooth', 50)
    n.g1.connect(n.growlLP).connect(n.growl).connect(this.master)
    n.inv = gain(0)
    n.m3 = osc('sine', 3000)
    n.m3.connect(n.inv).connect(this.master)
    // tyres: roar off the road surface, a hiss of tread at speed, and the low scrub of a slide
    n.road = gain(0)
    n.roadLP = filt('lowpass', 300, 0.5)
    loop(this.brown).connect(n.roadLP).connect(n.road).connect(this.master)
    n.tread = gain(0)
    n.treadBP = filt('bandpass', 900, 0.6)
    loop(this.pink).connect(n.treadBP).connect(n.tread).connect(this.master)
    n.scrub = gain(0)
    loop(this.brown)
      .connect(filt('bandpass', 260, 1.2))
      .connect(n.scrub)
      .connect(this.master)
    // wind, with slow gusts
    n.wind = gain(0)
    n.windBP = filt('bandpass', 700, 0.5)
    const gust = gain(1)
    osc('sine', 0.21).connect(gain(0.22)).connect(gust.gain)
    osc('sine', 0.53).connect(gain(0.12)).connect(gust.gain)
    loop(this.white).connect(n.windBP).connect(n.wind).connect(gust)
    gust.connect(this.master)
    // tyre squeal: two narrow noise bands with a faint tone, only once a tyre is past its grip limit;
    // two slow wobbles chatter its pitch the way a sliding tyre does
    n.skid = gain(0)
    n.skidLo = filt('bandpass', 1250, 14)
    n.skidHi = filt('bandpass', 2450, 10)
    const squeal = loop(this.white)
    squeal.connect(n.skidLo).connect(n.skid)
    squeal.connect(n.skidHi).connect(gain(0.6)).connect(n.skid)
    n.tone = osc('sine', 1150)
    n.toneG = gain(0)
    n.tone.connect(n.toneG).connect(n.skid)
    for (const [f, a] of [
      [6.7, 45],
      [2.9, 70]
    ]) {
      const w = gain(a)
      osc('sine', f).connect(w)
      w.connect(n.skidLo.frequency)
      w.connect(n.skidHi.frequency)
      w.connect(n.tone.frequency)
    }
    n.skid.connect(this.master)
    this.squeal = 0
    // cold-gas thrusters: supersonic hiss plus low roar
    n.hiss = gain(0)
    n.hissHP = filt('highpass', 1600, 0.6)
    loop(this.white).connect(n.hissHP).connect(n.hiss).connect(this.master)
    n.roar = gain(0)
    n.roarLP = filt('lowpass', 420, 0.7)
    loop(this.brown).connect(n.roarLP).connect(n.roar).connect(this.master)
    // suction fan: turbine whir
    n.fan = gain(0)
    n.fanO = osc('sawtooth', 130)
    n.fanBP = filt('bandpass', 260, 4)
    n.fanO.connect(n.fanBP).connect(n.fan)
    loop(this.white)
      .connect(filt('bandpass', 900, 1.2))
      .connect(gain(0.5))
      .connect(n.fan)
    n.fan.connect(this.master)
    // the horn: two blaring tones a major third apart, clipped hard like a diaphragm horn
    n.horn = gain(0)
    const clip = ctx.createWaveShaper()
    clip.curve = Float32Array.from({ length: 256 }, (_, i) =>
      Math.tanh(((i / 255) * 2 - 1) * 3)
    )
    for (const f of HORNS[0])
      osc('sawtooth', f).connect(gain(0.5)).connect(clip)
    const bite = filt('peaking', 2600, 2)
    bite.gain.value = 6
    clip.connect(filt('bandpass', 1100, 0.6)).connect(bite).connect(n.horn)
    n.horn.connect(this.master)
    n.horn.connect(gain(0.5)).connect(this.verb)
    // the street: a far-off hum of traffic in the city, a breath of wind over the desert test site
    n.city = gain(0)
    loop(this.brown).connect(filt('lowpass', 240, 0.5)).connect(n.city)
    loop(this.pink)
      .connect(filt('bandpass', 650, 0.4))
      .connect(gain(0.3))
      .connect(n.city)
    n.city.connect(this.master)
    n.desert = gain(0)
    loop(this.white).connect(filt('bandpass', 380, 0.3)).connect(n.desert)
    n.desert.connect(gust)
    // the two nearest cars in traffic: an engine's firing note and tyre roar, panned, with doppler
    n.cars = [0, 1].map(() => {
      const g = gain(0),
        p = pan()
      const eng = osc('sawtooth', 50),
        sub = osc('triangle', 25),
        lp = filt('lowpass', 400, 1.5),
        tg = gain(0)
      eng.connect(lp)
      sub.connect(gain(0.8)).connect(lp)
      lp.connect(gain(0.5)).connect(g)
      loop(this.brown).connect(filt('lowpass', 650, 0.5)).connect(tg).connect(g)
      g.connect(p).connect(this.master)
      p.connect(gain(0.35)).connect(this.verb)
      return { g, p, eng, sub, lp, tg }
    })
    return true
  }
  // a stereo impulse response: a few early reflections off the street's walls, then a dark decay
  room (sec) {
    const sr = this.ctx.sampleRate,
      len = Math.floor(sr * sec)
    const b = this.ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        lp += 0.35 * (Math.random() * 2 - 1 - lp)
        d[i] = lp * Math.exp(-i / (sr * 0.38)) * 0.6
      }
      for (const ms of [11, 19, 31, 47, 64]) {
        const i = Math.floor(((ms + ch * 3) / 1000) * sr)
        d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-ms / 60)
      }
    }
    return b
  }
  setEnabled (on) {
    this.enabled = on && this.ensure()
    if (this.ctx)
      this.master.gain.setTargetAtTime(
        this.enabled ? 0.8 : 0,
        this.ctx.currentTime,
        0.08
      )
  }
  // hold H: the horn sounds for as long as it is held
  horn (on) {
    this.hornOn = on
    if (!this.ctx || !this.enabled) return
    this.n.horn.gain.setTargetAtTime(
      on ? 0.32 : 0,
      this.ctx.currentTime,
      on ? 0.006 : 0.03
    )
  }
  update (st) {
    if (!this.ctx || !this.enabled) return
    const n = this.n,
      now = this.ctx.currentTime,
      R = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc)
    R(this.master.gain, st.volume, 0.15)
    const ps = st.pitch,
      u = st.wheelSpeed
    // the drive units: pitch with road speed, louder under power (and under regen, more gear whine)
    const f = (34 + u * 21) * ps
    R(n.w1.frequency, f, 0.04)
    R(n.w1b.frequency, f * 1.006, 0.04)
    R(n.w2.frequency, f * 1.53, 0.04)
    R(n.w3.frequency, f * 0.5, 0.04)
    R(n.g1.frequency, f * 0.25, 0.04)
    R(n.m3.frequency, (2600 + f * 2.2) * ps)
    const load =
      st.throttle > 0 ? 0.4 + 0.6 * st.throttle : st.regen ? 0.32 : 0.05
    const presence = Math.min(1, u / 3)
    R(n.motor.gain, (presence * load * 0.26) / (1 + u / 70))
    R(n.w2g.gain, st.regen ? 0.32 : 0.14)
    R(n.growl.gain, presence * st.throttle * clamp(1 - u / 70, 0.3, 1) * 0.05)
    R(n.growlLP.frequency, 260 + u * 22 + st.throttle * 380)
    R(n.inv.gain, presence * load * 0.008)
    R(n.motorLP.frequency, 1600 + u * 55)
    const gr = st.grounded
    R(n.road.gain, gr * Math.min(0.34, u / 65))
    R(n.roadLP.frequency, 160 + u * 16)
    R(n.tread.gain, gr * Math.min(0.07, (u / 75) ** 2 * 0.09))
    R(n.treadBP.frequency, 650 + u * 9)
    R(n.wind.gain, Math.min(0.42, (st.airspeed / 68) ** 2 * 0.5))
    R(n.windBP.frequency, (450 + st.airspeed * 14) * ps)
    // smooth attack and a slower release so a tyre hovering at the limit doesn't flutter
    const sq = clamp((st.skid - 0.12) / 0.6, 0, 1)
    const level = sq * sq * (3 - 2 * sq)
    R(n.skid.gain, level * 3.2, level > this.squeal ? 0.1 : 0.25)
    this.squeal = level
    R(n.toneG.gain, level * 0.015, 0.15)
    R(n.skidLo.frequency, (1150 + 250 * st.skid) * ps, 0.2)
    R(n.skidHi.frequency, (2300 + 300 * st.skid) * ps, 0.2)
    R(n.tone.frequency, (1100 + 200 * st.skid) * ps, 0.3)
    R(n.scrub.gain, gr * st.skid * Math.min(1, u / 6) * 0.35, 0.12)
    const thr = st.main * 0.55 + st.lift * 0.6 + st.side * 0.2
    R(n.hiss.gain, Math.min(0.7, thr * 0.55), 0.03)
    R(n.hissHP.frequency, 1300 * ps + 400 * thr)
    R(n.roar.gain, Math.min(0.8, (st.main + st.lift) * 0.45), 0.04)
    R(n.roarLP.frequency, (300 + 250 * thr) * ps)
    // the valves opening, and slamming shut
    if (thr > 0.25 && this.thr < 0.06) this.ignite(thr)
    else if (thr < 0.04 && this.thr > 0.3) this.shutoff()
    this.thr = thr
    R(n.fan.gain, st.suction * 0.07, 0.2)
    R(n.fanO.frequency, (60 + st.suction * 120) * ps, 0.3)
    R(n.fanBP.frequency, (120 + st.suction * 260) * ps, 0.3)
    // the street, and the echo off it: close walls in the city, open desert at the test site
    R(n.city.gain, st.city ? 0.05 : 0, 0.5)
    R(n.desert.gain, st.city ? 0 : 0.025, 0.5)
    R(n.verbOut.gain, st.city ? 0.45 : 0.15, 0.5)
    this.traffic(st.cars || [], ps, R)
    if (st.city) this.ambience(st.dt, st.honks)
  }
  // cars: [{ d, pan, doppler, v, big }], nearest first
  traffic (cars, ps, R) {
    this.n.cars.forEach((voice, i) => {
      const c = cars[i]
      if (!c) return R(voice.g.gain, 0, 0.25)
      const near = clamp(1.4 / (1 + c.d / 6), 0, 1)
      R(voice.g.gain, near * (0.045 + Math.min(0.1, c.v / 110)), 0.12)
      // firing frequency: a diesel bus burbles low, a car's four-cylinder sits higher
      const fire = (c.big ? 24 + c.v * 1.2 : 34 + c.v * 2.4) * c.doppler * ps
      R(voice.eng.frequency, fire, 0.08)
      R(voice.sub.frequency, fire / 2, 0.08)
      R(voice.lp.frequency, 220 + c.v * 14, 0.1)
      R(voice.tg.gain, Math.min(1.2, c.v / 10), 0.1)
      R(voice.p.pan, c.pan, 0.08)
    })
  }
  // now and then a bird, or (once drivers honk at all: honks) a horn a few streets away
  ambience (dt, honks) {
    this.birdT -= dt
    if (honks) this.farT -= dt
    if (this.birdT < 0) {
      this.birdT = 2 + Math.random() * 7
      this.bird(Math.random() * 1.6 - 0.8)
    }
    if (this.farT < 0) {
      this.farT = 9 + Math.random() * 18
      this.honk(
        HORNS[Math.floor(Math.random() * HORNS.length)],
        0.12,
        Math.random() * 1.6 - 0.8,
        Math.random() < 0.4
      )
    }
  }
}
Object.assign(SoundEngine.prototype, ONE_SHOTS)
