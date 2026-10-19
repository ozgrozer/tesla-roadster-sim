// The polish over the cars the player drives that aren't the Roadster: the follow arm sized to the
// car, V's camera cycle (the Far camera, the Hood camera in place of the Roadster's cockpit, no
// Director in the city), the Hood camera riding the body and the walls' clip easing back out; and
// the drawn car posed from its physics body, its tyres' pivots and its slide for the skids and the
// smoke: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { addEventListener () {} }
globalThis.document = { querySelectorAll: () => [] }
const THREE = await import('three')
const { armScale, armRise, hoodSeat, smoothClip } = await import('../js/render/carCam.js')
const { CameraRig } = await import('../js/render/camera.js')
const { PlayerCar } = await import('../js/render/playerCar.js')
const { IDX } = await import('../js/sim/carTypes.js')
const { createVehicleBody, stepVehicle, makeVehicleInput } = await import('../js/sim/vehicleSim.js')

const dom = { addEventListener () {}, removeEventListener () {}, getRootNode: () => dom, style: {} }
const rig = () => new CameraRig(new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000), dom)

test('the follow arm sits further back and higher for a bigger car', () => {
  assert.equal(armScale(null), 1)
  assert.ok(armScale(IDX.sedan) >= 1 && armScale(IDX.sedan) < 1.2)
  assert.ok(armScale(IDX.bus) > 1.8)
  assert.ok(armScale(IDX.van) > armScale(IDX.suv))
  assert.ok(armRise(IDX.bus) > 1 && armRise(IDX.sports) === 0)
})

test("V's cycle: Far after Follow, the Hood camera in another car, no Director in the city", () => {
  const r = rig()
  r.setMode('follow')
  assert.equal(r.cycle(), 'far')
  r.noCockpit = true
  r.hood = null
  r.setMode('chase')
  assert.equal(r.cycle(), 'side') // (no car to put a Hood camera on)
  r.hood = { x: 0, z: 0, yaw: 0, type: IDX.sedan }
  r.setMode('chase')
  assert.equal(r.cycle(), 'cockpit')
  assert.equal(r.nameOf(), 'Hood')
  r.clip = () => {}
  r.setMode('free')
  assert.equal(r.cycle(), 'follow') // (past the director)
})

test('the Hood camera sits over the bonnet, looking along the car, riding its roll', () => {
  const r = rig()
  const S = { ws: 0.95, L: 2.35, top: x => (x >= 0.95 ? 0.95 : 1.4) }
  const car = { x: 10, z: 5, yaw: Math.PI / 2, pitch: 0, roll: 0, lift: 0, steer: 0 }
  const fov = hoodSeat(r, 1 / 60, car, S)
  assert.ok(fov > 55 && fov < 90)
  // (yaw pi/2: the nose towards -z) ahead of the middle, over the bonnet
  assert.ok(r.pos.z < 5 - 0.9 && Math.abs(r.pos.x - 10) < 0.01)
  assert.ok(r.pos.y > 1.1 && r.pos.y < 1.5)
  assert.ok(r.aim.z < r.pos.z - 5)
  car.roll = 0.1
  hoodSeat(r, 1 / 60, car, S)
  assert.ok(Math.abs(r.camUp.x) > 0.05) // (the horizon tilts with the body)
})

test("the walls' clip pulls the camera in at once and lets it back out over a moment", () => {
  const r = { wallReach: Infinity }
  const aim = new THREE.Vector3(0, 1, 0)
  let wall = 3
  const clip = (a, p) => {
    const d = p.distanceTo(a)
    if (d > wall) p.lerpVectors(a, p, wall / d)
  }
  const pos = () => new THREE.Vector3(8, 1, 0)
  let p = pos()
  smoothClip(r, clip, aim, p, 1 / 60)
  assert.ok(Math.abs(p.distanceTo(aim) - 3) < 1e-6)
  wall = 100
  p = pos()
  smoothClip(r, clip, aim, p, 1 / 60)
  const d1 = p.distanceTo(aim)
  assert.ok(d1 > 3 && d1 < 4, `eased, not snapped: ${d1}`)
  for (let i = 0; i < 300; i++) smoothClip(r, clip, aim, (p = pos()), 1 / 60)
  assert.ok(Math.abs(p.distanceTo(aim) - 8) < 1e-6)
  assert.equal(r.wallReach, Infinity)
})

test('the drawn car is posed from its body: pitch, roll, steer, lamps; its pivots under its tyres; its slide for the skids', () => {
  const S = { axles: [1.4, -1.4], track: 0.8, r: 0.34 }
  const pc = new PlayerCar({ cars: { types: [{ S }] } })
  const b = createVehicleBody('sports', { x: 0, z: 0, yaw: 0 })
  const car = { type: 0, x: 0, z: 0, yaw: 0 }
  const alt = { active: true, car, body: b, sim: { pos: new THREE.Vector3() } }
  const inp = makeVehicleInput()
  inp.throttle = 1
  for (let i = 0; i < 240; i++) stepVehicle(b, inp, 1 / 120)
  inp.throttle = 0.6
  inp.steer = 1
  inp.handbrake = true
  for (let i = 0; i < 60; i++) stepVehicle(b, inp, 1 / 120)
  Object.assign(car, { x: b.x, z: b.z, yaw: b.yaw })
  const fx = pc.frame(alt, 1 / 60)
  assert.equal(fx, pc)
  assert.ok(car.posed)
  assert.equal(car.steer, b.steerAng)
  assert.ok(Math.sign(car.roll) === Math.sign(b.roll) && car.roll !== 0)
  assert.ok(alt.sim.skidR > 0.2, `the rears slide: ${alt.sim.skidR}`)
  assert.equal(fx.wheels.length, 4)
  const w = new THREE.Vector3()
  fx.wheels[0].pivot.getWorldPosition(w)
  assert.ok(Math.abs(Math.hypot(w.x - car.x, w.z - car.z) - Math.hypot(1.4, 0.8)) < 1e-6)
  alt.active = false
  assert.equal(pc.frame(alt, 1 / 60), null)
  assert.equal(car.posed, false)
})
