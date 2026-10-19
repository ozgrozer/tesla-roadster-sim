// The career flow, second half: wanted, the police, evading, missions, a carjacking, busted,
// wasted, the Roadster's boost and flight, the test site, the clock and the weather, the menu.
import { events, findCar, toDoor, placeCar, toRoadster, stopCar, inCityCar } from './helpers.mjs'

import { nearestLane } from '../../js/sim/city.js'
import { spot, STATIONS, HOSPITALS } from '../../js/sim/missions/spots.js'

const has = (list, type, f = () => true) => list.some(e => e.type === type && f(e))
const st = () => {
  const R = window.__roadster, g = R.game
  return { mode: R.player.mode, kind: R.player.vehicle?.kind, wanted: g.wanted.stars, pursuing: g.police.pursuing, near: g.police.nearest, down: g.down?.kind || null, mission: g.missions.state, id: g.missions.active?.id, cash: g.missions.cash, pos: { x: R.player.pos.x, z: R.player.pos.z }, world: R.app.world }
}
// a lane spot for the driven car (Node: city.js)
const lane = (x, z) => {
  const l = nearestLane(x, z)
  return { x: l.x, z: l.z, yaw: l.yaw }
}
// a city car to go on with, if the last was lost (wrecked: wasted, back in the Roadster) or is
// nearly done for: noted, not an issue (the harness's own way on: polish.js seatIn)
async function ensureCar (g, maxHarm = 0.6) {
  const h = await g.ev(inCityCar)
  if (h >= 0 && h < maxHarm) return
  g.notes = (g.notes || []).concat(`${g.step}: a fresh car (harm ${h})`)
  await g.ev(() => window.__roadster.seatIn('sedan'))
  await g.run(1.5)
}
const nearOf = (list, p) => Math.min(...list.map(([fx, fz]) => { const s = spot(fx, fz, { kerb: false }); return Math.hypot(s.x - p.x, s.z - p.z) }))

export const CAREER2 = [
  ['wanted', async g => {
    let s = await g.ev(st)
    // (the crash and the person hit, seen or not: stars if anyone saw)
    if (s.wanted < 2) await g.ev(() => { const R = window.__roadster; R.game.wanted.set(2, R.player.pos) })
    await g.run(1)
    s = await g.ev(st)
    g.expect(s.wanted >= 2, 'no wanted level', s)
  }],
  ['police-pursue', async g => {
    const ok = await g.until(() => { const p = window.__roadster.game.police; return p.pursuing > 0 && p.nearest < 120 }, 45, null, 1)
    g.expect(ok, 'no police pursuing within 45 s', await g.ev(st))
    await g.shot('06-police-pursuit.png')
  }],
  ['evade', async g => {
    // far off across the city, out of their sight, and keep moving (stopped beside a unit with
    // stars is busted)
    await ensureCar(g)
    const s = await g.ev(st)
    let to = lane(s.pos.x > 0 ? -600 : 600, s.pos.z > 0 ? -500 : 500)
    await g.ev(placeCar, { ...to, u: 8 })
    let ok = false
    for (let t = 0; t < 150 && !ok; t += 3) {
      await g.hold('KeyW', 3)
      const now = await g.ev(st)
      g.harm = await g.ev(inCityCar)
      if (now.down) {
        g.issue('busted/wasted while evading', { ...now, harm: g.harm })
        break
      }
      ok = now.wanted === 0
      const v = await g.ev(() => Math.abs(window.__roadster.foot.alt.body?.u || 0))
      if (!ok && v < 2) {
        // (stuck: on to another lane further on)
        to = lane(to.x + (Math.random() - 0.5) * 300, to.z + (Math.random() - 0.5) * 300)
        await g.ev(placeCar, { ...to, u: 8 })
      }
    }
    g.expect(ok, 'stars did not clear in 150 s out of sight', await g.ev(st))
    g.expect((await g.ev(st)).kind !== 'roadster', 'lost the stolen car while evading', await g.ev(st))
  }],
  ['mission-drive', async g => {
    await ensureCar(g, 0.9)
    const c0 = (await g.ev(st)).cash
    const a = spot(0.15, 0.48), b = spot(0.88, 0.22)
    await g.ev(placeCar, { ...lane(a.x, a.z), u: 0 })
    await g.ev(placeCar, { x: a.x, z: a.z, yaw: lane(a.x, a.z).yaw, u: 0 })
    let ok = await g.until(() => window.__roadster.game.missions.state === 'running', 5)
    if (!g.expect(ok, 'Cross Town did not start in its marker', await g.ev(st))) return
    await g.shot('07-mission-start.png')
    await g.ev(placeCar, { x: b.x, z: b.z, yaw: lane(b.x, b.z).yaw, u: 0 })
    ok = await g.until(() => window.__roadster.game.missions.state !== 'running', 6)
    const s = await g.ev(st)
    g.expect(ok && s.cash >= c0 + 600, 'Cross Town not passed', s)
  }],
  ['mission-taxi', async g => {
    await ensureCar(g, 0.9)
    const c0 = (await g.ev(st)).cash
    const a = spot(0.45, 0.85), p = spot(0.4, 0.62), d = spot(0.18, 0.2)
    // (away from the last marker first, then into this one)
    await g.run(0.5)
    await g.ev(placeCar, { x: a.x, z: a.z, yaw: lane(a.x, a.z).yaw, u: 0 })
    let ok = await g.until(() => window.__roadster.game.missions.active?.id === 'taxi', 5)
    if (!g.expect(ok, 'Fare Game did not start in its marker', await g.ev(st))) return
    await g.ev(placeCar, { x: p.x, z: p.z, yaw: lane(p.x, p.z).yaw, u: 0 })
    ok = await g.until(() => window.__roadster.game.missions.i === 1, 5)
    g.expect(ok, 'the fare was not picked up', await g.ev(st))
    await g.ev(placeCar, { x: d.x, z: d.z, yaw: lane(d.x, d.z).yaw, u: 0 })
    ok = await g.until(() => window.__roadster.game.missions.state !== 'running', 5)
    const s = await g.ev(st)
    g.expect(ok && s.cash >= c0 + 400, 'Fare Game not passed', s)
    await g.shot('08-mission-passed.png')
  }],
  ['carjack', async g => {
    await ensureCar(g, 1)
    await g.ev(stopCar)
    await g.run(0.5)
    await g.press('KeyE', 0)
    g.expect(await g.until(() => window.__roadster.player.mode === 'foot', 6), 'could not get out of the stolen car')
    await g.ev(events)
    let ok = false
    for (let k = 0; k < 4 && !ok; k++) {
      const i = await g.ev(findCar, { kind: 'driven', r: 400 })
      if (!g.expect(i >= 0, 'no driven car to carjack')) return
      await g.ev(i => { const c = window.__roadster.traffic.cars[i]; c.v = 0 }, i)
      await g.ev(toDoor, i)
      await g.run(0.1, 0.1, 0)
      await g.press('KeyE', 0)
      ok = await g.until(() => window.__roadster.player.mode === 'car', 8)
    }
    const ev = await g.ev(events)
    g.expect(ok, 'could not carjack a driven car', await g.ev(st))
    g.expect(has(ev, 'car-stolen', e => e.how === 'jack'), 'no carjack event', ev)
    await g.shot('09-carjacked.png')
  }],
  ['busted-on-foot', async g => {
    await g.ev(stopCar)
    await g.run(0.5)
    if ((await g.ev(st)).mode !== 'foot') await g.press('KeyE', 0)
    await g.until(() => window.__roadster.player.mode === 'foot', 6)
    await g.ev(() => { const R = window.__roadster; R.game.wanted.set(2, R.player.pos) })
    const ok = await g.until(() => window.__roadster.game.down?.kind === 'busted', 180, null, 1)
    const units = await g.ev(() => { const R = window.__roadster, P = R.player.pos; return R.game.police.units.map(u => [u.role, u.state, Math.round(Math.hypot(u.body.x - P.x, u.body.z - P.z)), +Math.hypot(u.body.vx, u.body.vz).toFixed(1), u.sees]) })
    if (!g.expect(ok, 'not busted standing still with stars in 180 s', { ...(await g.ev(st)), units })) return
    await g.shot('10-busted.png')
    g.expect(await g.untilReal(() => !window.__roadster.game.down, 12000), 'stuck on BUSTED')
    await g.run(1)
    const s = await g.ev(st)
    // (getUp puts you back in the Roadster: game.js)
    g.expect(s.mode === 'car' && s.kind === 'roadster' && s.wanted === 0, 'not back in the Roadster with no stars after busted', s)
    g.expect(nearOf(STATIONS, s.pos) < 60, 'not put back by a police station', s)
  }],
  ['wasted', async g => {
    // (the knocks on foot run the health out: game.js footHealth)
    if ((await g.ev(st)).mode !== 'foot') await g.press('KeyE', 0)
    await g.until(() => window.__roadster.player.mode === 'foot', 6)
    await g.ev(() => { window.__roadster.game.footHealth = 0 })
    const ok = await g.until(() => window.__roadster.game.down?.kind === 'wasted', 5)
    if (!g.expect(ok, 'not wasted with no health left', await g.ev(st))) return
    await g.shot('11-wasted.png')
    g.expect(await g.untilReal(() => !window.__roadster.game.down, 12000), 'stuck on WASTED')
    await g.run(1)
    const s = await g.ev(st)
    g.expect(s.mode === 'car' && s.kind === 'roadster', 'not back in the Roadster after wasted', s)
    g.expect(nearOf(HOSPITALS, s.pos) < 60, 'not put back by a hospital', s)
    g.expect((await g.ev(() => window.__roadster.game.footHealth)) > 0.9, 'health not back after wasted')
  }],
  ['roadster-boost-fly', async g => {
    if ((await g.ev(st)).kind !== 'roadster') {
      if ((await g.ev(st)).mode !== 'foot') await g.press('KeyE', 1)
      await g.ev(toRoadster)
      await g.run(0.5)
      await g.press('KeyE', 0)
    }
    const ok = await g.until(() => window.__roadster.player.mode === 'car' && window.__roadster.player.vehicle?.kind === 'roadster', 10)
    if (!g.expect(ok, 'could not get back into the Roadster', await g.ev(st))) return
    await g.hold('KeyW', 1.5)
    const v0 = await g.ev(() => window.__roadster.sim.speed)
    let boost = 0
    await g.hold(['KeyW', 'ShiftLeft'], async () => { for (let i = 0; i < 6; i++) { await g.run(0.25); boost = Math.max(boost, await g.ev(() => window.__roadster.sim.thrMain || 0)) } })
    const v1 = await g.ev(() => window.__roadster.sim.speed)
    g.expect(boost > 0 && v1 > v0, 'Shift boost did nothing', { v0, v1, boost })
    let top = 0
    await g.hold('KeyF', async () => { for (let i = 0; i < 8; i++) { await g.run(0.25); top = Math.max(top, await g.ev(() => window.__roadster.sim.pos.y)) } })
    g.expect(top > 2, 'F did not lift the Roadster off', top)
    await g.shot('12-roadster-flight.png')
    await g.until(() => window.__roadster.sim.mode === 'ground' || window.__roadster.sim.mode === 'crash', 30, null, 0.5)
    const s = await g.ev(() => ({ mode: window.__roadster.sim.mode, y: window.__roadster.sim.pos.y }))
    g.expect(s.mode === 'ground' || s.mode === 'crash', 'the Roadster did not come down', s)
    // (the camera eases back in from the flight's wide view over real frames: main.js)
    const near = await g.untilReal(() => { const R = window.__roadster, c = R.rig.camera.position, p = R.sim.pos; return Math.hypot(c.x - p.x, c.z - p.z) < 30 }, 8000)
    g.expect(near, 'the camera stayed out wide after landing')
  }],
  ['test-site-and-back', async g => {
    await g.press('KeyC', 0)
    let ok = await g.untilReal(() => window.__roadster.app.world === 'site', 8000)
    await g.wait(1500)
    g.expect(ok, 'C did not go to the test site')
    await g.run(2)
    await g.shot('13-test-site.png')
    await g.press('KeyC', 0)
    ok = await g.untilReal(() => window.__roadster.app.world === 'city', 8000)
    await g.wait(1500)
    g.expect(ok, 'C did not come back to the city')
    await g.ev(() => window.__roadster.intro.finish(true))
    await g.run(2)
    await g.wait(1000)
    const s = await g.ev(st)
    g.expect(s.mode === 'car' && s.kind === 'roadster', 'not in the Roadster back in the city', s)
  }],
  ['night-rain', async g => {
    for (let i = 0; i < 10 && (await g.ev(() => window.__roadster.env.night)) < 0.6; i++) {
      await g.press('KeyL', 0)
      await g.wait(3500) // (the clock's lapse: climate.js LAPSE_S, real seconds)
    }
    for (let i = 0; i < 8 && !/rain|storm/.test(await g.ev(() => window.__roadster.env.weather)); i++) await g.press('KeyO', 0.5)
    await g.run(8)
    const e = await g.ev(() => ({ night: window.__roadster.env.night, weather: window.__roadster.env.weather, rain: window.__roadster.env.rain }))
    g.expect(e.night > 0.5, 'L never got to night', e)
    g.expect(/rain|storm/.test(e.weather), 'O never got to rain', e)
    await g.hold('KeyW', 3)
    await g.shot('14-night-rain.png')
  }],
  ['pause-map', async g => {
    await g.press('Escape', 0)
    await g.wait(300)
    const a = await g.ev(() => ({ paused: window.__roadster.app.paused, menu: document.body.classList.contains('paused'), t: window.__roadster.sim.time }))
    g.expect(a.paused && a.menu, 'Esc did not pause with the menu', a)
    await g.page.keyboard.down('KeyW')
    await g.wait(800)
    await g.page.keyboard.up('KeyW')
    const map = await g.ev(() => { const m = document.getElementById('mnMap'); return m && getComputedStyle(m).display !== 'none' })
    g.expect(map, 'no map in the pause menu')
    await g.shot('15-pause-map.png')
    const t = await g.ev(() => window.__roadster.sim.time)
    g.expect(Math.abs(t - a.t) < 0.05, 'the game ran on while paused', { t0: a.t, t })
    await g.press('Escape', 0)
    await g.wait(300)
    const b = await g.ev(() => ({ paused: window.__roadster.app.paused, v: window.__roadster.sim.speed }))
    g.expect(!b.paused, 'Esc did not close the menu', b)
    await g.run(1)
    const v = await g.ev(() => window.__roadster.app.lastCtl?.throttle || 0)
    g.expect(v < 0.05, 'input leak: W held in the menu still drives', v)
  }]
]
