// The storefronts round the ground floor of every building with shops (the sim's b.shop): each wall
// split into shops a few metres wide (narrower on Hollywood's strip, wider in the strip malls), each
// one flat quad carrying its own numbers for the shader (shopShader.js): its width, its kind (a café,
// a clothes shop, a store, a salon, a bar or an empty unit, in each neighbourhood's own mix), its
// sign, the piers either side, where its door is, the height of its glass, its stall riser and
// transom, the colour of its frame, what is stuck in its window, and a random number of its own for
// the rest; over some, a fabric awning. A stand-alone shop (a gas station's, a fast-food stand) is
// one business all round. A wall hidden against its neighbour's is left out. In front of each shop,
// on the pavement, a quad for the light it throws there at night. One mesh for all the shops (and
// their awnings), one for all their light.
import * as THREE from 'three'
import { query, rng, CURB_H } from '../sim/city.js'
import { BOARDS, BY_KIND, DECALS, shopSigns } from './shopTex.js'
import { shopMaterial, poolMaterial } from './shopShader.js'

const R = rng(4071)
// the share of each kind (café, clothes, store, salon, bar, empty) by neighbourhood
const MIX = {
  beach: [30, 24, 12, 12, 8, 8],
  boulevard: [20, 22, 14, 10, 18, 12],
  downtown: [24, 14, 20, 8, 12, 18],
  strip: [30, 8, 24, 20, 6, 12],
  venice: [30, 24, 10, 14, 12, 8]
}
// how wide a shop is, about (m)
const WIDE = { boulevard: 5, venice: 5.4, beach: 6, downtown: 6.4, strip: 6.8 }
const POOL = 3.3 // m the light reaches out over the pavement
const pick = w => {
  let x = R() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i
  return w.length - 1
}
// a tiled or painted surround instead of the building's own wall: black, green, oxblood, cream
const SURROUNDS = [0x161616, 0x1f3d2c, 0x4a1a1a, 0xe8dcc4].map(h =>
  new THREE.Color().setHex(h)
)

// A business: its kind (picked by the neighbourhood's mix, unless given), sign, colours, frame and
// trim, and its own random number
function business (b, kind = pick(MIX[b.area] || MIX.downtown)) {
  const signs = BY_KIND[kind]
  const sign = signs.length ? signs[Math.floor(R() * signs.length)] : 0
  const brand = new THREE.Color(
    signs.length ? BOARDS[sign].board : pickOf(['#7a6a58', '#5a6470'])
  )
  // what is stuck in the window: OPEN in neon, a bar's cocktail glass, OPEN 24 HRS, FOR LEASE;
  // and an empty shop's windows papered over (1) or whitewashed (2), or not
  const r = R()
  const decal = [
    r < 0.3 ? DECALS.open : -1,
    -1,
    r < 0.45 ? DECALS.open : r < 0.7 ? DECALS.allNight : -1,
    r < 0.2 ? DECALS.open : -1,
    r < 0.7 ? DECALS.glass : -1,
    r < 0.7 ? DECALS.lease : -1
  ][kind]
  const c = R()
  const cover = kind === 5 ? (c < 0.45 ? 1 : c < 0.7 ? 2 : 0) : 0
  return {
    kind,
    sign,
    brand,
    seed: R(),
    // black, dark bronze, silver, white, or the shop's own colour
    frame: pick([35, 20, 25, 10, 10]),
    riser: 0.35 + R() * 0.25,
    head: 3.05 + R() * 0.35,
    transom: R() < 0.55,
    trim: decal + 1 + 8 * cover,
    surround: R() < 0.25 ? SURROUNDS[Math.floor(R() * 4)] : null,
    // a fabric awning over the glass (most cafés, some clothes shops and salons): how far it
    // reaches out and how far it drops
    awning:
      R() < [0.55, 0.3, 0.06, 0.2, 0.12, 0][kind]
        ? [1.0 + R() * 0.35, 0.55 + R() * 0.25]
        : null
  }
}
const pickOf = l => l[Math.floor(R() * l.length)]

// the four walls of a tier: where each starts (a), along it (t), out of it (n), its length
function walls ({ x0, x1, z0, z1 }) {
  return [
    { a: [x0, z1], t: [1, 0], n: [0, 1], len: x1 - x0 },
    { a: [x1, z0], t: [-1, 0], n: [0, -1], len: x1 - x0 },
    { a: [x1, z1], t: [0, -1], n: [1, 0], len: z1 - z0 },
    { a: [x0, z0], t: [0, 1], n: [-1, 0], len: z1 - z0 }
  ]
}
// the point s along wall w and o out from it, [x, z]
const at = (w, s, o) => [
  w.a[0] + w.t[0] * s + w.n[0] * o,
  w.a[1] + w.t[1] * s + w.n[1] * o
]
// whether the stretch s0 to s1 of a wall stands against another building all along (so nobody
// can see it)
const hits = []
function hidden (w, s0, s1) {
  for (const k of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const [x, z] = at(w, s0 + (s1 - s0) * k, 0.3)
    query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, hits)
    const inside = hits.some(
      c =>
        c.kind === 'building' &&
        c.y0 < 1 &&
        c.y1 > 2.5 &&
        x > c.x0 &&
        x < c.x1 &&
        z > c.z0 &&
        z < c.z1
    )
    if (!inside) return false
  }
  return true
}

// quads with the attributes in spec (name: size), indexed
function quads (spec) {
  const data = Object.fromEntries(Object.keys(spec).map(k => [k, []]))
  const index = []
  let n = 0
  return {
    // the four corners a, b, c, d anticlockwise from the front, and the other attributes: one value
    // for all four corners, or (uv) four
    push (corners, vals) {
      for (const p of corners) data.position.push(...p)
      for (const k in vals)
        for (let i = 0; i < 4; i++)
          data[k].push(...(Array.isArray(vals[k][0]) ? vals[k][i] : vals[k]))
      index.push(n, n + 1, n + 2, n, n + 2, n + 3)
      n += 4
    },
    get count () {
      return n / 4
    },
    geometry () {
      const g = new THREE.BufferGeometry()
      for (const k in spec)
        g.setAttribute(k, new THREE.Float32BufferAttribute(data[k], spec[k]))
      g.setIndex(index)
      g.computeBoundingSphere()
      return g
    }
  }
}

// where each lit shop's light stands: out over the pavement in front of its middle (nightLights.js)
export const SHOP_SPOTS = []
export function shopfronts () {
  SHOP_SPOTS.length = 0
  const fronts = quads({
    position: 3,
    normal: 3,
    uv: 2,
    color: 3,
    shop: 4,
    shopDoor: 4,
    shopTrim: 4,
    shopBrand: 3
  })
  const pools = quads({ position: 3, uv: 2, shop: 4 })
  // one shop, from s0 to s1 along wall w, top high; tint: the building's colour
  function shopAt (w, s0, s1, top, biz, tint) {
    const W = s1 - s0
    const pier = Math.min(0.3 + R() * 0.14, W * 0.12)
    const inner = W - 2 * pier
    // the door: at one end of a narrow shop, at either end or in the middle of a wider one, a
    // pair in some wide ones (none in a sliver of a wall)
    let dw = inner > 7 && R() < 0.5 ? 1.8 : 1.0,
      dx = pier
    if (inner < dw + 0.4) dw = 0
    else if (inner < dw + 1.6)
      dx = R() < 0.5 ? pier + 0.08 : pier + inner - dw - 0.08
    else {
      const k = R()
      dx =
        k < 0.35
          ? pier + 0.1
          : k < 0.7
          ? pier + inner - dw - 0.1
          : pier + (inner - dw) / 2
    }
    const transom = biz.transom
      ? Math.min(2.45 + R() * 0.2, biz.head - 0.35)
      : 0
    const shop = [W, biz.kind, biz.sign, biz.seed]
    const col = biz.surround || tint
    const vals = {
      color: [col.r, col.g, col.b],
      shop,
      shopDoor: [pier, dx, dw, biz.head],
      shopTrim: [biz.riser, transom, biz.frame, biz.trim],
      shopBrand: [biz.brand.r, biz.brand.g, biz.brand.b]
    }
    // a quad across the shop from a to b (m along it), its bottom edge o0 out from the wall at
    // height y0 and its top edge o1 out at y1, facing nrm; v0 and v1 the shader's v along them
    const P = (s, o, y) => {
      const [x, z] = at(w, s0 + s, o)
      return [x, y, z]
    }
    const quad = (a, b, [o0, y0], [o1, y1], nrm, v0, v1) =>
      fronts.push([P(a, o0, y0), P(b, o0, y0), P(b, o1, y1), P(a, o1, y1)], {
        ...vals,
        normal: nrm,
        uv: [
          [a, v0],
          [b, v0],
          [b, v1],
          [a, v1]
        ]
      })
    const fwd = [w.n[0], 0, w.n[1]]
    quad(0, W, [0, 0], [0, top], fwd, 0, top)
    if (biz.awning && inner > 1.5) {
      // an awning over the glass: its slope, out from just over the glass and down, and the
      // valance hanging from its front edge, each with an underside (v less than 0 tells the
      // shader it is cloth: -1 to -2 down the slope, -2 to -3 down the valance)
      const [out, drop] = biz.awning,
        y0 = biz.head + 0.1,
        y1 = y0 - drop,
        l = Math.hypot(out, drop)
      const up = [(w.n[0] * drop) / l, out / l, (w.n[1] * drop) / l]
      const a = pier,
        b = W - pier,
        hem = [out, y1 - 0.24]
      quad(a, b, [out, y1], [0, y0], up, -2, -1)
      quad(a, b, [0, y0], [out, y1], up.map(v => -v), -1, -2)
      quad(a, b, hem, [out, y1], fwd, -3, -2)
      quad(b, a, hem, [out, y1], fwd.map(v => -v), -3, -2)
    }
    if (biz.kind === 5) return
    const [lx, lz] = at(w, (s0 + s1) / 2, 1.4)
    SHOP_SPOTS.push({ x: lx, y: Math.min(2.8, biz.head), z: lz })
    // the light on the pavement in front (anticlockwise seen from above)
    const y = CURB_H + 0.03
    const p = (s, o) => {
      const [x, z] = at(w, s, o)
      return [x, y, z]
    }
    pools.push(
      [
        p(s0 - 0.3, 0.02),
        p(s0 - 0.3, POOL),
        p(s1 + 0.3, POOL),
        p(s1 + 0.3, 0.02)
      ],
      {
        uv: [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0]
        ],
        shop
      }
    )
  }
  return {
    // the shops round the foot of tier t of building b, up to top; tint: the building's colour
    add (b, t, top, tint) {
      // (a stand-alone shop is one business all round: a gas station's store, a fast-food stand)
      const small = (t.x1 - t.x0) * (t.z1 - t.z0) < 250
      const one =
        b.kiosk !== undefined
          ? business(b, 2)
          : b.area === 'strip' && small
          ? business(b, 0)
          : null
      for (const w of walls(t)) {
        const n = Math.max(1, Math.round(w.len / (WIDE[b.area] || 6)))
        const shares = Array.from({ length: n }, () => 0.85 + R() * 0.3)
        const sum = shares.reduce((a, c) => a + c, 0)
        let s = 0
        for (const share of shares) {
          const s0 = s
          s += (share * w.len) / sum
          if (!hidden(w, s0, s))
            shopAt(w, s0, s, top, one || business(b), tint)
        }
      }
    },
    // the meshes, into group; returns night(k): the light on the pavement shown once it is dusk
    build (group) {
      const front = new THREE.Mesh(
        fronts.geometry(),
        shopMaterial(shopSigns())
      )
      front.name = 'storefronts'
      front.castShadow = true
      front.receiveShadow = true
      group.add(front)
      const light = new THREE.Mesh(pools.geometry(), poolMaterial())
      light.name = 'shop light'
      light.visible = false
      group.add(light)
      return {
        shops: fronts.count,
        night (k) {
          light.visible = k > 0.15
        }
      }
    }
  }
}
