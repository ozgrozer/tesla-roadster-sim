// Headless checks of the Roadster's own damage as render/damage.js shows it: a hard knock darkens
// the lamps on the side it lands, and the light they throw on the road with them, crazes the
// glass, and a reset mends it all. (The traffic's damage, and the Roadster's lamps broken in a
// real crash: damage.test.mjs.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BROKE } from '../js/sim/carDamage.js'
import { Damage } from '../js/render/damage.js'

test("the Roadster's lamps go dark and their light with them, its glass crazes, and a reset mends it", () => {
  // (a stand-in for the Roadster, roadster.js: a light line along the nose and a tail light, each
  // marked with its end, the canopy's glass, and the headlights)
  const car = new THREE.Group(),
    body = new THREE.Group()
  car.add(body)
  const lamp = end => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 1.2),
      new THREE.MeshBasicMaterial({ userData: { lamp: end } })
    )
    m.position.x = end === 'front' ? 2.2 : -2.2
    return m
  }
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.4, 1.4, 4, 2, 4),
    new THREE.MeshPhysicalMaterial()
  )
  glass.userData.dent = 'glass'
  glass.position.y = 1
  body.add(lamp('front'), lamp('rear'), glass)
  const headlights = new THREE.SpotLight(0xffffff, 500)
  const doors = { 1: new THREE.Group(), '-1': new THREE.Group() }
  const RS = { car, body, headlights, doors }
  const dmg = new Damage(RS)
  const sim = { time: 1 }
  const knock = (lx, lz, impact) => {
    const e = { impact, lx, ly: 0.5, lz, lnx: -Math.sign(lx), lny: 0, lnz: 0 }
    dmg.hit(e, sim)
    sim.time += 1
    return e
  }
  // (the front left corner, hard enough to break its lamp; then square on the nose, harder)
  const e = knock(2.2, -0.9, 7)
  assert.ok(e.mine & BROKE.lamp, 'its lamp broke, for the sound')
  const front = () => dmg.out.front.value.toArray()
  assert.deepEqual(front(), [1, 0], 'the left headlight dark')
  assert.equal(headlights.intensity, 250, 'half the light on the road')
  knock(2.2, 0, 13)
  assert.deepEqual(front(), [1, 1], 'both dark')
  assert.equal(headlights.intensity, 0, 'no light on the road')
  assert.deepEqual(dmg.out.rear.value.toArray(), [0, 0], 'the tail lights lit')
  assert.ok(dmg.crazed.value.x > 0, 'the windscreen crazed')
  dmg.repair()
  assert.deepEqual(front(), [0, 0], 'a reset: the headlights whole')
  assert.deepEqual(dmg.crazed.value.toArray(), [0, 0, 0, 0], 'the glass clear')
  assert.equal(headlights.intensity, 500, 'and its light back')
})
