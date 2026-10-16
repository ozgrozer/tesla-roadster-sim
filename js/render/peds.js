// People on foot (the sim is peds.js), all in one instanced mesh: a simple jointed figure (head and
// hair, a torso over the hips, legs with shoes, arms with bare forearms), posed in the vertex shader
// from each one's stride (its phase and length), so a whole crowd walks in one draw call. Legs swing
// from the hips with the knee bending as each comes through, arms swing against them, the body bobs
// with each step; diving out of the Roadster's way, arms fly up and they hop. Each wears their own
// shirt and trousers, with their own skin and hair, and stands their own height. Only those the
// camera can see (or whose shadows it can) are drawn.
import * as THREE from 'three'
import { merge } from './geo.js'
import { CURB_H } from '../sim/city.js'
import { kerbDist } from '../sim/street.js'

// the body's parts, each tagged with what it is (it decides how it moves and what colour it is)
const TORSO = 0,
  HEAD = 1,
  HIPS = 2,
  HAIR = 11
function figure () {
  const parts = []
  const put = (geo, part, x, y, z) => {
    const g = geo.translate(x, y, z).toNonIndexed()
    const n = g.attributes.position.count
    g.setAttribute(
      'aPart',
      new THREE.BufferAttribute(new Float32Array(n).fill(part), 1)
    )
    parts.push(g)
  }
  const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 1, 6)
  put(new THREE.BoxGeometry(0.22, 0.5, 0.36), TORSO, 0, 1.2, 0)
  put(new THREE.SphereGeometry(0.105, 9, 7), HEAD, 0.005, 1.64, 0)
  put(
    new THREE.SphereGeometry(0.113, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
    HAIR,
    -0.012,
    1.655,
    0
  )
  put(new THREE.BoxGeometry(0.2, 0.17, 0.33), HIPS, 0, 0.95, 0)
  for (const [k, z] of [
    [0, -0.09],
    [2, 0.09]
  ]) {
    put(limb(0.075, 0.3), 3 + k, 0, 0.71, z) // thigh
    put(limb(0.062, 0.34), 4 + k, 0, 0.29, z) // shin
    put(new THREE.BoxGeometry(0.25, 0.07, 0.1), 4 + k, 0.045, 0.035, z) // shoe
  }
  for (const [k, z] of [
    [0, -0.235],
    [2, 0.235]
  ]) {
    put(limb(0.052, 0.2), 7 + k, 0, 1.31, z) // upper arm
    put(limb(0.045, 0.2), 8 + k, 0, 1.03, z) // forearm
    put(new THREE.SphereGeometry(0.05, 6, 4), 8 + k, 0.01, 0.88, z) // hand
  }
  const g = merge(parts)
  // (merge leaves out attributes it doesn't know: the part tags go in by hand, in the same order)
  const tags = new Float32Array(g.attributes.position.count)
  let o = 0
  for (const p of parts) {
    tags.set(p.attributes.aPart.array, o)
    o += p.attributes.aPart.count
  }
  g.setAttribute('aPart', new THREE.BufferAttribute(tags, 1))
  return g
}

// The pose, applied to a point (or, with w = 0, a normal) of a part: legs and arms about their
// joints (swinging in the x-y plane: each figure faces +x), the body bobbing up with each step.
const POSE = `
  attribute float aPart;
  attribute vec4 aPose; // stride phase, stride length (0 standing to 1.6 running), fright, hop
  attribute vec3 aShirt;
  attribute vec3 aPants;
  attribute vec2 aSkin; // skin tone, hair colour
  mat2 pedRot (float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  vec3 pedPose (vec3 p, float w) {
    int part = int(aPart + 0.5);
    float ph = aPose.x, gait = aPose.y, fright = aPose.z;
    if (part >= 3 && part <= 6) {
      bool left = part <= 4;
      float q = ph + (left ? 0.0 : 3.14159);
      float swing = sin(q) * 0.45 * gait + fright * (left ? 0.5 : -0.35);
      // the knee bends as the leg comes forward through the stride
      if (part == 4 || part == 6) {
        float knee = max(0.0, cos(q)) * 0.9 * gait + fright * 0.6;
        vec2 k = vec2(0.0, 0.5) * w;
        p.xy = k + pedRot(-knee) * (p.xy - k);
      }
      vec2 h = vec2(0.0, 0.92) * w;
      p.xy = h + pedRot(swing) * (p.xy - h);
    }
    if (part >= 7 && part <= 10) {
      bool left = part <= 8;
      float q = ph + (left ? 3.14159 : 0.0);
      float swing = sin(q) * 0.38 * gait + fright * 2.5;
      if (part == 8 || part == 10) {
        vec2 e = vec2(0.0, 1.16) * w;
        p.xy = e + pedRot(0.2 + 0.25 * gait) * (p.xy - e);
      }
      vec2 s = vec2(0.0, 1.45) * w;
      p.xy = s + pedRot(swing) * (p.xy - s);
    }
    p.y += w * (abs(cos(ph)) * 0.035 * gait + aPose.w);
    return p;
  }
`
function posed (shader, colour) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + POSE)
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed = pedPose(transformed, 1.0);'
    )
  if (shader.vertexShader.includes('#include <beginnormal_vertex>'))
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = normalize(pedPose(objectNormal, 0.0));'
    )
  if (colour)
    // each part's colour: skin, hair, shirt, trousers, shoes
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `#include <color_vertex>
      {
        int part = int(aPart + 0.5);
        vec3 skin = mix(vec3(0.93, 0.74, 0.6), vec3(0.32, 0.2, 0.13), aSkin.x);
        vec3 hair = mix(vec3(0.06, 0.05, 0.04), vec3(0.6, 0.42, 0.22), aSkin.y * aSkin.y);
        vec3 c = aShirt;
        if (part == ${HEAD}) c = skin;
        else if (part == ${HAIR}) c = hair;
        else if (part == ${HIPS} || (part >= 3 && part <= 6)) c = aPants;
        else if (part == 8 || part == 10) c = skin;
        if (part >= 3 && part <= 6 && position.y < 0.075) c = vec3(0.08, 0.08, 0.09);
        vColor = c;
      }`
    )
}

const SHIRTS = [
  0xf2f0eb, 0x1f2a44, 0x161618, 0xa8322d, 0xd9a43a, 0x2f7a74, 0x8a8f96,
  0xd98aa3, 0x5d6b3a, 0x8fb4d9, 0xe8d7b0, 0x6b3f7a
].map(c => new THREE.Color(c))
const PANTS = [
  0x2f4a6e, 0x16171a, 0xa8957a, 0x55595f, 0x3b3f46, 0xe6e2da, 0x6e4f3a
].map(c => new THREE.Color(c))

const _sp = new THREE.Sphere()

export class PedView {
  constructor (group, max = 300) {
    const g = figure()
    const n = g.attributes.position.count
    g.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)
    )
    const at = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(max * size),
        size
      )
      a.setUsage(THREE.DynamicDrawUsage)
      g.setAttribute(name, a)
      return a
    }
    this.pose = at('aPose', 4)
    this.shirt = at('aShirt', 3)
    this.pants = at('aPants', 3)
    this.skin = at('aSkin', 2)
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85
    })
    mat.onBeforeCompile = shader => posed(shader, true)
    mat.customProgramCacheKey = () => 'pedestrian'
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    })
    depth.onBeforeCompile = shader => posed(shader, false)
    depth.customProgramCacheKey = () => 'pedestrian depth'
    this.mesh = new THREE.InstancedMesh(g, mat, max)
    this.mesh.customDepthMaterial = depth
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    group.add(this.mesh)
    this.max = max
  }
  // view: a THREE.Frustum of what the camera sees (none: draw everyone)
  update (peds, view = null) {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      y = new THREE.Vector3(0, 1, 0)
    let i = 0
    for (const d of peds.list) {
      if (i >= this.max) break
      if (view) {
        _sp.center.set(d.x, 0.9, d.z)
        _sp.radius = 4.5 // (and their shadow, a few metres long)
        if (!view.intersectsSphere(_sp)) continue
      }
      const k = d.look
      // up on the pavement, down in the road
      const h = kerbDist(d.x, d.z) > 0 ? 0 : CURB_H
      const tall = 0.9 + ((k * 7.13) % 1) * 0.18
      q.setFromAxisAngle(y, d.yaw)
      const wide = tall * (0.92 + ((k * 3.7) % 1) * 0.16)
      m.compose(p.set(d.x, h, d.z), q, s.set(tall, tall, wide))
      this.mesh.setMatrixAt(i, m)
      this.pose.setXYZW(i, d.phase, d.gait, d.fright, d.hop)
      const sh = SHIRTS[Math.floor(k * SHIRTS.length) % SHIRTS.length],
        pa = PANTS[Math.floor(((k * 13.7) % 1) * PANTS.length)]
      this.shirt.setXYZ(i, sh.r, sh.g, sh.b)
      this.pants.setXYZ(i, pa.r, pa.g, pa.b)
      this.skin.setXY(i, (k * 5.31) % 1, (k * 9.17) % 1)
      i++
    }
    this.mesh.count = i
    this.mesh.instanceMatrix.needsUpdate = true
    for (const a of [this.pose, this.shirt, this.pants, this.skin])
      a.needsUpdate = true
  }
}
