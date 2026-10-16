// Sound, synthesised with Web Audio (nothing to download): motor whine, tyres, wind, thrusters, fan, one-shots.
import { clamp } from '../sim/constants.js'

export class SoundEngine {
  constructor () {
    this.ctx = null
    this.enabled = false
    this.userMuted = false
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
    const d = this.white.getChannelData(0),
      e = this.brown.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const x = Math.random() * 2 - 1
      d[i] = x
      last = (last + 0.02 * x) / 1.02
      e[i] = last * 3.5
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
    this.gain = gain
    this.filt = filt
    // electric drive units: motor whine plus a high inverter tone
    n.motor = gain(0)
    n.motorLP = filt('lowpass', 2000, 0.8)
    n.motor.connect(n.motorLP).connect(this.master)
    n.m1 = osc('sawtooth', 80)
    n.m1.connect(gain(0.11)).connect(n.motor)
    n.m2 = osc('triangle', 160)
    n.m2.connect(gain(0.08)).connect(n.motor)
    n.inv = gain(0)
    n.m3 = osc('sine', 900)
    n.m3.connect(n.inv).connect(this.master)
    // tyre roll and wind
    n.road = gain(0)
    n.roadLP = filt('lowpass', 300, 0.5)
    loop(this.brown)
      .connect(n.roadLP)
      .connect(n.road)
      .connect(this.master)
    n.wind = gain(0)
    n.windBP = filt('bandpass', 700, 0.5)
    loop(this.white)
      .connect(n.windBP)
      .connect(n.wind)
      .connect(this.master)
    // tyre squeal: two narrow noise bands with a faint tone, only once a tyre is past its grip limit
    n.skid = gain(0)
    n.skidLo = filt('bandpass', 1250, 14)
    n.skidHi = filt('bandpass', 2450, 10)
    const squeal = loop(this.white)
    squeal.connect(n.skidLo).connect(n.skid)
    squeal
      .connect(n.skidHi)
      .connect(gain(0.6))
      .connect(n.skid)
    n.tone = osc('sine', 1150)
    n.toneG = gain(0)
    n.tone.connect(n.toneG).connect(n.skid)
    n.skid.connect(this.master)
    this.squeal = 0
    // cold-gas thrusters: supersonic hiss plus low roar
    n.hiss = gain(0)
    n.hissHP = filt('highpass', 1600, 0.6)
    loop(this.white)
      .connect(n.hissHP)
      .connect(n.hiss)
      .connect(this.master)
    n.roar = gain(0)
    n.roarLP = filt('lowpass', 420, 0.7)
    loop(this.brown)
      .connect(n.roarLP)
      .connect(n.roar)
      .connect(this.master)
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
    return true
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
  update (st) {
    if (!this.ctx || !this.enabled) return
    const n = this.n,
      now = this.ctx.currentTime,
      R = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc)
    R(this.master.gain, st.volume, 0.15)
    const ps = st.pitch,
      u = st.wheelSpeed
    const f = (45 + u * 15) * ps
    R(n.m1.frequency, f)
    R(n.m2.frequency, f * 2.02)
    R(n.m3.frequency, f * 7.3 + 320 * ps)
    const load =
      st.throttle > 0 ? 0.35 + 0.65 * st.throttle : st.regen ? 0.32 : 0.06
    const presence = Math.min(1, u / 4)
    R(n.motor.gain, presence * load * 0.9)
    R(n.inv.gain, presence * load * 0.018)
    R(n.motorLP.frequency, 900 + u * 40 + st.throttle * 1500)
    R(n.road.gain, st.grounded * Math.min(0.32, u / 70))
    R(n.roadLP.frequency, 180 + u * 18)
    R(n.wind.gain, Math.min(0.4, (st.airspeed / 70) ** 2 * 0.5))
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
    const thr = st.main * 0.55 + st.lift * 0.6 + st.side * 0.2
    R(n.hiss.gain, Math.min(0.7, thr * 0.55), 0.03)
    R(n.hissHP.frequency, 1300 * ps + 400 * thr)
    R(n.roar.gain, Math.min(0.8, (st.main + st.lift) * 0.45), 0.04)
    R(n.roarLP.frequency, (300 + 250 * thr) * ps)
    R(n.fan.gain, st.suction * 0.07, 0.2)
    R(n.fanO.frequency, (60 + st.suction * 120) * ps, 0.3)
    R(n.fanBP.frequency, (120 + st.suction * 260) * ps, 0.3)
  }
  // ---- one-shots ----
  tone (f0, f1, dur, type, vol, delay = 0) {
    if (!this.ctx || !this.enabled) return
    const t = this.ctx.currentTime + delay,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  noise (dur, vol, type, f0, f1, delay = 0) {
    if (!this.ctx || !this.enabled) return
    const t = this.ctx.currentTime + delay,
      s = this.ctx.createBufferSource(),
      b = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain()
    s.buffer = this.white
    b.type = type
    b.frequency.setValueAtTime(f0, t)
    b.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(b)
      .connect(g)
      .connect(this.master)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  }
  thump (g) {
    const k = clamp(g / 3, 0.3, 1.4)
    this.tone(120, 36, 0.5, 'sine', 0.55 * k)
    this.noise(0.35, 0.35 * k, 'lowpass', 700, 90)
  }
  crash () {
    this.noise(1.1, 0.7, 'lowpass', 4000, 150)
    this.tone(190, 55, 0.7, 'sawtooth', 0.16)
    this.noise(0.4, 0.25, 'bandpass', 3200, 1800, 0.05)
    this.tone(140, 40, 0.6, 'sine', 0.5)
  }
  beep (go) {
    this.tone(go ? 990 : 660, go ? 985 : 655, go ? 0.5 : 0.16, 'sine', 0.2)
  }
  chime () {
    this.tone(880, 880, 0.14, 'triangle', 0.1)
    this.tone(1320, 1320, 0.22, 'triangle', 0.09, 0.09)
  }
  ratchet () {
    for (let i = 0; i < 3; i++)
      this.noise(0.03, 0.22, 'highpass', 2600, 2400, i * 0.045)
    this.tone(220, 180, 0.06, 'square', 0.04)
  }
}
