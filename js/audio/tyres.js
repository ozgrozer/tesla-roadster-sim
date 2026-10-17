// The Roadster's tyres and the air round it, mixed into the SoundEngine (sound.js). Rolling: the
// roar of tread on asphalt (broad, peaking round 1 kHz, rising about 11 dB for each doubling of
// speed, so above about 60 km/h it is most of what you hear), a low rumble of the road's texture
// through the car, and a faint whirr at the rate the tread blocks meet the road; the surface shapes
// it (smoother and brighter on the pavement's concrete with a soft "ta-dum" at each slab joint,
// almost silent on grass but for a swish and the bumps, a hiss and crunch of grains on sand), and
// the asphalt itself changes as the car rolls over patches of it. At the limit: real squeal is
// noise ringing through a few resonances of the tread and carcass (roughly 700 Hz to 3 kHz),
// chattering as the rubber sticks and slips, its pitch rising with the slip and the load; the front
// and rear axles each have their own. A locked wheel on the e-brake is different, a rougher, lower
// scrub and howl over the tyre hopping; spinning up in a drift chirps higher; and on grass or sand
// there is no squeal at all, but the grit and turf being scrubbed. The air: wind noise rising
// steeply with speed (about the cube of it), in gusts that never repeat, buffeting faster and
// faster, and from the driver's seat a thin whistle off the canopy's seals.
import { clamp } from '../sim/constants.js'

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
// how much each surface squeals, and how much it roars, under a rolling tyre
const SQUEAL = { road: 1, walk: 0.8, grass: 0.04, sand: 0 }
const ROAR = { road: 1, walk: 0.7, grass: 0.12, sand: 0.08 }
const SLAB = 1.6 // m between joints in the pavement's concrete

export const TYRES = {
  // (each layer's level comes first, straight after its source, so that when it is silent the
  // filters after it rest: see SoundEngine.R)
  buildTyres () {
    const { n, gain, filt, loop } = this
    // (each layer joins the car's bus by a lane: only while it sounds)
    const to = (g, ...levels) => this.lane(levels, g, this.carBus)
    const { white, pink, brown } = this.src
    // rolling roar, its texture wandering as the car rolls over patches of asphalt
    n.roar = gain(0)
    n.roarPk = filt('peaking', 1000, 0.9)
    n.roarPk.gain.value = 9
    n.roarLP = filt('lowpass', 2500, 0.5)
    const patchy = gain(1)
    pink.connect(n.roar).connect(n.roarPk).connect(n.roarLP).connect(patchy)
    n.patch = loop(this.gust)
    n.patchK = gain(0)
    n.patch.connect(n.patchK).connect(patchy.gain)
    to(patchy, n.roar.gain)
    n.low = gain(0)
    n.lowLP = filt('lowpass', 160, 0.7)
    to(brown.connect(n.low).connect(n.lowLP), n.low.gain)
    n.tread = gain(0)
    n.treadBP = filt('bandpass', 400, 4)
    to(white.connect(n.tread).connect(n.treadBP), n.tread.gain)
    // sand: a hiss of grains thrown up and a low crunch; grass: a swish of blades
    n.sand = gain(0)
    const grains = filt('bandpass', 3000, 0.5)
    to(n.sand.connect(grains), n.sand.gain)
    this.bank.ready('sand', b => (n.sandSrc = loop(b)).connect(n.sand))
    n.crunch = gain(0)
    to(brown.connect(n.crunch).connect(filt('lowpass', 260, 0.7)), n.crunch.gain)
    n.grass = gain(0)
    const blades = gain(0.6)
    pink
      .connect(n.grass)
      .connect(filt('bandpass', 1800, 0.7))
      .connect(blades)
    loop(this.flutter).connect(gain(0.4)).connect(blades.gain)
    to(blades, n.grass.gain)
    // the wind: broadband, gusting and buffeting, and a whistle off the canopy's seals
    n.wind = gain(0)
    n.windBP = filt('bandpass', 500, 0.5)
    const gusty = gain(1)
    pink.connect(n.wind).connect(n.windBP).connect(gusty)
    n.gustK = gain(0)
    loop(this.gust).connect(n.gustK).connect(gusty.gain)
    n.buffet = loop(this.flutter)
    n.buffetK = gain(0)
    n.buffet.connect(n.buffetK).connect(gusty.gain)
    to(gusty, n.wind.gain)
    n.whistle = gain(0)
    n.whistleBP = filt('bandpass', 2400, 14)
    to(white.connect(n.whistle).connect(n.whistleBP), n.whistle.gain)
    // squeal, front and rear: noise ringing through three resonances, chattering (stick-slip), with
    // a faint jittering tone at the lowest (its pitch wavers too: see axle)
    const squeal = () => {
      const s = { g: gain(0), am: gain(0.55), bp: [], k: gain(0) }
      white.connect(s.g)
      for (const [q, a] of [
        [22, 1],
        [16, 0.6],
        [12, 0.35]
      ]) {
        const b = filt('bandpass', 900, q)
        s.g
          .connect(b)
          .connect(gain(a * 3))
          .connect(s.am)
        s.bp.push(b)
      }
      s.tone = this.osc('triangle', 900)
      s.toneG = gain(0)
      s.tone.connect(s.toneG).connect(s.am)
      s.fm = gain(0)
      this.jitter.connect(s.fm).connect(s.tone.frequency)
      s.chat = loop(this.chatter)
      s.chat.connect(s.k).connect(s.am.gain)
      to(s.am, s.g.gain, s.toneG.gain)
      return s
    }
    this.jitter = loop(this.chatter)
    this.waverT = 0
    this.waverX = 0
    n.sqF = squeal()
    n.sqR = squeal()
    // a locked tyre dragged along: a rough scrub and howl, the tyre hopping under it
    n.lock = gain(0)
    n.lockAM = gain(0.6)
    n.lockBP = filt('bandpass', 480, 2.5)
    n.lockBP2 = filt('bandpass', 950, 3)
    white.connect(n.lock)
    n.lock.connect(n.lockBP).connect(n.lockAM)
    n.lock.connect(n.lockBP2).connect(gain(0.6)).connect(n.lockAM)
    n.lock
      .connect(filt('highpass', 2600, 0.7))
      .connect(gain(0.15))
      .connect(n.lockAM)
    n.lockChat = loop(this.chatter)
    n.lockChat.connect(gain(0.35)).connect(n.lockAM.gain)
    n.hop = gain(0)
    brown
      .connect(n.hop)
      .connect(filt('lowpass', 140, 0.8))
      .connect(n.lockAM)
    to(n.lockAM, n.lock.gain, n.hop.gain)
    // a slide on loose ground: grit or turf scrubbed and thrown
    n.scrub = gain(0)
    to(n.scrub.connect(filt('bandpass', 1300, 0.6)), n.scrub.gain)
    this.bank.ready('gravel', b => (n.scrubSrc = loop(b)).connect(n.scrub))
    this.slabD = 0
  },
  // the rolling roar, the surfaces and the wind; dt since they were last set
  rolling (st, dt, surf) {
    const { n, R } = this,
      ps = st.pitch,
      v = st.wheelSpeed,
      g = st.grounded,
      inside = st.inside
    // rolling roar: about v^1.5 in pressure (a game's gentler range than the road's), darker and
    // quieter through the cabin
    const roll = g * Math.min(2, Math.pow(v / 28, 1.5))
    const roar = roll * ROAR[surf] * (inside ? 0.1 : 0.2)
    R(n.roar.gain, roar, 0.08)
    R(n.patchK.gain, roll > 0 ? 0.25 : 0, 0.1)
    R(n.patch.playbackRate, clamp(v / 15, 0.05, 4), 0.2)
    R(n.roarPk.frequency, (surf === 'walk' ? 1300 : 950) * ps, 0.3)
    R(n.roarLP.frequency, (inside ? 900 : 2200 + v * 45) * ps, 0.1)
    const bumpy = surf === 'grass' ? 2 : surf === 'sand' ? 1.2 : 1
    R(
      n.low.gain,
      g * Math.min(1.6, Math.pow(v / 28, 1.3)) * bumpy * (inside ? 0.5 : 0.15),
      0.08
    )
    R(n.lowLP.frequency, (120 + v * 2.5) * ps, 0.2)
    // the tread blocks: a pitch spread over the tyre's sequence, about every 3 cm
    R(
      n.tread.gain,
      g *
        ROAR[surf] *
        smooth(3, 15, v) *
        (1 - smooth(30, 60, v)) *
        (inside ? 0.004 : 0.012),
      0.1
    )
    R(n.treadBP.frequency, clamp((v / 0.031) * ps, 40, 8000), 0.05)
    const sand = (surf === 'sand' ? g : 0) * smooth(0, 12, v) * 0.22
    R(n.sand.gain, sand, 0.1)
    R(n.crunch.gain, sand * 0.6, 0.1)
    if (n.sandSrc) R(n.sandSrc.playbackRate, clamp(0.6 + v / 20, 0.6, 2), 0.2)
    R(n.grass.gain, (surf === 'grass' ? g : 0) * smooth(0, 14, v) * 0.1, 0.1)
    // the pavement's slab joints, front axle and then rear
    if (surf === 'walk' && g && v > 1.5) {
      this.slabD += v * dt
      if (this.slabD > SLAB) {
        this.slabD -= SLAB
        const k = Math.min(1, v / 15) * 0.08
        this.play('thud', k, { rate: 1.6, lp: 900, verb: 0.05 })
        this.play('thud', k * 0.8, {
          rate: 1.5,
          lp: 900,
          verb: 0.05,
          delay: 2.9 / v
        })
      }
    }
    // the wind: about v^2.7, the gusts and buffeting deeper the faster
    const air = st.airspeed
    const wind = Math.min(1.8, Math.pow(air / 45, 2.7)) * (inside ? 0.25 : 0.7)
    R(n.wind.gain, wind, 0.1)
    R(n.gustK.gain, wind > 0 ? 0.35 : 0, 0.2)
    R(n.buffetK.gain, 0.3 * smooth(25, 70, air), 0.2)
    R(n.buffet.playbackRate, clamp(air / 30, 0.2, 3), 0.2)
    R(n.windBP.frequency, (inside ? 1800 + air * 6 : 300 + air * 10) * ps, 0.15)
    R(n.whistle.gain, inside ? smooth(20, 60, air) * 0.012 : 0, 0.2)
    if (inside) R(n.whistleBP.frequency, (2200 + air * 9) * ps, 0.3)
  },
  // an axle's squeal: skid (0 to 1, past the grip), sing (singing short of it), f0: its pitch
  axle (s, skid, sing, f0, v, loud) {
    // (its pitch wavers a few percent, a few times a second, as the load on the tyre comes and goes:
    // a slow random walk, set with the pitch each frame rather than modulating the filters, which
    // would have them work out their coefficients every sample)
    const R = this.R,
      e = Math.max(smooth(0.05, 0.75, skid), sing),
      f = (f0 + 380 * skid * this.ps) * (1 + 0.03 * this.waverX)
    // (silent: only its levels, on their way to rest)
    if (e === 0) {
      R(s.g.gain, 0, 0.18)
      R(s.toneG.gain, 0, 0.15)
      s.last = 0
      return
    }
    R(s.bp[0].frequency, f, 0.15)
    R(s.bp[1].frequency, f * 1.93, 0.15)
    R(s.bp[2].frequency, f * 2.87, 0.15)
    R(s.tone.frequency, f, 0.15)
    R(s.fm.gain, f * 0.025, 0.2)
    R(s.k.gain, 0.25 + 0.2 * e, 0.2)
    R(s.chat.playbackRate, clamp(0.5 + v / 25, 0.5, 2.5), 0.2)
    R(s.g.gain, e * loud * 0.6, e > s.last ? 0.06 : 0.18)
    R(s.toneG.gain, e * loud * 0.02, 0.15)
    s.last = e
  },
  // st.wheelSpeed, st.grounded, st.surface, st.skidF, st.skidR, st.slipR, st.latG, st.ebrake,
  // st.track, st.throttle, st.airspeed, st.inside, st.pitch
  updateTyres (st) {
    const { n, R } = this,
      ps = st.pitch,
      v = st.wheelSpeed,
      g = st.grounded,
      inside = st.inside
    const surf = st.surface || 'road'
    // (the squeal's waver: a new aim every few tenths of a second, eased towards)
    if ((this.waverT -= st.dt) < 0) {
      this.waverT = 0.12 + Math.random() * 0.3
      this.waverTo = Math.random() * 2 - 1
    }
    this.waverX += ((this.waverTo || 0) - this.waverX) * Math.min(1, st.dt * 6)
    // (rolling and the wind change slowly: set on the mix's world frames, every other one)
    if (st.world !== false) this.rolling(st, st.worldDt || st.dt, surf)
    // squeal: the front and rear axles past their grip, on a surface that squeals
    const sq = SQUEAL[surf] * g * smooth(1, 8, v)
    const eb = st.ebrake && g
    const lat = Math.min(1.5, Math.abs(st.latG || 0))
    // (a tyre sings before it slides: from about four fifths of its grip, the closer to the limit
    // the louder, then screams once it is past it)
    const sing = 0.5 * smooth(0.78, 1.02, st.use || 0),
      loud = sq * (inside ? 0.7 : 1)
    this.axle(n.sqF, st.skidF, sing, (760 + 110 * lat) * ps, v, loud)
    // (the rears spinning, in Track Mode or a burnout, slide however slowly the car goes, and chirp
    // higher)
    const vr = Math.max(v, st.spin || 0),
      spinning = (st.track || st.burning) && st.throttle > 0.3 && !eb
    const loudR = SQUEAL[surf] * g * smooth(1, 8, vr) * (inside ? 0.7 : 1)
    this.axle(
      n.sqR,
      eb ? 0 : st.skidR,
      sing * 0.6,
      ((spinning ? 820 : 700) + 110 * lat) * ps,
      vr,
      loudR
    )
    // the e-brake's locked rears dragged along (and a burnout's rears tearing at the road)
    const locked = eb
      ? smooth(0, 1, st.skidR) * smooth(0.5, 5, v)
      : st.burning
        ? 0.5 * smooth(0, 1, st.skidR)
        : 0
    const lock = locked * (SQUEAL[surf] + 0.1) * (inside ? 0.6 : 0.9)
    R(n.lock.gain, lock, locked ? 0.04 : 0.12)
    R(n.hop.gain, lock * 0.2, locked ? 0.04 : 0.12)
    if (lock > 0) {
      R(n.lockBP.frequency, (450 + v * 8) * ps, 0.1)
      R(n.lockBP2.frequency, (1000 + v * 12) * ps, 0.1)
      R(n.lockChat.playbackRate, clamp(0.3 + v / 30, 0.3, 1.5), 0.2)
    }
    // sliding or spinning on grass or sand: scrubbing the ground
    const loose = surf === 'sand' ? 1 : surf === 'grass' ? 0.6 : 0
    const slide = Math.max(st.skidF, st.skidR, eb ? 1 : 0) * smooth(0.5, 5, vr)
    R(n.scrub.gain, g * loose * slide * 0.3, 0.08)
    if (n.scrubSrc)
      R(n.scrubSrc.playbackRate, clamp(0.7 + v / 25, 0.7, 2) * ps, 0.2)
  }
}
