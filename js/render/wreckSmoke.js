// Smoke off the traffic's damaged cars (sim/carDamage.js: dmg.smoke): white steam from under the
// bonnet of one whose engine is hurt, thin and quick to go, trailing behind it as it limps on, and
// thick dark smoke rolling up off a wreck, a little steam in it, carried off on the breeze
// (smoke.js). It comes from the engine: the gap at the front of the bonnet and the crumpled bonnet
// itself (a bus's engine is at the back, low down). Only the cars within REACH m of the Roadster,
// so the far ones don't fill the smoke's pool; what each car owes is kept on its damage.
import { CURB_H } from '../sim/city.js'
import { smoke } from './smoke.js'

export const STEAM = {
  col: [0.9, 0.91, 0.93],
  life: [1.4, 2.8],
  s0: 0.3,
  s1: [1.2, 2.2],
  alpha: 0.42,
  drag: 1.8,
  buoy: 2.2,
  tau: 1.2,
  turb: 1,
  spread: 0.5
}
export const WRECK_SMOKE = {
  col: [0.06, 0.06, 0.065],
  life: [4, 7],
  s0: 0.55,
  s1: [2.4, 4.4],
  alpha: 0.75,
  drag: 1.1,
  buoy: 3,
  tau: 4,
  turb: 1,
  spread: 0.4
}
const REACH = 140
const RATE = [0, 12, 24] // puffs a second: none, a hurt engine's steam, a wreck's smoke

// each frame (dt: the sim's time it covers), round p (the Roadster); types: render/traffic.js's,
// each with its body's lines (S)
export function wreckSmoke (traffic, dt, p, types) {
  if (dt <= 0) return
  for (const c of traffic.cars) {
    const D = c.dmg
    if (!D || !D.smoke) continue
    const dx = c.x - p.x,
      dz = c.z - p.z
    if (dx * dx + dz * dz > REACH * REACH) continue
    D.puff += RATE[D.smoke] * dt
    if (D.puff < 1) continue
    const S = types[c.type].S,
      bus = c.big
    const hx = Math.cos(c.yaw),
      hz = -Math.sin(c.yaw)
    const y0 = c.parked && !c.jam ? CURB_H : 0
    const vx = c.loose ? c.vx : hx * c.v,
      vz = c.loose ? c.vz : hz * c.v
    for (; D.puff >= 1; D.puff--) {
      // (where on the bonnet, in the car's frame, and up off it)
      const lx = bus ? -S.L + 0.3 : S.L - 0.15 - Math.random() * 0.75,
        lz = (Math.random() - 0.5) * S.W * 1.1
      const y = y0 + (bus ? 0.9 + Math.random() * 0.4 : S.top(lx) + 0.04)
      const dark = D.smoke === 2 && Math.random() < 0.8
      smoke.spawn(
        dark ? WRECK_SMOKE : STEAM,
        c.x + lx * hx - lz * hz,
        y,
        c.z + lx * hz + lz * hx,
        vx * 0.6 + (Math.random() - 0.5) * 0.6 + (bus ? -hx : 0),
        (dark ? 0.6 : 0.9) + Math.random() * 0.8,
        vz * 0.6 + (Math.random() - 0.5) * 0.6 + (bus ? -hz : 0),
        y0,
        dark ? 0.8 + Math.random() * 0.5 : 0.7 + Math.random() * 0.4
      )
    }
  }
}
