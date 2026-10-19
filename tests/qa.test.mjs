// Regressions from the integration playtest (tools/playtest): each found in the merged game, fixed,
// and pinned here where Node can check it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { Peds } from '../js/sim/peds.js'
import { makeControls } from '../js/sim/constants.js'
import { BLOCKS, superOf } from '../js/sim/city.js'
import { crossings } from '../js/sim/pavement.js'
import { roofAt } from '../js/sim/roofs.js'

// (inside a building's walls, more than a body's width in: not under a deck or a roof)
const walled = (x, z, m = 0.6) => {
  const c = roofAt(x, z, Infinity)
  return !!c && c.y1 > 2.5 && (c.y0 || 0) < 1 && Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z) > m
}

test('nobody walks into a superblock: its pavements run through the stadium bowl and the container stacks', () => {
  for (const b of BLOCKS)
    for (let k = 0; k < 4; k++)
      for (const c of crossings(b, k)) {
        assert.ok(!superOf(b.bx, b.bz), `a crossing from superblock block ${b.bx},${b.bz}`)
        assert.ok(!superOf(c.block.bx, c.block.bz), `a crossing into superblock block ${c.block.bx},${c.block.bz}`)
      }
})

test('the people round the stadium and the port stay out of the bowl and the containers', () => {
  for (const [x, z] of [[0, 480], [-740, 620]]) {
    const sim = new Sim()
    sim.reset('city', { x, z, yaw: 0 })
    const tr = new Traffic({ seed: 3 })
    tr.reset(x, z)
    const peds = new Peds({ seed: 5 })
    peds.reset(x, z)
    const view = { x, z, fx: 1, fz: 0 }
    const c = makeControls()
    c.brake = 1
    const H = 1 / 30
    for (let i = 0; i < 40 / H; i++) {
      sim.step(H, c)
      peds.step(H, sim, tr, view)
      tr.step(H, sim, view)
      sim.events.length = 0
      if (i % 30) continue
      for (const p of peds.list)
        if (!p.hidden) assert.ok(!walled(p.x, p.z), `someone inside a building at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} (${p.state})`)
    }
  }
})

test("a parked car knocked loose on a garage's deck stays on it: stopped by the parapet, not through it, and at the deck's height", async () => {
  const { STALLS } = await import('../js/sim/city.js')
  const { loosen } = await import('../js/sim/wrecks.js')
  const { groundHeight } = await import('../js/sim/world.js')
  const { rng } = await import('../js/sim/city.js')
  const st = STALLS.find(s => Math.abs((s.y || 0) - 3.4) < 0.01)
  assert.ok(st, 'a stall on a first deck')
  const sim = new Sim()
  sim.reset('city', { x: st.x + 60, z: st.z, yaw: 0 })
  const tr = new Traffic({ seed: 3 })
  tr.reset(st.x + 60, st.z)
  const car = tr.park(st, rng(5), 0)
  assert.equal(car.y, 3.4)
  // shoved west, hard, along the deck
  loosen(tr, car)
  car.vx = -18
  car.vz = 0
  const x0 = car.x
  const view = { x: st.x + 60, z: st.z, fx: 1, fz: 0 }
  const c = makeControls()
  c.brake = 1
  const H = 1 / 60
  for (let i = 0; i < 4 / H; i++) {
    sim.step(H, c)
    tr.step(H, sim, view)
    sim.events.length = 0
  }
  // (still on the deck: at its height, with a deck under it)
  assert.ok(Math.abs(car.y - groundHeight(car.x, car.z, car.y + 0.6)) < 0.05, `y ${car.y} over ground ${groundHeight(car.x, car.z, car.y + 0.6)}`)
  assert.ok(car.y > 3, `fell off the deck: y ${car.y} after sliding from x ${x0.toFixed(1)} to ${car.x.toFixed(1)}`)
})

test('a bus the player drives knocks down someone its long nose reaches, not only within a Roadster’s length', async () => {
  const { vehicleProxy, bodyFromTraffic, syncProxy } = await import('../js/sim/vehicleLink.js')
  const { IDX } = await import('../js/sim/carTypes.js')
  const x = 100, z = 0
  const tr = new Traffic({ seed: 3, count: 0 })
  tr.reset(x + 500, z)
  const peds = new Peds({ seed: 5, count: 1 })
  peds.reset(x, z)
  const bus = tr.make(IDX.bus, false)
  Object.assign(bus, { x: x + 400, z, v: 0 })
  tr.setYaw(bus, 0)
  const b = bodyFromTraffic(bus)
  const proxy = vehicleProxy(b)
  assert.ok(proxy.halfL > 4, 'a bus is long')
  const p = peds.list[0]
  peds.step(1 / 60, proxy, tr, null) // (on their pavement)
  // the bus's middle 4 m short of them, coming on: they are inside its nose, past a Roadster's
  b.x = p.x - 4
  b.z = p.z - 0.4
  b.vx = 9
  b.vz = 0
  syncProxy(proxy, b)
  peds.step(1 / 60, proxy, tr, null)
  assert.equal(p.state, 'down')
})
