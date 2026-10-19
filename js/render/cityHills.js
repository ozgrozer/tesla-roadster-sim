// The Hollywood Hills, north of the city behind the retaining wall: steep faces of chaparral, dark
// green scrub in clumps on dry gold grass and pale dirt, greener down the canyons and on the slopes
// that face away from the sun, bare along the ridges; houses stacked up the lower slopes on their
// stilts, white and cream and terracotta; trees down the canyons; the observatory on its terrace on a
// spur, its domes dark against the sky; the freeway going north through the pass. The ground is the
// sim's own (sim/edge.js hillHeight), so a car flown into it is held up where it is drawn. At night
// the houses' windows and the observatory are lit. (The sign is in citySign.js.)
import * as THREE from 'three'
import { LAYER, merge, box, tint } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { glowMaterial, glowPoints } from './cityGlow.js'
import { PLANT, lump, scatter, pose } from './cityKit.js'
import { buildSign } from './citySign.js'
import { PROMENADE, rng } from '../sim/city.js'
import { LANDMARKS } from '../sim/areas.js'
import { WALL, hillHeight, hillNormal, noise, TERRACE } from '../sim/edge.js'
import { HILL_ROAD, hillRoadNear } from '../sim/hillroad.js'

const R = rng(1919)
const EAST = 2600 // the hills run this far east
const BACK = 1300 // and this far back from the wall
const OBS = LANDMARKS.observatory
const SIGN = LANDMARKS.sign
const PASS = LANDMARKS.freeways[0].x0
const _n = { x: 0, y: 1, z: 0 }

// the grid's lines: close together near the wall and the city, further apart out of the way
function steps (from, to, near, grow, until) {
  const out = [from]
  let v = from,
    d = near
  while (v < to) {
    if (v > until) d *= grow
    v = Math.min(to, v + d)
    out.push(v)
  }
  return out
}

// a grid line's positions with more added either side of each stretch of the hill road that runs
// across them (axis 0: the rows, by u back from the wall; 1: the columns, by x), sorted
const EDGES = [-16, -11, -8, -6.6, -5, -2.5, 0, 2.5, 5, 6.6, 8, 11, 16]
function along (vs, axis) {
  const out = [...vs]
  for (const r of HILL_ROAD) {
    const flat = r.z0 === r.z1
    if (axis === 0 && flat) for (const e of EDGES) out.push(-r.z0 - WALL + e)
    if (axis === 1 && !flat) for (const e of EDGES) out.push(r.x0 + e)
    // (and across its ends, where it turns)
    if (axis === 1 && flat) for (const x of [r.x0, r.x1]) for (const e of EDGES) out.push(x + e)
    if (axis === 0 && !flat) for (const z of [r.z0, r.z1]) for (const e of EDGES) out.push(-z - WALL + e)
  }
  const lo = vs[0],
    hi = vs[vs.length - 1]
  return [...new Set(out.map(v => Math.round(v * 10) / 10))]
    .filter(v => v >= lo && v <= hi)
    .sort((a, b) => a - b)
}
const offRoad = (x, z, m) => hillRoadNear(x, z).d > m

// the chaparral's colour at (x, z): what grows there by its slope, which way it faces and how high
function ground (x, z, h, n, out) {
  const patch = noise(x / 38, z / 38),
    fine = noise(x / 9 + 50, z / 9)
  const steep = 1 - n.y // (0 flat, about 0.3 at 45 degrees)
  const shade = THREE.MathUtils.clamp(-n.z * 1.6 - n.x * 0.4, 0, 1) // facing north: greener
  const low = 1 - THREE.MathUtils.smoothstep(-z - WALL, 60, 240) // (gardens, low down)
  // dry gold grass and dirt, with dark green scrub in clumps, more of it out of the sun and low down
  const scrub = THREE.MathUtils.smoothstep(
    patch + shade * 0.45 + fine * 0.25 + low * 0.3,
    0.5,
    0.8
  )
  let r = 0.62 + 0.08 * fine,
    g = 0.5 + 0.06 * fine,
    b = 0.33
  const dirt = THREE.MathUtils.smoothstep(steep + 0.15 * fine, 0.3, 0.45)
  r += (0.66 - r) * dirt
  g += (0.53 - g) * dirt
  b += (0.4 - b) * dirt
  r += (0.17 - r) * scrub
  g += (0.21 - g) * scrub
  b += (0.11 - b) * scrub
  // the observatory's lawn
  const lawn =
    1 -
    THREE.MathUtils.smoothstep(Math.hypot(x - OBS.x, z - OBS.z - 18), 26, 34)
  out.setRGB(
    r + (0.28 - r) * lawn,
    g + (0.36 - g) * lawn,
    b + (0.15 - b) * lawn
  )
  return out
}

function terrain () {
  // (finer along the hill road, so its cuts and fills follow its edges: hillroad.js)
  const xs = along(steps(-PROMENADE, EAST, 8, 1.14, 1000), 1),
    us = along(steps(0.6, BACK, 4, 1.1, 130), 0)
  const nx = xs.length,
    nu = us.length
  const pos = new Float32Array(nx * nu * 3),
    col = new Float32Array(nx * nu * 3),
    uv = new Float32Array(nx * nu * 2)
  const c = new THREE.Color()
  for (let j = 0; j < nu; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i],
        z = -WALL - us[j],
        h = hillHeight(x, z),
        k = j * nx + i
      pos.set([x, h, z], k * 3)
      uv.set([x / 30, z / 30], k * 2)
      ground(x, z, h, hillNormal(x, z, _n), c)
      col.set([c.r, c.g, c.b], k * 3)
    }
  const index = []
  for (let j = 0; j < nu - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        d = a + nx,
        e = d + 1
      // (wound to face up: the rows run north, away from the city)
      index.push(a, b, d, b, e, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
// close up, the scrub's clumps and the dirt between them: soft and fine, so it doesn't pattern
function scrubTexture () {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#d6d0c4'
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S,
        y = Math.random() * S,
        r = 4 + Math.random() * 14
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(
        0,
        Math.random() < 0.55 ? 'rgba(90,92,70,0.3)' : 'rgba(255,248,230,0.25)'
      )
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    speckle(g, 6000, S, 0.2, false)
    speckle(g, 3000, S, 0.15, true)
  })
}
// a hillside house's walls: plaster (the instance's colour) round a band of big windows, dark by
// day and lit at night (lit: the windows alone, for the emissive map)
function houseTexture (lit) {
  return canvasTex(64, (g, S) => {
    g.fillStyle = lit ? '#000' : '#fff'
    g.fillRect(0, 0, S, S)
    g.fillStyle = lit ? '#ffcf8a' : '#2a2f33'
    g.fillRect(S * 0.12, S * 0.22, S * 0.76, S * 0.4)
    if (!lit) {
      g.fillStyle = '#d9d9d9'
      for (const x of [0.36, 0.62]) g.fillRect(S * x, S * 0.22, 2, S * 0.4)
    }
  })
}

// The observatory: a long white hall with a big dark dome in the middle and a smaller one at each
// end, a portico, the monument out on the lawn in front; facing the city.
function observatory () {
  const y = hillHeight(OBS.x, OBS.z)
  const white = 0xebe6da,
    dark = 0x3a3a38
  const walls = [
    tint(box(-24, 0, -8, 24, 11, 8), white),
    tint(box(-7, 0, 8, 7, 9.5, 12), white),
    tint(box(-27, 0, -6, -19, 13, 6), white),
    tint(box(19, 0, -6, 27, 13, 6), white),
    tint(
      new THREE.CylinderGeometry(9.5, 9.5, 3.2, 24).translate(0, 12.6, 0),
      white
    ),
    tint(box(-0.7, 0, 34, 0.7, 12, 35.4), 0xd9d3c4)
  ]
  const domes = [
    tint(
      new THREE.SphereGeometry(
        9.6,
        24,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ).translate(0, 14.2, 0),
      dark
    ),
    tint(
      new THREE.SphereGeometry(
        4.6,
        16,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ).translate(-23, 13, 0),
      dark
    ),
    tint(
      new THREE.SphereGeometry(
        4.6,
        16,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ).translate(23, 13, 0),
      dark
    )
  ]
  const at = g => merge(g).translate(OBS.x, y - 0.5, OBS.z)
  return { walls: at(walls), domes: at(domes), y }
}

export function buildHills (group) {
  const land = new THREE.Mesh(
    terrain(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: scrubTexture(),
      roughness: 0.98
    })
  )
  land.renderOrder = LAYER.hills
  land.receiveShadow = true
  group.add(land)

  // houses up the lower slopes (not on the sign's face, the observatory's spur or in the pass), and
  // trees, most of them down the canyons
  const houses = [],
    trees = [],
    lights = []
  const paints = [
    0xd9cdb8,
    0xcbb89c,
    0xbfa58a,
    0xc4876a,
    0xa9a49b,
    0xe0d6c8,
    0x8e8a83,
    0xd2c3a8
  ]
  for (let i = 0; i < 2600; i++) {
    const x = -440 + R() * 1470,
      u = 30 + Math.pow(R(), 1.2) * 260,
      z = -WALL - u
    hillNormal(x, z, _n)
    if (_n.y < 0.72 || Math.abs(x - PASS) < 60) continue
    if (Math.abs(x - SIGN.x) < 80 && Math.abs(z - SIGN.z) < 70) continue
    if (Math.hypot(x - OBS.x, z - OBS.z) < 80) continue
    if (!offRoad(x, z, 20)) continue
    // (each among trees: a garden's worth round it)
    if (R() < 0.45) {
      const tx = x + (R() - 0.5) * 22,
        tz = z + (R() - 0.5) * 18
      trees.push({ x: tx, z: tz, y: hillHeight(tx, tz), s: 1.4 + R() * 1.5 })
    }
    if (R() < 0.45 + u / 600) continue
    // a body of one or two storeys on the uphill ground, stilts down to the slope below it
    const w = 7 + R() * 6,
      d = 6 + R() * 4
    const hs = [-1, 1].flatMap(a =>
      [-1, 1].map(b => hillHeight(x + (a * w) / 2, z + (b * d) / 2))
    )
    const lo = Math.min(...hs),
      hi = Math.max(...hs) - 0.4
    const top = hi + 3.2 + (R() < 0.5 ? 3 : 0)
    houses.push({
      x,
      z,
      w,
      d,
      lo: lo - 0.5,
      hi,
      top,
      yaw: (R() - 0.5) * 0.3,
      color: paints[Math.floor(R() * paints.length)]
    })
    if (R() < 0.7)
      lights.push({
        x: x + (R() - 0.5) * w * 0.5,
        y: top - 1.8,
        z: z + d / 2 + 0.3,
        color: R() < 0.8 ? 0xffd29a : 0xdfe8ff,
        size: 2,
        k: 1.4
      })
  }
  for (let i = 0; i < 560; i++) {
    const x = -480 + R() * 2900,
      u = 10 + R() * 650,
      z = -WALL - u
    const canyon =
      hillNormal(x, z, _n).z < -0.15 || noise(x / 60, z / 60) > 0.62
    if ((canyon || R() < 0.25) && offRoad(x, z, 9))
      trees.push({ x, z, y: hillHeight(x, z), s: 1.8 + R() * 2.2 })
  }
  // (a unit box: its roof, vertices 8 to 11, greyer and on the plain wall of the texture)
  const shape = tint(box(-0.5, 0, -0.5, 0.5, 1, 0.5), 0xffffff)
  for (let i = 8; i < 12; i++) {
    shape.attributes.color.setXYZ(i, 0.72, 0.7, 0.68)
    shape.attributes.uv.setXY(i, 0.04, 0.04)
  }
  const homes = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    map: houseTexture(false),
    emissiveMap: houseTexture(true)
  })
  // (at night only some houses' windows are lit: which, by where each stands)
  homes.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vLit = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif`
      )
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= step(0.42, vLit);'
      )
  }
  scatter(
    group,
    shape,
    homes,
    houses,
    (h, m) => pose(m, h.x, h.hi, h.z, h.yaw, h.w, h.top - h.hi, h.d),
    { cell: 1600, color: (h, c) => c.set(h.color) }
  )
  const stilts = tint(box(-0.5, 0, -0.5, 0.5, 1, 0.5), 0x34302c)
  scatter(
    group,
    stilts,
    PLANT,
    houses.filter(h => h.hi - h.lo > 1),
    (h, m) =>
      pose(m, h.x, h.lo, h.z, h.yaw, h.w * 0.82, h.hi - h.lo, h.d * 0.8),
    { cell: 1600 }
  )
  const leaf = lump(1.6, up =>
    [0.13, 0.17, 0.08].map(v => v * (0.75 + 0.3 * (up + 1)))
  )
  leaf.scale(1, 0.85, 1).translate(0, 1.1, 0)
  scatter(
    group,
    leaf,
    PLANT,
    trees,
    (t, m) => pose(m, t.x, t.y, t.z, 0, t.s, t.s, t.s),
    {
      cell: 1600
    }
  )

  // the observatory, floodlit at night
  const obs = observatory()
  const walls = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7
  })
  const domes = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.4
  })
  group.add(new THREE.Mesh(obs.walls, walls), new THREE.Mesh(obs.domes, domes))
  for (const dx of [-26, -12, 0, 12, 26])
    lights.push({
      x: OBS.x + dx,
      y: obs.y + 1,
      z: OBS.z + 14,
      color: 0xfff1d6,
      size: 3,
      k: 1.2
    })

  const glow = glowMaterial({ haze: 0.4 })
  const pts = glowPoints(lights, glow)
  pts.visible = false
  group.add(pts)
  const sign = buildSign(group)
  return {
    night (k) {
      land.material.color.setScalar(1 - 0.6 * k) // (the hills dark under the moon)
      walls.emissive.setRGB(0.45, 0.43, 0.38).multiplyScalar(k)
      homes.emissive.setRGB(1, 0.85, 0.6).multiplyScalar(0.4 * k)
      glow.uniforms.uOn.value = k
      pts.visible = k > 0.01
      sign.night(k)
    }
  }
}
