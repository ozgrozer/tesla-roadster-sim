// The phys workstream's headless look at the driving and the walking (not part of npm test): the
// real build in headless Chrome on port 8094, a sports car pulling away, cornering (body roll), a
// handbrake drift, an SUV's braking dive, a sedan crashed into a building (dents, lamps, smoke),
// getting out beside the wall, and the foot camera along it. Screenshots and a JSON of the body's
// state to /workspace/shots/v2/phys/.
//   node --import ./tools/node-loader/register.mjs tools/phys/shots.mjs [only,steps]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
process.env.SHOTS = process.env.SHOTS || '/workspace/shots/v2/phys'
const { serve, Game } = await import('../playtest/lib.mjs')

const OUT = '/workspace/shots/v2/phys'
const only = (process.argv[2] || '').split(',').filter(Boolean)
const want = s => !only.length || only.includes(s)
const req = createRequire('/tmp/polish-smoke/x.js')
let pw
for (const t of [process.env.PLAYWRIGHT_CORE, '/tmp/polish-smoke', '/tmp/foot-smoke', '/workspace/v2-qa'].filter(Boolean)) {
  try {
    pw = createRequire(path.join(t, 'x.js'))('playwright-core')
    break
  } catch {}
}
if (!pw) pw = req('playwright-core')

const server = await serve(8094)
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.setDefaultTimeout(240000) // (a busy machine: the load can take minutes)
const g = new Game(browser, page, 'http://127.0.0.1:8094/')
g.server = server
const log = {}
const state = () => g.ev(() => {
  const R = window.__roadster, b = R.foot.alt.body, p = R.player
  const r = n => Math.round(n * 1000) / 1000
  return b
    ? { mode: p.mode, kind: b.kind, u: r(b.u), pitch: r(b.pitch), roll: r(b.roll), heave: r(b.heave), slip: r(b.slip), harm: r(b.dmg?.harm || 0), lamps: b.dmg?.lamps || 0, smoke: b.dmg?.smoke || 0, dead: b.dead, limp: r(b.limp) }
    : { mode: p.mode, x: r(p.pos.x), y: r(p.pos.y), z: r(p.pos.z) }
})
const shot = async name => {
  log[name] = await state()
  await g.shot(name) // (SHOTS: the directory)
  console.log(name, JSON.stringify(log[name]))
}
const lane = () => g.ev(() => {
  const R = window.__roadster, b = R.foot.alt.body
  return { x: b.x, z: b.z, yaw: b.yaw }
})
try {
  await g.goto('')
  await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
  await g.run(1)
  if (want('sports')) {
    await g.ev(() => window.__roadster.seatIn('sports'))
    await g.run(1)
    await g.hold('KeyW', 1.2)
    await shot('p1-sports-squat.png')
    await g.hold('KeyW', 1.5)
    await g.hold(['KeyW', 'KeyA'], 1.1)
    await shot('p1-sports-corner-roll.png')
    await g.hold('KeyW', 1.5)
    await g.hold(['Space', 'KeyD'], 0.45)
    await g.hold(['KeyW', 'KeyD'], 0.4)
    await shot('p1-sports-drift.png')
    await g.hold('KeyW', 2)
  }
  if (want('brake')) {
    await g.ev(() => window.__roadster.seatIn('suv'))
    await g.run(1)
    await g.hold('KeyW', 4)
    await g.hold('KeyS', 0.35)
    await shot('p1-suv-brake-dive.png')
    await g.hold('KeyS', 3)
  }
  if (want('crash')) {
    await g.ev(() => window.__roadster.seatIn('sedan'))
    await g.run(1)
    // across the lane at the buildings: three hits, each harder
    const at = await lane()
    for (const [u, k] of [[12, 1], [16, 2], [19, 3]]) {
      await g.ev(({ x, z, yaw, u }) => {
        const b = window.__roadster.foot.alt.body
        const y = yaw + Math.PI / 2
        Object.assign(b, { x, z, yaw: y, hx: Math.cos(y), hz: -Math.sin(y), w: 0, lat: 0, u, vx: Math.cos(y) * u, vz: -Math.sin(y) * u })
      }, { ...at, u })
      await g.hold('KeyW', 2.5)
      log['crash' + k] = await state()
      console.log('crash', k, JSON.stringify(log['crash' + k]))
    }
    await g.hold('KeyS', 1.2)
    await g.run(1.5)
    await shot('p1-sedan-crashed.png')
    // and out, hard by the wall
    await g.press('KeyE', 0)
    await g.run(2.5)
    await shot('p2-out-by-the-wall.png')
    // the foot camera swung round along the wall
    await g.ev(() => { const c = window.__roadster.foot.cam; c.yaw += 1.4; c.pitch = 0.1; c.dist = 6.6 })
    await g.run(1)
    await shot('p2-footcam-along-wall.png')
    await g.hold(['KeyW', 'ShiftLeft'], 1.5)
    await shot('p2-run-along-wall.png')
  }
  if (want('tight')) {
    // a sedan nosed slowly up to a building, then turned so its driver's side is hard against it:
    // out by the other side
    await g.ev(() => window.__roadster.seatIn('sedan'))
    await g.run(1)
    const at = await lane()
    await g.ev(({ x, z, yaw }) => {
      const b = window.__roadster.foot.alt.body
      const y = yaw + Math.PI / 2
      Object.assign(b, { x, z, yaw: y, hx: Math.cos(y), hz: -Math.sin(y), w: 0, lat: 0, u: 3, vx: Math.cos(y) * 3, vz: -Math.sin(y) * 3 })
    }, at)
    await g.hold('KeyW', 4)
    await g.ev(() => {
      const b = window.__roadster.foot.alt.body
      const dx = b.hx, dz = b.hz
      const wx = b.x + dx * b.len / 2, wz = b.z + dz * b.len / 2
      const hx = -dz, hz = dx
      Object.assign(b, { hx, hz, yaw: Math.atan2(-hz, hx), x: wx - dx * (b.wid / 2 + 0.06), z: wz - dz * (b.wid / 2 + 0.06), vx: 0, vz: 0, u: 0, w: 0 })
    })
    await g.run(0.5)
    log.tightBefore = await state()
    await g.press('KeyE', 0)
    await g.run(2.5)
    log.tightExit = await g.ev(() => {
      const R = window.__roadster, p = R.player.pos
      return { mode: R.player.mode, x: p.x, z: p.z }
    })
    console.log('tight', JSON.stringify(log.tightBefore), JSON.stringify(log.tightExit))
    await g.ev(() => { const c = window.__roadster.foot.cam; c.pitch = 0.5; c.dist = 6.6 })
    await g.run(0.8)
    await shot('p2-tight-exit-far-side.png')
  }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ log, console: g.console }, null, 1))
  console.log('console issues:', g.console.length, JSON.stringify(g.console.slice(0, 5)))
} finally {
  await browser.close()
  server.close()
}
