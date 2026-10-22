// v3 driving feel (tools/drive/metrics.mjs: every class driven through the real keyboard mapping):
// the handbrake's 180 carrying speed and ending facing back, the J-turn, brake-then-reverse after a
// short hold, quick steering that comes back to the middle, strong brakes with a visible dive and
// roll, a steady lane change at speed, and the rain costing grip. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handbrake180, jTurn, slow, steerResponse, brake100, maxLat, laneChange, hbDrift, powerSlide, turningCircle, slideOut } from '../tools/drive/metrics.mjs'

const CARS = ['sedan', 'sports', 'police', 'suv', 'pickup']
const f = (x, n = 2) => x.toFixed(n)

test('Space with the wheel turned at 60 km/h: a 180 in about a second and a half, carrying speed, ending facing back', () => {
  for (const k of CARS) {
    const h = handbrake180(k)
    assert.ok(h.t180 < 1.7, `${k}: 170 deg in ${f(h.t180)} s`)
    assert.ok(h.left > 25, `${k}: ${f(h.left, 0)} km/h left`)
    assert.ok(h.end > 165 && h.end < 215, `${k}: settled at ${f(h.end, 0)} deg`)
  }
  // (the Roadster keeps its own handbrake: drift.js)
  const r = handbrake180('roadster')
  assert.ok(r.t180 < 1.6 && r.end < 215, JSON.stringify(r))
  // a bus or a truck does not swing round
  for (const k of ['bus', 'truck']) assert.ok(!(handbrake180(k).t180 < 3), k)
})

test('a J-turn: backing up flat out, the wheel and Space swing the nose round', () => {
  for (const k of ['roadster', 'sedan', 'sports', 'police']) {
    const j = jTurn(k)
    assert.ok(j.turned > 150 && j.turned < 260, `${k}: ${f(j.turned, 0)} deg`)
    assert.ok(j.vRev > 30, `${k} backs up at ${f(j.vRev, 0)} km/h`)
  }
  assert.ok(jTurn('bus').turned < 45, 'not a bus')
})

test('S held through a stop holds the car a moment, then backs up; W pulls away briskly', () => {
  for (const k of ['roadster', ...CARS, 'van']) {
    const s = slow(k)
    assert.ok(s.tRev > 0.4 && s.tRev < 0.8, `${k}: reversing ${f(s.tRev)} s after the stop`)
    assert.ok(s.t10 < 0.8, `${k}: 10 km/h in ${f(s.t10)} s`)
  }
})

test('the wheel answers quickly and lets go quickly; tight lock parking', () => {
  for (const k of ['roadster', ...CARS]) {
    const s = steerResponse(k, 20)
    assert.ok(s.tIn < 0.26, `${k}: turning in ${f(s.tIn)} s`)
    assert.ok(s.tOut < 0.65, `${k}: straight again ${f(s.tOut)} s after letting go`)
  }
  assert.ok(turningCircle('sedan') < 11 && turningCircle('sports') < 10.5)
  assert.ok(steerResponse('bus', 20).tIn > steerResponse('sedan', 20).tIn, 'a bus is slower to turn')
})

test('strong brakes, a nose dive and body roll you can see, heavy cars heavier', () => {
  const b = Object.fromEntries(['sedan', 'sports', 'van', 'bus'].map(k => [k, brake100(k)]))
  assert.ok(b.sports.d < 34 && b.sedan.d < 39 && b.van.d < 50 && b.bus.d < 62, JSON.stringify(b))
  assert.ok(b.sedan.dive > 4 && b.van.dive > 4, 'the nose dives')
  assert.ok(maxLat('sedan').roll > 5, 'a sedan rolls')
  assert.ok(maxLat('sports').g > maxLat('sedan').g && maxLat('sedan').g > maxLat('van').g)
})

test('a lane change at speed settles at once; a handbrake drift held on the power never spins', () => {
  for (const k of ['roadster', ...CARS]) {
    const l = laneChange(k)
    assert.ok(l.slip < 9 && l.settle < 0.7, `${k}: ${JSON.stringify(l)}`)
    const d = hbDrift(k)
    assert.ok(d.turned < 200, `${k}: drift went ${f(d.turned, 0)} deg round`)
    assert.ok(d.v > 30, `${k}: drives on out of it at ${f(d.v, 0)} km/h, not bogged down broadside`)
  }
  // a rear-driven car holds its slide on the power longer than a front-driven sedan
  assert.ok(hbDrift('sports').angle > hbDrift('sedan').angle && hbDrift('pickup').angle > hbDrift('sedan').angle)
})

test('the rain costs grip: less cornering, longer stops, and a sports car steps out on the power', () => {
  const wet = { grip: 0.7 }
  assert.ok(maxLat('sedan', wet).g < 0.85 * maxLat('sedan').g)
  assert.ok(brake100('sedan', wet).d > 1.2 * brake100('sedan').d)
  assert.ok(powerSlide('sports', wet) > 1.5 * powerSlide('sports'))
})

test('in the wet, a slide on the power straightens once the wheel is let go (no run on down the straight)', () => {
  const wet = { grip: 0.7 }
  for (const k of ['pickup', 'sports', 'sedan', 'van']) {
    const { tOut } = steerResponse(k, 20, wet)
    assert.ok(tOut < 1.8, `${k} wet centre ${tOut.toFixed(2)} s`)
  }
  // and on full throttle too (2.5 s and never, the pickup and the sports car, on gta-v2)
  for (const k of ['pickup', 'sports', 'police', 'van']) {
    const t = slideOut(k, wet)
    assert.ok(t < 1.5, `${k} wet, W held, wheel let go: straight after ${t} s`)
  }
  // and the Roadster's brakes feel the rain too (K16)
  assert.ok(brake100('roadster', wet).d > 1.2 * brake100('roadster').d)
})
