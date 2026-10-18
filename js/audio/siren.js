// The siren of a police car on a call (sim/calls.js), heard where the car is: a horn speaker's
// harsh tone swept by its electronic driver, the wail (a slow rise and a slower fall, about four
// seconds a cycle) on the open road and the yelp (the same sweep, quick) at junctions, going by
// close and when it is held up, and a whoop (a quick swoop up and down) at the Roadster sitting in
// its way. It is placed like the traffic's voices (cars.js): the doppler of its speed against the
// camera's, louder the nearer it is and audible across a few blocks, duller with the distance, and
// muffled when a building stands in the way. hearSiren (from watch.js, on the mix's world frames in
// the city) works out where it is heard; sirenVoice (from ambience.js) plays it, made the first
// time a siren is heard, silent and resting otherwise.
import { clamp } from '../sim/constants.js'
import { wave } from './buffers.js'
import { camera } from '../render/scene.js'
import { panOf, blocked } from './ears.js'

const WAIL = { f: 1080, depth: 470, rate: 0.24 } // Hz round its middle, and sweeps a second
const YELP = { f: 1080, depth: 440, rate: 3.4 }
const LOUD = 0.13 // its level close by
// a horn speaker's tone: strong odd harmonics, a little of the even (the horn's own distortion)
// prettier-ignore
const TONE = { 1: 1, 2: 0.22, 3: 0.55, 4: 0.1, 5: 0.34, 7: 0.2, 9: 0.12, 11: 0.07 }
// what the camera hears of it (SIREN.on false: no siren about); near: one heard just now, so the
// siren drifting across town (ambience.js) keeps quiet
export const SIREN = {
  on: false,
  k: 0,
  pan: 0,
  lp: 20000,
  dop: 1,
  occl: 0,
  mode: 0,
  whoops: 0,
  near: 0,
  at: 0
}
let lastX = 0,
  lastZ = 0,
  lastT = -1,
  camVx = 0,
  camVz = 0,
  rayT = 0

// From the traffic (on the mix's world frames): where its siren is heard from the camera. now: the
// sound's clock (s)
export function hearSiren (traffic, now) {
  const p = camera.position,
    dt = lastT < 0 ? 0 : now - lastT
  // the camera's own velocity, for the doppler (a jump is a cut, not a speed)
  if (dt > 0) {
    const vx = (p.x - lastX) / dt,
      vz = (p.z - lastZ) / dt
    if (vx * vx + vz * vz < 150 * 150) {
      const k = Math.min(1, dt * 8)
      camVx += (vx - camVx) * k
      camVz += (vz - camVz) * k
    }
  }
  lastX = p.x
  lastZ = p.z
  lastT = now
  const C = traffic.call,
    car = C?.on ? C.car : null
  SIREN.on = !!car
  SIREN.at = now
  if (!car) return
  const dx = car.x - p.x,
    dz = car.z - p.z,
    d = Math.hypot(dx, dz) || 1
  // (the source drawing away along the line between them, the listener coming towards it)
  const vs = ((car.hx * dx + car.hz * dz) / d) * car.v,
    vl = (camVx * dx + camVz * dz) / d
  SIREN.dop = clamp((343 + vl) / (343 + vs), 0.8, 1.25)
  SIREN.k = clamp(1.2 / (1 + d / 28), 0, 1)
  SIREN.pan = panOf(car.x, car.z)
  // a building in the way (looked at a few times a second, eased)
  if (now - rayT > 0.15) {
    rayT = now
    SIREN.occl += (blocked(car.x, car.z, 1.9) - SIREN.occl) * 0.5
  }
  SIREN.lp =
    clamp(20000 * Math.exp(-d / 170), 1600, 20000) * (1 - 0.7 * SIREN.occl)
  SIREN.mode = C.mode
  SIREN.whoops = C.whoops
  if (SIREN.k > 0.05) SIREN.near = now
}

// The voice, on the sound engine (sound): its nodes made the first time it is needed
function build (s) {
  const { ctx, gain, filt, osc } = s,
    n = s.n
  const o = osc('sine', WAIL.f)
  o.setPeriodicWave(wave(ctx, TONE))
  // its electronic driver: a rise and a slower fall (the wail; the yelp is the same, quicker)
  const lfo = osc('sine', WAIL.rate)
  lfo.setPeriodicWave(sweep(ctx, 0.42))
  const depth = gain(WAIL.depth)
  lfo.connect(depth).connect(o.frequency)
  // the horn's response, its level, the gate the whoops come through, the air, which side
  const horn = filt('peaking', 1500, 0.9)
  horn.gain.value = 6
  const top = filt('lowpass', 5200, 0.7),
    gate = gain(1),
    out = gain(0),
    air = filt('lowpass', 20000, 0.5),
    pan = ctx.createStereoPanner(),
    send = gain(0.3)
  o.connect(horn).connect(top).connect(gate).connect(out).connect(air)
  air.connect(pan)
  pan.connect(send)
  s.lane([out.gain], pan, s.world, send, s.verb)
  n.siren = { o, lfo, depth, gate, out, air, pan, send, whoops: 0, busy: 0 }
  return n.siren
}
// a shape's periodic wave: a rise over `up` of the cycle, then the fall
function sweep (ctx, up) {
  const N = 256,
    K = 16,
    re = new Float32Array(K),
    im = new Float32Array(K)
  for (let i = 0; i < N; i++) {
    const u = i / N,
      y = u < up ? -1 + (2 * u) / up : 1 - (2 * (u - up)) / (1 - up),
      a = 2 * Math.PI * u
    for (let k = 1; k < K; k++) {
      re[k] += (y * Math.cos(k * a) * 2) / N
      im[k] += (y * Math.sin(k * a) * 2) / N
    }
  }
  return ctx.createPeriodicWave(re, im)
}

// Each of the mix's world frames (ambience.js): the siren as heard just now, or silence
export function sirenVoice (s, city) {
  const n = s.n,
    R = s.R,
    now = s.now
  const on = city && SIREN.on && now - SIREN.at < 0.5
  let v = n.siren
  if (!v) {
    if (!on) return
    v = build(s)
    v.whoops = SIREN.whoops
  }
  R(v.out.gain, on ? LOUD * SIREN.k * (1 - 0.45 * SIREN.occl) : 0, 0.12)
  if (!on) return
  const d = SIREN.dop,
    M = SIREN.mode ? YELP : WAIL
  R(v.air.frequency, SIREN.lp, 0.1)
  R(v.pan.pan, SIREN.pan, 0.08)
  R(v.send.gain, clamp(0.2 + (1 - SIREN.k) * 0.6, 0, 0.8), 0.3)
  // a whoop at the Roadster in its way: the sweep set aside, a quick swoop up and down instead
  if (SIREN.whoops !== v.whoops) {
    v.whoops = SIREN.whoops
    if (s.playing()) whoop(s, v, d)
  }
  if (now < v.busy) return
  R(v.o.frequency, M.f * d, 0.05)
  R(v.depth.gain, M.depth * d, 0.08)
  R(v.lfo.frequency, M.rate, 0.15)
}
function whoop (s, v, d) {
  const t = s.ctx.currentTime + 0.02,
    f = v.o.frequency,
    g = v.gate.gain
  for (const p of [f, v.depth.gain, g]) {
    p.cancelScheduledValues(t)
    p.__to = NaN // (set again from scratch after it)
  }
  v.depth.gain.setTargetAtTime(0, t, 0.01)
  f.setValueAtTime(520 * d, t)
  f.exponentialRampToValueAtTime(1550 * d, t + 0.24)
  f.exponentialRampToValueAtTime(760 * d, t + 0.46)
  g.setValueAtTime(1, t)
  g.setTargetAtTime(0.0001, t + 0.44, 0.03)
  g.setTargetAtTime(1, t + 0.6, 0.02)
  v.busy = s.now + 0.65
}
