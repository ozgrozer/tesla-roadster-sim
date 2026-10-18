// The insides of the shops, traced in the shader (shopShader.js) the way facade.js traces the rooms
// behind the windows above: the view ray goes on through the glass into a box a few metres deep (its
// floor, ceiling, side walls and back wall), and before that it is tested against what stands in it,
// a handful of boxes and flat cut-outs, each kind of shop its own: a café's counter across the back
// under its menu board, tables with chairs round them by the window and lamps hanging over them; a
// clothes shop's rails of clothes down both walls, a table of folded clothes and mannequins in the
// window; a convenience store's aisles of shelves of bright packets running back from the window,
// its till by the door and its fridges glowing along the back; a salon's chairs facing mirrors
// ringed with bulbs; a bar's counter down one side, stools along it and its bottles lit behind; and
// an empty unit's bare concrete with a few boxes left in it. While a shop is open someone is at work
// in it, behind the counter, the till, the bar or a chair. Each is lit by its own lamps (or not,
// shut), and by day by what comes in through the window. All in metres, in the shop's own frame: x
// along the shopfront from its left end, y up from the pavement, z out of the glass (the room is at
// z < 0).
export const ROOMS_GLSL = `
  #define SH_FLOOR 0
  #define SH_CEIL 1
  #define SH_SIDE 2
  #define SH_BACK 3
  #define SH_A 4
  #define SH_B 5
  #define SH_C 6
  #define SH_D 7
  #define SH_P 8
  struct ShHit { float t; int id; vec3 n; };
  // the ray (o, its reciprocal iv) against the box b0 to b1: kept if it is nearer than what it has hit
  void shBox (vec3 o, vec3 iv, vec3 b0, vec3 b1, int id, inout ShHit h) {
    vec3 t0 = (b0 - o) * iv, t1 = (b1 - o) * iv;
    vec3 lo = min(t0, t1), hi = max(t0, t1);
    float tn = max(max(lo.x, lo.y), lo.z), tf = min(min(hi.x, hi.y), hi.z);
    if (tn < tf && tn > 0.0 && tn < h.t) {
      h.t = tn;
      h.id = id;
      h.n = tn == lo.x ? vec3(-sign(iv.x), 0.0, 0.0)
        : tn == lo.y ? vec3(0.0, -sign(iv.y), 0.0) : vec3(0.0, 0.0, -sign(iv.z));
    }
  }
  // where the ray crosses a flat cut-out standing across the room at depth z (far off if it is
  // beyond what the ray has hit already)
  vec2 shCard (vec3 o, vec3 r, float z, ShHit h, out float t) {
    t = (z - o.z) / r.z;
    return t > 0.0 && t < h.t ? o.xy + r.xy * t : vec2(-99.0);
  }
  // a chair seen from in front or behind: four legs, a seat, a frame of a back
  float shChair (vec2 p, float cx) {
    float x = abs(p.x - cx);
    float legs = step(0.15, x) * step(x, 0.19) * step(p.y, 0.45);
    float seat = step(x, 0.21) * step(0.42, p.y) * step(p.y, 0.47);
    float back = step(x, 0.19) * step(0.47, p.y) * step(p.y, 0.88)
      * max(step(0.14, x), step(0.78, p.y));
    return max(max(legs, seat), back);
  }
  // a bar stool: a round seat on one leg, a ring for the feet, a foot on the floor
  float shStool (vec2 p, float cx) {
    float x = abs(p.x - cx);
    return max(max(step(x, 0.18) * step(0.7, p.y) * step(p.y, 0.77),
      step(x, 0.025) * step(p.y, 0.7)),
      max(step(x, 0.14) * step(abs(p.y - 0.3), 0.015), step(x, 0.16) * step(p.y, 0.03)));
  }
  // a mannequin on its stand (or, stand 0, someone at work): 1 its body, 2 its top, 3 its trousers
  // or skirt; 0 off it
  float shMannequin (vec2 p, float cx, float dress, float stand) {
    vec2 d = vec2(p.x - cx, p.y);
    float x = abs(d.x);
    if (length(vec2(d.x, (d.y - 1.63) * 0.8)) < 0.1) return 1.0;
    if (x < 0.035 && d.y > 1.44 && d.y < 1.56) return 1.0;
    float w = mix(0.14, 0.21, smoothstep(1.05, 1.42, d.y));
    if (d.y > 1.02 && d.y < 1.46 && x < w) return 2.0;
    if (x > 0.205 && x < 0.245 && d.y > 0.86 && d.y < 1.44) return 2.0 - step(d.y, 1.12);
    if (dress > 0.5) {
      if (d.y > 0.55 && d.y < 1.04 && x < mix(0.24, 0.15, (d.y - 0.55) / 0.49)) return 3.0;
    } else if (d.y > 0.08 * stand && d.y < 1.04 && x > 0.015 && x < 0.085 + 0.04 * step(0.75, d.y))
      return 3.0;
    if (stand > 0.5 && ((x < 0.015 && d.y < 0.55) || (x < 0.13 && d.y < 0.025))) return 1.0;
    return 0.0;
  }
  // someone at work in a shop that is open, standing at depth z, x across: the shop's hit h taken
  // if they are nearer, its part (1 skin, 2 top, 3 trousers) in part
  void shPerson (vec3 o, vec3 r, float x, float z, float open, inout ShHit h, inout float part) {
    float t;
    float q = open > 0.5 ? shMannequin(shCard(o, r, z, h, t), x, 0.0, 0.0) : 0.0;
    if (q > 0.5) { h.t = t; h.id = SH_P; h.n = vec3(0.0, 0.0, 1.0); part = q; }
  }
  // a colour picked from a palette of things on sale: bright packets, clothes, bottles
  vec3 shGoods (float h) {
    return h < 0.14 ? vec3(0.72, 0.06, 0.05) : h < 0.27 ? vec3(0.9, 0.62, 0.05)
      : h < 0.38 ? vec3(0.05, 0.22, 0.6) : h < 0.5 ? vec3(0.08, 0.42, 0.12)
      : h < 0.6 ? vec3(0.85, 0.82, 0.76) : h < 0.7 ? vec3(0.04, 0.04, 0.05)
      : h < 0.8 ? vec3(0.75, 0.28, 0.45) : h < 0.9 ? vec3(0.95, 0.4, 0.08) : vec3(0.2, 0.55, 0.75);
  }
  float shH (vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k) * 43758.5453); }
  // whether (x, y), each 0 to 1 across a bottle's place on a shelf, is on the bottle: its body, its
  // shoulders and its neck
  bool shBottle (float x, float y) {
    float w = y < 0.5 ? 0.24 : y < 0.6 ? mix(0.24, 0.07, (y - 0.5) / 0.1) : 0.07;
    return y > 0.08 && y < 0.82 && abs(x - 0.5) < w;
  }
  // shelves of goods on a face running along u (m), y up: shelf boards, and on each a row of boxes
  // and bags, each row its own size, each its own height and colour, most with a pale label
  vec3 shShelves (float u, float y, float seed) {
    float row = floor((y - 0.12) / 0.4), f = fract((y - 0.12) / 0.4);
    if (y < 0.12 || y > 1.72 || f < 0.07) return vec3(0.55, 0.55, 0.53);
    float w = 0.12 + 0.16 * shH(vec2(row, seed), 1.0);
    float k = floor(u / w), e = fract(u / w), hk = shH(vec2(k, row), seed);
    float ht = 0.45 + 0.45 * hk, up = (f - 0.07) / (0.93 * ht);
    if (up > 1.0 || e < 0.04 || e > 0.96) return vec3(0.03);
    vec3 c = shGoods(shH(vec2(k, row), seed + 3.0));
    if (hk > 0.35 && abs(up - 0.55) < 0.15) c = mix(c, vec3(0.85), 0.7);
    return c * (0.75 + 0.25 * up);
  }
  // wooden boards along x, each a shade of its own
  vec3 shPlanks (vec3 q, vec3 c) {
    float k = floor(q.x / 0.16);
    float e = min(fract(q.x / 0.16), 1.0 - fract(q.x / 0.16));
    return c * (0.75 + 0.45 * shH(vec2(k, floor(q.z / 2.4 + 0.5 * fract(k * 0.37))), 2.0))
      * (e < 0.04 ? 0.6 : 1.0);
  }
  // tiles: s m square, a and b alternating (checked) or a with grout lines between them
  vec3 shTiles (vec2 q, float s, vec3 a, vec3 b) {
    vec2 f = fract(q / s), k = floor(q / s);
    if (min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)) < 0.03) return a * 0.6;
    return mod(k.x + k.y, 2.0) < 0.5 ? a : b;
  }
  // the light on a point in the room: lamps down the middle of the ceiling (brightest under them,
  // less into the corners and at the back; even: as even as a store's tubes), and by day what comes
  // in through the window, strongest near it
  vec3 shLight (vec3 q, float x0, float x1, float Hc, float even, float lamps, vec3 lc) {
    float dx = (q.x - 0.5 * (x0 + x1)) / max(0.5 * (x1 - x0), 1.0);
    float l = 1.0 / (1.0 + 1.4 * dx * dx + 0.9 * (q.y / Hc) * (q.y / Hc));
    l = mix(l, 0.85, even) * (0.7 + 0.3 * exp(q.z * 0.2));
    float day = (1.0 - uNight) * 0.16 * (0.25 + 0.75 * exp(q.z / 2.2));
    return lc * l * lamps + vec3(0.9, 0.95, 1.05) * day + vec3(0.01);
  }

  // what comes out of the shop through its glass. o: where the view ray meets the glass (z = 0), r
  // the ray (z < 0); W the shop's width, k its kind (0 a café, 1 clothes, 2 a store, 3 a salon, 4 a
  // bar, 5 empty), s its own random number and H four more made from it; L how lit it is
  // (shopLights), lc its lamps' colour
  vec3 shopRoom (vec3 o, vec3 r, float W, float k, float s, vec4 H, vec4 L, vec3 lc, float head) {
    float D = 5.0 + 4.0 * H.w, Hc = head + 0.3;
    float x0 = 0.15, x1 = W - 0.15, xm = 0.5 * W;
    vec3 rr = vec3(abs(r.x) < 1e-4 ? 1e-4 : r.x, abs(r.y) < 1e-4 ? 1e-4 : r.y, r.z);
    vec3 iv = 1.0 / rr;
    // the room's own surfaces
    float tx = ((rr.x > 0.0 ? x1 : x0) - o.x) * iv.x;
    float ty = ((rr.y > 0.0 ? Hc : 0.0) - o.y) * iv.y;
    float tz = (-D - o.z) * iv.z;
    ShHit h;
    h.t = min(min(tx, ty), tz);
    h.id = h.t == tz ? SH_BACK : h.t == tx ? SH_SIDE : rr.y > 0.0 ? SH_CEIL : SH_FLOOR;
    h.n = h.id == SH_BACK ? vec3(0.0, 0.0, 1.0) : h.id == SH_SIDE ? vec3(-sign(rr.x), 0.0, 0.0)
      : vec3(0.0, -sign(rr.y), 0.0);
    float h1 = H.x, h2 = H.y, h3 = H.z;
    // lamps: how bright the kind keeps its lamps, how evenly they light it (by day only a room's
    // light, dim beside the street's)
    float lamps = L.x * mix(0.2, 1.6, uNight);
    float lk = 0.6, even = 0.0;
    vec3 c = vec3(0.6), em = vec3(0.0);
    float ct = 0.0, part = 0.0;
    vec2 cp;
    vec3 q;
    if (k < 0.5) {
      // ---- a café or a restaurant ----
      float cz = -D + 1.5, pass = 1.1;
      vec3 c0 = h1 < 0.5 ? vec3(x0 + pass, 0.0, cz - 0.6) : vec3(x0, 0.0, cz - 0.6);
      vec3 c1 = h1 < 0.5 ? vec3(x1, 1.05, cz) : vec3(x1 - pass, 1.05, cz);
      shBox(o, iv, c0, c1, SH_A, h);
      shPerson(o, rr, mix(c0.x, c1.x, 0.3 + 0.4 * h3), -D + 0.5, L.x, h, part);
      // tables by the window, a chair either side of each, a lamp over each
      vec3 T1 = vec3(mix(x0 + 0.7, x1 - 0.7, h2), 0.0, -1.15);
      vec3 T2 = vec3(mix(x0 + 0.7, x1 - 0.7, fract(h2 + 0.5)), 0.0, -2.75);
      shBox(o, iv, T1 + vec3(-0.36, 0.71, -0.36), T1 + vec3(0.36, 0.76, 0.36), SH_B, h);
      shBox(o, iv, T1 + vec3(-0.04, 0.0, -0.04), T1 + vec3(0.04, 0.71, 0.04), SH_C, h);
      shBox(o, iv, T2 + vec3(-0.36, 0.71, -0.36), T2 + vec3(0.36, 0.76, 0.36), SH_B, h);
      shBox(o, iv, T2 + vec3(-0.04, 0.0, -0.04), T2 + vec3(0.04, 0.71, 0.04), SH_C, h);
      for (int i = 0; i < 4; i++) {
        vec3 T = i < 2 ? T1 : T2;
        cp = shCard(o, rr, T.z + (i == 0 || i == 2 ? 0.55 : -0.55), h, ct);
        if (shChair(cp, T.x) > 0.5) { h.t = ct; h.id = SH_D; h.n = vec3(0.0, 0.0, 1.0); }
      }
      // the lamps: a shade on its cord, the bulb glowing under it
      for (int i = 0; i < 3; i++) {
        vec3 P = i == 0 ? T1 : i == 1 ? T2 : vec3(mix(c0.x, c1.x, 0.5), 0.0, cz - 0.3);
        cp = shCard(o, rr, P.z, h, ct);
        vec2 d = cp - vec2(P.x, Hc - 0.95);
        if (d.y > 0.0 && abs(d.x) < 0.012) { h.t = ct; h.id = SH_C; em = vec3(0.0); }
        else if (length(d * vec2(1.0, 1.6)) < 0.17) {
          h.t = ct; h.id = SH_C; em = lc * 3.0 * L.x * step(d.y, -0.02);
        }
      }
      q = o + rr * h.t;
      vec3 wall = h3 < 0.3 ? vec3(0.75, 0.68, 0.55) : h3 < 0.55 ? vec3(0.03, 0.12, 0.07)
        : h3 < 0.8 ? vec3(0.42, 0.15, 0.09) : vec3(0.8);
      if (h.id == SH_FLOOR) c = h2 < 0.6 ? shPlanks(q, vec3(0.3, 0.17, 0.09))
        : shTiles(q.xz, 0.3, vec3(0.03), vec3(0.75));
      else if (h.id == SH_CEIL) c = h1 < 0.5 ? vec3(0.03) : vec3(0.7);
      else if (h.id == SH_SIDE) {
        c = wall;
        if (h3 > 0.55 && h3 < 0.8) // (bare brick)
          c *= fract(q.y / 0.075) < 0.15 || fract(q.z / 0.215 + 0.5 * floor(q.y / 0.075)) < 0.06
            ? 1.5 : 0.8 + 0.3 * shH(floor(vec2(q.z / 0.215, q.y / 0.075)), 1.0);
      } else if (h.id == SH_BACK) {
        c = wall;
        // the menu board, its lines of chalk; shelves of cups under it
        if (abs(q.x - xm) < 1.2 && q.y > 1.9 && q.y < 2.7) {
          c = vec3(0.025);
          if (fract(q.y / 0.09) < 0.35 && abs(q.x - xm) < 1.05
            && shH(floor(vec2(q.x / 0.3, q.y / 0.09)), 4.0) > 0.25) c = vec3(0.6);
        } else if (q.y > 1.25 && q.y < 1.75) c = fract(q.y / 0.25) < 0.1 ? vec3(0.3, 0.2, 0.12)
          : shH(floor(vec2(q.x / 0.12, q.y / 0.25)), 5.0) > 0.4 ? vec3(0.8) : c;
      } else if (h.id == SH_A) c = h.n.y > 0.5 ? vec3(0.7) : h2 < 0.5 ? vec3(0.25, 0.13, 0.06)
        : shTiles(q.xy, 0.15, vec3(0.7), vec3(0.65));
      else if (h.id == SH_B) c = h1 < 0.5 ? vec3(0.32, 0.18, 0.08) : vec3(0.75);
      else if (h.id == SH_C) c = vec3(0.03);
      else c = h3 < 0.5 ? vec3(0.03) : vec3(0.35, 0.18, 0.08);
      // (pools of light under the lamps)
      lk = 0.45 + 0.6 * exp(-4.0 * dot(q.xz - T1.xz, q.xz - T1.xz))
        + 0.6 * exp(-4.0 * dot(q.xz - T2.xz, q.xz - T2.xz));
    } else if (k < 1.5) {
      // ---- a clothes shop ----
      shBox(o, iv, vec3(x0, 0.95, -D + 0.6), vec3(x0 + 0.5, 1.75, -1.1), SH_A, h);
      shBox(o, iv, vec3(x1 - 0.5, 0.95, -D + 0.6), vec3(x1, 1.75, -1.1), SH_A, h);
      shBox(o, iv, vec3(xm - 0.55, 0.0, -0.55 * D - 0.45), vec3(xm + 0.55, 0.8, -0.55 * D + 0.45),
        SH_B, h);
      // mannequins in the window, one or two
      float m1 = mix(x0 + 0.6, x1 - 0.6, h2), m2 = mix(x0 + 0.6, x1 - 0.6, fract(h2 + 0.45));
      cp = shCard(o, rr, -0.6, h, ct);
      float mq = shMannequin(cp, m1, step(0.5, h3), 1.0);
      if (mq < 0.5 && W > 4.0) mq = shMannequin(cp, m2, step(0.5, h1), 1.0);
      if (mq > 0.5) { h.t = ct; h.id = SH_D; h.n = vec3(0.0, 0.0, 1.0); part = mq; }
      q = o + rr * h.t;
      vec3 wall = h3 < 0.6 ? vec3(0.8) : vec3(0.75, 0.66, 0.62);
      if (h.id == SH_FLOOR) c = h1 < 0.5 ? shPlanks(q, vec3(0.5, 0.36, 0.22)) : vec3(0.42);
      else if (h.id == SH_CEIL) {
        c = vec3(0.75);
        // spotlights in two rows
        vec2 f = vec2(abs(q.x - xm) - 0.25 * W, fract(q.z / 1.2) - 0.5);
        if (dot(f, f) < 0.004) em = lc * 2.4 * L.x;
      } else if (h.id == SH_A) {
        // clothes on hangers, side by side: each its colour, rounded into shadow at its edges (and
        // at the rail's end, the last one's folds)
        float g = (h.n.z > 0.5 ? q.x : q.z) / 0.075;
        c = h.n.y > 0.5 ? vec3(0.4) : shGoods(shH(vec2(floor(g), s), 6.0))
          * (0.55 + 0.45 * sin(3.1416 * fract(g))) * (h.n.z > 0.5 ? 0.6 : 1.0);
      } else if (h.id == SH_B) c = h.n.y > 0.5
        ? shGoods(shH(floor(q.xz / vec2(0.3, 0.25)), 7.0)) * (fract(q.z / 0.25) < 0.1 ? 0.5 : 1.0)
        : vec3(0.75);
      else if (h.id == SH_D) c = part < 1.5 ? (h1 < 0.6 ? vec3(0.8) : vec3(0.04))
        : shGoods(shH(vec2(part, s), 8.0));
      else c = h.id == SH_BACK && q.y > 0.4 && q.y < 2.2 && abs(q.x - xm) < 0.35 * W
        ? shShelves(q.x, q.y, s) : wall;
      lk = 0.75;
      // (a closed shop's window display stays lit)
      lamps = max(lamps, L.z * 0.8 * smoothstep(-2.0, -0.8, q.z));
    } else if (k < 2.5) {
      // ---- a convenience store or a pharmacy ----
      float na = W > 5.0 ? 2.0 : 1.0;
      for (int i = 0; i < 2; i++) {
        if (float(i) >= na) break;
        float ax = mix(x0, x1, (float(i) + 1.0) / (na + 1.0));
        shBox(o, iv, vec3(ax - 0.42, 0.0, -D + 1.9), vec3(ax + 0.42, 1.7, -2.3), SH_A, h);
      }
      float side = h1 < 0.5 ? x0 + 0.1 : x1 - 1.4;
      shBox(o, iv, vec3(side, 0.0, -1.8), vec3(side + 1.3, 1.0, -0.9), SH_B, h);
      shPerson(o, rr, side + 0.65, -2.15, L.x, h, part);
      q = o + rr * h.t;
      if (h.id == SH_FLOOR) c = shTiles(q.xz, 0.3, vec3(0.62), vec3(0.55));
      else if (h.id == SH_CEIL) {
        c = vec3(0.7);
        // fluorescent tubes, two rows down the shop
        if (abs(abs(q.x - xm) - 0.17 * W) < 0.07 && fract(q.z / 1.6) > 0.2) em = lc * 2.2 * L.x;
      } else if (h.id == SH_BACK) {
        // fridges: glass doors, shelves of bottles behind, lit
        c = vec3(0.6);
        if (q.y > 0.05 && q.y < 2.15) {
          float f = fract(q.x / 0.75);
          if (f < 0.04 || f > 0.96 || q.y < 0.15 || q.y > 2.05) c = vec3(0.05);
          else {
            float b = fract(q.y / 0.38), bx = fract(q.x / 0.075);
            bool on = shBottle(bx, b);
            c = vec3(0.04);
            em = vec3(0.8, 0.92, 1.0) * mix(0.45, 0.95, uNight) * max(L.x, 0.4)
              * (b < 0.08 ? 0.4 : on ? 0.7 : 1.0);
            if (on) em *= shGoods(shH(floor(vec2(q.x / 0.075, q.y / 0.38)), 9.0)) * 1.4 + 0.1;
          }
        }
      } else if (h.id == SH_A || h.id == SH_SIDE)
        // (an aisle's end faces the window: more shelves, a header in a bright colour over them)
        c = h.n.y > 0.5 ? vec3(0.6) : h.n.z < 0.5 ? shShelves(q.z, q.y, s)
          : q.y > 1.72 ? shGoods(h2) : shShelves(q.x, q.y, s + 7.0);
      else c = h.n.y > 0.5 ? vec3(0.55) : vec3(0.15, 0.16, 0.2);
      lk = 0.85;
      even = 0.7;
    } else if (k < 3.5) {
      // ---- a hair or nail salon: chairs facing mirrors down one wall ----
      float mw = h1 < 0.5 ? x0 : x1, sd = h1 < 0.5 ? 1.0 : -1.0;
      for (int i = 0; i < 3; i++) {
        float cz = -1.5 - 1.5 * float(i);
        if (cz < -D + 1.0) break;
        float a = mw + sd * 0.55, b = mw + sd * 1.1;
        shBox(o, iv, vec3(min(a, b), 0.0, cz - 0.3), vec3(max(a, b), 1.1, cz + 0.3), SH_A, h);
      }
      shPerson(o, rr, mw + sd * 1.45, -1.5, L.x, h, part);
      float dsk = h1 < 0.5 ? x1 - 1.5 : x0 + 0.2;
      shBox(o, iv, vec3(dsk, 0.0, -D + 0.8), vec3(dsk + 1.3, 1.05, -D + 1.5), SH_B, h);
      q = o + rr * h.t;
      vec3 wall = h3 < 0.33 ? vec3(0.8, 0.6, 0.62) : h3 < 0.66 ? vec3(0.6, 0.78, 0.7)
        : vec3(0.82, 0.8, 0.74);
      if (h.id == SH_FLOOR) c = h2 < 0.5 ? shTiles(q.xz, 0.3, vec3(0.03), vec3(0.78))
        : shPlanks(q, vec3(0.5, 0.36, 0.22));
      else if (h.id == SH_CEIL) {
        c = vec3(0.75);
        vec2 f = vec2(fract(q.x / 1.4) - 0.5, fract(q.z / 1.5) - 0.5);
        if (dot(f, f) < 0.01) em = lc * 2.0 * L.x;
      } else if (h.id == SH_SIDE && abs(q.x - mw) < 0.01) {
        // the mirrors, bulbs round each
        float mz = (fract((q.z + 1.5) / 1.5 + 0.5) - 0.5) * 1.5;
        c = wall;
        if (abs(mz) < 0.45 && q.y > 0.8 && q.y < 2.05 && q.z < -0.9) {
          c = mix(vec3(0.35, 0.38, 0.4), vec3(0.6, 0.62, 0.62), (q.y - 0.8) / 1.25);
          vec2 e = vec2(0.45 - abs(mz), min(q.y - 0.8, 2.05 - q.y));
          if (min(e.x, e.y) < 0.05) {
            c = vec3(0.9);
            if (fract(q.y / 0.2) < 0.4 || fract(mz / 0.2) < 0.4) em = lc * 1.6 * L.x;
          }
        }
      } else if (h.id == SH_A) c = h2 < 0.4 ? vec3(0.03) : h2 < 0.7 ? vec3(0.4, 0.03, 0.04)
        : vec3(0.6, 0.52, 0.42);
      else if (h.id == SH_B) c = vec3(0.85);
      else c = h.id == SH_BACK && q.y > 1.2 && q.y < 2.0 && fract(q.y / 0.4) > 0.15
        ? shGoods(shH(floor(vec2(q.x / 0.06, q.y / 0.4)), 3.0)) : wall;
      lk = 0.8;
      even = 0.4;
    } else if (k < 4.5) {
      // ---- a bar: its counter down one side, stools along it, bottles lit behind ----
      float bw = h1 < 0.5 ? x0 : x1, sd = h1 < 0.5 ? 1.0 : -1.0;
      float a = bw + sd * 0.95, b = bw + sd * 1.55;
      shBox(o, iv, vec3(min(a, b), 0.0, -D + 0.8), vec3(max(a, b), 1.08, -1.6), SH_A, h);
      shPerson(o, rr, bw + sd * 0.5, -2.4 - 1.4 * h2, L.x, h, part);
      for (int i = 0; i < 3; i++) {
        cp = shCard(o, rr, -2.0 - 1.1 * float(i), h, ct);
        if (shStool(cp, bw + sd * 1.9) > 0.5) { h.t = ct; h.id = SH_C; h.n = vec3(0.0, 0.0, 1.0); }
      }
      q = o + rr * h.t;
      vec3 wall = h3 < 0.4 ? vec3(0.12, 0.02, 0.02) : h3 < 0.7 ? vec3(0.02, 0.06, 0.04)
        : vec3(0.1, 0.05, 0.03);
      if (h.id == SH_FLOOR) c = shPlanks(q, vec3(0.12, 0.06, 0.03));
      else if (h.id == SH_CEIL) c = vec3(0.02);
      else if (h.id == SH_SIDE && abs(q.x - bw) < 0.01 && q.y > 1.2 && q.y < 2.5) {
        // shelves of bottles, lit from behind
        float b = fract((q.y - 1.2) / 0.43), bx = fract(q.z / 0.09);
        c = vec3(0.03);
        em = vec3(1.0, 0.62, 0.3) * 0.6 * L.x;
        if (shBottle(bx, b))
          em *= 0.5 + 1.8 * shGoods(shH(floor(vec2(q.z / 0.09, q.y / 0.43)), 2.0));
        else if (b < 0.08) em *= 0.2;
      } else if (h.id == SH_A) c = h.n.y > 0.5 ? vec3(0.05, 0.03, 0.02)
        : q.y < 0.2 && q.y > 0.17 ? vec3(0.6, 0.45, 0.15) : vec3(0.1, 0.05, 0.025);
      else if (h.id == SH_C) c = vec3(0.04);
      else c = wall;
      lk = 0.55 + 0.6 * exp(-1.5 * (q.x - bw) * (q.x - bw));
    } else {
      // ---- an empty unit: bare concrete, a few boxes left behind ----
      shBox(o, iv, vec3(x1 - 1.3, 0.0, -D + 0.9), vec3(x1 - 0.4, 0.75, -D + 1.7), SH_A, h);
      shBox(o, iv, vec3(x1 - 1.1, 0.75, -D + 1.0), vec3(x1 - 0.55, 1.2, -D + 1.5), SH_A, h);
      q = o + rr * h.t;
      if (h.id == SH_A) c = vec3(0.42, 0.28, 0.15);
      else if (h.id == SH_FLOOR) c = vec3(0.3) * (0.85 + 0.3 * shH(floor(q.xz * 1.3), 1.0));
      else if (h.id == SH_CEIL) c = vec3(0.12);
      else c = vec3(0.55, 0.53, 0.5) * (fract(q.y * 0.6 + q.x * 0.1) < 0.3 ? 0.9 : 1.0);
      lk = 0.0;
    }
    // (someone at work: their skin, their top, their trousers)
    if (h.id == SH_P)
      c = part < 1.5 ? (h2 < 0.3 ? vec3(0.6, 0.42, 0.32) : h2 < 0.6 ? vec3(0.36, 0.22, 0.14)
        : h2 < 0.85 ? vec3(0.5, 0.33, 0.22) : vec3(0.13, 0.08, 0.05))
        : part < 2.5 ? shGoods(fract(h3 * 7.3)) : vec3(0.04, 0.045, 0.06);
    vec3 E = shLight(q, x0, x1, Hc, even, lamps * lk, lc);
    // (darker into the room's corners and along its edges, where the light reaches less)
    vec3 e = 1.0 - smoothstep(0.0, 0.5, vec3(min(q.x - x0, x1 - q.x), min(q.y, Hc - q.y), q.z + D));
    float ao = 1.0 - 0.45 * (e.x * e.y + e.x * e.z + e.y * e.z);
    return c * E * ao + em;
  }
  // the same, seen from far off: the room's light on average (each kind's matched by eye to what
  // the traced room gives, straight on, by day and at night), a shut clothes shop's lit window
  // and a bar's lit bottles with it
  vec3 shopAverage (float k, float s, vec4 L, vec3 lc) {
    float lamps = L.x * mix(0.2, 1.6, uNight);
    vec3 a = k < 0.5 ? vec3(0.38, 0.33, 0.26) : k < 1.5 ? vec3(0.38, 0.34, 0.32)
      : k < 2.5 ? vec3(0.5, 0.48, 0.45) : k < 3.5 ? vec3(0.48, 0.44, 0.42)
      : k < 4.5 ? vec3(0.05, 0.035, 0.025) : vec3(0.4);
    float lk = k < 0.5 ? 0.7 : k < 1.5 ? 0.75 : k < 2.5 ? 0.95 : k < 3.5 ? 0.85 : k < 4.5 ? 1.2 : 0.0;
    float day = (1.0 - uNight) * 0.15;
    return a * (lc * (lamps * lk + 0.3 * L.z) * 0.6 + day)
      + (k > 3.5 && k < 4.5 ? vec3(0.02, 0.025, 0.015) * L.x : vec3(0.0));
  }
`
