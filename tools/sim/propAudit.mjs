// Every pavement prop in the city, by type: how many there are and how many a car can knock down
// (a collider at it with breakAt, of a kind the city draws going over: render/city.js's fallers).
// --before: as the city was before v6 laid the street furniture out knockable (sim/knockables.js).
// node --import ./tools/node-loader/register.mjs tools/sim/propAudit.mjs [--before] [--json]
import { DECOR, LAMPS, POLES, TREES, PALMS, query } from '../../js/sim/city.js'
import { EXTRAS } from '../../js/sim/extras.js'
import { PROPS } from '../../js/sim/plots.js'
import { SIGNS } from '../../js/sim/stopSigns.js'
import '../../js/sim/breakables.js'
import { TOKENS } from '../../js/sim/tokens.js'
import { layKnocks } from '../../js/sim/knockables.js'

const before = process.argv.includes('--before')
if (TOKENS.length && !before) layKnocks()

const DRAWN = new Set(['lamp', 'signal', 'tree', 'palm', 'stop', 'prop'])
const hits = []
// a collider standing at (x, z) that gives to a car
const gives = (x, z) =>
  query(x - 0.02, z - 0.02, x + 0.02, z + 0.02, hits).some(c => c.breakAt > 0 && DRAWN.has(c.kind))
// the pavements' things: [type, x, z] for each
const items = []
for (const l of LAMPS) items.push([l.wood ? 'power pole' : 'street light', l.x, l.z])
for (const p of POLES) items.push(['signal mast', p.x, p.z])
for (const s of SIGNS) items.push(['stop sign', s.x, s.z])
for (const t of TREES) items.push(['tree', t.x, t.z])
for (const p of PALMS) items.push(['palm', p.x, p.z])
for (const d of DECOR) items.push([d.kind === 'bench' ? 'bus bench' : d.kind === 'bin' ? 'litter bin' : d.kind, d.x, d.z])
const NAMES = { news: 'newspaper box', meter: 'parking meter', mailbox: 'mailbox', scope: 'coin telescope', bench: 'promenade bench', bin: 'wheelie bin', crate: 'crate' }
for (const e of EXTRAS) if (NAMES[e.kind]) items.push([NAMES[e.kind], e.x, e.z])
for (const p of PROPS) if (p.kind === 'shelter') items.push(['bus shelter', p.x - Math.cos(p.yaw) * 0.7, p.z + Math.sin(p.yaw) * 0.7])

const by = {}
for (const [type, x, z] of items) {
  const b = (by[type] ??= { n: 0, breakable: 0 })
  b.n++
  if (gives(x, z)) b.breakable++
}
const types = Object.keys(by),
  n = items.length,
  broke = types.reduce((s, t) => s + by[t].breakable, 0),
  full = types.filter(t => by[t].breakable === by[t].n).length
if (process.argv.includes('--json')) console.log(JSON.stringify({ before, by, n, broke, types: types.length, full }))
else {
  console.log(before ? 'before v6' : 'v6')
  for (const t of types) console.log(`  ${t.padEnd(16)} ${String(by[t].breakable).padStart(5)} / ${String(by[t].n).padEnd(5)} ${by[t].breakable === by[t].n ? 'breakable' : by[t].breakable ? 'PARTLY' : 'SOLID / NONE'}`)
  console.log(`types breakable: ${full} / ${types.length}; instances: ${broke} / ${n} (${((100 * broke) / n).toFixed(1)} %)`)
}
