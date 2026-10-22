// The pause menu's options, the key remapping, a new player's hints and the sound captions
// (ui/options.js, keymap.js, onboard.js, captions.js): npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OPTS, DEFAULTS, setOption, resetOptions, look, shakeScale, onOption } from '../js/ui/options.js'
import { BINDS, bind, translate, resetKeys, loadKeys, keyName } from '../js/ui/keymap.js'
import { Onboard } from '../js/ui/onboard.js'
import { Captions } from '../js/ui/captions.js'

test('options: a value not among the choices falls back to the default; listeners hear changes', () => {
  resetOptions()
  const heard = []
  const off = onOption(k => heard.push(k))
  setOption('music', 0.3)
  assert.equal(OPTS.music, 0.3)
  setOption('music', 0.33)
  assert.equal(OPTS.music, DEFAULTS.music)
  setOption('nonsense', 1)
  assert.deepEqual(heard, ['music', 'music'])
  off()
  resetOptions()
})

test('options: look sensitivity and invert, reduced motion shakes less', () => {
  resetOptions()
  assert.deepEqual([...look(10, 4)], [10, 4])
  setOption('sens', 2)
  setOption('invert', true)
  assert.deepEqual([...look(10, 4)], [20, -8])
  assert.equal(shakeScale(), 1)
  setOption('motion', 'reduced')
  assert.ok(shakeScale() < 0.5)
  resetOptions()
})

test('keymap: binding a key swaps with whoever had it, and the game hears its own codes', () => {
  loadKeys()
  resetKeys()
  assert.equal(translate('KeyW'), 'KeyW')
  bind('KeyH', 'KeyJ') // the horn on J
  assert.equal(translate('KeyJ'), 'KeyH')
  assert.equal(translate('KeyH'), null) // (H is no one's now)
  bind('KeyW', 'KeyH') // throttle on H
  assert.equal(translate('KeyH'), 'KeyW')
  assert.equal(translate('KeyW'), null)
  bind('KeyE', 'KeyH') // E's action takes H: the throttle gets E
  assert.equal(BINDS.KeyW, 'KeyE')
  assert.equal(BINDS.KeyE, 'KeyH')
  assert.equal(translate('KeyE'), 'KeyW')
  assert.equal(translate('KeyH'), 'KeyE')
  const keys = Object.values(BINDS)
  assert.equal(new Set(keys).size, keys.length, 'no key bound twice')
  assert.equal(bind('KeyW', 'Escape'), false)
  resetKeys()
  assert.equal(translate('KeyJ'), 'KeyJ')
  assert.equal(keyName('ShiftLeft'), 'Shift')
  assert.equal(keyName('KeyQ'), 'Q')
})

test('onboarding: each hint once, never two at once, in the right situations', () => {
  const o = new Onboard()
  o.reset()
  const said = []
  const s = { city: true, mode: 'foot', other: false, wanted: 0, rain: 0 }
  for (let t = 0; t < 30; t += 0.5) {
    const h = o.update(0.5, { ...s })
    if (h) said.push([t, h])
  }
  assert.equal(said.length, 1)
  assert.match(said[0][1], /On foot/)
  for (let t = 0; t < 60; t += 0.5) {
    const h = o.update(0.5, { ...s, mode: 'car', other: true, wanted: 2 })
    if (h) said.push([t, h])
  }
  const ids = said.map(([, h]) => h.split(' ')[0])
  assert.deepEqual(ids.slice(0, 3), ['On', 'Driving', 'Wanted'])
  // (spaced out)
  for (let i = 1; i < said.length; i++) assert.ok(said[i][0] - said[i - 1][0] >= 8 || said[i][0] < said[i - 1][0])
  o.reset()
})

test('captions: thunder per strike (not too often), sirens when units are near and you are wanted', () => {
  const c = new Captions()
  const env = { strikes: 0, strikeDist: 1000, rain: 0 }
  assert.equal(c.update(0.1, { env, wanted: 0 }), null)
  env.strikes = 1
  assert.equal(c.update(0.1, { env, wanted: 0 }), '[thunder]')
  env.strikes = 2
  assert.equal(c.update(0.1, { env, wanted: 0 }), null) // (too soon)
  const units = [{ x: 30, z: 0 }]
  assert.equal(c.update(0.1, { env, wanted: 0, units, at: { x: 0, z: 0 } }), null)
  assert.equal(c.update(0.1, { env, wanted: 2, units, at: { x: 0, z: 0 } }), '[sirens close by]')
})

test('weather: one grip getter, 1 dry and about 0.7 soaked; the weather in a word', async () => {
  const { ENV, setWeather, weatherGrip, weatherKind } = await import('../js/sim/env.js')
  setWeather('clear', { now: true })
  assert.equal(weatherGrip(), 1)
  assert.equal(weatherKind(), 'clear')
  setWeather('rain', { now: true })
  assert.ok(weatherGrip() < 0.8 && weatherGrip() >= 0.7 - 1e-9)
  assert.equal(weatherKind(), 'rain')
  setWeather('fog', { now: true })
  assert.equal(weatherKind(), 'fog')
  setWeather('storm', { now: true })
  assert.equal(weatherKind(), 'storm')
  setWeather('clear', { now: true })
  ENV.wet = 0
  ENV.pool = 0
})

test('map places: gas stations, car parks, hospitals, police stations, and added ones', async () => {
  await import('../js/sim/city.js')
  const { pois, addPoi, removePoi } = await import('../js/sim/poi.js')
  const kinds = k => pois().filter(p => p.kind === k).length
  assert.ok(kinds('gas') >= 1)
  assert.ok(kinds('garage') >= 1)
  assert.equal(kinds('hospital'), 3)
  assert.equal(kinds('police'), 3)
  for (const p of pois()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), p.id)
  addPoi({ id: 'shop1', kind: 'shop', x: 1, z: 2, name: 'Corner shop' })
  addPoi({ id: 'door1', kind: 'weird', x: 1, z: 2 })
  assert.equal(kinds('shop'), 1)
  assert.equal(pois().find(p => p.id === 'door1').kind, 'interior')
  removePoi('shop1')
  removePoi('door1')
  assert.equal(kinds('shop'), 0)
})

test("the police stream's search area wins while fresh, and its absence is fine", async () => {
  const { emitGame, tickGame } = await import('../js/sim/gameEvents.js')
  const { searchOf } = await import('../js/ui/crimeMap.js')
  const own = { x: 0, z: 0, r: 50 }
  assert.equal(searchOf({ search: own, units: [] }), own)
  assert.equal(searchOf({ search: null, units: [] }), null)
  emitGame('police-search', { pos: { x: 10, z: 20 }, radius: 80, ttl: 5 })
  const s = searchOf({ search: own, units: [{ x: 0, z: 0 }] })
  assert.deepEqual([s.x, s.z, s.r], [10, 20, 80])
  tickGame(6)
  assert.equal(searchOf({ search: own, units: [{ x: 0, z: 0 }] }), own)
  emitGame('police-search', { pos: null, radius: 0 })
  assert.equal(searchOf({ search: own, units: [{ x: 0, z: 0 }] }), null)
})
