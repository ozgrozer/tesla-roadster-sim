// Tesla Roadster Sim: boot, game state, sim events and the main loop.
import * as THREE from 'three'
import { Hud } from './ui/hud.js'
import { Sim } from './sim/sim.js'
import { Input } from './ui/input.js'
import { Minimap } from './ui/minimap.js'
import { smoke } from './render/smoke.js'
import { Intro } from './render/intro.js'
import { Tween } from './render/tween.js'
import { Peds } from './sim/peds.js'
import { Traffic } from './sim/traffic.js'
import { SoundEngine } from './audio/sound.js'
import { Autopilot } from './sim/autopilot.js'
import { CityPilot } from './sim/cityPilot.js'
import { buildLineup } from './render/lineup.js'
import { nearestLane, standUp } from './sim/city.js'
import { handleEvents as simEvents } from './events.js'
import { CityView, clipCamera } from './render/city.js'
import { hearing, panOf, mixSound } from './audio/mix.js'
import { CameraRig, CAM_NAMES } from './render/camera.js'
import { updateSkids, clearSkids } from './render/skids.js'
import { DEG, TAU, makeControls } from './sim/constants.js'
import { LED_MAT, buildWall, buildTruss } from './render/wall.js'
import { buildRoadster, updateRoadster } from './render/roadster.js'
import { speedBlurPass, updateSpeedBlur } from './render/speedBlur.js'
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
  fallFx,
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
const speedBlur = speedBlurPass()
composer.addPass(speedBlur)
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
rig.cockpit = { head: RS.optimus.head, body: RS.body }
const sound = new SoundEngine()
const hud = new Hud(RS)
const traffic = new Traffic()
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
  pilotHorn: false
}

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
  if (app.world !== 'city') return startDemo()
  cityPilot.reset()
  if (!cityPilot.join()) {
    hud.popup(
      'Autopilot needs a street · drive onto a lane first',
      2200,
      'hint'
    )
    return
  }
  setCam('follow')
  setAuto(true)
}
function resetTo (spot, at = null) {
  intro.finish(true)
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
  hud.setWorld(w)
  for (const p of ALL_PARTICLES) p.clear()
  clearSkids()
  // a reload lands back in the same world (the city is the default, the test site is #site)
  const url = location.pathname + location.search
  history.replaceState(null, '', w === 'site' ? `${url}#site` : url)
}
// the city opens on Optimus walking up to the Roadster and getting in
function enterCity () {
  resetTo('city')
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
    hud.popup(
      'Hanging at 170° · hold <b>Shift</b> to fire the main thrusters',
      2300,
      'hint'
    )
  },
  Digit3: () => {
    resetTo('lineup')
    hud.popup(
      'Build speed, then <b>F</b> to lift and <b>K</b> to kickflip',
      2300,
      'hint'
    )
  },
  KeyV: () => setCam(rig.cycle()),
  KeyT: toggleSlow,
  KeyI: () => hud.toggleHelp(),
  KeyH: () => setHorn(true),
  KeyN: toggleSound,
  KeyG: () => {
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
    if (intro.active) intro.finish()
    if (code === 'Space' && first) sound.ratchet()
    if (app.auto) setAuto(false)
  },
  onCommand: code => COMMANDS[code]?.(),
  onRelease: code => {
    if (code === 'KeyH') setHorn(false)
  },
  onPad: () =>
    hud.popup(
      'Gamepad ready · <b>RT</b> drive · <b>LT</b> brake · <b>A</b> e-brake · ' +
        '<b>RB</b> boost · <b>LB</b> fly',
      4000,
      'hint'
    )
})
hud.el.mode.addEventListener('click', () =>
  app.auto ? setAuto(false) : startAutopilot()
)
hud.el.world.addEventListener('click', toggleWorld)
hud.el.camBtn.addEventListener('click', () => setCam(rig.cycle()))
hud.el.slow.addEventListener('click', toggleSlow)
hud.el.helpBtn.addEventListener('click', () => hud.toggleHelp())
hud.el.sound.addEventListener('click', toggleSound)
// a clicked button lets go of focus, or Space (the e-brake) would press it again
for (const b of document.querySelectorAll('.btn'))
  b.addEventListener('click', e => e.detail && b.blur())
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

// ---------- events from the sim: events.js ----------
const handleEvents = () =>
  simEvents({ sim, app, hud, sound, rig, cityView, ap, clock, pad: input.pad })
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
  input.poll()
  // the right stick looks round the car (in the air it yaws it instead)
  if (sim.mode !== 'air' && (input.pad.lookX || input.pad.lookY))
    rig.turn(input.pad.lookX * dt * 2.6, -input.pad.lookY * dt * 1.6)
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
      : input.controls(sim, app.fanMode)
    tween.before(city)
    sim.step(H, c)
    if (city) {
      peds.step(H, sim, traffic, VIEW)
      traffic.step(H, sim, VIEW)
    }
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
  // Autopilot leaning on the horn, sat in a jam
  const ph = app.auto && !!P.horn
  if (ph !== app.pilotHorn) {
    app.pilotHorn = ph
    setHorn(ph)
  }
  handleEvents()
  // a wreck at rest stays put (no respawn): say how to carry on from it
  if (!app.auto && sim.mode === 'crash' && sim.crashSettled && !app.restHint) {
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
  if (!intro.active) rig.update(dt, clock, sim, app.auto ? P.shot : null)
  // (from the driver's seat, the driver's head is where the camera is, and the street is heard
  // through the canopy)
  app.inside = !intro.active && rig.shot === 'cockpit'
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
  if (city) {
    cityView.update(simDt, clock, traffic, camera, peds)
    minimap.update(dt, sim, traffic, VIEW.heading)
  }
  mixSound(sound, app, traffic, dt, clock)
  hud.update(dt, app)
  updateSpeedBlur(speedBlur, sim, rig.shot, dt)
  if (city) cityView.shadows(camera, [RS.car])
  composer.render()
  tween.restore()
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
  RS,
  intro,
  tween,
  ap,
  rig,
  sound,
  app,
  traffic,
  peds,
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
      if (app.world === 'city') {
        peds.step(H, sim, traffic, VIEW)
        traffic.step(H, sim, VIEW)
      }
      app.lastCtl = c
    }
    handleEvents()
  }
}
