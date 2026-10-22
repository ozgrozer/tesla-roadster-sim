// The AI's cost without a browser: the traffic and the people stepped at 120 Hz round a stand-in
// for the player (vehicleLink.js footProxy, as onFoot.js steps them) moving through the city: on
// foot (1.5 m/s) or driving (15 m/s) down Wilshire from Downtown. Each system's time per step (mean,
// p99, worst) and what one step allocates. Run with a big young generation so no scavenge falls
// inside a window and the heap's rise is the allocation:
//   node --max-semi-space-size=512 --expose-gc --import ./tools/node-loader/register.mjs \
//     tools/bench/sim.mjs [--at=53,-353] [--speed=1.5] [--seconds=60] [--json=out.json]
// The numbers from a loaded box wobble; compare runs made back to back.
import fs from 'node:fs'
import { Traffic } from '../../js/sim/traffic.js'
import { Peds } from '../../js/sim/peds.js'
import { footProxy } from '../../js/sim/vehicleLink.js'
import { ENV } from '../../js/sim/env.js'

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d
const H = 1 / 120

export function bench ({ at = [53, -353], speed = 1.5, seconds = 60, hour = 13, warmup = 5 } = {}) {
  ENV.hour = hour
  const pos = { x: at[0], z: at[1] }
  const traffic = new Traffic()
  const peds = new Peds()
  traffic.reset(pos.x, pos.z)
  peds.reset(pos.x, pos.z)
  const view = { x: pos.x, z: pos.z, fx: 1, fz: 0, heading: 0 }
  const T = { traffic: [], peds: [] }
  const alloc = { steps: 0, bytes: 0 }
  const n = Math.round((warmup + seconds) / H)
  let dir = 1
  let win = null
  for (let i = 0; i < n; i++) {
    // (east and back along the avenue: 600 m out)
    pos.x += dir * speed * H
    if (Math.abs(pos.x - at[0]) > 600) dir = -dir
    view.x = pos.x - dir * 6
    view.z = pos.z
    view.fx = dir
    const fp = footProxy(pos, dir > 0 ? 0 : Math.PI)
    fp.vel.x = dir * speed
    fp.speed = speed
    traffic.walker = speed > 4 ? null : pos
    const on = i * H >= warmup
    // (the heap a window of 240 steps at a time)
    if (on && !win && globalThis.gc) {
      globalThis.gc()
      win = { heap: process.memoryUsage().heapUsed, k: 0 }
    }
    const t0 = performance.now()
    peds.step(H, fp, traffic, view)
    const t1 = performance.now()
    traffic.step(H, fp, view)
    const t2 = performance.now()
    if (on) {
      T.peds.push(t1 - t0)
      T.traffic.push(t2 - t1)
    }
    if (win && ++win.k === 240) {
      const d = process.memoryUsage().heapUsed - win.heap
      if (d > 0) {
        alloc.bytes += d
        alloc.steps += 240
      }
      win = null
    }
  }
  const stat = a => {
    const s = a.slice().sort((x, y) => x - y)
    const mean = a.reduce((x, y) => x + y, 0) / a.length
    return { mean: +mean.toFixed(4), p50: +s[s.length >> 1].toFixed(4), p99: +s[Math.floor(s.length * 0.99)].toFixed(3), max: +s[s.length - 1].toFixed(2) }
  }
  return {
    at,
    speed,
    seconds,
    cars: traffic.cars.length,
    peds: peds.list.length,
    traffic: stat(T.traffic),
    peds_: stat(T.peds),
    kbPerStep: alloc.steps ? +(alloc.bytes / alloc.steps / 1024).toFixed(2) : null,
    mbPerSec: alloc.steps ? +((alloc.bytes / alloc.steps) * 120 / 1048576).toFixed(2) : null
  }
}

// --sites=1: where it allocates (V8's sampling heap profiler, the garbage counted too), by file:line
async function sites (run) {
  const { Session } = await import('node:inspector/promises')
  const S = new Session()
  S.connect()
  await S.post('HeapProfiler.enable')
  await S.post('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
  const r = run()
  const { profile } = await S.post('HeapProfiler.stopSampling')
  const self = new Map()
  const walk = (x, stack) => {
    const f = x.callFrame
    const k = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/js\//, '')}:${f.lineNumber + 1}`
    if (x.selfSize) self.set(k, (self.get(k) || 0) + x.selfSize)
    for (const c of x.children) walk(c, stack)
  }
  walk(profile.head)
  const all = [...self.values()].reduce((a, b) => a + b, 0)
  r.sites = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, b]) => [k, +(b / all * 100).toFixed(1)])
  return r
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const go = () => bench({
    at: arg('at', '53,-353').split(',').map(Number),
    speed: Number(arg('speed', 1.5)),
    seconds: Number(arg('seconds', 60))
  })
  const r = arg('sites', '') ? await sites(go) : go()
  const { sites: list, ...rest } = r
  console.log(JSON.stringify(rest))
  for (const [k, pc] of list || []) console.log(`  ${String(pc).padStart(5)} %  ${k}`)
  const out = arg('json', '')
  if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1))
}
