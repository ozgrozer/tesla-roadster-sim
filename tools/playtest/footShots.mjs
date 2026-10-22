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
  c.yaw = e.heading - Math.PI / 2 * (R.foot.action?.side || 1) + a
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
      const w = R.vehicles.toWorld(e, e.door.x - 1.2, e.door.z - 0.7)
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
    await aim(0.75)
    await g.shot(`door-${name}-in.png`)
    const seated = await until(() => window.__roadster.player.mode === 'car', 6)
    log(name, 'seated', seated)
    await g.run(0.5)
    await g.press('KeyE', 0)
    await until(() => { const a = window.__roadster.foot.action; return a && a.dir === 'out' && a.phase === 'out' && a.t > 0.35 }, 5)
    await aim(0.75)
    await g.shot(`door-${name}-out.png`)
    await until(() => window.__roadster.player.mode === 'foot' && !window.__roadster.foot.action, 6)
    await g.run(0.4)
  }
}
await g.close()
log('console', g.console.filter(c => !/GL Driver|GPU stall|swiftshader/i.test(c.text)).slice(0, 10))
