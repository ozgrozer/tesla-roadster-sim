// The palms and trees in the wind, and each in two shapes by its distance from the camera
// (grove.js): their shader, added to three.js's standard material and to the depth material their
// shadows are drawn with, so that the shadows move with them. Everything moves in the vertex
// shader: a palm's trunk bends from its foot, most near the top, and its crown turns with it;
// leaves flutter, fronds bob, and in a gale their tips stream downwind; a street tree's crown sways
// over its fork. Each tree sways in its own time (its phase from where it stands), and the wind
// comes in gusts that roll down the streets the way it blows. The same shader gives each kind its
// look from a few numbers each carries in its instance colour (cityTrees.js): a fan palm's skirt
// of dead fronds as long as its own, a trunk's own curve, a street tree's kind (its leaves'
// picture and colour), its crown drawn up tall or spread wide, a jacaranda in flower; a palm leaf
// glossy and paler under, a street tree's crown lit as one rounded mass whichever side of a leaf
// card is seen.
import * as THREE from 'three'
import { SIZE } from './treeTex.js'
import { SKIRT_Y } from './palmShapes.js'
import { FORK, KINDS } from './treeShapes.js'

// The wind, for the weather to set: time (s, run on by the city view), strength (0 a calm, 0.25 a
// breeze, 1 a storm that thrashes the crowns) and the way it blows over the ground (x east, z
// south): in off the sea, from the west.
export const WIND = {
  time: { value: 0 },
  strength: { value: 0.25 },
  dir: { value: new THREE.Vector2(0.96, -0.28).normalize() }
}
// Where the camera is (set each frame), for the shapes by distance: the full ones out to LOD.near
// m, the cheap ones from LOD.far m, and between the two each draws its share of the pixels.
export const EYE = { value: new THREE.Vector3() }
export const LOD = { near: 46, far: 50 }

const glsl = c =>
  `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
const f1 = x => x.toFixed(3)
const POSED = 'transformed = treePose(transformed);'

// What every vertex shader gets: the pose (and which shape draws it).
const POSE = `
uniform float uWindTime, uWindStrength, uNear, uShadow, uTall, uKind;
uniform vec2 uWindDir;
uniform vec3 uEye;
// in a gale: how far the top leans and sways (m), how fast it sways (rad/s); its own curve (m)
uniform vec4 uBend;
// in a gale: how far a leaf's tip flutters, bobs and streams downwind (m)
uniform vec3 uLeaf;
// how far up it hangs (a share of uTall, 1 the crown); how freely it moves; a phase; its part
attribute vec4 aSway;
varying float vLod;
flat varying float vPart;
#ifdef USE_INSTANCING_COLOR
  #define TREE_Q instanceColor
#else
  #define TREE_Q vec3(1.0, 0.5, 0.0)
#endif
float treeHash (vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 treePose (vec3 p) {
  vec3 ip = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  // near or far: the shape the other mesh draws is folded away to a point (and the shadows are
  // all of the cheap shapes)
  float f = uShadow > 0.5 ? 1.0 : smoothstep(${f1(LOD.near)}, ${f1(LOD.far)}, distance(ip, uEye));
  vLod = f;
  if (uNear > 0.5 ? f > 0.999 : f < 0.001) return vec3(0.0);
  vec3 q = TREE_Q;
  float part = aSway.w, seed = treeHash(ip.xz);
  // a fan palm's skirt hangs q.r m (built 1 m long); a date palm's dead fronds are trimmed off
  // (q.r 0), folded away into its crown
  if (uKind < 0.5 && part > 2.5) p.y = ${f1(SKIRT_Y)} - (${f1(SKIRT_Y)} - p.y) * q.r;
  if (uKind > 0.5 && uKind < 1.5 && part > 1.5) p = mix(vec3(0.0, uTall - 0.3, 0.0), p, q.r);
  // a street tree's crown drawn up tall (q.r > 0) or spread out wide (< 0)
  if (uKind > 1.5) {
    float w = part > 3.5 ? 1.0 : smoothstep(${f1(FORK)}, ${f1(FORK + 1.5)}, p.y);
    vec3 sc = q.r > 0.0
      ? vec3(1.0 - 0.16 * q.r, 1.0 + 0.3 * q.r, 1.0 - 0.16 * q.r)
      : vec3(1.0 - 0.3 * q.r, 1.0 + 0.16 * q.r, 1.0 - 0.3 * q.r);
    vec3 c = vec3(0.0, uTall, 0.0);
    p = c + (p - c) * mix(vec3(1.0), sc, w);
  }
  // the wind: how hard (none on one knocked over), and the way it blows in the model's own frame
  float k = uWindStrength * smoothstep(0.93, 0.99, instanceMatrix[1].y / length(instanceMatrix[1].xyz));
  vec2 wd = normalize((vec4(uWindDir.x, 0.0, uWindDir.y, 0.0) * instanceMatrix).xz + vec2(1e-6, 0.0));
  float t = uWindTime, along = dot(ip.xz, uWindDir);
  float gust = 0.5 + 0.5 * sin(t * 0.8 - along * 0.035 + seed) * sin(t * 0.27 - along * 0.012 + 1.3);
  float sw = sin(t * uBend.z * (0.85 + 0.3 * seed) + seed * 6.283);
  float sw2 = sin(t * uBend.z * 0.71 + seed * 19.0);
  // where the top goes: its own curve, leaning with the wind, swaying about that
  vec2 bend = vec2(q.b * uBend.w, 0.0)
    + wd * (k * k * uBend.x * (0.4 + 0.6 * gust) + k * uBend.y * (0.5 + 0.5 * gust) * sw)
    + vec2(-wd.y, wd.x) * (k * uBend.y * 0.4 * sw2);
  float h = aSway.x;
  // the crown turns with the top of the trunk
  if (h > 0.999) {
    vec3 r = p - vec3(0.0, uTall, 0.0);
    vec2 sl = bend * (2.0 / uTall);
    float ry = r.y;
    r.y -= dot(sl, r.xz);
    r.xz += sl * ry;
    p = vec3(0.0, uTall, 0.0) + r;
  }
  p.xz += bend * h * h;
  // the leaves: a flutter across their faces, a slower bob, their tips streaming downwind in a gale
  float g = aSway.y;
  if (g > 0.0) {
    float ph = (aSway.z + seed) * 6.283, a = 0.12 + 0.88 * k;
    float fl = sin(t * (6.0 + 6.0 * k) + ph) + 0.5 * sin(t * (9.7 + 8.0 * k) + ph * 1.7);
    p += normal * (g * uLeaf.x * a * fl * (0.6 + 0.4 * gust));
    p.y += g * uLeaf.y * a * sin(t * (1.7 + 1.6 * k) + ph);
    p.xz += wd * (g * g * uLeaf.z * k * k * (0.4 + 0.6 * gust));
  }
  return p;
}
`
// (a street tree's leaf cards show its own kind's leaves, or the jacaranda's flowers: 256 px along)
const SHIFT = `
#ifdef USE_MAP
  if (uKind > 1.5 && aSway.w > 3.5)
    vMapUv.x += aSway.z < TREE_Q.b ? 0.75 : floor(TREE_Q.g + 0.001) * 0.25;
#endif
vPart = aSway.w;
`
// The colour of each part: a palm's leaves a shade of their own (q.g); a street tree's bark and
// leaves its kind's (q.g: the kind, and a shade), or the jacaranda's flowers on a share of its
// cards (q.b).
const TINT = `
vec3 treeTint () {
  vec3 q = TREE_Q;
  float part = aSway.w;
  if (uKind < 1.5)
    return part > 0.5 && part < 1.5 ? mix(vec3(0.9, 1.0, 1.03), vec3(1.12, 1.05, 0.8), q.g) : vec3(1.0);
  float sp = floor(q.g + 0.001), sh = fract(q.g);
  if (part < 0.5) return sp < 0.5 ? ${glsl(KINDS[0].bark)} : sp < 1.5 ? ${glsl(KINDS[1].bark)} : ${glsl(KINDS[2].bark)};
  vec3 c = sp < 0.5 ? ${glsl(KINDS[0].leaf)} : sp < 1.5 ? ${glsl(KINDS[1].leaf)} : ${glsl(KINDS[2].leaf)};
  if (aSway.z < q.b) c = ${glsl(KINDS[2].bloom)};
  return c * (0.82 + 0.36 * sh);
}
`
const COLOUR = `
vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
vColor *= treeTint();
`
// What every fragment shader gets: the cut-out leaves keep their coverage far off (where the
// texture's smaller copies blur their edges), and the near and far shapes hand over pixel by pixel.
const CUT = `
if (vPart < 0.5) diffuseColor.a = 1.0;
#ifdef USE_MAP
  vec2 treeTx = vMapUv * ${SIZE}.0;
  diffuseColor.a *= 1.0 + 0.25 * max(0.0, 0.5 * log2(max(dot(dFdx(treeTx), dFdx(treeTx)), dot(dFdy(treeTx), dFdy(treeTx)))));
#endif
float treeU = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
if (uNear > 0.5 ? treeU < vLod : treeU >= vLod) discard;
`
const FRAG = `
uniform float uNear;
varying float vLod;
flat varying float vPart;
`

// replace chunk in src with code (the chunk kept before it), or fail loudly if three.js has changed
function put (src, chunk, code, keep = true) {
  const at = `#include <${chunk}>`
  if (!src.includes(at))
    throw new Error(`treeWind.js: three.js has no ${chunk} here any more`)
  return src.replace(at, keep ? `${at}\n${code}` : code)
}
function colourShader (s) {
  let v = put(s.vertexShader, 'common', POSE + TINT)
  v = put(v, 'uv_vertex', SHIFT)
  v = put(v, 'color_vertex', COLOUR, false)
  s.vertexShader = put(v, 'begin_vertex', POSED)
  let f = put(s.fragmentShader, 'common', FRAG + 'uniform sampler2D uBark;')
  // (the bark from its own tiled texture, everything else from the sheet: its colours come
  // multiplied by their opacity, and in sRGB, treeTex.js)
  f = put(
    f,
    'map_fragment',
    `#ifdef USE_MAP
      vec4 treeLeafTex = texture2D(map, vMapUv);
      treeLeafTex.rgb = sRGBTransferEOTF(vec4(treeLeafTex.rgb / max(treeLeafTex.a, 0.01), 1.0)).rgb;
      vec4 treeBarkTex = texture2D(uBark, vMapUv);
      diffuseColor *= vPart < 0.5 ? vec4(treeBarkTex.rgb, 1.0) : treeLeafTex;
    #endif`,
    false
  )
  // (a palm leaf's underside is paler and greyer)
  f = put(
    f,
    'color_fragment',
    `if (vPart > 0.5 && vPart < 1.5 && !gl_FrontFacing)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), 0.3) * 1.3;`
  )
  f = put(f, 'alphatest_fragment', CUT + '#include <alphatest_fragment>', false)
  f = put(
    f,
    'roughnessmap_fragment',
    'roughnessFactor = vPart < 0.5 ? 0.92 : vPart < 1.5 ? 0.6 : vPart < 3.5 ? 0.96 : 0.8;'
  )
  // (a leaf card is lit by its crown's normal whichever side of it is seen)
  s.fragmentShader = put(
    f,
    'normal_fragment_begin',
    'if (vPart > 3.5) { normal = normalize(vNormal); nonPerturbedNormal = normal; }'
  )
}
function depthShader (s) {
  let v = put(s.vertexShader, 'common', POSE)
  v = put(v, 'uv_vertex', SHIFT)
  s.vertexShader = put(v, 'begin_vertex', POSED)
  const f = put(s.fragmentShader, 'common', FRAG)
  s.fragmentShader = put(
    f,
    'alphatest_fragment',
    CUT + '#include <alphatest_fragment>',
    false
  )
}

// The materials for one kind: each shape's (near and far) colour material, and the depth material
// the shadows are drawn with, all of them the cheap shape (the full ones' shadows would cost four
// times as much to draw, and look no different). sheet, the foliage sheet; bark, the kind's bark;
// kind 0 a fan palm, 1 a date palm, 2 a street tree; tall, its height as built (m: where its crown
// hangs); bend and leaf as the shader's uBend and uLeaf. (All of the colour materials share one
// program.)
export function treeMaterials (sheet, bark, kind, tall, bend, leaf) {
  const uniforms = (near, shadow) => ({
    uNear: { value: near ? 1 : 0 },
    uShadow: { value: shadow ? 1 : 0 },
    uTall: { value: tall },
    uKind: { value: kind },
    uBend: { value: new THREE.Vector4(...bend) },
    uLeaf: { value: new THREE.Vector3(...leaf) },
    uBark: { value: bark },
    uWindTime: WIND.time,
    uWindStrength: WIND.strength,
    uWindDir: WIND.dir,
    uEye: EYE
  })
  const make = near => {
    const u = uniforms(near, false)
    const mat = new THREE.MeshStandardMaterial({
      map: sheet,
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      roughness: 0.8
    })
    mat.onBeforeCompile = s => {
      Object.assign(s.uniforms, u)
      colourShader(s)
    }
    mat.customProgramCacheKey = () => 'tree'
    return mat
  }
  const u = uniforms(false, true)
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: sheet,
    alphaTest: 0.5,
    side: THREE.DoubleSide
  })
  depth.onBeforeCompile = s => {
    Object.assign(s.uniforms, u)
    depthShader(s)
  }
  depth.customProgramCacheKey = () => 'tree depth'
  return { near: { mat: make(true) }, far: { mat: make(false), depth } }
}
