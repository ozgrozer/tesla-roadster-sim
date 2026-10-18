// The city going on, east and south past the freeway, to the horizon: the street grid carried on
// from the city's own (a street every 96 m, an avenue every fourth), low stucco boxes of one to three
// storeys with flat pale roofs, yards, car parks and the odd turquoise pool between them, a few
// towers far off, palms standing over the roofs, all fading into the haze. At night the streets glow
// sodium orange off to the horizon, street lights and windows twinkling along them.
import * as THREE from 'three'
import { LAYER, merge, box, tint } from './geo.js'
import { glowMaterial, glowPoints } from './cityGlow.js'
import { palmsAt } from './cityKit.js'
import { PITCH, PROMENADE, rng } from '../sim/city.js'
import { WALL } from '../sim/edge.js'
import { LANDMARKS } from '../sim/areas.js'

const R = rng(2024)
const FAR = 2600 // the ground runs out this far
const BUILT = 1750 // buildings this far (past it the haze has them)
const [EAST, SOUTH] = LANDMARKS.freeways
const near = (v, c, w) => Math.abs(v - c) < w
// whether (x, z) is clear of the streets, the freeways and the city
function clear (x, z, r) {
  const sx = x - Math.round(x / PITCH) * PITCH,
    sz = z - Math.round(z / PITCH) * PITCH
  if (Math.abs(sx) < 9 + r || Math.abs(sz) < 9 + r) return false
  if (near(x, EAST.x0, 17 + r) || near(z, SOUTH.z0, 17 + r)) return false
  return x > WALL + 2 + r || z > WALL + 2 + r
}

function groundMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uNight: { value: 0 } }
    ]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uNight; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // how much of a line of width w every pitch m along v covers here, smoothed over a pixel
      float lines(float v, float pitch, float w){
        float d = abs(fract(v / pitch + 0.5) - 0.5) * pitch, f = fwidth(v);
        return 1.0 - smoothstep(w * 0.5 - f, w * 0.5 + f, d);
      }
      void main(){
        vec2 p = vW.xz;
        float street = max(lines(p.x, ${PITCH.toFixed(
          1
        )}, 14.0), lines(p.y, ${PITCH.toFixed(1)}, 14.0));
        float avenue = max(lines(p.x + ${PITCH.toFixed(1)}, ${(
      PITCH * 4
    ).toFixed(1)}, 22.0), lines(p.y + ${(PITCH * 2).toFixed(1)}, ${(
      PITCH * 4
    ).toFixed(1)}, 22.0));
        street = max(street, avenue);
        // the lots: grey and brown roofs, dry yards and car parks, trees' green, now and then a pool
        vec2 lot = floor(p / 22.0);
        float n = hash(lot), m = hash(lot + 17.3);
        vec2 in_ = fract(p / 22.0);
        vec3 col = mix(vec3(0.34, 0.32, 0.3), vec3(0.46, 0.43, 0.39), m);
        col = mix(col, vec3(0.44, 0.39, 0.3), step(0.5, n));
        col = mix(col, vec3(0.36, 0.36, 0.37), step(0.88, n));
        // (trees round the lots' edges, in clumps)
        float tree = step(0.55, hash(floor(p / 7.0) + 3.7)) * step(0.3, abs(in_.x - 0.5) + abs(in_.y - 0.5));
        col = mix(col, vec3(0.16, 0.21, 0.11), tree * 0.85);
        float pool = step(0.86, m) * step(0.3, in_.x) * step(in_.x, 0.55) * step(0.55, in_.y) * step(in_.y, 0.7);
        col = mix(col, vec3(0.16, 0.52, 0.6), pool);
        col = mix(col, vec3(0.2, 0.2, 0.21), street);
        // (lit like the city's ground in the low sun)
        vec3 day = col * vec3(0.8, 0.72, 0.64);
        // night: the streets lit sodium orange, the blocks dark but for a few lit windows' spill
        vec3 nite = col * 0.02 + vec3(1.0, 0.5, 0.18) * (street * 0.2 + avenue * 0.22 + 0.04 * hash(lot + 3.1));
        gl_FragColor = vec4(mix(day, nite, uNight), 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  })
}

export function buildSprawl (group) {
  // the ground: east past the wall, and south of it from the beach round to the east
  const ground = groundMaterial()
  const quad = (x0, z0, x1, z1) =>
    new THREE.PlaneGeometry(x1 - x0, z1 - z0)
      .rotateX(-Math.PI / 2)
      .translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  const land = new THREE.Mesh(
    merge([quad(WALL, -WALL, FAR, FAR), quad(-PROMENADE, WALL, WALL, FAR)]),
    ground
  )
  land.renderOrder = LAYER.hills
  group.add(land)

  // the buildings: a box for each, its walls the instance's colour and its roof paler
  const list = []
  const towers = [
    { x: 1350, z: 260, r: 160 },
    { x: 760, z: 1450, r: 140 }
  ]
  for (let x = WALL + 6; x < BUILT; x += 30)
    for (let z = -WALL + 6; z < BUILT; z += 30) {
      const cx = x + R() * 12,
        cz = z + R() * 12
      const w = 9 + R() * 12,
        d = 9 + R() * 12
      if (!clear(cx, cz, Math.max(w, d) / 2) || R() < 0.32) continue
      let h = 3.5 + R() * 4 + (R() < 0.3 ? 3.5 : 0) + (R() < 0.12 ? 7 : 0)
      for (const t of towers)
        if (Math.hypot(cx - t.x, cz - t.z) < t.r && R() < 0.35)
          h = 25 + R() * R() * 110
      list.push({ x: cx, z: cz, w, d, h })
    }
  // (and south of the south wall, west of the east one)
  for (let x = -PROMENADE + 8; x < WALL; x += 30)
    for (let z = WALL + 6; z < BUILT; z += 30) {
      const cx = x + R() * 12,
        cz = z + R() * 12
      const w = 9 + R() * 12,
        d = 9 + R() * 12
      if (!clear(cx, cz, Math.max(w, d) / 2) || R() < 0.32) continue
      list.push({
        x: cx,
        z: cz,
        w,
        d,
        h: 3.5 + R() * 4 + (R() < 0.3 ? 3.5 : 0)
      })
    }
  // (a unit box on the ground, its top face, vertices 8 to 11, a paler grey)
  const shape = tint(box(-0.5, 0, -0.5, 0.5, 1, 0.5), 0xffffff)
  for (let i = 8; i < 12; i++)
    shape.attributes.color.setXYZ(i, 0.72, 0.71, 0.69)
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9
  })
  const paints = [
    0xd8ccb8,
    0xc9b9a0,
    0xd5c2b0,
    0xbfbab0,
    0xcab89e,
    0xb3bbb8,
    0xd4b896,
    0xa8a196
  ]
  const _m = new THREE.Matrix4(),
    _c = new THREE.Color()
  // (a mesh for the east and one for the south: a draw call each, the frustum leaving out what is
  // behind the camera)
  const cells = new Map()
  for (const b of list) {
    const k = b.x > WALL ? 'east' : 'south'
    if (!cells.has(k)) cells.set(k, [])
    cells.get(k).push(b)
  }
  for (const items of cells.values()) {
    const m = new THREE.InstancedMesh(shape, mat, items.length)
    items.forEach((b, i) => {
      m.setMatrixAt(i, _m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z))
      _c.set(paints[Math.floor(R() * paints.length)])
      if (b.h > 20)
        _c.setRGB(0.66 + R() * 0.2, 0.7 + R() * 0.15, 0.74 + R() * 0.12)
      m.setColorAt(i, _c)
    })
    m.computeBoundingSphere()
    m.receiveShadow = true
    m.renderOrder = 0.5 // (after the city and the walls in front of it)
    group.add(m)
  }

  // palms over the roofs, along the streets nearest the city and here and there beyond (not on the
  // freeways, nor out in a street crossing the row)
  const palms = []
  const row = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    for (let s = R() * 20; s < len; s += 16 + R() * 14) {
      const x = x0 + ((x1 - x0) * s) / len,
        z = z0 + ((z1 - z0) * s) / len
      const across = x0 === x1 ? z : x
      if (near(x, EAST.x0, 17) || near(z, SOUTH.z0, 17)) continue
      if (Math.abs(across - Math.round(across / PITCH) * PITCH) < 8) continue
      if (R() < 0.8) palms.push({ x, z, h: 16 + R() * 12, lean: R() * 6.3 })
    }
  }
  for (const k of [6, 7, 9]) {
    const c = k * PITCH + 9.5
    row(-PROMENADE + 10, c, BUILT, c)
    row(c, -WALL + 10, c, BUILT)
  }
  for (let i = 0; i < 160; i++) {
    const x = WALL + R() * (BUILT - WALL),
      z = -WALL + R() * (BUILT + WALL)
    if (clear(x, z, 2)) palms.push({ x, z, h: 15 + R() * 14, lean: R() * 6.3 })
  }
  palmsAt(group, palms, false, 4000)

  // night: the street lights along the streets, and windows lit in the buildings
  const lights = []
  for (let k = 6; k * PITCH < BUILT; k++)
    for (let s = -WALL; s < BUILT; s += 32) {
      const c = k * PITCH + 7.5
      lights.push({
        x: c,
        y: 8,
        z: s + R() * 4,
        color: 0xffa04a,
        size: 3.6,
        k: 2.4
      })
      if (s > WALL + 10)
        lights.push({
          x: s + R() * 4,
          y: 8,
          z: c,
          color: 0xffa04a,
          size: 3.6,
          k: 2.4
        })
    }
  for (let s = -PROMENADE; s < WALL; s += 32)
    for (let k = 6; k * PITCH < BUILT; k++)
      lights.push({
        x: s + R() * 4,
        y: 8,
        z: k * PITCH + 7.5,
        color: 0xffa04a,
        size: 3.6,
        k: 2.4
      })
  for (const b of list)
    if (R() < 0.6) {
      const a = R() * 6.3
      lights.push({
        x: b.x + Math.cos(a) * b.w * 0.52,
        y: 1.5 + R() * (b.h - 2),
        z: b.z + Math.sin(a) * b.d * 0.52,
        color: R() < 0.7 ? 0xffd9a0 : 0xd8e4ff,
        size: b.h > 20 ? 2.4 : 1.8,
        k: 1.2
      })
    }
  const glow = glowMaterial({ haze: 0.5 })
  const pts = glowPoints(lights, glow)
  pts.visible = false
  group.add(pts)

  return {
    night (k) {
      ground.uniforms.uNight.value = k
      glow.uniforms.uOn.value = k
      pts.visible = k > 0.01
    }
  }
}
