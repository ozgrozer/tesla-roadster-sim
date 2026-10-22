// What the game's systems put in the world to see (game.js updates it each frame): the missions'
// markers, GTA's glowing cylinders with a ring on the ground (a mission's start, the place an
// objective points at, the next checkpoint dimmer), and the police helicopter overhead, rotor
// turning, its lights blinking and its spotlight's cone and pool on the ground. All unlit, additive
// materials (cheap, nothing for the lights to recompile); the police cars themselves are the
// traffic's, drawn by render/traffic.js with their light bars going.
import * as THREE from 'three'
import { scene, camera, canvasTex } from './scene.js'

const MAX_MARKERS = 12
// m from the camera a marker is drawn within (three draws each: past this they are a few pixels,
// and the radar and the map show them anyway)
export const MARKER_FAR = 450
const _up = new THREE.Vector3(0, -1, 0),
  _way = new THREE.Vector3()
// a soft fade from the bottom up: the cylinder's glow
const fadeTex = canvasTex(
  64,
  (g, s) => {
    const grd = g.createLinearGradient(0, s, 0, 0)
    grd.addColorStop(0, 'rgba(255,255,255,0.95)')
    grd.addColorStop(0.35, 'rgba(255,255,255,0.4)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
  },
  1
)
// a soft disc: the spotlight's pool and the ring's glow
const discTex = canvasTex(
  128,
  (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grd.addColorStop(0, 'rgba(255,255,255,0.9)')
    grd.addColorStop(0.6, 'rgba(255,255,255,0.35)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
  },
  1
)
fadeTex.wrapS = fadeTex.wrapT = discTex.wrapS = discTex.wrapT = THREE.ClampToEdgeWrapping
const glow = (map, color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  })

export class CrimeView {
  constructor () {
    this.group = new THREE.Group()
    this.group.name = 'crime'
    scene.add(this.group)
    this.t = 0
    // markers
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true)
    cyl.translate(0, 0.5, 0)
    const ring = new THREE.RingGeometry(0.82, 1, 40)
    ring.rotateX(-Math.PI / 2)
    this.markers = []
    for (let i = 0; i < MAX_MARKERS; i++) {
      const m = new THREE.Group()
      const tube = new THREE.Mesh(cyl, glow(fadeTex, 0xffd040, 0.85))
      const base = new THREE.Mesh(ring, glow(null, 0xffd040, 0.9))
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), glow(discTex, 0xffd040, 0.35))
      tube.renderOrder = base.renderOrder = pool.renderOrder = 5
      m.add(tube, base, pool)
      m.visible = false
      m.userData = { tube, base, pool }
      this.group.add(m)
      this.markers.push(m)
    }
    this.heli = this.buildHeli()
    this.group.add(this.heli)
  }
  buildHeli () {
    const h = new THREE.Group()
    const dark = new THREE.MeshBasicMaterial({ color: 0x15181d })
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8).scale(1.6, 0.9, 0.9), dark)
    const boom = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 0.35), dark)
    boom.position.set(-4, 0.3, 0)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.12), dark)
    fin.position.set(-6.4, 0.9, 0)
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.06, 0.32),
      new THREE.MeshBasicMaterial({ color: 0x0c0d10, transparent: true, opacity: 0.7 })
    )
    rotor.position.y = 1.2
    const rotor2 = rotor.clone()
    rotor2.rotation.y = Math.PI / 2
    const hub = new THREE.Group()
    hub.add(rotor, rotor2)
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a20 }))
    red.position.set(-6.4, 1.6, 0)
    const white = red.clone()
    white.material = new THREE.MeshBasicMaterial({ color: 0xffffff })
    white.position.set(1.8, -0.8, 0)
    // the spotlight: a cone from under its nose down to the pool on the ground
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 1, 1, 24, 1, true).translate(0, -0.5, 0),
      glow(fadeTex, 0xdfe8ff, 0.16)
    )
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), glow(discTex, 0xe8f0ff, 0.75))
    pool.renderOrder = 6
    h.add(body, boom, fin, hub, red, white)
    h.visible = false
    h.userData = { hub, red, white, cone, pool }
    this.group.add(cone, pool)
    cone.visible = pool.visible = false
    return h
  }
  show (on) {
    this.group.visible = on
  }
  // markers: [{ kind: 'start' | 'target' | 'next', x, z, color }] (missions.markers);
  // heli: police.js Heli; dark: how dark it is (0 day to 1 night)
  update (dt, markers, heli, dark = 0) {
    this.t += dt
    const t = this.t
    for (let i = 0; i < MAX_MARKERS; i++) {
      const m = this.markers[i],
        k = markers[i]
      const cp = camera.position
      m.visible = !!k && Math.abs(k.x - cp.x) < MARKER_FAR && Math.abs(k.z - cp.z) < MARKER_FAR && Math.hypot(k.x - cp.x, k.z - cp.z) < MARKER_FAR
      if (!m.visible) continue
      const { tube, base, pool } = m.userData
      const r = k.kind === 'start' ? 2.6 : k.kind === 'next' ? 3.2 : 4.2
      const h = k.kind === 'start' ? 4.6 : k.kind === 'next' ? 4 : 7
      m.position.set(k.x, 0.06, k.z)
      tube.scale.set(r, h * (1 + 0.05 * Math.sin(t * 3 + i)), r)
      base.scale.setScalar(r)
      pool.scale.setScalar(r * 1.25)
      const c = k.color || '#ffd040'
      for (const o of [tube, base, pool]) o.material.color.set(c)
      const a = k.kind === 'next' ? 0.4 : 1
      tube.material.opacity = (0.75 + 0.2 * Math.sin(t * 2.4 + i)) * a * (1 - 0.3 * dark)
      base.material.opacity = 0.85 * a
      pool.material.opacity = 0.3 * a
    }
    const H = this.heli,
      u = H.userData
    const on = !!heli?.on
    H.visible = u.cone.visible = u.pool.visible = on
    if (!on) return
    H.position.set(heli.x, heli.y, heli.z)
    H.rotation.set(0, heli.yaw, -0.08 * Math.min(1, Math.hypot(heli.vx, heli.vz) / 20))
    u.hub.rotation.y = t * 38
    u.red.visible = Math.sin(t * 6) > 0.4
    u.white.visible = Math.sin(t * 6 + 2) > 0.7
    // the cone from the nose to the pool: stretched and tilted between them
    const sx = heli.spot.x,
      sz = heli.spot.z
    const dx = sx - heli.x,
      dz = sz - heli.z,
      dy = -(heli.y - 1),
      len = Math.hypot(dx, dy, dz)
    const r = 6 + 2 * Math.sin(t * 0.8)
    u.cone.position.set(heli.x, heli.y - 1, heli.z)
    u.cone.scale.set(r, len, r)
    u.cone.quaternion.setFromUnitVectors(_up, _way.set(dx / len, dy / len, dz / len))
    u.cone.material.opacity = 0.05 + 0.18 * dark
    u.pool.position.set(sx, 0.12, sz)
    u.pool.scale.setScalar(r * 1.15)
    u.pool.material.opacity = 0.25 + 0.6 * dark
  }
}
