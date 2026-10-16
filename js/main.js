// Tesla Roadster Sim: boot, game state, sim events and the main loop.
import * as THREE from 'three'
import { Hud } from './ui/hud.js'
import { Sim } from './sim/sim.js'
import { Input } from './ui/input.js'
import { Autopilot } from './sim/autopilot.js'
import { SoundEngine } from './audio/sound.js'
import { buildLineup } from './render/lineup.js'
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
const app = {
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
  crashClock: 0,
  lastCountdown: null,
  wheelAudio: 0
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
function startAutopilot () {
  sim.reset('start')
  ap.reset()
  app.score = 0
  app.lastSpot = 'start'
  for (const p of ALL_PARTICLES) p.clear()
  clearSkids()
  setCam('director')
  setAuto(true)
}
function resetTo (spot) {
  sim.reset(spot)
  app.lastSpot = spot
  app.score = 0
  app.crashClock = 0
  if (app.auto) setAuto(false)
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
  KeyM: () => {
    if (app.auto) setAuto(false)
  },
  KeyR: () => (app.auto ? startAutopilot() : resetTo(app.lastSpot)),
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
        7 + Math.abs(e.vy)
      )
      rig.shake(Math.min(0.6, 0.05 + Math.abs(e.vy) * 0.04))
      sound.thump(e.g)
      if (app.auto) ap.cap[2] = `Touchdown at ${e.g.toFixed(1)} G`
    } else if (e.type === 'crash') {
      sparkBurst(sim.com, 120)
      burst(sim.com.x, sim.com.z, 80, 8)
      rig.shake(0.9)
      app.crashClock = 0
      sound.crash()
      hud.popup(`Crash · ${e.reason}`, 2600)
    }
  }
  sim.events.length = 0
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
  const target = (app.slow ? 0.3 : 1) * (app.auto ? ap.slow : 1)
  app.timeScale += (target - app.timeScale) * (1 - Math.exp(-5 * dt))
  acc += dt * app.timeScale
  let simDt = 0,
    steps = 0
  while (acc >= H && steps < 14) {
    const c = app.auto ? ap.update(H) : input.controls(sim, app.fanMode)
    sim.step(H, c)
    app.lastCtl = c
    acc -= H
    simDt += H
    steps++
    if (app.auto && ap.restart) {
      startAutopilot()
      break
    }
  }
  if (steps >= 14) acc = 0
  handleEvents()
  if (
    !app.auto &&
    sim.mode === 'crash' &&
    sim.crashSettled &&
    (app.crashClock += dt) > 2.5
  )
    resetTo(app.lastSpot)
  if (app.auto && ap.countdown !== app.lastCountdown) {
    if (ap.countdown !== null) sound.beep(ap.countdown === 0)
    app.lastCountdown = ap.countdown
  }
  updateRoadster(RS, sim, app.lastCtl, dt)
  followKeyLight(sim.pos)
  updateSkids(RS, sim)
  updateNozzles(RS, sim)
  emitThrusters(RS, sim, simDt, clock)
  emitTireSmoke(RS, sim, simDt)
  const pxScale =
    renderer.domElement.height / (2 * Math.tan((camera.fov * DEG) / 2))
  for (const p of ALL_PARTICLES) {
    p.mat.uniforms.uScale.value = pxScale
    p.update(simDt)
  }
  LED_MAT.uniforms.uLit.value = sim.maxRampS
  LED_MAT.uniforms.uTime.value = clock
  const blink = Math.sin(clock * 2.4) > 0.6 ? 1 : 0.15
  MAT.beacon.color.setRGB(4 * blink, 0.2 * blink, 0.15 * blink)
  rig.update(dt, clock, sim, app.auto ? ap.shot : null)
  updateSound(dt)
  hud.update(dt, app)
  composer.render()
  if (firstFrame) {
    firstFrame = false
    hud.hideLoading()
  }
}
resize()
requestAnimationFrame(frame)

// debugging hook for the console and automated checks: fast-forward the sim without rendering
window.__roadster = {
  sim,
  ap,
  rig,
  sound,
  app,
  setAuto,
  resetTo,
  advance (sec) {
    for (let t = 0; t < sec; t += H) {
      const c = app.auto ? ap.update(H) : input.controls(sim, app.fanMode)
      sim.step(H, c)
      app.lastCtl = c
    }
    handleEvents()
  }
}
