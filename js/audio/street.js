// The street round the car, in sound, mixed into the SoundEngine (sound.js): the slapback of
// everything it hears off the walls either side (each echo as late as the round trip to its wall,
// panned to its side, fainter the further off, and gone out in the open or up over the roofs), the
// surf on the beach with a wave breaking every few seconds and gulls over it (louder the nearer the
// water), and the tyres on sand (a grainy hiss over a low crunch) or grass (a soft swish).
import { clamp } from '../sim/constants.js'

export const STREET = {
  buildStreet () {
    const { ctx, n, gain, filt, loop } = this
    // the echo taps the whole mix after the master gain and goes on past it (through the canopy,
    // when the camera is inside), so it never feeds back into itself
    n.echo = [-1, 1].map(side => {
      const d = ctx.createDelay(0.6),
        g = gain(0),
        p = ctx.createStereoPanner()
      d.delayTime.value = 0.1
      p.pan.value = side * 0.75
      this.master
        .connect(d)
        .connect(filt('lowpass', 2400, 0.5))
        .connect(filt('highpass', 160, 0.5))
        .connect(g)
        .connect(p)
        .connect(this.cabin)
      return { d, g }
    })
    // the surf: a low roar and the hiss of the wash, swelling as each wave breaks
    n.surf = gain(0)
    n.swell = gain(0.3)
    loop(this.brown).connect(filt('lowpass', 520, 0.5)).connect(n.swell)
    loop(this.pink)
      .connect(filt('bandpass', 2600, 0.45))
      .connect(gain(0.55))
      .connect(n.swell)
    n.swell.connect(n.surf).connect(this.master)
    // tyres off the road
    n.sand = gain(0)
    loop(this.white)
      .connect(filt('bandpass', 3200, 0.7))
      .connect(gain(0.6))
      .connect(n.sand)
    loop(this.brown).connect(filt('lowpass', 260, 0.7)).connect(n.sand)
    n.sand.connect(this.master)
    n.grass = gain(0)
    loop(this.pink).connect(filt('bandpass', 1300, 0.6)).connect(n.grass)
    n.grass.connect(this.master)
    this.waveT = 1.5
    this.gullT = 5
  },
  // st: walls ({ left, right } m to the nearest wall either side, Infinity for none), sea (0..1, how
  // near the water), surface, wheelSpeed, grounded, dt
  updateStreet (st, R) {
    const n = this.n,
      now = this.ctx.currentTime
    st.walls &&
      n.echo.forEach((e, i) => {
        const d = i ? st.walls.right : st.walls.left
        const near = st.city && d < 70
        R(e.g.gain, near ? clamp(0.55 / (1 + d / 6), 0, 0.3) : 0, 0.2)
        if (near) R(e.d.delayTime, clamp((2 * d) / 343, 0.015, 0.45), 0.12)
      })
    // a wave breaks every 5 to 10 s: a swell up over a second, then the wash running back
    const sea = st.sea || 0
    R(n.surf.gain, sea * sea * 0.55, 0.5)
    if (sea > 0.02 && (this.waveT -= st.dt) < 0) {
      this.waveT = 5 + Math.random() * 5
      n.swell.gain.setTargetAtTime(1, now, 0.45)
      n.swell.gain.setTargetAtTime(0.3, now + 1.4, 1.3)
    }
    if (sea > 0.15 && (this.gullT -= st.dt) < 0) {
      this.gullT = 4 + Math.random() * 9
      this.gull(0.02 * sea, Math.random() * 1.6 - 0.8)
    }
    const u = st.wheelSpeed,
      g = st.grounded
    const on = k => (st.surface === k ? g : 0)
    R(n.sand.gain, on('sand') * Math.min(1, u / 12) * 0.16, 0.1)
    R(n.grass.gain, on('grass') * Math.min(1, u / 14) * 0.12, 0.1)
  }
}
