// The traffic's car bodies, lofted like the Roadster (loft.js): a rounded body that tucks in at the
// bumpers, a cabin that narrows above the beltline, glass for the windshield, side and rear windows,
// a painted roof, wheel arches cut into the body over dark wheel wells, and the trim (bumpers, grille,
// mirrors, plates, handles) baked in vertex colours. One shape per traffic type.
import * as THREE from 'three'
import { loftGeos } from './loft.js'
import { merge, box, tint } from './geo.js'

// Per type: floor and sill heights, the beltline, hood (at the cowl) and nose heights, the deck and
// tail heights, the roof, and along x the windshield's foot (ws), the roof's front (rf) and back (rr)
// and the rear window's foot (rw); the wheel radius and axles; the head and tail lights' height;
// sideGlass: where the side windows run (x from, to), when not the whole cabin.
// prettier-ignore
export const SPECS = {
  sedan: { floor: 0.2, sill: 0.34, belt: 0.95, hood: 0.88, nose: 0.74, deck: 0.98, tail: 0.86, roof: 1.45, ws: 0.95, rf: 0.12, rr: -0.95, rw: -1.6, r: 0.33, axles: [1.42, -1.42], lights: [0.68, 0.82] },
  hatch: { floor: 0.2, sill: 0.34, belt: 0.96, hood: 0.88, nose: 0.74, deck: 1.0, tail: 0.92, roof: 1.48, tailRoof: 1.28, ws: 0.82, rf: 0.0, rr: -1.55, rw: -2.1, r: 0.31, axles: [1.3, -1.28], lights: [0.7, 0.9] },
  suv: { floor: 0.3, sill: 0.46, belt: 1.1, hood: 1.04, nose: 0.92, deck: 1.12, tail: 1.06, roof: 1.73, ws: 1.18, rf: 0.38, rr: -1.95, rw: -2.3, r: 0.38, axles: [1.48, -1.45], lights: [0.88, 1.02] },
  pickup: { floor: 0.36, sill: 0.5, belt: 1.15, hood: 1.12, nose: 1.0, deck: 1.16, tail: 1.12, roof: 1.84, ws: 1.25, rf: 0.55, rr: -0.62, rw: -0.72, r: 0.4, axles: [1.75, -1.8], lights: [0.96, 1.0] },
  van: { floor: 0.38, sill: 0.52, belt: 1.2, hood: 1.18, nose: 1.0, deck: 2.66, tail: 2.6, roof: 2.74, tailRoof: 2.7, ws: 2.6, rf: 1.75, rr: -9, rw: -9, r: 0.4, axles: [2.15, -2.2], lights: [1.0, 1.1], sideGlass: [1.25, 2.6] },
  bus: { floor: 0.36, sill: 0.5, belt: 1.75, hood: 1.45, nose: 1.4, deck: 3.0, tail: 2.96, roof: 3.12, tailRoof: 3.08, ws: 5.75, rf: 5.62, rr: -9, rw: -9, r: 0.5, axles: [3.65, -3.45], lights: [0.75, 0.9], inset: 0.04 }
}
SPECS.taxi = SPECS.sedan

// a station's half section: floor centre, floor edge, sill, widest point, shoulder, then the glass's
// foot, the roof's edge and its crown (or, with no cabin, the hood or deck surface)
function section (w, floor, sill, belt, cab, inset, top = belt) {
  const p = [
    [0, floor],
    [w - 0.12, floor],
    [w - 0.02, sill],
    [w, belt - 0.16],
    [w - 0.035, belt]
  ]
  if (cab)
    p.push(
      [w - 0.05 - inset * 0.2, belt + 0.02],
      [w - 0.05 - inset, belt + 0.02 + (cab - belt - 0.02) * 0.92],
      [0, cab]
    )
  else p.push([w * 0.8, top + 0.012], [w * 0.4, top + 0.024], [0, top + 0.03])
  return p
}

// the shape of type T (len, wid from the sim): geometries for the paint, glass and trim, and the
// wheel arches to cut
export function carShape (T) {
  const S = SPECS[T.name],
    L = T.len / 2,
    hw = T.wid / 2,
    inset = S.inset ?? 0.24
  const st = []
  const add = (x, w, floor, sill, belt, cab, top) =>
    st.push({ x, p: section(w, floor, sill, belt, cab, inset, top) })
  // tail, round the cabin, nose. The cabin's ends collapse onto the deck and the cowl, so the
  // windshield and rear window are the roof's slopes down to them; a hatchback's, van's or bus's
  // roof runs right back to the tail.
  const { floor, sill, belt, roof } = S
  if (S.rw < -L + 0.25) {
    add(-L, hw - 0.1, floor + 0.08, sill + 0.04, belt, S.tailRoof)
    add(-L + 0.12, hw - 0.02, floor, sill, belt, S.tailRoof)
    if (S.rr > -L + 0.2) add(S.rr, hw, floor, sill, belt, roof)
  } else {
    add(-L, hw - 0.14, floor + 0.12, sill + 0.06, S.tail - 0.04, 0)
    add(-L + 0.16, hw - 0.03, floor + 0.02, sill, S.deck, 0)
    add(S.rw, hw, floor, sill, belt, belt + 0.05)
    add(S.rr, hw, floor, sill, belt, roof)
  }
  add(S.rf, hw, floor, sill, belt, roof)
  add(S.ws, hw, floor, sill, belt, belt + 0.05)
  if (S.ws < L - 0.25) add(L - 0.2, hw - 0.03, floor + 0.02, sill, S.nose, 0)
  add(L, hw - 0.15, floor + 0.1, sill + 0.04, S.nose - 0.06, 0)
  const side = S.sideGlass || [S.rw, S.ws]
  const keyFor = (j, xA, xB) => {
    const x = (xA + xB) / 2
    if (j === 0) return 'under'
    if (j === 5) return x > side[0] && x < side[1] ? 'glass' : 'paint'
    if (j === 6)
      return (x > S.rf && x < S.ws) || (x < S.rr && x > S.rw)
        ? 'glass'
        : 'paint'
    return 'paint'
  }
  const g = loftGeos(st, keyFor, 'paint', 30)
  const trim = trimFor(T, S, L, hw)
  trim.push(tint(g.get('under'), 0x16171a))
  return {
    paint: g.get('paint'),
    glass: g.get('glass') || box(0, 0, 0, 0.01, 0.01, 0.01),
    trim: merge(trim),
    arch: { axles: S.axles, r: S.r + 0.07, y: S.r, wellIn: hw - 0.28 },
    S
  }
}

// bumpers, grille, mirrors, plates, door handles, dark wheel wells, and the taxi's roof sign and the
// bus's doors and destination board, as vertex-coloured boxes
function trimFor (T, S, L, hw) {
  const dark = 0x1d1e21,
    black = 0x0d0e10
  const parts = []
  const put = (c, ...b) => parts.push(tint(box(...b), c))
  const yb = S.floor + 0.04
  put(dark, L - 0.12, yb, -hw + 0.1, L + 0.04, yb + 0.24, hw - 0.1) // front bumper
  put(dark, -L - 0.04, yb, -hw + 0.1, -L + 0.12, yb + 0.24, hw - 0.1) // rear bumper
  put(
    black,
    L - 0.02,
    yb + 0.25,
    -hw * 0.45,
    L + 0.02,
    S.lights[0] + 0.02,
    hw * 0.45
  ) // grille
  put(0xe8e8e2, L + 0.03, yb + 0.06, -0.24, L + 0.05, yb + 0.17, 0.24) // plates
  put(0xe8e8e2, -L - 0.05, yb + 0.1, -0.24, -L - 0.03, yb + 0.21, 0.24)
  for (const s of [-1, 1]) {
    // mirrors at the foot of the A-pillars
    const mx = S.ws - 0.12,
      my = S.belt + 0.06
    put(black, mx - 0.08, my, s * hw, mx + 0.06, my + 0.11, s * (hw + 0.16))
    // door handles
    for (const x of T.name === 'bus'
      ? []
      : [S.rf + 0.1, (S.rf + S.rr) / 2 - 0.1])
      put(
        black,
        x - 0.08,
        S.belt - 0.12,
        s * (hw - 0.01),
        x + 0.08,
        S.belt - 0.09,
        s * (hw + 0.012)
      )
    // the wheel wells: an inner wall and a dark roof over each wheel
    for (const ax of S.axles) {
      const r = S.r + 0.07
      parts.push(
        tint(
          box(
            ax - r,
            S.floor,
            s * (hw - 0.3),
            ax + r,
            S.r + r,
            s * (hw - 0.28)
          ),
          black
        )
      )
      const arc = new THREE.CylinderGeometry(
        r,
        r,
        0.3,
        14,
        1,
        true,
        Math.PI * 0.5,
        Math.PI
      )
        .rotateX(Math.PI / 2)
        .translate(ax, S.r, s * (hw - 0.14))
      parts.push(tint(arc, black))
    }
  }
  if (T.name === 'taxi')
    put(0xf6f1d8, -0.45, S.roof - 0.02, -0.3, 0.15, S.roof + 0.2, 0.3)
  if (T.name === 'bus') {
    put(black, L - 0.02, 2.75, -hw + 0.2, L + 0.02, 2.98, hw - 0.2) // destination board
    put(0x202428, 3.6, 0.45, hw - 0.01, 4.6, 2.65, hw + 0.012) // front door
    put(0x202428, -1.0, 0.45, hw - 0.01, 0.0, 2.65, hw + 0.012) // middle door
  }
  return parts
}

// a body material that cuts the arches: anything outboard of the wheel wells within reach of a
// wheel is discarded, so the wheels show in open arches
export function archMaterial (base, arch) {
  const m = base.clone()
  const [a0, a1] = arch.axles.map(a => a.toFixed(3))
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCarPos = position;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
      .replace(
        'void main() {',
        `void main() {
  if (abs(vCarPos.z) > ${arch.wellIn.toFixed(3)}) {
    float dy = vCarPos.y - ${arch.y.toFixed(3)};
    vec2 a = vec2(vCarPos.x - ${a0}, dy), b = vec2(vCarPos.x - ${a1}, dy);
    if (min(dot(a, a), dot(b, b)) < ${(arch.r * arch.r).toFixed(4)}) discard;
  }`
      )
  }
  m.customProgramCacheKey = () => `arches ${a0} ${a1} ${arch.r} ${arch.wellIn}`
  return m
}
