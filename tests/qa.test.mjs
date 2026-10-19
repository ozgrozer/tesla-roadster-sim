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
