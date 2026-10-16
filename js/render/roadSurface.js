// The street's asphalt, worn the way a city's is: two darker, smoother wheel tracks down every lane
// (polished enough to catch the low sun), a line of oil drips between them, more wear on the
// approach to each stop line, broad patches of newer and older surface, tar-sealed cracks wandering
// across it, and a concrete gutter along every kerb that follows the kerb round the corners. All of
// it worked out in the shader from where on the grid a point is, so it lines up with the lanes.
import * as THREE from 'three'
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xz;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        float rHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rNoise (vec2 p) {
          vec2 i = floor(p), u = fract(p);
          u = u * u * (3.0 - 2.0 * u);
          return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x),
            mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float gTrack = 0.0, gGutter = 0.0, gTar = 0.0;`
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
            float tr = 0.0, oil = 0.0;
            for (int i = 0; i < 2; i++) {
              float a = abs(lat - (i == 0 ? ${f(LANE_OFF[0])} : ${f(LANE_OFF[1])}));
              float t = (a - 0.8) / 0.3;
              tr += exp(-t * t);
              oil += exp(-a * a * 16.0) * smoothstep(0.45, 0.75, rNoise(p * 1.7));
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
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - 0.2 * gTrack - 0.45 * gTar + 0.05 * gGutter, 0.3, 1.0);`
      )
  }
  m.customProgramCacheKey = () => `road ${N} ${PITCH}`
  return m
}
