// The city's ground: asphalt, kerbed blocks with sidewalks and rounded corners, lane
// paint, stop lines and zebra crossings, parks, parking lots and the promenade round the ring road;
// and on each block's lot what the sim laid out (lots.js): its base (paving, a lawn or asphalt) and
// over it lawns and planters, drives and forecourts, car parks with their spaces marked out.
import * as THREE from 'three'
import { merge, marks, LAYER } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { roadMaterial } from './roadSurface.js'
import { wetGround } from './wet.js'
import { lampLit } from './lampLight.js'
import { dotted, eachMarker } from '../sim/botts.js'
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
  PROMENADE,
  PITCH,
  segOpen,
  BLVD_EW,
  BLVD_NS,
  MEDIAN_HW
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
      g.fillStyle = `rgba(${
        Math.random() < 0.5 ? '30,50,15' : '140,170,80'
      },${Math.random() * 0.4})`
      g.fillRect(Math.random() * S, Math.random() * S, 1, 2 + Math.random() * 2)
    }
  })
  grass.repeat.set(1 / 8, 1 / 8)
  // a basketball court's acrylic (its lines painted on: courtLines), a ball field's dirt
  const court = canvasTex(64, (g, S) => {
    g.fillStyle = '#3f6f8c'
    g.fillRect(0, 0, S, S)
    speckle(g, 600, S, 0.08, true)
  })
  court.repeat.set(1 / 4, 1 / 4)
  const dirt = canvasTex(128, (g, S) => {
    g.fillStyle = '#a5754e'
    g.fillRect(0, 0, S, S)
    blotches(g, S, 14, 'rgba(90,60,30,0.25)', 'rgba(220,180,130,0.2)', 8, 30)
    speckle(g, 4000, S, 0.2, false)
  })
  dirt.repeat.set(1 / 6, 1 / 6)
  return { asphalt, walk, plaza, grass, court, dirt }
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
  // (each darker and smoother in the rain: wet.js; the grass hardly shines; and lit at night by the
  // street lights: lampLight.js)
  const mat = (
    map,
    color = 0xffffff,
    rough = 0.92,
    dark = 0.62,
    gloss = 0.32
  ) =>
    lampLit(
      wetGround(
        new THREE.MeshStandardMaterial({ map, color, roughness: rough }),
        dark,
        gloss
      )
    )
  const M = {
    asphalt: lampLit(roadMaterial({ map: T.asphalt, roughness: 0.88 })),
    walk: mat(T.walk),
    plaza: mat(T.plaza),
    grass: mat(T.grass, 0xffffff, 0.98, 0.75, 0.7)
  }
  // the same, laid over a lot's base: drawn in front of it (a polygon offset), so they never fight
  const over = m => {
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -2
    return m
  }
  const O = {
    asphalt: over(lampLit(roadMaterial({ map: T.asphalt, roughness: 0.88 }))),
    concrete: over(mat(T.walk, 0xf2efe8)),
    plaza: over(mat(T.plaza)),
    grass: over(mat(T.grass, 0xffffff, 0.98, 0.75, 0.7)),
    court: over(mat(T.court, 0xffffff, 0.6)),
    dirt: over(mat(T.dirt, 0xffffff, 0.98, 0.7, 0.4))
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

  // blocks: a kerbed slab with rounded corners, the sidewalk round the edge, the lot inside: its
  // base, and what is laid over it
  const slabs = [],
    lots = { plaza: [], grass: [], asphalt: [] },
    tops = { plaza: [], grass: [], asphalt: [], concrete: [], court: [], dirt: [] }
  for (const b of BLOCKS) {
    // (a superblock: one kerbed slab over its four blocks and the streets between, from its
    // north-west block; the other three draw nothing of their own)
    let { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = b
    if (b.super) {
      if (b.bx !== b.super.bx || b.bz !== b.super.bz) continue
      bx1 += PITCH
      bz1 += PITCH
    }
    slabs.push(slab(roundRect(bx0, bz0, bx1, bz1, CURB_R), CURB_H))
    const x0 = bx0 + WALK,
      x1 = bx1 - WALK,
      z0 = bz0 + WALK,
      z1 = bz1 - WALK,
      y = CURB_H + 0.004
    // (the river's channel is drawn sunk into its block: cityWorks.js)
    if (lots[b.base]) lots[b.base].push(flat(x0, z0, x1, z1, y))
    if (b.kind === 'park' && !b.sports) {
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2 // footpaths across the middle
      tops.plaza.push(flat(cx - 1.6, z0, cx + 1.6, z1, y + 0.004))
      tops.plaza.push(flat(x0, cz - 1.6, x1, cz + 1.6, y + 0.004))
    }
    for (const g of b.ground)
      if (tops[g.k]) tops[g.k].push(flat(g.x0, g.z0, g.x1, g.z1, y + 0.004))
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
  for (const k of ['plaza', 'grass', 'asphalt'])
    if (lots[k].length)
      add(merge(lots[k]), M[k], k === 'asphalt' ? LAYER.road : LAYER.ground)
  for (const k of ['plaza', 'grass', 'asphalt', 'concrete', 'court', 'dirt'])
    if (tops[k].length) add(merge(tops[k]), O[k], LAYER.ground)

  // ---------- paint ----------
  // (the lane lines in painted dashes, or, along the low-rise neighbourhoods' streets, in raised
  // markers as on California's roads: four round dots and a square reflector every 7.3 m, where
  // the sim feels them: botts.js)
  const white = [],
    yellow = [],
    dots = [],
    medians = []
  for (let r = 0; r <= N; r++)
    for (let j = 0; j < N; j++) {
      const c = ROADS[r],
        a = ROADS[j] + STOP,
        b = ROADS[j + 1] - STOP
      for (const alongZ of [false, true]) {
        if (!segOpen(r, j, alongZ)) continue // (a superblock's closed street)
        const put = (list, u, v, len, wid) =>
          list.push(
            alongZ
              ? { x: v, z: u, len, wid, yaw: Math.PI / 2 }
              : { x: u, z: v, len, wid, yaw: 0 }
          )
        // a boulevard's raised median between its junctions (from just past the crossings, so the
        // left turns swing round its nose), the double yellow on the rest
        if ((alongZ ? BLVD_NS : BLVD_EW).has(r))
          medians.push(
            alongZ
              ? [c - MEDIAN_HW, c + MEDIAN_HW, a + 1, b - 1]
              : [a + 1, b - 1, c - MEDIAN_HW, c + MEDIAN_HW]
          )
        else
          for (const off of [-0.17, 0.17])
            put(yellow, (a + b) / 2, c + off, b - a, 0.12)
        const botts = dotted(r, j, alongZ)
        for (const off of [-LANE_W, LANE_W])
          if (botts)
            eachMarker(a, b, (u, square) =>
              square
                ? put(white, u, c + off, 0.1, 0.1)
                : put(dots, u, c + off, 0.12, 0.12)
            )
          else
            for (let u = a + 3; u < b - 2; u += 9)
              put(white, u, c + off, 3, 0.13)
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
  // the lines either side of each parking space, along it (the way its car's nose points)
  const stalls = []
  for (const st of STALLS) {
    if (st.drive) continue // (a car in a house's drive: no lines)
    const hx = Math.cos(st.yaw),
      hz = -Math.sin(st.yaw)
    for (const s of [-1.35, 1.35])
      stalls.push({
        x: st.x - hz * s,
        z: st.z + hx * s,
        len: 5,
        wid: 0.12,
        yaw: st.yaw
      })
  }
  const paint = (color, list, y, off = 1) => {
    const m = marks(
      list,
      lampLit(
        wetGround(
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.7,
            polygonOffset: true,
            polygonOffsetFactor: -off,
            polygonOffsetUnits: -off
          }),
          0.8,
          0.2
        )
      ),
      y
    )
    group.add(m)
  }
  paint(0xdedbd2, white, 0.012)
  paint(0xd9a520, yellow, 0.012)
  // the dots: white domes (a round cut-out, shaded as a dome), a little proud of the road
  const dot = canvasTex(32, (g, S) => {
    g.clearRect(0, 0, S, S)
    const gr = g.createRadialGradient(S * 0.4, S * 0.38, 1, S / 2, S / 2, S / 2)
    gr.addColorStop(0, '#ffffff')
    gr.addColorStop(0.7, '#d9d6cf')
    gr.addColorStop(1, '#8e8b85')
    g.fillStyle = gr
    g.beginPath()
    g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2)
    g.fill()
  })
  group.add(
    marks(
      dots,
      new THREE.MeshStandardMaterial({
        map: dot,
        alphaTest: 0.5,
        roughness: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }),
      0.016
    )
  )
  // (on the raised lot, not the road, and over a car park laid on it)
  paint(0xdedbd2, stalls, CURB_H + 0.014, 4)
  // the medians: a kerb round a strip of lawn, rounded off at the ends
  const ms = [],
    mg = []
  for (const [x0, x1, z0, z1] of medians) {
    ms.push(slab(roundRect(x0, z0, x1, z1, MEDIAN_HW - 0.05), 0.16))
    mg.push(flat(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, 0.165))
  }
  if (ms.length) {
    add(merge(ms), M.walk)
    add(merge(mg), M.grass)
  }
  return M
}
