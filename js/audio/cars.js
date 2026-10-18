// The traffic round the camera, mixed into the SoundEngine (sound.js): six voices for the nearest
// cars, each handed to a car and kept on it while it stays near (a voice let go fades out before it
// is given to another car). Most cars burn petrol: an engine is a periodic wave on its cycle (two
// turns of the crank), with its firing order strong and the rest of the orders round it (a four's
// even thrum, a three's lumpy one, a V6's growl, a V8's burble), exhaust noise pulsing in time with
// it, and a lowpass that opens up with the throttle. Each engine has an automatic gearbox: it idles
// at the lights, the torque converter lets it rev on pulling away, it shifts up as the revs climb
// (sooner when it is gentle, later when it is pushed, dipping as each shift goes through) and down
// as it slows, on the overrun quieter and darker. The vans and buses are diesels, with a clatter
// and a turbo's whistle that spools up behind the throttle; the taxis are hybrids, quiet at low
// speed and starting their engine to pull away hard or to cruise; about a third of the cars are
// electric, a whine of their motor and, below 30 km/h, the soft hum that warns people on foot.
// Every car's tyres roar with its speed. Each voice is shifted by its doppler (its tyres' noise
// too), fades with its distance, loses its highs to the air the further off it is, is dulled and
// quietened when a building stands between it and the camera, and has more of it in the reverb the
// further it is.
import { clamp } from '../sim/constants.js'
import { wave, bandNoise } from './buffers.js'

const VOICES = 5
const AUTO6 = [405, 243, 162, 121, 95, 78] // rpm per m/s in each gear (overall ratio, tyre)
const AUTO5 = [361, 196, 144, 103, 77] // a bus's
// cyl: cylinders; idle rpm; w: its wave; k: how loud; dsl: a diesel; turbo
const ENGINES = {
  i4: { cyl: 4, idle: 760, w: 'i4', k: 1, gears: AUTO6 },
  i3: { cyl: 3, idle: 820, w: 'i3', k: 0.9, gears: AUTO6 },
  v6: { cyl: 6, idle: 680, w: 'v6', k: 1.1, gears: AUTO6, turbo: 0.4 },
  v8: { cyl: 8, idle: 620, w: 'v8', k: 1.5, gears: AUTO6 },
  dsl4: {
    cyl: 4,
    idle: 780,
    w: 'dsl',
    k: 1.3,
    gears: AUTO6,
    dsl: true,
    turbo: 1
  },
  dsl6: {
    cyl: 6,
    idle: 600,
    w: 'dsl6',
    k: 2.6,
    gears: AUTO5,
    dsl: true,
    turbo: 1.4
  },
  hybrid: { cyl: 4, idle: 1000, w: 'i4', k: 0.8, gears: AUTO6, hybrid: true }
}
const KIND = {
  sedan: 'i4',
  hatch: 'i3',
  suv: 'v6',
  taxi: 'hybrid',
  pickup: 'v8',
  van: 'dsl4',
  bus: 'dsl6',
  police: 'v6',
  sports: 'v8'
}
// the orders of each engine, as harmonics of its cycle (half the crank's turn rate): the firing
// order and its multiples strong, the rest (the cylinders never quite alike) round them
function engineWaves (ctx) {
  const w =
    (fire, extra, rich = 0.5) =>
    () => {
      const a = {}
      for (let k = 1; k <= 48; k++)
        a[k] =
          (k % fire === 0 ? 1.1 : 0.12 * rich) /
          Math.pow(k / fire, k % fire === 0 ? 0.9 : 0.6)
      Object.assign(a, extra)
      return wave(ctx, a)
    }
  const make = {
    i4: w(4, { 2: 0.3, 1: 0.12, 6: 0.18 }),
    i3: w(3, { 2: 0.45, 1: 0.3, 4: 0.2, 5: 0.15 }),
    v6: w(6, { 3: 0.5, 2: 0.25, 9: 0.35, 1: 0.12 }),
    v8: w(
      8,
      { 2: 0.6, 4: 0.55, 6: 0.45, 1: 0.25, 3: 0.35, 5: 0.25, 7: 0.25 },
      0.8
    ),
    dsl: w(4, { 2: 0.35, 1: 0.15 }, 1.6),
    dsl6: w(6, { 3: 0.3, 2: 0.2, 1: 0.1 }, 1.8),
    // an electric car's motor and gears (orders of its shaft), and its warning hum
    ev: () =>
      wave(ctx, {
        1: 0.05,
        6: 0.25,
        18: 0.15,
        17: 0.12,
        19: 0.12,
        34: 0.3,
        36: 0.2,
        54: 0.08
      }),
    avas: () => wave(ctx, { 1: 1, 2: 0.5, 3: 0.35, 4: 0.12, 5: 0.2, 7: 0.08 }),
    sine: () => wave(ctx, { 1: 1 })
  }
  // (each made the first time a car needs it: making a wave's tables takes a few milliseconds)
  const made = {}
  return name => made[name] || (made[name] = make[name]())
}

const listed = (cars, key) => {
  for (const c of cars) if (c.key === key) return true
  return false
}

export const CARS = {
  buildCars () {
    const { ctx, gain, filt, osc, loop } = this
    this.carWaves = engineWaves(ctx)
    // the exhaust's noise, a petrol engine's band and a diesel's, shared by every voice; the tyres'
    this.puffLo = loop(bandNoise(ctx, 2, 1100, 0.8, false, 31))
    this.puffHi = loop(bandNoise(ctx, 2, 2400, 0.8, false, 32))
    this.tyreNoise = bandNoise(ctx, 2, 900, 0.6, true, 33)
    this.carState = new Map()
    this.carVoices = []
    for (let i = 0; i < VOICES; i++) {
      const v = { car: null, freeAt: 0, kind: '' }
      v.out = gain(0)
      v.air = filt('lowpass', 20000, 0.5)
      v.pan = ctx.createStereoPanner()
      v.send = gain(0.2)
      v.out.connect(v.air).connect(v.pan)
      // the engine and its exhaust's pulsing noise (each level first, so a silent voice rests)
      v.eng = osc('sine', 20)
      v.engLP = filt('lowpass', 600, 1.2)
      v.engG = gain(0)
      v.eng.connect(v.engG).connect(v.engLP).connect(v.out)
      v.puff = gain(0)
      v.puffAM = gain(0.35)
      v.puffSrc = this.puffLo
      v.puffSrc.connect(v.puff).connect(v.puffAM)
      this.lane([v.puff.gain], v.puffAM, v.out)
      v.eng.connect(gain(0.65)).connect(v.puffAM.gain)
      // a motor's whine, or a turbo's whistle
      v.whine = osc('sine', 400)
      v.whineG = gain(0)
      v.whine.connect(v.whineG)
      this.lane([v.whineG.gain], v.whineG, v.out)
      // tyres (noise already filtered to their band, played faster or slower for the doppler)
      v.tyre = loop(this.tyreNoise)
      v.tyreG = gain(0)
      v.tyre.connect(v.tyreG)
      this.lane([v.tyreG.gain], v.tyreG, v.out)
      // (the whole voice joins the world only while it sounds)
      v.pan.connect(v.send)
      this.lane(
        [v.out.gain, v.engG.gain, v.puff.gain, v.whineG.gain, v.tyreG.gain],
        v.pan,
        this.world,
        v.send,
        this.verb
      )
      this.carVoices.push(v)
    }
  },
  // a car's engine state, kept while it is near: gear, revs, how hard it is pulling
  engineOf (c) {
    let s = this.carState.get(c.key)
    if (!s) {
      const kind = c.ev ? 'ev' : KIND[c.type] || 'i4'
      s = {
        kind,
        E: ENGINES[kind] || null,
        v: c.v,
        a: 0,
        gear: 0,
        rpm: 800,
        load: 0,
        shiftT: 0,
        boost: 0,
        on: 1,
        seed: Math.random() * 6.28,
        seen: 0
      }
      if (s.E) {
        while (s.gear < s.E.gears.length - 1 && c.v * s.E.gears[s.gear] > 2000)
          s.gear++
      }
      this.carState.set(c.key, s)
    }
    return s
  },
  // the automatic gearbox and the throttle, from how the car's speed is changing
  drive (s, c, dt) {
    // (the driver's own pedal, when the sim keeps it; otherwise from the change in speed)
    const E = s.E,
      a = Number.isFinite(c.acc) ? c.acc : (c.v - s.v) / Math.max(dt, 1e-3)
    s.v = c.v
    s.a += (clamp(a, -8, 6) - s.a) * Math.min(1, dt * 4)
    const big = E && E.gears === AUTO5
    const need = s.a + 0.15 + 0.0004 * c.v * c.v
    const load = s.a < -0.4 ? 0 : clamp(need / (big ? 1.2 : 2.4), 0.08, 1)
    s.load += (load - s.load) * Math.min(1, dt * 6)
    if (!E) return
    const g = E.gears
    // (backing up: the reverse gear, as low as first)
    if (c.rev) s.gear = 0
    let rpm = c.v * g[s.gear]
    const up = (big ? 1500 : 1700) + (big ? 600 : 2300) * s.load,
      down = (big ? 900 : 1050) + 600 * s.load
    if (rpm > up && s.gear < g.length - 1 && !c.rev) {
      s.gear++
      s.shiftT = big ? 0.5 : 0.3
    } else if (rpm < down && s.gear > 0) {
      s.gear--
      s.shiftT = 0.2
    }
    s.shiftT = Math.max(0, s.shiftT - dt)
    rpm = c.v * g[s.gear]
    // the torque converter slipping as it pulls away, and the idle, never quite steady
    const slip = s.load * (big ? 700 : 1500) * clamp(1 - c.v / 5, 0, 1)
    const idle = E.idle * (1 + 0.012 * Math.sin(this.now * 1.7 + s.seed))
    s.rpm = Math.max(idle + slip, rpm)
    // a hybrid runs on its battery at low speed, starting its engine to pull away hard or to cruise
    if (E.hybrid)
      s.on += ((s.load > 0.5 || c.v > 12 ? 1 : 0) - s.on) * Math.min(1, dt * 3)
    if (E.turbo)
      s.boost +=
        (s.load * clamp(s.rpm / 2600, 0, 1.3) - s.boost) * Math.min(1, dt * 1.8)
  },
  // st.cars: [{ key, d, pan, doppler, v, type, ev, occl }], nearest first
  updateCars (st) {
    const R = this.R,
      cars = st.cars || [],
      ps = st.pitch,
      dt = st.dt
    const voices = this.carVoices
    for (const v of voices) {
      if (v.car !== null && !listed(cars, v.car)) {
        v.car = null
        v.freeAt = this.now + 0.25
      }
      // (a free voice falls silent, and once it is, rests)
      if (v.car === null) {
        R(v.out.gain, 0, 0.04)
        R(v.engG.gain, 0, 0.04)
        R(v.puff.gain, 0, 0.04)
        R(v.whineG.gain, 0, 0.04)
        R(v.tyreG.gain, 0, 0.04)
      }
    }
    for (const c of cars) {
      const s = this.engineOf(c)
      s.seen = this.now
      this.drive(s, c, dt)
      let v = null
      for (const x of voices) if (x.car === c.key) v = x
      if (!v) {
        for (const x of voices)
          if (!v && x.car === null && this.now >= x.freeAt) v = x
        if (!v) continue
        v.car = c.key
        v.fresh = true
        if (v.kind !== s.kind) {
          v.kind = s.kind
          const src = s.E && s.E.dsl ? this.puffHi : this.puffLo
          if (src !== v.puffSrc) {
            v.puffSrc.disconnect(v.puff)
            v.puffSrc = src
            src.connect(v.puff)
          }
          v.eng.setPeriodicWave(this.carWaves(s.kind === 'ev' ? 'avas' : s.E.w))
          v.whine.setPeriodicWave(
            this.carWaves(s.kind === 'ev' ? 'ev' : 'sine')
          )
        }
      }
      this.voice(v, s, c, ps)
    }
    // forget engines that have been out of earshot for a while
    if (this.carState.size > 40)
      for (const [k, s] of this.carState)
        if (this.now - s.seen > 5) this.carState.delete(k)
  },
  voice (v, s, c, ps) {
    // (pitches jump straight to the new car's on a voice just handed to it; levels ease in)
    const R = this.R,
      F = v.fresh ? (p, x) => this.J(p, x) : R,
      E = s.E,
      dop = c.doppler * ps,
      sp = c.v
    if (E) {
      const fire = (s.rpm / 120) * dop
      const shift = s.shiftT > 0 ? 0.35 : 1
      const load = s.load * shift
      const lvl =
        E.k *
        s.on *
        (0.2 + 0.8 * load) *
        (0.55 + 0.45 * Math.min(1.5, s.rpm / 2500))
      F(v.eng.frequency, fire, s.shiftT > 0 ? 0.06 : 0.05)
      F(v.engLP.frequency, (250 + s.rpm * (0.12 + 0.5 * load)) * dop, 0.06)
      R(v.engG.gain, lvl * 0.12, 0.05)
      R(v.puff.gain, lvl * 0.12 * (E.dsl ? 0.5 : 0.18) * (0.3 + load), 0.08)
      // a turbo's whistle (a hybrid's electric whine, under the engine)
      const t = E.turbo || 0
      // (backing up, the reverse gear's straight-cut teeth whine instead)
      const rev = c.rev && sp > 0.3
      F(
        v.whine.frequency,
        (rev
          ? (s.rpm / 60) * 17
          : E.hybrid
          ? 40 + sp * 30
          : 2400 + s.boost * 4200) * dop,
        0.1
      )
      R(
        v.whineG.gain,
        rev
          ? 0.012 * Math.min(1, sp / 2)
          : E.hybrid
          ? (1 - s.on) * 0.004 * Math.min(1, sp / 3)
          : t * s.boost * 0.006,
        0.1
      )
    } else {
      // electric: the warning hum under 30 km/h, and the motor's whine
      const avas = clamp(1 - (sp - 6) / 3, 0, 1) * Math.min(1, 0.4 + sp)
      F(v.eng.frequency, (110 + sp * 14) * dop, 0.08)
      F(v.engLP.frequency, 1600, 0.2)
      R(v.engG.gain, avas * 0.03, 0.1)
      R(v.puff.gain, 0, 0.1)
      F(v.whine.frequency, (sp / 2.07) * 9 * dop, 0.05)
      R(v.whineG.gain, Math.min(1, sp / 4) * (0.2 + 0.8 * s.load) * 0.03, 0.08)
    }
    // tyres: about v^1.8, a bus's louder; a car knocked sliding on locked tyres scrubs and howls,
    // and a startled driver stamping on the brakes makes them squeal
    const big = c.type === 'bus' || c.type === 'van'
    const roll = Math.min(1.5, Math.pow(sp / 14, 1.8)) * (big ? 0.4 : 0.25)
    const stamp = !c.loose && c.panic && sp > 4 && s.a < -4
    R(
      v.tyreG.gain,
      c.loose
        ? Math.min(1, sp / 6) * 0.9
        : stamp
        ? Math.min(1, sp / 10) * 1.4
        : roll,
      0.05
    )
    // (the band, at 900 Hz, played slower for a bus's or a wreck's scrub, faster for a screech)
    const band = c.loose ? 0.65 + sp * 0.02 : stamp ? 1.2 : big ? 0.78 : 1
    F(v.tyre.playbackRate, clamp(dop * band, 0.4, 2.2), 0.05)
    // distance, the air and walls in the way, left or right
    const near = Math.min(1.4, 6 / Math.max(c.d, 2.5))
    R(v.out.gain, near * (1 - 0.6 * c.occl), 0.06)
    F(
      v.air.frequency,
      clamp(20000 * Math.exp(-c.d / 90), 2200, 20000) *
        (1 - 0.85 * c.occl) *
        (1 - 0.35 * (c.back || 0)),
      0.08
    )
    F(v.pan.pan, c.pan, 0.06)
    R(v.send.gain, clamp(0.15 + c.d / 70 + c.occl * 0.3, 0, 0.8), 0.2)
    v.fresh = false
  }
}
