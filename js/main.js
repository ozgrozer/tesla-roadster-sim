// Tesla Roadster Sim: boot, game state, sim events and the main loop.
import * as THREE from 'three'
import { Hud } from './ui/hud.js'
import { Sim } from './sim/sim.js'
import { Input } from './ui/input.js'
import { Minimap } from './ui/minimap.js'
import { smoke } from './render/smoke.js'
import { Traffic } from './sim/traffic.js'
import { Autopilot } from './sim/autopilot.js'
import { CityPilot } from './sim/cityPilot.js'
import { SoundEngine } from './audio/sound.js'
import { buildLineup } from './render/lineup.js'
import { nearestLane, standUp } from './sim/city.js'
import { CityView, clipCamera } from './render/city.js'
import { CameraRig, CAM_NAMES } from './render/camera.js'
import { updateSkids, clearSkids } from './render/skids.js'
import { LED_MAT, buildWall, buildTruss } from './render/wall.js'
import { DEG, TAU, clamp, makeControls } from './sim/constants.js'
import { buildRoadster, updateRoadster } from './render/roadster.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import {
  MAT,
  scene,
  camera,
  canvas,
  renderer,
  followKeyLight
} from './render/scene.js'
import {
  burst,
  fallFx,
  knockFx,
  sparkBurst,
  ALL_PARTICLES,
  updateNozzles,
  emitThrusters,
  emitTireSmoke,
  attachDiamonds
} from './render/effects.js'

// ---------- world ----------
buildWall()
buildTruss()
buildLineup()
const RS = buildRoadster()
attachDiamonds(RS)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55,
    0.45,
    0.95
  )
)
composer.addPass(new OutputPass())
function resize () {
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)

// ---------- state ----------
const sim = new Sim()
const ap = new Autopilot(sim)
const rig = new CameraRig(camera, canvas)
const sound = new SoundEngine()
const hud = new Hud(RS)
const traffic = new Traffic()
const cityPilot = new CityPilot(sim, traffic)
const cityView = new CityView()
const minimap = new Minimap(document.getElementById('radar'))
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
  lastBump: 0
}

function setAuto (on) {
  app.auto = on
  hud.setMode(on)
  if (!on) {
    ap.slow = 1
    app.fanMode = 'auto'
    if (rig.mode === 'director') setCam('follow')
  }
}
// the autopilot for the world the car is in: the reveal demo, or Autopilot on the city's streets
const pilot = () => (app.world === 'city' ? cityPilot : ap)
function startDemo () {
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
  if (app.world !== 'city') return startDemo()
  cityPilot.reset()
  if (!cityPilot.join()) {
    hud.popup('Autopilot needs a street · drive onto a lane first', 2200)
    return
  }
  setCam('follow')
  setAuto(true)
}
function resetTo (spot, at = null) {
  setWorld(spot === 'city' ? 'city' : 'site')
  sim.reset(spot, at)
  rig.cut()
  if (spot === 'city' && !at) {
    traffic.reset(sim.pos.x, sim.pos.z)
    standUp()
    cityView.standUp()
  }
  app.lastSpot = spot
  app.score = 0
  if (app.auto) setAuto(false)
}
// ---------- worlds: the test site and the city ----------
function setWorld (w) {
  if (app.world === w) return
  app.world = w
  app.ap = pilot()
  cityView.show(w === 'city')
  rig.clip = w === 'city' ? clipCamera : null
  hud.setWorld(w)
  for (const p of ALL_PARTICLES) p.clear()
  clearSkids()
  // a reload lands back in the same world (the city is the default, the test site is #site)
  const url = location.pathname + location.search
  history.replaceState(null, '', w === 'site' ? `${url}#site` : url)
}
function enterCity () {
  resetTo('city')
  setCam('follow')
  hud.popup('Welcome to the city · <b>C</b> for the test site', 3200)
  hud.popup('Gridlock on the avenue ahead · <b>Space</b> to jump it', 4200)
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
  hud.setCam(CAM_NAMES[mode])
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
function tryFlip (axis) {
  if (app.auto) setAuto(false)
  if (sim.mode !== 'air') {
    hud.popup('Get airborne first · hold <b>Space</b>', 1600)
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
    hud.popup('Hanging at 170° · hold <b>Shift</b> to fire the main thrusters')
  },
  Digit3: () => {
    resetTo('lineup')
    hud.popup('Build speed, then <b>Space</b> to lift and <b>K</b> to kickflip')
  },
  KeyV: () => setCam(rig.cycle()),
  KeyT: toggleSlow,
  KeyH: () => hud.toggleHelp(),
  KeyN: toggleSound,
  KeyF: () => {
    if (app.auto) setAuto(false)
    app.fanMode =
      app.fanMode === 'auto' ? 'on' : app.fanMode === 'on' ? 'off' : 'auto'
    hud.fanPopup(app.fanMode)
  },
  KeyX: () => tryFlip('z'),
  KeyK: () => tryFlip('x')
}
const input = new Input({
  onDrive: (code, first) => {
    if (code === 'KeyB' && first) sound.ratchet()
    if (app.auto) setAuto(false)
  },
  onCommand: code => COMMANDS[code]?.()
})
hud.el.mode.addEventListener('click', () =>
  app.auto ? setAuto(false) : startAutopilot()
)
hud.el.world.addEventListener('click', toggleWorld)
hud.el.camBtn.addEventListener('click', () => setCam(rig.cycle()))
hud.el.slow.addEventListener('click', toggleSlow)
hud.el.helpBtn.addEventListener('click', () => hud.toggleHelp())
hud.el.sound.addEventListener('click', toggleSound)
// browsers only allow audio after a gesture: the first click or key turns sound on
function unlockSound (e) {
  if (e.code === 'KeyN' || e.target?.closest?.('#btnSound')) return
  if (!sound.ctx && !sound.userMuted) {
    sound.setEnabled(true)
    app.soundOn = sound.enabled
    hud.setSound(sound.enabled)
  } else if (sound.ctx?.state === 'suspended') sound.ctx.resume()
}
window.addEventListener('pointerdown', unlockSound, true)
window.addEventListener('keydown', unlockSound, true)

// ---------- events from the sim ----------
function handleEvents () {
  for (const e of sim.events) {
    if (e.type === 'z60') {
      hud.popup(`0–60 mph · <b>${e.t.toFixed(2)} s</b>`)
      sound.chime()
    } else if (e.type === 'trick') {
      app.score += e.pts
      hud.popup(`${e.text} <b>+${e.pts}</b>`)
      sound.chime()
    } else if (e.type === 'landing') {
      app.score += e.pts
      hud.popup(
        `${e.tricks.length ? e.tricks.join(' + ') : 'Clean landing'} <b>+${
          e.pts
        }</b>`
      )
      hud.popup(`Airtime ${e.airtime.toFixed(1)} s · ${e.g.toFixed(1)} G`, 2000)
      sound.chime()
    } else if (e.type === 'touchdown') {
      burst(
        sim.pos.x,
        sim.pos.z,
        90 + Math.min(120, Math.abs(e.vy) * 20),
        7 + Math.abs(e.vy),
        sim.pos.y
      )
      rig.shake(Math.min(0.6, 0.05 + Math.abs(e.vy) * 0.04))
      sound.thump(e.g)
      if (app.auto) ap.cap[2] = `Touchdown at ${e.g.toFixed(1)} G`
    } else if (e.type === 'bump') {
      // knocks against cars, posts and walls in the city (a scrape fires every step: throttle it)
      if (e.impact > 1.2 && clock - app.lastBump > 0.15) {
        app.lastBump = clock
        sound.bump(e.impact)
        rig.shake(Math.min(0.3, e.impact * 0.025))
        if (e.impact > 6)
          sparkBurst(sim.pos, Math.min(60, e.impact * 4), sim.floor)
      }
    } else if (e.type === 'knock') {
      // a street light, signal or tree snapped off, by the Roadster or a car it sent sliding
      cityView.knock(e)
      knockFx(e)
      const mine = e.by === 'roadster'
      sound.snap(e.kind, e.impact * (mine ? 1 : hearing(e.x, e.z)))
      if (mine) rig.shake(Math.min(0.35, 0.06 + e.impact * 0.012))
    } else if (e.type === 'righted') {
      // rolled back onto its wheels after a crash
      burst(sim.pos.x, sim.pos.z, 60, 5, sim.pos.y)
      rig.shake(0.15)
      sound.thump(1.4)
    } else if (e.type === 'crash') {
      sparkBurst(sim.com, 120, sim.floor)
      burst(sim.com.x, sim.com.z, 80, 8, sim.floor)
      rig.shake(0.5)
      app.restHint = false
      sound.crash()
      hud.popup(`Crash · ${e.reason}`, 2600)
    }
  }
  sim.events.length = 0
}
// how loud something at (x, z) sounds from the camera, 0 to 1
const hearing = (x, z) =>
  clamp(
    1.4 / (1 + Math.hypot(camera.position.x - x, camera.position.z - z) / 14),
    0,
    1
  )
// a knocked-down light, signal or tree hits the ground
cityView.onLand = (x, z, kind) => {
  fallFx(x, z, kind)
  sound.fall(kind, hearing(x, z))
}

function updateSound (dt) {
  const gs =
    sim.mode === 'ground'
      ? Math.abs(sim.speed)
      : sim.mode === 'ramp'
      ? Math.abs(sim.v)
      : 0
  app.wheelAudio =
    sim.mode === 'air' || sim.mode === 'crash'
      ? app.wheelAudio * Math.exp(-dt * 0.8)
      : gs
  sound.update({
    volume:
      0.85 *
      clamp(1.7 / (1 + camera.position.distanceTo(sim.pos) / 16), 0.22, 1),
    pitch: 0.55 + 0.45 * app.timeScale,
    wheelSpeed: app.wheelAudio,
    throttle: app.lastCtl.throttle,
    regen: sim.regenOn,
    grounded: sim.mode === 'ground' || sim.mode === 'ramp' ? 1 : 0,
    airspeed: sim.vel.length(),
    skid: sim.skid,
    main: sim.thrMain,
    lift: sim.thrLift,
    side: sim.thrSide,
    suction: sim.suction,
    t: clock
  })
}

// the camera's ground position and heading: traffic spawns out of its sight, the radar turns with it
const VIEW = { x: 0, z: 0, fx: 1, fz: 0, heading: 0 }
const _dir = new THREE.Vector3()
function updateView () {
  camera.getWorldDirection(_dir)
  const l = Math.hypot(_dir.x, _dir.z) || 1
  VIEW.x = camera.position.x
  VIEW.z = camera.position.z
  VIEW.fx = _dir.x / l
  VIEW.fz = _dir.z / l
  VIEW.heading = Math.atan2(-_dir.z, _dir.x)
}

// ---------- main loop: fixed 120 Hz physics, variable-rate rendering ----------
const H = 1 / 120
let acc = 0,
  last = performance.now(),
  clock = 0,
  firstFrame = true
function frame (now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  clock += dt
  const P = pilot()
  const target = (app.slow ? 0.3 : 1) * (app.auto ? P.slow : 1)
  app.timeScale += (target - app.timeScale) * (1 - Math.exp(-5 * dt))
  acc += dt * app.timeScale
  let simDt = 0,
    steps = 0
  const city = app.world === 'city'
  if (city) updateView()
  while (acc >= H && steps < 14) {
    const c = app.auto ? P.update(H) : input.controls(sim, app.fanMode)
    sim.step(H, c)
    if (city) traffic.step(H, sim, VIEW)
    app.lastCtl = c
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
  handleEvents()
  // a wreck at rest stays put (no respawn): say how to carry on from it
  if (!app.auto && sim.mode === 'crash' && sim.crashSettled && !app.restHint) {
    app.restHint = true
    hud.popup(
      sim.up().y > 0.95
        ? 'On its wheels · <b>W</b> to drive on'
        : '<b>A</b> / <b>D</b> to roll it back over',
      3000
    )
  }
  if (app.auto && P.countdown !== app.lastCountdown) {
    if (P.countdown !== null) sound.beep(P.countdown === 0)
    app.lastCountdown = P.countdown
  }
  updateRoadster(RS, sim, app.lastCtl, dt)
  followKeyLight(sim.pos)
  updateSkids(RS, sim)
  updateNozzles(RS, sim)
  emitThrusters(RS, sim, simDt, clock)
  emitTireSmoke(RS, sim, simDt)
  LED_MAT.uniforms.uLit.value = sim.maxRampS
  LED_MAT.uniforms.uTime.value = clock
  const blink = Math.sin(clock * 2.4) > 0.6 ? 1 : 0.15
  MAT.beacon.color.setRGB(4 * blink, 0.2 * blink, 0.15 * blink)
  rig.update(dt, clock, sim, app.auto ? P.shot : null)
  // (after the camera has moved: the smoke is lit and sorted from where it now looks)
  camera.updateMatrixWorld()
  smoke.track(camera, sim)
  const pxScale =
    renderer.domElement.height / (2 * Math.tan((camera.fov * DEG) / 2))
  for (const p of ALL_PARTICLES) {
    p.mat.uniforms.uScale.value = pxScale
    p.update(simDt)
  }
  if (city) {
    cityView.update(simDt, clock, traffic, camera)
    minimap.update(dt, sim, traffic, VIEW.heading)
  }
  updateSound(dt)
  hud.update(dt, app)
  composer.render()
  if (firstFrame) {
    firstFrame = false
    hud.hideLoading()
  }
}
resize()
// the city unless the address asks for the test site (#site)
if (location.hash !== '#site') enterCity()
requestAnimationFrame(frame)

// debugging hook for the console and automated checks: fast-forward the sim without rendering
window.__roadster = {
  sim,
  ap,
  rig,
  sound,
  app,
  traffic,
  cityView,
  renderer,
  setAuto,
  resetTo,
  setWorld,
  toggleWorld,
  advance (sec) {
    for (let t = 0; t < sec; t += H) {
      const c = app.auto ? pilot().update(H) : input.controls(sim, app.fanMode)
      sim.step(H, c)
      if (app.world === 'city') traffic.step(H, sim, VIEW)
      app.lastCtl = c
    }
    handleEvents()
  }
}
