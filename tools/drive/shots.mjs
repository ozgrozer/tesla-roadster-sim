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
// the open road by the stadium, heading east (nothing to hit for 220 m)
const START = { x: -128, z: 389.3, yaw: 0 }
const g = await Game.open({ query: `?spawn=${START.x - 12},${START.z},0`, width: 960, height: 540 })
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
// driven in real time, as a player would (drawing off, the frame loop runs at its own pace: the skid
// marks and the smoke laid as they are in play); the game's clock is read back to say how long
const clock = () => g.ev(() => { const R = window.__roadster; return (R.foot.driven() || R.sim).time })
const drive = async (keys, sec) => {
  const t0 = await clock()
  await g.hold(keys, async () => {
    for (let i = 0; i < 400; i++) {
      await g.wait(15)
      if ((await clock()) - t0 >= sec) break
    }
  })
}
// the follow camera turned round the car (rad: 0 behind, pi/2 its left side, pi ahead), held there
const look = (yaw, pitch = 0) => g.ev(([y, p]) => {
  const rig = window.__roadster.rig
  rig.f.yawOff = y
  rig.f.pitchOff = p
  rig.f.idle = -1e9 // (not drifting back behind the car)
}, [yaw, pitch])
// the car the player is in put back at START, standing, and the traffic and the police cleared
const clear = () => g.ev(S => {
  const R = window.__roadster, b = R.foot.alt.body
  if (b) Object.assign(b, { x: S.x, z: S.z, yaw: S.yaw, hx: Math.cos(S.yaw), hz: -Math.sin(S.yaw), vx: 0, vz: 0, u: 0, w: 0, lat: 0 })
  else R.resetTo('city', S)
  R.traffic.clearAround(S.x, S.z, 400)
  // (and any car left standing on the road ahead: the last scene's)
  const T = R.traffic, mine = R.foot.alt.car
  for (let i = T.cars.length - 1; i >= 0; i--) {
    const c = T.cars[i]
    if (c !== mine && Math.abs(c.z - S.z) < 14 && c.x > S.x - 10 && c.x < S.x + 260) T.remove(i)
  }
  R.game.wanted.clear()
  R.rig.cut?.()
}, START)
const seat = async k => {
  await g.ev(k => window.__roadster.seatIn(k), k)
  await g.run(0.5)
  await clear()
  await g.run(0.5)
}
try {
  await g.ev(() => { window.__fps = 0; const f = () => { window.__fps++; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await g.wait(2000)
  console.log('frames a second (drawing off):', (await g.ev(() => window.__fps)) / 2)
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  await g.run(1)
  if (want('drift')) {
    await seat('sports')
    await drive('KeyW', 1.7)
    await drive(['Space', 'KeyA'], 0.35)
    await drive(['KeyW', 'KeyA'], 0.12)
    await shot('d1-sports-handbrake-drift.png')
    // stopped, the smoke let clear, and looked back over the marks from up ahead
    await drive(['KeyW', 'KeyA'], 0.4)
    await drive('KeyS', 1.2)
    await drive([], 2.5)
    await look(Math.PI * 0.8, 0.75)
    await shot('d1-sports-skid-marks.png')
    await look(0, 0)
  }
  if (want('brake')) {
    await seat('sedan')
    await drive('KeyW', 4)
    await look(Math.PI / 2, 0.02)
    await drive('KeyW', 0.6)
    await shot('d2-sedan-cruise-side.png')
    await drive('KeyS', 0.4)
    await shot('d2-sedan-braking-nose-dive.png')
    await drive('KeyS', 3)
    await look(0, 0)
  }
  if (want('roll')) {
    await seat('suv')
    await drive('KeyW', 3.2)
    await look(0.3, 0.02)
    await drive(['KeyW', 'KeyA'], 0.4)
    await shot('d3-suv-cornering-roll.png')
    await look(0, 0)
    await drive('KeyS', 3)
  }
  if (want('roadster')) {
    await g.ev(S => window.__roadster.resetTo('city', S), START)
    await g.run(1)
    await clear()
    await drive('KeyW', 1.6)
    await drive(['Space', 'KeyA'], 0.5)
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
