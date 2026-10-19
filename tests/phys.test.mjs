// Round 2 physics (the phys workstream): the drivable classes' handling as numbers (physMetrics.mjs:
// 0-60, braking, lateral g, turn radius), steady at the limit and through dt spikes, a handbrake
// drift that can be held and caught, slopes, rain grip, walls (no tunnelling, no sticking), the
// player's car's toughness; and on foot: dt spikes, steps eased, stuck and out-of-world rescue, the
// camera's clip, and getting in and out of a car in a tight spot. npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CLASSES, zeroTo, brakeDist, maxLat, circle, spike } from './physMetrics.mjs'
import { createVehicleBody, stepVehicle, makeVehicleInput } from '../js/sim/vehicleSim.js'
import { roadGrip, setGripScale } from '../js/sim/roadGrip.js'
import { ENV } from '../js/sim/env.js'
import { PLAYER_TOUGH } from '../js/sim/drivable.js'
import * as P from '../js/sim/player.js'
import { FootRescue, outOfWorld } from '../js/sim/footRescue.js'
import * as B from '../js/sim/boarding.js'
import { clipShare } from '../js/render/footCam.js'

const H = 1 / 120
const OPEN = { x: -100, z: 300 }
const inp = o => Object.assign(makeVehicleInput(), o)
const run = (b, c, secs, world = null, each) => {
  for (let t = 0; t < secs; t += H) {
    stepVehicle(b, c, H, world)
    each?.(b)
  }
  return b
}

test('the classes feel distinct: pull-away, braking and cornering in order, all in sane ranges', () => {
  const t60 = Object.fromEntries(CLASSES.map(k => [k, zeroTo(k)]))
  const stop = Object.fromEntries(CLASSES.map(k => [k, brakeDist(k)]))
  const g = Object.fromEntries(CLASSES.map(k => [k, maxLat(k)]))
  assert.ok(t60.sports < 4.5 && t60.police < t60.sedan && t60.sedan < 8, JSON.stringify(t60))
  assert.ok(t60.truck < 25, `a truck gets to 60 mph in ${t60.truck.toFixed(1)} s`)
  assert.ok(zeroTo('bus', 13.9) < 12, 'a bus to 50 km/h')
  assert.ok(stop.sports < stop.police && stop.police < stop.sedan && stop.sedan < stop.suv)
  assert.ok(stop.suv < stop.van && stop.van < stop.truck && stop.truck < stop.bus)
  assert.ok(stop.sedan > 34 && stop.sedan < 42, `sedan from 100 km/h in ${stop.sedan.toFixed(1)} m`)
  assert.ok(g.sports > 0.95, `sports ${g.sports.toFixed(2)} g`)
  assert.ok(g.sports > g.police && g.police > g.sedan && g.sedan > g.suv && g.suv > g.van)
  assert.ok(g.van > g.bus && g.truck < 0.7 && g.bus > 0.45, JSON.stringify(g))
})

test('full lock at a steady speed holds a steady circle (no slow spin-out limit cycle)', () => {
  for (const k of ['sedan', 'sports', 'suv', 'police', 'van'])
    for (const v of [8, 14, 20]) {
      const c = circle(k, v, 1, 6)
      assert.ok(c.slip < 0.15, `${k} at ${v} m/s slips ${c.slip.toFixed(2)} rad`)
      assert.ok(c.r > 4 && c.r < 80, `${k} at ${v}: R ${c.r.toFixed(1)}`)
    }
  // (and the radius opens with speed: speed-sensitive steering and the tyres' limit)
  for (const k of CLASSES) assert.ok(circle(k, 20).r > 2 * circle(k, 8).r, k)
})

test('a dt spike leaves the body on its springs, within its travel', () => {
  for (const k of CLASSES) {
    const p = spike(k, 0.5)
    assert.ok(Number.isFinite(p) && p < 0.2, `${k}: pose ${p}`)
  }
  // (and a step of 0.25 s lands about where 30 steps of 1/120 s do)
  const a = createVehicleBody('sedan', OPEN),
    b = createVehicleBody('sedan', OPEN)
  a.vx = b.vx = 15
  stepVehicle(a, inp({ throttle: 0.5, steer: 0.3 }), 0.25)
  run(b, inp({ throttle: 0.5, steer: 0.3 }), 0.25 - 1e-9)
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.05)
})

test('a handbrake drift can be held on the throttle and caught: no spin-out', () => {
  for (const k of ['sports', 'sedan', 'police', 'suv', 'pickup'])
    for (const hold of [1, 0, -0.5]) {
      const b = createVehicleBody(k, OPEN)
      b.vx = 22
      run(b, inp({ handbrake: true, steer: 1 }), 0.4)
      let slid = 0
      run(b, inp({ throttle: 1, steer: hold }), 1.5, null, b => (slid += Math.abs(b.slip) > 0.2 ? H : 0))
      run(b, inp({ throttle: 0.5 }), 2)
      assert.ok(Math.abs(b.yaw) < 1.6 && b.u > 10, `${k} hold ${hold}: yaw ${b.yaw.toFixed(2)} u ${b.u.toFixed(1)}`)
      assert.ok(Math.abs(b.slip) < 0.05, `${k} caught`)
      if (k === 'sports') assert.ok(slid > 1, 'a sports car holds it a good while')
    }
})

test('a hill slows the climb and speeds the way down; the rain costs grip', () => {
  const coast = gp => {
    const b = createVehicleBody('sedan', OPEN)
    b.vx = 15
    b.gp = gp
    return run(b, inp({}), 2).u
  }
  assert.ok(coast(0.1) < coast(0) - 1.5 && coast(-0.1) > coast(0) + 1.5)
  const was = { wet: ENV.wet, rain: ENV.rain }
  ENV.wet = ENV.rain = 0
  assert.equal(roadGrip(), 1)
  ENV.wet = 1
  assert.ok(Math.abs(roadGrip() - 0.7) < 1e-9)
  setGripScale(0.5)
  assert.ok(roadGrip() < 0.5)
  setGripScale(1)
  Object.assign(ENV, was)
  const lat = grip => {
    const b = createVehicleBody('sedan', OPEN)
    b.vx = 20
    let g = 0
    run(b, inp({ steer: 1, throttle: 0.3 }), 4, { city: false, grip }, b => (g = Math.max(g, Math.abs(b.latAcc))))
    return g
  }
  assert.ok(lat(0.7) < 0.8 * lat(1))
})

test('walls: no tunnelling flat out, a glancing hit slides on, a car nosed in backs out', () => {
  const thin = { x0: 10, x1: 10.2, z0: -10, z1: 10, y0: 0, y1: 10, kind: 'building' }
  for (const v of [30, 60, 85]) {
    const b = createVehicleBody('sports', { x: 0, z: 0 })
    b.vx = v
    run(b, inp({ throttle: 1 }), 1, { city: false, solids: [thin] })
    assert.ok(b.x < 10, `${v} m/s: x ${b.x.toFixed(2)}`)
  }
  const wall = { x0: 10, x1: 14, z0: -80, z1: 80, y0: 0, y1: 10, kind: 'building' }
  const W = { city: false, solids: [wall] }
  const a = 1.31 // (15 degrees onto the wall)
  const g = createVehicleBody('sedan', { x: 0, z: 0, yaw: -a })
  g.vx = 20 * Math.cos(a)
  g.vz = 20 * Math.sin(a)
  run(g, inp({ throttle: 1 }), 2, W)
  assert.ok(Math.hypot(g.vx, g.vz) > 15 && g.x < 10, 'slid along it')
  const n = createVehicleBody('sedan', { x: 0, z: 0, yaw: 0.2 })
  n.tough = PLAYER_TOUGH
  run(n, inp({ throttle: 1 }), 3, W)
  const x = n.x
  run(n, inp({ brake: 1 }), 2, W)
  assert.ok(n.x < x - 1.5 && !n.dead, 'backed out')
})

test("the player's car takes a beating a traffic car can't: dented and slower, not wrecked", () => {
  const wall = { x0: 10, x1: 14, z0: -80, z1: 80, y0: 0, y1: 10, kind: 'building' }
  const hit = tough => {
    const b = createVehicleBody('sedan', { x: 0, z: 0 })
    b.tough = tough
    b.vx = 16 // (about 58 km/h, square on)
    run(b, inp({}), 1.5, { city: false, solids: [wall] })
    return b
  }
  const mine = hit(PLAYER_TOUGH),
    theirs = hit(1)
  assert.ok(theirs.dead, 'a traffic car is a wreck')
  assert.ok(!mine.dead && mine.dmg.harm > 0.2, `mine: harm ${mine.dmg.harm.toFixed(2)}`)
  assert.ok(mine.limp < 1 && mine.limp > 0.75, `mine keeps ${mine.limp.toFixed(2)} of its power`)
  assert.ok(Math.max(...mine.dmg.dents) > 0.1, 'visibly dented')
})

// ---------- on foot ----------
const box = { x0: 5, x1: 5.15, z0: -10, z1: 10, y0: 0, y1: 4, kind: 'building' }
const flat = (solids = [box], cars = []) => ({ solids: () => solids, base: () => 0, cars })
const fresh = () => {
  const p = structuredClone(P.player)
  p.mode = 'foot'
  P.placePlayer(0, 0, 0, 0, p)
  return p
}

test('on foot: a long frame does not walk through a thin wall; a step up is eased, not popped', () => {
  const p = fresh()
  const ctl = P.moveDir(0, 1, 0)
  ctl.run = true
  for (let i = 0; i < 6; i++) P.stepFoot(p, 0.5, ctl, flat())
  assert.ok(p.pos.x < 5, `x ${p.pos.x.toFixed(2)}`)
  const kerb = { x0: 1, x1: 9, z0: -10, z1: 10, y0: 0, y1: 0.3, kind: 'kerb' }
  const q = fresh()
  let lift = 0
  for (let t = 0; t < 1; t += H) {
    P.stepFoot(q, H, ctl, flat([kerb]))
    lift = Math.min(lift, q.lift)
  }
  assert.ok(Math.abs(q.pos.y - 0.3) < 1e-9, 'up on it')
  assert.ok(lift < -0.15 && Math.abs(q.lift) < 0.01, `eased (lowest ${lift.toFixed(2)})`)
})

test('stuck inside something, or out of the world: put back on a free spot', () => {
  const big = { x0: -2, x1: 2, z0: -2, z1: 2, y0: 0, y1: 5, kind: 'building' }
  const w = flat([big])
  const p = fresh()
  P.placePlayer(1.5, 0, 0, 0, p)
  const r = new FootRescue()
  let got = null
  for (let t = 0; t < 1.5 && !got; t += H) got = r.step(p, H, false, w)
  assert.ok(got && got.what === 'unstuck' && !P.blockedAt(p.pos.x, p.pos.z, p.pos.y, w), JSON.stringify(got))
  // (fallen through the ground, or a position gone bad)
  const q = fresh()
  q.pos.y = -30
  assert.ok(outOfWorld(q))
  q.pos.x = NaN
  assert.ok(outOfWorld(q))
  const back = new FootRescue().step(q, H, false)
  assert.ok(back && Number.isFinite(q.pos.x) && !outOfWorld(q), 'on a pavement')
  // (and pressing into a wall is not being stuck)
  const s = fresh()
  P.placePlayer(4.5, 0, 0, 0, s)
  const r2 = new FootRescue()
  const ctl = P.moveDir(0, 1, 0)
  for (let t = 0; t < 5; t += H) {
    P.stepFoot(s, H, ctl, flat())
    assert.equal(r2.step(s, H, true, flat()), null)
  }
})

test('the foot camera keeps out of a wall alongside, not just one behind', () => {
  const walls = [{ x0: -10, x1: 10, z0: 0.15, z1: 3, y0: 0, y1: 10 }]
  // (a clip like render/city.js's: the segment against the boxes)
  const clip = (a, p) => {
    const steps = 200
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        x = a.x + (p.x - a.x) * t,
        z = a.z + (p.z - a.z) * t
      if (walls.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1))
        return p.lerpVectors(a, p, Math.max(0.05, t - 0.05))
    }
  }
  const aim = new THREE.Vector3(0, 1.5, 0),
    pos = new THREE.Vector3(-4, 2, 0)
  const one = pos.clone()
  clip(aim, one)
  assert.equal(one.distanceTo(pos), 0, 'a single ray sees nothing')
  assert.ok(clipShare(clip, aim, pos) < 0.95, 'the fat ray does')
})

test('getting in and out hard up against a wall: the free side, then any free spot, then the roof', () => {
  const e = {
    id: 'x',
    kind: 'parked',
    pos: { x: 0, y: 0, z: 0 },
    heading: 0,
    len: 4.6,
    wid: 1.8,
    hgt: 1.45,
    door: { x: -0.3, z: -1.4 },
    seat: { x: -0.3, y: 0.5, z: -0.4 }
  }
  const left = { x0: -10, x1: 10, z0: -4, z1: -0.95, y0: 0, y1: 4, kind: 'building' }
  const w = flat([left])
  const p = fresh()
  P.placePlayer(-4, 3, 0, 0, p)
  const a = B.startEnter(e, 'open', p, () => 0.9, w)
  assert.equal(a.side, -1, 'by the far door')
  let t = 0
  while (!a.done && t < 20) {
    B.stepBoard(a, H, p, w)
    t += H
  }
  assert.ok(a.done && p.pos.z > 0.9, 'got in from the free side')
  const out = B.startExit(e, w)
  assert.ok(out.spot.z > 0.9 && !out.spot.roof, 'out on the free side')
  // boxed in on every side: up on the roof
  const all = [left, { ...left, z0: 0.95, z1: 4 }, { x0: 2.35, x1: 9, z0: -4, z1: 4, y0: 0, y1: 4 }, { x0: -9, x1: -2.35, z0: -4, z1: 4, y0: 0, y1: 4 }]
  const boxed = B.startExit(e, flat(all))
  assert.ok(boxed.spot.roof && boxed.spot.y > 1, 'on the roof')
})
