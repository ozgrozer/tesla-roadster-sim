// Sound, synthesised with Web Audio (nothing to download). This is the engine: the context, the
// buses and the master chain, the thrusters, fan and horn; the rest is mixed in from its own
// module: buffers.js (the noise and sample bank, built at start-up), space.js (where things are
// heard from: the car's place, the canopy, the reverb and the walls' echo), motor.js (the drive
// units), tyres.js (rolling, squealing, the wind), impacts.js (knocks, crashes, scrapes), shots.js
// (one-shots: horns, air brakes, birds, locks), cars.js (the traffic's engines and tyres),
// street.js (the city's bed: far traffic, wind, surf, birds, crickets), ambience.js (sirens,
// dogs, building work and the people on the pavement), rain.js (the rain, the drumming on the
// canopy, the tyres in the water, the thunder) and air.js (the helicopter and the airliners).
import { CARS } from './cars.js'
import { SPACE } from './space.js'
import { DRIVE } from './motor.js'
import { TYRES } from './tyres.js'
import { Radio } from './radio.js'
import { STREET } from './street.js'
import { IMPACTS } from './impacts.js'
import { AMBIENCE } from './ambience.js'
import { WEATHER_SOUND } from './rain.js'
import { AIRCRAFT_SOUND } from './air.js'
import { ONE_SHOTS, HORNS } from './shots.js'
import { noises, bank, wobble, wave } from './buffers.js'

export class SoundEngine {
  constructor () {
    this.ctx = null
    this.enabled = false
    this.userMuted = false
    this.hornOn = false
    this.thr = 0 // last frame's thrust, for the burst as the valves open
    this.now = 0
    this.ps = 1
    // set an AudioParam smoothly towards v (time constant tc), skipping it when it is already there
    this.R = (p, v, tc = 0.06) => {
      if (!Number.isFinite(v)) return
      if (Math.abs(v - (p.__to ?? NaN)) <= 3e-3 * Math.abs(v) + 1e-5) {
        // (silent, and settled by now: exactly zero, so the filters it feeds can rest; Web Audio
        // skips work on silence, but a level still easing towards zero is never quite silent)
        if (v === 0 && !p.__rest && this.now - p.__at > 7 * p.__tc) {
          p.cancelScheduledValues(this.now)
          p.setValueAtTime(0, this.now)
          p.__rest = true
        }
        return
      }
      p.__to = v
      p.__at = this.now
      p.__tc = tc
      // (a level waking from rest may need its lane back: see gateLanes)
      if (p.__rest) this.stirred = true
      p.__rest = false
      p.setTargetAtTime(v, this.now, tc)
    }
  }
  // set an AudioParam to v at once (a voice just handed to a new source, so it doesn't glide there)
  J (p, v) {
    if (!Number.isFinite(v)) return
    p.cancelScheduledValues(this.now)
    p.setValueAtTime(v, this.now)
    p.__to = v
    p.__at = this.now
    p.__tc = 0.01
    p.__rest = false
  }
  ensure () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.live) this.ctx.resume()
      return true
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    const ctx = (this.ctx = new AC())
    // (an offline context, for rendering to a buffer, can't be resumed and wants its samples at
    // once)
    const Off = window.OfflineAudioContext
    this.live = !(Off && ctx instanceof Off)
    if (this.live) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.pause()
      })
      // (frames stop without the tab being hidden too, or stall: a third of a second without one
      // fades the sound out, two seconds stop the context)
      this.lastUpdate = performance.now()
      setInterval(() => {
        const now = performance.now(),
          idle = now - this.lastUpdate
        // (and a context started again while paused, by a key press during a stall, say, is
        // stopped again)
        if (this.paused) {
          if (this.ctx.state === 'running' && now - this.pausedAt > 100)
            this.ctx.suspend()
          return
        }
        if (!this.enabled || idle < 330) return
        if (idle > 2000) this.pause()
        else if (!this.hushed) {
          this.hushed = true
          this.master.gain.cancelScheduledValues(this.ctx.currentTime)
          this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
        }
      }, 250)
    }
    Object.assign(this, noises(ctx))
    this.bank = bank(ctx, !this.live)
    // slow gusts (and the asphalt's patches), a tyre's chatter, and a quicker flutter
    this.gust = wobble(ctx, 24, 0.06, 1.2, 3)
    this.chatter = wobble(ctx, 2, 12, 70, 5, 6000)
    this.flutter = wobble(ctx, 4, 3, 16, 7)
    this.syllables = wobble(ctx, 6, 2.5, 7, 9)
    this.hornWave = wave(ctx, hornHarmonics(24, 1.1, false))
    this.airHornWave = wave(ctx, hornHarmonics(16, 1, true))
    const n = (this.n = {})
    this.loop = buf => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.start(0, Math.random() * buf.duration)
      return s
    }
    this.gain = (v = 0) => {
      const g = ctx.createGain()
      g.gain.value = v
      return g
    }
    this.filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter()
      b.type = type
      b.frequency.value = f
      b.Q.value = q
      return b
    }
    this.osc = (type, f) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      o.start()
      return o
    }
    const { gain, filt, osc } = this
    // one source of each noise, shared by everything that filters it its own way
    const src = (this.src = {})
    for (const k of ['white', 'pink', 'brown']) src[k] = this.loop(this[k])
    this.lanes = []
    this.buildSpace()
    this.buildDrive()
    this.buildTyres()
    this.buildImpacts()
    // cold-gas thrusters: supersonic hiss plus low roar
    // (each level comes first, so whatever is silent rests: see R)
    n.hiss = gain(0)
    n.hissHP = filt('highpass', 1600, 0.6)
    src.white.connect(n.hiss).connect(n.hissHP)
    this.lane([n.hiss.gain], n.hissHP, this.carBus)
    n.roar2 = gain(0)
    n.roarLP2 = filt('lowpass', 420, 0.7)
    src.brown.connect(n.roar2).connect(n.roarLP2)
    this.lane([n.roar2.gain], n.roarLP2, this.carBus)
    // and the crackle of the shocks in a supersonic jet, at full thrust
    n.crackle = gain(0)
    this.lane(
      [n.crackle.gain],
      n.crackle.connect(filt('highpass', 900, 0.6)),
      this.carBus
    )
    this.bank.ready('gravel', b => {
      n.crackleSrc = this.loop(b)
      n.crackleSrc.playbackRate.value = 1.7
      n.crackleSrc.connect(n.crackle)
    })
    // suction fan: turbine whir
    n.fan = gain(0)
    n.fanAir = gain(0)
    n.fanO = osc('sawtooth', 130)
    n.fanBP = filt('bandpass', 260, 4)
    n.fanO.connect(n.fan).connect(n.fanBP)
    this.lane([n.fan.gain], n.fanBP, this.carBus)
    const whir = filt('bandpass', 900, 1.2)
    src.white.connect(n.fanAir).connect(whir)
    this.lane([n.fanAir.gain], whir, this.carBus)
    // the horn: a pair of disc horns a major third apart, bright with the diaphragm's harmonics
    n.horn = gain(0)
    const bite = filt('peaking', 2900, 1.1)
    bite.gain.value = 7
    n.hornO = HORNS[0].map(f => {
      const o = osc('sine', f)
      o.setPeriodicWave(this.hornWave)
      o.connect(n.horn)
      return o
    })
    // (connected only while it sounds, and a moment after)
    n.hornOn = gain(0)
    n.horn.connect(n.hornOn).connect(bite)
    this.lane(
      [n.hornOn.gain],
      bite,
      this.carBus,
      bite.connect(gain(0.4)),
      this.verb
    )
    this.hornOff = 0
    // the desert's breath at the test site
    n.desert = gain(0)
    this.lane(
      [n.desert.gain],
      src.white.connect(n.desert).connect(filt('bandpass', 380, 0.3)),
      this.world
    )
    this.buildCars()
    this.buildStreet()
    this.buildAmbience()
    this.radio = this.radio || new Radio(this)
    return true
  }
  // N, or the sound button: on fades in (and the street's watchers start afresh); off fades out and
  // then stops the context, so nothing runs (or piles up) while it is muted
  setEnabled (on) {
    this.enabled = on && this.ensure()
    if (!this.ctx) return
    if (this.enabled) this.wake()
    else this.pause()
  }
  // Pausing: a quick fade, then the context stopped. Hiding the tab does it (no more frames to set
  // the levels from: the last frame's would drone on), as do two seconds without a frame.
  pause () {
    if (!this.ctx || !this.live || this.paused) return
    this.paused = true
    this.pausedAt = performance.now()
    const g = this.master.gain,
      t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(0, t, 0.006)
    setTimeout(() => {
      if (this.paused && this.ctx.state === 'running') this.ctx.suspend()
    }, 40)
  }
  // and back: the context running again, the master faded in, and st.fresh for the mix (what it
  // remembered from before the pause, the pass-bys and the brakes, is stale)
  wake () {
    this.paused = this.hushed = false
    this.fresh = true
    this.lastUpdate = performance.now()
    if (this.live && this.ctx.state !== 'running') this.ctx.resume()
    const g = this.master.gain,
      t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(0.8, t, 0.08)
  }
  // whether a one-shot may start now (not while the context is stopped: they would all go off at
  // once when it starts again)
  playing () {
    return (
      !!this.ctx &&
      this.enabled &&
      !this.paused &&
      (this.ctx.state === 'running' || !this.live)
    )
  }
  // hold H: the horn sounds for as long as it is held
  horn (on) {
    this.hornOn = on
    if (!this.ctx || !this.enabled) return
    const g = this.n.horn.gain,
      t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    if (on) {
      // (the diaphragm's first swing overshoots the pitch a little)
      for (const o of this.n.hornO) {
        o.frequency.cancelScheduledValues(t)
        o.frequency.setValueAtTime(o.frequency.value * 1.02, t)
        o.frequency.setTargetAtTime(o.frequency.value, t + 0.002, 0.012)
      }
      g.setTargetAtTime(0.11, t, 0.004)
    } else {
      g.setTargetAtTime(0, t, 0.02)
      g.setValueAtTime(0, t + 0.25)
      this.hornOff = t + 0.3
    }
  }
  // A lane is the last connection (or connections: node, destination, ...) of a layer, made only
  // while any of its levels is above zero. A node whose gain is zero still has everything before it
  // processed, every sample; a disconnected one has nothing processed at all.
  lane (levels, ...outs) {
    const l = { levels, outs, on: true }
    for (let i = 0; i < outs.length; i += 2) outs[i].connect(outs[i + 1])
    this.lanes.push(l)
    return l
  }
  // once a frame: lanes whose levels have all come to rest at zero (see R) are let go, and taken up
  // again as soon as one of them is raised
  // (checked every fourth frame for lanes to let go, and at once when a level wakes)
  gateLanes () {
    if (!this.stirred && (this.frame & 3) !== 0) return
    this.stirred = false
    for (const l of this.lanes) {
      let live = false
      for (const p of l.levels)
        if (!p.__rest) {
          live = true
          break
        }
      if (live === l.on) continue
      l.on = live
      for (let i = 0; i < l.outs.length; i += 2) {
        try {
          if (live) l.outs[i].connect(l.outs[i + 1])
          else l.outs[i].disconnect(l.outs[i + 1])
        } catch (e) {}
      }
    }
  }
  update (st) {
    if (!this.ctx || !this.enabled) return
    this.lastUpdate = performance.now()
    // (a hidden tab stays paused even if its frames go on)
    if (this.live && document.hidden) return this.pause()
    if (this.paused || this.hushed) this.wake()
    if (this.live && this.ctx.state !== 'running') return
    const n = this.n,
      R = this.R
    this.now = this.ctx.currentTime
    this.frame = (this.frame || 0) + 1
    this.ps = st.pitch
    const ps = st.pitch
    // The car, its tyres and its motors are set every frame; the world round it (where the car is
    // heard from, the traffic, the city's life) on the frames the mix marks st.world, every other
    // one (with st.worldDt, the time since the last), and the city's bed every other world frame.
    const dt = st.dt,
      world = st.world !== false
    if (world || st.cut) {
      st.dt = st.worldDt || dt
      this.updateSpace(st)
      st.dt = dt
    }
    this.updateDrive(st)
    this.updateTyres(st)
    this.updateImpacts(st)
    const thr = st.main * 0.55 + st.lift * 0.6 + st.side * 0.2
    R(n.hiss.gain, Math.min(0.7, thr * 0.5), 0.03)
    R(n.roar2.gain, Math.min(0.8, (st.main + st.lift) * 0.45), 0.04)
    R(n.crackle.gain, Math.max(0, st.main + st.lift - 0.4) * 0.35, 0.05)
    if (thr > 0) {
      R(n.hissHP.frequency, 1300 * ps + 400 * thr)
      R(n.roarLP2.frequency, (300 + 250 * thr) * ps)
    }
    // the valves opening, and slamming shut
    if (thr > 0.25 && this.thr < 0.06) this.ignite(thr)
    else if (thr < 0.04 && this.thr > 0.3) this.shutoff()
    this.thr = thr
    R(n.fan.gain, st.suction * 0.07, 0.2)
    R(n.fanAir.gain, st.suction * 0.035, 0.2)
    if (st.suction > 0) {
      R(n.fanO.frequency, (60 + st.suction * 120) * ps, 0.3)
      R(n.fanBP.frequency, (120 + st.suction * 260) * ps, 0.3)
    }
    R(n.desert.gain, st.city ? 0 : 0.02, 0.5)
    R(n.hornOn.gain, this.hornOn || this.now < this.hornOff ? 1 : 0, 0.005)
    if (world) {
      st.dt = st.worldDt || dt
      this.updateCars(st)
      this.updateAmbience(st)
      this.updateRain(st)
      this.updateAir(st)
      this.slowDt = (this.slowDt || 0) + st.dt
      if ((this.worlds = (this.worlds || 0) + 1) & 1) {
        st.dt = this.slowDt
        this.updateStreet(st)
        this.slowDt = 0
      }
      st.dt = dt
    }
    this.radio.update(st.inside)
    this.gateLanes()
  }
  // B: the radio tuned to its next station, or off after the last; the station (null: off), or
  // undefined with the sound off
  tuneRadio () {
    if (!this.enabled || !this.ensure()) return undefined
    return this.radio.tune()
  }
}
// a disc horn's spectrum: every harmonic, falling off slowly, the diaphragm slapping its stop
// making it buzzy; an air horn's bell favours the odd ones
function hornHarmonics (n, tilt, odd) {
  const a = {}
  for (let k = 1; k <= n; k++)
    a[k] =
      (odd && k % 2 === 0 ? 0.45 : 1) * Math.pow(k, -tilt) * (k < 4 ? 1 : 1.4)
  return a
}
Object.assign(
  SoundEngine.prototype,
  SPACE,
  DRIVE,
  TYRES,
  IMPACTS,
  ONE_SHOTS,
  CARS,
  STREET,
  AMBIENCE,
  WEATHER_SOUND,
  AIRCRAFT_SOUND
)
