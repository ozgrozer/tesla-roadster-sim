// The street furniture knocked flying, in the browser: the Roadster driven at 40 km/h into a hydrant
// (the geyser it leaves) and along a pavement through a row of newspaper boxes, meters and bins (the
// things thrown and lying where they came down). Counts the shader programs linked once the warm-up
// is done (none should be), and what is moving and spraying.
//   node --import ./tools/node-loader/register.mjs tools/playtest/propShots.mjs   (PORT=, SHOTS=)
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { query } from '../../js/sim/city.js'
import '../../js/sim/breakables.js'
import { TOKENS } from '../../js/sim/tokens.js'
import { KNOCKS, layKnocks } from '../../js/sim/knockables.js'

if (TOKENS.length) layKnocks()
const solid = (x0, z0, x1, z1) =>
  query(x0, z0, x1, z1, []).some(o => o.kind !== 'prop' && !o.breakAt && o.y0 < 1.5 && o.y1 > 0.1)
// a run along an axis at k from back m off: nothing solid but other knockables in the way
function runAt (k, back, ahead = 4, hw = 1.1) {
  const x = (k.c.x0 + k.c.x1) / 2,
    z = (k.c.z0 + k.c.z1) / 2
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const sx = x - dx * back,
      sz = z - dz * back,
      ex = x + dx * ahead,
      ez = z + dz * ahead
    if (!solid(Math.min(sx, ex) - (dx ? 0 : hw), Math.min(sz, ez) - (dz ? 0 : hw), Math.max(sx, ex) + (dx ? 0 : hw), Math.max(sz, ez) + (dz ? 0 : hw)))
      return { x: sx, z: sz, yaw: Math.atan2(-dz, dx), dx, dz }
  }
  return null
}
// the hydrant: the first one with an open run
const hyd = KNOCKS.find(k => k.kind === 'hydrant' && runAt(k, 14, 8))
const hRun = runAt(hyd, 14, 8)
// the row: the run along a pavement that goes through the most knockables in 30 m
let best = null
for (const k of KNOCKS) {
  if (k.kind !== 'meter' && k.kind !== 'news') continue
  const r = runAt(k, 12, 22, 1.0)
  if (!r) continue
  const n = KNOCKS.filter(o => {
    const u = (o.x - r.x) * r.dx + (o.z - r.z) * r.dz,
      w = Math.abs((o.x - r.x) * -r.dz + (o.z - r.z) * r.dx)
    return u > 0 && u < 34 && w < 0.9
  }).length
  if (!best || n > best.n) best = { n, r, k: KNOCKS.indexOf(k) }
}

const QUALITY = () => {
  window.__links = 0
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const f = P.linkProgram
    P.linkProgram = function (...a) { window.__links++; return f.apply(this, a) }
  }
}
const out = { hydrant: { i: KNOCKS.indexOf(hyd), run: hRun }, row: best }
const g = await Game.open({ init: QUALITY })
try {
  await g.draw(2)
  await g.untilReal(() => window.__roadster.post.warmed && (window.__roadster.post.warmed.then(() => { window.__warm = true }), window.__warm), 90000)
  await g.draw(2)
  out.same = await g.ev(([i, x]) => Math.abs(window.__roadster.cityView.fallers.prop.list[i].x - x) < 1e-6, [out.hydrant.i, hyd.x])
  await g.ev(() => { window.__links = 0 })
  // drive at it at 40 km/h, coasting; once it is down, stopped a few metres on
  const ram = async (r, sec, stopAt) => {
    await g.ev(r => {
      const R = window.__roadster
      R.resetTo('city', { x: r.x, z: r.z, yaw: r.yaw })
      R.traffic.reset(r.x, r.z)
      R.peds.reset(r.x, r.z)
      R.sim.vel.set(11.1 * r.dx, 0, 11.1 * r.dz)
      R.sim.speed = 11.1
      R.sim.syncPose()
      R.rig.cut()
    }, r)
    const knocks = []
    for (let t = 0; t < sec; t += 0.05) {
      const k = await g.ev(() => {
        const R = window.__roadster
        R.advance(0.05)
        return { active: R.cityView.fallers.prop.active, spraying: R.cityView.fallers.prop.spraying, v: Math.hypot(R.sim.vel.x, R.sim.vel.z) }
      })
      knocks.push(k)
      if (stopAt && t > stopAt) await g.ev(() => { const R = window.__roadster; R.sim.vel.multiplyScalar(0.8) })
    }
    return knocks
  }
  const h = await ram(hRun, 1.2, 0)
  out.hydrant.spraying = Math.max(...h.map(k => k.spraying))
  out.hydrant.minV = Math.min(...h.map(k => k.v))
  // (then back where the run started, stopped, looking at it: the geyser past the bonnet)
  await g.ev(([r, x, z]) => {
    const R = window.__roadster
    R.resetTo('city', { x: x - r.dx * 12, z: z - r.dz * 12, yaw: r.yaw })
    R.rig.cut()
  }, [hRun, hyd.x, hyd.z])
  await g.run(0.6)
  await g.shot('hydrant-spray.png')
  await g.run(1.5)
  await g.shot('hydrant-spray-2.png')
  if (best) {
    const r = await ram(best.r, 1.6, 0)
    out.row.moving = Math.max(...r.map(k => k.active))
    out.row.endV = r[r.length - 1].v
    await g.shot('props-flying.png')
    await g.ev(() => { const R = window.__roadster; R.sim.vel.set(0, 0, 0) })
    await g.run(3)
    await g.shot('props-knocked.png')
    out.row.down = await g.ev(() => window.__roadster.cityView.fallers.prop.list.filter(k => k.c.down).length)
  }
  out.links = await g.ev(() => window.__links)
} finally {
  out.console = g.console
  await g.close()
}
fs.writeFileSync(path.join(SHOTS, 'props.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, console: out.console.length }, null, 1))
