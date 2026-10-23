// The street furniture a car knocks flying (sim/knockables.js): every pavement prop has a collider
// that gives (tools/sim/propAudit.mjs prints the whole audit), a car at city speed goes through it
// losing little, a slow one is stopped by it, and people may still sit on the benches.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { Sim } from '../js/sim/sim.js'
import { Traffic } from '../js/sim/traffic.js'
import { makeControls } from '../js/sim/constants.js'
import { query, standUp } from '../js/sim/city.js'
import { snap } from '../js/sim/breakables.js'
import { KNOCKS, KNOCK_KINDS, layKnocks, knockCount } from '../js/sim/knockables.js'

layKnocks()
const H = 1 / 120

test('every pavement prop is knockable: 100 % of the types and the instances', () => {
  const by = knockCount()
  for (const kind of Object.keys(KNOCK_KINDS))
    assert.ok(Object.keys(by).some(k => k.startsWith(kind)), `${kind} laid out`)
  for (const [k, b] of Object.entries(by)) assert.equal(b.breakable, b.n, `${k}: ${b.breakable} / ${b.n}`)
  assert.ok(KNOCKS.length > 3000, `${KNOCKS.length} knockables`)
  const out = execFileSync(
    process.execPath,
    ['--import', './tools/node-loader/register.mjs', 'tools/sim/propAudit.mjs', '--json'],
    { encoding: 'utf8' }
  )
  const a = JSON.parse(out)
  assert.equal(a.full, a.types, `${a.full} / ${a.types} types breakable`)
  assert.equal(a.broke, a.n, `${a.broke} / ${a.n} pavement props breakable`)
})

// a run at the thing along (dx, dz), one of the axes, from back m off, nothing else solid on the way
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
function runAt (k, back = 10, hw = 1.2) {
  const c = k.c,
    x = (c.x0 + c.x1) / 2,
    z = (c.z0 + c.z1) / 2
  for (const [dx, dz] of DIRS) {
    const ex = dx > 0 ? c.x0 : dx < 0 ? c.x1 : x,
      ez = dz > 0 ? c.z0 : dz < 0 ? c.z1 : z
    const sx = ex - dx * back,
      sz = ez - dz * back
    const x0 = Math.min(sx, ex - dx * 0.05) - (dx ? 0 : hw),
      x1 = Math.max(sx, ex - dx * 0.05) + (dx ? 0 : hw),
      z0 = Math.min(sz, ez - dz * 0.05) - (dz ? 0 : hw),
      z1 = Math.max(sz, ez - dz * 0.05) + (dz ? 0 : hw)
    if (!query(x0, z0, x1, z1, []).some(o => o !== c && o.kind !== 'prop' && o.y0 < 1.5 && o.y1 > 0.1))
      return { x: ex - dx * 9, z: ez - dz * 9, dx, dz }
  }
  return null
}
function ram (run, speed, secs = 1.6) {
  const sim = new Sim()
  sim.reset('city', { x: run.x, z: run.z, yaw: Math.atan2(-run.dz, run.dx) })
  sim.vel.set(speed * run.dx, 0, speed * run.dz)
  sim.speed = speed
  sim.syncPose()
  const tr = new Traffic({ count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  let knock = null
  const knocks = []
  let before = speed,
    after = speed
  for (let i = 0; i < secs / H; i++) {
    const c = makeControls()
    c.fan = false
    const v = Math.hypot(sim.vel.x, sim.vel.z)
    sim.step(H, c)
    tr.step(H, sim)
    for (const e of sim.events) if (e.type === 'knock') knocks.push(e)
    const e = sim.events.find(e => e.type === 'knock')
    if (e && !knock) {
      knock = e
      before = v
      after = Math.hypot(sim.vel.x, sim.vel.z)
    }
    sim.events.length = 0
  }
  return { knock, knocks, before, after, sim }
}
const inTheClear = (kind, hw = 1.2) => {
  for (const k of KNOCKS) {
    if (k.kind !== kind || k.y > 0.5) continue
    const run = runAt(k, 10, hw)
    if (run) return { k, run }
  }
  return hw > 1 ? inTheClear(kind, 0.95) : null
}

test('a car at 40 km/h knocks each kind flying, losing a little speed (a shelter, more)', () => {
  for (const kind of Object.keys(KNOCK_KINDS)) {
    const it = inTheClear(kind)
    if (!it) {
      // (the alleys' bins and crates stand against the walls, out of a car's straight run: the hit
      // itself, as collide.js makes it)
      const k = KNOCKS.find(k => k.kind === kind)
      assert.ok(k, `a ${kind}`)
      const body = { vx: 11.1, vz: 0 },
        e = snap(body, k.c, -1, 0, 1600)
      assert.equal(e?.kind, 'prop', `${kind} knocked`)
      assert.ok(11.1 - body.vx < 1.6, `${kind}: 11.1 -> ${body.vx.toFixed(1)} m/s`)
      continue
    }
    const { k, run } = it
    standUp()
    const r = ram(run, 11.1)
    assert.equal(r.knock?.kind, 'prop', `${kind} knocked`)
    assert.ok(r.knocks.some(e => KNOCKS[e.i] === k), `${kind}: the one aimed at`)
    const lost = r.before - r.after
    assert.ok(lost < (kind === 'shelter' ? 6 : 1.6), `${kind}: ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} m/s`)
    assert.ok(Number.isFinite(r.knock.x) && Number.isFinite(r.knock.z), 'where it was')
  }
  standUp()
})

test('a car at walking pace is stopped by a hydrant; a shelter takes a real hit', () => {
  const h = inTheClear('hydrant')
  standUp()
  const slow = ram(h.run, 1.5, 9)
  assert.ok(!slow.knock, 'a nudge leaves it standing')
  assert.ok(slow.sim.pos.distanceTo({ x: h.k.x, y: slow.sim.pos.y, z: h.k.z }) > 1.5, 'and stops the car')
  const s = inTheClear('shelter')
  standUp()
  assert.ok(!ram(s.run, 3.5, 4).knock, 'a shelter stands a 13 km/h knock')
  standUp()
  const fast = ram(s.run, 11.1)
  assert.ok(fast.knocks.some(e => KNOCKS[e.i] === s.k), `and goes over at 40 (${fast.before.toFixed(1)} m/s)`)
  standUp()
})

test('benches and shelters are left to the people sitting in them', () => {
  for (const k of KNOCKS) if (k.kind === 'bench' || k.kind === 'shelter') assert.ok(k.c.walk, k.kind)
  assert.ok(!KNOCKS.some(k => k.kind === 'hydrant' && k.c.walk))
})
