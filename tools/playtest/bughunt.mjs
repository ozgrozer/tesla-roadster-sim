// Bug hunt: the ways a player gets the game into a muddle, one after another in real time (keys
// (GTA V's: F in and out) mashed, cancelled half way, the world and the quality switched), with the state checked after
// each for what shouldn't be: a console error, a getting in or out that never finishes, a car
// that won't drive, a NaN anywhere, the player on foot inside a car's action.
//   PORT=8094 SHOTS=/workspace/shots/v5/core node tools/playtest/bughunt.mjs
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { toDoor } from './helpers.mjs'

const g = await Game.open({ query: '?debug=1' }) // (Y, L, O: the debug keys)
await g.untilReal(() => !window.__roadster.intro.active, 30000).catch(() => {})
await g.ev(() => window.__roadster.intro.active && window.__roadster.intro.finish(true))
const k = g.page.keyboard
const state = () => g.ev(() => {
  const R = window.__roadster,
    f = R.foot,
    b = f.alt?.active ? f.alt.body : null,
    s = R.sim
  return {
    mode: R.player.mode,
    action: f.action ? f.action.kind + ':' + f.action.phase : null,
    exitQ: !!f.exitQ,
    car: b ? { u: b.u, x: b.x, z: b.z } : null,
    rs: { x: s.pos?.x ?? s.x, z: s.pos?.z ?? s.z, v: s.speed },
    p: { x: R.player.pos.x, z: R.player.pos.z },
    q: R.climate.qualityState(),
    world: R.app.world
  }
})
const nan = o => JSON.stringify(o, (key, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!')
const log = []
// a step: do it, let things settle (real ms), then check nothing is stuck
async function step (name, fn, settle = 2500, want = {}) {
  g.step = name
  const before = g.console.length
  try { await fn() } catch (e) { g.issue('threw', e.message) }
  await g.wait(settle)
  const s = await state()
  const bad = []
  if (nan(s)) bad.push('NaN in state')
  if (s.action) bad.push('action still running: ' + s.action)
  if (want.mode && s.mode !== want.mode) bad.push(`mode ${s.mode}, wanted ${want.mode}`)
  if (s.mode === 'foot' && s.exitQ) bad.push('exitQ left set on foot')
  const errs = g.console.slice(before).filter(c => c.type !== 'warning')
  if (errs.length) bad.push('console: ' + errs.map(e => e.text).join(' | ').slice(0, 300))
  for (const b of bad) g.issue(b, s)
  log.push({ name, ok: !bad.length, bad, mode: s.mode, q: s.q?.preset })
  console.log(bad.length ? 'BAD ' : 'ok  ', name, bad.join('; '))
  return s
}
const tap = (c, n = 1, gap = 40) => (async () => { for (let i = 0; i < n; i++) { await k.press(c); await g.wait(gap) } })()
const nearestParked = (skip = 0) => g.ev(skip => {
  const R = window.__roadster, P = R.player.pos
  let best = -1, bd = 1e9
  R.traffic.cars.forEach((c, j) => { if (!c.parked || c.ctl || c.jam || c.player) return; const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > skip && d < bd) { bd = d; best = j } })
  return best
}, skip)

await step('out of the Roadster (F)', () => tap('KeyF'), 2500, { mode: 'foot' })
await step('F mashed by the Roadster (in, out, in...)', () => tap('KeyF', 7, 60), 4000)
let s = await state()
if (s.mode === 'foot') await step('back into the Roadster', () => tap('KeyF'), 3000, { mode: 'car' })
await step('drive off, steer both ways', async () => { await k.down('KeyW'); await g.wait(1500); await k.down('KeyA'); await g.wait(600); await k.up('KeyA'); await k.down('KeyD'); await g.wait(600); await k.up('KeyD') }, 200)
await step('F at speed then E again (cancel the bail-out)', async () => { await tap('KeyF'); await g.wait(150); await tap('KeyF') }, 1500, { mode: 'car' })
await step('F at speed: brakes and gets out', async () => { await k.up('KeyW'); await tap('KeyF') }, 5000, { mode: 'foot' })
let i = await nearestParked(4)
await step('a parked car: F, then S during the break-in (it goes on)', async () => { await g.ev(toDoor, i); await g.wait(200); await tap('KeyF'); await g.wait(250); await k.down('KeyS'); await g.wait(300); await k.up('KeyS') }, 2500, { mode: 'car' })
await step('out of it', () => tap('KeyF'), 2000, { mode: 'foot' })
await step('back in (F), W held from 0.7 s (hurried)', async () => { await g.ev(toDoor, i); await g.wait(200); await tap('KeyF'); await g.wait(700); await k.down('KeyW'); await g.wait(1200) }, 1500, { mode: 'car' })
await k.up('KeyW')
await step('in the stolen car: F then F during the exit', async () => { await g.wait(1500); await tap('KeyF'); await g.wait(300); await tap('KeyF') }, 4000)
s = await state()
if (s.mode === 'car') await step('out of the stolen car', () => tap('KeyF'), 2500, { mode: 'foot' })
await step('F mashed by the stolen car', async () => { await g.ev(toDoor, i).catch(() => {}); await tap('KeyF', 9, 50) }, 4500)
s = await state()
await step('world switch (Y) and back', async () => { await tap('KeyY'); await g.wait(2500); await tap('KeyY') }, 3000)
await step('time skip to night (L x3) and weather (O x3)', async () => { for (let n = 0; n < 3; n++) { await tap('KeyL'); await g.wait(3600) } await tap('KeyO', 3, 300) }, 1500)
for (const q of ['low', 'medium', 'high', 'auto']) {
  await step('quality ' + q + ' (a frame drawn)', async () => { await g.ev(q => window.__roadster.climate.quality(q), q); await g.draw(1) }, 300)
}
await step('pause (Esc) and back', async () => { await tap('Escape'); await g.wait(800); await tap('Escape') }, 800)
s = await state()
const final = await g.shot('bughunt-end.png').catch(e => e.message)
fs.writeFileSync(path.join(SHOTS, 'bughunt.json'), JSON.stringify({ log, issues: g.issues, console: g.console.slice(0, 30), final: s }, null, 1))
console.log('issues', g.issues.length, 'console', g.console.filter(c => c.type !== 'warning').length, final)
await g.close()
