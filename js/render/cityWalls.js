// The verges and walls round the city on three sides: past the promenade's edge a strip of dry grass,
// palms and the odd round-headed tree along it, then at the foot of the hills (north) a concrete
// retaining wall with ivy spilling down it, and on the east and south a freeway's sound wall of
// concrete blocks, ivy climbing its foot and a hedge of oleanders along it, pink and white. The walls
// are solid (sim/edge.js). The planting is merged a stretch at a time, so the car's shadow map draws
// only the stretch it is beside.
import * as THREE from 'three'
import { merge } from './geo.js'
import { PROMENADE, rng } from '../sim/city.js'
import { WALL, WALL_H } from '../sim/edge.js'
import { HILL_GAP } from '../sim/hillroad.js'
import {
  PLANT,
  roundTree,
  palmAt,
  bake,
  pose,
  lump,
  grassTexture,
  wallTexture
} from './cityKit.js'

const R = rng(505)
const T = 0.6 // the walls' thickness
const GRASS_Y = 0.02 // (a little below the promenade's top: the car drops off its edge)
const STRETCH = 400 // m of planting to a mesh
const TREE = roundTree(0x405a2c)
const _m = new THREE.Matrix4()

// A box along a wall's run (axis 'x' or 'z', from a to b), its inner face at distance d out from the
// middle, from y0 up h, thick through: UVs in metres along it and up it, on every face.
function run (axis, d, a, b, y0, h, thick) {
  const len = b - a,
    g = new THREE.BoxGeometry(len, h, thick)
  const uv = g.attributes.uv,
    p = g.attributes.position
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, p.getX(i) + len / 2, p.getY(i) + y0 + h / 2)
  g.translate((a + b) / 2, y0 + h / 2, 0)
  if (axis === 'z') g.rotateY(-Math.PI / 2)
  const o = Math.sign(d) * (Math.abs(d) + T / 2)
  return axis === 'x' ? g.translate(0, 0, o) : g.translate(o, 0, 0)
}

// The planting along one side, from a to b (axis 'x' or 'z', the wall at d): a hedge of oleanders
// at the wall's foot (where there is one), palms and trees out on the verge. Pieces, by stretch.
function planting (axis, d, a, b, hedge, skip = () => false) {
  const stretches = new Map()
  const put = (s, ...g) => {
    const k = Math.floor((s - a) / STRETCH)
    if (!stretches.has(k)) stretches.set(k, [])
    stretches.get(k).push(...g)
  }
  const at = (s, off, y = 0) =>
    axis === 'x' ? [s, y, Math.sign(d) * off] : [Math.sign(d) * off, y, s]
  if (hedge)
    for (let s = a + 1; s < b - 1; s += 1.4 + R() * 1.1) {
      const r = 0.85 + R() * 0.5
      const bloom =
        R() < 0.4 ? (R() < 0.6 ? [0.74, 0.3, 0.42] : [0.82, 0.8, 0.76]) : null
      const g = lump(r, up => {
        const k = 0.65 + 0.3 * (up + 1)
        return bloom && up > 0.1 && R() < 0.55
          ? bloom
          : [0.085 * k, 0.15 * k, 0.065 * k]
      })
      g.scale(1.25, 1.15, 0.95)
      if (axis === 'z') g.rotateY(Math.PI / 2)
      const [x, , z] = at(s, Math.abs(d) - 1 + (R() - 0.5) * 0.5)
      put(s, g.translate(x, r * 0.9, z))
    }
  for (let s = a + 10; s < b - 6; s += 22 + R() * 10) {
    const [x, , z] = at(s, PROMENADE + 3 + R() * 4)
    if (skip(s)) continue
    if (R() < 0.75)
      put(s, ...palmAt({ x, z, h: 13 + R() * 9, lean: R() * 6.3 }))
    else {
      const k = 1.1 + R() * 0.5
      put(s, bake(TREE, pose(_m, x, 0, z, R() * 6.3, k, k, k)))
    }
  }
  return [...stretches.values()]
}

export function buildWalls (group) {
  // the verges: north and south the whole way along, east between them
  const grass = new THREE.MeshStandardMaterial({
    map: grassTexture(),
    roughness: 0.97
  })
  const strips = []
  const flat = (x0, z0, x1, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, x0 + uv.getX(i) * (x1 - x0), z0 + uv.getY(i) * (z1 - z0))
    strips.push(g.translate((x0 + x1) / 2, GRASS_Y, (z0 + z1) / 2))
  }
  const W = WALL + 0.02,
    P = PROMENADE - 0.3 // (tucked under the promenade's edge)
  flat(-PROMENADE, -W, W, -P)
  flat(-PROMENADE, P, W, W)
  flat(P, -P, W, P)
  const verge = new THREE.Mesh(merge(strips), grass)
  verge.receiveShadow = true
  verge.renderOrder = 1 // (with the pavements: LAYER.ground)
  group.add(verge)

  // the walls, each with its cap: concrete at the foot of the hills, blocks behind the freeway
  // (the two sound walls in one mesh)
  const wall = (axis, d, a, b, h) => [
    run(axis, d, a, b, 0, h, T),
    run(axis, d, a - 0.08, b + 0.08, h, 0.18, T + 0.16)
  ]
  for (const [kind, runs] of [
    // (the hill road's gap in the one at the foot of the hills)
    [
      'concrete',
      [
        ...wall('x', -WALL, -PROMENADE, HILL_GAP[0], WALL_H.north),
        ...wall('x', -WALL, HILL_GAP[1], WALL + T, WALL_H.north)
      ]
    ],
    [
      'blocks',
      [
        ...wall('z', WALL, -WALL - T, WALL + T, WALL_H.side),
        ...wall('x', WALL, -PROMENADE, WALL, WALL_H.side)
      ]
    ]
  ]) {
    const m = new THREE.Mesh(
      merge(runs),
      new THREE.MeshStandardMaterial({ map: wallTexture(kind), roughness: 0.9 })
    )
    m.castShadow = m.receiveShadow = true
    group.add(m)
  }
  // the planting, a stretch to a mesh
  for (const piece of [
    ...planting('x', -WALL, -PROMENADE, WALL, false, s =>
      s > HILL_GAP[0] - 6 && s < HILL_GAP[1] + 6),
    ...planting('z', WALL, -WALL + 2, WALL - 2, true),
    ...planting('x', WALL, -PROMENADE + 3, WALL - 3, true)
  ]) {
    const m = new THREE.Mesh(merge(piece), PLANT)
    m.castShadow = m.receiveShadow = true
    group.add(m)
  }
  return {}
}
