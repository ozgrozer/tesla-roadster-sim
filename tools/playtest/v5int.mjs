// Round 5's integration check and shots, on GTA V's keys: F in and out of every kind of car,
// steering through real key presses (the Roadster and a city car), the punch on R and the left
// button, the pause menu (Settings with the quality, Controls, Debug: what the old top bar did),
// and the shots: driving downtown, the menu, getting in with F (the door open), the people on the
// pavement, a night drive on Medium. Writes $SHOTS/v5int.json.
//   PORT=8094 SHOTS=/workspace/shots/v5/int node tools/playtest/v5int.mjs
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { toDoor, stopCar } from './helpers.mjs'

const g = await Game.open({ query: '?debug=1' })
await g.untilReal(() => !window.__roadster.intro.active, 30000).catch(() => {})
await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
const k = g.page.keyboard
const out = { steer: {}, doors: {}, punch: {}, menu: {}, shots: [] }
const mode = () => g.ev(() => window.__roadster.player.mode)
const shot = async name => { try { out.shots.push(await g.shot(name)) } catch (e) { g.issue('shot', name + ' ' + e.message) } }
// where the driven thing is (the Roadster's sim, or the city car's body)
const where = () => g.ev(() => {
  const R = window.__roadster, f = R.foot
  if (f.alt?.active) return { x: f.alt.body.x, z: f.alt.body.z, v: f.alt.body.u }
  const s = R.sim, p = s.pos || s
  return { x: p.x, z: p.z, v: s.speed }
})
const dir = (a, b) => Math.atan2(b.x - a.x, b.z - a.z)
const turn = (a, b) => (((b - a) * 180) / Math.PI + 540) % 360 - 180
// W to get going, then W+A (and W+D), each turn's heading change in degrees, through key events
async function steer (label) {
  const res = {}
  for (const side of ['KeyA', 'KeyD']) {
    await g.hold('KeyW', 2)
    const a = await where(); await g.hold('KeyW', 0.15); const b = await where()
    await g.hold(['KeyW', side], 1)
    const c = await where(); await g.hold('KeyW', 0.15); const d = await where()
    res[side] = { kmh: +(Math.abs(b.v) * 3.6).toFixed(0), deg: +turn(dir(a, b), dir(c, d)).toFixed(0) }
    await g.hold('KeyS', 2)
  }
  out.steer[label] = res
  g.expect(Math.abs(res.KeyA.deg) > 15 && Math.abs(res.KeyD.deg) > 15 && Math.sign(res.KeyA.deg) !== Math.sign(res.KeyD.deg), 'steering weak or one-sided', { label, res })
}

g.step = 'steer'
await steer('roadster')
// a shot downtown in a city car, HUD as it is
await g.ev(t => window.__roadster.seatIn(t), 'sedan'); await g.run(1.5)
await steer('sedan')
await g.hold('KeyW', 2.5)
await k.down('KeyW'); await shot('01-drive-downtown-hud.png'); await k.up('KeyW')
await g.ev(stopCar).catch(() => {})

// F out of and back into every kind of car
g.step = 'doors'
for (const kind of ['sedan', 'hatch', 'suv', 'taxi', 'pickup', 'van', 'bus', 'police', 'sports', 'ambulance', 'fire', 'truck', 'lowrider', 'limo']) {
  const id = await g.ev(t => window.__roadster.seatIn(t), kind)
  if (!id) { out.doors[kind] = 'no seatIn'; continue }
  await g.run(1)
  await g.ev(stopCar).catch(() => {})
  await k.press('KeyF')
  const outOk = await g.untilReal(() => window.__roadster.player.mode === 'foot', 6000)
  await g.wait(400)
  await k.press('KeyF')
  const inOk = await g.untilReal(() => window.__roadster.player.mode === 'car', 8000)
  out.doors[kind] = (outOk ? 'out' : 'OUT-FAIL') + '/' + (inOk ? 'in' : 'IN-FAIL')
  g.expect(outOk && inOk, 'F in/out failed', kind)
}

// on foot: the punch (R, and the left button), the people on the pavement, getting in with F
g.step = 'foot'
await k.press('KeyF'); await g.untilReal(() => window.__roadster.player.mode === 'foot', 6000); await g.wait(500)
const busy = () => g.ev(() => !!window.__roadster.foot.fight.melee.busy)
await k.press('KeyR'); await g.wait(60); out.punch.R = await busy()
await g.wait(1200)
await g.page.mouse.click(480, 270); await g.wait(150); await g.page.mouse.click(480, 270); await g.wait(60)
out.punch.LMB = await busy()
out.punch.lock = await g.ev(() => !!document.pointerLockElement)
g.expect(out.punch.R, 'R threw no punch')
await g.wait(1200)
await shot('05-peds-sidewalk.png')
const i = await g.ev(() => { const R = window.__roadster, P = R.player.pos; let best = -1, bd = 1e9
  R.traffic.cars.forEach((c, j) => { if (!c.parked || c.ctl || c.jam || c.player) return; const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > 3 && d < bd) { bd = d; best = j } }); return best })
await g.ev(toDoor, i); await g.wait(300)
await k.press('KeyF')
const opened = await g.untilReal(() => ['open', 'in', 'pull'].includes(window.__roadster.foot.action?.phase), 6000)
// (held there for the shot: a frame takes seconds here)
await g.ev(() => { const f = window.__roadster.foot; f.__board = f.board; f.board = () => {}; f.__events = f.events; f.events = () => {} })
await shot('04-enter-car-F-door-open.png')
await g.ev(() => { const f = window.__roadster.foot; f.board = f.__board; f.events = f.__events })
out.enterF = { opened, mode: await g.untilReal(() => window.__roadster.player.mode === 'car', 6000) }

// the pause menu: each tab's text, Settings (with the quality) and Controls shot
g.step = 'menu'
await k.press('Escape'); await g.wait(600)
out.menu.open = await g.ev(() => window.__roadster.menu.open)
for (const tab of ['Settings', 'Controls', 'Debug', 'Stats', 'Map']) {
  const has = await g.ev(t => { const b = document.getElementById('mnTab' + t); if (!b) return false; b.click(); return true }, tab)
  if (!has) { out.menu[tab] = 'missing'; continue }
  await g.wait(400)
  out.menu[tab] = await g.ev(t => (document.getElementById('mn' + t)?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500), tab)
  if (tab === 'Settings') {
    await g.ev(() => { const r = [...document.querySelectorAll('#mnSettings *')].find(e => /^Quality/.test(e.textContent || '') && e.children.length < 6); r?.scrollIntoView({ block: 'center' }) })
    await shot('02-pause-settings-quality.png')
  }
  if (tab === 'Controls') await shot('03-pause-controls.png')
}
const all = Object.values(out.menu).join(' ')
out.menu.oldTopBar = Object.fromEntries(['Quality', 'Auto', 'Camera', 'Sound', 'Autopilot', 'Slow', 'Test site', 'Resume'].map(w => [w, all.includes(w) || w === 'Resume']))
await k.press('Escape'); await g.wait(400)
out.menu.closed = !(await g.ev(() => window.__roadster.menu.open))

// a night drive on Medium
g.step = 'night'
await g.ev(() => { const R = window.__roadster; R.climate.quality('medium'); R.climate.setHour(22.5) })
await g.run(1)
await g.hold('KeyW', 3)
out.night = await g.ev(() => window.__roadster.climate.qualityState())
await k.down('KeyW'); await shot('06-night-drive-medium.png'); await k.up('KeyW')
out.issues = g.issues
out.console = g.console.filter(c => c.type !== 'warning')
fs.writeFileSync(path.join(SHOTS, 'v5int.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, menu: { open: out.menu.open, closed: out.menu.closed, oldTopBar: out.menu.oldTopBar } }, null, 1))
await g.close()
