// The player out of the car: getting out (E), walking the city as Optimus (WASD, Shift to run,
// Space to jump, the mouse or the right stick looking round), getting into the Roadster or any other
// car (E by it: in at once if it is open, broken into if it is parked and locked, taken from its
// driver if it has one), and driving whichever it is. Hands the camera, the controls and the HUD
// between the modes so nothing held for one leaks into the other. main.js steps it with the rest.
//
//   player (sim/player.js)      who the game follows, on foot or at the wheel
//   vehicles (sim/vehicles.js)  everything that can be driven
//   game events: 'car-entered', 'car-exited', 'car-stolen', 'crime' (sim/gameEvents.js)
import { look } from './ui/options.js'
import * as THREE from 'three'
import { emitGame } from './sim/gameEvents.js'
import { dropCarName } from './carName.js'
import { footProxy } from './sim/vehicleLink.js'
import { vehicles } from './sim/vehicles.js'
import { Drivable } from './sim/drivable.js'
import { collidePlayer } from './sim/wrecks.js'
import { carsMeet } from './sim/carsMeet.js'
import { FootRescue } from './sim/footRescue.js'
import { makeControls } from './sim/constants.js'
import {
  player,
  setMode,
  placePlayer,
  stepFoot,
  moveDir,
  CITY_WORLD
} from './sim/player.js'
import {
  startEnter,
  startExit,
  stepBoard,
  cancellable,
  hurry,
  BOARD
} from './sim/boarding.js'
import { offerFor } from './ui/prompt.js'
import { FootFight } from './footFight.js'
import { hitByCars } from './footHits.js'
import { InteriorGlue } from './render/interiors/glue.js'
import { FootView } from './render/footView.js'
import { boardRoadster, BOARD_T } from './render/intro.js'
import { FootCam } from './render/footCam.js'
import { clipCamera } from './render/city.js'
import { scene } from './render/scene.js'
import { raiseAlarm } from './audio/watch.js'
import { hearing, panOf } from './audio/mix.js'
import { footstep, landing, smashWindow, forceLock, doorSound } from './audio/steps.js'

const HOLD = { ...makeControls(), brake: 1, fan: false }
// what the radar, the GPS and the place name follow while the player walks: the feet, as a car
class Focus {
  constructor () {
    this.mode = 'ground'
    this.pos = new THREE.Vector3()
    this.com = this.pos
    this.vel = new THREE.Vector3()
    this.floor = 0
    this.yaw = 0
    this.speed = 0
  }
  groundSpeed () {
    return this.speed
  }
  fwd (out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
  }
}

export class OnFoot {
  constructor (g) {
    // g: { app, sim, RS, rig, camera, canvas, input, hud, sound, traffic, peds, intro, setCam, cityView }
    Object.assign(this, g)
    this.alt = new Drivable() // a car that isn't the Roadster, while the player has it
    this.rescue = new FootRescue() // stuck or out of the world: put back somewhere safe
    this.view = new FootView(scene, g.RS, g.cityView)
    this.cam = new FootCam(g.camera, clipCamera)
    this.focus = new Focus()
    this.fight = new FootFight(this) // (fists: F, the left mouse button)
    this.view.melee = this.fight.melee
    this.action = null // getting in or out (boarding.js)
    this.exitQ = false // E pressed at speed: the car being stopped to get out
    this.target = null // the car the prompt is for
    this.how = null
    this.jumpQ = false
    this.walkOn = false // (Caps Lock: walking, not jogging)
    this.prev = { x: 0, y: 0, z: 0 } // the feet a step ago (drawn between steps)
    this.stepD = 0
    this.lastDist = 0
    this.world = { ...CITY_WORLD, cars: [] }
    this.rects = []
    this.promptEl = document.getElementById('prompt')
    this.promptText = ''
    vehicles.sync(null, g.sim)
    setMode('car', vehicles.roadster)
    this.interiors = new InteriorGlue(this) // (the doors into the shops: render/interiors/)
    this.pointer()
  }

  // ---------- who is driving what ----------
  // the sim the player's controls drive (null: on foot or getting in or out)
  driven () {
    if (player.mode !== 'car') return null
    return this.alt.active ? this.alt.sim : this.sim
  }
  // the car the traffic and the people see as the player's: the one they drive or are getting out
  // of, else the Roadster
  seen () {
    return this.alt.active ? this.alt.sim : this.sim
  }
  inRoadster () {
    return player.mode === 'car' && !this.alt.active
  }
  onFoot () {
    return player.mode !== 'car'
  }

  // ---------- the fixed step ----------
  // one physics step of the cars and the city, c the player's controls for what they drive
  step (H, c, city, view, peds, traffic) {
    const held = this.interiors.step(H) // (going through a door: the feet held under the fade)
    const ds = this.driven(),
      sim = this.sim
    if (this.exitQ) c = this.braking(ds) // (E at speed: brought to a stop, then out)
    sim.step(H, ds === sim ? c : HOLD)
    if (this.alt.active) this.alt.step(H, ds === this.alt.sim ? c : HOLD)
    if (!city) return
    // what the traffic and the people see as the player: the car they drive (through its stand-in:
    // vehicleLink.js), them on foot (footProxy: the drivers stop and honk), or the Roadster
    const walking = this.onFoot() && !this.alt.active
    if (!this.app.intro) traffic.walker = walking ? player.pos : null
    traffic.meHL = this.alt.active ? this.alt.proxy.halfL : 0
    traffic.meHW = this.alt.active ? this.alt.proxy.halfW : 0
    if (this.alt.active) {
      this.alt.traffic(p => {
        peds.step(H, p, traffic, view)
        traffic.step(H, p, view)
        carsMeet(p, p, sim) // (the Roadster where it was left, still in the way)
      })
      collidePlayer(traffic, sim)
    } else if (walking) {
      const fp = footProxy(player.pos, player.heading)
      peds.step(H, fp, traffic, view)
      traffic.step(H, fp, view)
      collidePlayer(traffic, sim)
    } else {
      peds.step(H, sim, traffic, view)
      traffic.step(H, sim, view)
    }
    if (this.onFoot() && !held) this.stepPlayer(H)
    else if (this.action) this.board(H) // (sat in, driving off, the door shutting behind)
  }
  // E at speed: the brakes on hard until the car is slow enough to get out of, then out (E again,
  // or the car taken out of the player's hands, calls it off)
  braking (s) {
    if (!s || player.mode !== 'car') {
      this.exitQ = false
      return HOLD
    }
    if (s.groundSpeed() <= BOARD.exitV) {
      this.exitQ = false
      this.exit()
    }
    return HOLD
  }

  // the player's feet, one step: walking under the keys, or getting in or out of a car
  stepPlayer (H) {
    const p = player
    this.prev.x = p.pos.x
    this.prev.y = p.pos.y
    this.prev.z = p.pos.z
    this.nearCars()
    const a = this.action
    if (a && !(a.dir === 'out' && player.mode === 'foot')) {
      // (a move key: a walk up called off, the rest of getting in or out skipped; a break-in, once
      // begun, goes on, and a move key held through it skips what's left once the door is open)
      const go = this.moveKeys().mag > 0.3
      let ev
      if (a.dir === 'in' && cancellable(a) && go) {
        this.action = null
        setMode('foot', null)
      } else if (go && (ev = hurry(a)).length) return this.events(a, ev)
      else return this.board(H)
    }
    if (this.action) this.board(H) // (the door shutting behind the player, as they walk off; not a walk-up just called off)
    const k = this.moveKeys()
    let ctl = moveDir(this.cam.yaw, k.f, k.r)
    ctl.run = this.input.held('ShiftLeft', 'ShiftRight')
    ctl.walk = this.walkOn // (Caps Lock: a walk, else a jog, as GTA's)
    ctl.jump = this.jumpQ
    this.jumpQ = false
    ctl = this.fight.step(H, ctl) // (a punch thrown: stood still, or lunging: footFight.js)
    const out = stepFoot(p, H, ctl, this.world)
    this.rescue.step(p, H, ctl.mag > 0.3, this.world) // (footRescue.js)
    if (out.landed > 3) landing(this.sound, p.surface, out.landed, 0)
    hitByCars(this)
  }
  // forward and right asked for, from the keys and the left stick
  moveKeys () {
    const i = this.input,
      pad = i.pad
    const f = (i.held('KeyW', 'ArrowUp') ? 1 : 0) - (i.held('KeyS', 'ArrowDown') ? 1 : 0) - pad.stickY
    const r = (i.held('KeyD', 'ArrowRight') ? 1 : 0) - (i.held('KeyA', 'ArrowLeft') ? 1 : 0) + pad.stickX
    return { f: Math.max(-1, Math.min(1, f)), r: Math.max(-1, Math.min(1, r)), mag: Math.hypot(f, r) }
  }
  // the cars near the player, as rectangles for the feet to keep out of
  nearCars () {
    const list = this.world.cars
    list.length = 0
    const p = player.pos
    let n = 0
    for (const e of vehicles.list) {
      if (Math.abs(e.pos.x - p.x) > 14 || Math.abs(e.pos.z - p.z) > 14) continue
      const r = vehicles.rect(e, this.rects[n] || (this.rects[n] = {}))
      if (e.car?.parked && !e.car.jam && !e.car.player && !e.car.ditched) r.top += 0.08
      r.ignore = this.action?.entry === e && this.action.dir === 'in'
      list.push(r)
      n++
    }
  }
  // ---------- getting in and out ----------
  // E (or the pad's Y): in or out. true when it was taken (in the air it yaws the Roadster instead)
  interact () {
    if (this.app.world !== 'city') {
      if (player.mode === 'car')
        this.hud.popup('You can get out in the city · <b>C</b> to go there', 2200, 'hint')
      return player.mode === 'car' ? false : true
    }
    if (this.app.intro || this.app.auto || this.down) return false
    if (this.interiors.interact()) return true
    if (player.mode === 'car') {
      const s = this.driven()
      if (s.mode !== 'ground' && s.mode !== 'crash') return false
      if (s.groundSpeed() > BOARD.exitV) {
        this.exitQ = !this.exitQ // (braked to a stop, then out: braking)
        return true
      }
      return this.exit()
    }
    if (player.mode === 'foot' && this.target && this.how) {
      this.enter(this.target, this.how)
      return true
    }
    if (this.action && cancellable(this.action)) {
      this.action = null
      setMode('foot', null)
      return true
    }
    return player.mode !== 'car'
  }
  enter (e, how) {
    if (how === 'jack') this.freeze(e.car)
    this.action = startEnter(e, how, player, Math.random, this.world) // (the free side's door)
    setMode('entering', e)
  }
  // a car with a driver, about to be taken: it stops where it is, its driver at the wheel
  freeze (car) {
    this.traffic.takeOver(car, 'player') // (handover.js)
    car.jam = car.brake = true
    car.v = car.vx = car.vz = car.w = 0
  }
  exit () {
    const e = player.vehicle
    this.nearCars()
    this.action = startExit(e, this.world)
    setMode('exiting', e)
    dropCarName(this.hud) // (its name doesn't stay up after the player: carName.js)
    if (e.kind === 'roadster') this.RS.seated = false
    else doorSound(this.sound, false, 0)
    this.camToFoot()
    return true
  }
  // the boarding's step and what comes of it
  board (H) {
    const a = this.action
    this.events(a, stepBoard(a, H, player, this.world))
  }
  events (a, list) {
    const e = a.entry
    for (const ev of list) {
      const w = vehicles.toWorld(e, e.door.x, e.door.z)
      const pan = panOf(w.x, w.z)
      if (ev === 'arrived') {
        if (a.how === 'theft' && !a.smash) forceLock(this.sound, pan)
        else if (a.how !== 'theft' && a.how !== 'roadster') doorSound(this.sound, false, pan)
        if (a.how === 'roadster') {
          player.heading = e.heading
          this.sound.unlock?.(pan)
        }
      } else if (ev === 'smash') smashWindow(this.sound, pan)
      else if (ev === 'alarm') {
        raiseAlarm(this.sound, e.car)
        this.peds.threat?.(w.x, w.z, 10, 1, 1.5)
        emitGame('crime', { type: 'car-alarm', pos: { x: w.x, z: w.z }, severity: 1, vehicle: e.id })
      } else if (ev === 'pulled') this.pullOut(e, w)
      else if (ev === 'seated') this.seated(e, a)
      else if (ev === 'shut') {
        if (e.kind !== 'roadster') doorSound(this.sound, true, pan)
        if (this.action === a) this.action = null
      } else if (ev === 'out') this.outOf(e, a)
      else if (ev === 'closed') {
        if (e.kind !== 'roadster') doorSound(this.sound, true, pan)
        else this.sound.lock?.(pan)
        this.action = null
      }
    }
  }
  // the driver hauled out of their car: on foot, and running
  pullOut (e, w) {
    // (out of the driver's door, the left: they run off, and the people round about see it)
    this.traffic.ejectDriver(e.car, { side: 1, jacked: true, along: e.seat.x - 0.35 }) // (staged: alight.js haul)
    this.peds.threat?.(w.x, w.z, 14, 2, 2)
    e.vacant = true
    this.sound.honk?.([300, 380], 0.05 * hearing(w.x, w.z), panOf(w.x, w.z))
    emitGame('crime', { type: 'carjack', pos: { x: w.x, z: w.z }, severity: 2, vehicle: e.id })
  }
  seated (e, a) {
    if (a.done) this.action = null // (else its door still shutting as the car moves off)
    if (e.kind === 'roadster') {
      this.RS.seated = true
      this.RS.door = 0
      this.RS.optimus.root.visible = true
      e.occupant = 'player'
    } else {
      this.alt.board(e, this.traffic)
    }
    setMode('car', e)
    this.view.hide()
    if (!a.hurried) this.input.handoff() // (a key that hurried it in drives at once)
    this.camToCar(e)
    const pos = { x: e.pos.x, z: e.pos.z }
    if (a.how === 'theft' || a.how === 'jack') {
      e.stolen = true
      emitGame('car-stolen', { vehicle: e.id, kind: e.kind, model: e.type, pos, how: a.how, alarm: !!a.alarm })
    }
    emitGame('car-entered', { vehicle: e.id, kind: e.kind, model: e.type, pos, stolen: e.stolen })
    this.hud.carHud?.entered(e) // (its name bottom right, its hints: ui/carHud.js)
  }
  outOf (e, a) {
    const s = a.spot
    placePlayer(s.x, s.z, e.heading, s.y ?? null)
    this.prev.x = s.x
    this.prev.y = player.pos.y
    this.prev.z = s.z
    setMode('foot', null)
    if (e.kind === 'roadster') {
      this.RS.optimus.root.visible = false
      e.occupant = null
    } else {
      this.alt.leave()
      e.vacant = true
    }
    if (!a.hurried) this.input.handoff() // (a key that hurried it out walks at once)
    this.hud.carHud?.exited()
    emitGame('car-exited', { vehicle: e.id, kind: e.kind, model: e.type, pos: { x: s.x, z: s.z } })
  }
  // the follow camera eased in from the camera on foot, or the camera on foot from the car's
  camToCar (e) {
    const rig = this.rig
    rig.noCockpit = e.kind !== 'roadster'
    this.setCam(rig.mode) // (the Cockpit is the Hood camera in any other car: carCam.js)
    if (rig.mode === 'free' || rig.mode === 'side') this.setCam('follow')
    rig.f.init = false
    rig.shot = 'foot' // (anything not 'follow' or '': eased over from where the camera is)
    rig.look.copy(this.cam.look)
  }
  camToFoot () {
    this.cam.begin(player.vehicle.pos)
  }

  // back in the Roadster at once (a reset, the other world)
  reset () {
    if (this.alt.active) this.alt.leave()
    this.action = null
    this.exitQ = false
    this.fight.reset()
    vehicles.sync(null, this.sim)
    setMode('car', vehicles.roadster)
    vehicles.roadster.occupant = 'player'
    this.RS.seated = true
    this.RS.door = 0
    this.RS.optimus.root.visible = true
    boardRoadster(this.RS, BOARD_T.end) // (sat in: not left stood at the door as it got out)
    this.rig.noCockpit = false
    this.view.hide()
    this.prompt('')
  }

  // ---------- each frame ----------
  // before the frame's steps: what the tween draws between steps
  before (tween) {
    tween.sim = this.seen()
  }
  // after them: the registry, the prompt, the figure, the camera, the sounds and the HUD's mode.
  // alpha: how far the frame is between the last two steps. Returns whether it owned the camera.
  frame (dt, alpha, clock) {
    const p = player,
      app = this.app
    vehicles.sync(this.traffic, this.sim)
    if (player.mode === 'car') {
      const s = this.driven()
      p.pos.x = s.pos.x
      p.pos.y = s.pos.y
      p.pos.z = s.pos.z
      p.heading = s.yaw
      p.speed = s.groundSpeed()
    }
    app.sim = this.seen()
    app.foot = this.onFoot()
    app.vehicle = player.vehicle
    const f = this.focus
    const pos = this.drawPos(alpha)
    f.pos.set(pos.x, pos.y, pos.z)
    f.yaw = p.heading
    f.speed = p.speed
    app.focus = this.onFoot() && !this.alt.active ? f : null
    this.look(dt)
    if (this.onFoot()) {
      this.view.update(dt, p, pos, this.action)
      this.steps(pos)
      this.cam.update(dt, pos, p.heading, p.speed > 0.5)
    } else if (this.action) this.view.update(dt, p, pos, this.action) // (a door still shutting)
    this.offer()
    document.body.classList.toggle('on-foot', this.onFoot())
    document.body.classList.toggle('other-car', !this.onFoot() && this.alt.active)
    if (app.paused && document.pointerLockElement) document.exitPointerLock?.()
    return this.onFoot()
  }
  drawPos (alpha) {
    const p = player.pos,
      q = this.prev
    if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 > 4) return p
    return { x: q.x + (p.x - q.x) * alpha, y: q.y + (p.y - q.y) * alpha, z: q.z + (p.z - q.z) * alpha }
  }
  // the right stick, and the mouse wheel's zoom on foot
  look (dt) {
    const pad = this.input.pad
    if (!pad.lookX && !pad.lookY) return
    if (this.onFoot()) this.cam.turn(pad.lookX * dt * 900, -pad.lookY * dt * 600)
    else if (this.driven()?.mode !== 'air')
      this.rig.turn(pad.lookX * dt * 2.6, -pad.lookY * dt * 1.6)
  }
  // a footfall each half stride walked
  steps (pos) {
    const p = player
    if (p.mode !== 'foot' || !p.grounded) return
    this.stepD += p.speed > 0.2 ? Math.min(0.2, Math.abs(p.dist - this.lastDist)) : 0
    this.lastDist = p.dist
    const half = p.speed > 5 ? 1.8 : p.speed > 3 ? 1.45 : 0.8 // (half the stride: optimusGait.js)
    if (this.stepD > half) {
      this.stepD = 0
      footstep(this.sound, p.surface, 0.55 + 0.45 * p.run, 0, p.run > 0.4)
    }
  }
  // the car on offer: "E · Break in · Sedan" while the player stands by one
  offer () {
    const o = this.down ? { text: '' } : this.interiors.offer(offerFor(player, this.action))
    this.target = o.target
    this.how = o.how
    this.prompt(o.text)
  }
  prompt (html) {
    if (html === this.promptText || !this.promptEl) return
    this.promptText = html
    this.promptEl.innerHTML = html
    this.promptEl.classList.toggle('on', !!html)
  }
  // the mouse: a click locks the pointer to the picture in the city, and it then looks round
  pointer () {
    const cv = this.canvas
    cv.addEventListener('click', () => {
      if (this.app.world !== 'city' || this.app.paused || document.pointerLockElement) return
      try {
        cv.requestPointerLock?.()?.catch?.(() => {})
      } catch {}
    })
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== cv) return
      const [mx, my] = look(e.movementX, e.movementY) // (sensitivity, invert: ui/options.js)
      if (this.onFoot()) this.cam.turn(mx, my)
      else this.rig.turn(mx * 0.0026, my * 0.002)
    })
    cv.addEventListener('mousedown', e => {
      if (e.button === 0 && document.pointerLockElement === cv && this.onFoot()) this.fight.punch()
    })
    cv.addEventListener(
      'wheel',
      e => {
        if (this.onFoot()) this.cam.zoom(e.deltaY > 0)
      },
      { passive: true }
    )
  }

}

