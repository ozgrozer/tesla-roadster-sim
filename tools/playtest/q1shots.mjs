// The integrated build shown, one shot a feature (Q1): on foot, a chase with a roadblock, the night
// skyline with the Meridian's crown, an interior entered on foot, an all-way stop junction, the
// pause map and the hidden-token counter. Each scene checks what it shows (issues, printed).
//   PORT=8095 SHOTS=... node --import ./tools/node-loader/register.mjs tools/playtest/q1shots.mjs
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'
import { nearestLane } from '../../js/sim/city.js'
import { STOPS } from '../../js/sim/trafficStop.js'
import { SITES } from '../../js/sim/interiors/sites.js'
import { TOKENS } from '../../js/sim/tokens.js'
import { LANDMARKS_V2 } from '../../js/sim/variety.js'

const lane = (x, z) => {
  const l = nearestLane(x, z)
  return { x: l.x, z: l.z, yaw: l.yaw }
}
// the hour set at once, and the sky's environment map redrawn for it now (daylight.js keeps the
// last one for a while: a shot right after the change would light the city with the old sky)
const hour = (g, h) =>
  g.ev(h => {
    const R = window.__roadster
    R.climate.setHour(h)
    R.climate.setWeather('clear', { now: true })
    const d = R.cityView.daylight
    if (d) {
      d.envWas = null
      d.envT = 0
    }
  }, h)
const state = g =>
  g.ev(() => {
    const R = window.__roadster,
      G = R.game
    return {
      mode: R.player.mode,
      stars: G.wanted.stars,
      blocks: G.police.units.filter(u => u.role === 'block').length,
      units: G.police.units.length,
      night: +R.env.night.toFixed(2),
      pos: [Math.round(R.player.pos.x), Math.round(R.player.pos.z)]
    }
  })

const g = await Game.open({ width: 960, height: 540 })
g.step = 'q1'
const out = {}
await g.ev(() => {
  window.__roadster.intro.finish(true)
  document.getElementById('help').hidden = true
})
await g.run(2)

// 1) on foot, by the Roadster
g.step = 'on-foot'
await hour(g, 15)
await g.press('KeyE', 2)
await g.hold('KeyW', 1)
out.foot = await state(g)
g.expect(out.foot.mode === 'foot', 'not on foot', out.foot)
await g.shot('q1-on-foot.png')

// 2) the token counter: the player walked onto a token on the ground (the first that is)
g.step = 'token-hud'
const tk = TOKENS.filter(t => t.y < 0.5 && t.y > -0.5)[0]
await g.ev(t => {
  const P = window.__roadster.player
  P.pos.x = t.x + 3
  P.pos.z = t.z
  window.__roadster.rig.cut?.()
}, tk)
await g.run(0.5)
await g.ev(t => {
  const P = window.__roadster.player
  P.pos.x = t.x
  P.pos.z = t.z
}, tk)
await g.run(0.6)
out.token = await g.ev(() => ({
  hud:
    document
      .querySelector('.tokens, #tokens, [class*="token"]')
      ?.textContent?.trim() || null
}))
out.token.where = tk.where
g.expect(
  out.token.hud && /\d+\s*\/\s*30/.test(out.token.hud),
  'no token counter on the HUD',
  out.token
)
await g.shot('q1-token-hud.png')

// 3) an interior, gone into on foot (E at the door, through the fade)
g.step = 'interior'
const site = SITES.find(s => s.kind === 'lobby') || SITES[0]
await g.ev(
  s => {
    const R = window.__roadster,
      P = R.player
    P.pos.x = s.out.x
    P.pos.z = s.out.z
    if (R.foot.prev) {
      R.foot.prev.x = s.out.x
      R.foot.prev.z = s.out.z
    }
    R.rig.cut?.()
  },
  { out: site.out }
)
await g.run(0.6)
await g.press('KeyE', 0)
await g.untilReal(() => window.__roadster.player.pos.y < -20, 6000)
await g.run(1)
out.interior = await g.ev(() => ({
  y: +window.__roadster.player.pos.y.toFixed(1),
  mode: window.__roadster.player.mode
}))
out.interior.site = site.name
g.expect(out.interior.y < -20, 'the interior was not entered', out.interior)
await g.hold('KeyW', 0.8)
out.interiorCam = await g.ev(() => {
  const R = window.__roadster,
    c = R.cityView.interiors?.shown,
    p = R.player.pos,
    cam = R.app.camera || R.rig.camera
  const r = v => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]
  return {
    cam: r(cam.position),
    player: r(p),
    box: c && c.box,
    h: c && c.room && c.room.h,
    near: cam.near
  }
})
await g.shot('q1-interior.png')
// and out again
await g.ev(
  s => {
    const P = window.__roadster.player
    P.pos.x = s.inner.x
    P.pos.z = s.inner.z
  },
  { inner: site.inner }
)
await g.run(0.3)
await g.press('KeyE', 0)
await g.untilReal(() => window.__roadster.player.pos.y > -5, 6000)

// 4) an all-way stop: the Roadster at the line of one of them
g.step = 'stop'
const st = STOPS[0]
// (of the lanes 20 m out along each arm, one heading in to the junction)
const at = [
  [20, 0],
  [-20, 0],
  [0, 20],
  [0, -20]
]
  .flatMap(([dx, dz]) =>
    [-2, 2].map(k => lane(st.x + dx + (dz ? k : 0), st.z + dz + (dx ? k : 0)))
  )
  .find(
    l => Math.cos(l.yaw) * (st.x - l.x) - Math.sin(l.yaw) * (st.z - l.z) > 10
  )
await g.ev(a => window.__roadster.resetTo('city', a), at)
await g.run(4)
await g.shot('q1-stop-junction.png')

// 5) a chase: three stars on a clear straight, on until a roadblock is put across the road ahead;
// then the Roadster put 40 m short of it, facing it
g.step = 'roadblock'
// (westbound on Wilshire, Century City: the clear straight of career2's boost step)
const road = lane(-420, -389)
await g.ev(a => {
  const R = window.__roadster
  R.resetTo('city', a)
  R.traffic.clearAround(a.x, a.z, 250)
}, road)
await g.run(0.5)
const hot = () =>
  g.ev(() => {
    const R = window.__roadster,
      W = R.game.wanted
    if (W.stars < 3) W.set(3, R.sim.pos)
    if (R.sim.speed > 8) R.game.police.blockT = 0 // (staged: a missed spot otherwise waits 18 s, K18)
    W.spotted?.(R.sim.pos)
  })
// (a roadblock needs them going, over 8 m/s, with a lane ahead out of the camera's sight)
for (let i = 0; i < 40 && (await state(g)).blocks === 0; i++) {
  await hot()
  if (i % 2 === 0) await g.hold('KeyW', 0.3)
  else await g.run(0.5)
}
out.chase = await state(g)
if (
  g.expect(
    out.chase.blocks > 0,
    'no roadblock at three stars along Wilshire',
    out.chase
  )
) {
  await g.ev(() => {
    const R = window.__roadster,
      s = R.sim
    const bs = R.game.police.units.filter(u => u.role === 'block')
    const cx = bs.reduce((a, u) => a + (u.car?.x ?? u.x), 0) / bs.length,
      cz = bs.reduce((a, u) => a + (u.car?.z ?? u.z), 0) / bs.length
    const dx = s.pos.x - cx,
      dz = s.pos.z - cz,
      d = Math.hypot(dx, dz) || 1
    R.resetTo('city', {
      x: cx + (dx / d) * 40,
      z: cz + (dz / d) * 40,
      yaw: Math.atan2(dz, -dx)
    })
  })
  await hot()
  await g.run(1.5)
  out.chase2 = await state(g)
  await g.shot('q1-chase-roadblock.png')
}

// 6) night: the skyline and the Meridian's crown from ~630 m south, the free camera low behind the car
g.step = 'crown'
const c = LANDMARKS_V2.crown
await g.ev(() => {
  const R = window.__roadster
  R.game.police.clearAll?.()
  R.game.wanted.set(0)
})
const look = { x: 48, z: 197 } // (due south, ~630 m: the crown ~22° up, inside the 25° half fov)
const yaw = Math.atan2(-(c.spire.z - look.z), c.spire.x - look.x)
await g.ev(a => window.__roadster.resetTo('city', a), { ...look, yaw })
await hour(g, 22)
await g.run(2)
await g.ev(c => {
  const R = window.__roadster,
    s = R.sim,
    rig = R.rig
  rig.setMode('free')
  const dx = s.pos.x - c.x,
    dz = s.pos.z - c.z,
    d = Math.hypot(dx, dz)
  rig.controls.target.copy(s.pos)
  // (low and level behind the car: the skyline up the frame)
  rig.camera.position.set(
    s.pos.x + (dx / d) * 9,
    s.pos.y + 0.9,
    s.pos.z + (dz / d) * 9
  )
  rig.controls.update()
}, c.spire)
await g.run(2)
out.crown = await state(g)
out.crown.y = await g.ev(() => Math.round(window.__roadster.sim.pos.y))
g.expect(out.crown.night > 0.6, 'not night for the crown', out.crown)
await g.shot('q1-night-crown.png')
await g.ev(() => window.__roadster.rig.setMode('follow'))

// 7) the pause map
g.step = 'map'
await g.press('Escape', 0)
await g.wait(500)
await g.shot('q1-map.png')
await g.press('Escape', 0)

console.log(JSON.stringify(out))
for (const i of g.issues)
  console.log('ISSUE', i.step, '|', i.what, '|', i.detail.slice(0, 300))
for (const x of g.console
  .filter(c => !/GL Driver|GPU stall/.test(c.text))
  .slice(0, 8))
  console.log('CONSOLE', x.step, x.type, x.text.slice(0, 200))
fs.writeFileSync(
  path.join(SHOTS, 'q1-report.json'),
  JSON.stringify({ out, issues: g.issues }, null, 1)
)
await g.close()
