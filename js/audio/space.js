// Where the sound is heard, mixed into the SoundEngine (sound.js): the Roadster's own sound placed
// where the car is from the camera (late by the time the sound takes to get there, so a car racing
// past a far camera has its doppler, panned, duller the further off), everything outside heard
// through the canopy from the driver's seat, and the space round it all: a reverb that is the
// street canyon's long, dense one between tall buildings (an impulse response synthesised at
// start-up), thin out in the open (the beach, the test site) where only a few far reflections come
// back, and the slapback of the car's sound off the walls either side, each echo as late as the
// round trip to its wall.
import { clamp } from '../sim/constants.js'
import { rng, later } from './buffers.js'

// A stereo impulse response: a decaying noise tail in three bands, each dying at its own rate (the
// lows linger, the highs go first), a few early reflections, and flutter (a sound bouncing between
// the two faces of a street) on top.
function impulse (ctx, o) {
  const sr = ctx.sampleRate,
    len = Math.floor(sr * o.sec),
    chans = o.mono ? 1 : 2,
    b = ctx.createBuffer(chans, len, sr),
    R = rng(o.seed)
  for (let ch = 0; ch < chans; ch++) {
    const d = b.getChannelData(ch)
    let lo = 0,
      mid = 0,
      eLo = 3.2,
      eMid = 1,
      eHi = 0.7
    // (each band's level falls by a fixed factor a sample: to -60 dB over its reverb time)
    const kLo = Math.exp(-6.9 / (o.rtLo * sr)),
      kMid = Math.exp(-6.9 / (o.rtMid * sr)),
      kHi = Math.exp(-6.9 / (o.rtHi * sr))
    const pre = Math.floor(o.pre * sr),
      swell = o.swell * sr
    for (let i = pre; i < len; i++) {
      const x = R() * 2 - 1
      lo += 0.05 * (x - lo)
      mid += 0.35 * (x - mid)
      const e = lo * eLo + (mid - lo) * eMid + (x - mid) * eHi
      eLo *= kLo
      eMid *= kMid
      eHi *= kHi
      d[i] = e * Math.min(1, (i - pre) / swell) * o.tail
    }
    // early reflections: [ms, gain, side (-1 left, 1 right, 0 both)]
    for (const [ms, g, side] of o.early) {
      const i = Math.floor((ms / 1000) * sr) + (ch ? 7 : 0)
      const k = side === 0 ? 1 : side < 0 === (ch === 0) ? 1 : 0.35
      for (let j = 0; j < 40 && i + j < len; j++)
        d[i + j] += (R() * 2 - 1) * g * k * Math.exp(-j / 8)
    }
    // flutter between the faces of the street, alternating sides
    if (o.flutter)
      for (let n = 1; n <= o.flutter.n; n++) {
        const i = Math.floor(((o.flutter.ms * n) / 1000) * sr)
        const k = (n % 2 === ch ? 1 : 0.5) * Math.pow(o.flutter.decay, n)
        for (let j = 0; j < 90 && i + j < len; j++)
          d[i + j] += (R() * 2 - 1) * k * Math.exp(-j / 20)
      }
  }
  return b
}
const CANYON = {
  mono: true,
  sec: 1.4,
  pre: 0.012,
  rtLo: 2.1,
  rtMid: 1.5,
  rtHi: 0.6,
  swell: 0.06,
  tail: 0.35,
  early: [
    [4, 0.6, 0],
    [38, 0.45, -1],
    [61, 0.4, 1],
    [97, 0.3, -1],
    [133, 0.25, 1]
  ],
  flutter: { ms: 118, n: 9, decay: 0.72 },
  seed: 21
}
// out in the open: only a few far-off reflections, late and dull (a building across a park, the
// promenade's wall), [s, gain, pan]
const FAR = [
  [0.19, 0.22, -0.6],
  [0.27, 0.16, 0.7],
  [0.43, 0.1, -0.2]
]

export const SPACE = {
  buildSpace () {
    const { ctx, n, gain, filt } = this
    // the master chain: a rumble filter, then a limiter that holds the peaks under full scale
    this.mixIn = gain(1)
    this.master = gain(0)
    const hp = filt('highpass', 24, 0.7)
    const lim = (this.limiter = ctx.createDynamicsCompressor())
    lim.threshold.value = -9
    lim.knee.value = 6
    lim.ratio.value = 12
    lim.attack.value = 0.002
    lim.release.value = 0.18
    this.mixIn.connect(this.master).connect(hp).connect(lim)
    lim.connect(ctx.destination)
    // outside the car: the world, the reverb and the echoes. From the driver's seat they are heard
    // through the canopy, muffled and quieter.
    // (a lowpass wide open still costs its work: each is switched out while it is wide open)
    this.outside = gain(1)
    this.cabin = filt('lowpass', 20000, 0.5)
    this.cabin.connect(this.mixIn)
    this.cabinSw = this.bypass(this.outside, this.cabin, this.mixIn)
    // (the world's level against the car's: the traffic, the bed, everything out there)
    this.world = gain(1.6)
    this.world.connect(this.outside)
    // the Roadster: its own sounds go into carBus, and from there to where it is from the camera
    this.carBus = gain(1)
    this.carDelay = ctx.createDelay(1.2)
    this.carDelay.delayTime.value = 0
    this.carAir = filt('lowpass', 20000, 0.5)
    this.carPan = ctx.createStereoPanner()
    this.carOut = gain(1)
    this.carBus.connect(this.carDelay)
    this.carAir.connect(this.carPan).connect(this.carOut).connect(this.mixIn)
    this.carAirSw = this.bypass(this.carDelay, this.carAir, this.carPan)
    // the reverb: the street canyon's, deeper the more shut in; and out in the open, far
    // reflections. The canyon's is one convolution of the send mixed down to mono (half the work of
    // a stereo one), spread back across the two sides with one of them a few milliseconds late.
    this.verb = gain(1)
    n.canyon = gain(0)
    const conv = ctx.createConvolver()
    conv.channelCount = 1
    conv.channelCountMode = 'explicit'
    later(() => (conv.buffer = impulse(ctx, CANYON)), !this.live)
    this.verb.connect(conv).connect(n.canyon)
    const left = ctx.createStereoPanner(),
      right = ctx.createStereoPanner(),
      late = ctx.createDelay(0.05)
    left.pan.value = -0.7
    right.pan.value = 0.7
    late.delayTime.value = 0.017
    n.canyon.connect(left).connect(this.outside)
    n.canyon.connect(late).connect(right).connect(this.outside)
    n.open = gain(0)
    const dull = filt('lowpass', 1800, 0.5)
    this.lane([n.open.gain], this.verb.connect(n.open), dull)
    for (const [t, g, side] of FAR) {
      const d = ctx.createDelay(0.5),
        p = ctx.createStereoPanner()
      d.delayTime.value = t
      p.pan.value = side
      dull.connect(d).connect(gain(g)).connect(p).connect(this.outside)
    }
    n.carVerb = gain(0.3)
    this.carOut.connect(n.carVerb).connect(this.verb)
    // the slapback off the walls either side: the car's sound, late by the round trip to each wall
    n.echo = [-1, 1].map(side => {
      const d = ctx.createDelay(0.6),
        g = gain(0),
        p = ctx.createStereoPanner()
      d.delayTime.value = 0.1
      p.pan.value = side * 0.75
      this.carOut
        .connect(g)
        .connect(d)
        .connect(filt('lowpass', 2400, 0.5))
        .connect(filt('highpass', 160, 0.5))
        .connect(p)
      this.lane([g.gain], p, this.outside)
      return { d, g }
    })
  },
  // a filter that can be switched out: from -> filter -> to, or from -> to straight
  bypass (from, filter, to) {
    from.connect(to)
    return { from, filter, to, on: false }
  },
  through (sw, on) {
    if (sw.on === on) return
    sw.on = on
    if (on) {
      sw.from.connect(sw.filter)
      sw.from.disconnect(sw.to)
    } else {
      sw.from.connect(sw.to)
      sw.from.disconnect(sw.filter)
    }
  },
  // st.inside: the camera in the driver's seat; st.carDist, st.carPan: the car from the camera;
  // st.walls ({ left, right } m, Infinity for none), st.enclosed (0 open to 1 shut in by walls)
  updateSpace (st) {
    const { n, R } = this
    const inside = st.inside,
      d = inside ? 0 : st.carDist
    R(this.cabin.frequency, inside ? 950 : 20000, 0.1)
    this.through(this.cabinSw, inside || this.cabin.frequency.value < 19000)
    R(this.outside.gain, inside ? 0.5 : 1, 0.1)
    // the car's own sound a little forward at city speeds, as a game mixes it (a real car's
    // tyres and wind are some 20 dB quieter at 40 km/h than at 150), easing back by 100 km/h
    const v = Math.max(st.wheelSpeed, st.airspeed),
      t = Math.min(1, Math.max(0, (v - 8) / 22))
    R(this.carBus.gain, 1 + 0.9 * (1 - t * t * (3 - 2 * t)), 0.3)
    // (a follow camera, about 7 m back, hears the car at full level)
    const level = inside
      ? 1
      : clamp(Math.pow(7 / Math.max(d, 3), 0.9), 0.15, 1.6)
    // the time the sound takes to reach the camera, eased so that the car's doppler is real; on a
    // cut (the camera jumping) it jumps at once, under a quick dip, rather than sweeping the pitch
    const want = clamp(d / 343, 0, 0.25),
      delay = this.carDelay.delayTime
    if (st.cut) {
      const g = this.carOut.gain,
        now = this.now
      g.cancelScheduledValues(now)
      g.setTargetAtTime(0, now, 0.006)
      delay.cancelScheduledValues(now)
      delay.setValueAtTime(want, now + 0.03)
      g.setTargetAtTime(level, now + 0.035, 0.01)
      g.__to = level
      delay.__to = want
      this.delayAt = want
    } else {
      const was = this.delayAt ?? want,
        step = 0.3 * st.dt
      this.delayAt = clamp(want, was - step, was + step)
      R(delay, this.delayAt, 0.05)
      R(this.carOut.gain, level, 0.05)
    }
    const air = clamp(22000 * Math.exp(-d / 110), 2500, 20000)
    R(this.carAir.frequency, air, 0.1)
    this.through(this.carAirSw, air < 19500 || this.carAir.frequency.value < 19000)
    R(this.carPan.pan, inside ? 0 : clamp(st.carPan, -0.9, 0.9), 0.06)
    // the further the car, the more of it is reverb
    R(n.carVerb.gain, inside ? 0.12 : clamp(0.18 + d / 60, 0.18, 0.9), 0.2)
    const room = st.city ? 0.55 : 0.3,
      enc = st.city ? (st.enclosed ?? 1) : 0
    R(n.canyon.gain, room * (0.25 + 0.75 * enc) * 0.9, 0.4)
    R(n.open.gain, room * (1 - enc) * 1.2, 0.4)
    for (let i = 0; i < 2; i++) {
      const e = n.echo[i],
        w = st.walls ? (i ? st.walls.right : st.walls.left) : Infinity
      const near = st.city && w < 70
      R(e.g.gain, near ? clamp(0.5 / (1 + w / 6), 0, 0.26) : 0, 0.2)
      if (near) R(e.d.delayTime, clamp((2 * w) / 343, 0.015, 0.45), 0.12)
    }
  }
}
