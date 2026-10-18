// The traffic's car shapes, one per type: the body lofted from its lines (carBody.js, the lines in
// carSpecs.js), its glass, and its trim and lamps (carTrim.js, carLamps.js), as three geometries
// (paint, glass, trim) drawn instanced per type (traffic.js). And the paint's material, which cuts
// the wheel arches out of the body, darkens the plastic under the bumpers (and an SUV's sills and
// arch flares), gives each car its own finish (a solid gloss or a metallic, under the clear coat,
// and on some a black roof), and paints the liveries: a police car's white doors and roof, a cab's
// checker band, a bus's white roof and dark skirt.
import { SPECS } from './carSpecs.js'
import { bodyLines, stationsOf, pieceOf, loftIx, mergeIx } from './carBody.js'
import { lampsFor } from './carLamps.js'
import { LAMP, paint as tinted } from './carParts.js'
import { trimFor } from './carTrim.js'

export { SPECS }

// the shape of type T (len, wid from the sim): geometries for the paint, glass and trim, what the
// paint's material needs (arch), and the body's lines (S)
export function carShape (T) {
  const B = bodyLines(SPECS[T.name], T)
  const st = stationsOf(B)
  const g = loftIx(st, pieceOf(B))
  const paint = [g.get('paint')]
  const glass = g.get('glass') ? [g.get('glass')] : []
  const trim = trimFor(T, B, st, paint, glass)
  if (g.get('dark')) trim.push(tinted(g.get('dark'), 0x060708, LAMP.gloss))
  trim.push(...lampsFor(T, B, st))
  const door = B.doors.length
    ? [B.doors[B.doors.length - 1], B.doors[0]]
    : [0, 0]
  return {
    paint: mergeIx(paint),
    glass: mergeIx(glass),
    trim: mergeIx(trim),
    arch: {
      name: T.name,
      axles: B.axles,
      r: B.r + 0.045,
      y: B.r,
      wellIn: B.track - B.tyre / 2 - 0.03,
      L: B.L,
      W: B.W,
      // the dark plastic: a lip under the front bumper, a diffuser under the back one, and along the
      // sills and round the arches of the rugged ones
      valance: [B.bot(B.L) + 0.05, B.bot(-B.L) + 0.11],
      sill: B.sill,
      clad: B.clad ? B.sill + 0.08 : -1,
      flare: !!B.clad,
      rail: Math.min(B.railY(B.dTop), B.railY(0), B.railY(B.rf)),
      roof: [B.dTop - 0.05, B.rf + 0.04],
      crease: B.crease,
      door
    },
    S: B
  }
}

// The paint's material for a type (its shape's arch): see above. Each car's finish comes in aPaint:
// its metallic share (the fraction), and 2 more for a black roof.
export function bodyMaterial (base, A) {
  const m = base.clone()
  const f = v => v.toFixed(3)
  const [a0, a1] = A.axles.map(f)
  const d0 = f(A.door[0] - 0.02),
    d1 = f(A.door[1] + 0.02),
    sill = f(A.sill + 0.06),
    side = f(A.W + 0.01),
    rail = f(A.rail - 0.02),
    c0 = f(A.crease + 0.015),
    c1 = f(A.crease + 0.085),
    ck = f(A.W * 0.75),
    x0 = f(A.door[0] + 0.06),
    x1 = f(A.door[1] - 0.08),
    roof = f(A.rail + 0.02)
  const LIVERY = {
    // white doors (the mirrors on them black) and a white roof
    police: `if (carPart == 0 && ((q.x > ${d0} && q.x < ${d1} && q.y > ${sill} && abs(q.z) < ${side})
      || q.y > ${rail})) carPart = 2;`,
    // a checker band along each side
    taxi: `if (carPart == 0 && abs(q.z) > ${ck} && q.y > ${c0} && q.y < ${c1} && q.x > ${x0} && q.x < ${x1})
      carPart = mod(floor(q.x / 0.035) + floor((q.y - ${c0}) / 0.035), 2.0) < 0.5 ? 3 : 2;`,
    // a white roof over the windows, a dark skirt
    bus: `if (carPart == 0) { if (q.y > ${roof}) carPart = 2; else if (q.y < 0.62) carPart = 5; }`
  }
  const livery = LIVERY[A.name] || ''
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCarPos;\nattribute float aPaint;\nvarying float vPaint;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCarPos = position;\nvPaint = aPaint;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCarPos;\nvarying float vPaint;\nint carPart;'
      )
      .replace(
        'void main() {',
        `void main() {
  // 0 the paint, 1 dark plastic, 2 a livery's white, 3 black (a black roof, a checker), 5 charcoal
  vec3 q = vCarPos;
  carPart = 0;
  {
    vec2 a = vec2(q.x - ${a0}, q.y - ${f(
          A.y
        )}), b = vec2(q.x - ${a1}, q.y - ${f(A.y)});
    float d = sqrt(min(dot(a, a), dot(b, b)));
    bool outer = abs(q.z) > ${f(A.wellIn)};
    if (outer && d < ${f(A.r)}) discard;
    if (q.y < ${f(A.clad)} || (q.x > ${f(A.L - 0.32)} && q.y < ${f(
          A.valance[0]
        )}) || (q.x < ${f(0.32 - A.L)} && q.y < ${f(A.valance[1])})
      || (${A.flare} && outer && d < ${f(A.r + 0.065)} && q.y > ${f(
          A.y - 0.1
        )})) carPart = 1;
    else if (vPaint >= 2.0 && q.y > ${f(A.rail - 0.012)} && q.x > ${f(
          A.roof[0]
        )} && q.x < ${f(A.roof[1])}) carPart = 3;
  }
  ${livery}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if (carPart == 1) diffuseColor.rgb = vec3(0.022, 0.023, 0.025);
  else if (carPart == 2) diffuseColor.rgb = vec3(0.84, 0.85, 0.86);
  else if (carPart == 3) diffuseColor.rgb = vec3(0.008, 0.009, 0.01);
  else if (carPart == 5) diffuseColor.rgb = vec3(0.045, 0.047, 0.05);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  float carMetal = carPart == 0 ? fract(vPaint) : 0.0;
  roughnessFactor = carPart == 1 ? 0.62 : mix(0.4, 0.3, carMetal);`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n  metalnessFactor = carMetal;'
      )
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n  if (carPart == 1) material.clearcoat = 0.0;'
      )
  }
  m.customProgramCacheKey = () => `car body ${A.name}`
  return m
}
