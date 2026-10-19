// Who each person on foot is (peds.js), by the neighbourhood and the hour: a commuter (brisk, on
// the phone now and then, impatient at the kerb), a jogger, a tourist (slow, stops to look about,
// never jaywalks, gathers where there is something to see), someone glued to their phone (slow to
// see a car coming, stops to type), a loiterer (hangs about, talks, jaywalks, watches trouble
// rather than running from it) and a worker (the docks' and warehouses' hi-vis crowd, on a break by
// the kerb). Downtown's and Century City's pavements are commuters' at the rush, the boulevards'
// and the beach's tourists', the industrial east's and the port's workers', the suburbs' joggers'
// and dog walkers'; late at night, fewer tourists and joggers and more loiterers. The profile is
// drawn from who they are (p.i, p.look), not from the people's random numbers, so the crowd's own
// sequence is untouched. Pure data and maths: no DOM.
import { ENV } from '../env.js'

export const PROFILES = ['commuter', 'jogger', 'tourist', 'phone', 'loiterer', 'worker']
export const PROF = Object.fromEntries(PROFILES.map((k, i) => [k, i]))
// pace (m/s range), idle (how often they stop, against the usual), idleLen (how long), phone (the
// share of stops on the phone), jay (jaywalking, against the usual), linger (gathering at a
// sight), alert (how soon they see a car: lower is later), cower (the share who freeze rather than
// run from trouble close by), call (the share who ring the police when they see a crime), watch
// (keep watching trouble from a distance)
export const TRAITS = [
  { pace: [1.35, 1.7], idle: 0.5, idleLen: 0.6, phone: 0.7, jay: 1.4, linger: 0.3, alert: 1, cower: 0.15, call: 0.6, watch: 0.1 },
  { pace: [2.5, 3.3], idle: 0, idleLen: 0.3, phone: 0, jay: 0.5, linger: 0, alert: 1.2, cower: 0.05, call: 0.2, watch: 0 },
  { pace: [0.8, 1.1], idle: 2.6, idleLen: 1.2, phone: 0.15, jay: 0, linger: 2.5, alert: 0.85, cower: 0.55, call: 0.35, watch: 0.4 },
  { pace: [0.9, 1.2], idle: 1.8, idleLen: 1, phone: 1, jay: 0.7, linger: 0.6, alert: 0.6, cower: 0.45, call: 0.9, watch: 0.2 },
  { pace: [0.75, 1.0], idle: 3.5, idleLen: 2, phone: 0.3, jay: 2.4, linger: 1.5, alert: 1, cower: 0.1, call: 0.1, watch: 0.8 },
  { pace: [1.15, 1.4], idle: 1.2, idleLen: 1.4, phone: 0.25, jay: 1.6, linger: 0.4, alert: 1.1, cower: 0.15, call: 0.5, watch: 0.5 }
]
// the mix by the neighbourhood's kind (areas.js), commuter jogger tourist phone loiterer worker
// prettier-ignore
const MIX = {
  downtown: [45, 4, 10, 25, 10, 6],
  towers: [50, 4, 8, 28, 4, 6],
  boulevard: [15, 6, 38, 20, 16, 5],
  beach: [10, 18, 40, 15, 12, 5],
  venice: [10, 15, 30, 15, 25, 5],
  strip: [30, 8, 6, 26, 20, 10],
  estates: [15, 35, 10, 20, 5, 15],
  suburb: [25, 25, 3, 22, 15, 10],
  industrial: [18, 2, 2, 10, 14, 54],
  port: [12, 2, 4, 8, 10, 64],
  stadium: [20, 8, 25, 25, 15, 7]
}
const DEFAULT = [30, 8, 10, 25, 17, 10]

// the mix at hour h in a neighbourhood of this kind (weights, not normalised)
export function mixAt (kind, h) {
  const m = (MIX[kind] || DEFAULT).slice()
  h = ((h % 24) + 24) % 24
  const rush = (h > 6.5 && h < 9.5) || (h > 16.5 && h < 19.5)
  const night = h > 22 || h < 5
  if (rush) m[0] *= 2
  if (night) {
    m[1] *= 0.25
    m[2] *= 0.3
    m[0] *= 0.5
    m[4] *= 2.2
  }
  return m
}
// a stable draw for person p (0 to 1), k picking which
export const drawOf = (p, k) => (p.look * 7.77 + p.i * 0.6180339887 + k * 0.1234567) % 1

// the profile index for someone in a neighbourhood of this kind at hour h, from draw u
export function pick (kind, h, u) {
  const m = mixAt(kind, h)
  let sum = 0
  for (const w of m) sum += w
  let r = u * sum
  for (let i = 0; i < m.length; i++) if ((r -= m[i]) < 0) return i
  return 0
}

export const PED_PROFILE = {
  // who p is (from their block's neighbourhood and the hour), and their pace to match
  profile (p) {
    const kind = p.ring?.b?.area
    const k = p.jog ? PROF.jogger : pick(kind, ENV.hour ?? 12, drawOf(p, 1))
    const T = TRAITS[k]
    p.liv = { prof: k, cowerT: 0, callT: 0, call: null, stuckT: 0, lastX: p.x, lastZ: p.z, poi: null, seen: 0 }
    p.jog = k === PROF.jogger
    p.v = p.v0 = T.pace[0] + (T.pace[1] - T.pace[0]) * drawOf(p, 2)
    p.alert = 0 // (pedBrain.js alertOf works it out again, with the profile's)
  },
  // the traits of p's profile (the commuter's for anyone made before profiles)
  traits (p) {
    return TRAITS[p.liv ? p.liv.prof : 0]
  }
}
