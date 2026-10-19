// The traffic's lamps, part of each type's trim (carShapes.js), the way today's cars have them:
// slim headlight units that wrap round the corners of the nose, a dark housing behind a clear lens
// with a running-light strip along the top and the indicator at the outer end; tail lights that wrap
// round the corners of the tail, with the indicator outboard and the reversing lamp inboard, joined
// on some by a light bar across the back; a high stop lamp; the amber and red side markers American
// cars carry at their corners; a cab's roof sign, a bus's route board, a police light bar and the
// warning lamps of an ambulance and a fire engine (carRigs.js); and a lowrider's round lamps, four
// in front and three a side behind, in chrome rings. Each lens is its own coloured glass (a tail
// light reads red by day, unlit), tagged with what it is (aLamp, carParts.js), and lit per car from
// one attribute (aLit: headlights, tail lights, braking, and flags for the indicators, reversing,
// the route board, the running lights and the warning lamps, with their phase in the flags'
// fraction), so lighting them all costs nothing beyond the trim's draw. The tags also mark the
// trim's chrome, gloss black and brushed aluminium, which the same material gives their shine, and
// a box truck's roller door, which it runs up.
import {
  LAMP,
  LENS,
  CHROME,
  wrap,
  piece,
  rounded,
  onTop,
  disc
} from './carParts.js'

export { LAMP, LENS }
const HOUSING = 0x0c0d0f

// Per type: head and tail, each { z0: where it starts on the end face, d: how far round the side
// it reaches (m from the end; 0 for a lamp on the face only, out to z1, and at x if the face is set
// back from the end), yb, yt: its bottom and top at the inner and outer ends }; bar: a light bar
// across the tail [bottom, top]; mark: the side markers' height; stop: the high stop lamp, on the
// top of the rear window ('glass') or on the back at a height; round: round lamps instead, each
// [z, y, radius] on one side
// prettier-ignore
const STYLE = {
  sedan: {
    head: { z0: 0.34, d: 0.42, yb: [0.665, 0.715], yt: [0.73, 0.762] },
    tail: { z0: 0.3, d: 0.3, yb: [0.872, 0.872], yt: [0.95, 0.94] },
    bar: [0.9, 0.922], mark: 0.56, stop: 'glass'
  },
  hatch: {
    head: { z0: 0.32, d: 0.4, yb: [0.665, 0.71], yt: [0.735, 0.762] },
    tail: { z0: 0.38, d: 0.26, yb: [0.86, 0.88], yt: [0.985, 0.97] },
    mark: 0.56, stop: 'glass'
  },
  suv: {
    head: { z0: 0.4, d: 0.42, yb: [0.835, 0.885], yt: [0.9, 0.935] },
    tail: { z0: 0.44, d: 0.26, yb: [1.0, 1.02], yt: [1.09, 1.1] },
    bar: [1.045, 1.065], mark: 0.68, stop: 'glass'
  },
  taxi: {
    head: { z0: 0.3, d: 0.52, yb: [0.6, 0.665], yt: [0.655, 0.715] },
    tail: { z0: 0.42, d: 0.3, yb: [0.84, 0.9], yt: [0.975, 0.99] },
    mark: 0.52, stop: 'glass'
  },
  pickup: {
    head: { z0: 0.5, d: 0.2, yb: [0.98, 1.0], yt: [1.15, 1.15] },
    tail: { z0: 0.83, d: 0.05, yb: [0.84, 0.84], yt: [1.22, 1.22] },
    mark: 0.85, stop: 'glass'
  },
  van: {
    head: { z0: 0.55, d: 0.32, yb: [0.8, 0.95], yt: [0.98, 1.08] },
    tail: { z0: 0.84, d: 0.04, yb: [0.56, 0.56], yt: [1.3, 1.3] },
    mark: 0.7, stop: 2.62
  },
  bus: {
    head: { z0: 0.82, z1: 1.12, d: 0, yb: [0.48, 0.48], yt: [0.6, 0.6] },
    tail: { z0: 0.86, z1: 1.13, d: 0, yb: [0.6, 0.6], yt: [1.0, 1.0] },
    mark: 0.7, stop: 2.92
  },
  police: {
    head: { z0: 0.42, d: 0.42, yb: [0.835, 0.885], yt: [0.9, 0.935] },
    tail: { z0: 0.46, d: 0.26, yb: [1.0, 1.02], yt: [1.09, 1.1] },
    mark: 0.68, stop: 'glass'
  },
  sports: {
    head: { z0: 0.36, d: 0.46, yb: [0.545, 0.6], yt: [0.6, 0.64] },
    tail: { z0: 0.5, d: 0.34, yb: [0.815, 0.835], yt: [0.86, 0.875] },
    bar: [0.83, 0.85], mark: 0.45, stop: 'glass'
  },
  ambulance: {
    head: { z0: 0.56, d: 0.16, yb: [1.0, 1.02], yt: [1.2, 1.2] },
    tail: { z0: 0.88, d: 0.03, yb: [0.82, 0.82], yt: [1.42, 1.42] },
    mark: 0.95, stop: 2.62
  },
  fire: {
    head: { x: 4.866, z0: 0.62, z1: 1.0, d: 0, yb: [1.12, 1.12], yt: [1.36, 1.36] },
    tail: { z0: 0.82, z1: 1.16, d: 0, yb: [0.78, 0.78], yt: [1.32, 1.32] },
    mark: 0.82, stop: 2.3
  },
  truck: {
    head: { x: 4.925, z0: 0.62, z1: 0.98, d: 0, yb: [0.9, 0.9], yt: [1.08, 1.08] },
    tail: { z0: 0.96, z1: 1.2, d: 0, yb: [1.2, 1.2], yt: [1.5, 1.5] },
    mark: 1.4, stop: 3.63
  },
  lowrider: {
    round: { head: [[0.58, 0.66, 0.072], [0.77, 0.66, 0.072]], tail: [[0.45, 0.7, 0.062], [0.6, 0.7, 0.062], [0.75, 0.7, 0.062]] },
    mark: 0.5, stop: 'glass'
  },
  limo: {
    head: { z0: 0.42, d: 0.2, yb: [0.68, 0.68], yt: [0.8, 0.8] },
    tail: { z0: 0.32, d: 0.15, yb: [0.78, 0.78], yt: [0.94, 0.94] },
    bar: [0.84, 0.88], mark: 0.6, stop: 'glass'
  }
}

// (a lamp's outline let out by k all round: its housing)
const grow = (o, k) => ({
  ...o,
  yb: o.yb.map(y => y - k),
  yt: o.yt.map(y => y + k),
  z0: o.z0 - (o.z1 !== undefined ? k : 0),
  z1: o.z1 !== undefined ? o.z1 + k : undefined
})

// The lamps for type T on its body (stations st, lines B)
export function lampsFor (T, B, st) {
  const S = STYLE[T.name],
    out = []
  const L = B.L
  if (S.round) round(S.round, B, out)
  else strips(S, st, out)
  // side markers: amber at the front corners, red at the back
  const m = S.mark
  // prettier-ignore
  wrap(st, 1, { side: [L - 0.3, L - 0.18], yb: [m, m], yt: [m + 0.035, m + 0.035] }, [[0, 1, null, LAMP.markFront]], 0.005, out)
  // prettier-ignore
  wrap(st, -1, { side: [-L + 0.16, -L + 0.28], yb: [m + 0.25, m + 0.25], yt: [m + 0.285, m + 0.285] }, [[0, 1, null, LAMP.markRear]], 0.005, out)
  // the high stop lamp: at the top of the rear window, or high on the back
  const stop = LENS[LAMP.stop]
  if (S.stop === 'glass') {
    // (a strip 4.5 cm deep down the glass, however steep it is)
    const x0 = B.rr - 0.03
    let x1 = x0
    while (x1 > B.rw && Math.hypot(x0 - x1, B.top(x0) - B.top(x1)) < 0.045)
      x1 -= 0.002
    out.push(onTop(B, x0, x1, 0.16, 0.012, stop, LAMP.stop))
  } else {
    const g = rounded(0.36, 0.04, 0.015)
    out.push(piece(g, 'x-', -L - 0.01, S.stop, 0, stop, LAMP.stop))
  }
  if (T.name === 'bus') {
    // the route board over the windscreen, and the route number at the back
    const route = LENS[LAMP.route]
    const front = rounded(1.7, 0.24, 0.02),
      back = rounded(0.5, 0.2, 0.02)
    out.push(piece(front, 'x+', B.rf + 0.03, 2.78, 0, route, LAMP.route))
    out.push(piece(back, 'x-', -L - 0.012, 2.75, 0, route, LAMP.route))
  }
  return out
}
// the head and tail light units of today's cars, wrapped round the corners (S: the type's STYLE)
function strips (S, st, out) {
  const { head, tail } = S
  // headlights: a dark housing, the lens, the running light along its top, the indicator outboard
  const ind = head.d ? 0.84 : 0.8
  wrap(st, 1, grow(head, 0.014), [[0, 1, HOUSING, LAMP.none]], 0.004, out)
  // prettier-ignore
  wrap(st, 1, head, [[0, ind, null, LAMP.head], [ind, 1, null, 'ind']], 0.008, out)
  const drl = {
    ...head,
    yb: head.yt.map(y => y - 0.016),
    yt: head.yt.map(y => y - 0.004)
  }
  wrap(st, 1, drl, [[0.02, ind - 0.02, null, LAMP.drl]], 0.011, out)
  // tail lights: the reversing lamp inboard, the red lamp, the indicator outboard
  wrap(st, -1, grow(tail, 0.012), [[0, 1, HOUSING, LAMP.none]], 0.004, out)
  // prettier-ignore
  wrap(st, -1, tail, [[0, 0.2, null, LAMP.reverse], [0.2, 0.8, null, LAMP.tail], [0.8, 1, null, 'ind']], 0.008, out)
  // a light bar across the back, between them
  if (S.bar) {
    const [y0, y1] = S.bar
    const o = { z0: -tail.z0, z1: tail.z0, d: 0, yb: [y0, y0], yt: [y1, y1] }
    // prettier-ignore
    wrap(st, -1, grow(o, 0.008), [[0, 1, HOUSING, LAMP.none]], 0.004, out, false)
    wrap(st, -1, o, [[0, 1, null, LAMP.tail]], 0.008, out, false)
  }
}
// A lowrider's round lamps in chrome rings (R: { head, tail }): the headlights two a side, the tail
// lights three a side (the inner one the reversing lamp), with the parking lamps and the indicators
// down in the bumpers
function round (R, B, out) {
  const L = B.L
  const lamp = (face, x, y, z, r, tag) => {
    const f = face === 'x+' ? 1 : -1
    out.push(piece(disc(r + 0.016, 10), face, x, y, z, CHROME, LAMP.chrome))
    out.push(piece(disc(r, 10), face, x + f * 0.003, y, z, LENS[tag], tag))
  }
  for (const s of [-1, 1]) {
    for (const [z, y, r] of R.head)
      lamp('x+', L + 0.004, y, s * z, r, LAMP.head)
    R.tail.forEach(([z, y, r], i) =>
      lamp('x-', -L - 0.004, y, s * z, r, i ? LAMP.tail : LAMP.reverse)
    )
    // the parking lamps (lit as running lights) and the indicators, in the bumpers
    const ind = s > 0 ? LAMP.right : LAMP.left
    // prettier-ignore
    out.push(piece(rounded(0.16, 0.05, 0.012), 'x+', L + 0.09, 0.43, s * 0.55, LENS[LAMP.drl], LAMP.drl))
    // prettier-ignore
    out.push(piece(rounded(0.1, 0.05, 0.012), 'x+', L + 0.09, 0.43, s * 0.74, LENS[ind], ind))
    // prettier-ignore
    out.push(piece(rounded(0.12, 0.04, 0.01), 'x-', -L - 0.09, 0.42, s * 0.62, LENS[ind], ind))
  }
}

// The trim's material, lit where its lamps are: aLit per car (x headlights, y tail lights, z
// braking, w flags: 1 left indicator, 2 right, 4 reversing, 8 route board lit, 16 running lights,
// 32 the light bar or the warning lamps flashing, 64 on a call (brighter as it gets dark), 128 a
// box truck's door up, and in the fraction the bar's phase, or how far up the door is). Lenses are
// glassy; chrome shines, gloss black is glossy, and brushed aluminium (a fire engine's shutters, a
// box truck's door, with their slats) has a satin sheen. The warning lamps flash red and blue (or
// red and white) by turns, each a double flash, and amber at a steady blink of its own.
// The types with warning lamps: the share of them flashing when not on a call, and the colour the
// second of their flashes throws on the road at night (the first is red)
export const BARS = {
  police: { off: 0.36, glow: [0.06, 0.2, 1] },
  ambulance: { off: 0, glow: [1, 0.92, 0.85] },
  fire: { off: 0, glow: [1, 0.92, 0.85] }
}
export const LAMP_T = { value: 0 } // (the traffic's clock, for the light bars)
export const LAMP_DARK = { value: 0 } // (how dark it is, 0 to 1)
const GLOW = `
  attribute float aLamp;
  attribute vec4 aLit;
  uniform float uLampT;
  uniform float uLampDark;
  varying vec3 vGlow;
  varying float vTag;
  varying float vSlat;
`
export function lampMaterial (base) {
  const m = base.clone()
  m.onBeforeCompile = shader => {
    shader.uniforms.uLampT = LAMP_T
    shader.uniforms.uLampDark = LAMP_DARK
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLOW)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          int lamp = int(aLamp + 0.5), flags = int(floor(aLit.w));
          vec3 g = vec3(0.0);
          if (lamp == 1) g = vec3(1.0, 0.96, 0.9) * aLit.x;
          else if (lamp == 2) g = vec3(1.0, 0.04, 0.03) * (aLit.y + 3.6 * aLit.z);
          else if (lamp == 3) g = vec3(1.0, 0.04, 0.03) * 4.0 * aLit.z;
          else if (lamp == 4) g = vec3(1.0, 0.42, 0.04) * ((flags & 1) != 0 ? 3.2 : 0.0);
          else if (lamp == 5) g = vec3(1.0, 0.42, 0.04) * ((flags & 2) != 0 ? 3.2 : 0.0);
          else if (lamp == 6) g = vec3(1.0, 1.0, 0.96) * ((flags & 4) != 0 ? 2.4 : 0.0);
          else if (lamp == 7) g = vec3(1.0, 0.55, 0.08) * ((flags & 8) != 0 ? 2.2 : 0.0);
          else if (lamp == 8) g = vec3(1.0, 0.86, 0.45) * (0.08 + 0.3 * aLit.x);
          else if (lamp == 9) g = vec3(0.92, 0.96, 1.0) * ((flags & 16) != 0 ? 1.8 : 0.0);
          else if (lamp == 10 || lamp == 11 || lamp == 14 || lamp == 15) {
            // the warning lamps: red, and blue or white, by turns, each a double flash, amber at a
            // steady blink (on a call, brighter as it gets dark)
            float q = fract(uLampT * 1.5 + fract(aLit.w));
            float on = (flags & 32) != 0 ? 1.0 : 0.0;
            if ((flags & 64) != 0) on *= 1.0 + 1.4 * uLampDark;
            float a = step(q, 0.1) + step(0.18, q) * step(q, 0.28);
            float b = step(0.5, q) * step(q, 0.6) + step(0.68, q) * step(q, 0.78);
            if (lamp == 10) g = vec3(1.0, 0.03, 0.02) * 7.0 * on * a;
            else if (lamp == 11) g = vec3(0.08, 0.22, 1.0) * 9.0 * on * b;
            else if (lamp == 14) g = vec3(1.0, 0.95, 0.88) * 5.0 * on * b;
            else g = vec3(1.0, 0.42, 0.03) * 6.0 * on * step(fract(q + 0.25), 0.5);
          }
          else if (lamp == 12 || lamp == 16) g = vec3(1.0, 0.45, 0.05) * 0.5 * aLit.x;
          else if (lamp == 13 || lamp == 17) g = vec3(1.0, 0.04, 0.03) * aLit.y;
          // a box truck's roller door, run up into the top of its opening (the opening's height in
          // the tag's fraction, a tenth of it)
          if (lamp == 22 && (flags & 128) != 0) {
            float top = fract(aLamp) * 10.0;
            transformed.y = mix(transformed.y, top - (top - transformed.y) * 0.05, fract(aLit.w));
          }
          vGlow = g;
          vTag = aLamp;
          vSlat = position.y;
        }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGlow;
        varying float vTag;
        varying float vSlat;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // (a roller door's and a shutter's slats, a groove every 5.5 cm: faded to their average
        // where the grooves come closer together than the pixels, so they don't shimmer)
        float slatU = vSlat * 18.0,
          slatFar = clamp(fwidth(slatU) * 2.5, 0.0, 1.0);
        float slat = (vTag > 21.5 && vTag < 22.5) || vTag > 23.5
          ? mix(smoothstep(0.78, 0.86, fract(slatU)), 0.13, slatFar) : 0.0;
        diffuseColor.rgb *= 1.0 - 0.45 * slat;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if (vTag > 0.5 && vTag < 17.5) roughnessFactor = 0.12;
        else if (vTag > 19.5 && vTag < 20.5) roughnessFactor = 0.16;
        else if (vTag > 20.5 && vTag < 21.5) roughnessFactor = 0.2;
        else if (vTag > 21.5 && vTag < 22.5) roughnessFactor = 0.45 + 0.3 * slat;
        else if (vTag > 22.5) roughnessFactor = 0.34 + 0.3 * slat;`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        if (vTag > 19.5 && vTag < 20.5) metalnessFactor = 1.0;
        else if (vTag > 22.5) metalnessFactor = 0.85;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;'
      )
  }
  m.customProgramCacheKey = () => 'traffic lamps'
  return m
}
