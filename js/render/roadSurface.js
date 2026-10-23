// The street's asphalt, worn the way a city's is: two darker, smoother wheel tracks down every lane
// (polished enough to catch the low sun), a line of oil drips between them, more wear on the
// approach to each stop line, broad patches of newer and older surface, tar-sealed cracks wandering
// across it, and a concrete gutter along every kerb that follows the kerb round the corners. All of
// it worked out in the shader from where on the grid a point is, so it lines up with the lanes. In
// the rain (wet.js) it soaks dark and smooth and mirrors the street, puddles fill its dips and run
// along its gutters, and the rain rings the water in them. And it is seldom bone dry even without
// the rain (WET.uDamp, by the hour: damp patches, a glossy film and a few shallow pools, most at
// night; the masks adapted from mrdoob/slop-newyork js/tsl-materials.js roadWetMasks, MIT, (c) 2026
// Mr.doob).
import * as THREE from 'three'
import { WET, PUDDLE_GLSL } from './wet.js'
import {
  N,
  HALF,
  STOP,
  PITCH,
  CURB_R,
  LANE_OFF,
  ROAD_HW
} from '../sim/city.js'

const GUTTER = 0.42 // m of concrete along the kerb
const f = v => v.toFixed(3)

export function roadMaterial (opts) {
  const m = new THREE.MeshStandardMaterial(opts)
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, WET)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec4 vRefl;
        uniform mat4 uReflMat;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wPos = modelMatrix * vec4(position, 1.0);
        vGround = wPos.xz;
        vRefl = uReflMat * wPos;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec4 vRefl;
        ${PUDDLE_GLSL}
        float gWater = 0.0;
        vec2 gSlope = vec2(0.0);
        float rHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rNoise (vec2 p) {
          vec2 i = floor(p), u = fract(p);
          u = u * u * (3.0 - 2.0 * u);
          return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x),
            mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float gTrack = 0.0, gGutter = 0.0, gTar = 0.0, gDamp = 0.0, gPool = 0.0, gFilm = 0.0;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 p = vGround;
          // offsets from the nearest road centre lines, folded into one quadrant of the junction
          vec2 u = p - floor(p / ${f(PITCH)} + 0.5) * ${f(PITCH)};
          vec2 k = abs(u) - ${f(ROAD_HW)};
          // how far the kerb is: straight along a street, round the corner at a junction, and
          // straight again along the promenade outside the ring road
          vec2 c = vec2(${f(CURB_R)}) - k;
          float kerb = c.x > 0.0 && c.y > 0.0 ? length(c) - ${f(CURB_R)} : max(c.x, c.y) - ${f(
          CURB_R
        )};
          vec2 ring = abs(p) - ${f(HALF)};
          if (ring.x > 0.0) kerb = ${f(ROAD_HW)} - ring.x;
          if (ring.y > 0.0) kerb = ${f(ROAD_HW)} - ring.y;
          // along a street (not in a junction): which way it runs, and the lanes across it
          bool alongX = abs(u.y) < ${f(ROAD_HW)} && abs(u.x) > ${f(STOP)};
          bool alongZ = abs(u.x) < ${f(ROAD_HW)} && abs(u.y) > ${f(STOP)};
          float lat = alongX ? abs(u.y) : abs(u.x), along = alongX ? abs(u.x) : abs(u.y);
          if (alongX || alongZ) {
            float tr = 0.0, oil = 0.0, drips = smoothstep(0.45, 0.75, rNoise(p * 1.7));
            for (int i = 0; i < 2; i++) {
              float a = abs(lat - (i == 0 ? ${f(LANE_OFF[0])} : ${f(LANE_OFF[1])}));
              float t = (a - 0.8) / 0.3;
              tr += exp(-t * t);
              oil += exp(-a * a * 16.0) * drips;
            }
            // fading in past the stop line, heaviest where cars brake for it
            float wear = smoothstep(${f(STOP)}, ${f(STOP + 6)}, along) *
              (0.75 + 0.5 * smoothstep(${f(STOP + 40)}, ${f(STOP + 8)}, along));
            gTrack = tr * wear * (0.75 + 0.5 * rNoise(p * 0.3));
            diffuseColor.rgb *= 1.0 - 0.13 * gTrack - 0.22 * oil * wear;
          }
          // patches: here and there a slab of newer, blacker asphalt with a crisp edge
          vec2 cell = floor(p / vec2(9.0, 5.0));
          vec2 fr = fract(p / vec2(9.0, 5.0));
          float h = rHash(cell + 3.1);
          float fresh = step(h, 0.07) * step(0.15, fr.x) * step(fr.x, 0.55 + 0.4 * rHash(cell))
            * step(0.2, fr.y) * step(fr.y, 0.9);
          diffuseColor.rgb *= mix(1.0, 0.78, fresh);
          // broad weathering, lighter and darker
          diffuseColor.rgb *= 0.92 + 0.16 * rNoise(p * 0.045) - 0.05 * rNoise(p * 0.21);
          // cracks sealed with tar: wandering lines a few centimetres wide, black and glossy, in
          // some stretches of road and not others (thinned out once they are under a pixel wide)
          float n = rNoise(p * 0.33 + 7.0) + 0.5 * rNoise(p * 0.9);
          float px = length(fwidth(p));
          float dw = abs(n - 0.75) / max(fwidth(n), 1e-5) * px;
          gTar = (1.0 - smoothstep(0.015, 0.03, dw)) * min(1.0, 0.05 / px)
            * step(0.62, rNoise(p * 0.05 + 2.0));
          diffuseColor.rgb *= 1.0 - 0.5 * gTar;
          // the gutter: pale concrete along the kerb, its joints every 1.5 m
          gGutter = 1.0 - step(${f(GUTTER)}, kerb);
          if (gGutter > 0.0 && kerb > -0.05) {
            float joint = step(0.97, fract((along + lat) / 1.5));
            vec3 con = vec3(0.5, 0.49, 0.47) * (0.9 + 0.2 * rNoise(p * 3.0)) * (1.0 - 0.4 * joint);
            diffuseColor.rgb = mix(diffuseColor.rgb, con * (0.85 + 0.15 * smoothstep(0.0, 0.1, kerb)), gGutter);
          }
          // the rain: the surface soaked dark, water standing in the puddles and running along the
          // gutter (the road falls to its kerbs), a little uneven so the reflection breaks up
          if (uWet > 0.0) {
            float pud = puddle(p, uPool);
            float run = smoothstep(0.9, 0.0, kerb) * smoothstep(-0.1, 0.05, kerb) * smoothstep(0.35, 0.9, uPool)
              * (0.55 + 0.45 * rNoise(p * vec2(0.35, 0.35) + 4.0));
            gWater = clamp(max(smoothstep(0.0, 0.06, pud), run), 0.0, 1.0);
            diffuseColor.rgb *= mix(1.0, 0.52 - 0.08 * gTrack, uWet);
            diffuseColor.rgb *= mix(1.0, 0.55, gWater);
            gSlope = (vec2(rNoise(p * 11.0), rNoise(p * 11.0 + 9.1)) - 0.5) * 0.03 * (1.0 - gWater);
            if (uRain > 0.01 && gWater > 0.01) gSlope += ripples(p, uRainT) * uRain * gWater;
          }
          // dry weather's damp: the low spots of a field of noise darken first, then hold a film of
          // water, the field's level falling as the damp rises so the pools grow and merge
          if (uDamp > 0.0) {
            float fld = 0.52 * rNoise(p * vec2(0.095, 0.075)) + 0.34 * rNoise(p * vec2(0.25, 0.22) + vec2(19.4, 11.8))
              + 0.14 * rNoise(p * 0.68 + vec2(-7.3, 29.1));
            float lvl = mix(0.86, 0.56, clamp((uDamp - 0.1) / 0.55, 0.0, 1.0));
            gDamp = smoothstep(lvl - 0.09, lvl - 0.015, fld) * (1.0 - uWet);
            gPool = smoothstep(lvl, lvl + 0.022, fld) * smoothstep(0.1, 0.22, uDamp) * (1.0 - uWet);
            gFilm = smoothstep(0.2, 0.8, uDamp) * (1.0 - uWet);
            diffuseColor.rgb *= mix(mix(1.0, 0.8, gDamp), 0.62, gPool) * mix(1.0, 0.88, gFilm);
          }
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - 0.2 * gTrack - 0.45 * gTar + 0.05 * gGutter, 0.3, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.26 - 0.1 * gTrack, uWet * 0.92);
        roughnessFactor = mix(roughnessFactor, 0.03, gWater);
        roughnessFactor = mix(roughnessFactor, 0.4, max(gFilm * 0.5, gDamp * 0.8));
        roughnessFactor = mix(roughnessFactor, 0.08, gPool);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uWet > 0.0)
          normal = normalize(normal + (viewMatrix * vec4(gSlope.x, 0.0, gSlope.y, 0.0)).xyz);`
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
        // the street mirrored in the wet: the reflection from below the road (mirror.js) in place
        // of the sky's, drawn out along the view the rougher the surface, rippled where it is water
        float wM = max(uWet, max(gPool, gFilm * gDamp * 0.6));
        if (uReflOn > 0.5 && wM > 0.01) {
          vec2 ruv = vRefl.xy / vRefl.w + gSlope * 0.06;
          // (blurred by the target's mipmaps the rougher it is, and drawn out along the view)
          float lod = clamp((material.roughness - 0.05) * 15.0, 0.0, 4.5);
          float spread = 0.004 + 0.05 * material.roughness;
          vec3 rf = textureLod(tReflect, ruv, lod).rgb * 0.4;
          rf += textureLod(tReflect, ruv + vec2(0.0, spread), lod).rgb * 0.3;
          rf += textureLod(tReflect, ruv - vec2(0.0, spread), lod).rgb * 0.3;
          radiance = mix(radiance, rf, smoothstep(0.02, 0.35, wM));
        }
        #endif`
      )
  }
  m.customProgramCacheKey = () => `road wet damp ${N} ${PITCH}`
  return m
}
