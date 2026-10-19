// The traffic's damage as it is seen (sim/carDamage.js keeps it): each car's body crumpled in
// where it was hit, bent in the vertex shader of every one of its type's instanced meshes (paint,
// glass, trim and lamps alike, from the same function of where each vertex lies on the car at rest,
// so nothing comes apart; the wheels are left as they are), its shadow too; the crumpled metal
// faceted, catching the light; the lamps on the side hit broken and dark; the glass crazed in a
// web of cracks, or gone, a few shards left in the frame. All of it comes from two numbers a car,
// four each (aDent: twelve zones of crumple, three to a number; aHurt: its broken lamps, its glass,
// its type and a seed), the same pair read by all of a type's meshes, so a damaged car costs no
// draw call more than a whole one, and a whole one skips it all.
import * as THREE from 'three'
import { TYPES } from '../sim/traffic.js'
import { DENT_MAX } from '../sim/carDamage.js'

// each type's measurements for the shader: (half length, half width, height, the beltline at the
// front), (the beltline at the back, 0, 0, 0)
const DIMS = {
  value: Array.from({ length: TYPES.length * 2 }, () => new THREE.Vector4())
}
const f = v => v.toFixed(5)

// The bend, in the vertex shader. The zones' pushes are drawn through smoothly along each face (the
// nose and the tail through three, each flank through five, the corners shared), and reach in from
// the face the further the deeper they are (never so steeply that the panels fold over); the body
// gives most low down, less up at the roof; the push is uneven across each face, a bonnet or boot
// lid crushed from its end buckles up, and the metal folds as it goes in.
const VERT = `
uniform vec4 uDentDims[${TYPES.length * 2}];
attribute vec4 aDent;
attribute vec4 aHurt;
varying float vDentK;
varying vec3 vDentP;
vec3 dentUnpack (float v) {
  float c = floor(v / 65536.0);
  v -= c * 65536.0;
  float b = floor(v / 256.0);
  return vec3(v - b * 256.0, b, c) * ${f(DENT_MAX / 255)};
}
float dentEase (float a, float b, float t) {
  t = clamp(t, 0.0, 1.0);
  return mix(a, b, t * t * (3.0 - 2.0 * t));
}
float dentEnd (vec3 z, float u) {
  return u < 1.0 ? dentEase(z.x, z.y, u) : dentEase(z.y, z.z, u - 1.0);
}
float dentFlank (float a, vec3 m, float e, float u) {
  if (u < 1.0) return dentEase(a, m.x, u);
  if (u < 2.0) return dentEase(m.x, m.y, u - 1.0);
  if (u < 3.0) return dentEase(m.y, m.z, u - 2.0);
  return dentEase(m.z, e, u - 3.0);
}
float dentIn (float d, float f) {
  return clamp(d / (0.5 + 2.4 * f), 0.0, 1.0);
}
float dentWrinkle (vec2 q, float s) {
  return sin(q.x * 7.1 + q.y * 4.3 + s) * sin(q.y * 8.9 - q.x * 3.7 + 2.0 * s)
    + 0.4 * sin(q.x * 13.3 - q.y * 11.1 + 3.0 * s);
}
vec3 dentAt (vec3 p) {
  vDentK = 0.0;
  vDentP = p;
  if (aDent.x + aDent.y + aDent.z + aDent.w < 0.5) return p;
  int k = int(aHurt.z + 0.5) * 2;
  vec4 A = uDentDims[k], B = uDentDims[k + 1];
  float L = A.x, W = A.y;
  // (the nose: left corner, middle, right corner; the right flank, front to back; the tail, right
  // corner to left; the left flank, back to front)
  vec3 n = dentUnpack(aDent.x), r = dentUnpack(aDent.y);
  vec3 t = dentUnpack(aDent.z), l = dentUnpack(aDent.w);
  float v = clamp(p.z / W + 1.0, 0.0, 2.0), u = clamp(2.0 - 2.0 * p.x / L, 0.0, 4.0);
  float fN = dentEnd(n, v), fT = dentEnd(t.zyx, v);
  float fR = dentFlank(n.z, r, t.x, u), fL = dentFlank(n.x, l.zyx, t.z, u);
  float tN = dentIn(L - p.x, fN), tT = dentIn(L + p.x, fT);
  float tR = dentIn(W - p.z, fR), tL = dentIn(W + p.z, fL);
  float gN = (1.0 - tN) * (1.0 - tN), gT = (1.0 - tT) * (1.0 - tT);
  float gR = (1.0 - tR) * (1.0 - tR), gL = (1.0 - tL) * (1.0 - tL);
  float s = aHurt.w * 6.2832;
  float wE = dentWrinkle(p.zy, s), wT = dentWrinkle(p.zy, s + 3.1);
  float wR = dentWrinkle(p.xy, s + 1.7), wL = dentWrinkle(p.xy, s + 4.6);
  vec3 d = vec3(fT * gT * (1.0 + 0.25 * wT) - fN * gN * (1.0 + 0.25 * wE), 0.0,
    fL * gL * (1.0 + 0.25 * wL) - fR * gR * (1.0 + 0.25 * wR));
  d.xz *= 1.0 - 0.45 * smoothstep(0.35 * A.z, A.z, p.y);
  float lid = 1.0 + 0.3 * dentWrinkle(p.xz, s + 2.3);
  d.y += (fN * tN * (1.0 - tN) * 2.0 * smoothstep(A.w - 0.04, A.w + 0.06, p.y)
    + fT * tT * (1.0 - tT) * 1.5 * smoothstep(B.x - 0.04, B.x + 0.06, p.y)) * lid;
  d.y += (fN * gN + fT * gT + fR * gR + fL * gL) * 0.12 * sin(p.x * 21.0 + p.z * 5.0 + s);
  vDentK = length(d);
  return p + d;
}
`
// In the fragment shader: the crumpled metal takes on its own facets' normals, the more the
// further it went in (as the Roadster's dents do: damage.js), crinkled finer than the facets go
// (the crinkles laid on the panel where it was, so they stay put on it as the car moves)
const FACETS = `#include <normal_fragment_begin>
  if (vDentK > 0.01) {
    float dk = smoothstep(0.01, 0.12, vDentK);
    vec3 facet = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 c = vDentP * 17.0;
    vec3 crinkle = vec3(sin(c.x + 1.7 * sin(c.y * 1.3 + c.z)),
      sin(c.y * 1.2 + 1.9 * sin(c.z * 0.8 + c.x)), sin(c.z * 0.9 + 1.5 * sin(c.x * 1.1 + c.y)));
    normal = normalize(mix(normal, facet, 0.7 * dk) + crinkle * 0.14 * dk);
    nonPerturbedNormal = normal;
  }`
// and the paint over it scuffed, its gloss gone, and scraped through to the grey primer in
// streaks along the car, in patches
const SCUFF = `
  float dentK = 0.0;
  if (vDentK > 0.03) {
    dentK = smoothstep(0.03, 0.2, vDentK);
    vec3 c = vDentP;
    float streak = abs(sin(c.y * 90.0 + 0.5 * sin(c.x * 2.3 + c.z * 1.7)));
    float patchy = smoothstep(0.55, 0.95,
      0.5 + 0.5 * sin(c.x * 7.0 + c.z * 5.0) * sin(c.y * 31.0 - c.x * 3.0));
    float scrape = (1.0 - smoothstep(0.0, 0.08 + fwidth(streak), streak)) * patchy;
    scrape *= smoothstep(0.08, 0.25, vDentK);
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.1 * dentK), vec3(0.38, 0.39, 0.4), 0.55 * scrape);
    roughnessFactor = mix(roughnessFactor, 0.6, 0.45 * dentK);
    metalnessFactor *= 1.0 - scrape;
  }`
const SCUFF_LIGHT = `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
    if (dentK > 0.0) material.clearcoat *= 1.0 - 0.8 * dentK;
  #endif`

// The lamps a car has broken (aHurt.x: carDamage.js LAMPS' bits, by end and side): those at that
// end on that side, headlights, tail lights, running lights, indicators, reversing lamps and side
// markers (not the mirrors' indicators, the high stop lamp or a light bar), dark and smashed. The
// side is told apart in the fragment shader, so a light bar across the back goes out at its middle.
const LAMP_V = `varying vec3 vLampOut;`
const LAMP_SET = `
  vLampOut = vec3(position.x / uDentDims[int(aHurt.z + 0.5) * 2].x, position.z, aHurt.x);`
const LAMP_F = `
  float lampOut = 0.0;
  if (vLampOut.z > 0.5 && abs(vLampOut.x) > 0.5) {
    int bits = int(vLampOut.z + 0.5), tag = int(vTag + 0.5);
    bool end = tag == 1 || tag == 2 || tag == 4 || tag == 5 || tag == 6 || tag == 9 || tag == 12
      || tag == 13;
    int q = vLampOut.x > 0.0 ? (vLampOut.y > 0.0 ? 2 : 1) : (vLampOut.y > 0.0 ? 8 : 4);
    if (end && (bits & q) != 0) {
      lampOut = 1.0;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.013), 0.88);
      roughnessFactor = 0.6;
    }
  }`

// The glass a car has crazed or lost (aHurt.y: carDamage.js PANE's, three bits a pane), the pane
// told by which way it faces: a spider's web of cracks round where it was hit (in the middle of the
// pane, a little to one side), running further and finer the worse it is (whitened where they catch
// the light, a little milky between), or, gone, the dark of the cabin behind with a few shards of
// crazed glass left. Laid out on the pane's own plane, so it stays put on the glass, and softened
// at a distance (by the cracks' own rate of change) so it doesn't fizz.
const GLASS_V = `varying vec3 vGlassP;
varying vec3 vGlassN;
varying vec2 vGlassS;
varying vec4 vGlassD;`
const GLASS_SET = `vGlassP = position;
vGlassN = normal;
vGlassS = vec2(aHurt.y, aHurt.w);
{
  int k = int(aHurt.z + 0.5) * 2;
  vGlassD = vec4(uDentDims[k].wz, uDentDims[k + 1].x, uDentDims[k].x);
}`
// The cracks, also drawn on the Roadster's crazed glass (damage.js): glassCells, the distance to
// the nearest edge between cells and the cell's own number; glassWeb, 1 on a crack of a web round
// c (q and c on the pane, m; lv, 0 to 1, how far it has gone; s, a seed): spokes out from c,
// wavering a little, and the cells between them crazed, the finer ones only near c
export const CRACKS = `
vec2 glassHash (vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
vec2 glassCells (vec2 p) {
  vec2 i = floor(p), f = fract(p), id = vec2(0.0);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + glassHash(i + g) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = i + g;
      } else if (d < d2) d2 = d;
    }
  return vec2(sqrt(d2) - sqrt(d1), glassHash(id * 1.7).x);
}
float glassWeb (vec2 q, vec2 c, float lv, float s) {
  vec2 d = q - c;
  float r = length(d) + 1e-4;
  float run = 1.0 - smoothstep(0.08 + 0.75 * lv, 0.2 + 1.3 * lv, r);
  if (run <= 0.0) return 0.0;
  float a = atan(d.y, d.x) * 1.4324 + s * 5.0;
  float sp = abs(fract(a + 0.1 * sin(r * 19.0 + s * 7.0)) - 0.5) * 0.698 * r;
  float spoke = 1.0 - smoothstep(0.0, 0.8 * fwidth(sp) + 0.0025, sp);
  vec2 c1 = glassCells(q * 11.0 + s * 31.0), c2 = glassCells(q * 30.0 + s * 17.0);
  float big = 1.0 - smoothstep(0.0, 0.8 * fwidth(c1.x) + 0.012, c1.x);
  float fine = (1.0 - smoothstep(0.0, 0.8 * fwidth(c2.x) + 0.01, c2.x))
    * (1.0 - smoothstep(0.05, 0.12 + 0.5 * lv, r));
  return min(1.0, max(spoke, big * smoothstep(0.15, 0.5, lv + 0.3 * (1.0 - r))) + 0.6 * fine)
    * run;
}`
const GLASS_F = `
  float crack = 0.0, haze = 0.0, gone = 0.0;
  if (vGlassS.x > 0.5) {
    float g = vGlassS.x, lv, s = vGlassS.y * 6.2832;
    vec3 n = normalize(vGlassN);
    // (the pane's middle, between the beltline and the roof: vGlassD is the front beltline, the
    // height, the rear beltline and the half length)
    vec2 q = vGlassP.zy, c = vec2(0.25 * sin(s), 0.5 * (vGlassD.x + vGlassD.y));
    if (abs(n.z) > 0.55) {
      lv = mod(floor(g / (n.z > 0.0 ? 512.0 : 64.0)), 8.0);
      q = vGlassP.xy;
      c.x = 0.3 * vGlassD.w * sin(s + n.z);
    } else if (n.x > 0.0) lv = mod(g, 8.0);
    else {
      lv = mod(floor(g / 8.0), 8.0);
      c.y = 0.5 * (vGlassD.z + vGlassD.y);
    }
    if (lv > 6.5) {
      vec2 c1 = glassCells(q * 11.0 + s * 31.0);
      gone = step(0.2, c1.y);
      crack = (1.0 - gone) * (1.0 - smoothstep(0.0, 0.8 * fwidth(c1.x) + 0.012, c1.x));
      haze = 1.0 - gone;
    } else if (lv > 0.5) {
      crack = glassWeb(q, c, lv / 6.0, s);
      haze = (lv / 6.0) * (1.0 - smoothstep(0.1, 0.3 + lv * 0.2, length(q - c)));
    }
    diffuseColor.rgb = mix(diffuseColor.rgb + 0.05 * haze, vec3(0.52, 0.55, 0.58), 0.85 * crack);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.007, 0.008), gone);
    roughnessFactor = mix(mix(roughnessFactor, 0.45, max(crack, 0.3 * haze)), 1.0, gone);
  }`
const GLASS_LIGHT = `#include <lights_physical_fragment>
  if (vGlassS.x > 0.5) {
    #ifdef USE_CLEARCOAT
      material.clearcoat *= (1.0 - gone) * (1.0 - 0.7 * crack);
    #endif
    material.specularColor *= 1.0 - 0.96 * gone;
    material.specularF90 *= 1.0 - 0.96 * gone;
  }`

// m (a type's paint, the traffic's glass or its trim with the lamps: kind 'paint', 'glass' or
// 'trim'; or any other part a type has, 'part', bent and faceted only) bent by its cars' dents, on
// top of whatever its own shader already does
export function dented (m, kind) {
  const before = m.onBeforeCompile,
    key = m.customProgramCacheKey
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer)
    shader.uniforms.uDentDims = DIMS
    const glass = kind === 'glass',
      trim = kind === 'trim'
    const head = VERT + (glass ? GLASS_V : trim ? LAMP_V : '')
    const set = glass ? GLASS_SET : trim ? LAMP_SET : ''
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace(
        '#include <project_vertex>',
        `transformed = dentAt(transformed);\n${set}\n#include <project_vertex>`
      )
    let fs = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nvarying float vDentK;\nvarying vec3 vDentP;\n${
        glass ? GLASS_V + CRACKS : trim ? LAMP_V : ''
      }`
    )
    if (glass)
      fs = fs
        .replace(
          '#include <normal_fragment_begin>',
          `${GLASS_F}\n#include <normal_fragment_begin>`
        )
        .replace('#include <lights_physical_fragment>', GLASS_LIGHT)
    // (a broken lamp's glow taken off again, after the lamps' own shader has added it)
    else if (trim)
      fs = fs
        .replace('#include <normal_fragment_begin>', `${LAMP_F}\n${FACETS}`)
        .replace(
          '#include <lights_physical_fragment>',
          `totalEmissiveRadiance -= vGlow * lampOut;
          #include <lights_physical_fragment>`
        )
    else if (kind === 'paint')
      fs = fs
        .replace('#include <normal_fragment_begin>', `${SCUFF}\n${FACETS}`)
        .replace('#include <lights_physical_fragment>', SCUFF_LIGHT)
    else fs = fs.replace('#include <normal_fragment_begin>', FACETS)
    shader.fragmentShader = fs
  }
  m.customProgramCacheKey = () => `${key.call(m)} dented ${kind}`
  return m
}

// The shadow's depth, bent the same way: one for meshes with colours per car, one for those
// without (see city.js depthMaterials)
function depth () {
  const m = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking
  })
  m.onBeforeCompile = shader => {
    shader.uniforms.uDentDims = DIMS
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT}`)
      .replace(
        '#include <project_vertex>',
        'transformed = dentAt(transformed);\n#include <project_vertex>'
      )
  }
  m.customProgramCacheKey = () => 'traffic dents depth'
  return m
}
const DEPTH = { plain: depth(), tinted: depth() }
const KINDS = ['paint', 'glass', 'trim']

// The per-car damage for type k's meshes (parts: { body, glass, trim, ... }, an InstancedMesh each
// for up to max cars, all drawing the same cars in the same order): the pair of attributes they
// share, its measurements (S: its shape's lines, carShapes.js), their materials bent by it (each
// once: the glass and trim are every type's), and their shadows' depth bent with them. Any other
// part a type has is bent with its body, and faceted where it crumples. Returns the pair.
export function dentsFor (parts, max, k, S) {
  const dent = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4)
  const hurt = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4)
  for (const a of [dent, hurt]) a.setUsage(THREE.DynamicDrawUsage)
  for (let i = 0; i < max; i++) hurt.array[i * 4 + 2] = k
  for (const [name, m] of Object.entries(parts)) {
    m.geometry.setAttribute('aDent', dent)
    m.geometry.setAttribute('aHurt', hurt)
    m.customDepthMaterial = m.instanceColor ? DEPTH.tinted : DEPTH.plain
    if (m.material.userData.dented) continue
    m.material.userData.dented = true
    const kind = name === 'body' ? 'paint' : name
    dented(m.material, KINDS.includes(kind) ? kind : 'part')
  }
  DIMS.value[k * 2].set(S.L, S.W, TYPES[k].hgt, S.belt(S.L - 0.6))
  DIMS.value[k * 2 + 1].set(S.belt(0.6 - S.L), 0, 0, 0)
  return { dent, hurt }
}

// car's damage into instance i of its type's (ty: render/traffic.js's, with dent and hurt)
const Q = 255 / DENT_MAX
const q3 = (d, z) =>
  Math.min(255, Math.round(d[z] * Q)) +
  256 * Math.min(255, Math.round(d[z + 1] * Q)) +
  65536 * Math.min(255, Math.round(d[z + 2] * Q))
export function putDents (ty, i, car) {
  const A = ty.dent.array,
    H = ty.hurt.array,
    j = i * 4,
    D = car.dmg
  if (!D) {
    A[j] = A[j + 1] = A[j + 2] = A[j + 3] = H[j] = H[j + 1] = 0
    return
  }
  const d = D.dents
  A[j] = q3(d, 0)
  A[j + 1] = q3(d, 3)
  A[j + 2] = q3(d, 6)
  A[j + 3] = q3(d, 9)
  H[j] = D.lamps
  H[j + 1] = D.glass
  H[j + 3] = (car.paint * 7.77) % 1
}
// how many of car's headlights still work (0, 1 or 2), for its beams on the road
export function headlightsLeft (car) {
  const b = car.dmg ? car.dmg.lamps : 0
  return 2 - (b & 1) - ((b >> 1) & 1)
}
