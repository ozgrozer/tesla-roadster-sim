// The shopfronts' shader. Each shop is one flat quad on its building's ground floor (shopfronts.js),
// and everything on it is worked out per pixel from where the pixel is on the shop (x along it from
// its left end, y up from the pavement, in metres) and the shop's own numbers: the piers either side
// in the building's colour, the fascia over it with the shop's name on its board (lit at night, a
// lightbox's whole face, a sign's letters or a neon tube: shopTex.js); and, set back from them so
// the reveal shows at an angle, the shopfront itself: a stall riser of granite, tiles or paint under
// the glass, the frame and its mullions, a transom bar, a glass door with its push bar; over some, an
// awning in the shop's colour, plain or striped (its own quads, v below 0). Through the glass, the
// shop inside, traced as the rooms behind the windows above are (shopRooms.js). The glass is smooth,
// and what it reflects is worked out too: the pavement and the road below eye level, the buildings
// across the street (their walls and windows, their own shops lit along their feet at night) and
// the sky over them; it reflects more the more glancing the view (Fresnel), so straight on you see
// into the shop and along the street you see the street. By day the shops are lit only
// as well as a room is, darker than the sunlit street; as it gets dark (NIGHT: facade.js) each
// switches its sign and its lights on at its own moment, and some shut, more of them late; those
// open throw their light on the pavement in front (poolMaterial). Far off, where a shop is only a
// few pixels high, the reveal and the room go and the glass shows the room's light on average.
import * as THREE from 'three'
import { NIGHT } from './facade.js'
import { ROOMS_GLSL } from './shopRooms.js'
import { W, H, BOARD, DECAL, DECAL_Y } from './shopTex.js'

const INSET = 0.18 // m the glazing sits back from the piers and the fascia
const FAR = 0.07 // m a pixel, past which the glass shows the room's light on average
const ACROSS = 22.8 // m from a shopfront to the buildings across the street
const f = v => v.toFixed(4)
const vec2 = (a, b) => `vec2(${f(a)}, ${f(b)})`

// a random number, 0 to 1, from a shop's own one (s) and a key (k)
const HASH_GLSL = `
  float sHash (float s, float k) { return fract(sin(s * 78.233 + k * 12.9898) * 43758.5453); }`
// How lit a shop is, and in what light, shared with the light it throws on the pavement (worked
// out once a corner, in the vertex shader: they are the same all over a shop)
const LIGHTS_GLSL = `
  // At darkness n (0 by day, 1 at night): x, the lights inside (0 to 1); y, the sign; z, a shut
  // clothes shop's window display; w, the neon in the window. Each shop switches its sign on at its
  // own moment as the light goes; a bar opens as it gets dark; a share of the rest shut for the
  // night, each at its own hour (most clothes shops and salons, a third of the cafés, a few stores),
  // half of them leaving their sign on and most clothes shops their window lit. An empty shop is dark.
  vec4 shopLights (float k, float s, float n) {
    if (k > 4.5) return vec4(0.0);
    float h1 = sHash(s, 1.0), h2 = sHash(s, 2.0), h3 = sHash(s, 3.0);
    float t1 = 0.12 + 0.4 * h1;
    float sg = smoothstep(t1, t1 + 0.04, n), lamps = 1.0, display = 0.0;
    if (k > 3.5) {
      float t2 = 0.08 + 0.35 * h2;
      lamps = 0.2 + 0.8 * smoothstep(t2, t2 + 0.04, n);
    } else if (h2 < (k < 0.5 ? 0.3 : k < 1.5 ? 0.6 : k < 2.5 ? 0.12 : 0.7)) {
      float t3 = 0.45 + 0.5 * h3, off = smoothstep(t3, t3 + 0.04, n);
      lamps = 1.0 - off;
      sg *= 1.0 - off * step(0.5, h1);
      display = k > 0.5 && k < 1.5 && h3 > 0.3 ? off : 0.0;
    }
    return vec4(lamps, sg, display, sg * smoothstep(0.3, 0.6, lamps));
  }
  // the lamps' colour: a café's and a bar's warm, a store's cool white, the rest between
  vec3 shopLightColour (float k, float s) {
    float h = sHash(s, 4.0);
    vec3 warm = vec3(1.0, 0.7, 0.42), mid = vec3(1.0, 0.86, 0.7), cool = vec3(0.84, 0.92, 1.0);
    return k < 0.5 ? mix(warm, mid, 0.6 * h) : k < 1.5 ? mix(mid, cool, 0.7 * h)
      : k < 2.5 ? mix(cool, mid, 0.3 * h) : k < 3.5 ? mix(mid, cool, h)
      : mix(vec3(1.0, 0.5, 0.25), vec3(0.95, 0.38, 0.5), h);
  }`

// What the glass reflects, in the street's frame: below eye level the pavement and the road, then
// the buildings across the street up to their roofs (pale walls in rows of windows, their own shops
// along their feet, lit at night), and the sky (the environment map, sky) over them; far off, more
// of the sky's haze. R: the reflected ray, N: out of the shopfront, both in the world; y: the
// point's height
const MIRROR_GLSL = `
  vec3 shopMirror (vec3 sky, vec3 R, vec3 N, float y, vec3 at) {
    float away = dot(R.xz, N.xz);
    float tF = away > 0.01 ? ${f(ACROSS)} / away : 1e5;
    float tG = R.y < -1e-3 ? (y - 0.08) / -R.y : 1e5;
    vec3 c = sky;
    if (tG < tF) {
      float d = tG * away;
      c = (d < 4.4 || d > ${f(ACROSS - 4.4)} ? vec3(0.13) : vec3(0.035)) * mix(1.0, 0.15, uNight);
    } else if (tF < 1e4) {
      float yF = y + R.y * tF;
      vec2 T = vec2(N.z, -N.x);
      float s = dot(at.xz, T) + tF * dot(R.xz, T), b = floor(s / 16.0);
      float hb = sHash(b, 11.0);
      if (yF < 6.0 + 24.0 * hb * hb) {
        vec3 wall = mix(vec3(0.5, 0.45, 0.4), vec3(0.78, 0.72, 0.62), sHash(b, 12.0)) * 0.42;
        // (its windows, and the piers between its shops, fading out far off rather than flicker)
        vec2 w = vec2(fract(s / 3.0), fract(yF / 3.5));
        float near = 1.0 - smoothstep(40.0, 120.0, tF);
        float win = yF > 4.6 && w.x > 0.25 && w.x < 0.75 && w.y > 0.3 && w.y < 0.8 ? near : 0.0;
        float lit = step(sHash(floor(s / 3.0) + 31.0 * floor(yF / 3.5), 13.0), 0.4);
        float pier = step(fract(s / 5.5), 0.08) * near;
        c = yF < 4.6 ? (yF > 3.4 ? wall * 0.6 : mix(vec3(0.04), wall * 0.8, pier))
          : mix(wall, vec3(0.05), win);
        vec3 nc = vec3(0.01) + vec3(0.5, 0.34, 0.18) * win * lit;
        if (yF < 3.3 && yF > 0.5) nc = vec3(0.42, 0.3, 0.18) * step(0.35, sHash(floor(s / 5.0), 14.0));
        c = mix(c, nc, uNight);
      }
    }
    return mix(c, sky, smoothstep(50.0, 220.0, min(tF, tG)));
  }`

export function shopMaterial (signs) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8
  })
  const cell = vec2(BOARD[0] / W, BOARD[1] / H),
    decal = vec2(DECAL[0] / W, DECAL[1] / H),
    aspect = f(BOARD[0] / BOARD[1])
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = NIGHT
    shader.uniforms.uSigns = { value: signs }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        attribute vec4 shop, shopDoor, shopTrim;
        attribute vec3 shopBrand;
        varying vec2 vShopUv;
        flat varying vec4 vShop, vShopDoor, vShopTrim, vShopL, vShopH, vShopF;
        flat varying vec3 vShopBrand, vShopC;
        varying vec3 vShopW;
        ${HASH_GLSL}
        ${LIGHTS_GLSL}`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vShopUv = uv;
        vShop = shop;
        vShopDoor = shopDoor;
        vShopTrim = shopTrim;
        vShopBrand = shopBrand;
        // (what is the same all over the shop: how lit it is and in what light, and its own
        // random numbers for its room, its sign and its riser)
        vShopL = shopLights(shop.y, shop.w, uNight);
        vShopC = shopLightColour(shop.y, shop.w);
        vShopH = vec4(sHash(shop.w, 7.0), sHash(shop.w, 8.0), sHash(shop.w, 9.0), sHash(shop.w, 6.0));
        vShopF = vec4(sHash(shop.w, 21.0), sHash(shop.w, 22.0), sHash(shop.w, 23.0), sHash(shop.w, 24.0));`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShopW = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        uniform sampler2D uSigns;
        varying vec2 vShopUv;
        flat varying vec4 vShop, vShopDoor, vShopTrim, vShopL, vShopH, vShopF;
        flat varying vec3 vShopBrand, vShopC;
        varying vec3 vShopW;
        float gGlass = 0.0, gRough = 0.85, gMetal = 0.0;
        vec3 gEmit = vec3(0.0);
        ${HASH_GLSL}
        ${ROOMS_GLSL}
        ${MIRROR_GLSL}
        // a sign in the window: where it is on the glass (centre c, size sz, m), its cell d in
        // the atlas; its colour and, in alpha, its glow (alpha -1: not on it)
        vec4 shopDecal (vec2 g, vec2 c, vec2 sz, float d, vec2 gx, vec2 gy) {
          vec2 l = (g - c) / sz + 0.5;
          if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return vec4(0.0, 0.0, 0.0, -1.0);
          vec2 uv = vec2(d * ${decal}.x + l.x * ${decal}.x, ${f(DECAL_Y / H)} + (1.0 - l.y) * ${decal}.y);
          return textureGrad(uSigns, uv, gx / sz * ${decal}, gy / sz * ${decal});
        }`
      )
      .replace(
        '#include <color_fragment>',
        `{
        float Wu = vShop.x, kind = vShop.y, seed = vShop.w;
        float pier = vShopDoor.x, doorX = vShopDoor.y, doorW = vShopDoor.z, head = vShopDoor.w;
        float riser = vShopTrim.x, transom = vShopTrim.y, frameK = vShopTrim.z;
        float cover = floor((vShopTrim.w + 0.5) / 8.0), decal = floor(mod(vShopTrim.w + 0.5, 8.0));
        vec2 p = vShopUv, pdx = dFdx(p), pdy = dFdy(p);
        float mpp = max(max(length(pdx), length(pdy)), 1e-4);
        bool far = mpp > ${f(FAR)};
        vec4 L = vShopL;
        vec3 lc = vShopC;
        // the view ray in the wall's frame: along it, up it, out of it
        vec3 nv = normalize(vNormal);
        vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vec3 ta = normalize(cross(up, nv));
        vec3 rd = normalize(-vViewPosition);
        vec3 r = vec3(dot(rd, ta), dot(rd, up), min(dot(rd, nv), -0.02));
        // the light from inside on the shopfront round the glass, at night
        vec3 spill = lc * L.x * uNight;
        vec3 frameC = frameK < 0.5 ? vec3(0.025) : frameK < 1.5 ? vec3(0.07, 0.05, 0.035)
          : frameK < 2.5 ? vec3(0.45, 0.47, 0.5) : frameK < 3.5 ? vec3(0.75) : vShopBrand * 0.85;
        vec3 col = vColor;
        if (p.y < -0.5) {
          // ---- an awning: cloth in the shop's colour, plain or striped, a darker hem along its
          // valance; seen from under it, a little of the sun coming through, and the shop's light
          // on it at night ----
          float t = -p.y - 1.0;
          vec3 c2 = dot(vShopBrand, vec3(0.3, 0.55, 0.15)) > 0.35 ? vec3(0.05, 0.14, 0.09)
            : vec3(0.82, 0.78, 0.68);
          col = vShopF.x < 0.55 ? mix(vShopBrand, c2, step(0.5, fract(p.x / 0.5))) : vShopBrand;
          col *= t > 1.86 ? 0.55 : 1.0;
          gRough = 0.9;
          float under = step(inverseTransformDirection(nv, viewMatrix).y, -0.1);
          gEmit = col * (under * 0.08 * (1.0 - uNight) + spill * mix(0.03, 0.25, under));
        } else if (p.y > head) {
          // ---- the fascia, the shop's name on a board (the whole width, or narrower) ----
          float b0 = head + 0.2, b1 = min(4.38, b0 + 0.8 + 0.2 * vShopF.y);
          float bw = (Wu - 2.0 * pier) * (vShopF.z < 0.55 ? 1.0 : 0.6 + 0.3 * vShopF.w);
          vec2 e = vec2(0.5 * bw - abs(p.x - 0.5 * Wu), min(p.y - b0, b1 - p.y));
          if (min(e.x, e.y) > 0.0) {
            if (min(e.x, e.y) < 0.035) col = frameC;
            else if (kind > 4.5) col = mix(vShopBrand, vec3(0.6), 0.6) * (0.85 + 0.15 * sin(p.x * 3.0));
            else {
              // (the cell as big as fits, the letters keeping their shape)
              float cw = min(bw, (b1 - b0) * ${aspect}), ch = cw / ${aspect};
              vec2 l = vec2((p.x - 0.5 * Wu) / cw, (p.y - 0.5 * (b0 + b1)) / ch) + 0.5;
              l = clamp(l, vec2(0.02, 0.1), vec2(0.98, 0.9));
              float si = floor(vShop.z + 0.5);
              vec2 k = vec2(mod(si, 2.0), floor(si / 2.0));
              vec2 uv = (k + vec2(l.x, 1.0 - l.y)) * ${cell};
              vec4 s = textureGrad(uSigns, uv, pdx / vec2(cw, -ch) * ${cell}, pdy / vec2(cw, -ch) * ${cell});
              col = s.rgb;
              gRough = 0.5;
              // (a lightbox's face kept under the bloom's threshold; its letters, a lit sign's
              // and neon over it)
              gEmit = s.rgb * s.a * L.y * mix(0.3, 1.1 + 0.5 * step(0.9, s.a), uNight);
            }
          } else gEmit = col * spill * 0.05;
        } else if (p.x < pier || p.x > Wu - pier) {
          // ---- a pier, a plinth at its foot ----
          col *= p.y < 0.28 ? 0.7 : 1.0;
          gEmit = col * spill * 0.04;
        } else {
          // ---- the shopfront, set back: where the view ray meets it ----
          vec2 g = far ? p : p + r.xy * (${f(INSET)} / -r.z);
          if (g.x < pier || g.x > Wu - pier) {
            col *= 0.62;
            gEmit = col * spill * 0.15;
          } else if (g.y > head) {
            col *= 0.4;
            gEmit = col * spill * 0.12;
          } else if (g.y < 0.0) col = vec3(0.4);
          else {
            // 0 glass, 1 frame, 2 the stall riser
            int what = 0;
            float fw = 0.06 + 0.7 * mpp;
            // (the door's head meets the transom bar, if there is one)
            float dh = transom > 0.0 ? transom - 0.5 * fw : min(2.3, head - 0.3);
            bool door = g.x > doorX && g.x < doorX + doorW;
            if (door) {
              float ex = min(g.x - doorX, doorX + doorW - g.x);
              if (g.y < dh) {
                if (ex < 0.085 || dh - g.y < 0.09 || g.y < 0.22 || abs(g.y - 1.02) < 0.025)
                  what = 1;
                // (a pair of doors: a stile down the middle)
                if (doorW > 1.5 && abs(g.x - doorX - 0.5 * doorW) < 0.06) what = 1;
              } else if (g.y < dh + fw || g.y > head - fw || ex < 0.5 * fw) what = 1;
            } else if (g.y < riser) what = 2;
            else if (g.y < riser + fw || g.y > head - fw) what = 1;
            else if (transom > 0.0 && abs(g.y - transom) < 0.5 * fw) what = 1;
            else {
              // the mullions: panes of up to 2 m between the jambs and the door
              float a = g.x < doorX ? pier : doorX + doorW, b = g.x < doorX ? doorX : Wu - pier;
              float n = max(1.0, ceil((b - a) / 2.0)), q = (g.x - a) / (b - a) * n;
              float e = min(fract(q), 1.0 - fract(q)) * (b - a) / n;
              if (e < 0.5 * fw || g.x - pier < fw || Wu - pier - g.x < fw) what = 1;
            }
            if (what == 2) {
              // the stall riser: polished granite, tiles or a painted panel
              float rk = vShopF.x;
              col = rk < 0.4 ? vec3(0.03) : rk < 0.7 ? shTiles(g, 0.1, vShopBrand * 0.6 + 0.04,
                vShopBrand * 0.5 + 0.04) : vColor * 0.55;
              gRough = rk < 0.4 ? 0.18 : 0.55;
              gEmit = col * spill * 0.2;
            } else if (what == 1) {
              col = frameC;
              gRough = 0.4;
              gMetal = frameK > 1.5 && frameK < 2.5 ? 0.7 : 0.2;
              gEmit = col * spill * 0.15;
            } else {
              // ---- glass ----
              gGlass = 1.0;
              gRough = 0.05;
              col = vec3(0.004);
              // the wider side of the door: where a sign in the window goes
              float lw = doorX - pier, rw = Wu - pier - doorX - doorW;
              float wide = lw > rw ? 0.5 * (pier + doorX) : 0.5 * (doorX + doorW + Wu - pier);
              // an empty shop's windows papered over, or whitewashed
              bool covered = cover > 0.5 && !door && g.y > riser + 0.08 && g.y < head - 0.12;
              if (covered) {
                if (cover < 1.5) {
                  // brown paper in sheets, their seams, the odd crease
                  vec2 k = floor(vec2(g.x / 0.9, g.y / 1.25));
                  col = vec3(0.4, 0.29, 0.17) * (0.9 + 0.1 * shH(k, 3.0));
                  col *= fract(g.x / 0.9) < 0.02 || fract(g.y / 1.25) < 0.015 ? 0.75 : 1.0;
                  col *= 0.97 + 0.03 * sin(g.x * 31.0 + 9.0 * g.y) * sin(g.y * 17.0 - 5.0 * g.x);
                } else
                  // whitewash brushed on in streaks
                  col = vec3(0.6, 0.6, 0.56) * (0.88 + 0.12 * smoothstep(-1.0, 1.0,
                    sin(g.y * 29.0 + 2.5 * sin(g.x * 3.7)) * sin(g.x * 2.1 + g.y)));
                gRough = 0.9;
              }
              // (decal: the sign's cell in the atlas, one on; 0 none)
              vec4 d = vec4(0.0, 0.0, 0.0, -1.0);
              if (decal > 0.5 && decal < 1.5) {
                // a FOR LEASE board
                d = shopDecal(g, vec2(wide, 1.45), vec2(0.9, 0.5625), 0.0, pdx, pdy);
                if (d.a >= 0.0) { col = d.rgb; gRough = 0.7; covered = true; }
              } else if (decal > 1.5 && !far) {
                // neon: OPEN on the glass by the door, or a bar's cocktail glass
                bool bar = decal > 2.5 && decal < 3.5;
                vec2 c = bar ? vec2(wide, 1.75)
                  : vec2(lw > rw ? doorX - 0.5 : doorX + doorW + 0.5, 1.55);
                vec2 sz = bar ? vec2(1.0, 0.625) : vec2(0.62, 0.39);
                d = shopDecal(g, c, sz, decal - 1.0, pdx, pdy);
                if (d.a >= 0.0) {
                  gEmit += d.rgb * d.a * L.w * 2.6;
                  col += d.rgb * d.a * 0.12;
                }
              }
              if (!covered) {
                vec3 inside = far ? shopAverage(kind, seed, L, lc)
                  : shopRoom(vec3(g, 0.0), r, Wu, kind, seed, vShopH, L, lc, head);
                // (what the glass doesn't reflect comes through it, tinted a little green)
                float F = 0.05 + 0.95 * pow(clamp(1.0 + r.z, 0.0, 1.0), 5.0);
                gEmit += inside * (1.0 - F) * vec3(0.88, 0.95, 0.93);
              }
            }
          }
        }
        diffuseColor.rgb = col;
        }`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        roughnessFactor = gRough;
        metalnessFactor = gMetal;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        'totalEmissiveRadiance = gEmit;'
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        // (a shop's plate glass reflects a little more than bare glass would: 5% straight on)
        if (gGlass > 0.5)
          radiance = 1.25 * shopMirror(radiance, inverseTransformDirection(reflect(-geometryViewDir,
            geometryNormal), viewMatrix), inverseTransformDirection(geometryNormal, viewMatrix),
            vShopUv.y, vShopW);`
      )
  }
  m.customProgramCacheKey = () => 'shopfronts'
  return m
}

// The light a lit shop throws on the pavement in front of it at night: brightest at the shopfront,
// fading out over the pavement and towards the shop's ends, in its lamps' colour; added onto the
// ground, as the gas stations' canopies' is (citySigns.js)
export function poolMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT },
    vertexShader: `
      uniform float uNight;
      attribute vec4 shop;
      varying vec2 vUv;
      flat varying vec3 vLight;
      varying float vFade;
      ${HASH_GLSL}
      ${LIGHTS_GLSL}
      void main () {
        vUv = uv;
        vLight = shopLightColour(shop.y, shop.w) * shopLights(shop.y, shop.w, uNight).x
          * smoothstep(0.15, 0.7, uNight) * 0.14;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFade = 1.0 - smoothstep(120.0, 260.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vUv;
      flat varying vec3 vLight;
      varying float vFade;
      void main () {
        float k = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.3, vUv.x)
          * smoothstep(1.0, 0.7, vUv.x);
        gl_FragColor = vec4(vLight * k * vFade, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  })
}
