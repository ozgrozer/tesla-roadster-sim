// The headless playtest: node --import ./tools/node-loader/register.mjs tools/playtest/run.mjs
// [career|roam|perf|all] [--only=step,step] (npm run playtest). Screenshots to $SHOTS
// (/workspace/shots/qa), a report to $SHOTS/report.json; exit code 1 on any issue.
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { snapshot, check, insideBuildings } from './probe.mjs'
import { CAREER } from './career.mjs'

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
  const log = await play(g, CAREER, 'career')
  report.runs.push({ name: 'career', log, issues: g.issues, console: g.console })
  await g.close()
}
fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(report, null, 1))
let n = 0
for (const r of report.runs) {
  for (const i of r.issues) console.log('ISSUE', i.step, '|', i.what, '|', i.detail.slice(0, 300))
  for (const c of r.console) console.log('CONSOLE', c.step, c.type, c.text.slice(0, 300))
  n += r.issues.length + r.console.filter(c => c.type !== 'warning').length
}
console.log(n ? `${n} problems` : 'no problems')
process.exit(n ? 1 : 0)
