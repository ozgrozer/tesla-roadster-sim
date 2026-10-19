// The neighbourhoods and street names (areas.js) against the city's own grid: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JAM_AT } from '../js/sim/jam.js'
import { N, PITCH, ROAD_HW, ROADS, SPAWN } from '../js/sim/city.js'
import {
  AREAS,
  areaOf,
  whereIs,
  STREETS_EW,
  STREETS_NS
} from '../js/sim/areas.js'

test('the neighbourhoods and streets cover the grid areas.js shares with city.js', () => {
  // (18 blocks across since the city grew east and south: was 10)
  assert.equal(N, 18)
  assert.equal(PITCH, 96)
  assert.equal(ROAD_HW, 7)
  assert.equal(STREETS_EW.length, ROADS.length)
  assert.equal(STREETS_NS.length, ROADS.length)
  for (let bz = 0; bz < N; bz++)
    for (let bx = 0; bx < N; bx++)
      assert.ok(AREAS[areaOf(bx, bz)], `block ${bx},${bz} has a neighbourhood`)
})

test('the car starts in Santa Monica on Wilshire, the gridlock is in Century City', () => {
  const at = whereIs(SPAWN.x, SPAWN.z, {})
  assert.equal(at.area, 'Santa Monica')
  assert.equal(at.street, 'Wilshire Blvd')
  assert.equal(whereIs(JAM_AT.x, JAM_AT.z, {}).area, 'Century City')
  // (at a junction, both streets)
  const j = whereIs(ROADS[5], ROADS[5], {})
  assert.equal(j.street, 'Wilshire Blvd')
  assert.equal(j.cross, 'La Cienega Blvd')
  assert.equal(whereIs(ROADS[0] - 30, 0, {}).area, 'Santa Monica Beach')
})
