// Along the kerb (the sim lays it out: kerbside.js): the power lines strung from one wooden pole to
// the next along Mid-City's and Venice's streets and over their junctions, three on the crossarm and
// a cable lower down, each sagging between its poles (lines a pixel wide, as thin wires look from
// the street); and the bus benches, hydrants and litter bins on the pavements, merged into one mesh.
// A pole knocked down takes its wires with it; the city standing back up restrings them.
import * as THREE from 'three'
import { LAMPS, WIRES, DECOR } from '../sim/city.js'
import { Builder } from './builder.js'
import { pose } from './fallers.js'

// where the wires hang from, in a pole's frame (x out over the road, y up): the crossarm's ends and
// middle, and the cable below
export const WIRE_AT = [
  [-0.85, 10.5],
  [0.15, 10.5],
  [1.15, 10.5],
  [0.15, 8.95]
]
const SEGS = 8

export class Wires {
  constructor (group) {
    const P = []
    this.of = new Map() // lamp -> [from, to) vertex ranges of the spans hung from it
    for (const [i, j] of WIRES) {
      const a = LAMPS[i],
        b = LAMPS[j]
      const span = Math.hypot(b.x - a.x, b.z - a.z),
        sag = 0.25 + 0.0006 * span * span
      const from = P.length / 3
      for (const [x, y] of WIRE_AT) {
        const ax = a.x + a.ax * x,
          az = a.z + a.az * x,
          bx = b.x + b.ax * x,
          bz = b.z + b.az * x
        for (let s = 0; s < SEGS; s++)
          for (const t of [s / SEGS, (s + 1) / SEGS])
            P.push(
              ax + (bx - ax) * t,
              y - sag * 4 * t * (1 - t),
              az + (bz - az) * t
            )
      }
      const to = P.length / 3
      for (const k of [i, j]) {
        if (!this.of.has(k)) this.of.set(k, [])
        this.of.get(k).push([from, to])
      }
    }
    const g = new THREE.BufferGeometry()
    this.pos = new THREE.Float32BufferAttribute(P, 3)
    this.saved = Float32Array.from(P)
    g.setAttribute('position', this.pos)
    g.computeBoundingSphere()
    this.lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0x17181a })
    )
    this.lines.name = 'wires'
    group.add(this.lines)
  }
  // a pole knocked down: its wires come down with it (out of sight)
  cut (i) {
    for (const [from, to] of this.of.get(i) || [])
      for (let v = from; v < to; v++) this.pos.setXYZ(v, 0, -100, 0)
    this.pos.needsUpdate = true
  }
  restore () {
    this.pos.array.set(this.saved)
    this.pos.needsUpdate = true
  }
}

// ---------- benches, hydrants, bins ----------
// (each kept to a few dozen triangles: there are six hundred of them, all in one mesh)
const box = (x0, y0, z0, x1, y1, z1) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2
  )
const C = hex => new THREE.Color().setHex(hex)
// a can or a post: open at the bottom, its top a cone
const can = (r0, r1, h, top, n) => [
  new THREE.CylinderGeometry(r1, r0, h, n, 1, true).translate(0, h / 2, 0),
  new THREE.ConeGeometry(r1, top, n, 1, true).translate(0, h + top / 2, 0)
]
// each piece: [geometry, colour], in the item's frame (x towards the road, y up)
export const PIECES = {
  // an LA bus bench: concrete legs, a slatted seat, its back a board for an advert
  bench: [
    [box(-0.25, 0, -0.86, 0.25, 0.42, -0.74), C(0x9a958c)],
    [box(-0.25, 0, 0.74, 0.25, 0.42, 0.86), C(0x9a958c)],
    [box(-0.3, 0.42, -0.95, 0.32, 0.48, 0.95), C(0x6b4f36)],
    [box(-0.34, 0.48, -0.95, -0.27, 1.02, 0.95), C(0x2e6b4f)]
  ],
  // a hydrant, yellow, a silver cap and its outlets
  hydrant: [
    ...can(0.15, 0.12, 0.6, 0.12, 6).map(g => [g, C(0xd2a92a)]),
    [box(-0.05, 0.36, -0.2, 0.05, 0.46, 0.2), C(0xbfc3c7)]
  ],
  // a litter bin, its lid domed
  bin: can(0.25, 0.28, 0.92, 0.16, 7).map((g, i) => [
    g,
    C(i ? 0x26302b : 0x2f4a3a)
  ])
}
// (small enough to cast no shadow worth drawing: one mesh for the city). Those a car can knock
// over (all of them: sim/knockables.js) are drawn instanced instead, by cityKnocks.js.
export function buildDecor (group) {
  const out = new Builder()
  for (const d of DECOR) {
    if (d.knock !== undefined) continue
    const M = pose(d.x, 0.08, d.z, d.yaw)
    for (const [g, c] of PIECES[d.kind]) out.add(g, M, c)
  }
  if (out.empty) return
  const m = new THREE.Mesh(
    out.geometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })
  )
  m.receiveShadow = true
  m.name = 'benches, hydrants, bins'
  group.add(m)
}
