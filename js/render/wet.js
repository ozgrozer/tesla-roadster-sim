// The city's ground in the rain. As the road soaks (ENV.wet) the asphalt goes dark and smooth, its
// polished wheel tracks smoothest of all, and it mirrors the street: the buildings, the signs, the
// lamps and the headlights stretched long down it (a reflection of the scene from below the road,
// mirror.js, blurred along the view the rougher the surface is). Once it is wet through, puddles
// fill (ENV.pool): in the dips of the lanes and along the gutters, flat black water that mirrors
// sharply, rings spreading in it wherever the rain falls; the pavements and the lots darken, the
// lane paint loses its chalkiness. Shared uniforms (WET), the GLSL for the road (roadSurface.js)
// and for any other ground (wetGround), and the puddles in JavaScript too, where the same water is
// for the splashes and the sound (puddleAt: an integer hash both sides agree on to the bit).
import * as THREE from 'three'

export const WET = {
  uWet: { value: 0 },
  uPool: { value: 0 },
  uRain: { value: 0 },
  uRainT: { value: 0 },
  tReflect: { value: null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 }
}

// Puddles: the ground in CELL m squares; a square holds a puddle with odds ODDS, an ellipse kept
// inside it, its depth 1 at the middle falling to 0 at the rim. The water stands to the depth the
// pool allows, so puddles grow from their deepest points as the rain goes on.
const CELL = 7,
  ODDS = 0.34
// a hash of two whole numbers to 0..1, the same here as in the shader
function hash2 (ix, iz, k) {
  let h = Math.imul(ix ^ 0x27d4eb2d, 0x9e3779b1) >>> 0
  h = (h ^ Math.imul(iz + k, 0x85ebca6b)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) >>> 0
  h ^= h >>> 15
  return (h >>> 8) / 16777216
}
// how deep the water stands at (x, z) (0: dry), with the puddles pool full (0 to 1)
export function puddleAt (x, z, pool) {
  if (pool <= 0) return 0
  const ix = Math.floor(x / CELL),
    iz = Math.floor(z / CELL)
  if (hash2(ix, iz, 1) > ODDS) return 0
  const r = 1.1 + 1.9 * hash2(ix, iz, 2),
    e = 0.45 + 0.55 * hash2(ix, iz, 3),
    a = hash2(ix, iz, 4) * Math.PI
  const m = Math.max(0, CELL / 2 - r)
  const cx = (ix + 0.5) * CELL + (hash2(ix, iz, 5) - 0.5) * 2 * m,
    cz = (iz + 0.5) * CELL + (hash2(ix, iz, 6) - 0.5) * 2 * m
  const dx = x - cx,
    dz = z - cz,
    u = (dx * Math.cos(a) + dz * Math.sin(a)) / r,
    v = (-dx * Math.sin(a) + dz * Math.cos(a)) / (r * e)
  const depth = 1 - (u * u + v * v)
  return Math.max(0, depth - (1 - pool))
}

export const PUDDLE_GLSL = `
  uniform float uWet, uPool, uRain, uRainT, uReflOn;
  uniform sampler2D tReflect;
  float wHash (int ix, int iz, int k) {
    uint h = uint(ix ^ 0x27d4eb2d) * 0x9e3779b1u;
    h = h ^ (uint(iz + k) * 0x85ebca6bu);
    h ^= h >> 15u;
    h *= 0x2c1b3c6du;
    h ^= h >> 12u;
    h *= 0x297a2d39u;
    h ^= h >> 15u;
    return float(h >> 8u) / 16777216.0;
  }
  // how deep the water stands here, as puddleAt
  float puddle (vec2 p, float pool) {
    vec2 c = floor(p / ${CELL.toFixed(1)});
    int ix = int(c.x), iz = int(c.y);
    if (pool <= 0.0 || wHash(ix, iz, 1) > ${ODDS.toFixed(3)}) return 0.0;
    float r = 1.1 + 1.9 * wHash(ix, iz, 2), e = 0.45 + 0.55 * wHash(ix, iz, 3);
    float a = wHash(ix, iz, 4) * 3.14159265;
    float m = max(0.0, ${(CELL / 2).toFixed(2)} - r);
    vec2 cen = (c + 0.5) * ${CELL.toFixed(1)} + (vec2(wHash(ix, iz, 5), wHash(ix, iz, 6)) - 0.5) * 2.0 * m;
    vec2 d = p - cen;
    float u = (d.x * cos(a) + d.y * sin(a)) / r, v = (-d.x * sin(a) + d.y * cos(a)) / (r * e);
    return max(0.0, 1.0 - (u * u + v * v) - (1.0 - pool));
  }
  // the rings the rain makes in standing water: a drop lands now and then in each little square,
  // its ring spreading and fading; returns the slope it makes (x, z)
  vec2 ripples (vec2 p, float t) {
    vec2 s = vec2(0.0);
    for (int l = 0; l < 2; l++) {
      vec2 q = p * (l == 0 ? 2.1 : 3.3) + float(l) * 7.3;
      vec2 c = floor(q), f = fract(q) - 0.5;
      int ix = int(c.x), iz = int(c.y);
      vec2 o = (vec2(wHash(ix, iz, 7 + l), wHash(ix, iz, 9 + l)) - 0.5) * 0.5;
      float ph = fract(t * (0.9 + 0.5 * wHash(ix, iz, 11)) + wHash(ix, iz, 12));
      vec2 d = f - o;
      float r = length(d), ring = ph * 0.48;
      float w = sin(clamp((r - ring) * 40.0, -3.14159, 3.14159)) * (1.0 - ph) * step(r, ring + 0.08);
      s += d / max(r, 1e-3) * w * 0.35;
    }
    return s;
  }`

// Any other ground (the pavements, the lots, the paint): darker and smoother as it soaks. Chained
// onto whatever the material already does before it is compiled; dark: how much darker it goes
// wet (porous concrete more than paint), gloss: the roughness it goes down to.
export function wetGround (m, dark = 0.6, gloss = 0.3) {
  const before = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    before?.call(m, shader, r)
    shader.uniforms.uWet = WET.uWet
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWet;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(1.0, ${dark.toFixed(2)}, uWet);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${gloss.toFixed(2)}, uWet * 0.8);`
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => `${key()} wet ${dark} ${gloss}`
  return m
}
