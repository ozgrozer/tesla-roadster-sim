// Shader programs linked through a dusk (and the rain by day, and the lamps switched by hand): the
// clock stepped from 17:00 to 21:00 a quarter hour at a time, a frame drawn at each, the programs
// linked (WebGL linkProgram, wrapped before the page loads) counted with the city's dark, the
// drivers' headlights and the lights shown. Any link after the warm-up is a stall on a real GPU.
//   PORT=8094 SHOTS=... node tools/playtest/dusk.mjs [tag]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'

const tag = process.argv[2] || 'dusk'
const QUALITY = process.argv[3] || 'high' // (the preset from the start, so the warm-up is for it)
const g = await Game.open({ width: 320, height: 180 })
await g.page.addInitScript(q => {
  try { localStorage.setItem('roadster.quality', q) } catch {}
  window.__links = 0
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const f = P.linkProgram
    P.linkProgram = function (...a) { window.__links++; return f.apply(this, a) }
  }
}, QUALITY)
await g.goto('?debug=1')
await g.ev(() => window.__roadster.intro.finish(true))
// (the warm-up's programs: it starts after the first frame, a look each 400 ms)
await g.draw(2)
await g.untilReal(() => window.__roadster.post.warmed && (window.__roadster.post.warmed.then(() => { window.__warm = true }), window.__warm), 60000)
await g.draw(2)
const rows = []
const state = () => g.ev(() => {
  const R = window.__roadster, E = R.env || {}, l = R.cityView.daylight?.lamps
  const L = window.__links
  window.__links = 0
  return { links: L, dark: +(E.dark || 0).toFixed(2), head: R.RS.headlights.visible, lamps: l ? l.lights.filter(x => x.visible).length : null }
})
rows.push({ at: 'warmed', ...(await state()), quality: await g.ev(() => window.__roadster.climate.qualityState()) })
for (let h = 17; h <= 21.01; h += 0.25) {
  await g.ev(h => window.__roadster.climate.setHour(h), h)
  await g.run(0.5)
  await g.draw(1)
  rows.push({ at: h.toFixed(2), ...(await state()) })
}
// by day in the rain (the drivers' lights on), and the lamps switched by hand (H)
await g.ev(() => { window.__roadster.climate.setHour(12) }); await g.run(0.5); await g.draw(1)
rows.push({ at: 'noon', ...(await state()) })
await g.press('KeyH', 0.5); await g.draw(1)
rows.push({ at: 'noon H', ...(await state()) })
await g.press('KeyH', 0.5); await g.draw(1)
rows.push({ at: 'noon H again', ...(await state()) })
for (const r of rows) console.log(JSON.stringify(r))
const total = rows.slice(1).reduce((a, r) => a + r.links, 0)
console.log('links after the warm-up:', total)
fs.mkdirSync(SHOTS, { recursive: true })
fs.writeFileSync(path.join(SHOTS, tag + '.json'), JSON.stringify({ rows, total }, null, 1))
await g.close()
