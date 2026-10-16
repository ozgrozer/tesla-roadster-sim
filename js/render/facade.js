// Facades where every window is its own. The facade textures repeat every 8 bays and 8 storeys, so
// whatever varies window to window is picked in the shader from the window's place on the building
// (its cell in the texture's UVs, which run on unbroken round a building and up it): whether its
// light is on, warm or cool, bright or dim; whether its blinds are down and how far; and, for glass,
// the slight angle each pane sits at, so the sky's reflection breaks up pane by pane.
import * as THREE from 'three'

// win: the window's rectangle in a cell (x, y from the cell's top, w, h, as fractions); lit: share
// of windows with a light on; blinds: share with blinds down; tilt: how far panes go off true
export function facadeMaterial (opts, { cells, win, lit, blinds, tilt }) {
  const m = new THREE.MeshStandardMaterial(opts)
  const [wx, wy, ww, wh] = win.map(v => v.toFixed(4))
  const C = cells.toFixed(1)
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        float cellHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gBlind = 0.0, gWin = 0.0;
        vec2 gCell = vec2(0.0);`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
        {
          vec2 cu = vMapUv * ${C};
          gCell = floor(cu);
          vec2 f = fract(cu);
          float top = 1.0 - ${wy}, bot = top - ${wh};
          gWin = step(${wx}, f.x) * step(f.x, ${wx} + ${ww}) * step(bot, f.y) * step(f.y, top);
          float hb = cellHash(gCell + 7.7);
          float level = hb < ${blinds.toFixed(
            3
          )} ? 0.25 + 0.75 * cellHash(gCell + 3.3) : 0.0;
          gBlind = gWin * step(top - level * (top - bot), f.y);
          // blinds or curtains: pale, beige or grey, a little striped
          vec3 bc = mix(vec3(0.86, 0.84, 0.78), vec3(0.74, 0.7, 0.62), cellHash(gCell + 9.1));
          bc *= 0.92 + 0.08 * step(0.5, fract(f.y * 40.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, bc, gBlind * 0.9);
        }
        #endif`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(normal + (vec3(cellHash(gCell + 1.0), cellHash(gCell + 2.0), cellHash(gCell + 3.0)) - 0.5) * ${tilt.toFixed(
          3
        )} * gWin);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
        {
          vec4 glow = texture2D(emissiveMap, vEmissiveMapUv);
          float h1 = cellHash(gCell), h2 = cellHash(gCell + 17.3), h3 = cellHash(gCell + 41.1);
          float on = step(h1, ${lit.toFixed(3)});
          vec3 warm = mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.84, 0.62), h2);
          vec3 light = mix(warm, vec3(0.72, 0.84, 1.0), step(0.8, h3)) * (0.35 + 0.65 * h2);
          // a lit window shows through its blinds as a soft glow
          totalEmissiveRadiance *= glow.rgb * light * on * (1.0 - 0.6 * gBlind);
        }
        #endif`
      )
  }
  m.customProgramCacheKey = () => `facade ${win} ${lit} ${blinds} ${tilt}`
  return m
}
