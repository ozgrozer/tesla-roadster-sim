// The city's bed of sound, mixed into the SoundEngine (sound.js): the wash of traffic a few streets
// away (a low roar on each side, as loud as the traffic over there is busy, swelling as cars come
// and go), the wind between the buildings (gusting, louder up on the roofs and out by the sea, a
// hollow whistle down the tall street canyons), the surf on the beach with a wave breaking every
// few seconds and gulls over it (louder the nearer the water), songbirds by day and crickets at
// night, a few of them, each chirping at its own rate from its own side; and by the walls east and
// south, the freeway's roar beyond them, its tyres' hiss dulled by the wall.
import { clamp } from '../sim/constants.js'

export const STREET = {
  buildStreet () {
    const { ctx, n, gain, filt, loop } = this
    // far traffic, left and right
    n.wash = [-0.7, 0.7].map(side => {
      const g = gain(0),
        p = ctx.createStereoPanner(),
        swell = gain(1)
      p.pan.value = side
      // (the left side shares the engine's noise, the right has its own, so they are not alike)
      ;(side < 0 ? this.src.brown : loop(this.brown)).connect(g)
      g.connect(filt('lowpass', 320, 0.5)).connect(swell)
      const hiss = gain(0)
      ;(side < 0 ? this.src.pink : loop(this.pink))
        .connect(hiss)
        .connect(filt('bandpass', 750, 0.5))
        .connect(swell)
      g.hiss = hiss
      const s = loop(this.gust)
      s.playbackRate.value = side < 0 ? 2.3 : 2.9
      s.connect(gain(0.45)).connect(swell.gain)
      swell.connect(p)
      this.lane(
        [g.gain, hiss.gain],
        p,
        this.world,
        p.connect(gain(0.3)),
        this.verb
      )
      return g
    })
    // the wind between the buildings, and its whistle down a tall street
    n.breeze = gain(0)
    const gusts = gain(0.6)
    this.src.pink
      .connect(n.breeze)
      .connect(filt('bandpass', 520, 0.45))
      .connect(gusts)
    n.howl = gain(0)
    n.pipe = filt('bandpass', 820, 7)
    this.src.white.connect(n.howl).connect(n.pipe).connect(gusts)
    // (the gusts swell the wind; the howl's pitch wanders, set now and then: see updateStreet)
    const g2 = loop(this.gust)
    g2.playbackRate.value = 0.7
    g2.connect(gain(0.5)).connect(gusts.gain)
    this.lane([n.breeze.gain, n.howl.gain], gusts, this.world)
    this.howlT = 0
    // the surf: a low roar and the hiss of the wash, swelling as each wave breaks
    n.surf = gain(0)
    n.surfHiss = gain(0)
    n.swell = gain(0.3)
    this.src.brown
      .connect(n.surf)
      .connect(filt('lowpass', 520, 0.5))
      .connect(n.swell)
    this.src.pink
      .connect(n.surfHiss)
      .connect(filt('bandpass', 2600, 0.45))
      .connect(n.swell)
    this.lane(
      [n.surf.gain, n.surfHiss.gain],
      n.swell,
      this.world,
      n.swell.connect(gain(0.2)),
      this.verb
    )
    this.waveT = 1.5
    this.gullT = 5
    // the freeway: a deep roar of engines and a hiss of tyres, heard over the sound wall (so dulled)
    n.fwy = gain(0)
    n.fwyHiss = gain(0)
    n.fwyPan = ctx.createStereoPanner()
    loop(this.brown)
      .connect(n.fwy)
      .connect(filt('lowpass', 420, 0.6))
      .connect(n.fwyPan)
    loop(this.pink)
      .connect(n.fwyHiss)
      .connect(filt('bandpass', 1100, 0.6))
      .connect(n.fwyPan)
    this.lane(
      [n.fwy.gain, n.fwyHiss.gain],
      n.fwyPan,
      this.world,
      n.fwyPan.connect(gain(0.25)),
      this.verb
    )
  },
  // crickets: a high tone pulsed in quick trains of chirps (on only while both the pulse and the
  // train are), three of them; made the first time night falls
  buildCrickets () {
    const { ctx, n, gain, filt, osc } = this
    n.crickets = gain(0)
    const curve = Float32Array.from([0, 0, 0, 1])
    for (const [f, rate, train, side] of [
      [4300, 28, 2.6, -0.6],
      [4650, 31, 3.1, 0.55],
      [3950, 25, 2.2, 0.1]
    ]) {
      const chirp = gain(0),
        p = ctx.createStereoPanner(),
        sum = gain(0.5),
        gate = ctx.createWaveShaper()
      gate.curve = curve
      p.pan.value = side
      osc('sine', f).connect(chirp).connect(p).connect(n.crickets)
      osc('square', rate).connect(sum)
      osc('square', train).connect(sum)
      sum.connect(gate).connect(filt('lowpass', 180, 0.7)).connect(chirp.gain)
    }
    this.lane(
      [n.crickets.gain],
      n.crickets,
      this.world,
      n.crickets.connect(gain(0.3)),
      this.verb
    )
  },
  // st.washL, st.washR: how busy the traffic is off to each side (0 to 1); st.sea (0 to 1, how near
  // the water); st.camY (m, how high the camera is); st.enclosed
  updateStreet (st) {
    const { n, R } = this,
      now = this.now,
      city = st.city
    const quiet = st.night ? 0.6 : 1
    for (let i = 0; i < 2; i++) {
      const g = n.wash[i],
        w = city ? (0.006 + 0.05 * ((i ? st.washR : st.washL) || 0)) * quiet : 0
      R(g.gain, w, 0.5)
      R(g.hiss.gain, w * 0.35, 0.5)
    }
    const sea = st.sea || 0,
      up = clamp(((st.camY || 2) - 6) / 40, 0, 1)
    R(n.breeze.gain, city ? 0.012 + 0.03 * up + 0.015 * sea : 0, 0.6)
    R(n.howl.gain, city ? 0.04 * (st.enclosed ?? 0) + 0.25 * up : 0, 0.8)
    if (city && (this.howlT -= st.dt) < 0) {
      this.howlT = 0.6 + Math.random()
      R(n.pipe.frequency, 700 + Math.random() * 260, 0.5)
    }
    // a wave breaks every 5 to 10 s: a swell up over a second, then the wash running back
    R(n.surf.gain, city ? sea * sea * 0.5 : 0, 0.5)
    R(n.surfHiss.gain, city ? sea * sea * 0.27 : 0, 0.5)
    if (sea > 0.02 && (this.waveT -= st.dt) < 0) {
      this.waveT = 5 + Math.random() * 5
      n.swell.gain.setTargetAtTime(1, now, 0.45)
      n.swell.gain.setTargetAtTime(0.3, now + 1.4, 1.3)
    }
    if (sea > 0.15 && (this.gullT -= st.dt) < 0) {
      this.gullT = 4 + Math.random() * 9
      this.gull(0.02 * sea, Math.random() * 1.6 - 0.8)
    }
    // (a steady roar by the wall, over the street's own sounds; gone a couple of hundred metres in;
    // a little quieter at night)
    const fwy = city ? (st.freeway || 0) ** 2 * (st.night ? 0.8 : 1) : 0
    R(n.fwy.gain, fwy * 0.22, 0.6)
    R(n.fwyHiss.gain, fwy * 0.06, 0.6)
    if (fwy > 0) R(n.fwyPan.pan, clamp(st.freewayPan || 0, -0.8, 0.8), 0.3)
    if (st.night && !n.crickets) this.buildCrickets()
    if (n.crickets) R(n.crickets.gain, city && st.night ? 0.005 : 0, 0.8)
  }
}
