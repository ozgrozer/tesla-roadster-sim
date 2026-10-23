// Programs linked mid-play by getting out of a city car and by the first night on foot: the
// renderer's programs listed before and after each step, the new ones printed (0 expected after
// the warm-up). Run after the warm-up, at High.
//   PORT=8094 node tools/playtest/programs.mjs
import { Game } from './lib.mjs'
const g = await Game.open({ width: 480, height: 270 })
await g.goto('?debug=1')
await g.ev(() => { window.__roadster.intro.finish(true) })
await g.draw(2)
await g.untilReal(() => window.__roadster.post.warmed && (window.__roadster.post.warmed.then(() => { window.__warm = true }), window.__warm), 90000)
await g.ev(q => window.__roadster.climate.quality(q), 'high'); await g.run(1)
await g.untilReal(() => { window.__w2 = false; return true }, 1000)
await g.ev(() => window.__roadster.post.warmed.then(() => { window.__w2 = true }))
await g.untilReal(() => window.__w2, 90000)
await g.draw(2)
const ids = () => g.ev(() => window.__roadster.renderer.info.programs.map(p => p.id + ' ' + p.cacheKey.replace(/\n/g, '').slice(0, 160)))
const step = async (what, f) => {
  const a = new Set(await ids()); await f(); await g.draw(2)
  const b = await ids(); console.log(what, b.filter(x => !a.has(x)).join('\n'))
}
await step('seat sedan', async () => { await g.ev(() => window.__roadster.seatIn('sedan')); await g.run(1) })
await step('foot', async () => { await g.page.keyboard.press('KeyF'); await g.wait(3000) })
await step('night', async () => { await g.ev(() => { window.__roadster.climate.setHour(22.5) }); await g.run(1) })
console.log(JSON.stringify(await g.ev(() => window.__roadster.climate.qualityState())))
await g.close()
