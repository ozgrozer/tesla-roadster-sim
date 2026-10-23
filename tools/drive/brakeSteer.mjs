// Brake and steer probe: 100-0 on S and on Space alone, s to full lock (A held), and the yaw rate
// (deg/s) held on A at 30 and 60 km/h, per class.
//   node --import ./tools/node-loader/register.mjs tools/drive/brakeSteer.mjs [--wet]
import { Rig, CLASSES, H } from './metrics.mjs'

const grip = process.argv.includes('--wet') ? 0.7 : 1
const o = { grip }
export function stop (k, keys, secs = 15) {
  const r = new Rig(k, o)
  r.at(27.78)
  r.keys(...keys)
  let d = 0
  while (r.u > 0.3 && r.t < secs) {
    const x = r.x,
      z = r.z
    r.step()
    d += Math.hypot(r.x - x, r.z - z)
  }
  return { t: r.t, d, v: r.u * 3.6 }
}
export function lockT (k, v) {
  const r = new Rig(k, o)
  r.at(v)
  r.cruise(v, 0.3)
  // (the road wheels' angle, not the key's: the rack's own rate is part of it)
  const seen = []
  for (let t = 0; t < 1; t += H) r.cruise(v, H, 'KeyA'), seen.push(Math.abs(r.steerAng))
  const top = seen[seen.length - 1]
  return seen.findIndex(s => s >= 0.95 * top) * H
}
export function turnRate (k, kmh) {
  const r = new Rig(k, o)
  const v = kmh / 3.6
  r.at(v)
  r.cruise(v, 0.3)
  r.cruise(v, 1.2, 'KeyA')
  return Math.abs(r.w) * 180 / Math.PI
}
const f = (x, n = 2) => x.toFixed(n).padStart(7)
if (process.argv[1]?.endsWith('brakeSteer.mjs')) {
  console.log('   class  S s    S m   HB s   HB m  HB1s kmh lock0 s lock60 s w30°/s w60°/s')
  for (const k of CLASSES) {
    const b = stop(k, ['KeyS']),
      h = stop(k, ['Space'])
    const r1 = new Rig(k, o)
    r1.at(27.78)
    r1.keys('Space')
    r1.run(1)
    console.log(k.padStart(8), f(b.t), f(b.d, 1), f(h.t), f(h.d, 1), f(r1.u * 3.6, 0), f(lockT(k, 0.01)), f(lockT(k, 16.7)), f(turnRate(k, 30), 0), f(turnRate(k, 60), 0))
  }
}
