// Brakes and the wheel, GTA-quick: S from 100 km/h stops a car in about 2.5-3 s (the heavies a
// little longer), the handbrake alone scrubs it off hard too, and the road wheels reach full lock
// in about a fifth of a second (tools/drive/brakeSteer.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stop, lockT } from '../tools/drive/brakeSteer.mjs'

const LIGHT = ['roadster', 'sedan', 'sports', 'suv', 'pickup', 'van', 'police']

test('S from 100 km/h stops the light classes in 3 s, the heavies in 3.6', () => {
  for (const k of [...LIGHT, 'truck', 'bus']) {
    const { t } = stop(k, ['KeyS'])
    assert.ok(t <= (LIGHT.includes(k) ? 3 : 3.6), `${k}: ${t.toFixed(2)} s`)
  }
})

test('S at speed brakes at once: well under 100 km/h a second on', () => {
  for (const k of LIGHT) {
    const { v } = stop(k, ['KeyS'], 1)
    assert.ok(v < 70, `${k}: ${v.toFixed(0)} km/h after 1 s`)
  }
})

test('the handbrake alone from 100 km/h stops every class within 4.5 s', () => {
  for (const k of [...LIGHT, 'truck', 'bus']) {
    const { t } = stop(k, ['Space'])
    assert.ok(t <= 4.5, `${k}: ${t.toFixed(2)} s`)
  }
})

test('the road wheels reach full lock within a quarter second at a standstill, the heavies 0.4', () => {
  for (const k of [...LIGHT, 'truck', 'bus']) {
    const t = lockT(k, 0.01)
    assert.ok(t > 0 && t <= (LIGHT.includes(k) ? 0.25 : 0.4), `${k}: ${t.toFixed(2)} s`)
  }
})
