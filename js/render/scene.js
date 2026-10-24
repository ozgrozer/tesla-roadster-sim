// Renderer, scene, procedural textures, shared materials, lights and the test-site surroundings.
// Everything that belongs to the test site hangs off `site`, so it can be hidden for the city.
import * as THREE from 'three'
import { TAU } from '../sim/constants.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export const canvas = document.getElementById('c')
export let renderer
try {
  // (no antialiasing on the canvas: the frame is drawn into the effect composer's own targets and
  // only copied out onto the canvas, where multisampling would cost memory and nothing else)
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance'
  })
} catch (err) {
  document.querySelector('#loading div').textContent =
    'WebGL is unavailable in this browser, so the simulation cannot start.'
  throw err
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // (resolution.js lowers it if need be)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

export const scene = new THREE.Scene()
scene.background = new THREE.Color(0x040509)
scene.fog = new THREE.FogExp2(0x05060a, 0.0042)
export const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.32
export const site = new THREE.Group()
scene.add(site)

export const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  2500
)
camera.position.set(-80, 4, 14)

// ---------- procedural textures ----------
export function canvasTex (size, draw, repeat = 1, height = size) {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = height
  // (drawn once and read back by speckle: kept in memory rather than on the GPU)
  const g = cv.getContext('2d', { willReadFrequently: true })
  draw(g, size, height)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return t
}
// Grit: n specks, each a square 0.4 to 2.6 px across somewhere in a size-px tile, black (or white,
// light) at up to alpha opacity, blended straight into the canvas's pixels, each pixel by how much
// of it the speck covers (as the canvas would draw them, but tens of thousands of fillRects, each
// with a colour of its own, took most of a second at startup).
export function speckle (g, n, size, alpha, light) {
  const W = g.canvas.width,
    H = g.canvas.height
  const img = g.getImageData(0, 0, W, H),
    d = img.data
  const v = light ? 255 : 0
  for (let i = 0; i < n; i++) {
    const a = Math.random() * alpha
    const r = Math.random() * 2.2 + 0.4
    const x0 = Math.random() * size,
      y0 = Math.random() * size,
      x1 = Math.min(x0 + r, W),
      y1 = Math.min(y0 + r, H)
    for (let y = Math.floor(y0); y < y1; y++) {
      const cy = a * (Math.min(y + 1, y1) - Math.max(y, y0))
      for (let x = Math.floor(x0); x < x1; x++) {
        const k = cy * (Math.min(x + 1, x1) - Math.max(x, x0)),
          o = (y * W + x) * 4
        d[o] += (v - d[o]) * k
        d[o + 1] += (v - d[o + 1]) * k
        d[o + 2] += (v - d[o + 2]) * k
      }
    }
  }
  g.putImageData(img, 0, 0)
}
const concreteTex = canvasTex(512, (g, S) => {
  g.fillStyle = '#9a9c9e'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 40; i++) {
    // cloudy stains
    const x = Math.random() * S,
      y = Math.random() * S,
      r = 30 + Math.random() * 90
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const d = Math.random() < 0.5
    gr.addColorStop(0, d ? 'rgba(60,62,66,0.10)' : 'rgba(255,255,255,0.07)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  speckle(g, 9000, S, 0.22, false)
  speckle(g, 5000, S, 0.18, true)
  g.strokeStyle = 'rgba(40,42,46,0.35)'
  g.lineWidth = 2 // form-work panel joints
  g.beginPath()
  g.moveTo(0, 1)
  g.lineTo(S, 1)
  g.moveTo(S / 2, 0)
  g.lineTo(S / 2, S)
  g.stroke()
})
const asphaltTex = canvasTex(
  512,
  (g, S) => {
    g.fillStyle = '#2a2c30'
    g.fillRect(0, 0, S, S)
    speckle(g, 16000, S, 0.35, false)
    speckle(g, 7000, S, 0.12, true)
  },
  90
)
const padTex = canvasTex(512, (g, S) => {
  g.fillStyle = '#4a4c50'
  g.fillRect(0, 0, S, S)
  speckle(g, 12000, S, 0.25, false)
  speckle(g, 6000, S, 0.12, true)
  g.strokeStyle = 'rgba(15,16,18,0.6)'
  g.lineWidth = 3
  g.strokeRect(0, 0, S, S)
})
padTex.repeat.set(92, 3)
export const softTex = (() => {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
})()

// ---------- materials ----------
export const hdr = (r, g, b) => new THREE.Color(r, g, b)
export const MAT = {
  // Ano White under a clear coat: a deep gloss that takes the sky, the way the reveal car does
  paint: new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f6,
    roughness: 0.16,
    metalness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.25
  }),
  // satin black: sills, diffuser, wing
  trim: new THREE.MeshStandardMaterial({
    color: 0x0b0c0e,
    roughness: 0.48,
    metalness: 0.15
  }),
  // bronze-tinted like a spacesuit visor: a golden mirror from outside
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x8a5a26,
    roughness: 0.06,
    metalness: 1,
    transparent: true,
    opacity: 0.95,
    envMapIntensity: 1.5
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xdfe2e6,
    roughness: 0.14,
    metalness: 1
  }),
  tire: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({
    color: 0xc5c9cf,
    roughness: 0.16,
    metalness: 0.92
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xd6a84e,
    roughness: 0.28,
    metalness: 1.0
  }),
  hole: new THREE.MeshBasicMaterial({ color: 0x020203 }),
  headlight: new THREE.MeshBasicMaterial({
    color: hdr(3.2, 3.3, 3.6),
    toneMapped: false
  }),
  taillight: new THREE.MeshBasicMaterial({
    color: hdr(3.0, 0.12, 0.1),
    toneMapped: false
  }),
  road: new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.86,
    metalness: 0.0
  }),
  slab: new THREE.MeshStandardMaterial({
    map: concreteTex,
    color: 0x9a9da2,
    roughness: 0.9
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0x8c9198,
    roughness: 0.42,
    metalness: 0.75
  }),
  ground: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.96 }),
  pad: new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.9 }),
  line: new THREE.MeshStandardMaterial({
    color: 0xe6e6e6,
    roughness: 0.6,
    emissive: 0x222222
  }),
  ledRed: new THREE.MeshBasicMaterial({
    color: hdr(2.6, 0.12, 0.1),
    toneMapped: false
  }),
  lamp: new THREE.MeshBasicMaterial({
    color: hdr(6, 6, 5.6),
    toneMapped: false
  }),
  beacon: new THREE.MeshBasicMaterial({
    color: hdr(4, 0.2, 0.15),
    toneMapped: false,
    fog: false
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x1b1d21,
    roughness: 0.5,
    metalness: 0.6
  })
}

// ---------- lights ----------
export const hemi = new THREE.HemisphereLight(0x8394b8, 0x0b0b0d, 0.28)
scene.add(hemi)
export const key = new THREE.DirectionalLight(0xe4ebff, 1.15)
key.castShadow = true
// (3072 texels over 72 m where the card allows: a texel 2.3 cm, and the box set ahead of the camera)
const SHADOW_PX = renderer.capabilities.maxTextureSize >= 4096 ? 3072 : 2048
key.shadow.mapSize.set(SHADOW_PX, SHADOW_PX)
Object.assign(key.shadow.camera, {
  left: -36,
  right: 36,
  top: 36,
  bottom: -36,
  near: 1,
  far: 140
})
key.shadow.bias = -0.0004
key.shadow.normalBias = 0.03
scene.add(key, key.target)

function flood (x, y, z, tx, ty, tz, intensity, angle = 0.42) {
  const sp = new THREE.SpotLight(0xf3f1ea, intensity, 0, angle, 0.65, 1.6)
  sp.position.set(x, y, z)
  sp.target.position.set(tx, ty, tz)
  site.add(sp, sp.target)
  const head = new THREE.Group()
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.35),
    MAT.darkMetal
  )
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45), MAT.lamp)
  lens.position.z = 0.18
  head.add(box, lens)
  head.position.set(x, y, z)
  head.lookAt(tx, ty, tz)
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, y, 8),
    MAT.darkMetal
  )
  pole.position.set(x, y / 2, z)
  site.add(head, pole)
  return sp
}
flood(-34, 2.2, 15, 4, 12, 0, 380)
flood(-30, 2.2, -16, 4, 12, 0, 300)
flood(-12, 1.4, 22, 2, 18, 0, 220, 0.5)
flood(-242, 11, 16, -261, 1, 0, 300, 0.55)
flood(-60, 10, -22, -60, 0, 0, 380, 0.7)
flood(-105, 10, 18, -105, 0, 0, 380, 0.7)
flood(-170, 10, -18, -170, 0, 0, 380, 0.7)
flood(-340, 10, 18, -340, 0, 0, 380, 0.7)
flood(-440, 10, -18, -440, 0, 0, 380, 0.7)

// ---------- ground, runway, LED lines ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), MAT.ground)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
site.add(ground)
const pad = new THREE.Mesh(new THREE.PlaneGeometry(570, 18), MAT.pad)
pad.rotation.x = -Math.PI / 2
pad.position.set(-265, 0.01, 0)
pad.receiveShadow = true
site.add(pad)
for (const zz of [-8.4, 8.4]) {
  const led = new THREE.Mesh(new THREE.BoxGeometry(550, 0.04, 0.07), MAT.ledRed)
  led.position.set(-273, 0.03, zz)
  site.add(led)
}
for (let x = -545; x < -8; x += 6) {
  // centre dashes
  const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.14), MAT.line)
  d.rotation.x = -Math.PI / 2
  d.position.set(x, 0.02, 0)
  d.receiveShadow = true
  site.add(d)
}

// distant test stands with aviation beacons, plus faint stars
export const beacons = []
;[
  [-420, 70, -360],
  [-180, 46, -470],
  [260, 90, -420],
  [420, 38, 120],
  [-520, 55, 260],
  [120, 60, 480]
].forEach(([x, h, z]) => {
  const t = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), MAT.darkMetal)
  t.position.set(x, h / 2, z)
  site.add(t)
  const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), MAT.beacon)
  b.position.set(x, h + 1.5, z)
  site.add(b)
  beacons.push(b)
})
{
  const n = 1400,
    p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = Math.random() * TAU,
      v = Math.random() * 0.45 + 0.08
    p[i * 3] = Math.cos(u) * Math.cos(v) * 1200
    p[i * 3 + 1] = Math.sin(v) * 1200
    p[i * 3 + 2] = Math.sin(u) * Math.cos(v) * 1200
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  site.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0x9aa3b5,
        size: 1.4,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.55
      })
    )
  )
}

// The shadow-casting key light rides along with the car so its shadow stays sharp anywhere on the site.
// keyOffset is where the light sits relative to the car (the city moves it to a low sun).
export const keyOffset = new THREE.Vector3(-26, 42, 30)
// The light is kept to whole texels of its shadow map across the sun's beam, so the shadows' edges
// stay put as the car drives instead of crawling.
const _sr = new THREE.Vector3(),
  _su = new THREE.Vector3(),
  _sf = new THREE.Vector3(),
  _sp = new THREE.Vector3(),
  _up = new THREE.Vector3(0, 1, 0)
// The box is centred a little ahead of where the camera looks (view: the camera), so more of what is
// in view is in it, with the car or the player (pos) still well inside (camera-centred, after
// mrdoob/slop-newyork's sun shadow is, MIT, (c) 2026 Mr.doob).
const _cf = new THREE.Vector3(),
  _cp = new THREE.Vector3()
const AHEAD = 14 // m
export function followKeyLight (pos, view) {
  if (view) {
    view.getWorldDirection(_cf)
    const l = Math.hypot(_cf.x, _cf.z)
    if (l > 1e-3) pos = _cp.copy(pos).add(_cf.set(_cf.x / l, 0, _cf.z / l).multiplyScalar(AHEAD))
  }
  const cam = key.shadow.camera,
    texel = (cam.right - cam.left) / key.shadow.mapSize.x
  _sf.copy(keyOffset).normalize()
  _sr.crossVectors(_up, _sf).normalize()
  _su.crossVectors(_sf, _sr)
  const a = pos.dot(_sr),
    b = pos.dot(_su)
  _sp
    .copy(pos)
    .addScaledVector(_sr, Math.round(a / texel) * texel - a)
    .addScaledVector(_su, Math.round(b / texel) * texel - b)
  key.target.position.copy(_sp)
  key.position.copy(_sp).add(keyOffset)
}
