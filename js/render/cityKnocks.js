// The pavements' street furniture, drawn so a car can knock it flying (sim/knockables.js lays it out
// and gives each a collider that breaks): the hydrants, bus benches and litter bins along the kerb,
// the newspaper boxes, parking meters and mailboxes, the promenade's benches and coin telescopes,
// the alleys' wheelie bins and crates, and the bus shelters. Each look is one instanced mesh a
// district (chunks.js Instances: streamed out with the rest of the small things), so what is hit
// only has its own matrix rewritten while it moves. Knocked loose, a thing is thrown on from the
// car's speed, tumbling, bounces and slides to rest on its side; a parking meter or a telescope is
// bent over at its foot, a shelter goes over backwards, its glass bursting. A hydrant knocked off
// its stand leaves a geyser of water on the corner for twenty seconds or so (smoke.js puffs, falling
// as water does). A fixed pool of movers and of geysers: nothing allocated while it plays.
import * as THREE from 'three'
import { KNOCKS } from '../sim/knockables.js'
import { Builder } from './builder.js'
import { Instances } from './chunks.js'
import { PIECES } from './cityKerb.js'
import { DRAW } from './cityExtras.js'
import { shelterAt } from './cityWorks.js'
import { smoke } from './smoke.js'
import { debrisBurst, burst } from './effects.js'

const GRAVITY = 9.81
// each look's centre of mass over its foot and half its thickness lying down (m), and for those
// that bend or go over, the radius of the foot they turn on
const SHAPE = {
  hydrant: { hc: 0.38, lie: 0.15 },
  bench: { hc: 0.45, lie: 0.3 },
  bin: { hc: 0.5, lie: 0.27 },
  news: { hc: 0.52, lie: 0.24 },
  meter: { hc: 0.75, lie: 0.07, foot: 0.05, rest: 1.45 },
  mailbox: { hc: 0.65, lie: 0.27 },
  scope: { hc: 0.8, lie: 0.1, foot: 0.08, rest: 1.4 },
  wheelie: { hc: 0.5, lie: 0.32 },
  crate: { hc: 0.45, lie: 0.45 },
  shelter: { hc: 1.3, lie: 0.8, foot: 0.9, rest: 1.5 }
}
// the hydrant's geyser: a column of water puffs, and the spray they make of the air round it
const JET = {
  col: [0.93, 0.97, 1],
  life: [1.3, 1.9],
  s0: 0.18,
  s1: [0.6, 1.3],
  alpha: 0.62,
  drag: 0.25,
  buoy: -GRAVITY,
  tau: 1000,
  turb: 0.25,
  spread: 0.9
}
const MIST = {
  col: [0.86, 0.9, 0.94],
  life: [1.2, 2.4],
  s0: 0.6,
  s1: [2.5, 4],
  alpha: 0.16,
  drag: 2,
  buoy: -0.3,
  tau: 2,
  turb: 0.9,
  spread: 0.6
}
const MOVERS = 48,
  GEYSERS = 6,
  GEYSER_S = 22 // s

// one geometry for every look (the first of its kind drawn at its own origin, yaw 0)
function lookGeo (k) {
  const B = new Builder()
  const at0 = { ...k.src, x: 0, z: 0, y: 0, yaw: 0 }
  if (k.kind === 'shelter') shelterAt(B, 0, 0, 0)
  else if (PIECES[k.kind] && !k.v) {
    const I = new THREE.Matrix4()
    for (const [g, c] of PIECES[k.kind]) B.add(g, I, c)
  } else DRAW[k.src.kind](B, at0)
  return B.geometry()
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _qy = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _o = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  UP = new THREE.Vector3(0, 1, 0),
  _vel = { x: 0, z: 0 },
  _at = { x: 0, y: 0, z: 0 }

export function buildKnocks (group) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.12
  })
  // the looks: each with its instances, and each knockable's look and place in it
  const looks = new Map()
  const lookOf = new Int16Array(KNOCKS.length),
    slot = new Int32Array(KNOCKS.length)
  const list = []
  KNOCKS.forEach((k, i) => {
    const key = k.kind + '|' + k.v
    if (!looks.has(key)) {
      looks.set(key, list.length)
      list.push({ key, first: k, items: [] })
    }
    const l = looks.get(key)
    lookOf[i] = l
    slot[i] = list[l].items.length
    list[l].items.push(i)
  })
  const base = (i, m) => {
    const k = KNOCKS[i]
    return m.compose(_p.set(k.x, k.y, k.z), _q.setFromAxisAngle(UP, k.yaw), _s)
  }
  const inst = list.map(l => {
    const I = new Instances(lookGeo(l.first), mat, l.items.length, j => KNOCKS[l.items[j]], {
      cast: l.first.kind === 'shelter',
      receive: true
    })
    l.items.forEach((i, j) => I.setMatrixAt(j, base(i, _m)))
    I.bounds()
    for (const m of I.meshes) {
      m.name = l.first.kind === 'shelter' ? 'bus shelters' : 'street props'
      group.add(m)
    }
    return I
  })

  // the movers: struct of arrays, each a knockable in the air or settling (item -1: free)
  const F = {}
  for (const f of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'ax', 'az', 'tilt', 'w', 'yaw', 'spin', 't'])
    F[f] = new Float32Array(MOVERS)
  const item = new Int32Array(MOVERS).fill(-1),
    hinge = new Uint8Array(MOVERS)
  const geyser = { x: new Float32Array(GEYSERS), z: new Float32Array(GEYSERS), t: new Float32Array(GEYSERS), acc: new Float32Array(GEYSERS) }
  let next = 0,
    nextJet = 0,
    active = 0
  const down = [] // every knockable knocked since the city last stood up

  function place (j) {
    const i = item[j],
      k = KNOCKS[i],
      sh = SHAPE[k.kind]
    _a.set(F.ax[j], 0, F.az[j])
    _q.setFromAxisAngle(_a, F.tilt[j])
    _qy.setFromAxisAngle(UP, F.yaw[j])
    if (hinge[j]) {
      // about its foot: the foot's edge kept on the ground as it goes over
      _p.set(k.x, k.y + sh.foot * Math.abs(Math.sin(F.tilt[j])), k.z)
    } else {
      // about its middle, hc over the foot
      _o.set(0, -sh.hc, 0).applyQuaternion(_q)
      _p.set(F.px[j] + _o.x, F.py[j] + _o.y, F.pz[j] + _o.z)
    }
    _q.multiply(_qy)
    _m.compose(_p, _q, _s)
    inst[lookOf[i]].setMatrixAt(slot[i], _m)
  }
  function stop (j, settled) {
    const i = item[j]
    if (settled) inst[lookOf[i]].refit(slot[i])
    item[j] = -1
    active--
  }
  // the nearest angle it would lie still at: on its side, or (a tumble that came round) upright
  const restOf = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2)

  function knock (e) {
    const k = KNOCKS[e.i]
    if (!k) return
    down.push(e.i)
    const sh = SHAPE[k.kind]
    // (the pool full: the oldest left where it is)
    if (item[next] >= 0) stop(next, true)
    const j = next
    next = (next + 1) % MOVERS
    active++
    item[j] = e.i
    const s = Math.max(e.speed || 0, e.impact * 0.5),
      dx = e.dx || 1,
      dz = e.dz || 0
    hinge[j] = k.mode === 'tip' || (k.mode === 'bend' && e.impact < 9) ? 1 : 0
    F.ax[j] = dz
    F.az[j] = -dx
    F.tilt[j] = 0
    F.yaw[j] = k.yaw
    F.t[j] = 0
    if (hinge[j]) {
      F.w[j] = k.mode === 'tip' ? 0.6 + e.impact * 0.08 : 1.5 + e.impact * 0.3
      F.spin[j] = 0
    } else {
      const side = (Math.random() - 0.5) * 0.5 * s
      F.px[j] = k.x
      F.py[j] = k.y + sh.hc
      F.pz[j] = k.z
      F.vx[j] = dx * s * (1.05 + Math.random() * 0.3) - dz * side
      F.vz[j] = dz * s * (1.05 + Math.random() * 0.3) + dx * side
      F.vy[j] = Math.min(7, 1.2 + s * (0.15 + Math.random() * 0.15))
      F.w[j] = (Math.random() < 0.7 ? -1 : 1) * (3 + s * (0.4 + Math.random() * 0.4))
      F.spin[j] = (Math.random() - 0.5) * 6
    }
    // the knock's own debris: the shelter's glass, splinters and grit off the rest
    _at.x = k.x
    _at.y = k.kind === 'shelter' ? 1.4 : 0.5
    _at.z = k.z
    _vel.x = dx * s
    _vel.z = dz * s
    if (k.kind === 'shelter') debrisBurst(_at, 16, _vel, 0, 0.9)
    else debrisBurst(_at, Math.min(6, e.impact * 0.5), _vel, 0, k.kind === 'news' ? 0.3 : 0)
    if (sh && k.kind === 'hydrant') {
      const g = nextJet
      nextJet = (nextJet + 1) % GEYSERS
      geyser.x[g] = k.x
      geyser.z[g] = k.z
      geyser.t[g] = GEYSER_S
      geyser.acc[g] = 0
      burst(k.x, k.z, 6, 3, 0, 0.5)
    }
  }

  function move (j, dt) {
    const i = item[j],
      k = KNOCKS[i],
      sh = SHAPE[k.kind]
    F.t[j] += dt
    if (hinge[j]) {
      // over at its foot, faster as it goes (its weight past the foot), a small bounce at the end
      F.w[j] += 7 * Math.sin(Math.max(0.05, F.tilt[j])) * dt
      F.tilt[j] += F.w[j] * dt
      if (F.tilt[j] >= sh.rest) {
        F.tilt[j] = sh.rest
        if (F.w[j] > 1.2) F.w[j] *= -0.25
        else {
          place(j)
          if (k.kind === 'shelter') obj.onLand?.(k.x + F.az[j] * -1.5, k.z + F.ax[j] * 1.5, obj)
          return stop(j, true)
        }
      }
      return place(j)
    }
    F.vy[j] -= GRAVITY * dt
    F.px[j] += F.vx[j] * dt
    F.py[j] += F.vy[j] * dt
    F.pz[j] += F.vz[j] * dt
    F.tilt[j] += F.w[j] * dt
    F.yaw[j] += F.spin[j] * dt
    const sn = Math.abs(Math.sin(F.tilt[j])),
      floor = k.y + sh.hc + (sh.lie - sh.hc) * sn
    if (F.py[j] <= floor) {
      F.py[j] = floor
      if (F.vy[j] < -1.5) {
        // a bounce, the spin knocked out of it
        F.vy[j] *= -0.3
        F.w[j] *= 0.55
        F.spin[j] *= 0.6
      } else {
        F.vy[j] = 0
        // sliding: friction on the pavement, and it rolls on to lie still
        const v = Math.hypot(F.vx[j], F.vz[j]),
          f = v > 1e-3 ? Math.max(0, v - 6 * dt) / v : 0
        F.vx[j] *= f
        F.vz[j] *= f
        F.spin[j] *= Math.exp(-5 * dt)
        const to = restOf(F.tilt[j])
        F.w[j] += ((to - F.tilt[j]) * 40 - F.w[j] * 9) * dt
        if (v < 0.05 && Math.abs(F.w[j]) < 0.08 && Math.abs(to - F.tilt[j]) < 0.03) {
          F.tilt[j] = to
          F.py[j] = k.y + sh.hc + (sh.lie - sh.hc) * Math.abs(Math.sin(to))
          place(j)
          return stop(j, true)
        }
      }
    }
    // (given up on after 8 s: wherever it is)
    if (F.t[j] > 8) {
      place(j)
      return stop(j, true)
    }
    place(j)
  }

  function spray (dt) {
    for (let g = 0; g < GEYSERS; g++) {
      if (geyser.t[g] <= 0) continue
      geyser.t[g] -= dt
      const left = geyser.t[g],
        k = Math.min(1, left / 4) // (dying down at the end)
      geyser.acc[g] += 100 * k * dt
      while (geyser.acc[g] >= 1) {
        geyser.acc[g] -= 1
        const x = geyser.x[g],
          z = geyser.z[g],
          a = Math.random() * Math.PI * 2,
          r = Math.random() * 1.1
        smoke.spawn(JET, x + Math.cos(a) * 0.05, 0.35, z + Math.sin(a) * 0.05, Math.cos(a) * r, (8.5 + Math.random() * 3.5) * (0.5 + 0.5 * k), Math.sin(a) * r, 0, 1)
        if (Math.random() < 0.18)
          smoke.spawn(MIST, x + Math.cos(a) * 1.2, 0.3, z + Math.sin(a) * 1.2, Math.cos(a) * 1.5, 0.4, Math.sin(a) * 1.5, 0, 1)
      }
    }
  }

  const obj = {
    kind: 'prop',
    moving: [], // (nothing here that casts a shadow while it moves but a shelter: city.js's refresh)
    onLand: null,
    get active () {
      return active
    },
    get spraying () {
      let n = 0
      for (let g = 0; g < GEYSERS; g++) if (geyser.t[g] > 0) n++
      return n
    },
    knock,
    update (dt) {
      if (active) for (let j = 0; j < MOVERS; j++) if (item[j] >= 0) move(j, dt)
      spray(dt)
    },
    standUp () {
      for (let j = 0; j < MOVERS; j++) item[j] = -1
      active = 0
      geyser.t.fill(0)
      for (const i of down) {
        inst[lookOf[i]].setMatrixAt(slot[i], base(i, _m))
        inst[lookOf[i]].refit(slot[i])
      }
      down.length = 0
    },
    // (for the probes: the knockables, how many looks and instances it draws)
    list: KNOCKS,
    looks: list.length,
    count: KNOCKS.length
  }
  return obj
}
