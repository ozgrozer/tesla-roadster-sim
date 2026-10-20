// The extension points (sim/hooks.js) and the save game (sim/save.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addInteractable, interactableFor, addRadarOverlay, HOOKS } from '../js/sim/hooks.js'
import { saveSection, saveGame, loadGame, hasSave, clearSave, STORE, SAVE_KEY } from '../js/sim/save.js'
import { emitGame, onGame } from '../js/sim/gameEvents.js'

test('the nearest interactable on offer, in its modes, within its reach and height', () => {
  const off = []
  off.push(addInteractable({ id: 'a', x: 0, z: 0, r: 2, label: () => 'Enter · A', act () {} }))
  off.push(addInteractable({ id: 'b', x: 1, z: 0, r: 2, label: () => 'Enter · B', act () {} }))
  off.push(addInteractable({ id: 'c', x: 0.5, z: 0, r: 2, label: () => null, act () {} })) // (nothing to offer)
  off.push(addInteractable({ id: 'd', x: 0, z: 0.2, r: 2, y: 12, label: () => 'Up here', act () {} })) // (a deck above)
  off.push(addInteractable({ id: 'e', x: 0.9, z: 0, r: 3, modes: ['car'], label: () => 'Respray', act () {} }))
  const foot = { mode: 'foot', pos: { x: 0.8, y: 0, z: 0 } }
  assert.equal(interactableFor(foot).it.id, 'b')
  assert.equal(interactableFor({ ...foot, pos: { x: -1.5, y: 0, z: 0 } }).it.id, 'a')
  assert.equal(interactableFor({ ...foot, pos: { x: 5, y: 0, z: 0 } }), null)
  assert.equal(interactableFor({ mode: 'car', pos: { x: 0.8, y: 0, z: 0 } }).it.id, 'e')
  assert.equal(interactableFor({ mode: 'entering', pos: { x: 0.8, y: 0, z: 0 } }), null)
  assert.equal(interactableFor({ mode: 'foot', pos: { x: 0, y: 12, z: 0.2 } }).it.id, 'd')
  for (const f of off) f()
  assert.equal(HOOKS.interactables.length, 0)
  const rm = addRadarOverlay(() => {})
  assert.equal(HOOKS.radar.length, 1)
  rm()
  assert.equal(HOOKS.radar.length, 0)
})

test('the save game writes every section and reads them back; a bad one is skipped', () => {
  clearSave()
  assert.equal(hasSave(), false)
  const state = { cash: 1200, cars: ['sports'] }
  let back = null,
    other = null
  const off1 = saveSection('wallet', { save: () => ({ cash: state.cash, cars: state.cars }), load: d => (back = d) })
  const off2 = saveSection('broken', { save: () => ({ x: 1 }), load: () => { throw new Error('bad') } })
  const off3 = saveSection('later', { save: () => ({ y: 2 }), load: d => (other = d) })
  assert.equal(saveGame(), true)
  assert.equal(hasSave(), true)
  assert.equal(loadGame(), true)
  assert.deepEqual(back, { cash: 1200, cars: ['sports'] })
  assert.deepEqual(other, { y: 2 })
  // a corrupt record is no save, not a crash
  STORE.set(SAVE_KEY, '{nope')
  assert.equal(hasSave(), false)
  assert.equal(loadGame(), false)
  off1()
  off2()
  off3()
  clearSave()
})

test("a game event keeps its name even when its data has a type of its own (a crime's kind)", () => {
  let got = null
  const off = onGame('crime', e => (got = e))
  emitGame('crime', { type: 'carjack', severity: 1 })
  off()
  assert.equal(got.type, 'carjack')
  assert.equal(got.event, 'crime')
})
