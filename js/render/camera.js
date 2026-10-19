// Cameras: the autopilot's director shots, a GTA-style follow camera, chase, the driver's seat, side
// and free orbit; and, held, the look behind (follow.js), as GTA's.
import { shakeScale } from '../ui/options.js'
import * as THREE from 'three'
import { clamp } from '../sim/constants.js'
import { TRACK, LINEUP_FIRST, LINEUP_LAST } from '../sim/track.js'
import { follow, clipTraffic, ARM } from './follow.js'
import { hoodSeat, smoothClip } from './carCam.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const CAM_MODES = [
  'director',
  'follow',
  'far',
  'chase',
  'cockpit',
  'side',
  'free'
]
export const CAM_NAMES = {
  director: 'Director',
  follow: 'Follow',
  far: 'Far',
  chase: 'Chase',
  cockpit: 'Cockpit',
  side: 'Side',
  free: 'Free'
}
// the shots that ride along with the car (the road trembles up through them; speed blurs them)
export const RIDING = new Set(['follow', 'far', 'chase', 'cockpit'])

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
const BLEND_TIME = 1.8 // s to ease from one shot into the next (cuts skip it)
const SHOULDER = 2.7 // rad: how far round the driver's head turns to look back
const _p = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _t = new THREE.Vector3(),
  _r = new THREE.Vector3()
const FIX = {
  launch: new THREE.Vector3(-58, 1.3, 9),
  wallWide: new THREE.Vector3(-34, 3.2, 27),
  topClose: new THREE.Vector3(-13, 8.6, 13),
  flightWide: new THREE.Vector3(-26, 8, 36),
  lineupWide: new THREE.Vector3(-258, 4.5, 31),
  wallAim: new THREE.Vector3(2, 10, 0),
  introClose: new THREE.Vector3(-8, 1.4, 5.5), // low, just behind the car at the foot of the wall
  flightAim: new THREE.Vector3(-16, 13, 0),
  lineupAim: new THREE.Vector3(-261, 3, 0)
}

export class CameraRig {
  constructor (camera, dom) {
    this.camera = camera
    this.dom = dom
    this.mode = 'director'
    this.shot = ''
    this.shakeAmt = 0
    this.look = new THREE.Vector3(-90, 1, 0)
    this.pos = new THREE.Vector3()
    this.aim = new THREE.Vector3()
    // each shot keeps its own smoothed pose; shot changes ease from the previous camera into it
    this.shotPos = new THREE.Vector3()
    this.shotLook = new THREE.Vector3()
    // where the previous shot left the camera, relative to the car: transitions ride along with it
    this.fromOff = new THREE.Vector3()
    this.fromLookOff = new THREE.Vector3()
    this.orbit = { a0: 0, r0: 11, h0: 3 }
    this.blend = 1
    this.shotT = 0 // seconds since the current shot began
    this.chaseDir = new THREE.Vector3(1, 0, 0)
    this.clip = null // (aim, pos) => pulls pos in front of anything solid; set in the city
    // the traffic and the input, when main.js hands them over: the riding shots keep out of the
    // cars (follow.js: clipTraffic, and how far out it lets the camera, reach), and look behind
    // while the key is held (behind)
    this.traffic = this.input = null
    this.reach = Infinity
    this.behind = false
    this.cockpit = null // { head, body }: the driver's head and the car's body, for the Cockpit
    this.camUp = new THREE.Vector3(0, 1, 0)
    this.controls = new OrbitControls(camera, dom)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.maxDistance = 120
    // follow camera: heading-locked spring arm with mouse orbit that recentres
    this.f = {
      init: false,
      heading: 0,
      targetHeading: 0,
      yawOff: 0,
      pitchOff: 0,
      dist: ARM,
      reach: 0, // how far the arm lets out with speed, eased so a sudden stop doesn't yank it in
      ahead: 0, // how far down the road it looks, eased the same way
      elev: 1,
      idle: 99,
      kick: 0,
      surge: 0, // the arm giving with the car's acceleration
      target: new THREE.Vector3()
    }
    this.drag = null
    dom.addEventListener('pointerdown', e => {
      const looks = this.mode === 'follow' || this.mode === 'cockpit'
      if (looks && e.button === 0 && e.pointerType === 'mouse')
        this.drag = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', e => {
      if (!this.drag) return
      this.turn(
        (e.clientX - this.drag.x) * 0.006,
        (e.clientY - this.drag.y) * 0.004
      )
      this.drag.x = e.clientX
      this.drag.y = e.clientY
    })
    window.addEventListener('pointerup', () => {
      this.drag = null
    })
    dom.addEventListener(
      'wheel',
      e => {
        if (this.mode !== 'follow') return
        e.preventDefault()
        this.f.dist = clamp(this.f.dist * (e.deltaY > 0 ? 1.1 : 0.9), 4.5, 24)
      },
      { passive: false }
    )
  }

  setMode (m) {
    this.mode = m
    this.controls.enabled = m === 'free'
    if (m === 'free') this.controls.target.copy(this.look)
    if (m === 'follow') this.f.init = false
    this.f.yawOff = this.f.pitchOff = 0
    this.reach = Infinity
  }
  // the car was just put somewhere else: cut to it rather than ease over from where the camera was
  cut () {
    this.shot = ''
    this.f.init = false
    this.reach = Infinity
  }
  cycle () {
    this.setMode(
      CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length]
    )
    // (in the city the director's pick is the follow camera: on past it; the driver's seat is the
    // Roadster's, another car has the Hood camera instead: carCam.js, onFoot.js noCockpit)
    if (this.mode === 'director' && this.clip) return this.cycle()
    if (this.mode === 'cockpit' && this.noCockpit && !this.hood) return this.cycle()
    return this.mode
  }
  // a shot's name for the HUD (the Cockpit is the Hood camera in a car that isn't the Roadster)
  nameOf (m = this.mode) {
    return m === 'cockpit' && this.noCockpit ? 'Hood' : CAM_NAMES[m]
  }
  shake (a) {
    this.shakeAmt = Math.max(this.shakeAmt, a * shakeScale()) // (reduced motion: options.js)
  }
  // swing the follow camera round the car and up or down (a mouse drag, a gamepad's right stick);
  // it drifts back behind the car once it is left alone
  turn (dx, dy) {
    this.f.yawOff -= dx
    this.f.pitchOff = clamp(this.f.pitchOff + dy, -0.3, 0.95)
    this.f.idle = 0
  }

  follow (dt, sim, P) {
    return follow(this, dt, sim, P)
  }

  // From the driver's seat: the eyes just ahead of Optimus's head (hidden from in here), looking out
  // along the car through the windshield and a little down at the road, turned with the mouse or the
  // right stick, and a little way into the turn. It rides with the body, so it pitches and rolls on
  // the springs, and the view tilts with the car.
  driverSeat (dt, sim) {
    const { head, body } = this.cockpit
    const f = this.f
    f.idle += dt
    if (f.idle > 1.5 && !this.drag) {
      const k = lerpK(2, dt)
      f.yawOff -= f.yawOff * k
      f.pitchOff -= f.pitchOff * k
    }
    body.updateWorldMatrix(true, true)
    _f.set(1, 0, 0).transformDirection(body.matrixWorld)
    _u.set(0, 1, 0).transformDirection(body.matrixWorld)
    head.getWorldPosition(this.pos)
    this.pos.addScaledVector(_u, 0.1).addScaledVector(_f, 0.04)
    this.camUp.copy(_u)
    // the gaze: along the car, turned about its up axis and tipped down a little (looking back, the
    // head turned round over the right shoulder and the gaze level, over the seats)
    const yaw = f.yawOff + sim.steerAng * 0.5 - (this.behind ? SHOULDER : 0),
      pitch = (this.behind ? 0 : -0.1) - f.pitchOff * 0.6
    _t.copy(_f).applyAxisAngle(_u, yaw)
    _r.crossVectors(_t, _u).normalize() // (to the right of the gaze)
    _t.applyAxisAngle(_r, pitch)
    this.aim.copy(this.pos).addScaledVector(_t, 10)
    return 72
  }

  // velocity-led action camera
  chase (sim, P) {
    if (sim.mode === 'ramp') {
      const th = TRACK.theta(sim.s),
        up = sim.up(_u)
      this.pos.set(
        P.x - Math.sin(th) * 6.5 - Math.cos(th) * 3,
        P.y + Math.cos(th) * 6.5 - Math.sin(th) * 3,
        P.z + 7
      )
      this.aim.copy(P).addScaledVector(up, 0.6)
      return 58
    }
    const v = sim.vel,
      hv = Math.hypot(v.x, v.z),
      fw = sim.fwd(_f)
    const dir =
      hv > 2.5
        ? _t.set(v.x / hv, 0, v.z / hv)
        : _t.set(fw.x, 0, fw.z).normalize()
    if (dir.lengthSq() > 0.5) this.chaseDir.lerp(dir, 0.08).normalize()
    // (looking back, from as far ahead of the car)
    const d = this.chaseDir,
      back = this.behind ? -9.5 : 9.5,
      on = this.behind ? -3 : 3
    this.pos.set(P.x - d.x * back, Math.max(P.y + 3.4, 1.2), P.z - d.z * back)
    this.aim.set(P.x + d.x * on, P.y + 0.8, P.z + d.z * on)
    return 58
  }

  // director picks for manual driving, mirroring the autopilot's shot list
  manualShot (sim) {
    if (sim.world === 'city') return 'follow'
    const x = sim.pos.x,
      y = sim.pos.y
    if (sim.mode === 'ramp')
      return sim.s > TRACK.lipStart - 3
        ? 'topClose'
        : sim.s > 3
        ? 'wallWide'
        : 'follow'
    if (sim.mode === 'air' && sim.vel.y < -2 && sim.com.y < 16) return 'landing'
    if (sim.mode === 'air' && x > -75 && x < 15 && y > 4) return 'flightWide'
    const nearLineup = x < LINEUP_FIRST + 10 && x > LINEUP_LAST - 12
    if (nearLineup && (sim.mode === 'air' || Math.abs(sim.speed) > 6))
      return 'lineupWide'
    return 'follow'
  }

  update (dt, t, sim, autoShot) {
    const was = this.behind
    this.behind = false
    const P =
      sim.mode === 'air' || sim.mode === 'crash'
        ? _p.copy(sim.com)
        : _p.copy(sim.pos).add(sim.up(_u).multiplyScalar(0.6))
    if (this.mode === 'free') {
      _t.copy(P).sub(this.controls.target)
      this.controls.target.add(_t)
      this.camera.position.add(_t)
      this.controls.update()
      this.look.copy(this.controls.target)
      this.shot = 'free'
      return
    }
    let shot =
      this.mode === 'director' ? autoShot || this.manualShot(sim) : this.mode
    if (shot === 'far') shot = 'follow' // (the follow arm let out: follow.js)
    if (shot === 'follow' && this.shot !== 'follow') this.f.init = false
    // Z held looks back from the riding shots only (main.js turns the radar by it), and looking
    // back or ahead again is a cut: what kept the camera out of a car is forgotten
    this.behind = RIDING.has(shot) && !!this.input?.lookBack()
    const turned = this.behind !== was
    if (turned) this.reach = Infinity
    const entering = shot !== this.shot
    const st = entering ? 0 : this.shotT // time in the current shot
    let k = 3.5,
      lk = 7,
      fov = 50,
      cut = false,
      snap = false
    const pos = this.pos,
      aim = this.aim
    switch (shot) {
      case 'orbit': {
        // finale: start from wherever the camera already is, then slowly circle the car
        // while easing out to an 11 m radius
        const cp = this.camera.position
        if (entering) {
          this.orbit.a0 = Math.atan2(cp.z - P.z, cp.x - P.x)
          this.orbit.r0 = Math.max(5, Math.hypot(cp.x - P.x, cp.z - P.z))
          this.orbit.h0 = clamp(cp.y - P.y, 1.5, 9)
        }
        const o = this.orbit
        const u = Math.min(1, st / 3)
        const e = u * u * (3 - 2 * u)
        const a = o.a0 + 0.18 * st * e
        const r = o.r0 + (11 - o.r0) * e
        pos.set(
          P.x + Math.cos(a) * r,
          P.y + o.h0 + (3 - o.h0) * e,
          P.z + Math.sin(a) * r
        )
        aim.copy(P)
        fov = 42
        snap = true
        break
      }
      case 'intro': {
        // opening shot: start close on the car, then pull back to the wide wall framing so the
        // climb's 'wallWide' shot picks up exactly where this one ends
        const u = Math.min(1, st / 2.6)
        const e = u * u * (3 - 2 * u)
        pos.copy(FIX.introClose).lerp(FIX.wallWide, e)
        aim.copy(P).lerp(_t.copy(P).lerp(FIX.wallAim, 0.35), e)
        fov = 38 + 14 * e
        cut = true
        snap = true
        break
      }
      case 'launch':
        pos.copy(FIX.launch)
        aim.copy(P)
        fov = 38
        cut = true
        break
      case 'wallWide':
        pos.copy(FIX.wallWide)
        aim.copy(P).lerp(FIX.wallAim, 0.35)
        fov = 52
        break
      case 'topClose':
        pos.copy(FIX.topClose)
        aim.copy(P)
        fov = 40
        break
      case 'flightWide':
        pos.copy(FIX.flightWide)
        aim.copy(P).lerp(FIX.flightAim, 0.3)
        fov = 48
        break
      case 'lineupWide':
        pos.copy(FIX.lineupWide)
        aim.copy(P).lerp(FIX.lineupAim, 0.45)
        fov = 52
        break
      case 'tracking':
        // high enough to see over a landing cloud, rising with the car when it jumps
        pos.set(P.x + 10, 4.5 + Math.max(0, P.y) * 0.4, 20)
        aim.set(P.x - 7, Math.max(1, P.y * 0.7), 0)
        fov = 50
        k = 6
        break
      case 'landing': {
        // close shot beside the car that moves in and zooms as it nears the floor
        const near = clamp(1 - (P.y - 0.5) / 16, 0, 1)
        const dist = 16 - 4 * near
        pos.set(P.x - 3, Math.max(2.6, P.y * 0.55 + 1.6), P.z + dist)
        aim.copy(P)
        fov = 48 - 16 * near
        k = 3
        lk = 10
        break
      }
      case 'jumpTrack':
        // alongside the car through a high-speed jump: the lineup sweeps past underneath
        pos.set(P.x + 8, Math.max(3, P.y * 0.6 + 2), P.z + 24)
        aim.set(P.x, P.y * 0.6, P.z) // frame the car and the cars below it
        fov = 52
        k = 4
        lk = 10
        break
      case 'sideTrack':
        pos.set(P.x + 7, Math.max(2.2, P.y * 0.75), P.z + 19)
        aim.copy(P)
        fov = 46
        k = 2.2
        lk = 9
        break
      case 'side':
        pos.set(P.x, P.y + 2, P.z + 20)
        aim.copy(P)
        fov = 50
        k = 6
        break
      case 'chase':
        fov = this.chase(sim, P)
        k = sim.mode === 'ramp' ? 6 : 5
        break
      case 'cockpit':
        fov = this.hood ? hoodSeat(this, dt, this.hood, this.hoodS) : this.driverSeat(dt, sim)
        cut = snap = true
        break
      default:
        shot = 'follow'
        fov = this.follow(dt, sim, P)
        snap = true
    }
    if (turned) snap = true // (the chase camera too: round at once, not swept over the car)
    const cam = this.camera
    if (entering) {
      this.reach = Infinity
      if (cut || this.shot === '') {
        cam.fov = fov
        this.blend = 1
      } else {
        this.fromOff.copy(cam.position).sub(P)
        this.fromLookOff.copy(this.look).sub(P)
        this.blend = 0
      }
      this.shotPos.copy(pos)
      this.shotLook.copy(aim)
      this.shot = shot
      this.shotT = 0
    }
    this.shotT += dt
    if (snap) {
      // the follow arm does its own smoothing
      this.shotPos.copy(pos)
      this.shotLook.copy(aim)
    } else {
      this.shotPos.lerp(pos, lerpK(k, dt))
      this.shotLook.lerp(aim, lerpK(lk, dt))
    }
    this.blend = Math.min(1, this.blend + dt / BLEND_TIME)
    const e = this.blend * this.blend * (3 - 2 * this.blend)
    cam.position.copy(this.fromOff).add(P).lerp(this.shotPos, e)
    this.look.copy(this.fromLookOff).add(P).lerp(this.shotLook, e)
    if (this.clip && (shot === 'follow' || shot === 'chase')) {
      smoothClip(this, this.clip, this.look, cam.position, dt)
      if (this.traffic)
        clipTraffic(this, this.look, cam.position, this.traffic.cars, dt)
    }
    cam.fov += (fov - cam.fov) * lerpK(shot === 'cockpit' ? 12 : 3, dt)
    cam.updateProjectionMatrix()
    // (from the driver's seat the horizon tilts with the car; every other shot keeps it level)
    if (shot === 'cockpit') cam.up.copy(this.camUp)
    else cam.up.set(0, 1, 0)
    cam.lookAt(this.look)
    if (this.shakeAmt > 0.001) {
      // a quick judder that dies away, not a fresh random jump every frame
      cam.position.x += 0.5 * this.shakeAmt * Math.sin(t * 43)
      cam.position.y += 0.5 * this.shakeAmt * Math.sin(t * 37 + 1.3)
      this.shakeAmt *= Math.exp(-dt * 6)
    }
    // the road coming up through the car at speed: a fine tremble, coarser on the pier's planks and
    // coarser still on sand or grass
    if (RIDING.has(shot) && sim.mode === 'ground') {
      const rough =
        sim.surface === 'sand' || sim.surface === 'grass'
          ? 3
          : sim.surface === 'wood'
          ? 1.8
          : 1
      const a =
        clamp((sim.groundSpeed() - 18) / 70, 0, 1) * 0.011 * rough +
        (rough > 1 ? clamp(sim.groundSpeed() / 30, 0, 1) * 0.01 : 0)
      cam.position.y += a * Math.sin(t * 61.3) * Math.sin(t * 17.9 + 0.7)
      cam.position.x += a * 0.6 * Math.sin(t * 53.1 + 2.1)
    }
  }
}
