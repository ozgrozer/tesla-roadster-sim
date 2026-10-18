// Knocks, crashes and breakages, mixed into the SoundEngine (sound.js): layers from the sample bank
// (buffers.js), picked and scaled by how hard the hit was and what was hit. A light touch is a dull
// knock; harder, a plastic bumper cracks over the thud; harder still the steel buckles and
// crunches, and in a big hit the glass goes. A wall is heavier, with grit falling after it; a post
// rings; a tree splits and thrashes its leaves. Grinding along a wall or a car is a scrape that
// loops for as long as the contact lasts, pitched by how fast the car slides. The kerb, a manhole's
// lid, landings (and the suspension bottoming out on a hard one), poles and trees snapping and
// falling are here too. Everything the Roadster does is heard from the car (carBus); what happens
// elsewhere is placed by its own pan and distance.
import { clamp } from '../sim/constants.js'

const MAX_VOICES = 28
const pick = list => list[Math.floor(Math.random() * list.length)]
const vary = (a = 0.08) => 1 - a + Math.random() * 2 * a

export const IMPACTS = {
  buildImpacts () {
    const { n, gain, filt, loop } = this
    this.voices = 0
    this._o = {}
    // the scrape: loops for as long as the car grinds along something
    n.scrape = gain(0)
    n.scrapeBP = filt('bandpass', 1800, 0.5)
    this.lane([n.scrape.gain], n.scrape.connect(n.scrapeBP), this.carBus)
    this.bank.ready('scrape', b => (n.scrapeSrc = loop(b)).connect(n.scrape))
    this.contactT = -1
    this.contactK = 0
  },
  // a sample from the bank: o.rate (playback speed, so pitch), o.pan, o.verb (share into the
  // reverb), o.delay (s), o.lp (Hz, a lowpass over it), o.world (placed in the world, not at the
  // car)
  play (name, vol, o = {}) {
    if (vol < 0.002 || !this.playing()) return
    const list = this.bank[name]
    if (this.voices >= MAX_VOICES || !list.length) return
    const ctx = this.ctx,
      t = ctx.currentTime + (o.delay || 0)
    const s = ctx.createBufferSource()
    s.buffer = pick(list)
    s.playbackRate.value = (o.rate || 1) * vary(0.06) * (this.ps || 1)
    const g = ctx.createGain()
    g.gain.value = vol
    let node = s
    if (o.lp && o.lp < 19000 && !o.world) {
      const b = ctx.createBiquadFilter()
      b.type = 'lowpass'
      b.frequency.value = o.lp
      b.Q.value = 0.5
      node = node.connect(b)
    }
    node.connect(g)
    this.voices++
    s.onended = () => this.voices--
    if (o.world) this.out(g, o)
    else {
      let out = g
      if (o.pan) {
        const p = ctx.createStereoPanner()
        p.pan.value = clamp(o.pan, -0.6, 0.6)
        out = g.connect(p)
      }
      out.connect(this.carBus)
      if (o.verb) {
        const v = ctx.createGain()
        v.gain.value = o.verb
        out.connect(v).connect(this.verb)
      }
    }
    s.start(t)
  },
  // a knock against a car, a post or a wall (what: the sim's kind for it; v: the closing speed,
  // m/s). at: somewhere else in the world ({ k: how loud from here, pan, lp }), not the Roadster
  // side: a little left or right of the car, where it was hit
  bump (v, what = 'car', at = null, side = 0) {
    // (nothing to play before the sound has first started: and its scratch object isn't made yet)
    if (!this.playing()) return
    const k = clamp(v / 12, 0, 1.2) * (at ? at.k : 1)
    const wall =
      what === 'building' ||
      what === 'plant' ||
      what === 'mast' ||
      what === 'wall'
    const post = what === 'lamp' || what === 'signal'
    const tree = what === 'tree' || what === 'palm'
    const lp = at ? at.lp : 20000
    const o = (rate, verb, delay = 0, dull = 20000) => {
      const x = this._o
      x.rate = rate
      x.verb = verb
      x.delay = delay
      x.lp = Math.min(lp, dull)
      x.world = !!at
      x.pan = at ? at.pan : side
      return x
    }
    // the thud of the blow, heavier against a wall
    this.play(
      'thud',
      (v > 2.5 ? 0.4 : 0.55) * Math.pow(k, 0.6),
      o(wall ? 0.7 : 0.95, 0.15)
    )
    if (v > 1.6) this.play('plastic', 0.4 * Math.pow(k, 0.7), o(vary(0.1), 0.1))
    // (hard enough to dent the body, the steel crunches)
    if (v > 2.5)
      this.play('metal', 0.55 * k, o(1.15 - 0.3 * k, 0.25, 0, 2500 + 6000 * k))
    if (v > 9 && Math.random() < 0.7)
      this.play('glass', 0.45 * k, o(1, 0.3, 0.015))
    if (v > 11) this.play('metal', 0.4 * k, o(0.75, 0.3, 0.03))
    if (wall && v > 4) this.play('gravel', 0.12 * k, o(0.8, 0.2, 0.07, 4000))
    if (post) this.play('pole', 0.35 * k, o(what === 'signal' ? 0.75 : 1, 0.4))
    if (tree) {
      this.play('thud', 0.4 * k, o(0.6, 0.25))
      this.play('leaves', 0.25 * k, o(1, 0.2, 0.03))
    }
  },
  // in contact, grinding along something (each frame while it lasts): what, and how fast it slides
  contact (what, v) {
    this.contactT = this.ctx ? this.ctx.currentTime : 0
    this.contactK = Math.max(this.contactK, clamp(v / 10, 0.2, 1.2))
    this.contactWall = what !== 'car'
  },
  updateImpacts (st) {
    const { n, R } = this
    const on = this.now - this.contactT < 0.12
    const slide = st.airspeed
    if (!on) this.contactK = 0
    R(
      n.scrape.gain,
      on ? this.contactK * Math.min(1, slide / 4) * 0.35 : 0,
      on ? 0.02 : 0.07
    )
    if (n.scrapeSrc)
      R(
        n.scrapeSrc.playbackRate,
        clamp(0.55 + slide / 18, 0.55, 1.8) * st.pitch,
        0.08
      )
    R(n.scrapeBP.frequency, this.contactWall ? 1300 : 2000, 0.1)
  },
  // the tyres hitting the kerb going up it (a sharp slap, the wheel and suspension thumping, the
  // rim catching it at speed) or dropping off it (a softer thump)
  kerb (v, up) {
    const k = clamp(v / 14, 0.15, 1)
    if (up) {
      this.play('thud', 0.45 * k, { rate: 1.25, verb: 0.08 })
      this.play('thud', 0.2 * k, { rate: 2.4, lp: 3000, verb: 0.05 })
      if (v > 9) this.play('clank', 0.18 * k, { delay: 0.01, verb: 0.1 })
    } else this.play('thud', 0.3 * k, { rate: 0.9, verb: 0.06 })
  },
  // a wheel over a manhole's lid: the iron rocking in its frame
  clunk (v) {
    this.play('lid', 0.25 * clamp(v / 18, 0.25, 1), { verb: 0.15 })
  },
  // touching down (g: how hard): the tyres and springs taking it, the suspension bottoming out on a
  // hard one, and the floor scraping the ground on a very hard one
  thump (g) {
    const k = clamp(g / 3, 0.25, 1.4)
    this.play('thud', 0.6 * k, { rate: 0.75, verb: 0.2 })
    this.play('thud', 0.25 * k, { rate: 1.3, delay: 0.02 })
    if (g > 2.2)
      this.play('clank', 0.3 * Math.min(1, (g - 2) / 2), {
        delay: 0.025,
        verb: 0.15
      })
    if (g > 4)
      this.play('metal', 0.18, { rate: 0.7, delay: 0.04, lp: 2500, verb: 0.2 })
  },
  // a post snapping off at its foot (v: how hard, already scaled for distance): a pole's clang and
  // the base shearing, or a trunk splitting and its leaves thrashing
  snap (kind, v, pan = 0, world = false) {
    const k = clamp(v / 16, 0.05, 1),
      o = { pan: world ? pan : 0, world, verb: 0.35 }
    if (kind === 'tree' || kind === 'palm') {
      this.play('wood', 0.6 * k, o)
      this.play('leaves', 0.35 * k, { ...o, delay: 0.05 })
      this.play('thud', 0.45 * k, { ...o, rate: 0.65 })
    } else {
      this.play('pole', 0.45 * k, { ...o, rate: kind === 'signal' ? 0.7 : 1 })
      this.play('metal', 0.3 * k, { ...o, rate: 1.3, lp: 5000 })
      this.play('thud', 0.4 * k, o)
    }
  },
  // something long and heavy hitting the ground (k: 0 to 1, how loud from here)
  fall (kind, k, pan = 0) {
    if (k < 0.02) return
    const o = { pan, world: true, verb: 0.4 }
    if (kind === 'tree' || kind === 'palm') {
      this.play('leaves', 0.5 * k, o)
      this.play('thud', 0.45 * k, { ...o, rate: 0.55 })
      this.play('wood', 0.2 * k, { ...o, rate: 0.7, delay: 0.04 })
    } else {
      this.play('thud', 0.4 * k, { ...o, rate: 0.6 })
      this.play('pole', 0.3 * k, { ...o, rate: 0.85 })
      this.play('gravel', 0.08 * k, { ...o, delay: 0.05, lp: 3000 })
    }
  },
  // a crash: the body folding, the glass going, and the wreck grinding to a stop
  crash () {
    this.play('thud', 0.55, { rate: 0.6, verb: 0.3 })
    this.play('metal', 0.8, { rate: 0.8, verb: 0.4 })
    this.play('metal', 0.5, { rate: 0.65, delay: 0.06, verb: 0.4 })
    this.play('glass', 0.5, { delay: 0.03, verb: 0.4 })
    this.play('plastic', 0.4, { delay: 0.01 })
    this.play('gravel', 0.15, { delay: 0.25, rate: 0.7, lp: 3500, verb: 0.3 })
  }
}
