// The gallery: the same views of the city every time, for before-and-after comparisons and for
// showing the game. One page load; for each view the Roadster is put on the lane nearest a
// place, the clock and the weather are set, and the picture is taken from the follow camera or
// from a free camera at a fixed offset from the car (aerial views). 1280 x 720.
//   node --import ./tools/node-loader/register.mjs tools/playtest/gallery.mjs [--only=a,b]
// Screenshots to $SHOTS (gallery-<name>.png).
import fs from 'node:fs'
import { Game, SHOTS } from './lib.mjs'
import { nearestLane } from '../../js/sim/city.js'
import { SPAWN } from '../../js/sim/grid.js'

const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const lane = (x, z, flip = false) => {
  const l = nearestLane(x, z)
  return { x: l.x, z: l.z, yaw: l.yaw + (flip ? Math.PI : 0) }
}
// cam: null for the follow camera, else [dx, dy, dz] from the car (the free camera looks at it)
export const VIEWS = [
  { name: 'spawn', at: { ...SPAWN }, hour: 17, weather: 'clear' },
  { name: 'downtown-street', at: lane(0, -380), hour: 12.5, weather: 'clear' },
  { name: 'downtown-aerial', at: lane(-48, -384), hour: 12.5, weather: 'clear', cam: [-160, 140, 120] },
  { name: 'pier-sunset', at: lane(-850, -384), hour: 18.05, weather: 'clear', cam: [70, 18, 30] },
  { name: 'venice', at: lane(-624, 0), hour: 11, weather: 'clear' },
  { name: 'suburb', at: lane(-240, 624), hour: 10, weather: 'clear' },
  { name: 'industrial', at: lane(624, -48), hour: 15, weather: 'cloudy' },
  { name: 'river', at: lane(336, 48), hour: 16, weather: 'clear', cam: [-60, 45, 40] },
  { name: 'hollywood-night-rain', at: lane(144, -720), hour: 22, weather: 'rain' },
  { name: 'city-from-hills', at: lane(480, -860), hour: 17.4, weather: 'clear', cam: [-40, 160, -120] },
  { name: 'south-aerial', at: lane(-48, 528), hour: 14, weather: 'clear', cam: [200, 220, 260] }
]

const g = await Game.open({ width: 1280, height: 720 })
await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
await g.run(1)
fs.mkdirSync(SHOTS, { recursive: true })
for (const v of VIEWS) {
  if (only.length && !only.includes(v.name)) continue
  g.step = 'gallery:' + v.name
  await g.ev(({ hour, weather }) => {
    const R = window.__roadster
    R.climate.setWeather(weather, { quick: true })
    R.climate.setHour(hour)
  }, v)
  await g.ev(at => {
    const R = window.__roadster
    R.resetTo('city', at)
    R.traffic.reset(at.x, at.z)
    R.peds.reset(at.x, at.z)
  }, v.at)
  await g.run(1.5)
  await g.ev(cam => {
    const R = window.__roadster
    if (!cam) {
      if (R.rig.mode !== 'follow') R.rig.setMode('follow')
      R.rig.cut()
      return
    }
    R.rig.setMode('free')
    const p = R.sim.pos
    R.rig.controls.target.set(p.x, p.y + 1, p.z)
    R.rig.camera.position.set(p.x + cam[0], p.y + cam[1], p.z + cam[2])
    R.rig.controls.update()
  }, v.cam || null)
  await g.run(0.5)
  // (a few frames drawn first, so the shadows and the streaming catch up)
  await g.draw(4)
  const p = await g.shot(`gallery-${v.name}.png`)
  console.log(v.name, p)
}
await g.ev(() => window.__roadster.rig.setMode('follow'))
const errs = g.console.filter(c => !/GL Driver Message|GPU stall|swiftshader/i.test(c.text))
if (errs.length) console.log('console:', JSON.stringify(errs.slice(0, 10), null, 1))
await g.close()
