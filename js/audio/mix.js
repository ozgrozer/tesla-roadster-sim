// What the sound engine hears each frame, from where the camera is: the Roadster's drive state (the
// motors' force, worked out from the power the sim reports, its wheels and tyres), where the car is
// from the camera, the cars nearest the camera with their doppler and whether a building stands in
// the way, how busy the traffic is a few streets off either side, the walls either side and how
// near the sea is, the people close by, their footsteps and their screams; the one-shots the street
// makes are watched for in watch.js, and ears.js says how loud, where and how dull a thing sounds.
// Everything is written into objects kept from frame to frame, so a frame allocates nothing.
import * as THREE from 'three'
import { camera } from '../render/scene.js'
import { clamp } from '../sim/constants.js'
import { TYPES } from '../sim/traffic.js'
import { OUTER } from '../sim/city.js'
import { hearing, panOf, blocked, dullness, placeOf, ray } from './ears.js'
import { watch, forget, ALARM } from './watch.js'

export { hearing, panOf, dullness, placeOf }

const _right = new THREE.Vector3()

const FMAX = 2200 * 15 // N, the most the motors push (constants.js: mass x driveAccelMax)

// the camera's own velocity, for the doppler (it may ride with the car, or stand still)
const camVel = new THREE.Vector3(),
  camLast = new THREE.Vector3()
let camInit = false,
  cut = false
function trackCamera (dt) {
  const p = camera.position
  // (a jump of more than a few metres in a frame is a cut)
  cut = camInit && p.distanceTo(camLast) > 6
  if (camInit && dt > 0) {
    const k = Math.min(1, dt * 8)
    const vx = (p.x - camLast.x) / dt,
      vz = (p.z - camLast.z) / dt
    // (a cut is a jump, not a speed)
    if (Math.hypot(vx, vz) < 150) {
      camVel.x += (vx - camVel.x) * k
      camVel.z += (vz - camVel.z) * k
    }
  }
  camLast.copy(p)
  camInit = true
}

// the cars within earshot, nearest first: { key, d, pan, doppler, v, type, ev, occl }, from a pool
// (further off than RANGE, the far traffic's wash stands for them)
const N_CARS = 5,
  RANGE = 55
const pool = Array.from({ length: 24 }, () => ({
  key: null,
  d: 0,
  pan: 0,
  doppler: 1,
  v: 0,
  type: '',
  ev: false,
  loose: false,
  rev: false,
  acc: NaN,
  panic: false,
  back: 0,
  occl: 0
}))
const near = [],
  occl = new Map()
let rayAt = 0
const byDistance = (a, b) => a.d - b.d
const _fwd = new THREE.Vector3()
function nearCars (traffic, dt) {
  near.length = 0
  _fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate()
  const cp = camera.position
  let used = 0,
    worst = 0
  for (const c of traffic.cars) {
    // (parked cars are off, but the gridlock's are idling)
    if (c.parked && !c.jam) continue
    const dx = c.x - cp.x,
      dz = c.z - cp.z
    if (Math.abs(dx) > RANGE || Math.abs(dz) > RANGE) continue
    const d = Math.hypot(dx, dz)
    if (d > RANGE) continue
    // keep the nearest few: fill the pool, then replace the furthest
    let e
    if (used < pool.length) e = pool[used++]
    else {
      if (d >= near[worst].d) continue
      e = near[worst]
    }
    const vx = c.loose ? c.vx : c.hx * c.v,
      vz = c.loose ? c.vz : c.hz * c.v
    const l = d || 1,
      ux = dx / l,
      uz = dz / l
    // the source drawing away along the line between them, and the listener moving towards it
    const vs = vx * ux + vz * uz,
      vl = camVel.x * ux + camVel.z * uz
    e.key = c
    e.d = d
    e.pan = 0
    e.doppler = clamp((343 + vl) / (343 + vs), 0.75, 1.3)
    e.v = Math.hypot(vx, vz)
    e.type = TYPES[c.type]?.name || 'sedan'
    e.ev = !c.big && (c.paint * 3.7) % 1 < 0.3 // about a third of the cars are electric
    e.loose = !!c.loose
    e.rev = c.v < -0.1 // (backing up)
    e.acc = c.acc
    e.panic = c.panic > 0
    // behind the camera, a little duller (the head's shadow)
    e.back = clamp(-(dx * _fwd.x + dz * _fwd.z) / l, 0, 1)
    if (e !== near[worst]) near.push(e)
    worst = 0
    for (let i = 1; i < near.length; i++)
      if (near[i].d > near[worst].d) worst = i
  }
  near.sort(byDistance)
  // (five voices for the nearest, but past 35 m only while fewer than four cars are nearer)
  let close = 0
  while (close < near.length && near[close].d < 35) close++
  near.length = Math.min(near.length, N_CARS, Math.max(close, 4))
  // a building in the way: one or two rays a frame, round the nearest cars, eased in and out
  for (let i = 0; i < 1 && near.length; i++) {
    const e = near[rayAt++ % near.length]
    const o = occl.get(e.key) ?? { t: 0, v: 0 }
    o.t = blocked(e.key.x, e.key.z)
    occl.set(e.key, o)
  }
  for (const e of near) {
    e.pan = panOf(e.key.x, e.key.z)
    const o = occl.get(e.key)
    if (o) {
      o.v += (o.t - o.v) * Math.min(1, dt * 5)
      e.occl = o.v
    } else e.occl = 0
  }
  if (occl.size > 60) occl.clear()
  return near
}

// how busy the traffic is off to the left and right, 40 to 250 m away (0 to 1)
const WASH = { l: 0, r: 0 }
function wash (traffic) {
  _right.setFromMatrixColumn(camera.matrixWorld, 0)
  const cp = camera.position
  let l = 0,
    r = 0
  for (const c of traffic.cars) {
    const dx = c.x - cp.x,
      dz = c.z - cp.z,
      d = Math.hypot(dx, dz)
    if (d < 40 || d > 250) continue
    const w = (0.3 + Math.min(1, (c.v || 0) / 12)) / (1 + d / 60)
    if (dx * _right.x + dz * _right.z < 0) l += w
    else r += w
  }
  WASH.l = 1 - Math.exp(-l / 2.5)
  WASH.r = 1 - Math.exp(-r / 2.5)
}

// the people near the camera, and the footsteps of those walking close by (each half of their
// stride's cycle a step); people taking fright (peds.panic, how many are running scared, rising;
// peds.scream, how many just started to) scream, from where the fright was
const steps = Array.from({ length: 6 }, () => ({ k: 0, pan: 0 })),
  STEPS = []
const PI = Math.PI
const SCREAM = { n: 0, k: 0, pan: 0, lp: 20000 }
let panicWas = 0
function people (peds) {
  STEPS.length = 0
  const panic = peds?.panic || 0
  SCREAM.n = Math.min(3, Math.max(peds?.scream || 0, panic - panicWas))
  panicWas = panic
  if (SCREAM.n > 0) {
    const at = placeOf(peds.panicX || 0, peds.panicZ || 0)
    SCREAM.k = at.k
    SCREAM.pan = at.pan
    SCREAM.lp = at.lp
  }
  const cp = camera.position
  let crowd = 0
  for (const p of peds?.list || []) {
    const d = Math.hypot(p.x - cp.x, p.z - cp.z)
    if (d > 22) continue
    crowd += 1 / (1 + d / 6)
    const ph = Math.floor((p.phase || 0) / PI)
    if (
      d < 10 &&
      p.sndPh !== undefined &&
      ph !== p.sndPh &&
      STEPS.length < steps.length
    ) {
      const s = steps[STEPS.length]
      s.k = clamp(1.5 / (1 + d / 2), 0, 1) * clamp(p.gait ?? 1, 0.3, 1.6)
      s.pan = panOf(p.x, p.z)
      STEPS.push(s)
    }
    p.sndPh = ph
  }
  return clamp(crowd / 6, 0, 1)
}

// the nearest wall to the camera's left and right (m), along the line across its view
const WALL_RANGE = 70
const WALLS = { left: Infinity, right: Infinity }
function walls () {
  _right.setFromMatrixColumn(camera.matrixWorld, 0)
  const p = camera.position,
    l = Math.hypot(_right.x, _right.z) || 1
  for (let side = -1; side < 2; side += 2) {
    const x = p.x + ((side * _right.x) / l) * WALL_RANGE,
      z = p.z + ((side * _right.z) / l) * WALL_RANGE
    const t = ray(p.x, p.y, p.z, x, p.y, z)
    WALLS[side < 0 ? 'left' : 'right'] = t < 1 ? t * WALL_RANGE : Infinity
  }
  return WALLS
}

const ST = { cars: near, steps: STEPS }
let frame = 0,
  worldDt = 0,
  wallsAt = null,
  crowd = 0
const NONE = []
const _cp = new THREE.Vector3()
export function mixSound (sound, app, traffic, dt, clock, peds) {
  const sim = app.sim
  const ground = sim.mode === 'ground',
    ramp = sim.mode === 'ramp'
  const gs = ground ? Math.abs(sim.speed) : ramp ? Math.abs(sim.v) : 0
  app.wheelAudio =
    sim.mode === 'air' || sim.mode === 'crash'
      ? app.wheelAudio * Math.exp(-dt * 0.8)
      : gs
  const city = app.world === 'city'
  const on = city && sound.enabled
  trackCamera(dt)
  // (the world round the car is looked at every other frame, the slow things in it every fourth:
  // the far traffic, the walls either side)
  frame++
  const world = (frame & 1) === 0
  worldDt += dt
  // (back from a pause: what the watchers remembered is stale)
  if (on && sound.fresh) {
    sound.fresh = false
    forget(traffic)
    panicWas = peds?.panic || 0
    for (const p of peds?.list || NONE) p.sndPh = Math.floor((p.phase || 0) / Math.PI)
  }
  if (on && world) {
    watch(sound, app, traffic)
    if ((frame & 3) === 0) wash(traffic)
  }
  const w = on ? ((frame & 3) === 1 || !wallsAt ? (wallsAt = walls()) : wallsAt) : null
  // how shut in by walls the camera is, for the reverb
  const shut = w
    ? (clamp(1 - w.left / 45, 0, 1) + clamp(1 - w.right / 45, 0, 1)) / 2
    : 1
  const was = app.enclosed ?? 1
  app.enclosed = was + (shut - was) * clamp(dt * 2, 0, 1)
  const cp = camera.position,
    shore = OUTER + 3 - Math.max(Math.abs(cp.x), Math.abs(cp.z))
  const c = app.lastCtl,
    u = Math.max(gs, 0.5)
  // the motors' force: the power over the speed, or at a standstill what the throttle asks for
  const force =
    gs > 1.5
      ? (sim.drivePower || 0) / u
      : c.throttle * FMAX - (sim.regenOn ? 2860 : 0)
  const at = sim.mode === 'ground' || ramp ? sim.pos : sim.com
  _cp.copy(at)
  const st = ST
  st.volume = 0.85
  st.pitch = 0.55 + 0.45 * app.timeScale
  st.wheelSpeed = app.wheelAudio
  st.throttle = c.throttle
  st.force = sim.mode === 'ground' || ramp ? force : 0
  st.regen = sim.regenOn
  st.grounded = ground || ramp ? 1 : 0
  st.airspeed = sim.vel.length()
  st.skid = sim.skid
  st.skidF = sim.skidF ?? sim.skid
  st.skidR = sim.skidR ?? sim.skid
  st.slipR = sim.slipR || 0
  st.latG = (sim.latAcc || 0) / 9.81
  // how much of the tyres' grip the car is using cornering (braking and pulling count for less: the
  // electronics keep those just short of a squeal)
  st.use = ground
    ? Math.hypot(sim.latAcc || 0, 0.6 * (sim.accLong || 0)) /
      (9.81 * 1.26 * (sim.grip || 1))
    : 0
  st.yawRate = sim.yawRate || 0
  st.ebrake = !!sim.rearLocked && ground // (the rears locked by the handbrake)
  st.abs = ground ? sim.abs || 0 : 0 // (the ABS at work, 0 to 1)
  st.track = !!sim.track
  // (sim.rearSpin, 0 to 1, how much the driven rears spin past the road; about 10 m/s at full spin,
  // and in a burnout the sim says how fast)
  st.spin = ground
    ? Math.max((sim.rearSpin || 0) * 10, sim.burnSpin || 0)
    : 0
  st.burning = ground && !!sim.burning
  st.main = sim.thrMain
  st.lift = sim.thrLift
  st.side = sim.thrSide
  st.suction = sim.suction
  st.city = city
  st.inside = !!app.inside // the camera in the driver's seat
  st.carDist = cp.distanceTo(_cp)
  st.cut = cut
  st.carPan = panOf(_cp.x, _cp.z)
  st.camY = cp.y
  st.night = city && app.night
  st.honks = !traffic.quiet // (not until the Roadster has honked at the gridlock)
  st.cars = on ? (world ? nearCars(traffic, worldDt) : near) : NONE
  st.washL = WASH.l
  st.washR = WASH.r
  if (on && world) crowd = people(peds)
  else {
    // (between looks, no new footsteps or screams)
    STEPS.length = 0
    SCREAM.n = 0
  }
  st.peds = on ? crowd : 0
  st.screams = on ? SCREAM : null
  st.panic = on ? Math.min(1, (peds?.panic || 0) / 8) : 0
  st.steps = STEPS
  st.walls = w
  st.alarm = ALARM
  st.enclosed = app.enclosed
  st.sea = city ? clamp(1 - shore / 140, 0, 1) : 0
  st.surface = ground && city ? sim.surface : null
  st.dt = dt
  st.world = world
  st.worldDt = worldDt
  st.t = clock
  sound.update(st)
  if (world) worldDt = 0
}
