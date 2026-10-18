// The radio's songs, written headless (no sound: the writer only): npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeSong, BARS, STATIONS } from '../js/audio/radio.js'

const MINOR = new Set([0, 2, 3, 5, 7, 8, 10])

test('every station writes songs in a minor key, voiced in range, a minute and a half to two long', () => {
  for (const { style } of STATIONS)
    for (let seed = 1; seed <= 40; seed++) {
      const s = writeSong(style, seed * 7919)
      assert.ok(s.bpm > 60 && s.bpm < 130, `${style}: ${s.bpm} bpm`)
      const secs = (BARS * 4 * 60) / s.bpm
      assert.ok(secs > 75 && secs < 150, `${style}: ${secs.toFixed(0)} s`)
      assert.equal(s.chords.length, 4)
      let last = null
      for (const c of s.chords) {
        // (the bass in its own octaves, the chord close round middle C, every note in the key)
        assert.ok(c.bass >= 33 && c.bass < 52, `bass ${c.bass}`)
        assert.ok(c.notes.length >= 3 && c.notes.length <= 4)
        assert.ok(c.notes[0] >= 52 && c.notes.at(-1) < 76, `voicing ${c.notes}`)
        assert.ok(c.notes.at(-1) - c.notes[0] <= 12, 'voiced close')
        for (const m of c.notes)
          assert.ok(MINOR.has((m - s.key + 120) % 12), `${m} in the key`)
        // (and led from the last chord without a leap)
        if (last)
          for (let i = 0; i < 3; i++)
            assert.ok(Math.abs(c.notes[i] - last[i]) <= 7, 'smooth voice leading')
        last = c.notes
      }
      // the melody: a motif across two bars and its answer
      for (const phrase of [s.motif, s.answer])
        for (const n of phrase) {
          assert.ok(n.at >= 0 && n.at < 32 && n.len > 0)
          assert.ok(n.step >= -5 && n.step <= 10)
        }
    }
})
