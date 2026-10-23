// The graphics presets side by side: for each of day, night and night in the rain, each preset's
// frame (wall ms per drawn frame on this machine's GL, draw calls, triangles, the MSAA samples, the
// shadow map and the real lights it has), median of a few frames, written to $SHOTS/<tag>.json.
//   PORT=8094 SHOTS=/workspace/shots/v5/core/perf node tools/playtest/quality.mjs [tag] [presets]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'

const tag = process.argv[2] || 'quality'
const presets = (process.argv[3] || 'high,medium,low').split(',')
const FRAMES = 6
const g = await Game.open({})
await g.untilReal(() => !window.__roadster.intro.active, 30000).catch(() => {})
await g.ev(() => window.__roadster.intro.active && window.__roadster.intro.finish())
await g.run(3)
const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1]
async function measure () {
  return g.ev(n => new Promise(resolve => {
    const R = window.__roadster,
      info = R.renderer.info
    info.autoReset = false
    const out = []
    let last = 0,
      k = 0
    window.__draw = true
    const f = t => {
      if (k > 2) out.push({ ms: t - last, calls: info.render.calls, tris: info.render.triangles })
      last = t
      info.reset()
      if (++k > n + 2) {
        window.__draw = false
        info.autoReset = true
        return resolve(out)
      }
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), FRAMES)
}
const rows = []
for (const scene of ['day', 'night', 'rain-night']) {
  await g.ev(s => {
    const R = window.__roadster
    R.env.auto = false
    R.env.hour = s === 'day' ? 13 : 23
  }, scene)
  if (scene === 'rain-night') for (let i = 0; i < 4; i++) await g.ev(() => window.__roadster.climate.nextWeather())
  await g.run(scene === 'rain-night' ? 8 : 2)
  for (const p of presets) {
    await g.ev(p => window.__roadster.climate.quality(p), p)
    await g.draw(3) // (the targets made again, the shaders compiled)
    const f = await measure()
    const st = await g.ev(() => {
      const R = window.__roadster
      return { q: R.app.quality, ratio: R.renderer.getPixelRatio(), samples: R.post.samples, wet: +R.env.wet.toFixed(2), hour: R.env.hour, extra: R.climate.qualityState?.() }
    })
    const row = { scene, preset: p, ms: median(f.map(x => x.ms)), calls: median(f.map(x => x.calls)), tris: median(f.map(x => x.tris)), ...st }
    console.log(JSON.stringify(row))
    rows.push(row)
  }
}
fs.writeFileSync(path.join(SHOTS, tag + '.json'), JSON.stringify(rows, null, 1))
console.log('errors', g.console.filter(c => c.type === 'error' || c.type === 'pageerror').slice(0, 5))
await g.close()
