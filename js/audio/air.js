// What flies over the city, heard, mixed into the SoundEngine (sound.js): the helicopter's rotor,
// the deep whop-whop of its blades (each one slapping the air as it passes, about twenty times a
// second) over the whine of its turbine, from where it circles, louder as it comes round over you;
// and an airliner going over high up, a broad low roar that swells and fades away. Both come from
// render/aircraft.js's AIR (where they are), through the mix (st.heli, st.plane: how loud, which
// side), and both are dulled by the distance.
import { clamp } from '../sim/constants.js'

export const AIRCRAFT_SOUND = {
  buildAir () {
    const { ctx, n, gain, filt, osc } = this
    // the rotor: a low body of noise, pulsed by the blades passing
    n.heli = gain(0)
    n.heliPan = ctx.createStereoPanner()
    n.heliLP = filt('lowpass', 1200, 0.6)
    const thump = gain(0),
      slap = gain(0)
    this.src.brown.connect(thump)
    this.src.pink.connect(filt('bandpass', 420, 1.1)).connect(slap)
    // (the blades' pass: a pulse that opens the noise twenty times a second, sharp at its front:
    // the sawtooth's drop, shaped into a slap that dies away as it climbs again)
    n.blades = osc('sawtooth', 19)
    const shape = ctx.createWaveShaper()
    shape.curve = Float32Array.from([1, 0.4, 0.1, 0, 0, 0])
    n.blades.connect(shape)
    shape.connect(thump.gain)
    shape.connect(slap.gain)
    const body = filt('lowpass', 160, 0.8)
    thump.connect(body).connect(n.heli)
    slap.connect(gain(0.45)).connect(n.heli)
    // its turbine's whine
    n.whine = osc('triangle', 3600)
    n.whine.connect(gain(0.012)).connect(n.heli)
    n.heli.connect(n.heliLP).connect(n.heliPan)
    this.lane(
      [n.heli.gain],
      n.heliPan,
      this.world,
      n.heliPan.connect(gain(0.3)),
      this.verb
    )
    // the airliner: a broad low roar, and the hiss of its jets on top
    n.jet = gain(0)
    n.jetPan = ctx.createStereoPanner()
    const roar = filt('lowpass', 260, 0.6),
      hiss = filt('bandpass', 900, 0.5)
    this.loop(this.brown).connect(roar).connect(n.jet)
    this.loop(this.pink).connect(hiss).connect(gain(0.25)).connect(n.jet)
    n.jet.connect(n.jetPan)
    this.lane(
      [n.jet.gain],
      n.jetPan,
      this.world,
      n.jetPan.connect(gain(0.4)),
      this.verb
    )
  },
  // st.heli, st.plane: { k (how loud, 0 to 1), pan, lp (Hz), doppler } or null
  updateAir (st) {
    if (!this.n.heli) this.buildAir()
    const { n, R } = this
    const h = st.city ? st.heli : null,
      p = st.city ? st.plane : null
    R(n.heli.gain, h ? 0.16 * h.k : 0, 0.3)
    if (h) {
      R(n.heliPan.pan, clamp(h.pan, -0.85, 0.85), 0.2)
      R(n.heliLP.frequency, h.lp, 0.3)
      R(n.blades.frequency, 19 * h.doppler, 0.2)
      R(n.whine.frequency, 3600 * h.doppler, 0.2)
    }
    R(n.jet.gain, p ? 0.1 * p.k : 0, 0.8)
    if (p) R(n.jetPan.pan, clamp(p.pan, -0.85, 0.85), 0.5)
  }
}
