// Getting in and out of every kind of car, the fists and a run-over, shot headless for a look
// (not a pass/fail flow: the career's steps check these). PORT=8093 SHOTS=/workspace/shots/v3/foot
//   node --import ./tools/node-loader/register.mjs tools/playtest/footShots.mjs [doors|fists|runover|all] [--kinds=sedan,bus]
import { Game } from './lib.mjs'
import { nearestLane } from '../../js/sim/city.js'
import { TYPES } from '../../js/sim/carTypes.js'
import { logEvents } from './helpers.mjs'

const args = process.argv.slice(2)
const which = args.find(a => !a.startsWith('--')) || 'all'
const kinds = ((args.find(a => a.startsWith('--kinds=')) || '').slice(8) || TYPES.map(t => t.name).join(',')).split(',')
const g = await Game.open({ query: '?spawn=' + (process.env.SPAWN || '-150,-58,0') })
const log = (...a) => console.log(...a)
const phaseOf = () => { const a = window.__roadster.foot.action; return a ? `${a.dir}:${a.phase}:${a.t.toFixed(2)}` : window.__roadster.player.mode }
await g.ev(logEvents)
await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
await g.run(1)
// the camera at an angle on the car's driver's side (a from square on, toward its tail)
const aim = (a = 0.6, pitch = 0.32, dist = 5.2) => g.ev(([a, pitch, dist]) => {
  const R = window.__roadster, e = R.foot.action?.entry || R.player.vehicle
  if (!e) return
  const c = R.foot.cam
  c.yaw = e.heading + Math.PI / 2 * (e.doorSide || -1) * (R.foot.action?.side || 1) - a * (e.doorSide || -1)
  c.pitch = pitch
  c.dist = dist
  c.idle = 0
}, [a, pitch, dist])
// on foot: the camera looking along the player's facing turned by a (from their right, a > 0)
const aimFoot = (a = 0.9, pitch = 0.25, dist = 4.2) => g.ev(([a, pitch, dist]) => {
  const R = window.__roadster, c = R.foot.cam
  c.yaw = R.player.heading + a
  c.pitch = pitch
  c.dist = dist
  c.idle = 0
}, [a, pitch, dist])
const until = (f, sec, arg) => g.until(f, sec, arg, 0.05)

if (which === 'doors' || which === 'all') {
  // the Roadster first: out, and back in
  await g.press('KeyE', 0)
  await until(() => window.__roadster.foot.action?.phase === 'roadster' && window.__roadster.foot.action.t > 1.2, 6)
  await aim(0.5)
  await g.shot('door-roadster-out.png')
  await until(() => window.__roadster.player.mode === 'foot', 6)
  await g.run(1)
  for (const name of kinds) {
    if (name === 'roadster') continue
    const k = TYPES.findIndex(t => t.name === name)
    const P = await g.ev(() => ({ ...window.__roadster.player.pos }))
    const l = nearestLane(P.x + 8, P.z)
    const ok = await g.ev(([k, l]) => {
      const R = window.__roadster
      R.traffic.clearAround(l.x, l.z, 30)
      // (any other parked car of ours left from the last kind taken away)
      for (let i = R.traffic.cars.length - 1; i >= 0; i--) if (R.traffic.cars[i].shot) R.traffic.remove(i)
      const c = R.traffic.park({ x: l.x, z: l.z, yaw: l.yaw, y: 0.001 }, R.traffic.R, k)
      c.shot = true
      R.vehicles.sync(R.traffic, R.sim)
      const e = R.vehicles.of(c)
      e.stolen = true // (open: no break-in, for the door)
      const w = R.vehicles.toWorld(e, e.door.x - 1.2, e.door.z + Math.sign(e.door.z) * 0.7)
      const p = R.player
      p.pos.x = R.foot.prev.x = w.x
      p.pos.z = R.foot.prev.z = w.z
      p.vel.x = p.vel.z = 0
      p.heading = c.yaw
      return e.id
    }, [k, { x: l.x, z: l.z, yaw: l.yaw }])
    await g.run(0.4)
    await g.press('KeyE', 0)
    const got = await until(() => { const a = window.__roadster.foot.action; return a && a.phase === 'open' && a.t > 0.42 }, 8)
    log(name, ok, 'open?', got, await g.ev(phaseOf))
    log(name, 'door', await g.ev(() => { const d = window.__roadster.foot.view.doors; return [d.angle, !!d.cur, d.cur?.door.map(m => m.visible)] }))
    await aim(-0.7, 0.3, 6)
    await g.shot(`door-${name}-open.png`)
    await until(() => { const a = window.__roadster.foot.action; return a && a.phase === 'in' && a.t > 0.45 }, 4)
    await aim(-0.7, 0.3, 6)
    await g.shot(`door-${name}-in.png`)
    const seated = await until(() => window.__roadster.player.mode === 'car', 6)
    log(name, 'seated', seated)
    await g.run(0.5)
    await g.press('KeyE', 0)
    await until(() => { const a = window.__roadster.foot.action; return a && a.dir === 'out' && a.phase === 'out' && a.t > 0.35 }, 5)
    await aim(-0.6, 0.3, 6.5)
    await g.shot(`door-${name}-out.png`)
    await until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 6)
    await g.run(0.4)
  }
}
const stars = () => g.ev(() => window.__roadster.game.wanted.stars)
// someone nearby on the pavement, stood still in front of the player (on foot), facing them
const victim = (dist = 1.6) => g.ev(d => {
  const R = window.__roadster, P = R.player
  const q = R.peds.list.filter(o => !o.dead && !o.gone && (o.state === 'walk' || o.state === 'idle'))
    .sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0]
  if (!q) return null
  q.state = 'idle'
  q.t = 0
  q.v = 0
  P.pos.x = R.foot.prev.x = q.x - d * Math.cos(P.heading)
  P.pos.z = R.foot.prev.z = q.z + d * Math.sin(P.heading)
  P.vel.x = P.vel.z = 0
  return q.i
}, dist)

if (which === 'fists' || which === 'all') {
  if (await g.ev(() => window.__roadster.player.mode !== 'foot')) {
    await g.press('KeyE', 0)
    await until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 8)
    await g.run(0.6)
  }
  await g.ev(() => window.__roadster.game.wanted.set(0, window.__roadster.player.pos))
  const id = await victim()
  log('fists: victim', id)
  await g.run(0.1)
  // the combo: each press made as the last punch lands (chained), a shot just after each hit
  const swing = async (name, at) => {
    await g.press('KeyF', 0)
    await until(m => { const c = window.__roadster.foot.fight.melee.cur; return c && c.t >= c.move.hit + m }, 2, at)
    await aimFoot(1.2)
    if (name) await g.shot(name)
  }
  await swing('punch-jab.png', 0.02)
  await until(() => !window.__roadster.foot.fight.melee.cur, 2)
  await swing(null, 0)
  await until(() => !window.__roadster.foot.fight.melee.cur, 2)
  await swing('punch-landing.png', 0.03)
  await until(() => !window.__roadster.foot.fight.melee.cur, 2)
  await g.run(0.6)
  await aimFoot(0.9)
  await g.shot('ped-knocked-down.png')
  log('fists:', await g.ev(() => { const F = window.__roadster.foot.fight; return { landed: F.landed, taken: F.taken } }))
  const up = await until(() => window.__roadster.game.wanted.stars > 0, 20)
  log('fists: wanted', up, await stars())
  await aimFoot(0.9, 0.35, 6)
  await g.shot('punch-wanted.png')
}

if (which === 'runover' || which === 'all') {
  await g.ev(() => window.__roadster.game.wanted.set(0, window.__roadster.player.pos))
  // in a city car (the harness's way: polish.js seatIn), at speed, someone just ahead
  await g.ev(() => window.__roadster.seatIn('sedan'))
  await g.run(1.5)
  log('runover: in', await g.ev(() => window.__roadster.player.mode))
  const hit = await g.ev(() => {
    const R = window.__roadster, b = R.foot.alt.body, P = R.player.pos
    let p = null, bd = Infinity
    for (const q of R.peds.list) {
      const d = Math.hypot(q.x - P.x, q.z - P.z)
      if (!q.dead && q.state !== 'down' && !q.hidden && d < bd) { bd = d; p = q }
    }
    if (!p) return false
    R.traffic.clearAround(p.x, p.z, 40)
    const yaw = b.yaw, hx = Math.cos(yaw), hz = -Math.sin(yaw), d = 5
    window.__victim = p
    Object.assign(b, { x: p.x - hx * d, z: p.z - hz * d, hx, hz, u: 18, vx: hx * 18, vz: hz * 18, w: 0, lat: 0 })
    return true
  })
  await g.hold('KeyW', 0.35)
  await g.run(0.15)
  log('runover: hit', hit, await g.ev(() => { const q = window.__victim; return q && { state: q.state, dead: q.dead, air: q.air } }))
  await g.shot('runover-hit.png')
  await g.hold('Space', 2.5)
  await g.run(1)
  const up = await until(() => window.__roadster.game.wanted.stars > 0, 20)
  log('runover: wanted', up, await stars())
  // out, and a look back at them lying there, the stars up
  await g.press('KeyE', 0)
  await until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 8)
  await g.run(0.3)
  log('runover: body', await g.ev(() => {
    const R = window.__roadster, q = window.__victim, P = R.player.pos, c = R.foot.cam
    // (walked back to them: stood 3.5 m off, on the road side)
    const ox = P.x - q.x, oz = P.z - q.z, od = Math.hypot(ox, oz) || 1
    P.x = R.foot.prev.x = q.x + ox / od * 3.5
    P.z = R.foot.prev.z = q.z + oz / od * 3.5
    c.yaw = Math.atan2(-(q.z - P.z), q.x - P.x) + 0.25
    c.pitch = 0.3
    c.dist = 5
    c.idle = 0
    return { dead: q.dead, state: q.state, d: Math.hypot(q.x - P.x, q.z - P.z).toFixed(1), stars: R.game.wanted.stars }
  }))
  await g.shot('runover-aftermath.png')
}

await g.close()
log('console', g.console.filter(c => !/GL Driver|GPU stall|swiftshader/i.test(c.text)).slice(0, 10))
