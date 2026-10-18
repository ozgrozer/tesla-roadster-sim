// The Pacific, west of the city: past the promenade a broad beach runs north and south along the coast
// and drops down its steeper face into the water, which goes out to the horizon under the setting
// sun. The water is a shader: a few rolling swells and ripples for its surface, the evening sky in it
// at a glancing angle (the same sky: citySky.js), a glitter path under the low sun, clear turquoise
// over the shallows, deep blue further out, surf breaking along the beach, the pier's shadow on it, and
// at night the Ferris wheel's lights shimmering in it. Lifeguard towers stand along the beach, and a
// groyne of rocks runs out into the sea at each end of it.
import * as THREE from 'three'
import { LAYER, merge, box, tint } from './geo.js'
import { canvasTex, speckle } from './scene.js'
import { SKY, SKY_GLSL } from './citySky.js'
import { PROMENADE, rng } from '../sim/city.js'
import { SHORE, WALL, GROYNE, PIER, WHEEL } from '../sim/edge.js'

const SAND = -0.03 // the beach's level (a little under the promenade's top)
const FACE = 12 // m: the beach's face, from the flat sand down to the sea bed
const FLOOR = -3 // the sea bed at the foot of the face
const WATER = -2.2 // the sea's level
const COAST = 2600 // m north and south the beach runs on
// where the water meets the sand (x = -WET), a little up the face
const WET = SHORE + (FACE * (SAND - WATER)) / (SAND - FLOOR)

function sandTexture () {
  const t = canvasTex(512, (g, S) => {
    g.fillStyle = '#dcc9a0'
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * S,
        y = Math.random() * S,
        r = 30 + Math.random() * 90
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(
        0,
        Math.random() < 0.5 ? 'rgba(170,140,95,0.14)' : 'rgba(255,245,220,0.12)'
      )
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    speckle(g, 16000, S, 0.14, false)
    speckle(g, 9000, S, 0.16, true)
  })
  t.repeat.set(1 / 14, 1 / 14)
  return t
}

// the pier's deck as it shades the water: each rectangle moved away from the sun (sun: toward it)
// by the height it stands over the water, into out (Vector4s: x0, x1, z0, z1)
function deckShadows (sun, out) {
  const k = (0.3 - WATER) / Math.max(sun.y, 0.07)
  const dx = -sun.x * k,
    dz = -sun.z * k
  PIER.deck.forEach((d, i) =>
    out[i].set(d.x0 + dx, d.x1 + dx, d.z0 + dz, d.z1 + dz)
  )
  return out
}
// (the sky's uniforms the water reads: all but the clock, which it has its own of)
const SEA_SKY = Object.fromEntries(
  Object.entries(SKY).filter(([k]) => k !== 'uTime')
)

function seaMaterial () {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShore: { value: WET - 1 },
      uDeck: { value: PIER.deck.map(() => new THREE.Vector4()) },
      uWheel: { value: new THREE.Vector3(WHEEL.x, WHEEL.hub, WHEEL.z) }
    }
  ])
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...SEA_SKY },
    fog: true,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uShore;
      uniform vec4 uDeck[${PIER.deck.length}]; uniform vec3 uWheel; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      ${SKY_GLSL}
      // the surface's slope: long swells, then shorter chop and ripples, each drifting its own way
      vec2 slope(vec2 p, float t){
        vec2 s = vec2(0.0);
        vec3 W[5];
        W[0] = vec3(0.86, 0.5, 0.045); W[1] = vec3(0.3, 0.95, 0.07); W[2] = vec3(-0.6, 0.8, 0.13);
        W[3] = vec3(0.95, -0.3, 0.21); W[4] = vec3(-0.2, -0.98, 0.33);
        for (int i = 0; i < 5; i++) {
          float k = W[i].z, a = 0.9 / (1.0 + float(i) * 1.6);
          float ph = dot(W[i].xy, p) * k + t * sqrt(9.81 * k);
          s += W[i].xy * k * a * cos(ph);
        }
        float n1 = noise(p * 0.55 + t * 0.4), n2 = noise(p * 0.55 + vec2(5.2, 1.3) - t * 0.35);
        s += vec2(n1 - 0.5, n2 - 0.5) * 0.18;
        return s;
      }
      void main(){
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        // ripples fade with distance (a far sea reads smooth), the swells stay
        vec2 s = slope(vW.xz, uTime) * mix(1.0, 0.35, smoothstep(60.0, 600.0, dist));
        vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 sky = skyBase(r);
        // (the sun's glitter path by day, the moon's at night)
        float sd = max(dot(r, uNight > 0.5 ? uMoon : uSun), 0.0);
        float grey = smoothstep(0.55, 1.0, uClouds);
        // the pier's shadow on the water, soft at its edges
        float shade = 1.0;
        for (int i = 0; i < ${PIER.deck.length}; i++) {
          vec4 d = uDeck[i];
          vec2 in2 = min(vW.xz - d.xz, d.yw - vW.xz);
          shade = min(shade, 1.0 - 0.42 * smoothstep(-0.8, 0.8, min(in2.x, in2.y)));
        }
        shade = mix(1.0, shade, 1.0 - grey);
        // deep blue out at sea, turquoise over the shallows by the beach
        float out_ = -vW.x - uShore;
        vec3 deep = vec3(0.008, 0.07, 0.22), shallow = vec3(0.05, 0.31, 0.35);
        vec3 body = mix(shallow, deep, smoothstep(2.0, 70.0, out_));
        body = mix(body, vec3(0.003, 0.012, 0.03), uNight * 0.92);
        // (grey under a grey sky)
        body = mix(body, vec3(0.05, 0.08, 0.1) * (1.0 - 0.8 * uNight), grey * 0.6);
        // light coming up through a wave's face
        body += vec3(0.02, 0.12, 0.13) * max(0.0, s.x * 0.8 + s.y * 0.4);
        // (the sky in it a little cooler than the sky itself: the water's own blue shows through)
        vec3 col = mix(body, sky * vec3(0.78, 0.88, 1.08), fres * mix(0.7, 0.4, uNight));
        // the sun's glitter path (the moon's at night, cold and fainter), not where the pier shades it
        vec3 glint = mix(vec3(1.0, 0.75, 0.45), vec3(0.75, 0.8, 1.0) * 0.35, uNight);
        col += (glint * pow(sd, 260.0) * 9.0 + mix(vec3(1.0, 0.6, 0.3), vec3(0.2, 0.22, 0.3), uNight) * pow(sd, 40.0) * 0.35) * shade * (1.0 - 0.9 * grey);
        col *= mix(1.0, shade, 1.0 - uNight * 0.8);
        // at night the Ferris wheel's lights shimmer in it
        float wl = max(dot(r, normalize(uWheel - vW)), 0.0);
        col += vec3(1.0, 0.55, 0.75) * (pow(wl, 900.0) * 5.0 + pow(wl, 90.0) * 0.12) * uNight;
        // surf: a foam line rolling up the beach, and streaks of it just offshore
        float swash = sin(out_ * 0.9 - uTime * 1.6 + noise(vW.xz * 0.08) * 6.0);
        float foam = smoothstep(2.6, 0.0, out_) * (0.55 + 0.45 * swash);
        foam += smoothstep(16.0, 4.0, out_) * smoothstep(0.75, 0.95, swash) * noise(vW.xz * 0.6 + uTime * 0.3) * 0.7;
        col = mix(col, vec3(0.92, 0.9, 0.86) * (1.0 - 0.8 * uNight) * shade, clamp(foam, 0.0, 0.9));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`
  })
}

// The beach: flat sand from under the promenade's edge out to SHORE, all along the coast, then its
// face sloping down under the water (UVs in metres for the sand texture; the face darker, wet)
function beach () {
  const pos = [],
    uvs = [],
    col = []
  const strip = (x0, y0, x1, y1, c0, c1) => {
    const a = [x0, y0, -COAST],
      b = [x1, y1, -COAST],
      c = [x1, y1, COAST],
      d = [x0, y0, COAST]
    // (running west, x1 < x0: wound to face up)
    for (const [p, k] of [
      [a, c0],
      [c, c1],
      [d, c0],
      [a, c0],
      [b, c1],
      [c, c1]
    ]) {
      pos.push(...p)
      uvs.push(p[0], p[2])
      col.push(k, k * 0.98, k * 0.95)
    }
  }
  strip(-PROMENADE + 1, SAND, -SHORE, SAND, 1, 1)
  strip(-SHORE, SAND, -SHORE - FACE, FLOOR, 1, 0.62)
  strip(-SHORE - FACE, FLOOR, -SHORE - 60, -9, 0.62, 0.5)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}
// the sand's height at x on the beach's face
const sandAt = x =>
  x > -SHORE ? SAND : SAND + (FLOOR - SAND) * Math.min(1, (-SHORE - x) / FACE)

// LA County's lifeguard towers: a hut on four legs over the sand, facing the sea, with a deck and a
// ramp down to the beach; and the groynes' rocks
const R = rng(88)
function tower (x, z, paint) {
  const f = 1.5 // the floor, over the flat beach
  const parts = [
    tint(box(-1.9, f, -1.8, 1.9, f + 0.2, 1.8), 0xd8d4cc),
    tint(box(-0.6, f + 0.2, -1.4, 1.6, f + 2.5, 1.4), paint),
    tint(box(-0.66, f + 1.2, -1.2, -0.62, f + 2.1, 1.2), 0x1d2328),
    tint(box(-1, f + 2.5, -1.8, 1.9, f + 2.68, 1.8), 0xefefea),
    tint(box(-1.9, f + 0.2, -1.8, -1.84, f + 1.25, 1.8), 0xefefea),
    tint(
      box(-0.5, -0.1, 0, 0.5, 0.1, 5)
        .rotateX(0.5)
        .translate(0.9, f, 1.8),
      0xb59a74
    )
  ]
  for (const [lx, lz] of [
    [-1.7, -1.6],
    [1.7, -1.6],
    [-1.7, 1.6],
    [1.7, 1.6]
  ])
    parts.push(
      tint(
        box(lx - 0.1, sandAt(x + lx) - 0.3, lz - 0.1, lx + 0.1, f, lz + 0.1),
        0x8d8d8a
      )
    )
  return parts.map(p => p.translate(x, 0, z))
}
function rocks (z, out) {
  for (let x = GROYNE.x1 + 1; x > GROYNE.x0 + 2; x -= 1.4 + R() * 0.8) {
    const r = 0.9 + R() * 0.9
    const g = new THREE.DodecahedronGeometry(r, 0)
    g.scale(1 + R() * 0.5, 0.6 + R() * 0.4, 1 + R() * 0.5)
    g.rotateY(R() * 6.3)
    const y = Math.max(sandAt(x), FLOOR) + r * 0.3
    g.translate(x, y, z + (R() - 0.5) * GROYNE.w * 0.6)
    const k = 0.42 + R() * 0.16
    out.push(tint(g, new THREE.Color(k, k * 0.95, k * 0.9)))
  }
}

// returns { update (the water moves), night(k) (k = 1: night) }
export function buildSea (group) {
  const sand = new THREE.MeshStandardMaterial({
    map: sandTexture(),
    vertexColors: true,
    roughness: 0.96
  })
  const sandMesh = new THREE.Mesh(beach(), sand)
  sandMesh.receiveShadow = true
  sandMesh.renderOrder = LAYER.beach
  group.add(sandMesh)
  // the towers along the beach (out past where the car can drive, at the top of its face) and the
  // rocks of the groynes
  const parts = []
  const paints = [0x8fc3dc, 0x9ad0c9, 0xe8c26a, 0x8fc3dc, 0xd88f7d, 0x8fc3dc]
  ;[-1180, -820, -360, -170, 175, 365, 800, 1150].forEach((z, i) =>
    parts.push(...tower(-SHORE - 4.5, z, paints[i % paints.length]))
  )
  rocks(-WALL - GROYNE.w / 2, parts)
  rocks(WALL + GROYNE.w / 2, parts)
  const things = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  )
  things.receiveShadow = true
  group.add(things)
  // the water, out to the horizon (its near edge under the beach's face)
  const mat = seaMaterial()
  const w = 3600
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 2 * COAST + 2400)
      .rotateX(-Math.PI / 2)
      .translate(-SHORE - 6 - w / 2, 0, 0),
    mat
  )
  sea.position.y = WATER
  sea.renderOrder = LAYER.sea
  group.add(sea)
  // (the pier's shadow on the water follows the sun round)
  const deck = mat.uniforms.uDeck.value
  return {
    update: t => {
      mat.uniforms.uTime.value = t
      deckShadows(SKY.uSun.value, deck)
    }
  }
}
