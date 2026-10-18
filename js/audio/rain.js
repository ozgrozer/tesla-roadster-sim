// The weather's sound, mixed into the SoundEngine (sound.js): the rain, as the hiss of countless
// drops landing all round and the patter of the nearer ones (two loops of drops synthesised at
// start-up, one each side, so the two ears never hear the same drop); from the driver's seat, the
// rain drumming on the canopy over your head, heard as it is, not through it; the car's own tyres
// hissing and swishing through the water on a wet road, louder the faster it goes, and the slosh
// of a sheet of water thrown up as a tyre hits a puddle; and the thunder,
// which follows each lightning flash (ENV, sim/env.js) as late as the strike is far, a sharp crack
// first when it is close, then a long rolling rumble, deeper and softer the further off it is,
// from the side it struck on. (The loops and three claps of thunder, near, middle and far, are
// made a piece at a time between frames, so the sound starting never stalls the game; each clap
// is played a little faster or slower than the last, so no two sound alike.)
import { rng, later } from './buffers.js'
import { clamp } from '../sim/constants.js'

// A loop of rain: drops landing at random, each a tiny click of noise ringing down, some louder
// (the nearer ones), at about rate a second; thick: how much of each is the low body of a drop on
// a roof (the canopy) rather than the tick of one on the ground
function drops (ctx, sec, rate, thick, seed) {
  const sr = ctx.sampleRate,
    n = Math.floor(sr * sec),
    a = new Float32Array(n),
    R = rng(seed)
  const count = Math.floor(rate * sec)
  for (let k = 0; k < count; k++) {
    const t = Math.floor(R() * n),
      amp = Math.pow(R(), 2.2) * (0.4 + 0.6 * R()),
      len = Math.floor(sr * (0.002 + 0.012 * R() + 0.02 * thick * R())),
      f = (thick ? 280 + 600 * R() : 1600 + 4500 * R()) / sr
    let lp = 0
    for (let i = 0; i < len; i++) {
      const j = (t + i) % n,
        e = Math.exp((-i / len) * 5)
      // a click of noise, and (on the canopy) the drop's thump ringing at its own pitch
      lp += 0.5 * (R() * 2 - 1 - lp)
      a[j] +=
        amp *
        e *
        ((1 - thick) * (R() * 2 - 1) +
          thick * (Math.sin(6.283 * f * i) * 0.8 + lp * 0.5))
    }
  }
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(a[i]))
  for (let i = 0; i < n; i++) a[i] *= 0.8 / (peak || 1)
  const b = ctx.createBuffer(1, n, sr)
  b.getChannelData(0).set(a)
  return b
}

// A clap of thunder: near (0 to 1, 1 overhead) brings the crack at the start; then rolls of rumble
// that swell and die away one over another for several seconds
function thunderBuffer (ctx, near, seed) {
  const sr = ctx.sampleRate,
    sec = 5 + 3 * (1 - near),
    n = Math.floor(sr * sec),
    a = new Float32Array(n),
    R = rng(seed)
  const rolls = []
  const nr = 4 + Math.floor(R() * 5)
  for (let k = 0; k < nr; k++)
    rolls.push([
      Math.pow(R(), 1.4) * (sec - 2.5),
      0.08 + R() * 0.35,
      0.5 + R() * 1.8,
      0.4 + R() * 0.6
    ])
  let brown = 0,
    lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let env = 0
    for (const [t0, up, down, g] of rolls)
      if (t > t0)
        env +=
          g *
          Math.min(1, (t - t0) / up) *
          Math.exp(-Math.max(0, t - t0 - up) / down)
    const x = R() * 2 - 1
    brown = (brown + 0.03 * x) / 1.03
    lp += 0.15 * (x - lp)
    // (the crack: a burst of bright noise, with an aftershock or two)
    const crack =
      near * (Math.exp(-t / 0.03) + 0.4 * Math.exp(-Math.abs(t - 0.09) / 0.02))
    a[i] = brown * 9 * env + lp * 0.6 * env * near + x * crack * 0.7
  }
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(a[i]))
  for (let i = 0; i < n; i++) a[i] *= 0.9 / (peak || 1)
  const b = ctx.createBuffer(1, n, sr)
  b.getChannelData(0).set(a)
  return b
}

const SOUND_SPEED = 343

export const WEATHER_SOUND = {
  buildRain () {
    const { ctx, n, gain, filt } = this
    // outside: the hiss and patter, a loop of drops each side
    n.rain = gain(0)
    n.rainHiss = gain(0)
    const bright = filt('highshelf', 3000, 0.7)
    bright.gain.value = 3
    n.rainBody = filt('lowpass', 9000, 0.5)
    this.src.white
      .connect(n.rainHiss)
      .connect(filt('bandpass', 5200, 0.6))
      .connect(n.rainBody)
    const now = !this.live
    for (const [side, seed] of [
      [-0.8, 41],
      [0.8, 42]
    ])
      later(() => {
        const s = ctx.createBufferSource()
        s.buffer = drops(ctx, 2.7 + side * 0.2, 1400, 0, seed)
        s.loop = true
        s.start(0, Math.random() * 2)
        const p = ctx.createStereoPanner()
        p.pan.value = side
        s.connect(p).connect(n.rain)
      }, now)
    n.rain.connect(bright).connect(n.rainBody)
    this.lane(
      [n.rain.gain, n.rainHiss.gain],
      n.rainBody,
      this.world,
      n.rainBody.connect(gain(0.15)),
      this.verb
    )
    // inside: the drumming on the canopy (straight into the mix: it is in the cabin with you)
    n.drum = gain(0)
    const roof = filt('lowpass', 2600, 0.6)
    n.drum.connect(roof)
    later(() => {
      const d = ctx.createBufferSource()
      d.buffer = drops(ctx, 3.1, 520, 1, 43)
      d.loop = true
      d.start(0, Math.random() * 2)
      d.connect(n.drum)
    }, now)
    this.lane([n.drum.gain], roof, this.mixIn)
    // the car's tyres in the water: a swish through the spray, with the car (carBus)
    n.swish = gain(0)
    n.swishBP = filt('bandpass', 1400, 0.8)
    this.src.pink.connect(n.swish).connect(n.swishBP)
    this.lane([n.swish.gain], n.swishBP, this.carBus)
    this.strikesHeard = null
    this.claps = []
    ;[1, 0.55, 0.15].forEach((near, i) =>
      later(() => (this.claps[i] = thunderBuffer(ctx, near, 61 + i)), now)
    )
  },
  // st.rain, st.wet (0 to 1); st.inside; st.wheelSpeed (m/s); st.strikes, st.strikeDist (m),
  // st.strikeDir (radians, as the wind's); st.camYaw (the way the camera faces, the same way)
  updateRain (st) {
    if (!this.n.rain) this.buildRain()
    const { n, R } = this,
      city = st.city,
      rain = city ? st.rain || 0 : 0,
      wet = city ? st.wet || 0 : 0
    // (heard through the canopy from inside, and the drumming on it over your head)
    R(n.rain.gain, 0.22 * rain * Math.sqrt(rain), 0.4)
    R(n.rainHiss.gain, 0.035 * rain, 0.4)
    R(n.rainBody.frequency, 4500 + 4500 * rain, 0.4)
    R(n.drum.gain, st.inside ? 0.22 * rain : 0, 0.15)
    const v = st.grounded ? st.wheelSpeed || 0 : 0,
      splash = st.splash || 0
    R(
      n.swish.gain,
      (wet * 0.09 + splash * 0.25) * clamp((v - 2) / 25, 0, 1.4),
      0.08
    )
    R(n.swishBP.frequency, 900 + 60 * v - 300 * splash, 0.1)
    // (a tyre into a puddle: the slosh as the sheet of water goes up)
    if (splash > 0.2 && (this.splashWas || 0) < 0.1) this.slosh(splash)
    this.splashWas = splash
    // thunder: a strike heard once its sound has come the distance
    if (this.strikesHeard === null) this.strikesHeard = st.strikes || 0
    if (city && (st.strikes || 0) > this.strikesHeard) {
      this.strikesHeard = st.strikes
      this.thunder(
        st.strikeDist || 2000,
        (st.strikeDir || 0) - (st.camYaw || 0)
      )
    } else if (!city) this.strikesHeard = st.strikes || 0
  },
  // a sheet of water thrown up by a tyre (k: how much, 0 to 1), with the car
  slosh (k) {
    if (!this.playing()) return
    const { ctx, gain, filt } = this
    const s = ctx.createBufferSource()
    s.buffer = this.white
    const bp = filt('bandpass', 700 + 500 * Math.random(), 0.9)
    const g = gain(0)
    const t = this.now
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22 * k, t + 0.02)
    g.gain.setTargetAtTime(0, t + 0.05, 0.12)
    s.connect(bp).connect(g).connect(this.carBus)
    s.start(t, Math.random() * 1.5, 0.6)
    s.onended = () => {
      try {
        g.disconnect()
      } catch (e) {}
    }
  },
  // a clap of thunder dist m off, bearing (radians, 0 ahead, positive to the right)
  thunder (dist, bearing) {
    const near = clamp(1 - dist / 3500, 0, 1)
    const buf = this.claps[near > 0.7 ? 0 : near > 0.3 ? 1 : 2]
    if (!this.playing() || !buf) return
    const { ctx, gain, filt } = this
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = 0.85 + Math.random() * 0.3
    const lp = filt('lowpass', 180 + 1400 * near * near, 0.5)
    const g = gain(0.12 + 0.5 * near)
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(Math.sin(bearing) * 0.7, -0.7, 0.7)
    s.connect(lp).connect(g).connect(p).connect(this.world)
    g.connect(gain(0.35)).connect(this.verb)
    s.start(this.now + dist / SOUND_SPEED)
    s.onended = () => {
      try {
        p.disconnect()
        g.disconnect()
      } catch (e) {}
    }
  }
}
