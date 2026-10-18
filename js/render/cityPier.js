// Santa Monica's pier, out into the Pacific from the end of Wilshire (LANDMARKS.pier): a broad deck
// of weathered planks level with the promenade, standing on rows of timber piles once it is out over
// the sand, white railings round it and lamp posts along them; under an arch with the town's name, the
// carousel's hall on its plaza to the north, the amusement park to the south (its rides: cityRides.js),
// kiosks along the way out and a restaurant at the end. You drive on it (sim/edge.js keeps you to it).
// At night the lamps light the deck in pools, and the arch's name glows.
import * as THREE from 'three'
import { merge, box, tint } from './geo.js'
import { canvasTex, speckle, softTex, hdr } from './scene.js'
import { glowMaterial, glowPoints } from './cityGlow.js'
import { buildRides } from './cityRides.js'
import { CURB_H, PROMENADE, rng } from '../sim/city.js'
import { PIER, RAILS, RAIL_H, PIER_HOUSES, SHORE, ARCH } from '../sim/edge.js'

const R = rng(1909)
const TOP = CURB_H // the deck's top, level with the promenade's
const UNDER = TOP - 0.7 // the bottom of its joists and caps
const BED = -7 // the piles go down to here
const WHITE = 0xece8de
const PIECE = 60 // m of the pier's railings and furniture to a mesh (for the car's shadow map)
const _m = new THREE.Matrix4()

// weathered planks laid across the pier, 2 m of them to the tile
function plankTexture () {
  const t = canvasTex(256, (g, S) => {
    const n = 12
    for (let i = 0; i < n; i++) {
      const k = 0.85 + Math.random() * 0.3
      g.fillStyle = `rgb(${Math.round(132 * k)},${Math.round(
        114 * k
      )},${Math.round(94 * k)})`
      g.fillRect((i * S) / n, 0, S / n, S)
    }
    speckle(g, 7000, S, 0.22, false)
    speckle(g, 3000, S, 0.12, true)
    g.fillStyle = 'rgba(30,24,18,0.75)'
    for (let i = 0; i < n; i++) g.fillRect((i * S) / n, 0, 1.5, S)
    // the butt joints, staggered, and the nails along the joists
    for (let i = 0; i < n; i++) {
      g.fillRect((i * S) / n, (((i * 5) % 7) * S) / 7, S / n, 1.2)
      for (const y of [0.25, 0.75]) {
        g.fillStyle = 'rgba(25,22,20,0.6)'
        g.fillRect((i * S) / n + 3, y * S, 2, 2)
        g.fillRect(((i + 1) * S) / n - 5, y * S, 2, 2)
      }
      g.fillStyle = 'rgba(30,24,18,0.75)'
    }
  })
  t.repeat.set(1 / 2, 1 / 2)
  return t
}
// the arch's board: the town's name in tall letters, lit at night
function nameTexture () {
  return canvasTex(
    512,
    (g, W, H) => {
      g.fillStyle = '#123a5c'
      g.fillRect(0, 0, W, H)
      g.strokeStyle = '#f1e7c8'
      g.lineWidth = 6
      g.strokeRect(6, 6, W - 12, H - 12)
      g.fillStyle = '#f6efd8'
      g.font = 'bold 74px Arial, Helvetica, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('SANTA MONICA', W / 2, H / 2 + 4)
    },
    1,
    128
  )
}

// the ground under (x): the sand's level, and its face down into the sea (as citySea.js)
const sand = x =>
  x > -SHORE ? -0.03 : -0.03 - Math.min(3, ((-SHORE - x) * 3) / 12)

export function buildPier (group) {
  const deck = [],
    wood = [],
    paint = []
  // the deck: its planks on top (UVs in metres), its edges and joists below
  for (const d of PIER.deck) {
    const g = new THREE.PlaneGeometry(d.x1 - d.x0, d.z1 - d.z0).rotateX(
      -Math.PI / 2
    )
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        d.x0 + uv.getX(i) * (d.x1 - d.x0),
        d.z0 + uv.getY(i) * (d.z1 - d.z0)
      )
    deck.push(g.translate((d.x0 + d.x1) / 2, TOP, (d.z0 + d.z1) / 2))
    wood.push(
      tint(
        box(
          d.x0,
          UNDER,
          d.z0,
          Math.min(d.x1, -PROMENADE - 0.5),
          TOP - 0.01,
          d.z1
        ),
        0x4b4035
      )
    )
  }
  // the piles: a bent across the deck every 6 m, a pile every 3 m along it, once it is over the
  // sand's face; and a cap along each bent
  const piles = []
  for (const d of PIER.deck)
    for (let x = d.x1 - 3; x > d.x0; x -= 6) {
      if (sand(x) > UNDER - 0.2) continue
      for (let z = d.z0 + 1; z < d.z1; z += 3) piles.push({ x, z })
      wood.push(
        tint(box(x - 0.3, UNDER - 0.45, d.z0, x + 0.3, UNDER, d.z1), 0x3e352c)
      )
    }
  // the railings round its edge (posts every 2.4 m, a top rail and a middle one), white
  const lamps = []
  for (const r of RAILS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0),
      along = r.x1 !== r.x0
    // (the rails in pieces, so each lies in one stretch of the pier)
    for (let a = 0; a < len; a += PIECE) {
      const b = Math.min(len, a + PIECE)
      const rail = (y, h) =>
        along
          ? box(r.x0 + a, y, r.z0 - 0.06, r.x0 + b, y + h, r.z0 + 0.06)
          : box(r.x0 - 0.06, y, r.z0 + a, r.x0 + 0.06, y + h, r.z0 + b)
      paint.push(
        tint(rail(TOP + RAIL_H - 0.12, 0.12), WHITE),
        tint(rail(TOP + 0.5, 0.09), WHITE)
      )
    }
    for (let s = 0; s <= len; s += 2.4) {
      const x = along ? r.x0 + s : r.x0,
        z = along ? r.z0 : r.z0 + s
      paint.push(
        tint(
          box(x - 0.07, TOP, z - 0.07, x + 0.07, TOP + RAIL_H, z + 0.07),
          WHITE
        )
      )
    }
    // a lamp every 18 m (its light falls on the deck inside the railing)
    for (let s = 6; s < len - 2; s += 18)
      lamps.push(
        along
          ? { x: r.x0 + s, z: r.z0, nx: r.nx, nz: r.nz }
          : { x: r.x0, z: r.z0 + s, nx: r.nx, nz: r.nz }
      )
  }
  // the lamp posts: dark green iron, a pair of globes on a crossbar
  const globes = []
  for (const l of lamps) {
    paint.push(
      tint(
        box(l.x - 0.09, TOP, l.z - 0.09, l.x + 0.09, TOP + 4.6, l.z + 0.09),
        0x1f3a30
      )
    )
    paint.push(
      tint(
        box(
          l.x - 0.5,
          TOP + 4.3,
          l.z - 0.05,
          l.x + 0.5,
          TOP + 4.38,
          l.z + 0.05
        ),
        0x1f3a30
      )
    )
    for (const o of [-0.5, 0.5])
      globes.push(
        new THREE.SphereGeometry(0.22, 7, 4).translate(l.x + o, TOP + 4.6, l.z)
      )
  }
  // the entrance arch, its name over the deck
  const ax = ARCH.x,
    aw = ARCH.w
  for (const s of [-1, 1])
    paint.push(
      tint(
        box(ax - 0.5, TOP, s * aw - 0.5, ax + 0.5, TOP + 8.2, s * aw + 0.5),
        WHITE
      )
    )
  paint.push(
    tint(
      box(ax - 0.4, TOP + 8.2, -aw - 0.6, ax + 0.4, TOP + 8.6, aw + 0.6),
      WHITE
    )
  )
  const board = new THREE.PlaneGeometry(14, 3.4)
    .rotateY(Math.PI / 2)
    .translate(ax + 0.45, TOP + 6.5, 0)
  const boardBack = new THREE.PlaneGeometry(14, 3.4)
    .rotateY(-Math.PI / 2)
    .translate(ax - 0.45, TOP + 6.5, 0)
  paint.push(
    tint(box(ax - 0.4, TOP + 4.7, -7.2, ax + 0.4, TOP + 8.3, 7.2), 0x123a5c)
  )

  // the buildings
  for (const b of PIER_HOUSES) house(b, paint)

  // the meshes
  const planks = new THREE.Mesh(
    merge(deck),
    new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.92 })
  )
  planks.receiveShadow = true
  planks.renderOrder = 1 // (with the pavements)
  const timber = new THREE.Mesh(
    merge(wood),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
  )
  // (the railings, lamp posts and buildings by stretch along the pier, so the car's shadow map,
  // which reaches along the low sun a long way, draws only the stretch it is near)
  const stretch = new Map()
  for (const g of paint) {
    g.computeBoundingBox()
    const k = Math.floor(
      (g.boundingBox.min.x + g.boundingBox.max.x) / 2 / PIECE
    )
    if (!stretch.has(k)) stretch.set(k, [])
    stretch.get(k).push(g)
  }
  const painted = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7
  })
  const built = [...stretch.values()].map(geos => {
    const m = new THREE.Mesh(merge(geos), painted)
    m.castShadow = m.receiveShadow = true
    return m
  })
  const pile = new THREE.CylinderGeometry(0.22, 0.26, 1, 6, 1, true).translate(
    0,
    0.5,
    0
  )
  const pileMesh = new THREE.InstancedMesh(
    pile,
    new THREE.MeshStandardMaterial({ color: 0x4a3f34, roughness: 0.95 }),
    piles.length
  )
  piles.forEach((p, i) =>
    pileMesh.setMatrixAt(
      i,
      _m.makeScale(1, UNDER - BED, 1).setPosition(p.x, BED, p.z)
    )
  )
  pileMesh.computeBoundingSphere()
  const lit = new THREE.MeshBasicMaterial({ toneMapped: false })
  lit.color = hdr(0.9, 0.88, 0.82)
  const globeMesh = new THREE.Mesh(merge(globes), lit)
  const name = new THREE.MeshStandardMaterial({
    map: nameTexture(),
    emissiveMap: nameTexture(),
    roughness: 0.6
  })
  const sign = new THREE.Mesh(merge([board, boardBack]), name)
  group.add(planks, timber, ...built, pileMesh, globeMesh, sign)

  // at night: the lamps' light on the deck, and their glow
  const pools = lamps.map(l =>
    new THREE.PlaneGeometry(10, 10)
      .rotateX(-Math.PI / 2)
      .translate(l.x - l.nx * 2.5, TOP + 0.02, l.z - l.nz * 2.5)
  )
  const pool = new THREE.MeshBasicMaterial({
    map: softTex,
    color: new THREE.Color(1, 0.8, 0.55),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  })
  const poolMesh = new THREE.Mesh(merge(pools), pool)
  poolMesh.visible = false
  const glow = glowMaterial({ haze: 0.3 })
  const glows = glowPoints(
    lamps.flatMap(l =>
      [-0.5, 0.5].map(o => ({
        x: l.x + o,
        y: TOP + 4.6,
        z: l.z,
        color: 0xfff0d0,
        size: 1.6,
        k: 1.6
      }))
    ),
    glow
  )
  glows.visible = false
  group.add(poolMesh, glows)

  const rides = buildRides(group)
  return {
    update (t) {
      rides.update(t)
    },
    night (k) {
      lit.color.copy(hdr(0.9, 0.88, 0.82)).lerp(hdr(3.2, 2.7, 2.0), k)
      name.emissive.setRGB(1, 0.95, 0.85).multiplyScalar(1.6 * k)
      pool.opacity = 0.5 * k
      poolMesh.visible = k > 0.01
      glow.uniforms.uOn.value = k
      glows.visible = k > 0.01
      rides.night(k)
    }
  }
}

// One of the pier's buildings, by its name: walls, a band of windows, a roof (and a sign).
function house (b, out) {
  const { x0, x1, z0, z1, h } = b
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2
  const y = TOP
  const glass = (inset = 0.06) => [
    tint(box(x0 - inset, y + 1, z0 + 1, x0, y + h * 0.55, z1 - 1), 0x283038),
    tint(box(x1, y + 1, z0 + 1, x1 + inset, y + h * 0.55, z1 - 1), 0x283038),
    tint(box(x0 + 1, y + 1, z0 - inset, x1 - 1, y + h * 0.55, z0), 0x283038),
    tint(box(x0 + 1, y + 1, z1, x1 - 1, y + h * 0.55, z1 + inset), 0x283038)
  ]
  if (b.name === 'carousel') {
    // the hall: cream walls, arched windows (a band), a hipped roof and a cupola
    out.push(tint(box(x0, y, z0, x1, y + h * 0.62, z1), 0xefe3c4), ...glass())
    // (a hip roof: a box over the walls, its top narrowed to a ridge)
    const roof = new THREE.BoxGeometry(x1 - x0 + 0.8, h * 0.38, z1 - z0 + 0.8)
    const p = roof.attributes.position
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) > 0)
        p.setXYZ(i, p.getX(i) * 0.55, p.getY(i), p.getZ(i) * 0.1)
    roof.computeVertexNormals()
    roof.translate(cx, y + h * 0.62 + h * 0.19, cz)
    out.push(
      tint(roof, 0x55615a),
      tint(
        box(cx - 1.4, y + h, cz - 1.4, cx + 1.4, y + h + 2.4, cz + 1.4),
        0xefe3c4
      )
    )
    out.push(
      tint(
        new THREE.ConeGeometry(1.8, 2, 8).translate(cx, y + h + 3.4, cz),
        0x55615a
      )
    )
    return
  }
  if (b.name === 'station') {
    // the coaster's station: an open shed on posts
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1]
    ])
      out.push(
        tint(box(x - 0.2, y, z - 0.2, x + 0.2, y + h - 0.5, z + 0.2), 0xd9d2c0)
      )
    out.push(
      tint(
        box(x0 - 0.6, y + h - 0.5, z0 - 0.6, x1 + 0.6, y + h, z1 + 0.6),
        0xc7472f
      )
    )
    return
  }
  const colors = {
    arcade: [0xf2d38a, 0xd23c2e],
    restaurant: [0xe9e2d4, 0x1f5a7a],
    kiosk: [0xf4ead2, R() < 0.5 ? 0xd94a3a : 0x2f7d9a]
  }[b.name]
  out.push(tint(box(x0, y, z0, x1, y + h, z1), colors[0]), ...glass())
  // a bright band of sign round the top, and a flat roof
  out.push(
    tint(
      box(x0 - 0.1, y + h * 0.7, z0 - 0.1, x1 + 0.1, y + h * 0.88, z1 + 0.1),
      colors[1]
    )
  )
  out.push(
    tint(
      box(x0 - 0.3, y + h, z0 - 0.3, x1 + 0.3, y + h + 0.25, z1 + 0.3),
      0xbdb6a8
    )
  )
}
