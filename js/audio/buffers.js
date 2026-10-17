// Sample buffers synthesised once at start-up (nothing to download): loopable noise in three
// colours, slow and fast random modulators (gusts, a tyre's stick-slip, the rhythm of speech), and
// a bank of short recordings-to-be built from physics: sheet steel ringing and buckling, glass
// shattering, a plastic bumper cracking, tyres and suspension thudding, metal grinding along
// concrete, wood splitting, leaves, gravel and sand, footsteps and a lamp post's clang. Each is
// made by summing damped modes (what a struck panel or tube rings with) and bursts of filtered
// noise (what breaks, scrapes and crackles), from a seeded random sequence so every start-up sounds
// the same.

// a small seeded random generator (mulberry32)
export function rng (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// fold the tail of a (n + fade samples) over its head, so it loops without a seam
function loopable (a, n, fade) {
  for (let i = 0; i < fade; i++) {
    const w = i / fade
    a[i] = a[i] * Math.sqrt(w) + a[n + i] * Math.sqrt(1 - w)
  }
  return a.subarray(0, n)
}
function toBuffer (ctx, chans, sr = ctx.sampleRate) {
  const b = ctx.createBuffer(chans.length, chans[0].length, sr)
  chans.forEach((c, i) => b.getChannelData(i).set(c))
  return b
}
function normalize (a, peak = 0.9) {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]))
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m
  return a
}

// white, pink and brown noise, 2 s each, seamless
export function noises (ctx) {
  const sr = ctx.sampleRate,
    n = sr * 2,
    fade = Math.floor(sr * 0.05),
    R = rng(11)
  const w = new Float32Array(n + fade),
    p = new Float32Array(n + fade),
    b = new Float32Array(n + fade)
  let last = 0,
    b0 = 0,
    b1 = 0,
    b2 = 0
  for (let i = 0; i < n + fade; i++) {
    const x = R() * 2 - 1
    w[i] = x
    last = (last + 0.02 * x) / 1.02
    b[i] = last * 3.5
    b0 = 0.99765 * b0 + x * 0.099
    b1 = 0.963 * b1 + x * 0.2965
    b2 = 0.57 * b2 + x * 1.0526
    p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2
  }
  return {
    white: toBuffer(ctx, [loopable(w, n, fade)]),
    pink: toBuffer(ctx, [loopable(p, n, fade)]),
    brown: toBuffer(ctx, [loopable(b, n, fade)])
  }
}

// Noise (white, or pink) already through a bandpass at f Hz (the same filter as a BiquadFilter's, 0 dB
// at its peak), seamless: for voices that would otherwise each run the same filter.
export function bandNoise (ctx, sec, f, q, pink, seed) {
  const sr = ctx.sampleRate,
    n = Math.floor(sr * sec),
    fade = Math.floor(sr * 0.05),
    a = new Float32Array(n + fade),
    R = rng(seed)
  const w = (6.283185 * f) / sr,
    al = Math.sin(w) / (2 * q),
    a0 = 1 + al,
    a1 = -2 * Math.cos(w),
    a2 = 1 - al
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0,
    p0 = 0,
    p1 = 0,
    p2 = 0
  for (let i = 0; i < n + fade; i++) {
    let x = R() * 2 - 1
    if (pink) {
      p0 = 0.99765 * p0 + x * 0.099
      p1 = 0.963 * p1 + x * 0.2965
      p2 = 0.57 * p2 + x * 1.0526
      x = (p0 + p1 + p2 + x * 0.1848) * 0.2
    }
    const y = (al * x - al * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    a[i] = y
  }
  return toBuffer(ctx, [loopable(a, n, fade)])
}

// A random wobble that loops seamlessly: a sum of sinusoids, each a whole number of cycles over the
// loop, with random phases, between lo and hi Hz, about -1 to 1. Played into an AudioParam it moves
// it the way gusts, chatter or speech do, never repeating within the loop.
export function wobble (ctx, sec, lo, hi, seed, sr = 3000) {
  // (summed at eight points per cycle of its fastest part, then drawn out to the buffer's rate)
  const n = Math.floor(sec * Math.max(64, hi * 8)),
    a = new Float32Array(n + 1),
    R = rng(seed)
  const k0 = Math.max(1, Math.round(lo * sec)),
    k1 = Math.round(hi * sec),
    step = Math.max(1, Math.floor((k1 - k0) / 40))
  for (let k = k0; k <= k1; k += step) {
    const ph = R() * 6.283,
      amp = (0.6 + 0.8 * R()) / Math.sqrt(k / k0),
      w = (6.283185 * k) / n,
      c = Math.cos(w),
      s = Math.sin(w)
    // (turning a phasor round rather than calling sin for every sample)
    let x = Math.cos(ph),
      y = Math.sin(ph)
    for (let i = 0; i < n; i++) {
      a[i] += amp * y
      const t = x * c - y * s
      y = x * s + y * c
      x = t
    }
  }
  a[n] = a[0]
  const m = Math.floor(sec * sr),
    out = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    const u = (i * n) / m,
      j = Math.floor(u)
    out[i] = a[j] + (a[j + 1] - a[j]) * (u - j)
  }
  return toBuffer(ctx, [normalize(out, 1)], sr)
}
// run fn when the page has a moment to spare (between frames), or at once
export function later (fn, now = false) {
  if (now) return fn()
  if (typeof requestIdleCallback === 'function')
    requestIdleCallback(fn, { timeout: 300 })
  else setTimeout(fn, 16)
}

// ---------- building blocks for the struck, broken and scraped ----------
// a damped mode: a sinusoid at f Hz dying away over d s (to 1/e), starting at t s
function mode (a, sr, t, f, d, amp) {
  const i0 = Math.floor(t * sr)
  if (f >= sr / 2 || i0 >= a.length) return
  const r = Math.exp(-1 / (d * sr)),
    w = (6.283185 * f) / sr,
    c = 2 * r * Math.cos(w),
    r2 = r * r
  const end = Math.min(a.length, i0 + Math.ceil(d * sr * 7))
  let y1 = 0,
    y2 = 0
  for (let i = i0; i < end; i++) {
    const y = i === i0 ? Math.sin(w) * amp : c * y1 - r2 * y2
    a[i] += y
    y2 = y1
    y1 = y
  }
}
// a burst of noise from t, d s to 1/e, through a one-pole lowpass (lp: 0..1, 1 = open) and a
// highpass (hp: 0..1, 0 = none)
function burst (a, sr, t, d, amp, R, lp = 1, hp = 0) {
  const i0 = Math.floor(t * sr),
    end = Math.min(a.length, i0 + Math.ceil(d * sr * 6))
  let l = 0,
    h = 0
  for (let i = i0; i < end; i++) {
    const x = (R() * 2 - 1) * amp * Math.exp(-(i - i0) / (d * sr))
    l += lp * (x - l)
    h += hp * (l - h)
    a[i] += l - h
  }
}
// a thud: a low sine whose pitch drops from f0 to f1 as it dies away over d s
function thud (a, sr, t, f0, f1, d, amp) {
  const i0 = Math.floor(t * sr),
    end = Math.min(a.length, i0 + Math.ceil(d * sr * 6))
  let ph = 0
  for (let i = i0; i < end; i++) {
    const k = (i - i0) / sr,
      e = Math.exp(-k / d)
    ph += (6.283185 * (f1 + (f0 - f1) * Math.exp(-k / (d * 0.5)))) / sr
    a[i] += Math.sin(ph) * amp * e * Math.min(1, k * 2000)
  }
}
// plate-like modes: denser and quicker to die the higher they go
function plate (R, n, f0, f1, dLo, dHi) {
  const out = []
  for (let k = 0; k < n; k++) {
    const f = f0 * Math.pow(f1 / f0, (k + R()) / n)
    const d = dLo + (dHi - dLo) * Math.pow(f0 / f, 0.7) * (0.6 + 0.8 * R())
    out.push([f, d, (0.3 + R()) / Math.sqrt(1 + k * 0.3)])
  }
  return out
}

// ---------- the bank ----------
const BANK = {
  // sheet steel struck and buckling: the body's thud, the panel ringing, then a few folds as it
  // gives, each re-striking the panel with a crackle of tearing paint and seams
  metal (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    const modes = plate(R, 26, 190, 5200, 0.03, 0.28)
    thud(a, sr, 0, 120, 55, 0.07, 0.9)
    burst(a, sr, 0, 0.004, 1, R, 0.8)
    for (const [f, d, m] of modes) mode(a, sr, 0.001, f, d, m * 0.35)
    const folds = 3 + Math.floor(R() * 4)
    for (let k = 0; k < folds; k++) {
      const t = 0.008 + Math.pow(R(), 1.6) * 0.2
      burst(a, sr, t, 0.006 + R() * 0.01, 0.4 + R() * 0.5, R, 0.6, 0.15)
      for (const [f, d, m] of modes)
        if (R() < 0.4)
          mode(a, sr, t, f * (0.97 + R() * 0.06), d * 0.6, m * 0.25)
    }
    // crumpling: a quickening then thinning patter of tiny clicks
    for (let t = 0; t < 0.35; t += 0.0015 + R() * R() * 0.02)
      burst(
        a,
        sr,
        t,
        0.0006 + R() * 0.0015,
        Math.pow(R(), 3) * 0.6,
        R,
        0.7,
        0.3
      )
    return normalize(a)
  },
  // glass: a sharp crack, the pane bursting, then pieces ringing and skittering away
  glass (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    burst(a, sr, 0, 0.003, 1, R, 1, 0.4)
    burst(a, sr, 0.001, 0.05, 0.45, R, 1, 0.55)
    const n = 70 + Math.floor(R() * 50)
    for (let k = 0; k < n; k++) {
      const t = k < n * 0.7 ? -Math.log(1 - R() * 0.99) * 0.07 : R() * sec * 0.8
      const amp = Math.pow(R(), 2) * Math.exp(-t / 0.35) * 0.5
      const f = 2400 * Math.pow(4, R())
      mode(a, sr, t, f, 0.006 + R() * 0.03, amp)
      if (R() < 0.6)
        mode(a, sr, t, f * (1.6 + R()), 0.004 + R() * 0.015, amp * 0.6)
      if (R() < 0.3) burst(a, sr, t, 0.001, amp, R, 1, 0.5)
    }
    return normalize(a)
  },
  // a plastic bumper cracking: a dry snap and a few hollow, quickly damped modes, then a rattle
  plastic (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    burst(a, sr, 0, 0.0025, 1, R, 0.9, 0.2)
    for (let k = 0; k < 7; k++)
      mode(
        a,
        sr,
        0.0005,
        160 * Math.pow(9, R()),
        0.012 + R() * 0.035,
        0.3 + R() * 0.4
      )
    for (let k = 0; k < 5; k++)
      burst(a, sr, 0.02 + R() * 0.15, 0.002, 0.15 + R() * 0.25, R, 0.7, 0.2)
    thud(a, sr, 0, 160, 80, 0.03, 0.5)
    return normalize(a)
  },
  // a heavy, soft blow: a tyre, the suspension, the body taking a knock
  thud (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    thud(a, sr, 0, 95 + R() * 25, 42, 0.11, 1)
    burst(a, sr, 0, 0.03, 0.35, R, 0.06)
    burst(a, sr, 0, 0.006, 0.2, R, 0.4)
    return normalize(a)
  },
  // the suspension hitting its bump stops, or a rim on the kerb: a short metallic clank over a thud
  clank (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    thud(a, sr, 0, 110, 50, 0.06, 0.8)
    burst(a, sr, 0, 0.003, 0.6, R, 0.9, 0.2)
    for (const [f, d, m] of plate(R, 9, 380, 2900, 0.012, 0.09))
      mode(a, sr, 0.0005, f, d, m * 0.45)
    return normalize(a)
  },
  // an iron manhole lid rocking in its frame: two knocks a few hundredths apart, ringing low
  lid (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    const modes = plate(R, 8, 280, 1900, 0.03, 0.14)
    for (const t of [0, 0.028 + R() * 0.02]) {
      thud(a, sr, t, 80, 45, 0.05, t ? 0.5 : 0.9)
      for (const [f, d, m] of modes)
        mode(a, sr, t + 0.0005, f, d, m * (t ? 0.25 : 0.4))
      burst(a, sr, t, 0.002, 0.3, R, 0.8, 0.2)
    }
    return normalize(a)
  },
  // metal grinding along concrete or another car: crackling grit and squealing panel modes, driven
  // by a jerky stick-slip; loops
  scrape (R, sr, sec) {
    const n = Math.floor(sr * sec),
      fade = Math.floor(sr * 0.1),
      a = new Float32Array(n + fade)
    const res = [520, 1150, 1900, 2800, 4300].map(f => {
      const w = (6.283 * f * (0.95 + R() * 0.1)) / sr,
        r = 1 - (6.283 * f) / (sr * 22)
      return {
        c: 2 * r * Math.cos(w),
        r2: r * r,
        y1: 0,
        y2: 0,
        g: 0.04 + R() * 0.05
      }
    })
    let env = 0.5,
      tgt = 0.5,
      lp = 0,
      hp = 0
    for (let i = 0; i < n + fade; i++) {
      if (R() < 60 / sr) tgt = 0.25 + R() * 0.75 // the grip catching and letting go
      env += (tgt - env) * 0.004
      const x = (R() * 2 - 1) * env
      lp += 0.5 * (x - lp)
      hp += 0.08 * (lp - hp)
      let y = (lp - hp) * 0.6
      for (const s of res) {
        const o = s.c * s.y1 - s.r2 * s.y2 + x * s.g
        s.y2 = s.y1
        s.y1 = o
        y += o
      }
      if (R() < 400 / sr) y += (R() * 2 - 1) * 1.5 // grit
      a[i] = y
    }
    return normalize(loopable(a, n, fade), 0.8)
  },
  // wood splitting: fibres snapping in a quick run of cracks, the trunk's knock, a creak
  wood (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    thud(a, sr, 0, 140, 60, 0.07, 0.9)
    const trunk = plate(R, 6, 140, 900, 0.02, 0.07)
    let t = 0
    for (let k = 0; k < 26; k++) {
      t += Math.pow(R(), 2) * 0.03
      burst(a, sr, t, 0.0012, 0.3 + R() * 0.7, R, 1, 0.3)
      if (k % 4 === 0)
        for (const [f, d, m] of trunk) mode(a, sr, t, f, d, m * 0.2)
    }
    return normalize(a)
  },
  // leaves and twigs thrashing: a swell of tiny, bright grains
  leaves (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    for (let t = 0; t < sec * 0.9; t += 0.0008 + R() * 0.004) {
      const env = Math.sin((Math.PI * t) / (sec * 0.9)) ** 0.7
      burst(a, sr, t, 0.001 + R() * 0.004, env * Math.pow(R(), 2), R, 0.9, 0.4)
    }
    return normalize(a, 0.7)
  },
  // a hollow steel pole struck: its bending modes, far from harmonic, ringing on
  pole (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    const f0 = 290 + R() * 40
    burst(a, sr, 0, 0.003, 0.8, R, 0.9, 0.2)
    thud(a, sr, 0, 150, 60, 0.05, 0.6)
    ;[1, 2.76, 5.4, 8.93, 13.34].forEach((k, i) =>
      mode(a, sr, 0.0005, f0 * k, 0.9 / (1 + i * 0.8), 0.5 / (1 + i * 0.4))
    )
    mode(a, sr, 0.0005, f0 * 1.013, 0.8, 0.25) // (a second, slightly detuned plane of bending)
    return normalize(a)
  },
  // loose ground under a sliding tyre: gravel's coarse crunch, or sand's finer hiss (sand: true);
  // loops
  grit (R, sr, sec, sand) {
    const n = Math.floor(sr * sec),
      fade = Math.floor(sr * 0.05),
      a = new Float32Array(n + fade)
    const rate = sand ? 2600 : 900
    for (
      let t = 0;
      t < (n + fade) / sr;
      t += -Math.log(1 - R() * 0.999) / rate
    ) {
      const amp = Math.pow(R(), sand ? 2 : 3)
      burst(
        a,
        sr,
        t,
        sand ? 0.0004 : 0.0012,
        amp,
        R,
        sand ? 0.9 : 0.5,
        sand ? 0.35 : 0.1
      )
    }
    return normalize(loopable(a, n, fade), 0.8)
  },
  // a footstep on the pavement: heel and then the toe, a soft scuff
  step (R, sr, sec) {
    const a = new Float32Array(Math.floor(sr * sec))
    thud(a, sr, 0, 140, 90, 0.012, 0.6)
    burst(a, sr, 0, 0.004, 0.7, R, 0.6, 0.25)
    burst(a, sr, 0.055 + R() * 0.03, 0.012, 0.25, R, 0.5, 0.3)
    return normalize(a, 0.8)
  }
}
// name: [seconds, variants]
const SIZES = {
  thud: [0.6, 3],
  plastic: [0.4, 3],
  metal: [0.9, 4],
  clank: [0.4, 3],
  lid: [0.5, 2],
  scrape: [1.6, 1],
  gravel: [1.5, 1],
  sand: [1.5, 1],
  glass: [1.1, 2],
  pole: [1.6, 2],
  wood: [0.8, 2],
  leaves: [1.4, 1],
  step: [0.2, 4]
}
// every sample in the bank, as { name: [AudioBuffer, ...] }. Made a few at a time between frames
// (sync: all at once), so starting the sound never stalls the game; each name's list fills as its
// samples are made, and ready(name, fn) calls fn once the first of them is.
export function bank (ctx, sync = false) {
  const sr = ctx.sampleRate,
    out = {},
    jobs = [],
    waiting = []
  let seed = 101
  for (const [name, [sec, n]] of Object.entries(SIZES)) {
    out[name] = []
    for (let v = 0; v < n; v++) jobs.push([name, sec, seed++])
  }
  const make = ([name, sec, sd]) => {
    const R = rng(sd)
    const a =
      name === 'gravel' || name === 'sand'
        ? BANK.grit(R, sr, sec, name === 'sand')
        : BANK[name](R, sr, sec)
    out[name].push(toBuffer(ctx, [a]))
    for (let i = waiting.length - 1; i >= 0; i--)
      if (waiting[i][0] === name) waiting.splice(i, 1)[0][1](out[name][0])
  }
  Object.defineProperty(out, 'ready', {
    value: (name, fn) =>
      out[name].length ? fn(out[name][0]) : waiting.push([name, fn])
  })
  if (sync) jobs.forEach(make)
  else {
    // (one sample at a time, when the page has a moment between frames)
    const slice = () => {
      make(jobs.shift())
      if (jobs.length) later(slice)
    }
    later(slice)
  }
  return out
}

// ---------- periodic waves: one oscillator, a whole spectrum of orders ----------
// amps: { harmonic: amplitude }
export function wave (ctx, amps) {
  const n = Math.max(...Object.keys(amps).map(Number)) + 1
  const re = new Float32Array(n),
    im = new Float32Array(n)
  for (const [k, v] of Object.entries(amps)) im[k] = v
  return ctx.createPeriodicWave(re, im)
}
