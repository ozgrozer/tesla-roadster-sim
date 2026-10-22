// The career flow, on foot (between career.mjs and career2.mjs): a punch thrown at someone on the
// pavement lands, is an assault, and brings a star once rung in; someone run over at speed is
// killed (left lying there) and the stars go up; getting in and out of every kind of city car by
// its own door. Each step: (g) => void, checking as it goes (g.expect / g.issue).
import { events } from './helpers.mjs'
import { nearestLane } from '../../js/sim/city.js'
import { TYPES } from '../../js/sim/carTypes.js'

const has = (list, type, f = () => true) => list.some(e => e.type === type && f(e))
const stars = () => window.__roadster.game.wanted.stars
const mode = () => window.__roadster.player.mode
// out of whatever car, on foot, with no stars and nobody after the player
async function onFootClean (g) {
  for (let k = 0; k < 4 && await g.ev(mode) !== 'foot'; k++) {
    await g.ev(() => { const R = window.__roadster, b = R.foot.alt.body; if (b) Object.assign(b, { u: 0, vx: 0, vz: 0, w: 0, lat: 0 }) })
    await g.hold('Space', 1.2)
    await g.press('KeyE', 0)
    await g.until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 8)
  }
  const why = await g.ev(() => { const R = window.__roadster, s = R.foot.driven?.(); return { mode: R.player.mode, drive: s?.mode, v: s?.groundSpeed?.(), down: !!R.foot.down } })
  g.expect(why.mode === 'foot', 'could not get out on foot', why)
  await g.ev(() => { const R = window.__roadster; R.game.wanted.set(0, R.player.pos) })
  await g.run(0.5)
  return why.mode === 'foot'
}
// the nearest person standing about, stood still with the player 1.5 m in front of them
const victim = () => {
  const R = window.__roadster, P = R.player
  const q = R.peds.list.filter(o => !o.dead && !o.gone && !o.hidden && (o.state === 'walk' || o.state === 'idle'))
    .sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0]
  if (!q) return null
  q.state = 'idle'
  q.t = 0
  P.pos.x = R.foot.prev.x = q.x - 1.5 * Math.cos(P.heading)
  P.pos.z = R.foot.prev.z = q.z + 1.5 * Math.sin(P.heading)
  P.vel.x = P.vel.z = 0
  return q.i
}

export const CAREER_FOOT = [
  ['punch-ped', async g => {
    if (!await onFootClean(g)) return
    await g.ev(events)
    const id = await g.ev(victim)
    if (!g.expect(id !== null, 'nobody about to punch')) return
    for (let k = 0; k < 3; k++) {
      await g.press('KeyF', 0)
      await g.until(() => !window.__roadster.foot.fight.melee.busy, 2)
    }
    const ev = await g.ev(events)
    g.expect(has(ev, 'ped-punched'), 'no punch landed', ev.slice(-10))
    g.expect(has(ev, 'crime', e => e.what === 'assault'), 'punching someone was no assault', ev.slice(-10))
    await g.shot('f1-punch.png')
    const up = await g.until(() => window.__roadster.game.wanted.stars >= 1, 25)
    g.expect(up, 'the assault never brought a star', await g.ev(stars))
  }],
  ['run-over-kill', async g => {
    await onFootClean(g)
    await g.ev(() => window.__roadster.seatIn('sedan'))
    await g.run(1.5)
    await g.ev(events)
    const before = await g.ev(stars)
    let ev = []
    for (let k = 0; k < 4 && !has(ev, 'ped-hit', e => e.by === 'player' && e.how === 'car' && e.type === 'ped-hit'); k++) {
      const ok = await g.ev(k => {
        const R = window.__roadster, b = R.foot.alt.body, P = R.player.pos
        let p = null, bd = Infinity
        for (const q of R.peds.list) {
          const d = Math.hypot(q.x - P.x, q.z - P.z)
          if (!q.dead && q.state !== 'down' && !q.hidden && d < bd) { bd = d; p = q }
        }
        if (!p) return false
        R.traffic.clearAround(p.x, p.z, 40)
        const yaw = b.yaw, hx = Math.cos(yaw), hz = -Math.sin(yaw), d = 6 - k
        window.__victim = p
        Object.assign(b, { x: p.x - hx * d, z: p.z - hz * d, hx, hz, u: 19, vx: hx * 19, vz: hz * 19, w: 0, lat: 0 })
        return true
      }, k)
      if (!g.expect(ok, 'no pedestrian to run over')) return
      await g.hold('KeyW', 0.8)
      ev = ev.concat(await g.ev(events))
    }
    const v = await g.ev(() => { const q = window.__victim; return { dead: q.dead, state: q.state } })
    g.expect(has(ev, 'crime', e => e.what === 'ped-killed'), 'running someone over at 19 m/s killed nobody', { v, ev: ev.slice(-10) })
    await g.hold('Space', 2)
    const up = await g.until(b => window.__roadster.game.wanted.stars > b, 25, before)
    g.expect(up, 'the stars never went up for a killing', { before, now: await g.ev(stars) })
    const still = await g.ev(() => { const R = window.__roadster, q = window.__victim; return R.peds.list.includes(q) && q.dead && q.state === 'down' })
    g.expect(still, 'the body was not left lying there')
    await g.shot('f2-run-over.png')
  }],
  ['every-car-door', async g => {
    if (!await onFootClean(g)) return
    const fails = [],
      done = []
    for (let k = 0; k < TYPES.length; k++) {
      const P = await g.ev(() => ({ ...window.__roadster.player.pos }))
      const l = nearestLane(P.x + 8, P.z)
      const r = await g.ev(([k, l]) => {
        const R = window.__roadster
        R.traffic.clearAround(l.x, l.z, 30)
        for (let i = R.traffic.cars.length - 1; i >= 0; i--) if (R.traffic.cars[i].doorTest) R.traffic.remove(i)
        const c = R.traffic.park({ x: l.x, z: l.z, yaw: l.yaw, y: 0.001 }, R.traffic.R, k)
        if (!c) return null
        c.doorTest = true
        R.vehicles.sync(R.traffic, R.sim)
        const e = R.vehicles.of(c)
        e.stolen = true
        const sd = Math.sign(e.door.z) || -1
        const w = R.vehicles.toWorld(e, e.door.x - 1, e.door.z + sd * 0.6)
        const p = R.player
        p.pos.x = R.foot.prev.x = w.x
        p.pos.z = R.foot.prev.z = w.z
        p.vel.x = p.vel.z = 0
        p.heading = c.yaw
        return { id: e.id, side: sd }
      }, [k, { x: l.x, z: l.z, yaw: l.yaw }])
      const name = TYPES[k].name
      if (!r) { fails.push(`${name}: not parked`); continue }
      await g.run(0.3)
      await g.press('KeyE', 0)
      const opened = await g.until(() => ['open', 'in'].includes(window.__roadster.foot.action?.phase), 4)
      const shown = opened && await g.ev(() => !!window.__roadster.foot.view.doors.cur)
      const inCar = await g.until(() => window.__roadster.player.mode === 'car', 8)
      const kind = await g.ev(() => window.__roadster.player.vehicle?.type)
      await g.run(0.4)
      await g.press('KeyE', 0)
      const out = await g.until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 8)
      const side = await g.ev(([id, sd]) => {
        const R = window.__roadster, e = R.vehicles.list?.find?.(v => v.id === id) || R.player.lastVehicle
        if (!e) return null
        const l = R.vehicles.toLocal(e, R.player.pos.x, R.player.pos.z)
        return l.z * sd > 0
      }, [r.id, r.side])
      done.push(`${name}:${opened && shown && inCar && out && side ? 'ok' : 'FAIL'}`)
      if (!opened || !shown || !inCar || !out || side === false) fails.push(`${name}: open ${opened} door ${shown} in ${inCar} (${kind}) out ${out} side ${side}`)
      await g.run(0.3)
    }
    g.notes = (g.notes || []).concat(`every-car-door: ${done.join(' ')}`)
    g.expect(done.length === TYPES.length && !fails.length, 'getting in and out by the door failed', fails)
    await g.ev(() => { const R = window.__roadster; for (let i = R.traffic.cars.length - 1; i >= 0; i--) if (R.traffic.cars[i].doorTest) R.traffic.remove(i) })
    // on with a car for the rest of the career, and no stars from here
    await g.ev(() => { const R = window.__roadster; R.game.wanted.set(0, R.player.pos) })
    await g.ev(() => window.__roadster.seatIn('sedan'))
    await g.run(1.5)
  }]
]
