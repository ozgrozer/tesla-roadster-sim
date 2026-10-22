// The carjacked driver's pull-out, staged (alight.js haul): out of the seat beside the door, thrown
// back along the car onto the ground with the slide easing out (no jump in any step, nothing
// shoved by the player at the door), a moment down, then up, to the pavement and running off.
// And the car's name bottom right taken down when the player gets out or is busted (carName.js).
// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { footProxy } from '../js/sim/vehicleLink.js'
import { makeControls } from '../js/sim/constants.js'
import { LANE_OFF } from '../js/sim/city.js'
import { HAUL } from '../js/sim/alight.js'
import { dropCarName } from '../js/carName.js'

const H = 1 / 120
function world () {
  const sim = new Sim()
  sim.reset('city', { x: 100, z: LANE_OFF[1], yaw: 0 })
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 2 })
  peds.reset(sim.pos.x, sim.pos.z)
  const view = { x: sim.pos.x, z: sim.pos.z, fx: 1, fz: 0 }
  const c = makeControls()
  c.brake = 1
  return { sim, tr, peds, view }
}

test('a carjacked driver is thrown out and down by the door, smoothly, then gets up and runs', () => {
  const { tr, peds, view } = world()
  const car = tr.cars.find(c => !c.parked && !c.loose)
  tr.takeOver(car, 'player')
  car.v = 0
  // (the player stood at the driver's door, as boarding.js has them: vehicles.js door)
  const lx = car.hz, lz = -car.hx
  const door = { x: car.x + lx * (car.wid / 2 + 0.5), z: car.z + lz * (car.wid / 2 + 0.5) }
  const e = tr.ejectDriver(car, { side: 1, jacked: true, along: -0.6 })
  const foot = footProxy({ x: door.x, z: door.z })
  const n = peds.list.length
  peds.step(H, foot, tr, view)
  const d = peds.list[peds.list.length - 1]
  assert.ok(peds.list.length === n + 1 && d.jacked && d.hauled)
  // first seen beside the car's side, at the seat (not on the player, not inside the body)
  const side = (d.x - car.x) * lx + (d.z - car.z) * lz
  assert.ok(side > car.wid / 2 + 0.3 && side < car.wid / 2 + 0.8, `beside the door (${side})`)
  assert.equal(d.state, 'down')
  let last = { x: d.x, z: d.z }, maxStep = 0, t = 0, upAt = null, fledAt = null
  const start = { x: e.sx, z: e.sz }
  for (let i = 0; i < 12 / H; i++) {
    peds.step(H, foot, tr, view)
    t += H
    maxStep = Math.max(maxStep, Math.hypot(d.x - last.x, d.z - last.z))
    last = { x: d.x, z: d.z }
    if (upAt === null && d.state !== 'down') upAt = t
    if (d.state === 'flee') {
      fledAt = t
      break
    }
  }
  // the throw: at most its starting speed in a step (no jumps), and it carries them about HAUL.dist
  assert.ok(maxStep <= HAUL.dist * 4 * H * 1.6 + 1e-6, `no jump (${maxStep.toFixed(3)} m in a step)`)
  assert.ok(upAt >= HAUL.down - 2 * H && upAt < HAUL.down + 0.5, `down a moment (${upAt})`)
  assert.ok(fledAt !== null, `ran off (${d.state})`)
  assert.ok(Math.hypot(start.x - door.x, start.z - door.z) > 0.4, 'not out on top of the player')
})

test('the car name is taken down when the player gets out or is busted', () => {
  const cls = new Set(['car'])
  const hud = { place: { left: 3.2, el: { box: { classList: { contains: k => cls.has(k) } } } } }
  dropCarName(hud)
  assert.equal(hud.place.left, 0)
  // (a street's name up is left as it is)
  cls.clear()
  hud.place.left = 4
  dropCarName(hud)
  assert.equal(hud.place.left, 4)
  dropCarName(null)
})
