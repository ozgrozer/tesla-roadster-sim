// The 21 m curved wall, the parked lineup and the solid obstacles around them.
import { DEG } from './constants.js'

// ---------- The wall: arc-length parametrised profile in the x-y plane ----------
export const TRACK = (() => {
  const W = 6.6,
    X0 = -4
  const segs = [
    { len: 4, a0: 0, a1: 0 }, // entry lip
    { len: 15.5, a0: 0, a1: 86 }, // bottom transition
    { len: 3, a0: 86, a1: 100 }, // past vertical
    { len: 12.5, a0: 100, a1: 170 }, // over the top
    { len: 6, a0: 170, a1: 170 } // inverted lip, 170 deg pitch
  ]
  let acc = 0
  for (const g of segs) {
    g.s0 = acc
    acc += g.len
    g.a0r = g.a0 * DEG
    g.a1r = g.a1 * DEG
  }
  const L = acc
  const seg = s => {
    for (const g of segs) if (s < g.s0 + g.len) return g
    return segs[segs.length - 1]
  }
  function theta (s) {
    if (s <= 0) return 0
    if (s >= L) return segs[segs.length - 1].a1r
    const g = seg(s),
      u = (s - g.s0) / g.len
    return g.a0r + (g.a1r - g.a0r) * (3 * u * u - 2 * u * u * u)
  }
  function kappa (s) {
    if (s <= 0 || s >= L) return 0
    const g = seg(s),
      u = (s - g.s0) / g.len
    return ((g.a1r - g.a0r) * 6 * u * (1 - u)) / g.len
  }
  const ds = 0.1,
    n = Math.round(L / ds) + 1
  const xs = new Float64Array(n),
    ys = new Float64Array(n)
  let x = X0,
    y = 0
  xs[0] = x
  ys[0] = y
  const sub = 20,
    h = ds / sub
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < sub; j++) {
      const t = theta((i - 1) * ds + (j + 0.5) * h)
      x += Math.cos(t) * h
      y += Math.sin(t) * h
    }
    xs[i] = x
    ys[i] = y
  }
  const sEnd = (n - 1) * ds,
    thEnd = theta(L)
  function point (s, out) {
    if (s <= 0) {
      out.x = X0 + s
      out.y = 0
      return out
    }
    if (s >= sEnd) {
      const e = s - sEnd
      out.x = xs[n - 1] + Math.cos(thEnd) * e
      out.y = ys[n - 1] + Math.sin(thEnd) * e
      return out
    }
    const f = s / ds,
      i = Math.floor(f),
      t = f - i
    out.x = xs[i] + (xs[i + 1] - xs[i]) * t
    out.y = ys[i] + (ys[i + 1] - ys[i]) * t
    return out
  }
  let maxX = -Infinity
  for (let i = 0; i < n; i++) maxX = Math.max(maxX, xs[i])
  const lip = { x: xs[n - 1], y: ys[n - 1] }
  const slab = 0.45
  return {
    W,
    X0,
    L,
    segs,
    ds,
    n,
    xs,
    ys,
    theta,
    kappa,
    point,
    maxX,
    lip,
    slab,
    sHold: L - 4.0,
    baseS: 2.3, // start mark: the whole car on the flat beginning of the platform, rear at its edge
    lipStart: L - 6,
    towerX0: maxX + slab + 0.6,
    towerX1: maxX + slab + 3.6,
    towerTop: lip.y + 3.4
  }
})()

// Parked lineup for stunt 2 (broadside, long axis along z)
export const LINEUP = [
  {
    name: 'Cybercab',
    kind: 'cab',
    x: -252.0,
    w: 1.95,
    h: 1.45,
    l: 4.2,
    color: 0xc9b37e
  },
  {
    name: 'Cybertruck',
    kind: 'truck',
    x: -256.3,
    w: 2.2,
    h: 1.9,
    l: 5.7,
    color: 0xa9adb3
  },
  {
    name: 'Semi',
    kind: 'semi',
    x: -261.0,
    w: 2.6,
    h: 3.9,
    l: 6.4,
    color: 0xc9cdd3
  },
  {
    name: 'Model Y',
    kind: 'y',
    x: -265.7,
    w: 1.98,
    h: 1.62,
    l: 4.75,
    color: 0x1d3f8f
  },
  {
    name: 'Model 3',
    kind: 'm3',
    x: -270.0,
    w: 1.93,
    h: 1.44,
    l: 4.72,
    color: 0xb3121b
  }
]
for (const c of LINEUP)
  c.box = {
    x0: c.x - c.w / 2,
    x1: c.x + c.w / 2,
    y0: 0,
    y1: c.h,
    z0: -c.l / 2,
    z1: c.l / 2
  }
export const LINEUP_FIRST = Math.max(...LINEUP.map(c => c.box.x1))
export const LINEUP_LAST = Math.min(...LINEUP.map(c => c.box.x0))
export const SOLIDS = [
  ...LINEUP.map(c => ({ ...c.box, name: c.name })),
  {
    name: 'tower',
    x0: TRACK.towerX0,
    x1: TRACK.towerX1,
    y0: 0,
    y1: TRACK.towerTop,
    z0: -TRACK.W / 2 - 0.6,
    z1: TRACK.W / 2 + 0.6
  },
  {
    name: 'gantry',
    x0: TRACK.lip.x - 0.4,
    x1: TRACK.towerX1,
    y0: TRACK.lip.y + 0.55,
    y1: TRACK.towerTop,
    z0: -TRACK.W / 2 - 0.6,
    z1: TRACK.W / 2 + 0.6
  }
]
