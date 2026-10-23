// Where the time goes, for PERF.md: the game played in real time for --seconds (default 120) on
// the Autopilot through the city (or on foot / in a car: --play=foot|car), drawing off (swiftshader
// would be the whole story), every big system's update wrapped and timed (its total ms and calls),
// the JS heap read every 250 ms (its high and low, and how fast it is allocated: the rises between
// reads, MB/s, which is what the collector has to sweep up), and a frame now and then drawn with
// its draw calls and triangles. Writes $SHOTS/<tag>.json.
//   node --import ./tools/node-loader/register.mjs tools/playtest/perfx.mjs [--seconds=120] [--tag=perfx]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { instrument, sample } from './spawn.mjs'

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d

// in the page: the systems' updates wrapped (window.__prof: name -> { ms, n })
export const wrapSystems = () => {
  const R = window.__roadster
  const P = (window.__prof = {})
  const wrap = (label, o, m) => {
    if (!o || typeof o[m] !== 'function' || o[m].__w) return
    const f = o[m].bind(o)
    const rec = (P[label] = { ms: 0, n: 0, max: 0 })
    const w = (...a) => {
      const t0 = performance.now()
      const out = f(...a)
      const d = performance.now() - t0
      rec.ms += d
      rec.n++
      if (d > rec.max) rec.max = d
      return out
    }
    w.__w = true
    o[m] = w
  }
  // the physics step's parts (each 1/120 s)
  wrap('sim.step (Roadster)', R.sim, 'step')
  wrap('traffic.step', R.traffic, 'step')
  wrap('peds.step', R.peds, 'step')
  wrap('game.step (wanted, police, missions)', R.game, 'step')
  wrap('police.step', R.game.police, 'step')
  wrap('ambient.step', R.game.ambient, 'step')
  wrap('foot.step (all of the step)', R.foot, 'step')
  // the frame's parts
  wrap('cityView.update (traffic/peds views, streaming)', R.cityView, 'update')
  wrap('cityView.cars.update', R.cityView.cars, 'update')
  wrap('cityView.people.update', R.cityView.people, 'update')
  wrap('cityView.shadows', R.cityView, 'shadows')
  wrap('foot.frame', R.foot, 'frame')
  wrap('hud.update', R.hud, 'update')
  wrap('game.frame', R.game, 'frame')
  wrap('climate.update', R.climate, 'update')
  wrap('polish.frame', R.polish, 'frame')
  wrap('tween.apply', R.tween, 'apply')
  wrap('rig.update', R.rig, 'update')
  wrap('post.render (drawing)', R.post, 'render')
  // frames counted
  window.__frames = 0
  const tick = () => { window.__frames++; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  // the heap every 250 ms
  const H = (window.__heap = { lo: Infinity, hi: 0, rise: 0, last: 0, n: 0, list: [] })
  setInterval(() => {
    const u = performance.memory.usedJSHeapSize / 1048576
    if (H.last && u > H.last) H.rise += u - H.last
    H.last = u
    H.lo = Math.min(H.lo, u)
    H.hi = Math.max(H.hi, u)
    if (H.n++ % 20 === 0) H.list.push(+u.toFixed(1))
  }, 250)
}

// --cpu=1: a sampling CPU profile (Chrome's own) over the run, folded into the functions with the most
// time of their own (self) and with their callees (total), by file:line
export function topFunctions (profile, n = 30) {
  const byId = new Map(profile.nodes.map(x => [x.id, x]))
  const self = new Map()
  const dt = profile.timeDeltas
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]
    self.set(id, (self.get(id) || 0) + (dt[i] || 0) / 1000)
  }
  const parent = new Map()
  for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id)
  const key = x => {
    const f = x.callFrame
    return `${f.functionName || '(anon)'} ${(f.url || '').replace(/^.*\//, '')}:${f.lineNumber + 1}`
  }
  const S = new Map(), T = new Map()
  let all = 0
  for (const [id, ms] of self) {
    all += ms
    const k = key(byId.get(id))
    S.set(k, (S.get(k) || 0) + ms)
    const seen = new Set()
    for (let x = id; x != null; x = parent.get(x)) {
      const kk = key(byId.get(x))
      if (seen.has(kk)) continue
      seen.add(kk)
      T.set(kk, (T.get(kk) || 0) + ms)
    }
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => [k, +ms.toFixed(0)])
  return { allMs: +all.toFixed(0), self: top(S), total: top(T) }
}

export async function perfx (g, { seconds = 120, play = 'auto', cpu = null } = {}) {
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  await g.ev(instrument)
  await g.run(1)
  if (play === 'auto') await g.press('KeyI', 0.5)
  else if (play === 'foot') await g.press('KeyF', 2)
  else if (play === 'car') await g.ev(() => window.__roadster.seatIn('sedan'))
  await g.ev(wrapSystems)
  if (cpu) {
    await cpu.send('Profiler.enable')
    await cpu.send('Profiler.setSamplingInterval', { interval: 500 })
    await cpu.send('Profiler.start')
  }
  const t0 = Date.now()
  const draws = []
  let next = 0
  while (Date.now() - t0 < seconds * 1000) {
    if (play === 'foot') await g.page.keyboard.down('KeyW')
    if (Date.now() - t0 >= next) {
      // (a frame drawn every 20 s: the drawing's own cost is in post.render)
      draws.push(await g.ev(sample))
      next += 20000
    }
    await g.wait(1000)
  }
  if (play === 'foot') await g.page.keyboard.up('KeyW')
  const res = await g.ev(() => {
    const P = window.__prof, H = window.__heap
    return { prof: P, frames: window.__frames, heap: { lo: +H.lo.toFixed(1), hi: +H.hi.toFixed(1), riseMB: +H.rise.toFixed(1), list: H.list }, traffic: window.__roadster.traffic.cars.length, peds: window.__roadster.peds.list.length }
  })
  res.wall = (Date.now() - t0) / 1000
  if (cpu) res.cpu = topFunctions((await cpu.send('Profiler.stop')).profile)
  res.draws = draws.map(d => ({ calls: d.calls, tris: d.tris, main: d.main, shadow: d.shadow, update: d.update, draw: d.draw, topMain: d.topMain.slice(0, 8), topTris: d.topTris.slice(0, 8) }))
  return res
}

if (process.argv[1] && process.argv[1].endsWith('perfx.mjs')) {
  const g = await Game.open({ query: arg('query', '?debug=1'), width: 480, height: 270 })
  g.step = 'perfx'
  const seconds = Number(arg('seconds', 120))
  const cpu = arg('cpu', '') && (await g.page.context().newCDPSession(g.page))
  const r = await perfx(g, { seconds, play: arg('play', 'auto'), cpu })
  const tag = arg('tag', 'perfx')
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(path.join(SHOTS, `${tag}.json`), JSON.stringify(r, null, 1))
  console.log(`wall ${r.wall}s frames ${r.frames} (${(r.frames / r.wall).toFixed(1)}/s) heap lo ${r.heap.lo} hi ${r.heap.hi} allocated ~${(r.heap.riseMB / r.wall).toFixed(1)} MB/s cars ${r.traffic} peds ${r.peds}`)
  const rows = Object.entries(r.prof).sort((a, b) => b[1].ms - a[1].ms)
  for (const [k, v] of rows) console.log(`${k.padEnd(48)} ${(v.ms / r.wall).toFixed(1).padStart(7)} ms/s  ${(v.ms / Math.max(1, v.n)).toFixed(3).padStart(7)} ms/call  max ${v.max.toFixed(1)}  n ${v.n}`)
  for (const d of r.draws) console.log(`draw calls ${d.calls} tris ${d.tris} main ${d.main} shadow ${d.shadow}`)
  if (r.cpu) {
    console.log(`cpu profile: ${r.cpu.allMs} ms sampled; self:`)
    for (const [k, ms] of r.cpu.self.slice(0, 25)) console.log(`  ${String(ms).padStart(7)} ms  ${k}`)
    console.log('total (with callees):')
    for (const [k, ms] of r.cpu.total.slice(0, 30)) console.log(`  ${String(ms).padStart(7)} ms  ${k}`)
  }
  console.log('console', JSON.stringify(g.console.filter(c => !/GL Driver/.test(c.text)).slice(0, 5)))
  await g.close()
}
