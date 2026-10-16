// Cameras: the autopilot's director shots, a GTA-style follow camera, chase, side and free orbit.
import * as THREE from 'three'
import { clamp, wrapPi } from '../sim/constants.js'
import { TRACK, LINEUP_FIRST, LINEUP_LAST } from '../sim/track.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const CAM_MODES = ['director', 'follow', 'chase', 'side', 'free']
export const CAM_NAMES = {
  director: 'Director',
  follow: 'Follow',
  chase: 'Chase',
  side: 'Side',
  free: 'Free'
}

const lerpK = (k, dt) => 1 - Math.exp(-k * dt)
const BLEND_TIME = 1.8 // s to ease from one shot into the next (cuts skip it)
const _p = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _t = new THREE.Vector3()
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
      dist: 8.5,
      elev: 1,
      idle: 99,
      target: new THREE.Vector3()
    }
    this.drag = null
    dom.addEventListener('pointerdown', e => {
      if (this.mode === 'follow' && e.button === 0 && e.pointerType === 'mouse')
        this.drag = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', e => {
      if (!this.drag) return
      this.f.yawOff -= (e.clientX - this.drag.x) * 0.006
      this.f.pitchOff = clamp(
        this.f.pitchOff + (e.clientY - this.drag.y) * 0.004,
        -0.3,
        0.95
      )
      this.drag.x = e.clientX
      this.drag.y = e.clientY
      this.f.idle = 0
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
  }
  cycle () {
    this.setMode(
      CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length]
    )
    return this.mode
  }
  shake (a) {
    this.shakeAmt = Math.max(this.shakeAmt, a)
  }

  // GTA-style: sit behind the car's heading (not its velocity), ignore pitch and roll so flips never
  // throw the camera, and hold the heading through the wall ride and any manoeuvre.
  follow (dt, sim, P) {
    const f = this.f,
      fw = sim.fwd(_f),
      up = sim.up(_u)
    if (up.y > 0.55 && Math.hypot(fw.x, fw.z) > 0.3 && sim.mode !== 'ramp')
      f.targetHeading = Math.atan2(-fw.z, fw.x)
    if (!f.init) {
      const v = sim.vel
      if (!(up.y > 0.55) && Math.hypot(v.x, v.z) > 1)
        f.targetHeading = Math.atan2(-v.z, v.x)
      f.init = true
      f.heading = f.targetHeading
      f.target.copy(P)
      f.elev = sim.mode === 'ramp' ? up.y : 1
    }
    f.heading += wrapPi(f.targetHeading - f.heading) * lerpK(3.2, dt)
    f.idle += dt
    if (f.idle > 1.5 && !this.drag) {
      const k = lerpK(2, dt)
      f.yawOff -= f.yawOff * k
      f.pitchOff -= f.pitchOff * k
    }
    // on the wall the arm follows the car's up vector, so it drops below the car when it hangs inverted
    f.elev += ((sim.mode === 'ramp' ? up.y : 1) - f.elev) * lerpK(3, dt)
    const speed = sim.groundSpeed()
    const dist = f.dist + Math.min(4, speed * 0.05)
    const yaw = f.heading + f.yawOff,
      pitch = 0.2 + f.pitchOff
    f.target.x += (P.x - f.target.x) * lerpK(12, dt)
    f.target.z += (P.z - f.target.z) * lerpK(12, dt)
    f.target.y += (P.y - f.target.y) * lerpK(6, dt)
    const h = Math.cos(pitch) * dist
    this.pos.set(
      f.target.x - Math.cos(yaw) * h,
      f.target.y + (Math.sin(pitch) * dist + 1.3) * f.elev,
      f.target.z + Math.sin(yaw) * h
    )
    this.pos.y = Math.max(this.pos.y, 0.7)
    this.aim.set(f.target.x, f.target.y + 1.0 * f.elev, f.target.z)
    return 55 + Math.min(14, speed * 0.12)
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
    const d = this.chaseDir
    this.pos.set(P.x - d.x * 9.5, Math.max(P.y + 3.4, 1.2), P.z - d.z * 9.5)
    this.aim.set(P.x + d.x * 3, P.y + 0.8, P.z + d.z * 3)
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
    if (shot === 'follow' && this.shot !== 'follow') this.f.init = false
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
      default:
        shot = 'follow'
        fov = this.follow(dt, sim, P)
        snap = true
    }
    const cam = this.camera
    if (entering) {
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
    if (this.clip && (shot === 'follow' || shot === 'chase'))
      this.clip(this.look, cam.position)
    cam.fov += (fov - cam.fov) * lerpK(3, dt)
    cam.updateProjectionMatrix()
    cam.up.set(0, 1, 0)
    cam.lookAt(this.look)
    if (this.shakeAmt > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt
      this.shakeAmt *= Math.exp(-dt * 6)
    }
  }
}
