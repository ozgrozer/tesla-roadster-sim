// Skid marks: one continuous rubber ribbon per sliding tyre. The ribbon is as wide as the tyre's
// footprint across its path (full tread width in a straight lock-up, the short contact patch when it
// slides sideways), darkens with how hard the tyre slides and fades in and out at each end.
import * as THREE from 'three'
import { scene } from './scene.js'
import { GROUND } from './mirror.js'
import { ENV } from '../sim/env.js'

const MAX_SEG = 3000 // ring buffer of ribbon segments (oldest marks are overwritten)
const STEP = 0.14 // m between ribbon samples
const TREAD = 0.3 // tyre width
const PATCH = 0.17 // contact patch length
const Y = 0.022 // just above the pad (or roof)

// fine streaks along the mark: the tread grooves dragged across the concrete
function streakTexture () {
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 4
  const g = cv.getContext('2d')
  for (let x = 0; x < 128; x++) {
    const edge = Math.min(x, 127 - x) / 14 // soft edges across the width
    const groove = x % 21 < 3 ? 0.45 : 1
    const a = Math.min(1, edge) * groove * (0.7 + Math.random() * 0.3)
    g.fillStyle = `rgba(8,8,9,${a.toFixed(3)})`
    g.fillRect(x, 0, 1, 4)
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const pos = new Float32Array(MAX_SEG * 4 * 3)
const col = new Float32Array(MAX_SEG * 4 * 4).fill(1)
const uv = new Float32Array(MAX_SEG * 4 * 2)
const idx = new Uint32Array(MAX_SEG * 6)
for (let i = 0; i < MAX_SEG; i++)
  idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6)
const geo = new THREE.BufferGeometry()
const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(
  THREE.DynamicDrawUsage
)
const colAttr = new THREE.BufferAttribute(col, 4).setUsage(
  THREE.DynamicDrawUsage
)
const uvAttr = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage)
geo.setAttribute('position', posAttr)
geo.setAttribute('color', colAttr)
geo.setAttribute('uv', uvAttr)
geo.setIndex(new THREE.BufferAttribute(idx, 1))
geo.setDrawRange(0, 0)
const mesh = new THREE.Mesh(
  geo,
  new THREE.MeshBasicMaterial({
    map: streakTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
)
mesh.frustumCulled = false
mesh.renderOrder = 1
mesh.layers.set(GROUND) // (on the road, not in its reflection: mirror.js)
scene.add(mesh)

let head = 0
let used = 0
// per wheel: the last ribbon edge laid down (null when the tyre isn't sliding)
const trail = [null, null, null, null]
const _c = new THREE.Vector3()
const _h = new THREE.Vector3()
const _q = new THREE.Quaternion()

function addSegment (a, b) {
  const v = head * 4
  const ya = a.y + Y,
    yb = b.y + Y
  pos.set([a.lx, ya, a.lz, a.rx, ya, a.rz, b.lx, yb, b.lz, b.rx, yb, b.rz], v * 3)
  col[v * 4 + 3] = col[(v + 1) * 4 + 3] = a.alpha
  col[(v + 2) * 4 + 3] = col[(v + 3) * 4 + 3] = b.alpha
  uv.set([0, a.u, 1, a.u, 0, b.u, 1, b.u], v * 2)
  head = (head + 1) % MAX_SEG
  used = Math.min(MAX_SEG, used + 1)
  geo.setDrawRange(0, used * 6)
  posAttr.needsUpdate = colAttr.needsUpdate = uvAttr.needsUpdate = true
}

export function clearSkids () {
  head = used = 0
  geo.setDrawRange(0, 0)
  trail.fill(null)
}

export function updateSkids (RS, sim) {
  RS.wheels.forEach((w, i) => {
    const amt = sim.mode === 'ground' ? (w.front ? sim.skidF : sim.skidR) : 0
    const last = trail[i]
    if (!last && amt < 0.15) return
    if (last && amt < 0.04) {
      trail[i] = null
      return
    }
    w.pivot.getWorldPosition(_c)
    if (!last) {
      trail[i] = {
        x: _c.x,
        y: sim.pos.y,
        z: _c.z,
        lx: _c.x,
        lz: _c.z,
        rx: _c.x,
        rz: _c.z,
        alpha: 0,
        u: 0
      }
      return
    }
    const dx = _c.x - last.x
    const dz = _c.z - last.z
    const len = Math.hypot(dx, dz)
    if (len < STEP) return
    const tx = dx / len
    const tz = dz / len
    // footprint across the path: tread width when rolling straight, patch length when sideways
    w.pivot.getWorldQuaternion(_q)
    _h.set(1, 0, 0).applyQuaternion(_q)
    const hl = Math.hypot(_h.x, _h.z) || 1
    const along = Math.abs((_h.x * tx + _h.z * tz) / hl)
    const width =
      TREAD * along + PATCH * Math.sqrt(Math.max(0, 1 - along * along))
    const nx = -tz * width * 0.5
    const nz = tx * width * 0.5
    const next = {
      x: _c.x,
      y: sim.pos.y,
      z: _c.z,
      lx: _c.x + nx,
      lz: _c.z + nz,
      rx: _c.x - nx,
      rz: _c.z - nz,
      // (a wet tyre slides on the water and leaves little rubber behind)
      alpha:
        Math.min(0.85, amt * 0.9) *
        (sim.world === 'city' ? 1 - 0.75 * ENV.wet : 1),
      u: last.u + len
    }
    addSegment(last, next)
    trail[i] = next
  })
}
