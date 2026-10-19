// The interiors' doors from the street: a door frame and its lit glass in the building's wall, an
// awning over it in the place's colour, its name on a sign above, and on the pavement in front the
// GTA-style marker that says it can be gone into; the body shop's roller door, its big sign, and
// the marker of its bay out front. Every site's in four meshes for the whole city (lit pieces, the
// glass, the signs from one canvas, the markers).
import * as THREE from 'three'
import { merge, box, tint } from '../geo.js'
import { canvasTex } from '../scene.js'
import { SITES } from '../../sim/interiors/sites.js'
import { groundHeight } from '../../sim/world.js'

const ROW = 128 // px: each site's name, a row of the signs' canvas
// a box against a wall: a along it (from the door, along t), out from its face (along n), y up
function onWall (s, a0, a1, o0, o1, y0, y1) {
  const t = { x: -s.n.z, z: s.n.x },
    { x, z } = s.face
  const p = [x + t.x * a0 + s.n.x * o0, z + t.z * a0 + s.n.z * o0],
    q = [x + t.x * a1 + s.n.x * o1, z + t.z * a1 + s.n.z * o1]
  return box(Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]))
}
// the signs' canvas: each site's name, white on its colour (row i)
function signTexture () {
  return canvasTex(
    1024,
    (ctx, S) => {
      SITES.forEach((s, i) => {
        const y = i * ROW
        ctx.fillStyle = '#' + new THREE.Color(s.room.trim).getHexString()
        ctx.fillRect(0, y, S, ROW)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillRect(0, y + 8, S, 4)
        ctx.fillRect(0, y + ROW - 12, S, 4)
        ctx.fillStyle = '#fff'
        ctx.font = `800 ${Math.round(ROW * 0.58)}px "Arial Black", Impact, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(s.name.toUpperCase(), S / 2, y + ROW / 2 + 4, S - 40)
      })
    },
    1,
    ROW * 8
  )
}
// a sign's face: w by h, facing n, centred on the wall at a along it, y up, showing canvas row i
function signFace (s, i, a, y, w, h) {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv
  const v0 = 1 - (i + 1) / 8,
    v1 = 1 - i / 8
  for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 : v0)
  g.rotateY(Math.atan2(s.n.x, s.n.z))
  const t = { x: -s.n.z, z: s.n.x }
  g.translate(s.face.x + t.x * a + s.n.x * 0.32, y, s.face.z + t.z * a + s.n.z * 0.32)
  return g
}

export function buildDoors (group) {
  const lit = [],
    glass = [],
    signs = [],
    marks = []
  SITES.forEach((s, i) => {
    const y = Math.max(0, groundHeight(s.out.x, s.out.z))
    // the frame, the glass, the step
    lit.push(tint(onWall(s, -0.75, 0.75, -0.02, 0.12, 0, 2.55), 0x22252a))
    glass.push(tint(onWall(s, -0.6, 0.6, 0.12, 0.14, 0.05, 2.4), 0xffffff))
    lit.push(tint(onWall(s, -0.9, 0.9, 0, 0.5, 0, 0.1), 0x9a978f))
    // the awning in the place's colour, its sign over it
    lit.push(tint(onWall(s, -1.4, 1.4, 0, 1.1, 2.62, 2.74), s.room.trim))
    lit.push(tint(onWall(s, -1.8, 1.8, 0, 0.3, 2.8, 3.6), 0x1b1d22))
    signs.push(signFace(s, i, 0, 3.2, 3.2, 0.5))
    marks.push({ x: s.out.x, y: y + 0.06, z: s.out.z, r: 0.75 })
    // the body shop's roller door and its bay
    if (s.drive) {
      const c = s.drive.door,
        t = { x: -s.n.z, z: s.n.x }
      const a = (c.x - s.face.x) * t.x + (c.z - s.face.z) * t.z
      lit.push(tint(onWall(s, a - 3.2, a + 3.2, -0.02, 0.25, 0, 4.7), 0x2b2f36))
      lit.push(tint(onWall(s, a - 3, a + 3, 0, 0.18, 0, 4.4), 0x8a9096))
      for (let yy = 0.3; yy < 4.4; yy += 0.36) lit.push(tint(onWall(s, a - 3, a + 3, 0.18, 0.22, yy, yy + 0.06), 0x6b7177))
      lit.push(tint(onWall(s, a - 3.6, a + 3.6, 0, 0.3, 4.9, 6.2), 0x1b1d22))
      const g = signFace(s, i, a, 5.55, 7, 1.15)
      signs.push(g)
      const bx = (s.drive.x0 + s.drive.x1) / 2,
        bz = (s.drive.z0 + s.drive.z1) / 2
      marks.push({ x: bx, y: Math.max(0, groundHeight(bx, bz)) + 0.06, z: bz, r: 2.6 })
    }
  })
  const out = {}
  const lm = new THREE.Mesh(merge(lit), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }))
  lm.castShadow = lm.receiveShadow = true
  group.add(lm)
  out.glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  group.add(new THREE.Mesh(merge(glass), out.glassMat))
  out.signMat = new THREE.MeshBasicMaterial({ map: signTexture() })
  group.add(new THREE.Mesh(merge(signs), out.signMat))
  // the markers: flat rings on the ground, glowing
  const rings = marks.map(m =>
    new THREE.RingGeometry(m.r * 0.78, m.r, 32).rotateX(-Math.PI / 2).translate(m.x, m.y, m.z)
  )
  out.markMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 1.2, 0.25),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const mk = new THREE.Mesh(merge(rings), out.markMat)
  mk.renderOrder = 2
  group.add(mk)
  out.night = k => {
    // (the glass warm and bright at night, a soft sheen by day; the signs lit)
    out.glassMat.color.setRGB(0.55 + 1.6 * k, 0.6 + 1.25 * k, 0.65 + 0.7 * k)
    out.signMat.color.setScalar(0.85 + 0.9 * k)
  }
  out.pulse = t => (out.markMat.opacity = 0.55 + 0.3 * Math.sin(t * 3))
  out.night(0)
  return out
}
