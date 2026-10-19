// The game on top of the drive: the wanted level and the police (sim/wanted.js, police.js), the
// missions (sim/missions/) and the street events (sim/ambient.js), their marks in the world
// (render/crimeView.js), on the HUD (ui/crimeHud.js) and on the maps (ui/crimeMap.js), and busted
// and wasted. main.js makes one Game and calls step() each physics step and frame() each frame in
// the city. Everything reads the player through sim/playerView.js (bound to the foot workstream's
// player.js: on foot, in the Roadster or in any other car, through onFoot.js).
// Debugging and screenshots: ?wanted=3 (stars from the start), ?mission=race (a mission started at
// once), ?ambient=chase (that street event soon), ?cash=5000; window.__crime in the console.
import { ENV } from './sim/env.js'
import { IDX } from './sim/carTypes.js'
import { STALLS, rng } from './sim/city.js'
import { Wanted } from './sim/wanted.js'
import { Police, Arrest } from './sim/police.js'
import { Ambient } from './sim/ambient.js'
import { witnesses } from './sim/witness.js'
import { MissionManager } from './sim/missions/manager.js'
import { spot, nearestKerb } from './sim/missions/spots.js'
import { emitGame, onGame } from './sim/gameEvents.js'
import { playerView, bindPlayer, updatePlayerView, setWanted } from './sim/playerView.js'
import { player } from './sim/player.js'
import { CrimeView } from './render/crimeView.js'
import { CrimeHud } from './ui/crimeHud.js'
import { radarOverlay, mapOverlay } from './ui/crimeMap.js'
import { gps } from './ui/gps.js'
import { recall, remember } from './ui/prefs.js'

// where the player is put back: the nearest hospital (wasted) or police station (busted), as
// fractions of the map (missions/spots.js)
export const HOSPITALS = [[0.18, 0.15], [0.78, 0.38], [0.35, 0.86]]
export const STATIONS = [[0.52, 0.45], [0.12, 0.7], [0.86, 0.82]]
export const PENALTY = { busted: 500, wasted: 1000 }
const DOWN_T = 3.6 // s of BUSTED / WASTED before the fade

export class Game {
  // deps: { sim (the Roadster's), foot (onFoot.js), traffic, peds, hud, minimap, app, damage,
  // respawn (at) => void }
  constructor (deps) {
    Object.assign(this, deps)
    this.R = rng(31337)
    this.footHealth = 1 // (on foot: knocked down by cars, back up over time)
    bindPlayer(player, { health: () => this.health(), driven: () => deps.foot.driven() })
    this.wanted = new Wanted()
    this.police = new Police(deps.traffic)
    this.missions = new MissionManager()
    this.ambient = new Ambient(deps.traffic, deps.peds, this.police)
    this.view = new CrimeView()
    this.ui = new CrimeHud()
    this.crimes = [] // crimes since the last step, to be witnessed
    this.events = [] // every game event since the last step (the missions read them)
    this.down = null // { kind: 'busted' | 'wasted', t }
    this.arrest = new Arrest()
    this.alive = { key: 'foot', hp: 1 } // (wasted is the health running out, not getting into a wreck)
    this.targetCar = null // a car parked for a mission to steal
    this.goal = null // the GPS waypoint a mission set
    this.hinted = new Map()
    this.markers = []
    this.t = 0
    this.missions.cash = Number(recall('cash')) || 0
    this.map = { units: [], heli: null, search: null, markers: this.markers, event: null, t: 0 }
    deps.minimap.overlay = (g, V, toRadar, k) => radarOverlay(g, V, toRadar, k, this.map)
    deps.app.mapOverlay = (g, sx, sy, k) => mapOverlay(g, sx, sy, k, this.map)
    onGame('*', e => this.events.length < 64 && this.events.push(e))
    onGame('crime', e => this.crimes.push(e))
    // a parked car broken into quietly is a crime too (a carjacking and an alarm are reported as
    // crimes of their own by onFoot.js)
    onGame('car-stolen', e => {
      if (e.how !== 'jack' && !e.alarm) this.crimes.push({ type: 'car-stolen', pos: e.pos, severity: 0.7 })
    })
    onGame('player-hit', e => (this.footHealth -= Math.min(1, (e.speed || 0) / 24)))
    this.hooks()
    this.debug()
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyJ' && !e.repeat && this.missions.state === 'running') this.missions.abort()
    })
  }

  // the missions' side effects: the heat to start with, a car to steal, the GPS
  hooks () {
    const M = this.missions
    M.on.start = d => {
      if (d.wanted) this.wanted.set(d.wanted, playerView.pos)
      if (d.target) this.parkTarget(d.target)
    }
    M.on.objective = (d, o, st) => {
      if (o.type === 'steal' && this.targetCar) st.target = { x: this.targetCar.x, z: this.targetCar.z }
    }
    M.on.end = (d, passed) => {
      remember('cash', String(M.cash))
      if (this.goal && gps.goal === this.goal) gps.clear()
      this.goal = null
      const c = this.targetCar
      if (c && !c.ctl) {
        const i = this.traffic.cars.indexOf(c)
        if (i >= 0 && Math.hypot(c.x - playerView.pos.x, c.z - playerView.pos.z) > 40) this.traffic.cars.splice(i, 1)
      }
      this.targetCar = null
    }
  }
  // a car of model parked in the lot stall nearest the place, for the player to steal
  parkTarget ({ model, near }) {
    const at = spot(near[0], near[1])
    let best = null,
      bd = Infinity
    for (const st of STALLS) {
      if (st.taken || this.traffic.used?.has(st)) continue
      const d = Math.hypot(st.x - at.x, st.z - at.z)
      if (d < bd && !this.traffic.cars.some(c => Math.hypot(c.x - st.x, c.z - st.z) < 4)) {
        bd = d
        best = st
      }
    }
    const k = IDX[model] ?? 0
    if (best) this.targetCar = this.traffic.park(best, this.R, k)
    else {
      const p = nearestKerb(at.x, at.z)
      const c = this.traffic.make(k, false, this.R)
      Object.assign(c, { parked: true, x: p.x, z: p.z, homeX: p.x, homeZ: p.z, homeYaw: p.yaw })
      this.traffic.setYaw(c, p.yaw)
      this.targetCar = c
    }
    this.targetCar.mission = true
  }

  // how much is left of the player (0: wasted): the Roadster's dents, another car wrecked, or
  // knocks taken on foot
  health () {
    const f = this.foot
    if (player.mode !== 'car') return this.footHealth
    if (f.alt.active) return f.alt.body.dead ? 0 : 1
    return Math.max(0, 1 - (this.damage?.amount || 0))
  }
  // One physics step in the city (h s); view: the camera's ground position and heading (main.js)
  step (h, view) {
    this.t += h
    this.footHealth = Math.min(1, this.footHealth + h * 0.03)
    const P = updatePlayerView()
    if (this.down) {
      this.crimes.length = 0
      return
    }
    const W = this.wanted
    // crimes, if anyone saw them
    for (const c of this.crimes) {
      if (!c.pos) c.pos = { x: P.pos.x, z: P.pos.z }
      const w = witnesses(c.pos, { peds: this.peds.list, cars: this.traffic.cars, police: this.police.units, stars: W.stars })
      W.report(c, w)
    }
    this.crimes.length = 0
    const grip = 1 - 0.3 * Math.max(ENV.wet, 0.6 * ENV.rain)
    const f = this.foot,
      inCar = player.mode === 'car'
    const sim = inCar && f.inRoadster() ? this.sim : null,
      body = inCar && f.alt.active ? f.alt.body : null
    this.police.step(h, { wanted: W, player: P, sim, body, view, grip })
    for (const hit of this.police.hits)
      if (hit.byPlayer && hit.impact > 3)
        W.report({ type: 'hit-police', pos: { x: P.pos.x, z: P.pos.z }, severity: 1 }, { peds: 0, cars: 0, police: 1 })
    W.update(h, P.pos, this.police.seen)
    setWanted(W.stars)
    this.ambient.step(h, P, view, W.stars > 0 || this.missions.state === 'running')
    this.missions.update(h, { player: P, wanted: W, events: this.events })
    this.events.length = 0
    // busted: stopped with a unit beside you while wanted; wasted: the car (or you) done for
    // (on foot, walking pace is slow enough to be caught)
    if (this.arrest.step(h, W.stars, this.police, P)) return this.fall('busted')
    if (this.wasted(P)) this.fall('wasted')
  }
  // wasted: the health running out in the same body (on foot, or the same car); climbing into a
  // car that is already a wreck is not, it just won't go (and says so)
  wasted (P) {
    const key = player.mode === 'car' ? String(P.vehicle?.id ?? 'car') : 'foot',
      hp = P.health,
      A = this.alive
    const out = hp <= 0 && A.key === key && A.hp > 0
    if (hp <= 0 && A.key !== key && key !== 'foot') this.hud?.popup?.('Wrecked', 1800, 'hint')
    A.key = key
    A.hp = hp
    return out
  }

  // the sim's own knocks this frame (main.js passes sim.events): a hard one into the traffic is a
  // crime (the police seeing it is what counts)
  simEvents (events) {
    for (const e of events)
      if (e.type === 'bump' && e.what === 'car' && !e.police && e.impact > 7)
        emitGame('crime', { type: 'traffic-crash', pos: { x: e.px, z: e.pz }, severity: 1 })
  }

  fall (kind) {
    this.down = { kind, t: 0 }
    this.arrest.t = 0
    emitGame(kind, { pos: { x: playerView.pos.x, z: playerView.pos.z } })
    const pay = Math.min(this.missions.cash, PENALTY[kind])
    this.missions.cash -= pay
    remember('cash', String(this.missions.cash))
    this.ui.title(kind, kind, pay ? `-$${pay}` : '', DOWN_T * 1000)
    this.ui.grey(true)
    if (this.missions.state === 'running') this.missions.fail(kind === 'busted' ? 'Busted' : 'Wasted')
  }
  // back on the street, by the nearest hospital or police station, with the slate clean
  getUp () {
    const kind = this.down.kind
    const list = kind === 'busted' ? STATIONS : HOSPITALS
    let best = null,
      bd = Infinity
    for (const [fx, fz] of list) {
      const s = spot(fx, fz, { kerb: false })
      const d = Math.hypot(s.x - playerView.pos.x, s.z - playerView.pos.z)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    this.wanted.set(0)
    this.police.clearAll()
    this.ambient.end()
    this.traffic.clearAround(best.x, best.z, 14)
    this.respawn?.({ x: best.x, z: best.z, yaw: best.yaw })
    this.footHealth = 1
    this.down = null
    this.ui.grey(false)
  }

  // Each frame (dt real s) in the city
  frame (dt, inCity) {
    this.view.show(inCity)
    if (!inCity) return this.ui.update(dt, { stars: 0, searching: false, cash: this.missions.cash, status: null, show: false })
    if (this.down && (this.down.t += dt) > DOWN_T && !this.down.fading) {
      this.down.fading = true
      this.hud.fade(() => this.getUp())
    }
    const M = this.missions,
      W = this.wanted
    M.markers(this.markers)
    // the car to steal, where it stands now
    if (M.objective?.type === 'steal' && this.targetCar && M.st) {
      M.st.target = { x: this.targetCar.x, z: this.targetCar.z }
      M.markers(this.markers)
    }
    this.route()
    this.hint()
    this.view.update(dt, this.markers, this.police.heli, ENV.dark)
    this.ui.messages(M.msgs, t => this.hud.popup(t, 2600, 'hint'))
    this.ui.update(dt, { stars: W.stars, searching: W.searching, cash: M.cash, status: M.status(), show: !this.app.intro })
    const m = this.map
    m.units = this.police.units
    m.heli = this.police.heli
    m.search = W.stars && W.searching ? { x: W.last.x, z: W.last.z, r: W.radius } : null
    m.event = this.ambient.current
    m.t += dt
  }
  // the GPS to whatever the mission's objective points at
  route () {
    const tgt = this.missions.st?.target
    if (this.missions.state !== 'running' || !tgt) return
    if (this.goal && Math.hypot(this.goal.tx - tgt.x, this.goal.tz - tgt.z) < 20) return
    gps.set(tgt.x, tgt.z)
    this.goal = gps.goal
    if (this.goal) Object.assign(this.goal, { tx: tgt.x, tz: tgt.z })
  }
  // coming up to a mission's marker: its name, and how to start it
  hint () {
    if (this.missions.state !== 'idle') return
    for (const k of this.markers) {
      const d = Math.hypot(k.x - playerView.pos.x, k.z - playerView.pos.z)
      if (d > 45 || this.t - (this.hinted.get(k.id) ?? -1e9) < 60) continue
      this.hinted.set(k.id, this.t)
      this.hud.popup(`<b>${k.title}</b> · drive into the marker to start`, 3200, 'hint')
    }
  }

  // ?wanted=3, ?mission=race, ?ambient=chase, ?cash=5000
  debug () {
    const q = new URLSearchParams(location.search)
    if (q.has('cash')) this.missions.cash = Number(q.get('cash')) || 0
    const stars = Number(q.get('wanted'))
    const id = q.get('mission'),
      ev = q.get('ambient')
    if (stars || id || ev)
      setTimeout(() => {
        updatePlayerView()
        if (id) this.missions.start(id)
        if (stars) this.wanted.set(stars, playerView.pos)
        if (ev) this.ambient.start(ev, playerView, null)
      }, 400)
    window.__crime = this
  }
  // (the console, and the tests in a browser: as if the player had stolen a car of this model)
  fakeSteal (model = 'sports') {
    emitGame('car-stolen', { vehicle: 'debug', kind: 'parked', model, pos: { x: playerView.pos.x, z: playerView.pos.z }, how: 'break' })
  }
}
