// The districts' own sound, mixed into the SoundEngine (sound.js) over the city's bed (street.js):
// where the camera is (sim/areas.js whereIs), each district's character fades in and the last one's
// fades out as the car crosses from one to the next: downtown and the office towers hum (air
// handlers on the roofs, transformers, a low drone off the glass), Hollywood's boulevard a little;
// the beach and Venice have the waves a long way inland and more gulls; the hillside estates, a
// dawn chorus all day; Mid-City's lots and depots clank and bang (a shutter, a pallet dropped, a
// skip's lid). The weather tells: the rain hushes the birds and the gulls, and dulls the clanks.
import { AREAS, whereIs } from '../sim/areas.js'

const R = Math.random
// what each kind of district (areas.js AREAS kind) sounds like: hum, sea, birds, clank (0 to 1)
const CHARACTER = {
  downtown: [1, 0, 0.1, 0.35],
  towers: [0.8, 0, 0.15, 0.1],
  boulevard: [0.45, 0, 0.25, 0.2],
  strip: [0.2, 0, 0.3, 1],
  estates: [0, 0, 1, 0],
  beach: [0, 1, 0.3, 0],
  venice: [0.1, 0.8, 0.35, 0.15],
  industrial: [0.4, 0, 0, 1],
  port: [0.3, 0.4, 0, 1]
}
const NONE = [0, 0, 0, 0]
const KIND = {}
for (const k in AREAS) KIND[AREAS[k].name] = AREAS[k].kind
KIND['Santa Monica Beach'] = 'beach'
const kindAt = (x, z) => KIND[whereIs(x, z, { area: '', street: '', cross: '' }).area]
// a district's character at (x, z): (the mean of five points 60 m apart, so crossing into the
// next one is a crossfade over a block, not a step)
const SPREAD = 60
const PTS = [[0, 0], [SPREAD, 0], [-SPREAD, 0], [0, SPREAD], [0, -SPREAD]]
export function character (x, z, out = [0, 0, 0, 0]) {
  out.fill(0)
  for (const [dx, dz] of PTS) {
    const c = CHARACTER[kindAt(x + dx, z + dz)] || NONE
    for (let i = 0; i < 4; i++) out[i] += c[i] / PTS.length
  }
  return out
}

export const ZONES = {
  buildZones () {
    const { n, gain, filt, osc } = this
    // the hum: mains and its harmonic, slowly beating against a second pair, and a low rumble
    n.hum = gain(0)
    for (const [f, v] of [[58, 0.5], [116, 0.35], [58.4, 0.4], [174.6, 0.12]]) osc('sine', f).connect(gain(v)).connect(n.hum)
    this.src.brown.connect(gain(0.6)).connect(filt('lowpass', 160, 0.6)).connect(n.hum)
    const hp = filt('highpass', 40, 0.7)
    this.lane([n.hum.gain], n.hum.connect(hp), this.world)
    // the sea a way inland: the surf's wash, low and far
    n.inland = gain(0)
    const surf = filt('lowpass', 600, 0.5)
    this.src.pink.connect(n.inland).connect(surf)
    const swell = this.loop(this.gust)
    swell.playbackRate.value = 0.35
    const sw = gain(0.6)
    swell.connect(sw.gain)
    this.lane([n.inland.gain], surf.connect(sw), this.world)
    this.zone = [0, 0, 0, 0]
    this.zoneT = 0
    this.zBirdT = 3
    this.zGullT = 6
    this.zClankT = 8
  },
  // st.px, st.pz: the camera's ground position; st.night, st.rain
  updateZones (st) {
    if (!this.n.hum) return
    const { n, R: set } = this,
      dt = st.dt
    const z = this.zone
    if (st.city && st.px !== undefined && (this.zoneT -= dt) <= 0) {
      this.zoneT = 0.5
      character(st.px, st.pz, z)
    }
    if (!st.city) z.fill(0)
    const [hum, sea, birds, clank] = z
    const rain = st.rain || 0,
      night = !!st.night
    // (slow, so a crossing is heard as a fade over a few seconds)
    set(n.hum.gain, hum * (night ? 0.016 : 0.022), 2.5)
    set(n.inland.gain, sea * (0.03 + 0.02 * rain), 2.5)
    if (!st.city) return
    // the birds keep quiet in the rain and at night
    const sing = birds * (night ? 0 : 1) * Math.max(0, 1 - rain * 3)
    if (sing > 0.05 && (this.zBirdT -= dt * sing) < 0) {
      this.zBirdT = 1.2 + R() * 3
      this.bird(R() * 1.6 - 0.8)
    }
    const gulls = sea * Math.max(0, 1 - rain * 2) * (night ? 0.2 : 1)
    if (gulls > 0.05 && (this.zGullT -= dt * gulls) < 0) {
      this.zGullT = 5 + R() * 8
      this.gull(0.012 + 0.01 * gulls, R() * 1.6 - 0.8)
    }
    if (clank > 0.05 && (this.zClankT -= dt * clank * (night ? 0.4 : 1)) < 0) {
      this.zClankT = 4 + R() * 9
      this.clank(R() * 1.6 - 0.8, rain)
    }
  },
  // a metal clank or bang across the lot: a few inharmonic partials ringing down, dulled in the rain
  clank (pan, rain = 0) {
    const f = 140 + R() * 260,
      vol = 0.012 + R() * 0.01,
      lp = 3200 - 1800 * rain
    const hits = R() < 0.3 ? 2 : 1
    for (let h = 0; h < hits; h++)
      for (const [k, d, v] of [[1, 0.5, 1], [2.76, 0.32, 0.6], [5.4, 0.18, 0.35], [8.9, 0.1, 0.2]])
        this.tone(f * k, f * k * 0.985, d, 'triangle', vol * v, h * 0.22, {
          pan,
          verb: 0.6,
          attack: 0.002,
          filter: ['lowpass', lp, 0.7]
        })
  }
}
