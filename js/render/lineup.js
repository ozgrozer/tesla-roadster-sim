// The parked Tesla lineup for stunt 2: extruded low-poly profiles, parked broadside to the jump.
import * as THREE from 'three'
import { scene, MAT } from './scene.js'
import { LINEUP } from '../sim/track.js'

// ---------- parked lineup ----------
function extrudeProfile (pts, depth, mat, bevel = 0.05) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2
  })
  g.translate(0, 0, -depth / 2)
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
const PROFILES = {
  m3: {
    body: [
      [-2.36, 0.3],
      [2.36, 0.3],
      [2.36, 0.62],
      [2.05, 0.8],
      [1.0, 0.92],
      [-1.9, 0.98],
      [-2.36, 0.86]
    ],
    glass: [
      [0.95, 0.9],
      [0.2, 1.36],
      [-0.9, 1.4],
      [-1.85, 0.97]
    ],
    r: 0.34
  },
  y: {
    body: [
      [-2.37, 0.34],
      [2.37, 0.34],
      [2.37, 0.68],
      [2.05, 0.86],
      [1.0, 1.0],
      [-2.1, 1.08],
      [-2.37, 0.96]
    ],
    glass: [
      [0.98, 0.98],
      [0.2, 1.55],
      [-1.4, 1.59],
      [-2.08, 1.16],
      [-2.08, 1.06]
    ],
    r: 0.36
  },
  cab: {
    body: [
      [-2.1, 0.3],
      [2.1, 0.3],
      [2.1, 0.62],
      [1.6, 0.86],
      [-2.0, 0.9],
      [-2.1, 0.78]
    ],
    glass: [
      [1.58, 0.84],
      [0.6, 1.4],
      [-0.6, 1.44],
      [-1.9, 1.0],
      [-1.98, 0.88]
    ],
    r: 0.33
  },
  truck: {
    body: [
      [-2.85, 0.45],
      [2.85, 0.45],
      [2.85, 1.1],
      [-0.15, 1.88],
      [-2.85, 1.28]
    ],
    glass: [
      [1.35, 1.5],
      [-0.1, 1.86],
      [-0.55, 1.78],
      [1.05, 1.38]
    ],
    r: 0.43
  },
  semi: {
    body: [
      [-3.2, 0.6],
      [3.2, 0.6],
      [3.2, 1.35],
      [2.95, 2.4],
      [1.7, 3.72],
      [0.2, 3.88],
      [-1.25, 3.88],
      [-1.25, 1.42],
      [-3.2, 1.32]
    ],
    glass: [
      [2.9, 2.5],
      [1.72, 3.62],
      [1.4, 3.6],
      [2.55, 2.42]
    ],
    r: 0.52
  }
}
const glassDark = new THREE.MeshPhysicalMaterial({
  color: 0x0b0d12,
  roughness: 0.08,
  metalness: 0.6,
  envMapIntensity: 1.2
})
export function buildLineup () {
  for (const v of LINEUP) {
    const pr = PROFILES[v.kind],
      g = new THREE.Group()
    const paint =
      v.kind === 'truck'
        ? new THREE.MeshStandardMaterial({
            color: v.color,
            roughness: 0.32,
            metalness: 0.9
          })
        : new THREE.MeshPhysicalMaterial({
            color: v.color,
            roughness: 0.3,
            metalness: 0.35,
            clearcoat: 0.8
          })
    g.add(
      extrudeProfile(
        pr.body,
        v.w - 0.1,
        paint,
        v.kind === 'truck' ? 0.02 : 0.05
      )
    )
    const shift =
      v.kind === 'truck'
        ? [0.01, 0.045]
        : v.kind === 'semi'
        ? [0.05, 0.035]
        : [0, 0]
    g.add(
      extrudeProfile(
        pr.glass.map(([x, y]) => [x + shift[0], y + shift[1]]),
        v.w - (v.kind === 'semi' || v.kind === 'truck' ? 0.2 : 0.3),
        glassDark,
        0.04
      )
    )
    const len = v.l / 2
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(pr.r, pr.r, 0.26, 20).rotateX(Math.PI / 2),
          MAT.tire
        )
        w.position.set(
          sx * (len - (v.kind === 'semi' ? 1.1 : 0.85)),
          pr.r,
          sz * (v.w / 2 - 0.12)
        )
        w.castShadow = true
        g.add(w)
      }
    if (v.kind === 'cab' || v.kind === 'truck') {
      // full-width light bars
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, v.w - 0.3),
        MAT.headlight
      )
      bar.position.set(len + 0.03, v.kind === 'truck' ? 1.08 : 0.62, 0)
      g.add(bar)
    }
    g.rotation.y = Math.PI / 2 // broadside to the jump
    g.position.set(v.x, 0, 0)
    scene.add(g)
  }
}
