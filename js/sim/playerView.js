// What the game's systems (the wanted level, the police, the missions, the street events) know of
// the player, read through one small adapter so that they never depend on where the player lives.
// Today the player is the Roadster (sim.js Sim: bindSim); once the foot workstream's player.js lands
// (player { mode, pos, heading, vehicle, wanted } and the vehicles.js registry), bind that instead:
//
//   import { player } from './player.js'
//   bindPlayer(player)          // in game.js, in place of bindSim(sim)
//
// and the adapter reads player.pos / player.vel / player.heading / player.mode, and the car being
// driven from player.vehicle (a vehicles.js entry: { id, kind, type, car, sim, speed, stolen }),
// and writes the wanted level back to player.wanted. Everything else reads `playerView` only:
//   playerView.pos { x, y, z }, vel { x, z }, heading (sim.yaw's convention: nose (cos, -sin)),
//   speed (m/s over the ground), mode ('car' | 'foot' | 'entering' | 'exiting'), driving (bool),
//   vehicle ({ id, model, kind, stolen } of the car being driven, or null on foot), health (0 to
//   1: 0 is wasted), air (off the ground), wanted (0 to 5, as last set).
// Pure: no DOM.

export const playerView = {
  source: null, // 'sim' | 'player'
  pos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, z: 0 },
  heading: 0,
  speed: 0,
  mode: 'car',
  driving: true,
  air: false,
  vehicle: null,
  health: 1,
  wanted: 0
}

let SIM = null,
  PLAYER = null,
  HEALTH = null
const ROADSTER = { id: 'roadster', model: 'roadster', kind: 'roadster', stolen: false }

// The Roadster as the player (the city's sim.js Sim). health: () => 0..1, how much is left of it
// (game.js passes the condition bar's: 1 - damage.amount)
export function bindSim (sim, health = null) {
  SIM = sim
  PLAYER = null
  HEALTH = health
  playerView.source = 'sim'
  return updatePlayerView()
}
// The foot workstream's player (player.js); health: as bindSim, or player.health if it has one
export function bindPlayer (player, health = null) {
  PLAYER = player
  SIM = null
  HEALTH = health
  playerView.source = 'player'
  return updatePlayerView()
}

// Read the bound source into playerView (once a physics step, or a frame)
export function updatePlayerView (v = playerView) {
  if (PLAYER) {
    const p = PLAYER
    v.pos.x = p.pos.x
    v.pos.y = p.pos.y || 0
    v.pos.z = p.pos.z
    v.vel.x = p.vel?.x || 0
    v.vel.z = p.vel?.z || 0
    v.heading = p.heading || 0
    v.mode = p.mode || 'car'
    v.driving = v.mode === 'car'
    const e = p.vehicle
    v.vehicle =
      e && v.driving
        ? { id: e.id, model: e.type || e.model || 'car', kind: e.kind, stolen: !!e.stolen }
        : null
    // (at the wheel, the car's speed; on foot, the walker's)
    const car = e?.car,
      sim = e?.sim
    if (v.driving && sim) {
      v.vel.x = sim.vel.x
      v.vel.z = sim.vel.z
    } else if (v.driving && car) {
      v.vel.x = car.vx || car.hx * car.v
      v.vel.z = car.vz || car.hz * car.v
    }
    v.speed = Math.hypot(v.vel.x, v.vel.z)
    v.air = !p.grounded && !v.driving
    v.health = HEALTH ? HEALTH() : p.health ?? 1
    return v
  }
  if (SIM) {
    const s = SIM
    const pt = s.mode === 'ground' ? s.pos : s.com
    v.pos.x = pt.x
    v.pos.y = pt.y
    v.pos.z = pt.z
    v.vel.x = s.vel.x
    v.vel.z = s.vel.z
    v.heading = s.yaw
    v.speed = Math.hypot(s.vel.x, s.vel.z)
    v.mode = s.mode === 'foot' ? 'foot' : 'car'
    v.driving = v.mode === 'car'
    v.air = s.mode === 'air'
    v.vehicle = v.driving ? ROADSTER : null
    v.health = HEALTH ? HEALTH() : 1
  }
  return v
}

// The wanted level, kept on the player too (player.wanted, once player.js is bound)
export function setWanted (stars, v = playerView) {
  v.wanted = stars
  if (PLAYER) PLAYER.wanted = stars
}

// the player's nose, as a unit vector in x, z
export function forwardOf (v = playerView) {
  return { x: Math.cos(v.heading), z: -Math.sin(v.heading) }
}
