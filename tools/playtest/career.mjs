// The career flow: one session played through end to end, as a player would, across every
// system: out of the Roadster, on foot, a parked car broken into, driven, crashed, a person hit,
// the police after the player and shaken off, missions, a carjacking, busted, wasted, back in the
// Roadster to boost and fly, the test site and back, the clock and the weather, the pause menu.
// Each step: (g) => void, checking as it goes (g.expect / g.issue); a snapshot is checked after
// each (probe.js check).
import { logEvents, events, placeFoot, findCar, toDoor, placeCar } from './helpers.mjs'
import { nearestLane } from '../../js/sim/city.js'

const S = () => window.__roadster
const mode = () => window.__roadster.player.mode
const has = (list, type, f = () => true) => list.some(e => e.type === type && f(e))

export const CAREER = [
  ['start', async g => {
    await g.ev(logEvents)
    g.expect(await g.ev(() => window.__roadster.app.world === 'city'), 'not in the city at the start')
    // skip the intro (Optimus walking up and getting in) as a player would: any key... its own skip
    await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
    await g.run(1)
    g.expect((await g.ev(mode)) === 'car', 'not in the car after the intro', await g.ev(mode))
    await g.shot('01-start.png')
  }],
  ['exit-roadster', async g => {
    await g.press('KeyE', 0)
    g.expect(await g.until(() => window.__roadster.player.mode === 'foot', 6), 'did not get out of the Roadster', await g.ev(mode))
    await g.run(0.5)
    await g.shot('02-on-foot.png')
  }],
  ['walk-run-jump', async g => {
    const p0 = await g.ev(() => ({ ...window.__roadster.player.pos }))
    await g.hold('KeyW', 2)
    const p1 = await g.ev(() => ({ ...window.__roadster.player.pos, rs: window.__roadster.sim.speed }))
    const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z)
    g.expect(walked > 1.5, 'W did not walk', walked)
    g.expect(Math.abs(p1.rs) < 0.3, 'input leak: the empty Roadster moved while walking', p1.rs)
    await g.hold(['ShiftLeft', 'KeyW'], 2)
    const p2 = await g.ev(() => ({ ...window.__roadster.player.pos }))
    const ran = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    g.expect(ran > walked * 1.2, 'Shift did not run faster than walking', { walked, ran })
    const y0 = p2.y
    await g.page.keyboard.press('Space')
    let top = y0
    for (let i = 0; i < 6; i++) {
      await g.run(0.1, 0.1, 0)
      top = Math.max(top, await g.ev(() => window.__roadster.player.pos.y))
    }
    g.expect(top > y0 + 0.2, 'Space did not jump', { y0, top })
    const sim = await g.ev(() => ({ boost: window.__roadster.sim.thrMain, v: window.__roadster.sim.speed }))
    g.expect(!sim.boost && Math.abs(sim.v) < 0.3, 'input leak: Shift/Space reached the Roadster', sim)
    await g.run(1)
  }],
  ['steal-parked', async g => {
    // break into parked cars until one sets its alarm off (BOARD.alarm: about half do)
    const tried = []
    let ok = false
    for (let k = 0; k < 10 && !ok; k++) {
      const i = await g.ev(findCar, { kind: 'parked', r: 400, not: tried })
      if (i < 0) break
      tried.push(i)
      const car = await g.ev(toDoor, i)
      await g.run(0.5)
      const prompt = await g.ev(() => document.getElementById('prompt').textContent)
      g.expect(/E/.test(prompt), 'no prompt by a parked car', prompt)
      events && (await g.ev(events))
      await g.press('KeyE', 0)
      const seated = await g.until(() => window.__roadster.player.mode === 'car', 10)
      const ev = await g.ev(events)
      if (!seated) {
        g.issue('could not break into a parked car', { car, mode: await g.ev(mode), prompt })
        continue
      }
      // (some are left unlocked: in, and no theft)
      if (!has(ev, 'car-stolen')) g.expect(has(ev, 'car-entered'), 'no car-entered event', ev)
      ok = has(ev, 'crime', e => e.what === 'car-alarm')
      if (ok) g.expect(has(ev, 'car-stolen', e => e.alarm), 'an alarm but no car-stolen event with it', ev)
      if (!ok && k < 9) {
        // out again, for the next one
        await g.press('KeyE', 0)
        await g.until(() => window.__roadster.player.mode === 'foot', 6)
        await g.run(0.5)
      } else g.car = car
    }
    g.expect(ok, 'no alarm in ten cars tried')
    g.car = await g.ev(() => window.__roadster.player.vehicle?.type)
    await g.run(0.5)
    await g.shot('03-stolen-parked.png')
  }],
  ['drive-stolen', async g => {
    // (from the lane beside where it was parked, the moving traffic cleared ahead: parked nose in
    // against a wall or behind a queue at the lights, it could not drive off in the time given)
    const at = await g.ev(() => { const b = window.__roadster.foot.alt.body; return b && { x: b.x, z: b.z } })
    if (at) {
      const l = nearestLane(at.x, at.z)
      await g.ev(l => { window.__roadster.traffic.clearAround(l.x, l.z, 60) }, { x: l.x, z: l.z })
      await g.ev(placeCar, { x: l.x, z: l.z, yaw: l.yaw })
      await g.run(0.3)
    }
    await g.hold('KeyW', 2)
    const s = await g.ev(() => {
      const R = window.__roadster, b = R.foot.alt.body
      return { u: b?.u, rpm: b?.rpm, gear: b?.gear, gearEl: document.querySelector('.sp-num')?.textContent, place: document.getElementById('place').textContent.replace(/\s+/g, ' '), engine: R.app.engine, motor: R.sound.n?.front?.gD?.gain?.value }
    })
    g.expect(s.u > 3, 'the stolen car did not drive off', s)
    g.expect(s.rpm > 900 && s.gear >= 1, 'no rpm or gear on the stolen car', s)
    g.expect(s.gearEl && s.gearEl !== '–', 'no gear on the HUD', s)
    g.expect(s.engine === true, 'the class engine is not on (app.engine)', s)
    await g.shot('04-driving-stolen.png')
  }],
  ['crash-traffic', async g => {
    // a driven car in front, at speed into it
    const i = await g.ev(findCar, { kind: 'driven', r: 600 })
    if (!g.expect(i >= 0, 'no traffic to crash into')) return
    await g.ev(events)
    await g.ev(i => {
      const R = window.__roadster, c = R.traffic.cars[i], b = R.foot.alt.body
      const hx = Math.cos(c.yaw), hz = -Math.sin(c.yaw)
      Object.assign(b, { x: c.x - hx * 9, z: c.z - hz * 9, yaw: c.yaw, hx, hz, u: 16, vx: hx * 16, vz: hz * 16, w: 0, lat: 0 })
    }, i)
    await g.hold('KeyW', 1.5)
    const s = await g.ev(() => ({ harm: window.__roadster.foot.alt.body.dmg?.harm || 0, ev: window.__evlog.slice(-20) }))
    g.expect(s.harm > 0, 'no damage from a crash into traffic', s)
    await g.shot('05-crash.png')
  }],
  ['hit-ped', async g => {
    await g.ev(events)
    let ev = []
    for (let k = 0; k < 4 && !has(ev, 'ped-hit', e => e.by === 'player'); k++) {
      const ok = await g.ev(k => {
        const R = window.__roadster, b = R.foot.alt.body, P = R.player.pos
        let p = null, bd = Infinity
        for (const q of R.peds.list) {
          const d = Math.hypot(q.x - P.x, q.z - P.z)
          if (!q.dead && q.state !== 'down' && !q.hidden && d < bd) { bd = d; p = q }
        }
        if (!p) return false
        // (nobody else's car about to hit them first: a ped-hit by a driver is no crime of the player's)
        R.traffic.clearAround(p.x, p.z, 40)
        // the car at speed, a few metres short of someone (on the pavement or not)
        const yaw = b.yaw, hx = Math.cos(yaw), hz = -Math.sin(yaw), d = 6 - k
        Object.assign(b, { x: p.x - hx * d, z: p.z - hz * d, hx, hz, u: 14, vx: hx * 14, vz: hz * 14, w: 0, lat: 0 })
        return true
      }, k)
      if (!g.expect(ok, 'no pedestrian to hit')) return
      await g.hold('KeyW', 1)
      ev = ev.concat(await g.ev(events))
    }
    g.expect(has(ev, 'ped-hit', e => e.by === 'player'), 'no ped-hit event by the player', ev.slice(-10))
    g.expect(has(ev, 'crime', e => /ped-/.test(e.what)), 'hitting a ped was no crime', ev.slice(-10))
  }]
]
