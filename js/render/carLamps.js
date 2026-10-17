// The traffic's lamps, part of each type's trim (carShapes.js): headlight units with a running
// light along their tops and an amber indicator at their outer end, tail clusters with the red lamp, an amber indicator and a white
// reversing lamp, a high-mounted stop lamp, side repeaters on the front wings, a taxi's roof sign and
// a bus's route board. Each lens is a rounded shape in its own coloured glass (a tail light reads red
// by day, unlit) set in a dark housing, and lights from one attribute per car (aLit: headlights,
// tail lights, braking, and flags for the indicators and reversing), so lighting them all costs
// nothing beyond the trim's own draw.
import * as THREE from 'three'

// what each lens is (aLamp), and how it lights
export const LAMP = {
  none: 0,
  head: 1,
  tail: 2,
  stop: 3,
  left: 4,
  right: 5,
  reverse: 6,
  route: 7,
  taxi: 8,
  drl: 9
}
// per type: headlight [width, height, how far in from the side it starts]; tail light [width,
// height]; whether the tail light runs up the corner (a tall one, for hatches, SUVs, vans); the
// high stop lamp: on the tail ('tail') or the back of a pickup's cab ('cab'), and its height
// prettier-ignore
const STYLE = {
  sedan: { head: [0.42, 0.12, 0.1], tail: [0.44, 0.13], stop: null },
  hatch: { head: [0.36, 0.13, 0.1], tail: [0.2, 0.3], tall: true, stop: ['tail', 1.21] },
  suv: { head: [0.4, 0.15, 0.1], tail: [0.22, 0.34], tall: true, stop: ['tail', 1.55] },
  pickup: { head: [0.36, 0.19, 0.12], tail: [0.17, 0.42], tall: true, stop: ['cab', 1.76] },
  van: { head: [0.32, 0.24, 0.1], tail: [0.15, 0.56], tall: true, stop: ['tail', 2.6] },
  bus: { head: [0.36, 0.14, 0.14], tail: [0.22, 0.42], tall: true, stop: ['tail', 2.92] }
}
STYLE.taxi = STYLE.sedan

const LENS = {
  [LAMP.head]: 0xa9b1ba,
  [LAMP.drl]: 0xe6eaee,
  [LAMP.tail]: 0x8a0d10,
  [LAMP.stop]: 0x7a0b0d,
  [LAMP.left]: 0xc77a18,
  [LAMP.right]: 0xc77a18,
  [LAMP.reverse]: 0xd2d4d6,
  [LAMP.route]: 0x1a1408,
  [LAMP.taxi]: 0xf3ecc8
}
const HOUSING = 0x121315

// A rounded rectangle w x h (corner radius r), centred on (u, v) in its own plane, as triangles
function rounded (w, h, r) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2
  r = Math.min(r, w / 2, h / 2)
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(s, 2)
}
// a flat piece facing out along +x or -x (on a car's nose or tail) or +z / -z (on its side)
function piece (geo, face, x, y, z, color, lamp) {
  if (face === 'x+') geo.rotateY(Math.PI / 2)
  else if (face === 'x-') geo.rotateY(-Math.PI / 2)
  else if (face === 'z-') geo.rotateY(Math.PI)
  geo.translate(x, y, z)
  const g = geo.toNonIndexed()
  const n = g.attributes.position.count,
    c = new THREE.Color(color),
    col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const tag = new Float32Array(n).fill(lamp)
  g.setAttribute('aLamp', new THREE.BufferAttribute(tag, 1))
  g.deleteAttribute('uv')
  return g
}
// a lens in its housing: the housing a little bigger, a hair behind
function unit (out, face, x, y, z, w, h, lamp, r = 0.035) {
  const out1 = face[1] === '+' ? 1 : -1
  const along = face[0] === 'x'
  const back = (d, a, b) => (along ? [a + out1 * d, y, b] : [a, y, b + out1 * d])
  const [hx, , hz] = back(0.003, x, z)
  const housing = rounded(w + 0.04, h + 0.035, r + 0.015)
  out.push(piece(housing, face, hx, y, hz, HOUSING, LAMP.none))
  const [lx, , lz] = back(0.007, x, z)
  out.push(piece(rounded(w, h, r), face, lx, y, lz, LENS[lamp], lamp))
}

// how far out from the middle the headlights start (the grille stops short of them)
export function headInner (T, hw) {
  const [w, , inset] = STYLE[T.name].head
  return hw - 0.15 - inset - w
}

// The lamps for type T (S: its shape spec, L: half length, hw: half width)
export function lampsFor (T, S, L, hw) {
  const st = STYLE[T.name],
    out = []
  const [hwid, hh, hin] = st.head
  const [tw, th] = st.tail
  for (const s of [-1, 1]) {
    const ind = s < 0 ? LAMP.left : LAMP.right
    // headlight: the lamp, its indicator at the outer end
    const zo = hw - 0.15 - hin // (the outer edge, clear of the rounded corner)
    const zc = s * (zo - hwid / 2)
    unit(out, 'x+', L, S.lights[0], zc, hwid, hh, LAMP.head)
    // its running light: a strip along the lamp's top, lit day and night
    const drl = rounded(hwid * 0.86, 0.022, 0.01)
    const dy = S.lights[0] + hh / 2 - 0.022
    out.push(piece(drl, 'x+', L + 0.0095, dy, zc, LENS[LAMP.drl], LAMP.drl))
    const iw = Math.min(0.09, hwid * 0.22)
    out.push(
      piece(
        rounded(iw, hh * 0.72, 0.02),
        'x+',
        L + 0.009,
        S.lights[0],
        s * (zo - iw / 2 - 0.012),
        LENS[ind],
        ind
      )
    )
    // a side repeater on the front wing, behind the wheel
    const rx = S.axles[0] - S.r - 0.3,
      rep = rounded(0.07, 0.025, 0.012)
    const face = s > 0 ? 'z+' : 'z-'
    out.push(piece(rep, face, rx, S.belt - 0.2, s * (hw + 0.004), LENS[ind], ind))
    // tail light: wide and low (a saloon's) or tall up the corner; indicator outboard, reversing
    // lamp inboard
    const ty = st.tall ? S.lights[1] + th / 2 - 0.06 : S.lights[1]
    const tz = s * (hw - 0.17 - tw / 2)
    unit(out, 'x-', -L, ty, tz, tw, th, LAMP.tail, 0.03)
    const seg = (frac, at, lamp) => {
      const w = st.tall ? tw * 0.8 : tw * frac,
        h = st.tall ? th * frac : th * 0.7
      const z = st.tall ? tz : tz + s * at * (tw / 2 - w / 2)
      const y = st.tall ? ty + at * (th / 2 - h / 2) : ty
      out.push(piece(rounded(w, h, 0.018), 'x-', -L - 0.0095, y, z, LENS[lamp], lamp))
    }
    seg(0.24, 1, ind) // (outboard, or at the top of a tall one)
    seg(0.22, -1, LAMP.reverse) // (inboard, or at the bottom)
  }
  // the high-mounted stop lamp
  if (st.stop) {
    const [where, y] = st.stop
    const x = where === 'cab' ? S.rw - 0.012 : -L - 0.009
    const stop = rounded(0.34, 0.035, 0.015)
    out.push(piece(stop, 'x-', x, y, 0, LENS[LAMP.stop], LAMP.stop))
  }
  if (T.name === 'taxi') {
    // the roof sign, lit
    const sign = new THREE.BoxGeometry(0.26, 0.13, 0.56)
    out.push(piece(sign, 'none', -0.2, S.roof + 0.06, 0, LENS[LAMP.taxi], LAMP.taxi))
  }
  if (T.name === 'bus') {
    // the route board over the windscreen, and the route number at the back
    const front = rounded(1.7, 0.24, 0.02),
      back = rounded(0.5, 0.2, 0.02)
    out.push(piece(front, 'x+', L + 0.008, 2.83, 0, LENS[LAMP.route], LAMP.route))
    out.push(piece(back, 'x-', -L - 0.008, 2.75, 0, LENS[LAMP.route], LAMP.route))
  }
  return out
}

// The trim's material, lit where its lamps are: aLit per car (x headlights, y tail lights, z
// braking, w flags: 1 left indicator, 2 right, 4 reversing, 8 route board lit, 16 running lights)
const GLOW = `
  attribute float aLamp;
  attribute vec4 aLit;
  varying vec3 vGlow;
`
export function lampMaterial (base) {
  const m = base.clone()
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLOW)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          int lamp = int(aLamp + 0.5), flags = int(aLit.w + 0.5);
          vec3 g = vec3(0.0);
          if (lamp == 1) g = vec3(1.0, 0.95, 0.86) * aLit.x;
          else if (lamp == 2) g = vec3(1.0, 0.05, 0.03) * (aLit.y + 3.6 * aLit.z);
          else if (lamp == 3) g = vec3(1.0, 0.05, 0.03) * 4.0 * aLit.z;
          else if (lamp == 4) g = vec3(1.0, 0.4, 0.04) * ((flags & 1) != 0 ? 3.2 : 0.0);
          else if (lamp == 5) g = vec3(1.0, 0.4, 0.04) * ((flags & 2) != 0 ? 3.2 : 0.0);
          else if (lamp == 6) g = vec3(1.0, 1.0, 0.96) * ((flags & 4) != 0 ? 2.4 : 0.0);
          else if (lamp == 7) g = vec3(1.0, 0.55, 0.08) * ((flags & 8) != 0 ? 2.2 : 0.0);
          else if (lamp == 8) g = vec3(1.0, 0.86, 0.45) * (0.08 + 0.3 * aLit.x);
          else if (lamp == 9) g = vec3(0.92, 0.96, 1.0) * ((flags & 16) != 0 ? 1.7 : 0.0);
          vGlow = g;
        }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;'
      )
  }
  m.customProgramCacheKey = () => 'traffic lamps'
  return m
}
