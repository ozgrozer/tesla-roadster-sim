// How often a person on the pavement gets hit when the Roadster is driven at them, in Node: in each
// of several scenes, people a little way off are picked one at a time, and the car is put 24 m back
// and driven straight at them at 40 or 70 km/h, the player's aim kept on them all the way: along
// the pavement, or from the road over the kerb at a shallow angle (K22). Prints the hit rate.
// node --import ./tools/node-loader/register.mjs tools/sim/pedHits.mjs [--json] [perScene]
import { Sim } from '../../js/sim/sim.js'
import { Traffic } from '../../js/sim/traffic.js'
import { Peds } from '../../js/sim/peds.js'
import { makeControls } from '../../js/sim/constants.js'
import { ROADS, LANE_OFF, query } from '../../js/sim/city.js'
import { kerbDist } from '../../js/sim/street.js'
import { ENV } from '../../js/sim/env.js'
import { layKnocks } from '../../js/sim/knockables.js'

// (--before: the street furniture as it was before v6, hydrants, benches and the like solid)
if (!process.argv.includes('--before')) layKnocks()

const H = 1 / 120
// (--straight: aimed at where they stood, then held straight: what they do about it shows)
const STRAIGHT = process.argv.includes('--straight')
const PER = Number(process.argv.find(a => /^\d+$/.test(a))) || 4
ENV.hour = 13
// mid-block on streets about the city: downtown, Mid-City, the west side, the south
const SCENES = [
  ['downtown', { x: ROADS[6] + 70, z: ROADS[5] + LANE_OFF[1], yaw: 0 }],
  ['midcity', { x: ROADS[3] + 70, z: ROADS[4] - LANE_OFF[1], yaw: Math.PI }],
  ['westside', { x: ROADS[1] + LANE_OFF[1], z: ROADS[3] + 70, yaw: Math.PI / 2 }],
  ['south', { x: ROADS[7] + 70, z: ROADS[8] + LANE_OFF[1], yaw: 0 }],
  ['east', { x: ROADS[8] - LANE_OFF[1], z: ROADS[6] + 70, yaw: -Math.PI / 2 }],
  ['hollywood', { x: ROADS[4] + 70, z: ROADS[2] + LANE_OFF[1], yaw: 0 }]
]
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
const P = {}
// nothing that stops a car at v m/s (a building, a wall, a palm too stout to snap: not what it
// knocks down) on the way from a to b
const open = (ax, az, bx, bz, v) => {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2)
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n,
      z = az + ((bz - az) * i) / n
    if (query(x - 1.2, z - 1.2, x + 1.2, z + 1.2, []).some(c => !(c.breakAt < v - 1) && c.y0 < 1 && c.y1 > 0.2)) return false
  }
  return true
}
const lookAt = (x, z) => {
  const L = query(x - 0.6, z - 0.6, x + 0.6, z + 0.6, []).filter(c => !c.breakAt || c.r)
  return L.map(c => c.look || c.kind).join('+') + '@' + kerbDist(x, z).toFixed(1)
}
function setup (at) {
  const sim = new Sim()
  sim.reset('city', at)
  const tr = new Traffic({ seed: 3, count: 0 })
  tr.reset(sim.pos.x, sim.pos.z)
  const peds = new Peds({ seed: 7 })
  peds.reset(sim.pos.x, sim.pos.z)
  const log = []
  const step = c => {
    sim.step(H, c)
    for (const e of sim.events)
      if (e.type === 'bump' || e.type === 'knock') log.push(`${e.type}:${e.what || e.kind || ''}${e.type === 'bump' ? '/' + lookAt(e.px, e.pz) : ''}:${(e.impact || e.v || 0).toFixed?.(1)}`)
    const view = { x: sim.pos.x, z: sim.pos.z, fx: Math.cos(sim.yaw), fz: -Math.sin(sim.yaw) }
    peds.step(H, sim, tr, view)
    tr.step(H, sim, view)
    sim.events.length = 0
  }
  for (let i = 0; i < 3 / H; i++) step(Object.assign(makeControls(), { brake: 1, fan: false }))
  return { sim, tr, peds, step, log }
}
// the people who could be aimed at from here: on the pavement, walking or standing, 15 to 60 m off
function candidates (w) {
  const out = []
  for (const p of w.peds.list) {
    const d = Math.hypot(p.x - w.sim.pos.x, p.z - w.sim.pos.z)
    if (d < 15 || d > 60 || p.lod > 1 || p.dog) continue
    if (!['walk', 'idle', 'linger'].includes(p.state) || kerbDist(p.x, p.z) > -0.9) continue
    out.push(p.i)
  }
  return out
}
function trial (at, pick, kmh, how) {
  const w = setup(at)
  const p = w.peds.list.find(q => q.i === pick)
  if (!p || p.state === 'down') return null
  w.peds.at(p, P)
  const hx = P.hx,
    hz = P.hz
  // back along the pavement, or back and out into the road (the far lane)
  let sx = p.x - hx * 24,
    sz = p.z - hz * 24
  if (how === 'kerb') {
    const out = 4.5 - kerbDist(p.x, p.z) // (to the outer lane)
    sx += hz * out
    sz -= hx * out
    if (kerbDist(sx, sz) < 0.5) {
      sx -= 2 * hz * out
      sz += 2 * hx * out
    }
    if (kerbDist(sx, sz) < 0.5) return null
  } else if (kerbDist(sx, sz) > -0.9) return null
  const v = kmh / 3.6
  if (!open(sx, sz, p.x, p.z, v)) return null
  w.sim.reset('city', { x: sx, z: sz, yaw: Math.atan2(-(p.z - sz), p.x - sx) })
  w.sim.vel.set(v * Math.cos(w.sim.yaw), 0, -v * Math.sin(w.sim.yaw))
  w.sim.speed = v
  w.sim.syncPose()
  w.log.length = 0
  let minV = v,
    seen = new Set(),
    passed = 0
  for (let i = 0; i < 4.5 / H; i++) {
    const c = makeControls()
    c.fan = false
    const s = w.sim,
      dx = p.x - s.pos.x,
      dz = p.z - s.pos.z
    const err = wrap(Math.atan2(-dz, dx) - s.yaw)
    const ahead = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw)
    // (aim kept on them until they are beside the car)
    if (ahead > 2 && !STRAIGHT) c.steer = Math.max(-1, Math.min(1, err * 2.5))
    const sp = Math.hypot(s.vel.x, s.vel.z)
    c.throttle = sp < v ? Math.min(1, (v - sp) * 0.6 + 0.2) : 0
    w.step(c)
    minV = Math.min(minV, Math.hypot(s.vel.x, s.vel.z))
    seen.add(p.state)
    if (p.state === 'down') return { hit: true, v: Math.hypot(s.vel.x, s.vel.z), minV, states: [...seen], dead: p.dead }
    if (ahead < -6 && ++passed > 30) break
  }
  return { hit: false, blocked: w.log.some(l => l.startsWith('bump') && +l.split(':').pop() > 3), minV, states: [...seen], at: kerbDist(p.x, p.z), log: w.log.slice(0, 4) }
}

const rows = []
for (const [name, at] of SCENES) {
  const cands = candidates(setup(at))
  for (const kmh of [40, 70])
    for (const how of ['along', 'kerb']) {
      let n = 0
      for (const pick of cands) {
        if (n >= PER) break
        const r = trial(at, pick, kmh, how)
        if (!r) continue
        n++
        rows.push({ scene: name, kmh, how, ped: pick, ...r })
      }
    }
}
const sum = f => {
  const R = rows.filter(f)
  return { n: R.length, hit: R.filter(r => r.hit).length, rate: R.length ? +(R.filter(r => r.hit).length / R.length).toFixed(2) : 0 }
}
const report = {
  all: sum(() => true),
  kmh40: sum(r => r.kmh === 40),
  kmh70: sum(r => r.kmh === 70),
  along: sum(r => r.how === 'along'),
  kerb: sum(r => r.how === 'kerb'),
  clear: sum(r => !r.blocked),
  blocked: rows.filter(r => r.blocked).length,
  dodged: rows.filter(r => !r.hit && r.states.includes('dodge')).length,
  fled: rows.filter(r => !r.hit && r.states.includes('flee')).length,
  kerbSpeed: +(rows.filter(r => r.how === 'kerb').reduce((s, r) => s + r.minV / (r.kmh / 3.6), 0) / Math.max(1, rows.filter(r => r.how === 'kerb').length)).toFixed(2)
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ report, rows }))
else {
  for (const r of rows) console.log(`${r.scene.padEnd(10)} ${r.kmh} ${r.how.padEnd(5)} ped ${String(r.ped).padEnd(4)} ${r.hit ? 'HIT ' + (r.v * 3.6).toFixed(0) + ' km/h' : r.blocked ? 'blocked' : 'miss'} min ${(r.minV * 3.6).toFixed(0)} km/h  ${r.states.join(',')} ${r.log ? r.log.join(' ') : ''}`)
  console.log(JSON.stringify(report))
}
