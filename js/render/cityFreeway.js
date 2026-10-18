// The freeways behind the sound walls, east and south (LANDMARKS.freeways): concrete decks on
// hammerhead columns ten metres up, three lanes each way between jersey barriers, the southern one
// climbing over the eastern in a stack past the city's corner and, at its west end, coming down to
// the ground and into a tunnel short of the beach. Their traffic is moved by the vertex shader alone
// (nothing per car on the CPU, one draw call): each lane has its speed and its cars their place in
// it, the evening rush crawling out of town on one side and flowing in on the other, and at night
// streams of white headlights and red tail lights, glowing over the barriers.
import * as THREE from 'three'
import { merge, box, tint } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { glowMaterial } from './cityGlow.js'
import { LANDMARKS } from '../sim/areas.js'
import { rng } from '../sim/city.js'

const R = rng(1010)
const [EAST, SOUTH] = LANDMARKS.freeways
const HW = 14 // the deck's half-width
const LANE = 3.6
const GIRDER = 1.8
// how high each deck's top is along it (s, m from its start), between these points
const PROFILES = [
  [
    [0, 9],
    [EAST.z1 - EAST.z0, 9]
  ],
  [
    [0, -9],
    [24, -0.4],
    [26, 0.05],
    [40, 0.05],
    [210, 9],
    [850, 9],
    [940, 18],
    [1070, 18],
    [1160, 9],
    [SOUTH.x1 - SOUTH.x0, 9]
  ]
]
const WAYS = [
  // start (x, z), direction (x, z), length; and the stretch its traffic runs round (from, len):
  // cars leave it out of sight, deep in the pass, far off in the haze or in the tunnel, and come
  // back in at its other end
  {
    x: EAST.x0,
    z: EAST.z0,
    dx: 0,
    dz: 1,
    len: EAST.z1 - EAST.z0,
    from: -1100 - EAST.z0,
    run: 2600
  },
  {
    x: SOUTH.x0,
    z: SOUTH.z0,
    dx: 1,
    dz: 0,
    len: SOUTH.x1 - SOUTH.x0,
    from: 0,
    run: 1970
  }
]
export function deckHeight (k, s) {
  const p = PROFILES[k]
  for (let i = 1; i < p.length; i++)
    if (s <= p[i][0])
      return (
        p[i - 1][1] +
        ((p[i][1] - p[i - 1][1]) * (s - p[i - 1][0])) / (p[i][0] - p[i - 1][0])
      )
  return p[p.length - 1][1]
}
// the same in GLSL: deck(k, s)
const f = n => n.toFixed(2)
const PROFILE_GLSL = `float deck (float k, float s) {
  ${PROFILES.map(
    (p, k) => `if (k < ${k}.5) {
    ${p
      .slice(1)
      .map(
        ([s1, y1], i) =>
          `if (s <= ${f(s1)}) return ${f(p[i][1])} + ${f(
            y1 - p[i][1]
          )} * (s - ${f(p[i][0])}) / ${f(s1 - p[i][0])};`
      )
      .join('\n    ')}
    return ${f(p[p.length - 1][1])};
  }`
  ).join('\n  ')}
  return 9.0;
}`

// ---------- the structure ----------
// where along freeway k (from s0) a station goes: at every break in its height, 48 m apart
// between them, 12 m apart on the ramps
function stations (k, s0) {
  const out = [s0],
    p = PROFILES[k]
  for (let i = 1; i < p.length; i++) {
    const [a, ya] = p[i - 1],
      [b, yb] = p[i]
    const step = ya === yb ? 48 : 12
    for (let s = Math.max(a, s0) + step; s < b; s += step)
      if (s > out[out.length - 1]) out.push(s)
    if (b > s0) out.push(b)
  }
  return out
}
// a long box swept along a freeway between stations, its cross-section u0..u1 across, v0..v1 up
// from the deck's top; each face its own colour (top, sides, underside: null leaves a face out,
// where nothing would see it)
function sweep (k, u0, u1, v0, v1, cols, out, s0 = 0) {
  const w = WAYS[k],
    pos = [],
    col = [],
    uv = []
  // (u across, to the right of the way it runs; UVs in metres across and along)
  const at = (s, u, v) => [
    w.x + w.dx * s - w.dz * u,
    deckHeight(k, s) + v,
    w.z + w.dz * s + w.dx * u,
    u + HW,
    s
  ]
  function quad (a, b, c, d, c0) {
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2])
      uv.push(p[3], p[4])
      col.push(...c0)
    }
  }
  const st = stations(k, s0)
  for (let i = 1; i < st.length; i++) {
    const s = st[i - 1],
      t = st[i]
    // (each face wound to face out)
    quad(at(s, u0, v1), at(s, u1, v1), at(t, u1, v1), at(t, u0, v1), cols[0])
    if (cols[1]) {
      quad(at(s, u1, v0), at(t, u1, v0), at(t, u1, v1), at(s, u1, v1), cols[1])
      quad(at(s, u0, v0), at(s, u0, v1), at(t, u0, v1), at(t, u0, v0), cols[1])
    }
    if (cols[2])
      quad(at(s, u0, v0), at(t, u0, v0), at(t, u1, v0), at(s, u1, v0), cols[2])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  out.push(g)
}
function deckTexture () {
  const t = canvasTex(256, (g, S) => {
    g.fillStyle = '#4a4b4e'
    g.fillRect(0, 0, S, S)
    speckle(g, 6000, S, 0.25, false)
    speckle(g, 2500, S, 0.12, true)
    // lane lines (28 m across the tile, 12 m along it): dashes 3 m long between the lanes, solid
    // along the shoulders
    g.fillStyle = 'rgba(225,222,210,0.85)'
    const m = S / 28
    for (const u of [-8, -4.4, 4.4, 8])
      g.fillRect((u + 14) * m - 1, 0, 2, S / 4)
    for (const u of [-11.6, -0.8, 0.8, 11.6])
      g.fillRect((u + 14) * m - 1, 0, 2, S)
  })
  t.repeat.set(1 / 28, 1 / 12)
  return t
}

// ---------- the traffic ----------
// per lane: the freeway, its offset across (to the right of the way it runs), which way its cars go,
// their speed and spacing
function lanes () {
  const out = []
  for (let k = 0; k < 2; k++)
    for (const dir of [1, -1]) {
      // (out of town is the jam: north on the east freeway, west on the south one; each way keeps
      // to its right)
      const jam = dir < 0
      for (let l = 0; l < 3; l++) {
        out.push({
          k,
          u: dir * (0.8 + LANE * (l + 0.5)),
          dir,
          speed: jam ? 3 + l * 2.2 + R() * 1.5 : 24 + l * 3 + R() * 2,
          gap: jam ? 13 + l * 3 : 38 + R() * 14
        })
      }
    }
  return out
}
const CAR_COLORS = [
  0xe8e8e6,
  0x1c1d20,
  0x8c9096,
  0x5c6168,
  0x9b2d2b,
  0x2b4a72,
  0xd8d2c4,
  0x40463c
]

export function buildFreeway (group) {
  // the decks, barriers and columns: concrete in its vertex colours, the road on top textured
  const concrete = [],
    roads = []
  const C = {
    top: [0.74, 0.72, 0.68],
    side: [0.66, 0.64, 0.6],
    under: [0.34, 0.33, 0.32]
  }
  for (let k = 0; k < 2; k++) {
    const s0 = k === 1 ? 25 : 0
    sweep(k, -HW, HW, -GIRDER, 0, [C.top, C.side, C.under], concrete, s0)
    for (const u of [-HW, HW - 0.45])
      sweep(k, u, u + 0.45, 0, 0.95, [C.top, C.side, null], concrete, s0)
    sweep(k, -0.3, 0.3, 0, 0.85, [C.top, C.side, null], concrete, s0)
    sweep(
      k,
      -HW + 0.45,
      HW - 0.45,
      0.01,
      0.02,
      [[1, 1, 1], null, null],
      roads,
      s0
    )
    // hammerhead columns where it stands up off the ground (not over the other freeway)
    const w = WAYS[k]
    for (let s = s0 + 30; s < w.len; s += 36) {
      const y = deckHeight(k, s) - GIRDER,
        x = w.x + w.dx * s,
        z = w.z + w.dz * s
      if (y < 3 || (k === 1 && Math.abs(x - EAST.x0) < 22)) continue
      const along = w.dx ? 'x' : 'z'
      const col = box(-1.1, -2, -1.1, 1.1, y - 1.3, 1.1),
        cap =
          along === 'x'
            ? box(-0.9, y - 1.4, -HW + 2.5, 0.9, y, HW - 2.5)
            : box(-HW + 2.5, y - 1.4, -0.9, HW - 2.5, y, 0.9)
      concrete.push(tint(col, 0xa8a49c).translate(x, 0, z))
      concrete.push(tint(cap, 0x9c988f).translate(x, 0, z))
    }
  }
  // the tunnel's portal, where the south freeway goes under the city by the beach
  const px = SOUTH.x0 + 25
  concrete.push(
    tint(
      box(px - 1.2, -1, SOUTH.z0 - HW - 3, px, 7.5, SOUTH.z0 + HW + 3),
      0xb3ada2
    ),
    tint(
      box(px - 0.4, 0, SOUTH.z0 - HW + 1, px + 0.02, 5.6, SOUTH.z0 + HW - 1),
      0x050506
    )
  )
  const structure = new THREE.Mesh(
    merge(concrete),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 })
  )
  structure.receiveShadow = true
  const road = new THREE.Mesh(
    merge(roads),
    new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.9 })
  )
  road.receiveShadow = true
  group.add(structure, road)

  // the cars: a body and a cabin, 4.6 m long (a truck now and then: scaled); per car its lane and
  // where along it it starts
  const L = lanes(),
    list = []
  L.forEach((l, i) => {
    for (
      let s = R() * l.gap;
      s < WAYS[l.k].run - l.gap;
      s += l.gap * (0.75 + R() * 0.5)
    ) {
      const truck = R() < 0.12
      list.push({
        i,
        s,
        truck,
        color: CAR_COLORS[Math.floor(R() * CAR_COLORS.length)]
      })
    }
  })
  // (no bottoms: the deck hides them)
  const open = g => {
    const i = Array.from(g.index.array)
    i.splice(18, 6)
    g.setIndex(i)
    return g
  }
  const body = merge([
    tint(open(box(-2.3, 0.3, -0.9, 2.3, 1.05, 0.9)), 0xffffff),
    tint(open(box(-1.2, 1.05, -0.8, 1.0, 1.5, 0.8)), 0x9aa0a8)
  ])
  const n = list.length
  const lane = new Float32Array(n * 4),
    phase = new Float32Array(n),
    colors = new Float32Array(n * 3),
    size = new Float32Array(n * 2)
  const c = new THREE.Color()
  list.forEach((car, j) => {
    const l = L[car.i]
    lane.set([l.k, l.u, l.dir, l.speed], j * 4)
    phase[j] = car.s
    c.set(car.truck ? 0xe9e6df : car.color)
    colors.set([c.r, c.g, c.b], j * 3)
    size.set(car.truck ? [3.4, 2.4] : [1, 1], j * 2)
  })
  const geo = new THREE.InstancedBufferGeometry().copy(body)
  geo.instanceCount = n
  geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 4))
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(500, 0, 300), 2000)
  const uTime = { value: 0 },
    uNight = { value: 0 }
  const MOVE = `
    float len = aLane.x < 0.5 ? ${f(WAYS[0].run)} : ${f(WAYS[1].run)};
    float s = (aLane.x < 0.5 ? ${f(WAYS[0].from)} : ${f(
    WAYS[1].from
  )}) + mod(aPhase + aLane.z * aLane.w * uTime, len);
    vec2 way = aLane.x < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
    vec2 from = aLane.x < 0.5 ? vec2(${f(WAYS[0].x)}, ${f(
    WAYS[0].z
  )}) : vec2(${f(WAYS[1].x)}, ${f(WAYS[1].z)});
    vec2 at = from + way * s + vec2(-way.y, way.x) * aLane.y;
    vec2 head = way * aLane.z;
    float y = deck(aLane.x, s);`
  const cars = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime,
          uNight,
          uSun: { value: new THREE.Vector3(-66, 30, 28).normalize() }
        }
      ]),
      vertexShader: `attribute vec4 aLane; attribute float aPhase; attribute vec3 aColor; attribute vec2 aSize;
        uniform float uTime; varying vec3 vC, vN, vL;
        #include <fog_pars_vertex>
        ${PROFILE_GLSL}
        void main(){
          ${MOVE}
          vec3 l = position * vec3(aSize.x, aSize.y, 1.0);
          vL = vec3(l.x / aSize.x, l.y, l.z);
          vec3 w = vec3(at.x + head.x * l.x - head.y * l.z, y + l.y, at.y + head.y * l.x + head.x * l.z);
          vN = vec3(head.x * normal.x - head.y * normal.z, normal.y, head.y * normal.x + head.x * normal.z);
          vC = aColor * color;
          vec4 mvPosition = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uNight; uniform vec3 uSun; varying vec3 vC, vN, vL;
        #include <fog_pars_fragment>
        void main(){
          vec3 n = normalize(vN);
          vec3 col = vC * mix(0.5 + 0.35 * n.y + 1.1 * max(dot(n, uSun), 0.0) * vec3(1.0, 0.8, 0.6), vec3(0.05, 0.055, 0.08), uNight);
          // head and tail lights, front and back at lamp height
          float lamp = step(0.45, vL.y) * step(vL.y, 0.8) * step(0.35, abs(vL.z));
          col += uNight * lamp * (step(2.29, vL.x) * vec3(3.0, 2.8, 2.4) + step(vL.x, -2.29) * vec3(2.6, 0.12, 0.08));
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
      vertexColors: true,
      fog: true
    })
  )
  cars.frustumCulled = true
  group.add(cars)

  // their lights' glow, at night: a head and a tail light's to each car, over the barriers
  const glow = glowMaterial({
    haze: 0.45,
    move: `${MOVE}
      p = vec3(at.x + head.x * position.x, y + 0.65, at.y + head.y * position.x);
      // (a light shows only on its own side: no head light's glow round a car seen from behind)
      vec3 toCam = normalize(cameraPosition - p);
      k = smoothstep(-0.15, 0.35, dot(vec3(head.x, 0.0, head.y) * sign(position.x), toCam));`,
    uniforms: { uTime }
  })
  glow.vertexShader = glow.vertexShader.replace(
    'void main(){',
    `attribute vec4 aLane; attribute float aPhase; uniform float uTime;
    ${PROFILE_GLSL}
    void main(){`
  )
  const gGeo = new THREE.InstancedBufferGeometry()
  gGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([2.35, 0, 0, -2.35, 0, 0], 3)
  )
  gGeo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([2.2, 2.1, 1.8, 2.0, 0.1, 0.06], 3)
  )
  gGeo.setAttribute('size', new THREE.Float32BufferAttribute([3.2, 2.6], 1))
  gGeo.setAttribute('aLane', geo.attributes.aLane)
  gGeo.setAttribute('aPhase', geo.attributes.aPhase)
  gGeo.instanceCount = n
  gGeo.boundingSphere = geo.boundingSphere
  const lights = new THREE.Points(gGeo, glow)
  lights.renderOrder = 1
  lights.visible = false
  group.add(lights)

  return {
    update (t) {
      uTime.value = t
    },
    night (k) {
      uNight.value = k
      glow.uniforms.uOn.value = k
      lights.visible = k > 0.01
    }
  }
}
