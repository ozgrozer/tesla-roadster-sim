// The v3 drive stream's headless look at the driving (not part of npm test): the real build in
// headless Chrome on port 8094, a handbrake drift with its skid marks, a braking nose dive seen from
// the side, cornering body roll from ahead, and the Roadster's handbrake turn. Screenshots and the
// body's state to /workspace/shots/v3/drive/.
//   node --import ./tools/node-loader/register.mjs tools/drive/shots.mjs [only,steps]
import fs from 'node:fs'
import path from 'node:path'
const OUT = (process.env.SHOTS = process.env.SHOTS || '/workspace/shots/v3/drive')
process.env.PORT = process.env.PORT || '8094'
const { Game } = await import('../playtest/lib.mjs')

const only = (process.argv[2] || '').split(',').filter(Boolean)
const want = s => !only.length || only.includes(s)
fs.mkdirSync(OUT, { recursive: true })
const g = await Game.open({ query: '?spawn=96,-60,0', width: 960, height: 540 })
g.page.setDefaultTimeout(240000)
const log = {}
const state = () => g.ev(() => {
  const R = window.__roadster, b = R.foot.alt.body, s = R.sim
  const r = n => Math.round(n * 1000) / 1000
  const D = 180 / Math.PI
  return b
    ? { kind: b.kind, kmh: r(b.u * 3.6), pitchDeg: r(b.pitch * D), rollDeg: r(b.roll * D), slipDeg: r(b.slip * D), skid: r(b.skid), brakeLight: b.lights.brake, fov: r(R.rig.camera?.fov ?? 0) }
    : { kind: 'roadster', kmh: r(s.speed * 3.6), slipDeg: r(s.slipR * D), skid: r(s.skid), latAcc: r(s.latAcc), accLong: r(s.accLong) }
})
const shot = async name => {
  log[name] = await state()
  await g.shot(name)
  console.log(name, JSON.stringify(log[name]))
}
// the game's clock on in small steps, so the frame loop (skid marks, smoke) keeps up
const drive = (keys, sec) => g.hold(keys, () => g.run(sec, 0.05, 0))
// the follow camera turned round the car (rad: 0 behind, pi/2 its left side, pi ahead), held there
const look = (yaw, pitch = 0) => g.ev(([y, p]) => {
  const rig = window.__roadster.rig
  rig.f.yawOff = y
  rig.f.pitchOff = p
  rig.f.idle = -1e9 // (not drifting back behind the car)
}, [yaw, pitch])
const clear = () => g.ev(() => {
  const R = window.__roadster, b = R.foot.alt.body
  const p = b || R.sim.pos
  R.traffic.clearAround(p.x, p.z, 120)
  R.game.wanted.clear()
})
try {
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  await g.run(1)
  if (want('drift')) {
    await g.ev(() => window.__roadster.seatIn('sports'))
    await g.run(1)
    await clear()
    await drive('KeyW', 1.7)
    await drive(['Space', 'KeyA'], 0.35)
    await drive(['KeyW', 'KeyA'], 0.12)
    await shot('d1-sports-handbrake-drift.png')
    await drive(['KeyW'], 0.3)
    await look(0.9, 0.25)
    await shot('d1-sports-skid-marks.png')
    await look(0, 0)
    await drive('KeyS', 3)
  }
  if (want('brake')) {
    await g.ev(() => window.__roadster.seatIn('sedan'))
    await g.run(1)
    await clear()
    await drive('KeyW', 4)
    await look(Math.PI / 2, 0.05)
    await drive('KeyW', 0.6)
    await shot('d2-sedan-cruise-side.png')
    await drive('KeyS', 0.35)
    await shot('d2-sedan-braking-nose-dive.png')
    await drive('KeyS', 3)
    await look(0, 0)
  }
  if (want('roll')) {
    await g.ev(() => window.__roadster.seatIn('suv'))
    await g.run(1)
    await clear()
    await drive('KeyW', 3.2)
    await drive(['KeyW', 'KeyD'], 0.5)
    await look(2.5, 0.05)
    await drive(['KeyW', 'KeyD'], 0.5)
    await shot('d3-suv-cornering-roll.png')
    await look(0, 0)
    await drive('KeyS', 3)
  }
  if (want('roadster')) {
    await g.ev(() => { const R = window.__roadster; if (R.foot.alt.active) R.resetTo?.('city') })
    await g.run(1)
    await clear()
    await drive('KeyW', 2)
    await drive(['Space', 'KeyD'], 0.6)
    await shot('d4-roadster-handbrake-turn.png')
    await drive([], 1)
  }
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ log, console: g.console }, null, 1))
  await g.close()
}
