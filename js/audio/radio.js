// The car's radio, GTA-style: B tunes through the stations and off. Every song is written on the
// spot (no recordings): a key, a tempo and a chord progression drawn by chance, the chords voiced
// close and led smoothly from one to the next, a bassline, an arpeggio, a melody built from a
// motif and its answer, and an arrangement that builds up, drops back and comes in again. Three
// stations: synthwave (pumping pads, a plucked arpeggio and a gliding lead through a ping-pong
// delay), lo-fi (lazy swung drums, an electric piano's seventh chords, tape wow and vinyl crackle,
// all of it a little dull) and house (four on the floor, offbeat hats, chord stabs). Between songs,
// the station's chime. The notes are laid down a third of a second ahead of the music on the audio
// clock, so the frame rate never shows in the timing; heard from outside, the radio is muffled by
// the car round it.
import { rng } from '../sim/city.js'
import * as S from './radioSynth.js'

export const STATIONS = [
  { name: 'Sunset Synth FM', freq: '101.7', style: 'synth' },
  { name: 'Palm Lo-Fi', freq: '94.3', style: 'lofi' },
  { name: 'Downtown House', freq: '105.9', style: 'house' }
]
// per style: tempo range, swing (a share of a 16th), each drum's steps in a bar of 16 (kick2: the
// busier kick some songs take), the chord instrument, the bassline, how wet, how pumped under the
// kick (duck) and how bright (lp, Hz) it all is, and its level, so the stations sound as loud
// prettier-ignore
const STYLE = {
  synth: { bpm: [92, 112], swing: 0, kick: [0, 8], kick2: [0, 4, 8, 12], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], open: [], chords: 'pad', arp: true, lead: true, verb: 0.5, delay: 0.3, duck: 0.45, lp: 9000, bass: 'eighths', gain: 1 },
  lofi: { bpm: [72, 86], swing: 0.28, kick: [0, 7, 10], kick2: [0, 3, 7, 10], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], open: [], chords: 'epiano', arp: false, lead: true, verb: 0.3, delay: 0.12, duck: 0.15, lp: 3400, bass: 'roots', gain: 1.3 },
  house: { bpm: [118, 124], swing: 0.05, kick: [0, 4, 8, 12], kick2: [0, 4, 8, 12], snare: [4, 12], hats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], open: [2, 6, 10, 14], chords: 'stab', arp: false, lead: false, verb: 0.25, delay: 0.2, duck: 0.4, lp: 11000, bass: 'offbeat', gain: 1.8 }
}
// minor-key progressions, as semitones above the tonic with each chord's quality
// prettier-ignore
const PROGRESSIONS = [
  [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], // i VI III VII
  [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'm']], // i iv VI v
  [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], // i VII VI VII
  [[8, 'M'], [10, 'M'], [0, 'm'], [0, 'm']], // VI VII i i
  [[0, 'm'], [3, 'M'], [10, 'M'], [5, 'm']] // i III VII iv
]
const MINOR = [0, 2, 3, 5, 7, 8, 10] // the natural minor scale
// the sections: bars, and what plays (k kick, s snare, h hats, b bass, c chords, a arp, l lead)
const FORM = [
  [4, 'ch'],
  [4, 'kshc'],
  [8, 'kshbca'],
  [8, 'kshbcal'],
  [4, 'hca'],
  [8, 'kshbcal'],
  [4, 'kshbca'],
  [4, 'c']
]
export const BARS = FORM.reduce((n, [b]) => n + b, 0)
const AHEAD = 0.35 // s: how far ahead of the music its notes are laid down

// a chord's notes, voiced close and led from the last voicing by the least movement. deg: its root
// in semitones above the key's tonic; sevenths: with its seventh, the one the scale has (a major
// seventh on III and VI, a minor one on VII and the minor chords)
function voice (root, deg, quality, sevenths, last) {
  const tones = [0, quality === 'm' ? 3 : 4, 7]
  if (sevenths) tones.push(MINOR.includes((deg + 11) % 12) ? 11 : 10)
  let best = null,
    bestCost = Infinity
  for (let base = 52; base < 64; base++) {
    const notes = tones.map(t => {
      let m = root + t
      while (m < base) m += 12
      while (m >= base + 12) m -= 12
      return m
    })
    notes.sort((a, b) => a - b)
    const cost = last
      ? notes.reduce((c, m, i) => c + Math.abs(m - (last[i] ?? m)), 0)
      : Math.abs(notes[0] - 57)
    if (cost < bestCost) {
      bestCost = cost
      best = notes
    }
  }
  return best
}

// A song from one seed: its key, tempo, chords and melody (a two-bar motif of notes, each a step in
// the scale on a 16th of the first bar, spread over two, with its length; and its answer, the motif
// with its ending changed)
export function writeSong (style, seed) {
  const R = rng(seed),
    st = STYLE[style]
  const pick = a => a[Math.floor(R() * a.length)]
  const key = 33 + Math.floor(R() * 8) // A1 to E2: the bass's tonic
  const bpm = st.bpm[0] + R() * (st.bpm[1] - st.bpm[0])
  let last = null
  const chords = pick(PROGRESSIONS).map(([deg, q]) => {
    last = voice(key + 24 + deg, deg, q, style !== 'synth' || R() < 0.3, last)
    return { bass: key + deg, notes: last }
  })
  const motif = []
  let step = Math.floor(R() * 3)
  for (const at of pick([
    [0, 3, 6, 8, 10, 14],
    [0, 2, 4, 7, 10, 12],
    [0, 4, 6, 8, 12],
    [2, 4, 6, 10, 12, 14]
  ])) {
    step = Math.max(-2, Math.min(7, step + pick([-2, -1, -1, 1, 1, 2, 0])))
    motif.push({ at: at * 2, step, len: pick([2, 2, 3, 4]) * 2 })
  }
  const answer = motif.map((n, i) =>
    i < motif.length - 2 ? n : { ...n, step: n.step + pick([-3, -2, 2, 3]) }
  )
  return { style, st, key, bpm, chords, motif, answer, R, kick2: R() < 0.5 }
}

export class Radio {
  constructor (eng) {
    this.eng = eng
    this.on = -1 // the station playing (-1: off)
    this.song = null
    this.next = 0 // the next 16th's time on the audio clock, and its number in the song
    this.step = 0
    this.lastLead = null
    this.seed = Math.floor(Math.random() * 1e9)
  }

  // The radio's own chain: the drums into mix, the rest (ducked under the kick) into it through
  // duck; a reverb fed from all of it and a ping-pong delay fed from the arpeggio and the lead; then
  // the station's colour (dull for lo-fi, with the tape's wow: a delay line wobbling its length) and
  // the car's speakers, heard muffled through the body from outside
  build () {
    const { ctx, gain, filt } = this.eng
    const post = filt('highpass', 70, 0.7)
    this.mix = gain(1) // (every song's buses sum here: see take)
    this.mix.connect(post)
    this.verbIn = gain(0)
    const conv = ctx.createConvolver()
    conv.buffer = this.impulse(1.6)
    this.mix.connect(this.verbIn).connect(conv).connect(post)
    this.delayIn = gain(1)
    this.delayOut = gain(0)
    const dl = (this.dl = ctx.createDelay(1)),
      dr = (this.dr = ctx.createDelay(1)),
      fb = gain(0.35),
      pl = ctx.createStereoPanner(),
      pr = ctx.createStereoPanner()
    pl.pan.value = -0.6
    pr.pan.value = 0.6
    this.delayIn.connect(dl)
    dl.connect(dr).connect(fb).connect(dl)
    dl.connect(pl).connect(this.delayOut)
    dr.connect(pr).connect(this.delayOut)
    this.delayOut.connect(post)
    this.tone = filt('lowpass', 9000, 0.5)
    const wow = ctx.createDelay(0.05)
    wow.delayTime.value = 0.012
    this.wow = gain(0)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.55
    lfo.connect(this.wow).connect(wow.delayTime)
    lfo.start()
    this.speaker = filt('lowpass', 16000, 0.6)
    this.level = gain(0)
    post
      .connect(this.tone)
      .connect(wow)
      .connect(this.speaker)
      .connect(this.level)
    // (a lane: switched off, nothing of the radio is worked out at all: sound.js)
    this.eng.lane([this.level.gain], this.level, this.eng.mixIn)
    // (a record's surface, for lo-fi)
    this.crackle = gain(0)
    const cr = ctx.createBufferSource()
    cr.buffer = this.crackles()
    cr.loop = true
    cr.connect(this.crackle).connect(this.tone)
    cr.start()
  }
  // A song's own buses into the chain: the drums (out), the rest ducked under the kick (duck), and
  // the arpeggio and the lead, dry and to the delay. Tuning away fades them out at once and lets
  // them go, so the notes the last station had laid down ahead don't play on under the new one.
  take () {
    const { gain } = this.eng
    const t = { out: gain(1), duck: gain(1), arp: gain(1), lead: gain(1) }
    t.out.connect(this.mix)
    t.duck.connect(t.out)
    t.arp.connect(t.duck)
    t.arp.connect(this.delayIn)
    t.lead.connect(t.out)
    t.lead.connect(this.delayIn)
    return t
  }
  drop (t) {
    const now = this.eng.ctx.currentTime
    for (const g of [t.out, t.arp, t.lead]) {
      g.gain.cancelScheduledValues(now)
      g.gain.setTargetAtTime(0, now, 0.012)
    }
    setTimeout(() => {
      for (const g of [t.out, t.arp, t.lead]) g.disconnect()
    }, 250)
  }
  // a stereo room's tail: decaying noise
  impulse (len) {
    const { ctx } = this.eng,
      n = Math.floor(ctx.sampleRate * len)
    const b = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c)
      for (let i = 0; i < n; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * 0.5
    }
    return b
  }
  // a record's surface: sparse clicks over a faint hiss, four seconds of it
  crackles () {
    const { ctx } = this.eng,
      n = ctx.sampleRate * 4
    const b = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.01
      if (Math.random() < 0.0004) d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.4
    }
    return b
  }

  // B: the next station, or off after the last; returns the station (null: off)
  tune () {
    this.on = this.on + 1 >= STATIONS.length ? -1 : this.on + 1
    this.song = null
    if (this.cur) this.drop(this.cur)
    this.cur = null
    return this.on < 0 ? null : STATIONS[this.on]
  }

  // once a frame (sound.js): lay down the notes due in the next third of a second. inside: the
  // camera in the driver's seat
  update (inside) {
    const eng = this.eng
    if (!this.mix) {
      if (this.on < 0) return // (never switched on: nothing built)
      this.build()
    }
    const now = eng.ctx.currentTime
    // (a few dB over the street at a standstill, so the car's own sound comes through it at speed;
    // the stations matched in loudness)
    const gain = this.on < 0 ? 0 : 0.2 * (this.song ? this.song.st.gain : 1)
    eng.R(this.level.gain, gain, 0.15)
    eng.R(this.speaker.frequency, inside ? 15000 : 8000, 0.2)
    if (this.on < 0) return
    if (!this.song) {
      this.song = writeSong(STATIONS[this.on].style, (this.seed += 7919))
      this.cur = this.take()
      // (tuned in: the station is already part way through the song)
      this.step = 16 * Math.floor(Math.random() * 12)
      this.next = now + 0.1
      this.restyle(this.next)
    }
    // (back from a pause or a stall: pick up from now rather than play the backlog at once)
    if (this.next < now) this.next = now + 0.05
    const sixteenth = 60 / this.song.bpm / 4
    while (this.next < now + AHEAD) {
      this.play(this.step, this.next, sixteenth)
      this.step++
      this.next += sixteenth
      if (this.step >= BARS * 16) {
        this.chime(this.next)
        this.song = writeSong(this.song.style, (this.seed += 7919))
        this.step = 0
        this.next += 1.4
        this.restyle(this.next)
        break
      }
    }
  }
  // The station's sound for the song from its first note (at): its tone, reverb, delay, wow and
  // crackle. The delay's echoes are held back over the change: its length retuned with the last
  // song's echoes still going round in it would chirp them.
  restyle (at) {
    const song = this.song,
      st = song.st,
      lofi = song.style === 'lofi',
      now = this.eng.ctx.currentTime
    const set = (p, v) => {
      p.cancelScheduledValues(at)
      p.setTargetAtTime(v, at, 0.05)
    }
    set(this.tone.frequency, st.lp)
    set(this.verbIn.gain, st.verb)
    set(this.wow.gain, lofi ? 0.0009 : 0)
    set(this.crackle.gain, lofi ? 1 : 0)
    const d = this.delayOut.gain,
      echo = (60 / song.bpm) * 0.75 // (a dotted eighth)
    d.cancelScheduledValues(now)
    d.setTargetAtTime(0, Math.max(now, at - 0.25), 0.02)
    for (const dl of [this.dl, this.dr]) {
      dl.delayTime.cancelScheduledValues(now)
      dl.delayTime.setValueAtTime(echo, at)
    }
    d.setTargetAtTime(st.delay, at + 0.03, 0.05)
  }

  // the notes on one 16th of the song, at time t (six: a 16th's length in s)
  play (step, t, six) {
    const ctx = this.eng.ctx,
      song = this.song,
      st = song.st,
      R = song.R
    const bar = Math.floor(step / 16),
      s = step % 16
    // which section, and what plays in it
    let b = bar,
      parts = ''
    for (const [n, p] of FORM) {
      if (b < n) {
        parts = p
        break
      }
      b -= n
    }
    // (swung: every other 16th a little late)
    if (s % 2) t += st.swing * six
    const chord = song.chords[bar % song.chords.length]
    const noise = this.eng.white,
      vel = 0.85 + R() * 0.15,
      bus = this.cur
    if (parts.includes('k') && (song.kick2 ? st.kick2 : st.kick).includes(s)) {
      S.kick(ctx, bus.out, t, vel)
      // (everything else ducks under it and swells back)
      const g = bus.duck.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(1 - st.duck, t)
      g.setTargetAtTime(1, t + 0.02, 0.09)
    }
    if (parts.includes('s') && st.snare.includes(s)) {
      if (song.style === 'house') S.clap(ctx, bus.out, t, vel, noise)
      else S.snare(ctx, bus.out, t, vel, noise)
    }
    if (parts.includes('h')) {
      if (st.hats.includes(s))
        S.hat(ctx, bus.out, t, (s % 4 ? 0.55 : 0.9) * vel, noise)
      if (st.open.includes(s)) S.hat(ctx, bus.out, t, 0.6 * vel, noise, true)
    }
    if (parts.includes('b')) {
      const m = chord.bass
      if (st.bass === 'eighths' && s % 2 === 0)
        S.bass(ctx, bus.duck, t, s % 8 === 6 ? m + 12 : m, six * 1.6, vel, 520)
      else if (st.bass === 'roots' && (s === 0 || s === 10))
        S.bass(ctx, bus.duck, t, m, six * (s ? 5 : 9), vel * 0.9, 380)
      else if (st.bass === 'offbeat' && s % 4 === 2)
        S.bass(ctx, bus.duck, t, s === 14 ? m + 7 : m, six * 1.5, vel, 700)
    }
    if (parts.includes('c')) {
      if (st.chords === 'pad' && s === 0)
        S.pad(ctx, bus.duck, t, chord.notes, six * 16, 1, 2000)
      else if (st.chords === 'epiano' && (s === 0 || (s === 11 && R() < 0.5)))
        S.epiano(ctx, bus.duck, t, chord.notes, six * 9, vel * 0.9)
      else if (
        st.chords === 'stab' &&
        (s === 3 || s === 10 || (s === 14 && bar % 2))
      )
        S.stab(ctx, bus.duck, t, chord.notes, vel)
    }
    if (parts.includes('a') && st.arp) {
      const n = chord.notes,
        up = [0, 1, 2, 1][Math.floor(s / 4)]
      const m = n[(s + up) % n.length] + 12
      S.pluck(ctx, bus.arp, t, m, six * 0.9, vel * (s % 4 ? 0.7 : 1))
    }
    if (parts.includes('l') && st.lead) {
      const phrase = bar % 4 < 2 ? song.motif : song.answer,
        at = (bar % 2) * 16 + s
      for (const n of phrase) {
        if (n.at !== at) continue
        const m = this.scaleNote(song.key + 36, n.step, chord)
        if (song.style === 'lofi')
          S.epiano(ctx, bus.lead, t, [m], six * n.len, 0.7)
        else S.lead(ctx, bus.lead, t, m, six * n.len, 0.9, this.lastLead ?? m)
        this.lastLead = m
      }
    }
  }
  // a melody's step in the key's scale, pulled onto the chord's nearest tone on the even steps
  scaleNote (tonic, step, chord) {
    const deg = ((step % 7) + 7) % 7
    let m = tonic + 12 * Math.floor(step / 7) + MINOR[deg]
    if (step % 2 === 0) {
      let best = m,
        bd = 99
      for (const c of chord.notes)
        for (const o of [-12, 0, 12, 24]) {
          const d = Math.abs(c + o - m)
          if (d < bd) {
            bd = d
            best = c + o
          }
        }
      m = best
    }
    return m
  }
  // the station's chime between songs: a rising major arpeggio on the electric piano
  chime (t) {
    ;[0, 4, 7, 12].forEach((iv, i) =>
      S.epiano(this.eng.ctx, this.cur.out, t + i * 0.12, [72 + iv], 0.5, 0.9)
    )
  }
}
