// How the people on foot (peds.js, the figure in pedFigure.js) are posed and dressed, in the shaders,
// from a few numbers each: their stride, what they are doing, and their look, a number from 0 to 1
// that everything about them follows from. Posed, in the vertex shader: each foot is planted through
// its stance and travels back at the pace the body moves on, the knee folds as the leg swings
// through, arms swing against the legs, the body rises over each step, running they lean in with
// their elbows bent; heads turn and bow, a phone comes up in front of them, hands talk, and in a
// fright the arms fly up. In the rain an umbrella goes up in the right hand, or they hunch, arms in,
// hoods up; on a bench they sit, thighs forward and shins down, hands on their knees; a dog's lead
// is held a little forward. Dressed, in the fragment shader (so a neckline, a sleeve's hem or a sole
// is crisp), the way Los Angeles dresses: T-shirts and tank tops, hoodies and long sleeves, jeans,
// chinos, leggings, shorts, summer dresses and skirts, caps and sunglasses, trainers (and sandals),
// a shoulder bag or a backpack; hair short, long, in a ponytail, a bun or curls, buzzed or bald;
// skin from pale to deep brown; a woman's build or a man's. And a face: eyes under brows, a nose, a
// mouth, a beard on some, enough to read across the street. Umbrellas are black, most of them, or
// navy or red; a few are golf umbrellas, wider, in panels of two colours, and a few clear bubbles
// (half their pixels left out, so the head shows through). At night the nearest street light
// lights each of them (pedLight.js).
import { PART, HEAD_AT } from './pedFigure.js'
import { UMBRELLA } from './pedGear.js'
import { LAMP_VERTEX, LAMP_FRAGMENT } from './pedLight.js'

const P = PART
// What someone wears, from their look, as bits: 1 a woman; top (2 bits from 2): 0 a tank top, 1 a
// T-shirt, 2 long sleeves, 3 a hoodie; bottom (from 8): 0 trousers, jeans or leggings, 1 shorts, 2 a
// dress, 3 a skirt; hair (from 32): 0 short, 1 long, 2 a ponytail, 3 curls, 4 a bun, 5 buzzed, 6
// bald; 256 a cap, 512 sunglasses, 1024 a shoulder bag, 2048 a backpack; shoes (from 4096): 0 white
// trainers, 1 black, 2 grey, 3 sandals; 16384 a beard
const HASH = `
  float pedHash (float k, float m) { return fract(sin(k * 78.233 + m * 12.9898) * 43758.5453); }
  int pedStyle (float k) {
    bool woman = pedHash(k, 1.0) < 0.5;
    float t = pedHash(k, 2.0), b = pedHash(k, 3.0), h = pedHash(k, 4.0);
    int top, bottom, hair;
    if (woman) {
      bottom = b < 0.2 ? 2 : b < 0.5 ? 0 : b < 0.82 ? 1 : 3;
      top = bottom == 2 ? 0 : t < 0.3 ? 0 : t < 0.7 ? 1 : t < 0.86 ? 2 : 3;
      hair = h < 0.36 ? 1 : h < 0.6 ? 2 : h < 0.72 ? 3 : h < 0.82 ? 4 : 0;
    } else {
      bottom = b < 0.58 ? 0 : 1;
      top = t < 0.12 ? 0 : t < 0.66 ? 1 : t < 0.8 ? 2 : 3;
      hair = h < 0.5 ? 0 : h < 0.68 ? 5 : h < 0.8 ? 3 : h < 0.86 ? 1 : h < 0.92 ? 4 : 6;
    }
    int s = (woman ? 1 : 0) | (top << 1) | (bottom << 3) | (hair << 5);
    if (pedHash(k, 5.0) < (woman ? 0.12 : 0.3) && hair != 3 && hair != 4) s |= 256;
    if (pedHash(k, 6.0) < 0.3) s |= 512;
    float bg = pedHash(k, 7.0);
    if (bg < (woman ? 0.3 : 0.05)) s |= 1024;
    else if (bg < (woman ? 0.42 : 0.2)) s |= 2048;
    float sh = pedHash(k, 8.0);
    s |= (bottom != 0 && sh < 0.18 ? 3 : sh < 0.5 ? 0 : sh < 0.78 ? 1 : 2) << 12;
    if (!woman && pedHash(k, 9.0) < 0.28) s |= 16384;
    return s;
  }
  // the umbrella someone carries: 0 a plain one, 1 a golf umbrella, 2 a clear bubble
  int pedBrolly (float k) {
    float h = pedHash(k, 21.0);
    return h < 0.15 ? 1 : h < 0.25 ? 2 : 0;
  }
`
const ATTRS = `
  attribute float aPart;
  attribute vec4 aPose; // stride phase, stride (0 standing, 1 walking, 1.6 running), fright, hop
  attribute vec4 aAct; // head turned (rad), on the phone, talking with their hands, gesture clock
  attribute float aLook; // who they are
  // their umbrella up (0 to 1), hunched in the rain (and a hoodie's hood up), sat down, and the
  // hand holding a dog's lead (1 the right, -1 the left, 0 none)
  attribute vec4 aGear;
`
const VARY = `
  varying vec3 vRest;
  flat varying float vPedPart;
  flat varying float vPedLook;
  flat varying float vPedStyle;
`

// The pose, applied to a point (or, with w = 0, a normal) of a part, each figure facing +x and its
// right side +z: legs and arms about their joints (swinging in the x-y plane), the head turned and
// bowed about the neck, the upper body leaning in to a run and twisting against the stride, and the
// whole body rising over each step. The parts someone hasn't got fold away to a point.
const POSE = `
  mat2 pedRot (float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  // a leg's swing at phase q: from forward to back at an even pace through the stance (the foot on
  // the ground), then smoothly forward again through the swing
  float pedLeg (float q, float A) {
    q = mod(q, 6.28318);
    return q < 3.14159 ? A * (1.0 - 2.0 * q / 3.14159) : -A * cos(q - 3.14159);
  }
  bool pedHas (int part, int s) {
    int hair = (s >> 5) & 7, bottom = (s >> 3) & 3;
    bool cap = (s & 256) != 0;
    if (part == ${P.HAIR}) return hair != 3 && hair != 6 && !cap;
    if (part == ${P.LONG_HAIR}) return hair == 1;
    if (part == ${P.PONY}) return hair == 2;
    if (part == ${P.CURLS}) return hair == 3;
    if (part == ${P.BUN}) return hair == 4;
    if (part == ${P.CAP}) return cap;
    if (part == ${P.HOOD}) return ((s >> 1) & 3) == 3;
    if (part == ${P.SKIRT}) return bottom >= 2;
    if (part == ${P.BAG}) return (s & 1024) != 0;
    if (part == ${P.PACK}) return (s & 2048) != 0;
    return true;
  }
  // a woman's build: the shoulders narrower, the hips wider, a bust; her arms in to suit
  vec3 pedShape (vec3 p, int part, int style) {
    if ((style & 1) == 0) return p;
    if (part == ${P.TORSO} || part == ${P.HIPS}) {
      p.z *= 1.0 - 0.1 * smoothstep(1.18, 1.42, p.y) + 0.06 * (1.0 - smoothstep(0.86, 1.06, p.y));
      if (p.x > 0.0) p.x += 0.032 * smoothstep(1.16, 1.27, p.y) * (1.0 - smoothstep(1.3, 1.38, p.y)) * smoothstep(0.02, 0.1, abs(p.z));
    } else if (part >= 7 && part <= 10) p.z *= 0.9;
    else if (part == ${P.PHONE}) p.z -= 0.016;
    return p;
  }
  vec3 pedPose (vec3 p, float w, int part, int style) {
    if (w > 0.5) p = pedShape(p, part, style);
    float ph = aPose.x, gait = aPose.y, fright = aPose.z;
    float A = 0.42 * gait, run = clamp((gait - 1.2) * 2.5, 0.0, 1.0);
    float phone = max(aAct.y, 0.0) * (1.0 - fright), talk = aAct.z * (1.0 - fright);
    // fists up, fighting (aAct.y -1), the right one thrown out (to -2: sim/brawl.js)
    float guard = aAct.y < -0.5 ? 1.0 : 0.0, jab = clamp(-aAct.y - 1.0, 0.0, 1.0);
    // an umbrella (the arm up first, then it opens), hunched with a hoodie's hood up, sat down
    float umb = aGear.x, hunch = aGear.y, sit = aGear.z;
    float hold = smoothstep(0.0, 0.35, umb);
    bool hood = hunch > 0.5 && ((style >> 1) & 3) == 3;
    if (part == ${P.PHONE}) p = mix(vec3(0.01, 0.8, 0.2) * w, p, phone);
    if (!pedHas(part, style)) p = vec3(0.0, 1.2, 0.0) * w;
    bool hair = part == ${P.HAIR} || part == ${P.LONG_HAIR} || part == ${P.PONY}
      || part == ${P.CURLS} || part == ${P.BUN} || part == ${P.CAP};
    // (the hood up hides the hair, a cap and the hood bunched behind the neck)
    if (hood ? hair || part == ${P.HOOD} : part == ${P.HOOD_UP}) p = vec3(0.0, 1.2, 0.0) * w;
    bool headish = hair || part == ${P.HEAD} || part == ${P.HOOD_UP};
    if (part == ${P.BROLLY} || part == ${P.SHAFT}) {
      if (umb < 0.02) p = vec3(0.0, 1.2, 0.0) * w;
      else if (part == ${P.BROLLY}) {
        // opening out round its shaft: a golf umbrella wider, a clear bubble narrower and deeper
        int kind = pedBrolly(aLook);
        float k = (kind == 1 ? 1.35 : kind == 2 ? 0.8 : 1.0) * mix(0.1, 1.0, smoothstep(0.3, 1.0, umb));
        float d = kind == 1 ? 1.2 : kind == 2 ? 2.3 : 1.0;
        vec2 ax = vec2(${UMBRELLA.x}, ${UMBRELLA.z});
        if (w > 0.5) {
          p.xz = ax + (p.xz - ax) * k;
          p.y = ${UMBRELLA.top} + (p.y - ${UMBRELLA.top}) * d;
        } else p = vec3(p.x / k, p.y / d, p.z / k);
      }
    }
    if (part >= 3 && part <= 6) {
      bool left = part <= 4;
      float q = ph + (left ? 0.0 : 3.14159);
      float swing = pedLeg(q, A) + fright * (left ? 0.5 : -0.35);
      // the knee folds as the leg swings through (more running), and gives a little in the stance;
      // sat down, the thigh is forward and the shin down
      if (part == 4 || part == 6) {
        float u = mod(q, 6.28318);
        float knee = u < 3.14159
          ? 0.1 * gait * sin(u)
          : sin(u - 3.14159) * (0.45 + 0.9 * A + 0.8 * run);
        knee += fright * 0.6;
        vec2 k = vec2(0.0, 0.5) * w;
        p.xy = k + pedRot(-mix(knee, 1.45, sit)) * (p.xy - k);
      }
      vec2 h = vec2(0.0, 0.92) * w;
      p.xy = h + pedRot(mix(swing, 1.45, sit)) * (p.xy - h);
    }
    if ((part >= 7 && part <= 10) || part == ${P.PHONE}) {
      bool left = part <= 8;
      // each arm swings with the other side's leg; less, and bent, hunched in the rain; sat down,
      // the hands on the thighs; holding a dog's lead, a little forward and swinging a little
      float swing = (0.85 * A + 0.25 * run) * cos(ph + (left ? 3.14159 : 0.0)) + fright * 2.5;
      float elbow = 0.2 + 0.25 * gait + 1.1 * run + 0.35 * hunch;
      swing = mix(swing * (1.0 - 0.45 * hunch), 0.3, sit);
      elbow = mix(elbow, 0.75, sit);
      if (aGear.w * (left ? -1.0 : 1.0) > 0.5) {
        swing = 0.2 + 0.25 * swing;
        elbow = 0.55;
      }
      // fists up in front of the face; the right thrown straight out
      swing = mix(swing, left ? 1.05 : mix(1.0, 1.55, jab), guard);
      elbow = mix(elbow, left ? 2.1 : mix(2.0, 0.15, jab), guard);
      if (!left) {
        // the phone held up in front of them; an umbrella held up over their head
        swing = mix(mix(swing, 0.4, phone), 0.12, hold);
        elbow = mix(mix(elbow, 1.9, phone), 2.65, hold);
      } else {
        // talking with their hands
        swing = mix(swing, 0.3 + 0.12 * sin(aAct.w * 2.1), talk);
        elbow = mix(elbow, 1.0 + 0.35 * sin(aAct.w * 3.3), talk);
      }
      if (part == 8 || part == 10 || part == ${P.PHONE}) {
        vec2 e = vec2(0.0, 1.16) * w;
        p.xy = e + pedRot(elbow) * (p.xy - e);
      }
      vec2 s = vec2(0.0, 1.45) * w;
      p.xy = s + pedRot(swing) * (p.xy - s);
    }
    // the head turned (to the Roadster) and bowed (over the phone, or in the rain)
    if (headish) {
      vec2 n = vec2(0.0, 1.53) * w;
      p.xy = n + pedRot(-0.4 * phone - 0.2 * hunch) * (p.xy - n);
      p.xz = pedRot(-aAct.x) * p.xz;
    }
    // the upper body: twisting against the stride, leaning in to a run, or into the rain; sat
    // down, back a little
    if (part != ${P.HIPS} && (part < 3 || part > 6) && part != ${P.SKIRT} && part != ${P.BAG}) {
      if (!headish) p.xz = pedRot(0.25 * A * cos(ph)) * p.xz;
      vec2 hip = vec2(0.0, 0.95) * w;
      float lean = -0.2 * run - 0.05 * gait - 0.13 * hunch + 0.05 * sit;
      p.xy = hip + pedRot(lean) * (p.xy - hip);
    }
    // sat down: the hips flat on the seat, a skirt over the thighs, and the whole body lowered so
    // the hips are on the seat (0.48 m up) whatever their height (the instance's scale)
    if (sit > 0.0 && w > 0.5) {
      if (part == ${P.HIPS}) p.y = mix(p.y, max(p.y, 0.9), sit);
      if (part == ${P.SKIRT}) {
        float u = max(0.0, 0.95 - p.y) * sit;
        p += vec3(1.1 * u, 0.75 * u, 0.0);
      }
      p.y -= sit * (0.84 - 0.48 / length(instanceMatrix[1].xyz));
    }
    // up over each step (the most at mid-stance), higher running, and the hop of a dive
    p.y += w * ((0.026 * gait + 0.03 * run) * -cos(2.0 * ph) + aPose.w);
    return p;
  }
`

// Their colours, per fragment of each part at its rest position q: skin from pale through olive and
// brown to deep brown (the middle tones the most of them), hair to suit, the clothes; and on the
// head, the face. Colours are written as they look (sRGB) and made linear at the end.
const DRESS = `
  const vec3 TOPS[16] = vec3[16](
    vec3(0.86, 0.86, 0.84), vec3(0.07, 0.07, 0.08), vec3(0.47, 0.48, 0.5), vec3(0.2, 0.21, 0.23),
    vec3(0.09, 0.12, 0.24), vec3(0.47, 0.64, 0.82), vec3(0.9, 0.62, 0.68), vec3(0.92, 0.44, 0.36),
    vec3(0.8, 0.62, 0.2), vec3(0.37, 0.4, 0.22), vec3(0.58, 0.65, 0.52), vec3(0.64, 0.58, 0.8),
    vec3(0.72, 0.13, 0.13), vec3(0.92, 0.87, 0.74), vec3(0.13, 0.47, 0.5), vec3(0.42, 0.09, 0.13));
  const vec3 BOTTOMS[10] = vec3[10](
    vec3(0.52, 0.62, 0.74), vec3(0.28, 0.37, 0.52), vec3(0.13, 0.17, 0.28), vec3(0.08, 0.08, 0.09),
    vec3(0.74, 0.66, 0.5), vec3(0.42, 0.43, 0.45), vec3(0.11, 0.13, 0.22), vec3(0.34, 0.36, 0.23),
    vec3(0.86, 0.85, 0.82), vec3(0.2, 0.2, 0.22));
  const vec3 CAPS[6] = vec3[6](
    vec3(0.06, 0.06, 0.07), vec3(0.09, 0.11, 0.22), vec3(0.86, 0.86, 0.84), vec3(0.66, 0.1, 0.1),
    vec3(0.7, 0.62, 0.46), vec3(0.32, 0.35, 0.22));
  float pedRough = 0.88;
  // an umbrella's canopy at q (its rest place): black, navy or red; a golf umbrella's panels white
  // and a colour by turns round its shaft; a clear bubble pale and glossy
  vec3 pedCanopy (vec3 q, float k) {
    int kind = pedBrolly(k);
    float h = pedHash(k, 22.0);
    pedRough = kind == 2 ? 0.08 : 0.55;
    if (kind == 2) return vec3(0.84, 0.88, 0.92);
    if (kind == 1) {
      float a = atan(q.z - ${UMBRELLA.z}, q.x - ${UMBRELLA.x});
      vec3 band = h < 0.3 ? vec3(0.62, 0.06, 0.07) : h < 0.55 ? vec3(0.05, 0.08, 0.26)
        : h < 0.8 ? vec3(0.05, 0.32, 0.14) : vec3(0.9, 0.68, 0.06);
      return mod(floor(a / 0.7854) + 8.0, 2.0) > 0.5 ? vec3(0.92) : band;
    }
    return h < 0.6 ? vec3(0.035) : h < 0.85 ? vec3(0.06, 0.08, 0.2) : vec3(0.6, 0.06, 0.07);
  }
  // an ordered pattern over the screen, 0 to 1 by 4 by 4 pixels: a clear bubble leaves out those
  // under 0.55, so what is behind it shows through
  const float PED_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0);
  float pedBayer (vec2 f) {
    ivec2 i = ivec2(mod(f, 4.0));
    return (PED_BAYER[i.y * 4 + i.x] + 0.5) / 16.0;
  }
  vec3 pedDress (int part, vec3 q, float k, int s) {
    int top = (s >> 1) & 3, bottom = (s >> 3) & 3, hairCut = (s >> 5) & 7, shoes = (s >> 12) & 3;
    bool woman = (s & 1) != 0;
    float hs = pedHash(k, 10.0);
    float u = hs < 0.3 ? hs / 0.3 * 0.33 : hs < 0.86 ? 0.33 + (hs - 0.3) / 0.56 * 0.37 : 0.7 + (hs - 0.86) / 0.14 * 0.3;
    vec3 skin = u < 0.25 ? mix(vec3(0.96, 0.8, 0.7), vec3(0.89, 0.69, 0.56), u / 0.25)
      : u < 0.5 ? mix(vec3(0.89, 0.69, 0.56), vec3(0.74, 0.53, 0.38), (u - 0.25) / 0.25)
      : u < 0.75 ? mix(vec3(0.74, 0.53, 0.38), vec3(0.5, 0.33, 0.22), (u - 0.5) / 0.25)
      : mix(vec3(0.5, 0.33, 0.22), vec3(0.27, 0.17, 0.11), (u - 0.75) / 0.25);
    float hh = pedHash(k, 11.0);
    vec3 hair = hh > 0.93 ? vec3(0.62, 0.6, 0.58)
      : u > 0.45 || hh < 0.38 ? vec3(0.035, 0.03, 0.028)
      : hh < 0.62 ? vec3(0.16, 0.1, 0.06)
      : hh < 0.76 ? vec3(0.32, 0.21, 0.12)
      : hh < 0.88 ? vec3(0.72, 0.56, 0.32) : vec3(0.48, 0.2, 0.08);
    vec3 shirt = TOPS[int(pedHash(k, 12.0) * 16.0)];
    vec3 pants = bottom == 3 ? TOPS[int(pedHash(k, 13.0) * 16.0)]
      : BOTTOMS[int(pedHash(k, 13.0) * (bottom == 1 ? 8.0 : pedHash(k, 14.0) < 0.6 ? 4.0 : 10.0))];
    if (woman && bottom == 0 && pedHash(k, 15.0) < 0.3) pants = BOTTOMS[3]; // leggings
    bool dress = bottom == 2, bareLegs = bottom >= 1;
    vec3 shoe = shoes == 0 ? vec3(0.9, 0.9, 0.88) : shoes == 1 ? vec3(0.07) : shoes == 2 ? vec3(0.45, 0.46, 0.48) : skin;
    vec3 c = shirt;
    if (part == ${P.HEAD} || part == ${P.NECK}) {
      c = skin;
      pedRough = 0.55;
    } else if (part == ${P.HAIR} || part == ${P.LONG_HAIR} || part == ${
  P.PONY
} || part == ${P.CURLS} || part == ${P.BUN}) {
      c = hairCut == 5 ? mix(skin, hair, 0.7) : hair;
      pedRough = 0.6;
    } else if (part == ${P.CAP}) c = CAPS[int(pedHash(k, 16.0) * 6.0)];
    else if (part == ${P.HOOD} || part == ${P.HOOD_UP}) c = shirt * 0.85;
    else if (part == ${P.BROLLY}) c = pedCanopy(q, k);
    else if (part == ${P.SHAFT}) {
      c = vec3(0.08);
      pedRough = 0.35;
    }
    else if (part == ${P.TORSO}) {
      // a tank top's straps leave the shoulders bare; a scoop or crew neck
      if (top == 0 && q.y > 1.32 && (abs(q.z) > 0.125 || (abs(q.z) < 0.075 && q.x > 0.0 && q.y > 1.4))) c = skin;
      if (top == 1 && q.y > 1.445 && q.x > 0.01 && abs(q.z) < 0.07) c = skin;
      if (top == 3 && q.y > 1.2 && q.y < 1.24 && q.x > 0.06) c = shirt * 0.8; // (the hoodie's pocket)
    } else if (part == ${P.HIPS}) c = dress ? shirt : pants;
    else if (part >= 3 && part <= 6) {
      c = pants;
      // shorts end above the knee; a dress or skirt leaves the legs bare
      if (bottom >= 2 || (bottom == 1 && (q.y < 0.62 || part == 4 || part == 6))) c = skin;
      if (q.y < 0.082 && q.x > -0.075 || (q.y < 0.1 && q.x > 0.06)) {
        // the trainers: a white sole under them (sandals: a dark sole under bare feet)
        c = q.y < 0.026 ? (shoes == 3 ? vec3(0.12, 0.08, 0.05) : vec3(0.93, 0.93, 0.91)) : shoe;
        if (shoes == 1 && q.y > 0.026 && q.y < 0.034) c = vec3(0.9); // (a white stripe round a black one)
        pedRough = 0.6;
      } else if (bareLegs && shoes != 3 && q.y < 0.13 && pedHash(k, 17.0) < 0.5) c = vec3(0.9, 0.9, 0.88); // socks
    } else if (part == 7 || part == 9) {
      c = top == 0 || (top == 1 && q.y < 1.3) ? skin : shirt;
      if (top == 1 && q.y >= 1.3 && q.y < 1.315) c = shirt * 0.9; // (the sleeve's hem)
    } else if (part == 8 || part == 10) c = top >= 2 && q.y > 0.885 ? shirt : skin;
    else if (part == ${P.SKIRT}) c = dress ? shirt : pants;
    else if (part == ${
      P.BAG
    }) c = pedHash(k, 18.0) < 0.5 ? vec3(0.45, 0.29, 0.17) : vec3(0.08);
    else if (part == ${
      P.PACK
    }) c = BOTTOMS[int(pedHash(k, 19.0) * 4.0) + 3] * 0.8;
    if (part == ${P.PHONE}) {
      c = vec3(0.04, 0.045, 0.05);
      pedRough = 0.3;
    }
    if (part == ${P.HEAD}) {
      // the face: eyes under brows (or sunglasses), a mouth, a beard on some
      vec3 h = q - vec3(${HEAD_AT.join(', ')});
      bool front = h.x > 0.03;
      float ez = abs(h.z) - 0.031, ey = h.y - 0.006;
      bool mouth = front && abs(h.z) < 0.022 && abs(h.y + 0.05) < 0.005;
      if ((s & 16384) != 0 && h.y < -0.025 && h.x > -0.03 && !mouth) c = mix(c, hair, 0.8);
      if (mouth) c = skin * vec3(0.62, 0.42, 0.4) * (woman ? 1.1 : 1.0);
      float lz = (abs(h.z) - 0.033) / 0.027, ly = (ey + 0.002) / 0.016;
      if (front && (s & 512) != 0 && (lz * lz + ly * ly < 1.0 || (abs(h.z) < 0.012 && abs(ey - 0.004) < 0.0035))) {
        c = vec3(0.03);
        pedRough = 0.12;
      } else if (front) {
        if ((ez * ez) / 0.00021 + (ey * ey) / 0.000064 < 1.0) c = vec3(0.12, 0.09, 0.07);
        float by = ey - 0.019 + 0.006 * abs(h.z) / 0.06;
        if (abs(h.z) > 0.011 && abs(h.z) < 0.057 && abs(by) < 0.0045) c = hair * 0.85;
      }
    }
    return pow(c, vec3(2.2));
  }
`

// Put the pose (and with colour, the clothes and the face) into a material's shaders
export function posed (shader, colour) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\n' +
        ATTRS +
        HASH +
        POSE +
        (colour ? VARY + LAMP_VERTEX.head : '')
    )
    // (who they are and what each vertex is part of, worked out once)
    .replace(
      'void main() {',
      'void main() {\n  int pedPart = int(aPart + 0.5), pedS = pedStyle(aLook);'
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${
        colour
          ? 'vRest = position; vPedPart = aPart; vPedLook = aLook; vPedStyle = float(pedS);' +
            LAMP_VERTEX.main
          : ''
      }
      transformed = pedPose(transformed, 1.0, pedPart, pedS);`
    )
  if (shader.vertexShader.includes('#include <beginnormal_vertex>'))
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      objectNormal = normalize(pedPose(objectNormal, 0.0, pedPart, pedS) + vec3(0.0, 1e-5, 0.0));`
    )
  if (!colour) return
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\n' + VARY + LAMP_FRAGMENT.head + HASH + DRESS
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      int pedPart = int(vPedPart + 0.5);
      diffuseColor.rgb = pedDress(pedPart, vRest, vPedLook, int(vPedStyle + 0.5));
      if (pedPart == ${P.BROLLY} && pedBrolly(vPedLook) == 2 && pedBayer(gl_FragCoord.xy) < 0.55)
        discard;`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n  roughnessFactor = pedRough;'
    )
    .replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n' + LAMP_FRAGMENT.main
    )
}
