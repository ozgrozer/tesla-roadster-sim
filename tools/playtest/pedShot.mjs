// Someone on the pavement run over, in the browser: in a downtown street the Roadster is put 24 m
// back along the pavement from a person a little way off and driven at them at 40 km/h, its aim kept
// on them (as tools/sim/pedHits.mjs does in Node); shots as they go over the bonnet and once they
// have landed, with what they did (their states), the speed and whether they were killed.
//   node --import ./tools/node-loader/register.mjs tools/playtest/pedShot.mjs   (PORT=, SHOTS=, KMH=)
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { ROADS, LANE_OFF } from '../../js/sim/city.js'
import { kerbDist } from '../../js/sim/street.js'

const KMH = Number(process.env.KMH) || 40
const AT = { x: ROADS[6] + 70, z: ROADS[5] + LANE_OFF[1], yaw: 0 }
const g = await Game.open({})
const out = { kmh: KMH, tries: [] }
try {
  await g.draw(2)
  await g.untilReal(() => window.__roadster.post.warmed && (window.__roadster.post.warmed.then(() => { window.__warm = true }), window.__warm), 90000)
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  for (let attempt = 0; attempt < 4 && !out.hit; attempt++) {
    await g.ev(at => {
      const R = window.__roadster
      R.resetTo('city', at)
      R.traffic.clearAround(at.x, at.z, 80)
    }, AT)
    await g.run(2.5)
    // (the people on the pavement 15-60 m off, nearest first; the attempt-th of them)
    const L = await g.ev(() => {
      const R = window.__roadster,
        P = R.sim.pos,
        H = {}
      return R.peds.list
        .filter(q => !q.dog && q.state !== 'down' && ['walk', 'idle', 'linger'].includes(q.state))
        .map(q => (R.peds.at(q, H), { i: q.i, x: q.x, z: q.z, hx: H.hx, hz: H.hz, d: Math.hypot(q.x - P.x, q.z - P.z) }))
        .filter(q => q.d > 15 && q.d < 60)
        .sort((a, b) => a.d - b.d)
    })
    const p = L.filter(q => kerbDist(q.x, q.z) < -0.9 && kerbDist(q.x - q.hx * 24, q.z - q.hz * 24) < -0.9)[attempt]
    if (!p) continue
    const v = KMH / 3.6
    await g.ev(([p, v]) => {
      const R = window.__roadster,
        x = p.x - p.hx * 24,
        z = p.z - p.hz * 24
      R.resetTo('city', { x, z, yaw: Math.atan2(-p.hz, p.hx) })
      R.sim.vel.set(p.hx * v, 0, p.hz * v)
      R.sim.speed = v
      R.sim.syncPose()
      R.rig.cut()
      window.__victim = R.peds.list.find(q => q.i === p.i)
    }, [p, v])
    const states = new Set()
    let hit = null
    for (let t = 0; t < 4 && !hit; t += 0.05) {
      const k = await g.ev(v => {
        const R = window.__roadster,
          s = R.sim,
          q = window.__victim,
          dx = q.x - s.pos.x,
          dz = q.z - s.pos.z
        // (aim kept on them until they are alongside)
        if (dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw) > 2.5 && q.state !== 'down') {
          s.yaw = Math.atan2(-dz, dx)
          s.vel.set(Math.cos(s.yaw) * v, s.vel.y, -Math.sin(s.yaw) * v)
          s.syncPose()
        }
        R.advance(0.05)
        return { state: q.state, dead: q.dead, v: Math.hypot(s.vel.x, s.vel.z) }
      }, v)
      states.add(k.state)
      if (k.state === 'down') hit = k
    }
    out.tries.push({ ped: p.i, states: [...states], hit: !!hit })
    if (!hit) continue
    out.hit = { ...hit, states: [...states] }
    await g.ev(() => window.__roadster.advance(0.12))
    await g.shot('ped-hit.png')
    await g.ev(() => { const R = window.__roadster; R.sim.vel.multiplyScalar(0.3); R.advance(0.9) })
    await g.shot('ped-hit-2.png')
  }
} finally {
  out.console = g.console
  await g.close()
}
fs.writeFileSync(path.join(SHOTS, 'ped-hit.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, console: out.console.length }, null, 1))
