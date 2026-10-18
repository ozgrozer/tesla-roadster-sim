# The radio: notes

GTA's cars have their radio; this one has three stations, and the songs are written as they play,
since the game ships no sound files.

## What it is

- **Keys.** `B` tunes to the next station, then off after the last (`main.js` hands the station to
  `hud.radio`, which shows it top centre as GTA does: the frequency over the name). Off by default. B
  is one of the keys that keep the screen clean, so changing station doesn't bring the buttons back.
- **Stations** (`js/audio/radio.js`): Sunset Synth FM (synthwave, 92 to 112 bpm), Palm Lo-Fi (72 to
  86 bpm, swung) and Downtown House (118 to 124 bpm). Tuning in joins the station part way through a
  song, as if it had been playing all along.
- **Songs.** Each from one seed: a minor key (the bass's tonic between A1 and E2), a tempo, one of five
  progressions of diatonic chords (i VI III VII, i iv VI v, ...), the chords voiced close round middle
  C and each led from the last by the least movement, with the seventh the scale has where a station
  wants sevenths (a major one on III and VI, a minor one on VII and the minor chords); a bassline in
  the station's pattern (driving eighths with an octave jump, roots, offbeats), an arpeggio of the
  chord's tones, and a melody: a two-bar motif and its answer (the same with its ending changed), the
  even steps pulled onto the chord's nearest tone. An arrangement of 44 bars builds up, drops back
  and comes in again (pads and hats; then the drums; the bass and the arpeggio; the melody; a break;
  the full song again; an outro), a minute and a half to two minutes, then the station's chime and the
  next song.
- **Instruments** (`js/audio/radioSynth.js`), synthesised note by note and scheduled on the audio
  clock: an 808-style kick swept down from its click, a snare's two body modes under a burst of noise,
  claps, open and closed hats, a sawtooth bass with a sub octave and its filter swept by each note,
  pads of detuned sawtooths, a plucked square arpeggio, a gliding sawtooth lead with delayed vibrato,
  an FM electric piano (a sine modulated at its own pitch, the brightness falling away, a short high
  tine), and house's chord stabs.
- **Sound.** Everything but the drums pumps under the kick (deepest on synthwave); a room reverb on
  the whole mix, a ping-pong delay on the arpeggio and the lead (a dotted eighth); lo-fi is dulled to
  3.4 kHz with a tape's wow (a delay line whose length wobbles at 0.55 Hz, about five cents) and a
  record's crackle. Heard from the follow camera, the radio is muffled through the car round it (8
  kHz); from the driver's seat, clear.
- **Changing station.** Each song plays into its own buses (`take`): tuning away fades them out in
  a few hundredths of a second and lets them go, so the notes the last station had laid down ahead
  (a third of a second of them, and its pads' release) don't play on under the new one; the station's
  sound (its tone, reverb, wow, crackle and the delay's length) changes at the new song's first note,
  with the delay's echoes held back over it (retuned with the old echoes still going round, they
  chirped). An independent review found both; measured after the fix, the radio's mix 50 ms after a
  switch, before the new station's first note, is a tenth of what it was playing (the shared reverb's
  tail), the old song's buses silent.
- **Cost.** The radio's whole graph hangs off one lane (`sound.js`): switched off, it is disconnected
  and none of it is worked out. Never switched on, none of it is even built. The notes are laid down a
  third of a second ahead on the audio clock, so a slow frame never shows in the timing; after a pause
  it picks up from now rather than playing the backlog.

## How it was checked

Nobody listened to it while it was made, so it was measured instead.
- `tests/radio.test.mjs` writes forty songs a station and checks every chord note is in the key, the
  voicings stay within an octave between E3 and E5 and move no more than a fifth a voice from chord to
  chord, the bass stays in its octaves, and a song lasts a minute and a quarter to two and a half. (It
  caught the VII chord's major seventh, out of the key, before it shipped.)
- In headless Chrome, an analyser on the radio's output and on the whole mix, ten seconds a station:
  the stations sit within 2 dB of each other (each with its own level), about 5 dB over the street at
  a standstill (the car's own sound comes through it at speed), peaks under 0.42 before the master's
  limiter, no console errors.

## Known issues

- No one has heard it yet: the level, the balance between the instruments and the taste of it are
  first guesses. The levels are in `STYLE` (per station) and the instruments' peaks in
  `radioSynth.js`.
- There is no talk between songs, no DJ: only the chime.
