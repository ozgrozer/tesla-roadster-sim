// The all-way stops' signs and their painted "STOP"s (sim/stopSigns.js): a red octagon with a white
// border and STOP across it, on a galvanised post with its grey back plate; the lane legend in long
// white letters before the line. Three instanced meshes for every one in the city; a sign knocked
// flat (its collider down) is not drawn until the city stands up again.
import * as THREE from 'three'
import { Builder } from './builder.js'
import { SIGNS, LEGENDS, SIGN } from '../sim/world.js'

const R = SIGN.face

function octagon (ctx, S, r, fill) {
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4
    ctx[k ? 'lineTo' : 'moveTo'](
      S / 2 + Math.cos(a) * r,
      S / 2 - Math.sin(a) * r
    )
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}
function faceTexture () {
  const S = 256,
    cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  // (the circle's uv reaches the octagon's corners at S / 2: a little in for the edge)
  octagon(ctx, S, S / 2, '#f4f2ee')
  octagon(ctx, S, S * 0.45, '#b3121a')
  ctx.fillStyle = '#f4f2ee'
  ctx.font = `800 ${Math.round(
    S * 0.27
  )}px "Arial Black", Impact, Helvetica, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('STOP', S / 2, S / 2 + S * 0.015, S * 0.76)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function legendTexture () {
  const W = 128,
    H = 256,
    cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(W * 0.42)}px Helvetica, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // (letters stretched along the lane, as they are painted, to read foreshortened from the seat)
  ctx.setTransform(1, 0, 0, 3.2, 0, 0)
  ctx.fillText('STOP', W / 2, H / 3.2 / 2, W * 0.94)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(1, 1, 1),
  _e = new THREE.Euler()

export function buildStopSigns (group) {
  const n = SIGNS.length
  if (!n) return { update () {}, night () {} }
  const y = SIGN.h - R - 0.05
  // the face, looking along local +z
  const face = new THREE.CircleGeometry(R, 8, Math.PI / 8).translate(
    0,
    y,
    0.035
  )
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture(),
    roughness: 0.45,
    metalness: 0.05
  })
  // the post, its bracket and the plain back of the plate
  const B = new Builder(),
    grey = new THREE.Color(0x9aa0a6),
    dark = new THREE.Color(0x6a6e72)
  B.add(
    new THREE.CylinderGeometry(SIGN.r * 0.6, SIGN.r * 0.6, SIGN.h - 0.1, 8),
    new THREE.Matrix4().makeTranslation(0, (SIGN.h - 0.1) / 2, 0),
    grey
  )
  B.add(
    new THREE.CircleGeometry(R * 1.01, 8, Math.PI / 8).rotateY(Math.PI),
    new THREE.Matrix4().makeTranslation(0, y, 0.03),
    dark
  )
  B.add(
    new THREE.BoxGeometry(0.12, 0.34, 0.03),
    new THREE.Matrix4().makeTranslation(0, y, 0.015),
    dark
  )
  const back = B.geometry()
  const backMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.4,
    side: THREE.DoubleSide
  })
  const faces = new THREE.InstancedMesh(face, faceMat, n),
    posts = new THREE.InstancedMesh(back, backMat, n)
  const place = (hide = false) => {
    SIGNS.forEach((s, i) => {
      _q.setFromEuler(_e.set(0, Math.atan2(s.fx, s.fz), 0))
      _s.setScalar(hide || s.c.down ? 0 : 1)
      _m.compose(_p.set(s.x, 0, s.z), _q, _s)
      faces.setMatrixAt(i, _m)
      posts.setMatrixAt(i, _m)
    })
    faces.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = true
  }
  place()
  for (const m of [faces, posts]) {
    m.castShadow = true
    m.name = 'stop signs'
    group.add(m)
  }
  // the lane legends, flat on the road a little above its paint
  const leg = new THREE.PlaneGeometry(2.1, 4.2).rotateX(-Math.PI / 2)
  const legMat = new THREE.MeshStandardMaterial({
    map: legendTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 0.8,
    color: new THREE.Color(0xdedbd2),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
  const legends = new THREE.InstancedMesh(leg, legMat, LEGENDS.length)
  LEGENDS.forEach((l, i) => {
    _q.setFromEuler(_e.set(0, Math.atan2(-l.dx, -l.dz), 0))
    _m.compose(_p.set(l.x, 0.014, l.z), _q, _s.setScalar(1))
    legends.setMatrixAt(i, _m)
  })
  legends.receiveShadow = true
  legends.name = 'stop legends'
  group.add(legends)
  let down = 0
  return {
    update () {
      // (only when one has been knocked down, or stood up again)
      let k = 0
      for (const s of SIGNS) if (s.c.down) k++
      if (k !== down) {
        down = k
        place()
      }
    },
    night () {}
  }
}
