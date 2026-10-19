// The headless playtest: node --import ./tools/node-loader/register.mjs tools/playtest/run.mjs
// [career|roam|perf|all] [--only=step,step] (npm run playtest). Screenshots to $SHOTS
// (/workspace/shots/qa), a report to $SHOTS/report-<which>.json; exit code 1 on any issue.
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { snapshot, check, insideBuildings } from './probe.mjs'
import { CAREER } from './career.mjs'
import { CAREER2 } from './career2.mjs'
import { PLACES, roam } from './roam.mjs'
import { profile } from './perf.mjs'

const args = process.argv.slice(2)
const which = args.find(a => !a.startsWith('--')) || 'career'
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
fs.mkdirSync(SHOTS, { recursive: true })

export async function play (g, steps, label) {
  const log = []
  for (const [name, fn] of steps) {
    if (only.length && !only.includes(name)) continue
    g.step = `${label}:${name}`
    const t0 = Date.now()
    try {
      await fn(g)
    } catch (e) {
      g.issue('step threw', String(e.stack || e).slice(0, 400))
    }
    // (busted or wasted: back up after its title, in real time: game.js frame)
    if (await g.ev(() => !!window.__roadster.game.down)) {
      const up = await g.untilReal(() => !window.__roadster.game.down, 12000)
      g.expect(up, 'stuck busted/wasted')
      g.notes = (g.notes || []).concat(`${g.step}: ended ${up ? 'busted/wasted, back up' : 'stuck down'}`)
      await g.wait(1000)
    }
    const s = await g.ev(snapshot)
    check(g, s)
    const bad = insideBuildings(s)
    if (bad.length) g.issue('inside a building', bad.slice(0, 6))
    log.push({ step: name, ms: Date.now() - t0, mode: s.mode, pos: s.pos, wanted: s.wanted, heap: s.heap, calls: s.render.calls })
    console.log(`${g.step} ${Date.now() - t0}ms mode=${s.mode} wanted=${s.wanted} heap=${s.heap}MB issues=${g.issues.length} console=${g.console.length}`)
  }
  return log
}

const report = { at: new Date().toISOString(), runs: [] }
if (which === 'career' || which === 'all') {
  const g = await Game.open()
  const log = await play(g, [...CAREER, ...CAREER2], 'career')
  report.runs.push({ name: 'career', log, issues: g.issues, console: g.console, notes: g.notes })
  await g.close()
}
if (which === 'roam' || which === 'all') {
  const g = await Game.open()
  const steps = PLACES.map(p => [p.name, g => roam(g, p)])
  const log = await play(g, steps, 'roam')
  report.runs.push({ name: 'roam', log, issues: g.issues, console: g.console })
  await g.close()
}
if (which === 'perf' || which === 'all') {
  const g = await Game.open()
  g.step = 'perf'
  const minutes = Number((args.find(a => a.startsWith('--minutes=')) || '').slice(10)) || 4
  const perf = await profile(g, { minutes })
  const S = perf.samples
  const heap = S.map(s => s.heap)
  // (growth: the heap at the end over its lowest in the first half, after the city has filled in)
  const base = Math.min(...heap.slice(1, Math.max(2, heap.length >> 1)))
  if (heap.at(-1) - base > 60) g.issue('heap grew over the drive', { base, end: heap.at(-1) })
  const geos = S.map(s => s.geos)
  if (geos.at(-1) > geos[1] * 1.5 + 50) g.issue('geometries grew over the drive', geos)
  if (S.some(s => s.phys > 400)) g.issue('a physics spike (>400 ms for a game second)', S.map(s => Math.round(s.phys)))
  report.perf = perf
  report.runs.push({ name: 'perf', log: [], issues: g.issues, console: g.console })
  await g.close()
}
fs.writeFileSync(path.join(SHOTS, `report-${which}.json`), JSON.stringify(report, null, 1))
let n = 0
for (const r of report.runs) {
  r.console = r.console.filter(c => !/GL Driver Message|GPU stall|swiftshader/i.test(c.text))
  for (const x of r.notes || []) console.log('NOTE', x)
  for (const i of r.issues) console.log('ISSUE', i.step, '|', i.what, '|', i.detail.slice(0, 300))
  for (const c of r.console) console.log('CONSOLE', c.step, c.type, c.text.slice(0, 300))
  n += r.issues.length + r.console.filter(c => c.type !== 'warning').length
}
console.log(n ? `${n} problems` : 'no problems')
process.exit(n ? 1 : 0)
