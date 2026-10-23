// Street-level canyon light (technique adapted from mrdoob/slop-newyork js/tsl-materials.js
// canyonSkyAONode, MIT, (c) 2026 Mr.doob): down between tall buildings less of the sky reaches the
// street, so the sky's light (the hemisphere's and the environment map's) is dimmed the deeper a
// point sits in its canyon, and the warm light bounced off the sunlit walls opposite fills it a
// little instead. How tall the canyon is comes from a coarse map of the buildings' heights (CELL m
// squares, the tallest building in each, softened over its neighbours), so the open suburbs and
// the beach keep their whole sky and Downtown's avenues sit in shade. The sun's own light (and its
// shadow), the street lights' (lampLight.js) and the mirror in the wet are left alone.
import * as THREE from 'three'
import { BUILDINGS } from '../sim/lots.js'

const CELL = 32, // m
  SPAN = 2048, // m across, centred on the city
  N = SPAN / CELL
export const CANYON = {
  tCanyon: { value: null },
  uBounce: { value: new THREE.Color(0, 0, 0) }, // the walls' bounced light (daylight.js)
  uCanyonOn: { value: 1 }
}

// the heights' map: the tallest building over each square (2 m a step, up to 510 m), each square
// then given the most of its own and its neighbours' a little lowered, so a street between two
// towers reads as deep as the towers
export function canyonHeights (buildings = BUILDINGS) {
  const h = new Float32Array(N * N)
  const cellOf = v => Math.floor((v + SPAN / 2) / CELL)
  for (const b of buildings) {
    if (!(b.h > 0)) continue
    const i0 = Math.max(0, cellOf(b.x0)),
      i1 = Math.min(N - 1, cellOf(b.x1))
    const j0 = Math.max(0, cellOf(b.z0)),
      j1 = Math.min(N - 1, cellOf(b.z1))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) h[j * N + i] = Math.max(h[j * N + i], b.h)
  }
  const out = new Uint8Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      let m = h[j * N + i]
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di,
            c = j + dj
          if (a >= 0 && c >= 0 && a < N && c < N) m = Math.max(m, 0.8 * h[c * N + a])
        }
      out[j * N + i] = Math.min(255, Math.round(m / 2))
    }
  return out
}
function texture () {
  if (CANYON.tCanyon.value) return CANYON.tCanyon.value
  const t = new THREE.DataTexture(canyonHeights(), N, N, THREE.RedFormat)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return (CANYON.tCanyon.value = t)
}
// how much of the sky's light reaches height y in a canyon h m deep (the shader's, in JavaScript)
export function canyonLight (h, y) {
  const s = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  const low = 1 - 0.5 * s(6, 70, h)
  const open = s(0, Math.max(h, 1) * 0.9, y)
  return (low + (1 - low) * open) * (0.86 + 0.14 * s(0, 6, y))
}
const GLSL = `
  uniform sampler2D tCanyon;
  uniform vec3 uBounce;
  uniform float uCanyonOn;
  varying vec3 vCanyonW;
  float canyonLight () {
    float h = texture2D(tCanyon, (vCanyonW.xz + ${(SPAN / 2).toFixed(1)}) / ${SPAN.toFixed(1)}).r * 510.0;
    float y = vCanyonW.y;
    float low = 1.0 - 0.5 * smoothstep(6.0, 70.0, h);
    float open = smoothstep(0.0, max(h, 1.0) * 0.9, y);
    return mix(1.0, mix(low, 1.0, open) * (0.86 + 0.14 * smoothstep(0.0, 6.0, y)), uCanyonOn);
  }`

// a material's sky light dimmed in the canyons and their bounce added (chained onto whatever it
// already does before it is compiled)
export function canyonLit (m) {
  const before = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    before?.call(m, shader, r)
    texture()
    Object.assign(shader.uniforms, CANYON)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanyonW;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 cw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
          #endif
          vCanyonW = (modelMatrix * cw).xyz;
        }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        {
          float cl = canyonLight();
          irradiance = irradiance * cl + uBounce * (1.0 - cl);
          #if defined( RE_IndirectSpecular )
          radiance *= mix(1.0, cl, 0.7);
          #endif
        }`
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => `${key()} canyon`
  return m
}
