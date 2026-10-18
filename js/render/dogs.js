// Dogs on a lead (the sim is sim/dogs.js), all in one instanced mesh of the figure in dogFigure.js,
// posed in the vertex shader as the people are: a trot, each diagonal pair of legs together and the
// paw lifted as it swings forward, the body bobbing, the tail wagging (less at a run), the floppy
// ears of some hanging down, and sat on its haunches while its owner stands about; its lead runs
// from its collar to its owner's hand, sagging a little, and is put away if it has dived off. Its
// coat, from its look: black, brown, golden, cream, grey, white or red, some with a pale chest or a
// dark saddle, and a collar. Lit at night by the nearest street light, as the people are.
import * as THREE from 'three'
import { NEAR } from './traffic.js'
import { CURB_H } from '../sim/city.js'
import { kerbDist } from '../sim/street.js'
import { DOG, HIPS, COLLAR, dogFigure } from './dogFigure.js'
import { lampOn, LAMP_VERTEX, LAMP_FRAGMENT } from './pedLight.js'

const HASH = `
  float dogHash (float k, float m) { return fract(sin(k * 78.233 + m * 12.9898) * 43758.5453); }
`
const VARY = `
  varying vec3 vRest;
  flat varying float vDogPart;
  flat varying float vDogLook;
`
const POSE = `
  attribute float aPart;
  attribute vec4 aDog; // stride's phase, stride (0 standing, 1 a trot, 1.6 a run), tail's clock, sat
  attribute vec4 aHand; // its owner's hand in its own frame (the lead's far end), and the lead shown
  attribute float aLook;
  mat2 dogRot (float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  vec3 dogPose (vec3 p, float w, int part) {
    float ph = aDog.x, gait = aDog.y, sit = aDog.w;
    float run = clamp((gait - 1.2) * 2.5, 0.0, 1.0);
    vec2 f = vec2(${HIPS.front}, ${HIPS.y});
    vec3 collar = vec3(${COLLAR.join(', ')});
    collar.xy = f + dogRot(0.62 * sit) * (collar.xy - f);
    if (part == ${DOG.LEAD}) {
      // from the collar to the hand, sagging more the slacker it is
      if (aHand.w < 0.5 || w < 0.5) return aHand.w < 0.5 ? collar * w : p;
      vec3 d = aHand.xyz - collar;
      float sag = 0.03 + 0.12 * (1.0 - clamp(length(d) / 1.6, 0.0, 1.0));
      return collar + d * p.x + vec3(0.0, p.y - sag * sin(3.14159 * p.x), p.z);
    }
    if (part >= ${DOG.LEG_FL} && part <= ${DOG.LEG_BR}) {
      bool front = part <= ${DOG.LEG_FR}, left = part == ${DOG.LEG_FL} || part == ${DOG.LEG_BL};
      // a trot: each diagonal pair together, the front left with the back right
      float q = ph + (front == left ? 0.0 : 3.14159);
      float swing = (0.3 + 0.25 * run) * min(gait, 1.0) * sin(q);
      vec2 hip = vec2(front ? ${HIPS.front} : ${HIPS.back}, ${HIPS.y}) * w;
      // (the paw lifted as the leg swings forward)
      if (w > 0.5) p.y += 0.05 * min(gait, 1.2) * max(0.0, cos(q)) * max(0.0, 1.0 - p.y / ${HIPS.y});
      // sat, a hind leg folded up under it
      if (!front && sit > 0.0) {
        if (w > 0.5) p.y = hip.y + (p.y - hip.y) * (1.0 - 0.55 * sit);
        swing += 0.9 * sit;
      }
      p.xy = hip + dogRot(swing) * (p.xy - hip);
    }
    if (part == ${DOG.TAIL}) {
      // wagging, about its root; held out behind at a run
      vec2 r = vec2(-0.33, 0.0) * w;
      p.xz = r + dogRot(0.45 * (1.0 - 0.7 * run) * sin(aDog.z)) * (p.xz - r);
    }
    if (part == ${DOG.EAR} && w > 0.5 && dogHash(aLook, 3.0) < 0.55) {
      // floppy ears, hanging down by the head
      float s = p.z > 0.0 ? 1.0 : -1.0;
      vec2 e = vec2(0.69, 0.045 * s);
      p.yz = e + dogRot(2.6 * s) * (p.yz - e);
      p.z += 0.035 * s;
    }
    // the body bobbing with the trot
    p.y += w * 0.015 * min(gait, 1.4) * sin(2.0 * ph);
    // sat: all but the front legs tipped back about where they meet the body, the rump down
    if (sit > 0.0 && part != ${DOG.LEG_FL} && part != ${DOG.LEG_FR})
      p.xy = f * w + dogRot(0.62 * sit) * (p.xy - f * w);
    return p;
  }
`
// its coat and the rest, per fragment at its rest place q
const COAT = `
  float dogRough = 0.9;
  vec3 dogCoat (int part, vec3 q, float k) {
    float h = dogHash(k, 1.0), m = dogHash(k, 2.0);
    vec3 coat = h < 0.18 ? vec3(0.04) : h < 0.36 ? vec3(0.28, 0.16, 0.08)
      : h < 0.54 ? vec3(0.78, 0.58, 0.32) : h < 0.66 ? vec3(0.88, 0.8, 0.64)
      : h < 0.76 ? vec3(0.5, 0.5, 0.52) : h < 0.86 ? vec3(0.9, 0.89, 0.86) : vec3(0.62, 0.3, 0.12);
    vec3 c = coat;
    // a pale chest and belly on some; a dark saddle on others; darker ears
    if (m < 0.3 && part <= ${DOG.HEAD} && (q.y < 0.36 || (q.x > 0.2 && q.y < 0.55))) c = vec3(0.9, 0.88, 0.84);
    if (m > 0.8 && part == ${DOG.BODY} && q.y > 0.49) c = coat * 0.3;
    if (part == ${DOG.EAR}) c = coat * 0.75;
    if (part == ${DOG.HEAD}) {
      // the nose, the eyes, and the collar round the neck
      if (q.x > 0.55) {
        c = vec3(0.03);
        dogRough = 0.3;
      }
      if (q.x > 0.44 && q.x < 0.49 && abs(q.y - 0.665) < 0.012 && abs(abs(q.z) - 0.048) < 0.013) c = vec3(0.03);
      if (q.x > 0.255 && q.x < 0.29) c = dogHash(k, 4.0) < 0.5 ? vec3(0.7, 0.08, 0.06) : vec3(0.06, 0.2, 0.5);
    }
    if (part == ${DOG.LEAD}) c = dogHash(k, 5.0) < 0.6 ? vec3(0.03) : vec3(0.5, 0.06, 0.05);
    return pow(c, vec3(2.2));
  }
`
// Put the pose (and with colour, the coat and the street light's light) into a material's shaders
function dogShader (shader, colour) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\n' +
        HASH +
        POSE +
        (colour ? VARY + LAMP_VERTEX.head : '')
    )
    .replace(
      'void main() {',
      'void main() {\n  int dogPart = int(aPart + 0.5);'
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${
        colour
          ? 'vRest = position; vDogPart = aPart; vDogLook = aLook;' +
            LAMP_VERTEX.main
          : ''
      }
      transformed = dogPose(transformed, 1.0, dogPart);`
    )
  if (shader.vertexShader.includes('#include <beginnormal_vertex>'))
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      objectNormal = normalize(dogPose(objectNormal, 0.0, dogPart) + vec3(0.0, 1e-5, 0.0));`
    )
  if (!colour) return
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\n' + VARY + LAMP_FRAGMENT.head + HASH + COAT
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      diffuseColor.rgb = dogCoat(int(vDogPart + 0.5), vRest, vDogLook);`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n  roughnessFactor = dogRough;'
    )
    .replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n' + LAMP_FRAGMENT.main
    )
}

const _sp = new THREE.Sphere()
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3()
const LAMP = { x: 0, y: 0, z: 0, w: 0 }

export class DogView {
  // parent: what the mesh hangs from (the people's mesh: hidden with it from the city's sun shadow)
  constructor (parent, max = 48) {
    const g = dogFigure()
    const at = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(max * size),
        size
      )
      a.setUsage(THREE.DynamicDrawUsage)
      g.setAttribute(name, a)
      return a
    }
    this.pose = at('aDog', 4)
    this.hand = at('aHand', 4)
    this.look = at('aLook', 1)
    this.lamp = at('aLamp', 4)
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    mat.onBeforeCompile = shader => dogShader(shader, true)
    mat.customProgramCacheKey = () => 'dog'
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide
    })
    depth.onBeforeCompile = shader => dogShader(shader, false)
    depth.customProgramCacheKey = () => 'dog depth'
    const mesh = (this.mesh = new THREE.InstancedMesh(g, mat, max))
    mesh.customDepthMaterial = depth
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.count = 0
    parent.add(mesh)
    this.attrs = [this.pose, this.hand, this.look, this.lamp]
    // into the shadow map, only the dogs near the Roadster (the first `near`), as the people
    this.near = 0
    mesh.onBeforeShadow = () => {
      mesh.full = mesh.count
      mesh.count = Math.min(mesh.count, this.near)
    }
    mesh.onAfterShadow = () => {
      mesh.count = mesh.full
    }
    this.max = max
  }
  // dogs: the sim's (peds.dogs); view: a THREE.Frustum, or none; me: the Roadster's place; on: how
  // far the street lights are on
  update (dogs, view, me, on) {
    let i = 0
    for (let pass = 0; pass < 2; pass++) {
      for (const d of dogs) {
        if (i >= this.max) break
        if (d.owner.gone) continue
        const dx = me ? d.x - me.x : 0,
          dz = me ? d.z - me.z : 0
        if (dx * dx + dz * dz < NEAR * NEAR !== (pass === 0)) continue
        if (view) {
          _sp.center.set(d.x, 0.4, d.z)
          _sp.radius = 3
          if (!view.intersectsSphere(_sp)) continue
        }
        this.put(d, i++, on)
      }
      if (pass === 0) this.near = i
    }
    this.mesh.count = i
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
  put (d, i, on) {
    const o = d.owner,
      h = kerbDist(d.x, d.z) > 0 ? 0 : CURB_H,
      k = d.size
    _q._x = _q._z = 0
    _q._y = Math.sin(d.yaw / 2)
    _q._w = Math.cos(d.yaw / 2)
    _p.x = d.x
    _p.y = h
    _p.z = d.z
    _s.x = _s.y = _s.z = k
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(i, _m)
    const P = this.pose.array,
      H = this.hand.array,
      j = i * 4
    P[j] = d.phase
    P[j + 1] = Math.min(1.6, d.v / 1.4)
    P[j + 2] = d.wag
    P[j + 3] = d.sit
    // the owner's hand (on the dog's side of them, a little forward, at their hip; or up by their
    // shoulder, if that is the hand holding an umbrella), in the dog's frame and size; the lead
    // put away if the dog is off out of reach
    const c = Math.cos(o.yaw),
      s = Math.sin(o.yaw),
      oh = kerbDist(o.x, o.z) > 0 ? 0 : CURB_H,
      up = d.side > 0 && o.umb > 0.5
    const f = up ? 0.16 : 0.12,
      r = (up ? 0.2 : 0.25) * d.side
    const wx = o.x + c * f + s * r - d.x,
      wz = o.z - s * f + c * r - d.z
    const dc = Math.cos(d.yaw),
      ds = Math.sin(d.yaw)
    H[j] = (wx * dc - wz * ds) / k
    H[j + 1] = ((up ? 1.5 : 0.84) * o.tall + oh - h) / k
    H[j + 2] = (wx * ds + wz * dc) / k
    H[j + 3] = wx * wx + wz * wz < 4.8 ? 1 : 0
    this.look.array[i] = d.look
    lampOn(d.x, d.z, on, LAMP)
    const L = this.lamp.array
    L[j] = LAMP.x
    L[j + 1] = LAMP.y - h
    L[j + 2] = LAMP.z
    L[j + 3] = LAMP.w
  }
}
