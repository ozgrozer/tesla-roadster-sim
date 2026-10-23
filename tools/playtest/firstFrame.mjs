// The game's opening frames: where the camera is against the car (and the player's spawn) on each of
// the first frames drawn, after a load, a respawn and a ?spawn= teleport. The first frame must already
// be the follow camera behind the car: a few metres from it, never off somewhere else.
//   node tools/playtest/firstFrame.mjs [query]   (PORT=, SHOTS=, PLAYWRIGHT_CORE=)
import path from 'node:path'
import fs from 'node:fs'
import { Game, SHOTS } from './lib.mjs'

const query = process.argv[2] ?? ''
const out = { query, frames: [] }
// record each frame right after the game's own (the wrapper goes in before the page's scripts)
const RECORD = () => {
  window.__frames = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb => raf(t => {
    cb(t)
    const R = window.__roadster
    if (!R || window.__frames.length >= 40) return
    const c = R.rig.camera.position, p = R.RS.car.position, s = R.sim.pos
    window.__frames.push({
      cam: [c.x, c.y, c.z].map(v => +v.toFixed(2)),
      car: [p.x, p.y, p.z].map(v => +v.toFixed(2)),
      sim: [s.x, s.y, s.z].map(v => +v.toFixed(2)),
      d: +Math.hypot(c.x - s.x, c.z - s.z).toFixed(2),
      shot: R.rig.shot,
      intro: R.intro.active
    })
  })
}
const g = await Game.open({ query, init: RECORD })
try {
  const f = await g.ev(() => window.__frames)
  out.frames = f
  out.load = summary(f)
  await g.shot(`first-frame${query ? '-spawn' : ''}.png`)
  // a respawn (a crash: R / the respawn hook) and a teleport (resetTo to another spot)
  for (const [name, fn] of [
    ['respawn', () => { const R = window.__roadster; R.game.respawn({ x: R.sim.pos.x + 40, z: R.sim.pos.z, yaw: 1 }) }],
    ['teleport', () => { const R = window.__roadster; R.resetTo('city', { x: 300, z: -200, yaw: 0 }) }]
  ]) {
    await g.ev(`window.__draw = true; window.__frames.length = 0; (${fn})()`)
    await g.wait(1500)
    const fr = await g.ev(() => window.__frames.slice(0, 6))
    out[name] = summary(fr)
  }
  await g.ev(() => { window.__draw = false })
} finally {
  out.console = g.console
  await g.close()
}
function summary (f) {
  return { first: f[0], maxD: Math.max(...f.map(x => x.d)), n: f.length, far: f.filter(x => x.d > 12).length }
}
const file = path.join(SHOTS, `first-frame${query ? '-spawn' : ''}.json`)
fs.writeFileSync(file, JSON.stringify(out, null, 1))
console.log(JSON.stringify({ load: out.load, respawn: out.respawn, teleport: out.teleport, errors: out.console.length }, null, 1))
