// The street lights' light on the ground at night. Every street has its lights at the same places
// (sim/kerbside.js: three a side along each block, 18, 42 and 66 m from its corner, their heads
// reaching out over the road nine metres up), so the ground's shaders (the asphalt, the pavements,
// the lots and the paint) work out for themselves which heads are near and how much light falls
// from each: as from a lamp, strongest straight under it, falling off with distance and the
// slant, so each pool is bright in the middle and soft at its edge, on the asphalt dark and on
// the pavement and the paint bright, as light on things of their colour is (instead of a glow
// laid over the ground the same whatever it falls on). Which lights are standing, and whether on a
// steel pole or a wooden one, is in a little texture, one texel a light: knock one down and its
// pool goes out (lampOut), and they all come back with the city (lampsBack).
import * as THREE from 'three'
import { LAMPS, N, PITCH, HALF, ROAD_HW } from '../sim/city.js'

// where a light's head is: how far its arm reaches in from its pole, and how high its lens is
// (cityProps.js HEAD, and the lens under it)
const STEEL = [2.39, 8.92],
  WOOD = [2.07, 8.15]
const FIRST = 18, // m from the block's corner (the road's centre line) to the first light
  STEP = 24
const POLE = ROAD_HW + 0.6 // m from the road's centre line to the poles
const COUNT = (N + 1) * N * 2 * 2 * 3
// the strength of a light: what falls straight under it, times its height squared (the light's
// colour: a warm white). A cobra head throws its light down onto the road under it, so it falls
// off faster with the slant than a bare bulb's would: a pool half as bright at about half the
// lamp's height out, with darker road between one pool and the next.
const POWER = 260
const COLOUR = [1.0, 0.78, 0.52]

// the texel of a light, from where it stands: its road (i), block (j), side, which way the road
// runs and which of the block's three it is (as kerbside.js lays them out)
function slot (l) {
  const alongZ = l.ax !== 0,
    across = alongZ ? l.x : l.z,
    along = alongZ ? l.z : l.x
  const i = Math.round(across / PITCH + N / 2),
    c = (i - N / 2) * PITCH,
    side = across > c ? 1 : 0,
    j = Math.min(N - 1, Math.max(0, Math.floor((along + HALF) / PITCH))),
    k = Math.round((along - (j - N / 2) * PITCH - FIRST) / STEP)
  return (((i * N + j) * 2 + side) * 2 + (alongZ ? 0 : 1)) * 3 + k
}
const data = new Uint8Array(COUNT)
const SLOT = LAMPS.map(slot)
const STAND = LAMPS.map(l => (l.wood ? 128 : 255))
SLOT.forEach((s, i) => {
  if (s >= 0 && s < COUNT) data[s] = STAND[i]
})
const tex = new THREE.DataTexture(data, COUNT, 1, THREE.RedFormat)
tex.needsUpdate = true

export const LAMP = {
  tLamps: { value: tex },
  uLampOn: { value: 0 } // how far on they are (the city's dark: 0 by day)
}
// a light knocked down (its index in LAMPS), and all of them up again
export function lampOut (i) {
  const s = SLOT[i]
  if (s >= 0 && s < COUNT) {
    data[s] = 0
    tex.needsUpdate = true
  }
}
export function lampsBack () {
  SLOT.forEach((s, i) => {
    if (s >= 0 && s < COUNT) data[s] = STAND[i]
  })
  tex.needsUpdate = true
}

const f = v => v.toFixed(2)
// The GLSL: lampField(p, n), the street lights' light at a point p, on each nearby street from the
// two lights either side of it along each kerb, on a surface facing n (a unit vector in the world;
// none, (0, 0, 0), for a point in the air, a raindrop, which takes it head on from every side);
// lampLight(p), what falls on the ground there, lampLightN(p, n) on a surface facing n (a car's
// body, someone walking), and lampGlow(p), what lights a drop
export const LAMP_FIELD_GLSL = `
  uniform sampler2D tLamps;
  uniform float uLampOn;
  float lampField (vec3 p, vec3 n) {
    if (uLampOn <= 0.0) return 0.0;
    float E = 0.0;
    for (int ax = 0; ax < 2; ax++) {
      // (ax 0: a street running along x, ax 1: along z)
      float across = ax == 0 ? p.z : p.x, along = ax == 0 ? p.x : p.z;
      float ri = floor(across / ${f(PITCH)} + ${f(N / 2 + 0.5)});
      if (ri < 0.0 || ri > ${f(N)}) continue;
      float c = (ri - ${f(N / 2)}) * ${f(PITCH)};
      float j = clamp(floor((along + ${f(HALF)}) / ${f(PITCH)}), 0.0, ${f(N - 1)});
      float start = (j - ${f(N / 2)}) * ${f(PITCH)};
      float k0 = clamp(floor((along - start - ${f(FIRST)}) / ${f(STEP)}), 0.0, 1.0);
      for (int sd = 0; sd < 2; sd++) {
        float side = sd == 0 ? -1.0 : 1.0;
        for (int dk = 0; dk < 2; dk++) {
          float k = k0 + float(dk);
          int idx = (((int(ri) * ${N} + int(j)) * 2 + sd) * 2 + (ax == 1 ? 0 : 1)) * 3 + int(k);
          float st = texelFetch(tLamps, ivec2(idx, 0), 0).r;
          if (st < 0.25) continue;
          vec2 head = st < 0.75 ? vec2(${f(WOOD[0])}, ${f(WOOD[1])}) : vec2(${f(
            STEEL[0]
          )}, ${f(STEEL[1])});
          float lat = c + side * (${f(POLE)} - head.x);
          float lon = start + ${f(FIRST)} + ${f(STEP)} * k;
          vec3 L = (ax == 0 ? vec3(lon, head.y, lat) : vec3(lat, head.y, lon)) - p;
          float d2 = dot(L, L), d = sqrt(d2), c = max(L.y, 0.0) / d;
          float facing = dot(n, n) > 0.5 ? max(dot(n, L) / d, 0.0) : 1.0;
          E += c * c * facing / d2;
        }
      }
    }
    return E * ${f(POWER)} * uLampOn;
  }
  vec3 lampLight (vec3 p) {
    return vec3(${COLOUR.map(f).join(', ')}) * lampField(p, vec3(0.0, 1.0, 0.0));
  }
  vec3 lampLightN (vec3 p, vec3 n) {
    return vec3(${COLOUR.map(f).join(', ')}) * lampField(p, n);
  }
  vec3 lampGlow (vec3 p) {
    return vec3(${COLOUR.map(f).join(', ')}) * lampField(p, vec3(0.0));
  }`
const LAMP_GLSL = `
  varying vec3 vLampW;
  ${LAMP_FIELD_GLSL}`

// Light a material by the street lights: their light added to what falls on it from the sky
// (chained onto whatever it already does before it is compiled). The ground faces up; anything else
// (facing: the Roadster's body, the cars, the people) takes it on whichever way it faces.
export function lampLit (m, facing = false) {
  const before = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    before?.call(m, shader, r)
    Object.assign(shader.uniforms, LAMP)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLampW;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 lw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          lw = instanceMatrix * lw;
          #endif
          vLampW = (modelMatrix * lw).xyz;
        }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LAMP_GLSL}`)
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        irradiance += ${
          facing
            ? 'lampLightN(vLampW, normalize((vec4(normal, 0.0) * viewMatrix).xyz))'
            : 'lampLight(vLampW)'
        };`
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => `${key()} lamps ${facing}`
  return m
}
