// People on foot (the sim is peds.js and crowd.js), all in one instanced mesh: a jointed figure (a
// head longer than it is wide, with its hair, on a neck; a torso narrowing from rounded shoulders
// to the waist; hips, legs with shoes, arms with hands, a phone), posed in the vertex shader from
// each one's stride (its phase and length), so a whole crowd walks in one draw call. Each foot is
// planted through its stance and travels back at the pace the body moves on (the sim times the
// stride to the speed and the legs' length, so feet don't slide), the knee folds as the leg swings
// through, arms swing against the legs, the body rises over each step, and running they lean in
// with their elbows bent. Heads turn to follow the Roadster; standing about they look down at a
// phone held up in front of them, or talk with their hands; diving out of the Roadster's way, or
// running from it, arms fly up. Each dresses their own way (a shirt or a jacket with long sleeves,
// trousers, shorts or a dress, long hair or short, a shoulder bag or a backpack, dark shoes or white
// trainers), with skin from pale to deep brown and hair from black to fair or grey, and stands their
// own height and build. Only those the camera can see (or whose shadows it can) are drawn.
import * as THREE from 'three'
import { merge } from './geo.js'
import { CURB_H } from '../sim/city.js'
import { kerbDist } from '../sim/street.js'
import { NEAR } from './traffic.js'

// the body's parts, each tagged with what it is (it decides how it moves and what colour it is)
const TORSO = 0,
  HEAD = 1,
  HIPS = 2,
  HAIR = 11,
  PHONE = 12,
  LONG_HAIR = 13, // (these four fold away to nothing on anyone without them)
  SKIRT = 14,
  BAG = 15,
  PACK = 16
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
  // a torso narrowing from the shoulders to the waist, rounded at the shoulders, on a neck
  put(new THREE.CylinderGeometry(0.185, 0.155, 0.46, 12).scale(0.62, 1, 1), TORSO, 0, 1.2, 0)
  for (const z of [-0.17, 0.17])
    put(new THREE.SphereGeometry(0.075, 8, 6).scale(0.95, 0.8, 1), TORSO, 0, 1.41, z)
  put(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8), HEAD, 0.005, 1.5, 0)
  // the head, a little longer than it is wide, and its hair
  put(new THREE.SphereGeometry(0.1, 12, 9).scale(1.05, 1.12, 0.92), HEAD, 0.008, 1.64, 0)
  put(
    new THREE.SphereGeometry(0.108, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.55)
      .scale(1.08, 1.12, 0.96)
      .rotateZ(0.18),
    HAIR,
    -0.006,
    1.652,
    0
  )
  put(new THREE.BoxGeometry(0.07, 0.26, 0.19), LONG_HAIR, -0.075, 1.5, 0) // (down the back)
  put(new THREE.CylinderGeometry(0.16, 0.13, 0.17, 12).scale(0.7, 1, 1), HIPS, 0, 0.95, 0)
  put(new THREE.CylinderGeometry(0.15, 0.26, 0.5, 12, 1, true).scale(0.8, 1, 1), SKIRT, 0, 0.73, 0)
  put(new THREE.BoxGeometry(0.2, 0.22, 0.07), BAG, 0.02, 0.98, -0.27) // (at the left hip)
  put(new THREE.BoxGeometry(0.13, 0.36, 0.28), PACK, -0.17, 1.2, 0) // (on the back)
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
  // a phone in the right hand (folded away to nothing when it isn't out)
  put(new THREE.BoxGeometry(0.08, 0.15, 0.014), PHONE, 0.05, 0.88, 0.235)
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

// The pose, applied to a point (or, with w = 0, a normal) of a part, each figure facing +x and its
// right side +z: legs and arms about their joints (swinging in the x-y plane), the head turned and
// bowed about the neck, the upper body leaning in to a run and twisting against the stride, and the
// whole body rising over each step.
const POSE = `
  attribute float aPart;
  attribute vec4 aPose; // stride phase, stride (0 standing, 1 walking, 1.6 running), fright, hop
  attribute vec4 aAct; // head turned (rad), on the phone, talking with their hands, gesture clock
  attribute vec3 aShirt;
  attribute vec3 aPants;
  attribute vec2 aSkin; // skin tone, hair colour
  attribute float aStyle; // what they wear: flags (see PedView)
  mat2 pedRot (float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  // a leg's swing at phase q: from forward to back at an even pace through the stance (the foot on
  // the ground), then smoothly forward again through the swing
  float pedLeg (float q, float A) {
    q = mod(q, 6.28318);
    return q < 3.14159 ? A * (1.0 - 2.0 * q / 3.14159) : -A * cos(q - 3.14159);
  }
  vec3 pedPose (vec3 p, float w) {
    int part = int(aPart + 0.5);
    float ph = aPose.x, gait = aPose.y, fright = aPose.z;
    float A = 0.42 * gait, run = clamp((gait - 1.2) * 2.5, 0.0, 1.0);
    float phone = aAct.y * (1.0 - fright), talk = aAct.z * (1.0 - fright);
    if (part == ${PHONE}) p = mix(vec3(0.01, 0.88, 0.235) * w, p, phone);
    {
      // the parts only some have, folded away on the others
      int style = int(aStyle + 0.5);
      if ((part == ${LONG_HAIR} && (style & 8) == 0) || (part == ${SKIRT} && (style & 4) == 0)
        || (part == ${BAG} && (style & 16) == 0) || (part == ${PACK} && (style & 32) == 0))
        p = vec3(0.0, 1.2, 0.0) * w;
    }
    if (part >= 3 && part <= 6) {
      bool left = part <= 4;
      float q = ph + (left ? 0.0 : 3.14159);
      float swing = pedLeg(q, A) + fright * (left ? 0.5 : -0.35);
      // the knee folds as the leg swings through (more running), and gives a little in the stance
      if (part == 4 || part == 6) {
        float u = mod(q, 6.28318);
        float knee = u < 3.14159
          ? 0.1 * gait * sin(u)
          : sin(u - 3.14159) * (0.45 + 0.9 * A + 0.8 * run);
        knee += fright * 0.6;
        vec2 k = vec2(0.0, 0.5) * w;
        p.xy = k + pedRot(-knee) * (p.xy - k);
      }
      vec2 h = vec2(0.0, 0.92) * w;
      p.xy = h + pedRot(swing) * (p.xy - h);
    }
    if ((part >= 7 && part <= 10) || part == ${PHONE}) {
      bool left = part <= 8;
      // each arm swings with the other side's leg
      float swing = (0.85 * A + 0.25 * run) * cos(ph + (left ? 3.14159 : 0.0)) + fright * 2.5;
      float elbow = 0.2 + 0.25 * gait + 1.1 * run;
      if (!left) {
        // the phone held up in front of them
        swing = mix(swing, 0.4, phone);
        elbow = mix(elbow, 1.9, phone);
      } else {
        // talking with their hands
        swing = mix(swing, 0.3 + 0.12 * sin(aAct.w * 2.1), talk);
        elbow = mix(elbow, 1.0 + 0.35 * sin(aAct.w * 3.3), talk);
      }
      if (part == 8 || part == 10 || part == ${PHONE}) {
        vec2 e = vec2(0.0, 1.16) * w;
        p.xy = e + pedRot(elbow) * (p.xy - e);
      }
      vec2 s = vec2(0.0, 1.45) * w;
      p.xy = s + pedRot(swing) * (p.xy - s);
    }
    // the head turned (to the Roadster) and bowed (over the phone)
    if (part == ${HEAD} || part == ${HAIR} || part == ${LONG_HAIR}) {
      vec2 n = vec2(0.0, 1.53) * w;
      p.xy = n + pedRot(-0.4 * phone) * (p.xy - n);
      p.xz = pedRot(-aAct.x) * p.xz;
    }
    // the upper body: twisting against the stride, leaning in to a run
    if (part != ${HIPS} && (part < 3 || part > 6) && part != ${SKIRT} && part != ${BAG}) {
      if (part != ${HEAD} && part != ${HAIR} && part != ${LONG_HAIR})
        p.xz = pedRot(0.25 * A * cos(ph)) * p.xz;
      vec2 hip = vec2(0.0, 0.95) * w;
      p.xy = hip + pedRot(-0.2 * run - 0.05 * gait) * (p.xy - hip);
    }
    // up over each step (the most at mid-stance), higher running, and the hop of a dive
    p.y += w * ((0.026 * gait + 0.03 * run) * -cos(2.0 * ph) + aPose.w);
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
        int part = int(aPart + 0.5), style = int(aStyle + 0.5);
        // skin from pale to deep brown, hair from black through brown to fair (and grey)
        float t = aSkin.x * 3.0;
        vec3 skin = t < 1.0
          ? mix(vec3(0.95, 0.8, 0.68), vec3(0.86, 0.64, 0.5), t)
          : t < 2.0
          ? mix(vec3(0.86, 0.64, 0.5), vec3(0.56, 0.38, 0.26), t - 1.0)
          : mix(vec3(0.56, 0.38, 0.26), vec3(0.26, 0.16, 0.1), t - 2.0);
        float hy = aSkin.y;
        vec3 hair = hy < 0.45
          ? mix(vec3(0.04, 0.035, 0.03), vec3(0.2, 0.13, 0.08), hy / 0.45)
          : hy < 0.85
          ? mix(vec3(0.2, 0.13, 0.08), vec3(0.62, 0.46, 0.25), (hy - 0.45) / 0.4)
          : vec3(0.62, 0.6, 0.58);
        bool sleeves = (style & 1) != 0, shorts = (style & 2) != 0, dress = (style & 4) != 0;
        vec3 c = aShirt;
        if (part == ${HEAD}) c = skin;
        else if (part == ${HAIR} || part == ${LONG_HAIR}) c = hair;
        else if (part == ${HIPS}) c = dress ? aShirt : aPants;
        else if (part >= 3 && part <= 6) {
          // trousers; bare legs below shorts, or under a dress
          c = aPants;
          if (dress || (shorts && (part == 4 || part == 6))) c = skin;
          if (position.y < 0.075) c = (style & 64) != 0 ? vec3(0.86, 0.86, 0.84) : vec3(0.08, 0.08, 0.09);
        }
        else if (part == 8 || part == 10) c = sleeves && position.y > 0.93 ? aShirt * 0.85 : skin;
        else if (part == ${SKIRT}) c = aShirt;
        else if (part == ${BAG}) c = vec3(0.14, 0.09, 0.06);
        else if (part == ${PACK}) c = aPants * 0.5 + vec3(0.03);
        if (part == ${PHONE}) c = vec3(0.04, 0.045, 0.05);
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

// What someone wears, from their look (0 to 1), as flags: 1 long sleeves, 2 shorts, 4 a dress,
// 8 long hair, 16 a shoulder bag, 32 a backpack, 64 white trainers
function styleOf (k) {
  const dress = (k * 23.7) % 1 < 0.16
  let f = (k * 31.1) % 1 < 0.45 ? 1 : 0
  if (dress) f |= 4
  else if ((k * 41.3) % 1 < 0.18) f |= 2
  if ((k * 53.9) % 1 < (dress ? 0.75 : 0.22)) f |= 8
  const bag = (k * 61.7) % 1
  if (bag < 0.15) f |= 16
  else if (bag < 0.27) f |= 32
  if ((k * 71.3) % 1 < 0.3) f |= 64
  return f
}
const _sp = new THREE.Sphere()
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3()

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
    this.act = at('aAct', 4)
    this.shirt = at('aShirt', 3)
    this.pants = at('aPants', 3)
    this.skin = at('aSkin', 2)
    this.style = at('aStyle', 1)
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
    this.attrs = [
      this.pose,
      this.act,
      this.shirt,
      this.pants,
      this.skin,
      this.style
    ]
    // into the shadow map, only the people near the Roadster (the first `near`)
    this.near = 0
    const mesh = this.mesh
    mesh.onBeforeShadow = () => {
      mesh.full = mesh.count
      mesh.count = Math.min(mesh.count, this.near)
    }
    mesh.onAfterShadow = () => {
      mesh.count = mesh.full
    }
    this.max = max
  }
  // view: a THREE.Frustum of what the camera sees (none: draw everyone)
  // People within NEAR of the Roadster go first, and only they are drawn into its shadow map.
  update (peds, view = null) {
    const sim = peds.traffic?.sim,
      me = sim ? (sim.mode === 'ground' ? sim.pos : sim.com) : null
    let i = 0
    for (let pass = 0; pass < 2; pass++) {
      for (const d of peds.list) {
        if (i >= this.max) break
        const dx = me ? d.x - me.x : 0,
          dz = me ? d.z - me.z : 0
        if (dx * dx + dz * dz < NEAR * NEAR !== (pass === 0)) continue
        if (view) {
          _sp.center.set(d.x, 0.9, d.z)
          _sp.radius = 4.5 // (and their shadow, a few metres long)
          if (!view.intersectsSphere(_sp)) continue
        }
        this.put(d, i++)
      }
      if (pass === 0) this.near = i
    }
    this.mesh.count = i
    // (only the people drawn go up to the GPU, not the whole buffer)
    if (!i) return
    const m = this.mesh.instanceMatrix
    m.clearUpdateRanges()
    m.addUpdateRange(0, i * 16)
    m.needsUpdate = true
    for (const a of this.attrs) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, i * a.itemSize)
      a.needsUpdate = true
    }
  }
  put (d, i) {
    const k = d.look
    // up on the pavement, down in the road
    const h = kerbDist(d.x, d.z) > 0 ? 0 : CURB_H
    // (fields and arrays written directly: no numbers passed to calls)
    _q._x = _q._z = 0
    _q._y = Math.sin(d.yaw / 2)
    _q._w = Math.cos(d.yaw / 2)
    _p.x = d.x
    _p.y = h
    _p.z = d.z
    _s.x = _s.y = d.tall
    _s.z = d.wide
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(i, _m)
    const P = this.pose.array,
      A = this.act.array,
      j = i * 4
    P[j] = d.phase
    P[j + 1] = d.gait
    P[j + 2] = d.fright
    P[j + 3] = d.hop
    A[j] = d.head
    A[j + 1] = d.act === 1 ? 1 : 0
    A[j + 2] = d.act === 2 ? 1 : 0
    A[j + 3] = d.phase
    const sh = SHIRTS[Math.floor(k * SHIRTS.length) % SHIRTS.length],
      pa = PANTS[Math.floor(((k * 13.7) % 1) * PANTS.length)]
    const S = this.shirt.array,
      T = this.pants.array,
      K = this.skin.array,
      c = i * 3
    S[c] = sh.r
    S[c + 1] = sh.g
    S[c + 2] = sh.b
    T[c] = pa.r
    T[c + 1] = pa.g
    T[c + 2] = pa.b
    K[i * 2] = (k * 5.31) % 1
    K[i * 2 + 1] = (k * 9.17) % 1
    this.style.array[i] = styleOf(k)
  }
}
