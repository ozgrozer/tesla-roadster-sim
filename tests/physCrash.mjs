// Vehicle-vehicle contact metrics (vehicleHit.js collideTraffic against traffic cars sliding loose:
// wrecks.js slide): momentum kept, how far they still overlap after the first touch, how many
// separate knocks one crash makes (jitter), the struck car's spin, a slow push. Used by
// phys.test.mjs; run directly for a table.
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'
import { collideTraffic, rectOf } from '../js/sim/vehicleHit.js'
import { rectRect } from '../js/sim/collide.js'
import { Traffic } from '../js/sim/traffic.js'
import { IDX } from '../js/sim/carTypes.js'
import { slide } from '../js/sim/wrecks.js'

const H = 1 / 120
// body of class kind at speed v heading +x into a parked traffic car of type ty, side on (side) or
// end on, offset dz across; throttle thr held
export function crash (kind, ty, v, { side = false, dz = 0, thr = 0, secs = 1.5, tv = 0 } = {}) {
  const tr = new Traffic({ count: 0 })
  const car = tr.make(IDX[ty] ?? 0)
  car.parked = tv === 0
  const yaw = side ? Math.PI / 2 : 0
  tr.setYaw(car, yaw)
  const reach = side ? car.wid / 2 : car.len / 2
  car.x = 30
  car.z = dz
  car.v = tv
  car.vx = car.hx * tv
  car.vz = car.hz * tv
  const b = createVehicleBody(kind, { x: 0, z: 0 })
  b.x = car.x - reach - b.len / 2 - 0.05 - v * 0.05
  b.vx = v
  const p0x = b.m * b.vx + car.m * car.vx
  const inp = Object.assign(makeVehicleInput(), { throttle: thr })
  let touches = 0,
    wasTouching = false,
    first = -1,
    over = 0,
    maxImpact = 0,
    spinMax = 0,
    after = null,
    t = 0
  for (; t < secs; t += H) {
    stepVehicle(b, inp, H)
    if (!car.loose) {
      car.x += car.vx * H
      car.z += car.vz * H
    }
    collideTraffic(b, tr)
    if (car.loose) slide(tr, car, H, null)
    const hit = rectRect(rectOf(b, {}), { x: car.x, z: car.z, fx: car.hx, fz: car.hz, hl: car.len / 2, hw: car.wid / 2 }, {})
    const ev = b.events.find(e => e.type === 'clash')
    if (ev) maxImpact = Math.max(maxImpact, ev.impact)
    const touching = !!ev
    if (touching && !wasTouching) touches++
    wasTouching = touching
    if (ev && first < 0) first = t
    if (first >= 0) spinMax = Math.max(spinMax, Math.abs(car.w))
    if (first >= 0 && after === null && t > first + 0.06) after = { vb: b.vx, vbz: b.vz, vcx: car.vx, vcz: car.vz, bw: b.w }
    if (hit && first >= 0 && t > first + 0.05) over = Math.max(over, hit.depth)
  }
  // (momentum just after the first touch: before the slide's friction takes it)
  const a = after || { vb: b.vx, vbz: b.vz, vcx: car.vx, vcz: car.vz, bw: b.w }
  return {
    // (just after the hit: the pair's momentum kept along x, and each one's speed)
    keep: (b.m * a.vb + car.m * a.vcx) / p0x,
    vb1: a.vb,
    vc1: Math.hypot(a.vcx, a.vcz),
    bw1: a.bw,
    spinMax,
    vb: b.vx,
    vc: Math.hypot(car.vx, car.vz),
    spin: Math.abs(car.w),
    over,
    touches,
    impact: maxImpact,
    pushed: car.x - 30,
    p0x,
    harmB: b.dmg?.harm || 0,
    harmC: car.dmg?.harm || 0,
    bw: b.w
  }
}
export function momentumKept (kind, ty, v) {
  // right after the hit (0.12 s): the pair's momentum along x against what it was
  const r = crash(kind, ty, v, { secs: 0.12 + v * 0.05 / v })
  return r
}
if (process.argv[1]?.endsWith('physCrash.mjs')) {
  const f = (x, n = 2) => x.toFixed(n)
  const rows = [
    ['sedan->sedan 15', crash('sedan', 'sedan', 15)],
    ['truck->sedan 15', crash('truck', 'sedan', 15)],
    ['sedan->truck 15', crash('sedan', 'truck', 15)],
    ['sedan->bus 15', crash('sedan', 'bus', 15)],
    ['sports->sedan side 15', crash('sports', 'sedan', 15, { side: true })],
    ['sedan->sedan offset 15', crash('sedan', 'sedan', 15, { dz: 1.2 })],
    ['sedan push 3 thr.6', crash('sedan', 'sedan', 3, { thr: 0.6, secs: 3 })],
    ['suv push 2 thr1', crash('suv', 'sedan', 2, { thr: 1, secs: 3 })],
    ['sedan rear-end 25 vs 12', crash('sedan', 'sedan', 25, { tv: 12 })]
  ]
  console.log('case                      keep  vB1   vC1  spinB spinC overlap touch impact pushed harmB harmC')
  for (const [n, r] of rows)
    console.log(n.padEnd(25), f(r.keep).padStart(5), f(r.vb1).padStart(5), f(r.vc1).padStart(5), f(Math.abs(r.bw1)).padStart(5), f(r.spinMax).padStart(5), f(r.over, 3).padStart(7), String(r.touches).padStart(5), f(r.impact, 1).padStart(6), f(r.pushed, 1).padStart(6), f(r.harmB).padStart(5), f(r.harmC).padStart(5))
}
