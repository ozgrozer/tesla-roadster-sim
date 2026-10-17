// The city's ground: asphalt, kerbed blocks with sidewalks and rounded corners, lane
// paint, stop lines and zebra crossings, parks, parking lots and the promenade round the ring road.
import * as THREE from 'three'
import { merge, marks, LAYER } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { roadMaterial } from './roadSurface.js'
import {
  N,
  DIRS,
  WALK,
  STOP,
  HALF,
  ROADS,
  NODES,
  STALLS,
  CURB_H,
  CURB_R,
  BLOCKS,
  LANE_W,
  ROAD_HW,
  PROMENADE
} from '../sim/city.js'

// ---------- textures (UVs are in metres, so each texture's repeat is 1 / its tile size) ----------
function blotches (g, S, n, dark, light, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * S,
      y = Math.random() * S,
      r = rMin + Math.random() * (rMax - rMin)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, Math.random() < 0.5 ? dark : light)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
}
function textures () {
  const asphalt = canvasTex(512, (g, S) => {
    g.fillStyle = '#3a3c40'
    g.fillRect(0, 0, S, S)
    blotches(g, S, 26, 'rgba(20,21,24,0.22)', 'rgba(120,120,125,0.1)', 30, 110)
    speckle(g, 18000, S, 0.3, false)
    speckle(g, 8000, S, 0.13, true)
  })
  asphalt.repeat.set(1 / 9, 1 / 9)
  const walk = canvasTex(256, (g, S) => {
    g.fillStyle = '#aaa59d'
    g.fillRect(0, 0, S, S)
    blotches(g, S, 10, 'rgba(70,66,60,0.12)', 'rgba(255,255,255,0.1)', 20, 60)
    speckle(g, 5000, S, 0.16, false)
    speckle(g, 2500, S, 0.1, true)
    g.strokeStyle = 'rgba(70,66,62,0.6)'
    g.lineWidth = 2 // expansion joints: 1.5 m slabs
    g.beginPath()
    for (const v of [1, S / 2]) {
      g.moveTo(0, v)
      g.lineTo(S, v)
      g.moveTo(v, 0)
      g.lineTo(v, S)
    }
    g.stroke()
  })
  walk.repeat.set(1 / 3, 1 / 3)
  const plaza = canvasTex(256, (g, S) => {
    g.fillStyle = '#8d877d'
    g.fillRect(0, 0, S, S)
    speckle(g, 4000, S, 0.15, false)
    g.strokeStyle = 'rgba(50,46,42,0.45)'
    g.lineWidth = 1.5 // pavers in a running bond
    for (let r = 0; r < 8; r++) {
      const y = (r * S) / 8
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(S, y)
      for (let c = 0; c < 4; c++) {
        const x = ((c + (r % 2) * 0.5) * S) / 4
        g.moveTo(x, y)
        g.lineTo(x, y + S / 8)
      }
      g.stroke()
    }
  })
  plaza.repeat.set(1 / 4, 1 / 4)
  const grass = canvasTex(256, (g, S) => {
    g.fillStyle = '#4c6a33'
    g.fillRect(0, 0, S, S)
    blotches(g, S, 30, 'rgba(40,60,20,0.35)', 'rgba(150,170,80,0.18)', 10, 50)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,50,15' : '140,170,80'},${
        Math.random() * 0.4
      })`
      g.fillRect(Math.random() * S, Math.random() * S, 1, 2 + Math.random() * 2)
    }
  })
  grass.repeat.set(1 / 8, 1 / 8)
  return { asphalt, walk, plaza, grass }
}

// rounded rectangle in shape space (x, -z), so it lies flat after rotateX(-90deg)
function roundRect (x0, z0, x1, z1, r) {
  const s = new THREE.Shape(),
    y0 = -z1,
    y1 = -z0,
    h = Math.PI / 2
  s.moveTo(x0 + r, y0)
  s.lineTo(x1 - r, y0)
  s.absarc(x1 - r, y0 + r, r, -h, 0, false)
  s.lineTo(x1, y1 - r)
  s.absarc(x1 - r, y1 - r, r, 0, h, false)
  s.lineTo(x0 + r, y1)
  s.absarc(x0 + r, y1 - r, r, h, 2 * h, false)
  s.lineTo(x0, y0 + r)
  s.absarc(x0 + r, y0 + r, r, 2 * h, 3 * h, false)
  return s
}
const slab = (shape, h) =>
  new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments: 5
  }).rotateX(-Math.PI / 2)
// a flat rectangle at height y, with UVs in metres
function flat (x0, z0, x1, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, x0 + uv.getX(i) * (x1 - x0), z0 + uv.getY(i) * (z1 - z0))
  return g.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
}

export function buildGround (group) {
  const T = textures()
  const mat = (map, color = 0xffffff, rough = 0.92) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough })
  const M = {
    asphalt: roadMaterial({ map: T.asphalt, roughness: 0.88 }),
    walk: mat(T.walk),
    plaza: mat(T.plaza),
    grass: mat(T.grass, 0xffffff, 0.98)
  }
  const add = (geo, m, order = LAYER.ground) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.receiveShadow = true
    mesh.renderOrder = order
    group.add(mesh)
    return mesh
  }
  // the asphalt under the whole street grid (the beach and the sea round it: citySea.js)
  const ra = HALF + ROAD_HW + 0.5
  add(flat(-ra, -ra, ra, ra, 0), M.asphalt, LAYER.road)

  // blocks: a kerbed slab with rounded corners, the sidewalk round the edge, the lot inside
  const slabs = [],
    lots = { plaza: [], grass: [], asphalt: [] }
  for (const b of BLOCKS) {
    slabs.push(slab(roundRect(b.x0, b.z0, b.x1, b.z1, CURB_R), CURB_H))
    const x0 = b.x0 + WALK,
      x1 = b.x1 - WALK,
      z0 = b.z0 + WALK,
      z1 = b.z1 - WALK,
      y = CURB_H + 0.004
    if (b.kind === 'park') {
      lots.grass.push(flat(x0, z0, x1, z1, y))
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2 // footpaths across the middle
      lots.plaza.push(flat(cx - 1.6, z0, cx + 1.6, z1, y + 0.004))
      lots.plaza.push(flat(x0, cz - 1.6, x1, cz + 1.6, y + 0.004))
    } else
      lots[b.kind === 'parking' ? 'asphalt' : 'plaza'].push(
        flat(x0, z0, x1, z1, y)
      )
  }
  // the promenade: the sidewalk on the outside of the ring road, out to the beach
  const outer = new THREE.Shape(),
    o = PROMENADE,
    i = HALF + ROAD_HW
  outer.moveTo(-o, -o)
  outer.lineTo(o, -o)
  outer.lineTo(o, o)
  outer.lineTo(-o, o)
  outer.lineTo(-o, -o)
  const hole = new THREE.Path()
  hole.moveTo(-i, -i)
  hole.lineTo(-i, i)
  hole.lineTo(i, i)
  hole.lineTo(i, -i)
  hole.lineTo(-i, -i)
  outer.holes.push(hole)
  slabs.push(slab(outer, CURB_H))
  add(merge(slabs), M.walk)
  add(merge(lots.plaza), M.plaza)
  add(merge(lots.grass), M.grass)
  add(merge(lots.asphalt), M.asphalt, LAYER.road)

  // ---------- paint ----------
  const white = [],
    yellow = []
  for (let r = 0; r <= N; r++)
    for (let j = 0; j < N; j++) {
      const c = ROADS[r],
        a = ROADS[j] + STOP,
        b = ROADS[j + 1] - STOP
      for (const alongZ of [false, true]) {
        const put = (list, u, v, len, wid) =>
          list.push(
            alongZ
              ? { x: v, z: u, len, wid, yaw: Math.PI / 2 }
              : { x: u, z: v, len, wid, yaw: 0 }
          )
        for (const off of [-0.17, 0.17])
          put(yellow, (a + b) / 2, c + off, b - a, 0.12)
        for (const off of [-LANE_W, LANE_W])
          for (let u = a + 3; u < b - 2; u += 9) put(white, u, c + off, 3, 0.13)
      }
    }
  for (const n of NODES)
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = DIRS[k],
        yaw = Math.atan2(-dz, dx)
      if (n.inc[k]) {
        // stop line across the incoming lanes, behind the crossing
        const d = STOP + 0.5,
          w = ROAD_HW / 2
        white.push({
          x: n.x - dx * d - dz * w,
          z: n.z - dz * d + dx * w,
          len: 0.45,
          wid: ROAD_HW - 0.6,
          yaw
        })
      }
      if (n.out[k])
        for (let w = -ROAD_HW + 0.9; w < ROAD_HW - 0.5; w += 1.15)
          white.push({
            x: n.x + dx * 9.1 - dz * w,
            z: n.z + dz * 9.1 + dx * w,
            len: 3,
            wid: 0.55,
            yaw
          })
    }
  const stalls = []
  for (const st of STALLS)
    for (const s of [-1.35, 1.35])
      stalls.push({ x: st.x + s, z: st.z, len: 5, wid: 0.12, yaw: Math.PI / 2 })
  const paint = (color, list, y) => {
    const m = marks(
      list,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }),
      y
    )
    group.add(m)
  }
  paint(0xdedbd2, white, 0.012)
  paint(0xd9a520, yellow, 0.012)
  paint(0xdedbd2, stalls, CURB_H + 0.014) // on the raised lot, not the road
  return M
}
