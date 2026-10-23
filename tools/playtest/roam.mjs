// The roam: the districts, each reached with ?spawn=x,z,yaw and driven in a city car (not the
// Roadster): the port, the stadium, the beach, a garage's ramp up to its first deck, the freeway's
// on-ramp onto the deck and its traffic, the hill road's switchbacks and the lookout. Checks the car
// keeps to the ground (world.js groundHeight: the decks, the ramps, the hill), the HUD of a driven
// car, and nobody inside a building there.
import { placeCar } from './helpers.mjs'
import { nearestLane } from '../../js/sim/city.js'
import { groundHeight } from '../../js/sim/world.js'
import { FWY } from '../../js/sim/freeway.js'

const lane = (x, z) => {
  const l = nearestLane(x, z)
  return { x: l.x, z: l.z, yaw: l.yaw }
}
const onRamp = FWY.ramps.find(r => r.side === 's' && r.h0 === 0 && r.x0 < 0)
// each: where to spawn, the car, where to put it (and its height), how to drive, what to expect
export const PLACES = [
  { name: 'port', at: lane(-720, 667), car: 'truck', drive: [['KeyW', 6]] },
  { name: 'stadium', at: lane(-17, 389), car: 'sedan', drive: [['KeyW', 4], [['KeyW', 'KeyA'], 2]] },
  { name: 'beach', at: lane(-739, -91), car: 'van', drive: [['KeyW', 6]] },
  { name: 'garage-ramp', at: { x: 14, z: 16, yaw: 0 }, car: 'sedan', drive: [['KeyW', 5]], up: 3.4 },
  { name: 'freeway', at: { x: onRamp.x0 - 6, z: (onRamp.z0 + onRamp.z1) / 2, yaw: 0 }, car: 'sports', drive: [['KeyW', 9]], up: FWY.y, traffic: 'deck' },
  { name: 'hill-road', at: { x: 480, z: -874, yaw: Math.PI / 2 }, car: 'suv', drive: [['KeyW', 3]], up: 2, traffic: 'hill' },
  { name: 'hill-switchback', at: { x: 527, z: -905, yaw: Math.PI / 2, y: groundHeight(527, -905) }, car: 'pickup', drive: [['KeyW', 2.5], [['KeyW', 'KeyA'], 1.5]] },
  { name: 'lookout', at: { x: 772, z: -989, yaw: 0, y: groundHeight(772, -989) }, car: 'sports', drive: [['KeyW', 4], ['KeyS', 2]], up: 78 }
]

export async function roam (g, place) {
  const { at, car } = place
  await g.goto(`?spawn=${at.x.toFixed(1)},${at.z.toFixed(1)},${at.yaw.toFixed(3)}`)
  await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
  await g.run(1)
  const id = await g.ev(t => window.__roadster.seatIn(t), car)
  g.expect(id, 'seatIn failed', car)
  await g.run(1.5)
  await g.ev(placeCar, { ...at, u: 0 })
  if (at.y !== undefined) await g.ev(y => { window.__roadster.foot.alt.body.y = y }, at.y)
  await g.run(0.5)
  for (const [keys, sec] of place.drive) await g.hold(keys, sec)
  const s = await g.ev(() => { const b = window.__roadster.foot.alt.body; return b && { x: b.x, y: b.y, z: b.z, u: b.u, pitch: b.pitch, roll: b.roll, dead: b.dead } })
  if (!g.expect(s, 'not driving a city car')) return
  const ground = groundHeight(s.x, s.z, s.y + 1.5)
  g.expect(Math.abs(s.y - ground) < 0.7, 'the car is off the ground', { ...s, ground })
  if (place.up !== undefined) g.expect(s.y > place.up - 0.6, `did not get up (to ${place.up} m)`, s)
  g.expect(Math.hypot(s.x - at.x, s.z - at.z) > 8, 'the car hardly moved', s)
  if (place.traffic) {
    // (others on it too: the freeway's lanes, inner ones included, or the hill road's)
    const n = await g.ev(([deck, x, z]) => window.__roadster.traffic.cars.filter(c => c.edge?.hw && (c.edge.vk >= 1) === deck && Math.hypot(c.x - x, c.z - z) < 400).length, [place.traffic === 'deck', s.x, s.z])
    g.expect(n > 0, `no traffic on the ${place.traffic === 'deck' ? 'freeway' : 'hill road'}`, n)
  }
  await g.shot(`roam-${place.name}.png`)
}
