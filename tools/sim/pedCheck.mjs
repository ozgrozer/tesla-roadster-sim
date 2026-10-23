// The people on foot, played in Node and checked (js/sim/pedCheck.js): a quiet block, a crossing,
// the Roadster up on the pavement and a crash, a walk among them on foot. Prints what it found.
// node --import ./tools/node-loader/register.mjs tools/sim/pedCheck.mjs [seconds]
import { Sim } from '../../js/sim/sim.js'
import { Traffic } from '../../js/sim/traffic.js'
import { Peds } from '../../js/sim/peds.js'
import { PedCheck } from '../../js/sim/pedCheck.js'
import { makeControls } from '../../js/sim/constants.js'
import { LANE_OFF, ROADS, WILSHIRE, ROAD_HW } from '../../js/sim/city.js'
import { ENV } from '../../js/sim/env.js'

const H = 1 / 60
const secs = Number(process.argv[2]) || 60
const scenes = [
  ['street', { x: 100, z: LANE_OFF[1], yaw: 0 }, () => ({ brake: 1 })],
  [
    'wilshire',
    { x: ROADS[6] + 14, z: ROADS[WILSHIRE] + ROAD_HW - 1.5, yaw: 0 },
    () => ({ brake: 1 })
  ],
  // (up onto the pavement at a jog, then along it: a fright)
  [
    'pavement',
    { x: ROADS[6] + 14, z: ROADS[WILSHIRE] + ROAD_HW + 2.2, yaw: 0 },
    t => (t > 3 && t < 9 ? { throttle: 0.35 } : { brake: 1 })
  ],
  [
    'traffic',
    { x: 100, z: LANE_OFF[1], yaw: 0 },
    t =>
      t > 2 && t < 30
        ? { throttle: 0.4, steer: Math.sin(t * 0.3) * 0.1 }
        : { brake: 1 }
  ]
]
ENV.hour = 13
const all = {}
for (const [name, at, drive] of scenes) {
  const sim = new Sim()
  sim.reset('city', at)
  const tr = new Traffic({ seed: 3 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 7 })
  peds.reset(sim.pos.x, sim.pos.z)
  const chk = new PedCheck(peds)
  for (let i = 0; i < secs / H; i++) {
    const t = i * H
    const c = Object.assign(makeControls(), drive(t))
    sim.step(H, c)
    const view = {
      x: sim.pos.x,
      z: sim.pos.z,
      fx: Math.cos(sim.yaw),
      fz: -Math.sin(sim.yaw)
    }
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
    chk.step(H, tr.cars)
  }
  const r = chk.report()
  all[name] = r
  console.log(
    name,
    'samples',
    r.samples,
    JSON.stringify(r.count),
    JSON.stringify(r.states)
  )
  const by = {}
  for (const f of r.flags) (by[f.kind] ||= []).push(f)
  for (const [k, L] of Object.entries(by))
    console.log('  ', k, L.length, JSON.stringify(L.slice(0, 4)))
}
if (process.env.OUT)
  (await import('node:fs')).writeFileSync(
    process.env.OUT,
    JSON.stringify(all, null, 1)
  )
