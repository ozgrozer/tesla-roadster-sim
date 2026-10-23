// The carjacking watched closely: out of the Roadster, by the driver's door of a car in traffic, E,
// and the driver pulled out traced every 50 ms of game time (where they are, which way they face,
// their state) with a few screenshots on the way. A jump of more than JUMP m in a 50 ms step, or
// the driver moving more than BACK m against the way they face, is an issue.
//   node --import ./tools/node-loader/register.mjs tools/playtest/jack.mjs [--shots]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { findCar, toDoor } from './helpers.mjs'

const JUMP = 0.45 // m in 50 ms (9 m/s: the throw out of the seat starts at 6.4)
const BACK = 0.15 // m in 50 ms against the facing
const shots = process.argv.includes('--shots')

export async function jackTrace (g) {
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  await g.run(1)
  await g.press('KeyF', 0)
  await g.until(() => window.__roadster.player.mode === 'foot', 6)
  await g.run(0.5)
  let i = -1
  for (let k = 0; k < 20 && i < 0; k++) {
    i = await g.ev(findCar, { kind: 'driven', r: 600 })
    if (i < 0) await g.run(1)
  }
  if (!g.expect(i >= 0, 'no driven car to carjack')) return null
  await g.ev(i => { const c = window.__roadster.traffic.cars[i]; c.v = 0 }, i)
  await g.ev(toDoor, i)
  await g.run(0.1, 0.1, 0)
  const before = await g.ev(() => new Set(window.__roadster.peds.list.map(p => p.id ?? p)).size)
  await g.ev(() => { window.__jk = new Set(window.__roadster.peds.list) })
  await g.press('KeyF', 0)
  // (the whole trace in one call in the page: the frame loop runs in real time between calls, and
  // would put its own steps in between the samples)
  const trace = await g.ev(() => {
    const R = window.__roadster,
      out = []
    let p = null
    for (let k = 0; k < 120; k++) {
      R.advance(0.05)
      if (!p) p = R.peds.list.find(q => !window.__jk.has(q)) || null
      const P = R.player
      out.push({
        t: +((k + 1) * 0.05).toFixed(2),
        mode: P.mode,
        phase: R.foot.action?.phase || null,
        player: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)],
        ped: p ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), state: p.state, fall: +(p.fall || 0).toFixed(2), gait: +(p.gait || 0).toFixed(2), dp: +Math.hypot(p.x - P.pos.x, p.z - P.pos.z).toFixed(2) } : null
      })
    }
    return out
  })
  // the driver's moves: jumps, and going backwards
  const bad = []
  for (let k = 1; k < trace.length; k++) {
    const a = trace[k - 1].ped, b = trace[k].ped
    if (!a || !b) continue
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
    const fwd = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw) // (along the facing: yaw atan2(-dz, dx))
    if (d > JUMP) bad.push({ t: trace[k].t, what: 'jump', d: +d.toFixed(2) })
    else if (fwd < -BACK && b.fall < 0.5) bad.push({ t: trace[k].t, what: 'backwards', d: +fwd.toFixed(2), state: b.state })
  }
  return { trace, bad, before }
}

// Another carjacking, drawn as it goes: pictures at the given times (s of game clock after E)
export async function jackShots (g, at = [1.0, 1.15, 1.35, 1.7, 2.1, 3.0], tag = 'jack') {
  await g.ev(() => { const R = window.__roadster; if (R.player.mode === 'car') R.foot.alt.body && Object.assign(R.foot.alt.body, { u: 0, vx: 0, vz: 0 }) })
  if (await g.ev(() => window.__roadster.player.mode === 'car')) {
    await g.press('KeyF', 0)
    await g.until(() => window.__roadster.player.mode === 'foot', 6)
  }
  const i = await g.ev(findCar, { kind: 'driven', r: 600 })
  if (i < 0) return []
  await g.ev(i => { const c = window.__roadster.traffic.cars[i]; c.v = 0 }, i)
  await g.ev(toDoor, i)
  await g.run(0.1, 0.1, 0)
  // (the camera turned to look at the door from behind the player's shoulder, side on)
  await g.press('KeyF', 0)
  const out = []
  let t = 0
  for (const [k, s] of at.entries()) {
    await g.ev(d => window.__roadster.advance(d), s - t)
    t = s
    out.push(await g.shot(`${tag}-${String(k).padStart(2, '0')}.png`))
  }
  return out
}

if (process.argv[1] && process.argv[1].endsWith('jack.mjs')) {
  const g = await Game.open()
  g.step = 'jack'
  const r = await jackTrace(g)
  if (shots) r.shots = await jackShots(g)
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(path.join(SHOTS, 'jack-trace.json'), JSON.stringify(r, null, 1))
  for (const s of r?.trace || []) if (s.ped) console.log(s.t, s.mode, s.phase, JSON.stringify(s.player), JSON.stringify(s.ped))
  console.log('bad', JSON.stringify(r?.bad), 'issues', JSON.stringify(g.issues), 'console', JSON.stringify(g.console.slice(0, 5)))
  await g.close()
  process.exit(r && !r.bad.length && !g.issues.length ? 0 : 1)
}
