// The curved wall (slab, LED edges that turn white behind the car, centre line) and its steel truss.
import * as THREE from 'three'
import { site, MAT } from './scene.js'
import { TRACK } from '../sim/track.js'
import { AX_Y } from '../sim/constants.js'

// ---------- the wall ----------
export const LED_MAT = new THREE.ShaderMaterial({
  uniforms: { uLit: { value: -10 }, uTime: { value: 0 } },
  vertexShader:
    'attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uLit; uniform float uTime; varying float vS;
    void main(){
      float lit = smoothstep(uLit + 0.8, uLit - 0.8, vS);
      float chase = 0.8 + 0.2 * sin(vS * 1.4 - uTime * 5.0);
      vec3 red = vec3(2.3, 0.12, 0.09) * chase;
      vec3 white = vec3(1.25, 1.3, 1.45);
      gl_FragColor = vec4(mix(red, white, lit), 1.0);
    }`,
  toneMapped: false
})
export function buildWall () {
  const T = TRACK,
    hw = T.W / 2,
    th = T.slab
  const idx = []
  for (let i = 0; i < T.n; i += 2) idx.push(i)
  if (idx[idx.length - 1] !== T.n - 1) idx.push(T.n - 1)
  const ring = idx.map(i => {
    const s = i * T.ds,
      a = T.theta(s)
    return {
      s,
      x: T.xs[i],
      y: T.ys[i],
      nx: -Math.sin(a),
      ny: Math.cos(a),
      tx: Math.cos(a),
      ty: Math.sin(a)
    }
  })
  const group = new THREE.Group()
  function strip (fnA, fnB, uvA, uvB, mat, flip, attrS) {
    const pos = [],
      uv = [],
      ss = [],
      index = []
    ring.forEach((r, k) => {
      pos.push(...fnA(r), ...fnB(r))
      uv.push(...uvA(r), ...uvB(r))
      ss.push(r.s, r.s)
      if (k > 0) {
        const a = (k - 1) * 2,
          b = a + 1,
          c = a + 2,
          d = a + 3
        if (flip) index.push(a, c, b, b, c, d)
        else index.push(a, b, c, b, d, c)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    if (attrS) g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1))
    g.setIndex(index)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat)
    m.castShadow = !attrS
    m.receiveShadow = !attrS
    group.add(m)
    return m
  }
  const P = (r, z, off = 0) => [r.x + r.nx * off, r.y + r.ny * off, z]
  // road surface (normal +n)
  strip(
    r => P(r, -hw),
    r => P(r, hw),
    r => [0, r.s / 3.2],
    r => [T.W / 3.2, r.s / 3.2],
    MAT.road,
    false
  )
  // underside
  strip(
    r => P(r, -hw, -th),
    r => P(r, hw, -th),
    r => [0, r.s / 3.2],
    r => [T.W / 3.2, r.s / 3.2],
    MAT.slab,
    true
  )
  // sides
  strip(
    r => P(r, -hw),
    r => P(r, -hw, -th),
    r => [r.s / 3.2, 0],
    r => [r.s / 3.2, 0.14],
    MAT.slab,
    true
  )
  strip(
    r => P(r, hw),
    r => P(r, hw, -th),
    r => [r.s / 3.2, 0],
    r => [r.s / 3.2, 0.14],
    MAT.slab,
    false
  )
  // LED edges (top face and side face), white centre line
  for (const sg of [-1, 1]) {
    const zi = sg * (hw - 0.05),
      zo = sg * (hw - 0.15)
    strip(
      r => P(r, sg > 0 ? zo : zi, 0.012),
      r => P(r, sg > 0 ? zi : zo, 0.012),
      () => [0, 0],
      () => [0, 0],
      LED_MAT,
      false,
      true
    )
    strip(
      r => P(r, sg * (hw + 0.012), -0.02),
      r => P(r, sg * (hw + 0.012), -0.11),
      () => [0, 0],
      () => [0, 0],
      LED_MAT,
      sg < 0,
      true
    )
  }
  strip(
    r => P(r, -0.07, 0.008),
    r => P(r, 0.07, 0.008),
    () => [0, 0],
    () => [0, 0],
    MAT.line,
    false
  ).receiveShadow = true
  // lip end cap
  const e = ring[ring.length - 1]
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.02, th, T.W), MAT.slab)
  cap.position.set(e.x - (e.nx * th) / 2, e.y - (e.ny * th) / 2, 0)
  cap.rotation.z = Math.atan2(e.ty, e.tx)
  group.add(cap)
  site.add(group)
  return ring
}

// steel truss: tower behind the wall, gantry over the overhang, ties to the slab
export function buildTruss () {
  const T = TRACK,
    members = []
  const add = (a, b, t) => members.push([a, b, t])
  const z0 = -T.W / 2 - 0.5,
    z1 = T.W / 2 + 0.5,
    x0 = T.towerX0,
    x1 = T.towerX1,
    top = T.towerTop
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  const levels = []
  for (let y = 0; y <= top + 0.01; y += top / 12) levels.push(y)
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1]
  ])
    add(V(x, 0, z), V(x, top, z), 0.16)
  levels.forEach((y, i) => {
    add(V(x0, y, z0), V(x1, y, z0), 0.08)
    add(V(x0, y, z1), V(x1, y, z1), 0.08)
    add(V(x0, y, z0), V(x0, y, z1), 0.08)
    add(V(x1, y, z0), V(x1, y, z1), 0.08)
    if (i > 0) {
      const yp = levels[i - 1],
        f = i % 2
      add(V(x0, f ? yp : y, z0), V(x1, f ? y : yp, z0), 0.06)
      add(V(x0, f ? yp : y, z1), V(x1, f ? y : yp, z1), 0.06)
      add(V(x0, yp, f ? z0 : z1), V(x0, y, f ? z1 : z0), 0.06)
      add(V(x1, yp, f ? z0 : z1), V(x1, y, f ? z1 : z0), 0.06)
    }
  })
  // gantry over the overhang
  const gx0 = T.lip.x - 0.3,
    gy0 = T.lip.y + 0.6
  for (const z of [z0, z1]) {
    add(V(gx0, gy0, z), V(x1, gy0, z), 0.12)
    add(V(gx0, top, z), V(x1, top, z), 0.12)
  }
  const nb = Math.ceil((x0 - gx0) / 1.8)
  for (let k = 0; k <= nb; k++) {
    const x = gx0 + ((x0 - gx0) * k) / nb,
      xn = gx0 + ((x0 - gx0) * (k + 1)) / nb
    for (const z of [z0, z1]) {
      add(V(x, gy0, z), V(x, top, z), 0.07)
      if (k < nb)
        add(V(x, k % 2 ? gy0 : top, z), V(xn, k % 2 ? top : gy0, z), 0.06)
    }
    add(V(x, gy0, z0), V(x, gy0, z1), 0.06)
    add(V(x, top, z0), V(x, top, z1), 0.06)
  }
  // ties from the slab back to the tower and hangers to the gantry
  const back = i => {
    const s = i * T.ds,
      a = T.theta(s)
    return [T.xs[i] + Math.sin(a) * T.slab, T.ys[i] - Math.cos(a) * T.slab]
  }
  for (let i = 60; i < T.n; i += 18) {
    const [bx, by] = back(i)
    for (const z of [z0 + 0.6, z1 - 0.6]) {
      if (by < gy0 - 1.2 && bx > 2)
        add(V(bx, by, z), V(x0, by, z < 0 ? z0 : z1), 0.07)
      if (i * T.ds > 26)
        add(V(bx, by, z), V(Math.min(bx, x0), gy0, z < 0 ? z0 : z1), 0.06)
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1)
  const inst = new THREE.InstancedMesh(box, MAT.steel, members.length)
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    mid = new THREE.Vector3(),
    dir = new THREE.Vector3()
  members.forEach(([a, b, t], i) => {
    dir.subVectors(b, a)
    const len = dir.length()
    dir.normalize()
    q.setFromUnitVectors(AX_Y, dir)
    mid.addVectors(a, b).multiplyScalar(0.5)
    sc.set(t, len, t)
    inst.setMatrixAt(i, m4.compose(mid, q, sc))
  })
  inst.castShadow = true
  inst.receiveShadow = true
  site.add(inst)
  // stage lights on the gantry
  for (const z of [z0, z1])
    for (const x of [gx0 + 1, (gx0 + x0) / 2]) {
      const l = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10),
        MAT.darkMetal
      )
      l.position.set(x, gy0 - 0.2, z)
      site.add(l)
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), MAT.lamp)
      lens.rotation.x = Math.PI / 2
      lens.position.set(x, gy0 - 0.36, z)
      site.add(lens)
    }
}
