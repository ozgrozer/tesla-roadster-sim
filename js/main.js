// Tesla Roadster Sim: boot, game state, sim events and the main loop.
import * as THREE from 'three'
import { Hud } from './ui/hud.js'
import { Sim } from './sim/sim.js'
import { Menu } from './ui/menu.js'
import { Input } from './ui/input.js'
import { Minimap } from './ui/minimap.js'
import { smoke } from './render/smoke.js'
import { Intro } from './render/intro.js'
import { Tween } from './render/tween.js'
import { Peds } from './sim/peds.js'
import { Traffic } from './sim/traffic.js'
import { driveDemo } from './ui/driveDemo.js'
import { SoundEngine } from './audio/sound.js'
import { Autopilot } from './sim/autopilot.js'
import { CityPilot } from './sim/cityPilot.js'
import { ENV } from './sim/env.js'
import { buildLineup } from './render/lineup.js'
import { nearestLane, standUp } from './sim/city.js'
import { handleEvents as simEvents } from './events.js'
import { CityView, clipCamera } from './render/city.js'
import { hearing, panOf, mixSound } from './audio/mix.js'
import { CameraRig } from './render/camera.js'
import { updateSkids, clearSkids } from './render/skids.js'
import { DEG, TAU, makeControls } from './sim/constants.js'
import { LED_MAT, buildWall, buildTruss } from './render/wall.js'
import { buildRoadster, updateRoadster } from './render/roadster.js'
import { Post } from './render/post.js'
import { Climate } from './climate.js'
import { Resolution } from './render/resolution.js'
import { warmUp } from './render/warm.js'
import { Damage } from './render/damage.js'
import { MAT, scene, camera, canvas } from './render/scene.js'
import { renderer, followKeyLight } from './render/scene.js'
import { fallFx, ALL_PARTICLES, updateNozzles, emitThrusters, emitTireSmoke, attachDiamonds } from './render/effects.js'
import { emitTrafficSpray } from './render/spray.js'
import { Game } from './game.js'
import { OnFoot } from './onFoot.js'
import { player } from './sim/player.js'
import { vehicles } from './sim/vehicles.js'
import { GAME_EVENTS, tickGame } from './sim/gameEvents.js'
import { Polish } from './polish.js'

// ---------- world ----------
buildWall()
buildTruss()
buildLineup()
const RS = buildRoadster()
attachDiamonds(RS)
const damage = new Damage(RS) // dents where it is knocked (damage.js)

const post = new Post(renderer, scene, camera) // bloom, speed blur, tone mapping
const resolution = new Resolution(renderer, post) // sharp while the GPU keeps up, less when not

// ---------- state ----------
const sim = new Sim()
const ap = new Autopilot(sim)
const rig = new CameraRig(camera, canvas)
rig.cockpit = { head: RS.optimus.head, body: RS.body }
const sound = new SoundEngine()
const hud = new Hud(RS, damage) // (the dents fill its condition bar)
const traffic = new Traffic()
traffic.districts = true // (busier downtown than in the estates: handover.js)
const peds = new Peds() // people on foot
const cityPilot = new CityPilot(sim, traffic)
const cityView = new CityView()
const minimap = new Minimap(document.getElementById('radar'))
const intro = new Intro(RS, rig)
intro.onCue = cue => sound[cue](panOf(RS.car.position.x, RS.car.position.z))
const tween = new Tween(sim, traffic) // drawing between physics steps
const HOLD = { ...makeControls(), brake: 1, fan: false } // parked while Optimus gets in
const app = {
  world: 'site', // 'site' (the reveal's test site) or 'city' (free roam)
  sim,
  ap,
  auto: true,
  slow: false,
  timeScale: 1,
  score: 0,
  lastSpot: 'start',
  fanMode: 'auto',
  soundOn: false,
  lastCtl: makeControls(),
  restHint: false, // told the player how to carry on from a wreck at rest
  lastCountdown: null,
  wheelAudio: 0,
  lastBump: 0,
  pilotHorn: false,
  quality: 'high', // graphics quality (climate.js)
  night: false // the city at night (ENV.night: sim/env.js)
}
// the clock and the weather, the rain, the wet street and the graphics quality (climate.js)
const climate = new Climate({ app, hud, RS, cityView, resolution })

function setAuto (on) {
  app.auto = on
  hud.setMode(on)
  if (!on) {
    cityPilot.releaseLights() // any light it held for itself goes back to its cycle
    ap.slow = 1
    app.fanMode = 'auto'
    if (rig.mode === 'director') setCam('follow')
  }
}
// the autopilot for the world the car is in: the reveal demo, or Autopilot on the city's streets
const pilot = () => (app.world === 'city' ? cityPilot : ap)
function startDemo () {
  foot.reset()
  damage.repair()
  setWorld('site')
  sim.reset('start')
  ap.reset()
  app.score = 0
  app.lastSpot = 'start'
  for (const p of ALL_PARTICLES) p.clear()
  clearSkids()
  setCam('director')
  setAuto(true)
}
// P and the mode button: the demo at the test site, Autopilot in the city
function startAutopilot () {
  intro.finish(true)
  if (!foot.inRoadster())
    return hud.popup('Autopilot drives the Roadster · get back in it first', 2200, 'hint')
  if (app.world !== 'city') return startDemo()
  cityPilot.reset()
  if (!cityPilot.join()) {
    return hud.popup('Autopilot needs a street · drive onto a lane first', 2200, 'hint')
  }
  setCam('follow')
  setAuto(true)
}
function resetTo (spot, at = null) {
  intro.finish(true)
  foot.reset()
  damage.repair()
  traffic.walker = null
  setWorld(spot === 'city' ? 'city' : 'site')
  sim.reset(spot, at)
  rig.cut()
  if (spot === 'city' && !at) {
    traffic.reset(sim.pos.x, sim.pos.z)
    peds.reset(sim.pos.x, sim.pos.z)
    standUp()
    cityView.standUp()
  }
  app.lastSpot = spot
  app.score = 0
  if (app.auto) setAuto(false)
}
// ---------- worlds: the test site and the city ----------
function setWorld (w) {
  if (w !== 'city') intro.finish(true) // (Optimus gets in at once, off camera)
  cityPilot.releaseLights()
  if (app.world === w) return
  app.world = w
  app.ap = pilot()
  cityView.show(w === 'city')
  rig.clip = w === 'city' ? clipCamera : null
  climate.world(w)
  hud.setWorld(w)
  for (const p of ALL_PARTICLES) p.clear()
  clearSkids()
  // a reload lands back in the same world (the city is the default, the test site is #site)
  const url = location.pathname + location.search
  // (a page shown in a sandboxed frame may not be allowed to: it just doesn't remember)
  try {
    history.replaceState(null, '', w === 'site' ? `${url}#site` : url)
  } catch {}
}
// the city opens on Optimus walking up to the Roadster and getting in
// (a debug start anywhere in the city: ?spawn=x,z or ?spawn=x,z,yaw)
const SPAWN_AT = (() => {
  const v = new URLSearchParams(location.search).get('spawn')
  const [x, z, yaw = 0] = (v || '').split(',').map(Number)
  return v && Number.isFinite(x) && Number.isFinite(z) ? { x, z, yaw } : null
})()
function enterCity () {
  resetTo('city', SPAWN_AT)
  if (SPAWN_AT) {
    traffic.reset(sim.pos.x, sim.pos.z)
    peds.reset(sim.pos.x, sim.pos.z)
  }
  setCam('follow')
  intro.start(() => {
    traffic.walker = null
    hud.popup('Welcome to the city · <b>C</b> for the test site', 3200, 'hint')
    hud.popup(
      'Gridlock on the avenue ahead · hold <b>F</b> to jump it',
      4200,
      'hint'
    )
  })
}
function toggleWorld () {
  hud.fade(() => (app.world === 'city' ? startDemo() : enterCity()))
}
// after a crash in the city, carry on from the nearest lane instead of the spawn point
function respawn () {
  if (app.world !== 'city') return resetTo(app.lastSpot)
  const at = nearestLane(sim.com.x, sim.com.z)
  traffic.clearAround(at.x, at.z, 14)
  resetTo('city', at)
}
function setCam (mode) {
  rig.setMode(mode)
  hud.setCam(rig.nameOf(mode))
}
function toggleSlow () {
  app.slow = !app.slow
  hud.setSlow(app.slow)
}
function toggleSound () {
  sound.userMuted = sound.enabled
  sound.setEnabled(!sound.enabled)
  app.soundOn = sound.enabled
  hud.setSound(sound.enabled)
}
// the horn sounds while H is held; traffic just ahead moves over for it
function setHorn (on) {
  sound.horn(on)
  traffic.horn = on
}
function tryFlip (axis) {
  if (app.auto) setAuto(false)
  if (sim.mode !== 'air') {
    hud.popup('Get airborne first · hold <b>F</b> to fly', 1600, 'hint')
    return
  }
  if (!sim.man) sim.startManeuver(axis, axis === 'z' ? TAU : -TAU)
}

// ---------- input ----------
const COMMANDS = {
  KeyP: startAutopilot,
  KeyC: toggleWorld,
  KeyM: () => {
    if (app.auto) setAuto(false)
  },
  KeyR: () =>
    app.auto && app.world === 'site' ? startDemo() : resetTo(app.lastSpot),
  Digit1: () => resetTo('start'),
  Digit2: () => {
    resetTo('top')
    hud.popup('Hanging at 170° · hold <b>Shift</b> to fire the main thrusters', 2300, 'hint')
  },
  Digit3: () => {
    resetTo('lineup')
    hud.popup('Build speed, then <b>F</b> to lift and <b>K</b> to kickflip', 2300, 'hint')
  },
  KeyV: () => polish.cycleCam(setCam), // (in a car or on foot: polish.js)
  KeyT: toggleSlow,
  KeyL: () => climate.skipTime(),
  KeyO: () => climate.nextWeather(),
  KeyI: () => hud.toggleHelp(),
  KeyU: () => hud.toggleUnits(), // the speedometer in km/h or mph (remembered: hud.js)
  KeyH: () => setHorn(true),
  KeyN: toggleSound,
  KeyG: () => {
    if (app.auto) setAuto(false)
    app.fanMode =
      app.fanMode === 'auto' ? 'on' : app.fanMode === 'on' ? 'off' : 'auto'
    hud.fanPopup(app.fanMode)
  },
  KeyB: () => hud.radio(sound.tuneRadio()), // the radio's next station (radio.js)
  KeyX: () => tryFlip('z'),
  KeyK: () => tryFlip('x')
}
// the top bar's buttons (each does what its key does) and the pause menu (Esc): ui/menu.js
// (before the input, so that while the menu is open it hears every key first and keeps it)
const menu = new Menu(COMMANDS, { app, hud, sound, rig, cityPilot, setCam })
app.onQuality = q => climate.quality(q) // (the menu's graphics quality)
const input = new Input({
  onDrive: (code, first) => {
    if (intro.active) intro.finish()
    // E: in or out of a car (onFoot.js); on foot, Space jumps
    if (code === 'KeyE' && first && foot.interact()) return input.handoff()
    if (foot.onFoot()) return foot.fight.press(code, first) // (Space jumps, F punches: footFight.js)
    if (code === 'Space' && first) sound.ratchet()
    if (app.auto) setAuto(false)
  },
  onCommand: code => foot.fight.command(code) || COMMANDS[code]?.(),
  onRelease: code => {
    if (code === 'KeyH') setHorn(false)
  },
  onPad: () =>
    hud.popup(
      'Gamepad ready · <b>RT</b> drive · <b>LT</b> brake · <b>A</b> e-brake · ' +
        '<b>RB</b> boost · <b>LB</b> fly · <b>Y</b> get in / out',
      4000,
      'hint'
    )
})
Object.assign(rig, { traffic, input }) // (camera.js: clear of the cars, Z to look back)
// the player on foot, and in and out of any car (onFoot.js)
const foot = new OnFoot({ app, sim, RS, rig, camera, canvas, input, hud, sound, traffic, peds, intro, setCam, cityView })
const polish = new Polish({ foot, rig, sound, hud, cityView, RS, app, game: () => game })
const game = new Game({ sim, foot, traffic, peds, hud, minimap, app, damage, respawn: at => resetTo('city', at) })
menu.game = game // (the stats tab, the hints: ui/ux.js)
// browsers only allow audio after a gesture: the first click or key turns sound on
function unlockSound (e) {
  if (e.code === 'KeyN' || e.target?.closest?.('#btnSound')) return
  if (!sound.ctx && !sound.userMuted) {
    sound.setEnabled(true)
    app.soundOn = sound.enabled
    hud.setSound(sound.enabled)
  } else if (sound.enabled && sound.ctx?.state === 'suspended') sound.ctx.resume()
}
window.addEventListener('pointerdown', unlockSound, true)
window.addEventListener('keydown', unlockSound, true)

// ---------- events from the sim: events.js ----------
const handleEvents = (s = foot.seen()) =>
  simEvents({ sim: s, app, hud, sound, rig, cityView, ap, clock, pad: input.pad })
// a knocked-down light, signal or tree hits the ground
cityView.onLand = (x, z, kind) => {
  fallFx(x, z, kind)
  sound.fall(kind, hearing(x, z), panOf(x, z))
}

const _walker = new THREE.Vector3()
// the camera's ground position and heading: traffic spawns out of its sight, the radar turns with it
const VIEW = { x: 0, z: 0, fx: 1, fz: 0, heading: 0 }
const _dir = new THREE.Vector3()
function updateView () {
  camera.getWorldDirection(_dir)
  const l = Math.hypot(_dir.x, _dir.z) || 1,
    b = rig.behind ? -1 : 1 // (looking back, the radar still faces the way ahead)
  VIEW.x = camera.position.x
  VIEW.z = camera.position.z
  VIEW.fx = _dir.x / l
  VIEW.fz = _dir.z / l
  VIEW.heading = Math.atan2(-_dir.z * b, _dir.x * b)
}

// ---------- main loop: fixed 120 Hz physics, variable-rate rendering ----------
const H = 1 / 120
// one physics step of everything that moves, under controls c
const demo = driveDemo(sim, traffic) // (?drive=van: a handling class to try, driveDemo.js)
function step (c, city) {
  if (city && demo) demo.step(H, c)
  foot.step(H, c, city, VIEW, peds, traffic)
  if (city) game.step(H, VIEW)
  app.lastCtl = c
}
// the controls of whatever the player drives (none on foot: their keys walk them, onFoot.js)
const controls = () => (foot.driven() ? input.controls(foot.driven(), app.fanMode) : HOLD)
let acc = 0,
  last = performance.now(),
  clock = 0,
  firstFrame = true
function frame (now) {
  requestAnimationFrame(frame)
  // paused (the pause menu): nothing moves, and the last frame stays up behind it (drawn again if
  // a resize has blanked it)
  if (app.paused)
    return (last = now) && menu.blanked() && post.render(app.sim, rig.shot, 0)
  resolution.apply() // (a step in resolution before anything is sized or drawn)
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) // (never back: a first frame stamped before the load ended)
  last = now
  clock += dt
  input.poll()
  const P = pilot()
  const target = (app.slow ? 0.3 : 1) * (app.auto ? P.slow : 1)
  app.timeScale += (target - app.timeScale) * (1 - Math.exp(-5 * dt))
  acc += dt * app.timeScale
  let simDt = 0,
    steps = 0
  const city = app.world === 'city'
  if (city) updateView()
  while (acc >= H && steps < 14) {
    const c = app.auto
      ? P.update(H)
      : intro.active
      ? HOLD
      : controls()
    foot.before(tween)
    tween.before(city)
    step(c, city)
    acc -= H
    simDt += H
    steps++
    if (app.auto && P.restart) {
      if (city) respawn() // a wreck on Autopilot: back onto the nearest lane and carry on
      startAutopilot()
      break
    }
  }
  if (steps >= 14) acc = 0
  tickGame(simDt) // (the game events' clock: gameEvents.js)
  // Autopilot leaning on the horn, sat in a jam
  const ph = app.auto && !!P.horn
  if (ph !== app.pilotHorn) {
    app.pilotHorn = ph
    setHorn(ph)
  }
  if (city) game.simEvents(foot.seen().events) // (a hard knock into the traffic: a crime, game.js)
  for (const e of sim.events)
    if (e.type === 'bump') damage.hit(e, sim)
    else if (e.type === 'crash') damage.crash(sim.quat, e.speed, sim.vel)
  if (foot.seen() !== sim) sim.events.length = 0 // (the Roadster left in the street: dented, quiet)
  handleEvents()
  // a wreck at rest stays put (no respawn): say how to carry on from it
  if (!app.auto && foot.inRoadster() && sim.mode === 'crash' && sim.crashSettled && !app.restHint) {
    app.restHint = true
    hud.popup(
      sim.up().y > 0.95
        ? 'On its wheels · <b>W</b> to drive on'
        : '<b>A</b> / <b>D</b> to roll it back over',
      3000,
      'hint'
    )
  }
  if (app.auto && P.countdown !== app.lastCountdown) {
    if (P.countdown !== null) sound.beep(P.countdown === 0)
    app.lastCountdown = P.countdown
  }
  if (intro.active) {
    intro.update(dt)
    traffic.walker = intro.where(_walker)
  }
  app.intro = intro.active
  // draw this frame part of the way between the last two physics steps, so nothing judders
  tween.apply(Math.min(1, acc / H), city)
  const walking = foot.frame(dt, Math.min(1, acc / H), clock)
  updateRoadster(RS, sim, foot.inRoadster() ? app.lastCtl : HOLD, dt)
  followKeyLight(app.focus ? app.focus.pos : app.sim.pos, camera)
  const fx = polish.frame(dt) // (the car the player drives: playerCar.js, polish.js)
  updateSkids(fx, foot.seen())
  updateNozzles(RS, sim)
  emitThrusters(RS, sim, simDt, clock)
  emitTireSmoke(fx, foot.seen(), simDt)
  if (city) emitTrafficSpray(traffic, camera, simDt)
  LED_MAT.uniforms.uLit.value = sim.maxRampS
  LED_MAT.uniforms.uTime.value = clock
  const blink = Math.sin(clock * 2.4) > 0.6 ? 1 : 0.15
  MAT.beacon.color.setRGB(4 * blink, 0.2 * blink, 0.15 * blink)
  rig.simDt = simDt // (the sim's own time this frame: slow motion slows it)
  if (!intro.active && !walking) rig.update(dt, clock, foot.seen(), app.auto ? P.shot : null)
  // (from the driver's seat, the driver's head is where the camera is, and the street is heard
  // through the canopy)
  app.inside = !intro.active && foot.inRoadster() && rig.shot === 'cockpit'
  RS.optimus.head.visible = !app.inside
  // (after the camera has moved: the smoke is lit and sorted from where it now looks)
  camera.updateMatrixWorld()
  smoke.track(camera, sim)
  const pxScale =
    renderer.domElement.height / (2 * Math.tan((camera.fov * DEG) / 2))
  for (const p of ALL_PARTICLES) {
    p.mat.uniforms.uScale.value = pxScale
    p.update(simDt)
  }
  climate.update(dt, dt * app.timeScale, clock, city)
  if (city) {
    cityView.update(simDt, clock, traffic, camera, peds)
    minimap.update(dt, app.focus || app.sim, traffic, VIEW.heading)
  }
  game.frame(dt, city)
  mixSound(sound, app, traffic, dt, clock, peds)
  hud.update(dt, app)
  menu.frame(dt, city) // (hints, captions, stats: ui/ux.js)
  if (city) cityView.shadows(camera, [RS.car])
  resolution.begin()
  // (the street's reflection, while it is wet: inside the GPU's timing, so the resolution steps
  // down for it on a card it is too much for)
  climate.reflect(city)
  post.render(app.sim, rig.shot, dt)
  resolution.end()
  resolution.update(dt)
  tween.restore()
  if (firstFrame) {
    firstFrame = false
    hud.hideLoading()
    post.warmed = warmUp(cityView, RS, post) // every shader compiled up front (warm.js)
  }
}
// the city unless the address asks for the test site (#site)
if (location.hash !== '#site') enterCity()
// (in a frame, as on a shared page, the keys only reach the game once it has been clicked)
if (window.top !== window && !document.hasFocus())
  hud.popup('Click the picture, then drive with <b>W A S D</b>', 6000, 'hint')
requestAnimationFrame(frame)
// debugging hook for the console and automated checks: fast-forward the sim without rendering
window.__roadster = {
  ...{ sim, env: ENV, climate, RS, damage, intro, tween, ap, rig, sound, app, traffic, peds, hud },
  ...{ cityView, renderer, resolution, post, menu, player, vehicles, foot, events: GAME_EVENTS, game, polish },
  ...{ setAuto, resetTo, seatIn: type => polish.seatIn(type, { traffic, sim }) },
  setWorld,
  toggleWorld,
  // (the player's side, getting in and out and the prompt, kept up each 1/30 s)
  advance (sec) {
    for (let t = 0, n = 0; t < sec; t += H, n++) {
      foot.before(tween)
      step(app.auto ? pilot().update(H) : controls(), app.world === 'city')
      if (n % 4 === 3) foot.frame(H * 4, 1, clock)
    }
    handleEvents()
  }
}
