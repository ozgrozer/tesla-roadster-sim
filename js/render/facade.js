// Facades where every window is its own, and has depth. The facade textures repeat every 8 bays and 8
// storeys, so whatever varies window to window is picked in the shader from the window's place on the
// building (its cell in the texture's UVs, which run on unbroken round a building and up it): whether
// its light is on, warm or cool, bright or dim; whether its blinds are down and how far; and, for
// glass, the slight angle each pane sits at, so the sky's reflection breaks up pane by pane.
// The glass sits back from the wall face, so at an angle the reveal round the opening shows (the sill
// lit, the head in shadow) and the pane slides behind it; and behind each pane is a room, traced in
// the shader: a box a bay wide, a storey high and a few metres deep, with a floor, a ceiling, walls
// and a dark desk or cabinet, lit by its lamp or only by the dusk outside. The glass itself is smooth
// and reflects the sky at a glancing angle, as glass does, however rough the wall round it. Far off,
// where a window is only a few pixels across, the reveal and the room go (nobody could see them)
// and each window is simply its glass with the room's average light behind it. (The wall between
// the windows skips all of it.)
import * as THREE from 'three'

const BAY = 3 // m: a texture cell is a bay wide (cityBuildings.js) ...
const STOREY = 3.5 // ... and a storey high
const ROOM = 4.5 // m: how far back a room runs, on average
// 0 at golden hour, 1 at night: more of the windows lit (those lit by day stay lit), the dark rooms
// darker still
export const NIGHT = { value: 0 }

// win: the window's rectangle in a cell (x, y from the cell's top, w, h, as fractions); lit: share
// of windows with a light on (and litNight, at night); blinds: share with blinds down; tilt: how far
// panes go off true;
// inset: m the glass sits back from the wall face; glassMetal: how mirrored the glass is (0 for
// clear glass, more for a curtain wall's coated panes); fill: the share of bays with a window at all
// (a house's wall has few; where there is none the wall carries on over it, its surround too)
export function facadeMaterial (
  opts,
  {
    cells,
    win,
    lit,
    litNight = lit,
    blinds,
    tilt,
    inset,
    glassMetal = 0,
    fill = 1
  }
) {
  const m = new THREE.MeshStandardMaterial(opts)
  const f = v => v.toFixed(4)
  const [wx, wy, ww, wh] = win.map(f)
  const C = cells.toFixed(1)
  const blank =
    fill < 1
      ? `if (cellHash(gCell + 13.7) > ${f(fill)}) {
            if (f.x > x0 - 0.07 && f.x < x1 + 0.07 && f.y > bot - 0.07 && f.y < top + 0.07)
              diffuseColor.rgb = diffuse * textureLod(map, (gCell + vec2(0.06, 0.06)) / ${C}, 2.0).rgb;
            gWin = 0.0;
          }`
      : ''
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = NIGHT
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        float cellHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gBlind = 0.0, gWin = 0.0;
        vec2 gCell = vec2(0.0);
        vec3 gRoom = vec3(0.0);`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
        {
          vec2 cu = vMapUv * ${C};
          vec2 du = dFdx(vMapUv), dv = dFdy(vMapUv);
          gCell = floor(cu);
          vec2 f = fract(cu);
          float x0 = ${wx}, x1 = ${wx} + ${ww}, top = 1.0 - ${wy}, bot = top - ${wh};
          gWin = step(x0, f.x) * step(f.x, x1) * step(bot, f.y) * step(f.y, top);
          ${blank}
          float pane = 0.0;
          // (the wall between the windows has nothing more to work out)
          if (gWin > 0.5) {
          // the view ray in the wall's own frame (along it, up it, out of it), in bays, storeys and
          // room depths
          vec3 n = normalize(vNormal);
          vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 ta = normalize(cross(up, n));
          vec3 rd = normalize(-vViewPosition);
          vec3 r = vec3(dot(rd, ta) / ${f(BAY)}, dot(rd, up) / ${f(STOREY)},
            min(dot(rd, n), -0.03) / ${f(ROOM)});
          // (far off: windows a few pixels across, cells per pixel past a quarter)
          bool far = max(length(du), length(dv)) * ${C} > 0.25;
          // where it meets the glass, set back from the wall face; short of it, the reveal
          vec2 g = far ? f : f + r.xy * (${f(inset / ROOM)} / -r.z);
          pane = step(x0, g.x) * step(g.x, x1) * step(bot, g.y) * step(g.y, top);
          if (pane < 0.5) {
            // the reveal: the wall's own colour, the sill catching the light, the head in shadow
            vec3 wall = textureLod(map, (gCell + vec2(0.03, 0.03)) / ${C}, 3.0).rgb;
            diffuseColor.rgb = diffuse * wall * (g.y < bot ? 0.95 : g.y > top ? 0.42 : 0.66);
          } else if (pane > 0.5) {
            // the glass, seen through from where the ray meets it: dark, as clear glass is
            diffuseColor.rgb = diffuse * textureGrad(map, (gCell + g) / ${C}, du, dv).rgb * 0.45;
            float hb = cellHash(gCell + 7.7);
            float level = hb < ${blinds.toFixed(
              3
            )} ? 0.25 + 0.75 * cellHash(gCell + 3.3) : 0.0;
            gBlind = step(top - level * (top - bot), g.y);
            // blinds or curtains: pale, beige or grey, a little striped
            vec3 bc = mix(vec3(0.86, 0.84, 0.78), vec3(0.74, 0.7, 0.62), cellHash(gCell + 9.1));
            bc *= 0.92 + 0.08 * step(0.5, fract(g.y * 40.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, bc, gBlind * 0.9);
            vec3 wallC = mix(vec3(0.9, 0.86, 0.78), vec3(0.72, 0.77, 0.82), cellHash(gCell + 8.1));
            if (far) gRoom = wallC * 0.62 * (1.0 - 0.6 * gBlind); // (the room's light, on average)
            else {
            // the room behind: a box from the glass back to its back wall, floor to ceiling
            float depth = 0.7 + 0.6 * cellHash(gCell + 5.5);
            vec2 rq = vec2(abs(r.x) < 1e-4 ? 1e-4 : r.x, abs(r.y) < 1e-4 ? 1e-4 : r.y);
            float tx = (step(0.0, r.x) - g.x) / rq.x;
            float ty = (step(0.0, r.y) - g.y) / rq.y;
            float tz = depth / -r.z;
            float tm = min(min(tx, ty), tz);
            vec3 h = vec3(g, 0.0) + r * tm;
            vec3 c;
            if (tm == tz) {
              c = wallC;
              // a desk, a cabinet or a sofa against the back wall
              float fx = 0.2 + 0.5 * cellHash(gCell + 2.2), fw = 0.12 + 0.2 * cellHash(gCell + 4.4);
              c *= 1.0 - 0.78 * step(h.y, 0.3 + 0.15 * cellHash(gCell + 1.9)) * step(abs(h.x - fx), fw);
            } else if (tm == tx) c = wallC * 0.72;
            else if (r.y > 0.0) c = vec3(0.96, 0.94, 0.9);
            else c = mix(vec3(0.34, 0.23, 0.15), vec3(0.4, 0.4, 0.39), step(0.5, cellHash(gCell + 6.6)));
            // lit from a lamp in the middle of the ceiling, darker into the corners
            vec3 lamp = vec3(0.5, 0.95, -0.45 * depth);
            vec3 dl = (h - lamp) * vec3(1.0, 1.2, 1.0 / depth);
            c *= 1.25 / (1.0 + 2.6 * dot(dl, dl));
            gRoom = c * (1.0 - 0.6 * gBlind);
            }
          }
          }
          gWin = pane;
        }
        #endif`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        // glass is smooth whatever the wall round it is made of
        roughnessFactor = mix(roughnessFactor, 0.05, gWin);
        metalnessFactor = mix(metalnessFactor, ${f(glassMetal)}, gWin);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (gWin > 0.5)
          normal = normalize(normal + (vec3(cellHash(gCell + 1.0), cellHash(gCell + 2.0), cellHash(gCell + 3.0)) - 0.5) * ${tilt.toFixed(
            3
          )});`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `if (gWin < 0.5) totalEmissiveRadiance = vec3(0.0);
        else {
          float h1 = cellHash(gCell), h2 = cellHash(gCell + 17.3), h3 = cellHash(gCell + 41.1);
          float on = step(h1, mix(${lit.toFixed(3)}, ${litNight.toFixed(3)}, uNight));
          vec3 warm = mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.84, 0.62), h2);
          vec3 light = mix(warm, vec3(0.72, 0.84, 1.0), step(0.8, h3)) * (0.35 + 0.65 * h2);
          // a lit room, or a dark one with only the dusk in it
          vec3 dark = vec3(0.07, 0.065, 0.075) * (1.0 - 0.8 * uNight);
          totalEmissiveRadiance *= gRoom * mix(dark, light, on);
        }`
      )
  }
  m.customProgramCacheKey = () =>
    `facade ${win} ${lit} ${litNight} ${blinds} ${tilt} ${inset} ${glassMetal} ${fill}`
  return m
}
