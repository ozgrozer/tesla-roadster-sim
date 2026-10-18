// The radio's instruments, synthesised note by note: an 808-style kick and a snare, claps and hats
// from noise, a sawtooth bass with its filter swept by each note, a pad of detuned sawtooths, a
// plucked arpeggio, a gliding lead, and an electric piano made by frequency modulation (a tine's
// bell over a soft body, as a Rhodes sounds). Each takes the time to start at, so the radio can lay
// its notes down a moment ahead of the music (radio.js), and frees its nodes once the note is over.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12)

// an envelope on a gain: up to `peak` in `a` s, down to `sus` of it with time constant `d`, then
// released from `end` over time constant `r`; returns when it is silent
function env (g, t, peak, a, d, sus, end, r) {
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setTargetAtTime(peak * sus, t + a, d)
  g.gain.setTargetAtTime(0, Math.max(end, t + a), r)
  return Math.max(end, t + a) + r * 6
}
function osc (ctx, type, f, t, stop) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.start(t)
  o.stop(stop)
  return o
}
function noiseSrc (ctx, buf, t, stop) {
  const s = ctx.createBufferSource()
  s.buffer = buf
  s.start(t, Math.random() * (buf.duration - 1))
  s.stop(stop)
  return s
}
const filt = (ctx, type, f, q = 0.7) => {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

// kick: a sine swept down from the beater's click to the drum's body
export function kick (ctx, out, t, vel, low = 48) {
  const end = t + 0.5
  const o = osc(ctx, 'sine', 150, t, end)
  o.frequency.exponentialRampToValueAtTime(low, t + 0.09)
  const g = ctx.createGain()
  env(g, t, 0.9 * vel, 0.002, 0.18, 0, t + 0.002, 0.12)
  o.connect(g).connect(out)
  // (the click)
  const c = osc(ctx, 'triangle', 1200, t, t + 0.02)
  const cg = ctx.createGain()
  env(cg, t, 0.12 * vel, 0.001, 0.004, 0, t, 0.004)
  c.connect(cg).connect(out)
}

// snare: a drum's two body modes under a burst of the wires' noise
export function snare (ctx, out, t, vel, noise, tone = 190) {
  const end = t + 0.45
  const n = noiseSrc(ctx, noise, t, end)
  const bp = filt(ctx, 'bandpass', 2400, 0.8)
  const g = ctx.createGain()
  env(g, t, 0.55 * vel, 0.001, 0.07, 0, t, 0.06)
  n.connect(bp).connect(g).connect(out)
  for (const f of [tone, tone * 1.62]) {
    const o = osc(ctx, 'triangle', f * 1.3, t, end)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03)
    const og = ctx.createGain()
    env(og, t, 0.3 * vel, 0.001, 0.035, 0, t, 0.03)
    o.connect(og).connect(out)
  }
}

// clap: a few quick slaps of noise, then the room's tail
export function clap (ctx, out, t, vel, noise) {
  const n = noiseSrc(ctx, noise, t, t + 0.5)
  const bp = filt(ctx, 'bandpass', 1500, 1.4)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  for (let i = 0; i < 3; i++) {
    g.gain.setValueAtTime(0.55 * vel, t + i * 0.011)
    g.gain.setTargetAtTime(0.05 * vel, t + i * 0.011 + 0.001, 0.003)
  }
  g.gain.setValueAtTime(0.4 * vel, t + 0.034)
  g.gain.setTargetAtTime(0, t + 0.034, 0.06)
  n.connect(bp).connect(g).connect(out)
}

// hat: bright noise, closed short or open ringing
export function hat (ctx, out, t, vel, noise, open = false) {
  const len = open ? 0.12 : 0.025
  const n = noiseSrc(ctx, noise, t, t + len * 8)
  const hp = filt(ctx, 'highpass', 7500, 0.7)
  const pk = filt(ctx, 'peaking', 10500, 1.5)
  pk.gain.value = 6
  const g = ctx.createGain()
  env(g, t, 0.22 * vel, 0.001, len, 0, t, len)
  n.connect(hp).connect(pk).connect(g).connect(out)
}

// bass: a sawtooth and a sine an octave down, the filter opening with each note and closing again
export function bass (ctx, out, t, midi, dur, vel, bright = 600) {
  const f = mtof(midi),
    end = t + dur + 0.3
  const lp = filt(ctx, 'lowpass', bright, 4)
  lp.frequency.setValueAtTime(bright * 2.8, t)
  lp.frequency.setTargetAtTime(bright, t, 0.06)
  const g = ctx.createGain()
  const stop = env(g, t, 0.42 * vel, 0.004, 0.2, 0.75, t + dur, 0.03)
  osc(ctx, 'sawtooth', f, t, stop).connect(lp)
  const sub = osc(ctx, 'sine', f / 2, t, stop)
  const sg = ctx.createGain()
  sg.gain.value = 0.7
  sub.connect(sg).connect(g)
  lp.connect(g).connect(out)
}

// pad: each chord note two sawtooths a few cents apart, softly filtered, swelling in and fading
export function pad (ctx, out, t, notes, dur, vel, bright = 1800) {
  const lp = filt(ctx, 'lowpass', bright, 0.5)
  const g = ctx.createGain()
  const stop = env(g, t, 0.075 * vel, 0.35, 0.8, 0.85, t + dur, 0.45)
  for (const m of notes)
    for (const c of [-7, 7]) {
      const o = osc(ctx, 'sawtooth', mtof(m), t, stop)
      o.detune.value = c
      o.connect(lp)
    }
  lp.connect(g).connect(out)
}

// pluck: a square (or sawtooth) note with a filter that closes fast, for arpeggios
export function pluck (ctx, out, t, midi, dur, vel, type = 'square') {
  const lp = filt(ctx, 'lowpass', 3800, 2)
  lp.frequency.setValueAtTime(5200, t)
  lp.frequency.setTargetAtTime(900, t, 0.07)
  const g = ctx.createGain()
  const stop = env(g, t, 0.12 * vel, 0.002, 0.09, 0.25, t + dur, 0.05)
  osc(ctx, type, mtof(midi), t, stop).connect(lp)
  lp.connect(g).connect(out)
}

// lead: a sawtooth with a fifth above it, gliding from the last note, vibrato after it settles
export function lead (ctx, out, t, midi, dur, vel, from = midi) {
  const f = mtof(midi)
  const g = ctx.createGain()
  const stop = env(g, t, 0.13 * vel, 0.02, 0.4, 0.7, t + dur, 0.12)
  const lp = filt(ctx, 'lowpass', 2600, 1.2)
  const vib = osc(ctx, 'sine', 5.2, t, stop)
  const depth = ctx.createGain()
  depth.gain.setValueAtTime(0, t)
  depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(dur, 0.6))
  vib.connect(depth)
  for (const [k, lvl] of [
    [1, 1],
    [1.5, 0.25]
  ]) {
    const o = osc(ctx, 'sawtooth', mtof(from) * k, t, stop)
    o.frequency.setTargetAtTime(f * k, t, 0.03)
    depth.connect(o.frequency)
    const og = ctx.createGain()
    og.gain.value = lvl
    o.connect(og).connect(lp)
  }
  lp.connect(g).connect(out)
}

// electric piano: each note a sine modulated by a sine at its own pitch (the body, the brightness
// falling away as the note rings) and a short high bell (the tine)
export function epiano (ctx, out, t, notes, dur, vel) {
  const g = ctx.createGain()
  const stop = env(g, t, 0.11 * vel, 0.003, 0.9, 0.35, t + dur, 0.25)
  for (const m of notes) {
    const f = mtof(m)
    const car = osc(ctx, 'sine', f, t, stop)
    const mod = osc(ctx, 'sine', f, t, stop)
    const idx = ctx.createGain()
    idx.gain.setValueAtTime(f * 1.6 * vel, t)
    idx.gain.setTargetAtTime(f * 0.25, t, 0.25)
    mod.connect(idx).connect(car.frequency)
    car.connect(g)
    const tine = osc(ctx, 'sine', f * 7, t, t + 0.6)
    const tg = ctx.createGain()
    env(tg, t, 0.18, 0.001, 0.05, 0, t, 0.05)
    tine.connect(tg).connect(g)
  }
  g.connect(out)
}

// a stab: a chord's short organ-like hit (sawtooths through a resonant filter), for house
export function stab (ctx, out, t, notes, vel) {
  const lp = filt(ctx, 'lowpass', 2200, 3)
  lp.frequency.setValueAtTime(3200, t)
  lp.frequency.setTargetAtTime(900, t, 0.08)
  const g = ctx.createGain()
  const stop = env(g, t, 0.08 * vel, 0.003, 0.1, 0.2, t + 0.12, 0.08)
  for (const m of notes) osc(ctx, 'sawtooth', mtof(m), t, stop).connect(lp)
  lp.connect(g).connect(out)
}
