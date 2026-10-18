// What the scenery round the city is made of, shared by the verges, the hills and the sprawl: tall
// skinny palms (LA's Mexican fan palms, a skirt of dead fronds under a small crown), round-headed
// trees, the canvas textures of grass and concrete, and instancing split into chunks across the land,
// so the camera and the shadow maps leave out the chunks they can't see.
import * as THREE from 'three'
import { merge, tint } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { rng } from '../sim/city.js'

const R = rng(707)
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler(),
  _c = new THREE.Color()

// (each plant's colours are in its vertices: one material for all of them)
export const PLANT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92
})

// A palm's trunk, 1 m tall (scaled to its height), and its crown at the top of it.
export function palmTrunk () {
  return tint(
    new THREE.CylinderGeometry(0.17, 0.26, 1, 5, 1, true).translate(0, 0.5, 0),
    0x6f655a
  )
}
export function palmCrown () {
  const parts = [
    tint(
      new THREE.CylinderGeometry(0.75, 0.3, 1.9, 6, 1, true).translate(
        0,
        -1.1,
        0
      ),
      0x7a6a4c
    )
  ]
  // the fronds: fans on stalks, drooping out all round
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.3,
      up = i % 3 === 0 ? 0.5 : -0.15 - R() * 0.35
    const f = new THREE.BufferGeometry()
    const len = 1.9 + R() * 0.5
    f.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, len, up * len - 0.35, -0.75, len, up * len - 0.35, 0.75],
        3
      )
    )
    f.rotateY(a)
    parts.push(tint(f, i % 2 ? 0x41552a : 0x4c6230))
  }
  const g = merge(parts)
  g.computeVertexNormals()
  return g
}
// A round-headed tree (a ficus, a sycamore, an oak on the hills): a trunk and three blobs of leaves,
// darker underneath. About 5 m tall; scaled per tree.
export function roundTree (leaf = 0x3f5a2a) {
  const parts = [
    tint(
      new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5).translate(0, 1.2, 0),
      0x5a4a3a
    )
  ]
  for (const [x, y, z, r] of [
    [0, 3.4, 0, 1.9],
    [0.9, 3.0, 0.5, 1.4],
    [-0.8, 3.1, -0.4, 1.5]
  ]) {
    const b = new THREE.IcosahedronGeometry(r, 0)
      .scale(1, 0.8, 1)
      .translate(x, y, z)
    const n = b.attributes.position.count,
      col = new Float32Array(n * 3)
    _c.set(leaf)
    for (let i = 0; i < n; i++) {
      const k = 0.7 + 0.45 * ((b.attributes.position.getY(i) - y) / r + 0.5)
      col.set([_c.r * k, _c.g * k, _c.b * k], i * 3)
    }
    b.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parts.push(b)
  }
  return merge(parts)
}

// Instances of geo scattered over the land, one instanced mesh to a chunk (cell m square), so each
// chunk is left out where it can't be seen. list: things with x, z; place(it, m): its matrix into m
// (pose() helps). Returns the meshes, added to group.
export function scatter (group, geo, mat, list, place, opts = {}) {
  const { cell = 300, cast = false, receive = true, color = null } = opts
  const cells = new Map()
  for (const it of list) {
    const k = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`
    if (!cells.has(k)) cells.set(k, [])
    cells.get(k).push(it)
  }
  const meshes = []
  for (const items of cells.values()) {
    const m = new THREE.InstancedMesh(geo, mat, items.length)
    items.forEach((it, i) => {
      m.setMatrixAt(i, place(it, _m))
      if (color) m.setColorAt(i, color(it, _c))
    })
    m.castShadow = cast
    m.receiveShadow = receive
    m.computeBoundingSphere()
    group.add(m)
    meshes.push(m)
  }
  return meshes
}
// a matrix at (x, y, z) turned yaw about the vertical, scaled, leaning by tilt toward lean
export function pose (
  m,
  x,
  y,
  z,
  yaw = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  tilt = 0,
  lean = 0
) {
  _e.set(Math.cos(lean) * tilt, yaw, Math.sin(lean) * tilt, 'YXZ')
  return m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz))
}
// a copy of geo moved by the matrix m (to be merged with others)
export const bake = (geo, m) => geo.clone().applyMatrix4(m)
// A palm baked where it stands ({ x, z, h, lean, y? }): the trunk leaning a little toward lean, the
// crown on its top. Returns its two pieces.
const TILT = 0.04
const TRUNK = palmTrunk(),
  CROWN = palmCrown()
export function palmAt (p) {
  const y = p.y || 0
  return [
    bake(TRUNK, pose(_bm, p.x, y, p.z, 0, 1, p.h, 1, TILT, p.lean)),
    bake(
      CROWN,
      pose(
        _bm,
        p.x - Math.sin(p.lean) * TILT * p.h,
        y + p.h,
        p.z + Math.cos(p.lean) * TILT * p.h,
        p.lean * 3
      )
    )
  ]
}
const _bm = new THREE.Matrix4()
// Palms instanced (for many of them: the sprawl's): trunks and crowns, one mesh each to a chunk.
export function palmsAt (group, palms, cast = false, cell = 300) {
  scatter(
    group,
    TRUNK,
    PLANT,
    palms,
    (p, m) => pose(m, p.x, p.y || 0, p.z, 0, 1, p.h, 1, TILT, p.lean),
    { cast, cell }
  )
  scatter(
    group,
    CROWN,
    PLANT,
    palms,
    (p, m) =>
      pose(
        m,
        p.x - Math.sin(p.lean) * TILT * p.h,
        (p.y || 0) + p.h,
        p.z + Math.cos(p.lean) * TILT * p.h,
        p.lean * 3
      ),
    { cast, cell }
  )
}
// A lump of leaves r across, its shading smooth (normals straight out from its middle), in col (an
// array, or a function of how far up the lump a vertex is, -1 to 1)
export function lump (r, col) {
  const g = new THREE.IcosahedronGeometry(r, 0)
  const p = g.attributes.position,
    n = g.attributes.normal,
    c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      l = Math.hypot(x, y, z)
    n.setXYZ(i, x / l, y / l, z / l)
    c.set(typeof col === 'function' ? col(y / r) : col, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

// ---------- textures (UVs in metres) ----------
// dry LA grass, more straw than green by the end of summer
export function grassTexture () {
  const t = canvasTex(256, (g, S) => {
    g.fillStyle = '#6f7a3f'
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * S,
        y = Math.random() * S,
        r = 10 + Math.random() * 45
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(
        0,
        Math.random() < 0.5 ? 'rgba(150,140,80,0.35)' : 'rgba(50,70,25,0.3)'
      )
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = `rgba(${
        Math.random() < 0.5 ? '45,60,20' : '170,165,95'
      },${Math.random() * 0.4})`
      g.fillRect(Math.random() * S, Math.random() * S, 1, 2 + Math.random() * 2)
    }
  })
  t.repeat.set(1 / 7, 1 / 7)
  return t
}
// a wall's face, w x h px for a tile of the given size in metres: concrete with its formwork's
// lines and stains run down from the top, or concrete blocks (a sound wall) with ivy up its foot
export function wallTexture (kind) {
  const blocks = kind === 'blocks'
  const t = canvasTex(
    512,
    (g, W, H) => {
      g.fillStyle = blocks ? '#b9ab93' : '#a29d93'
      g.fillRect(0, 0, W, H)
      speckle(g, 9000, W, 0.18, false)
      speckle(g, 5000, W, 0.12, true)
      g.strokeStyle = 'rgba(60,55,48,0.45)'
      g.lineWidth = 2
      g.beginPath()
      if (blocks)
        // 0.4 x 0.2 m blocks in a running bond: 8 m x 4 m to the tile
        for (let r = 0; r < 20; r++) {
          const y = (r * H) / 20
          g.moveTo(0, y)
          g.lineTo(W, y)
          for (let c = 0; c < 20; c++) {
            const x = ((c + (r % 2) * 0.5) * W) / 20
            g.moveTo(x, y)
            g.lineTo(x, y + H / 20)
          }
        }
      else
        for (const x of [0, W / 2]) {
          g.moveTo(x, 0)
          g.lineTo(x, H)
        }
      g.stroke()
      // stains run down from the top
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W,
          w = 4 + Math.random() * 16,
          l = H * (0.2 + Math.random() * 0.6)
        const gr = g.createLinearGradient(0, 0, 0, l)
        gr.addColorStop(0, 'rgba(40,36,30,0.28)')
        gr.addColorStop(1, 'rgba(40,36,30,0)')
        g.fillStyle = gr
        g.fillRect(x, 0, w, l)
      }
      if (blocks)
        // ivy, thick at the foot and thinning out up the wall
        for (let i = 0; i < 2600; i++) {
          const y = H - Math.pow(Math.random(), 1.8) * H * 0.75,
            x = Math.random() * W
          g.fillStyle = `rgba(${
            Math.random() < 0.5 ? '38,62,24' : '62,92,36'
          },0.85)`
          g.beginPath()
          g.arc(x, y, 2 + Math.random() * 5, 0, 7)
          g.fill()
        }
    },
    1,
    256
  )
  t.repeat.set(1 / 8, 1 / 4)
  return t
}
