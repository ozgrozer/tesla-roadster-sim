// The sea round the city: past the promenade a strip of beach runs down to the water, which goes out to
// the hills on the horizon. The water is a shader: a few rolling swells and ripples for its surface,
// the evening sky in it at a glancing angle, a glitter path under the low sun, clear turquoise over
// the shallows, deep blue further out, and surf breaking along the beach.
import * as THREE from 'three'
import { OUTER } from '../sim/city.js'
import { canvasTex, speckle } from './scene.js'

const SHORE = OUTER + 3 // where the beach starts down into the water (square, like the city)
const WATER = -0.5 // the sea's level
const WET = [SHORE - 1, SHORE + 6] // the wet sand sloping down under the water: from, to
const FLOOR = -1.4 // the sea bed where the slope ends
const SUN = new THREE.Vector3(-66, 30, 28).normalize() // as in citySky.js

function sandTexture () {
  const t = canvasTex(512, (g, S) => {
    g.fillStyle = '#d9c49b'
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

function seaMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uSun: { value: SUN.clone() },
        uShore: {
          value:
            SHORE + ((WET[1] - WET[0]) * (-0.03 - WATER)) / (-0.03 - FLOOR) - 1
        }
      }
    ]),
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
    fragmentShader: `uniform float uTime; uniform float uNight; uniform vec3 uSun; uniform float uShore; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
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
        // the evening sky, as in citySky.js
        vec3 horizon = vec3(1.0, 0.56, 0.32), mid = vec3(0.62, 0.42, 0.52), zenith = vec3(0.13, 0.2, 0.42);
        vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.16, r.y));
        sky = mix(sky, zenith, smoothstep(0.12, 0.62, r.y));
        // (at night: the dark sky, the city's glow low down)
        vec3 nsky = mix(vec3(0.06, 0.05, 0.06), vec3(0.006, 0.01, 0.03), smoothstep(0.0, 0.4, r.y));
        sky = mix(sky, nsky, uNight);
        float sd = max(dot(r, uSun), 0.0);
        sky += mix(vec3(1.0, 0.55, 0.25), vec3(0.3, 0.32, 0.4), uNight) * pow(sd, 8.0) * 0.6;
        // deep blue out at sea, turquoise over the shallows by the beach
        float out_ = max(abs(vW.x), abs(vW.z)) - uShore;
        vec3 deep = vec3(0.008, 0.08, 0.27), shallow = vec3(0.05, 0.42, 0.5);
        vec3 body = mix(shallow, deep, smoothstep(2.0, 70.0, out_));
        body = mix(body, vec3(0.003, 0.012, 0.03), uNight * 0.92);
        // light coming up through a wave's face
        body += vec3(0.02, 0.12, 0.13) * max(0.0, s.x * 0.8 + s.y * 0.4) ;
        // (the sky in it a little cooler than the sky itself: the water's own blue shows through)
        vec3 col = mix(body, sky * vec3(0.78, 0.88, 1.08), fres * mix(0.7, 0.4, uNight));
        // the sun's glitter path (the moon's at night, cold and fainter)
        vec3 glint = mix(vec3(1.0, 0.75, 0.45), vec3(0.75, 0.8, 1.0) * 0.35, uNight);
        col += glint * pow(sd, 260.0) * 9.0;
        col += mix(vec3(1.0, 0.6, 0.3), vec3(0.2, 0.22, 0.3), uNight) * pow(sd, 40.0) * 0.35;
        // surf: a foam line rolling up the beach, and streaks of it just offshore
        float swash = sin(out_ * 0.9 - uTime * 1.6 + noise(vW.xz * 0.08) * 6.0);
        float foam = smoothstep(2.6, 0.0, out_) * (0.55 + 0.45 * swash);
        foam += smoothstep(14.0, 4.0, out_) * smoothstep(0.75, 0.95, swash) * noise(vW.xz * 0.6 + uTime * 0.3) * 0.7;
        col = mix(col, vec3(0.92, 0.9, 0.86) * (1.0 - 0.8 * uNight), clamp(foam, 0.0, 0.9));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`
  })
}

// returns a per-frame update (the water moves), with .night(k) to turn it to night (k = 1)
export function buildSea (group) {
  const sand = new THREE.MeshStandardMaterial({
    map: sandTexture(),
    roughness: 0.96
  })
  // the beach: flat sand from under the city out past the promenade, then a frame of wet sand sloping
  // down under the water (UVs in metres for the sand texture)
  const pos = [],
    uvs = []
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, a, c, d]) {
      pos.push(...p)
      uvs.push(p[0], p[2])
    }
  }
  const [i, o] = WET,
    y0 = -0.03
  quad([-i, y0, i], [i, y0, i], [i, y0, -i], [-i, y0, -i])
  for (let k = 0; k < 4; k++) {
    // corners of the inner and outer squares, turned a quarter each time
    const rot = ([x, y, z]) => {
      for (let n = 0; n < k; n++) [x, z] = [-z, x]
      return [x, y, z]
    }
    quad(
      rot([-o, FLOOR, o]),
      rot([o, FLOOR, o]),
      rot([i, y0, i]),
      rot([-i, y0, i])
    )
  }
  const beach = new THREE.BufferGeometry()
  beach.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  beach.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  beach.computeVertexNormals()
  const sandMesh = new THREE.Mesh(beach, sand)
  sandMesh.receiveShadow = true
  group.add(sandMesh)
  // the water, out to the horizon
  const mat = seaMaterial()
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2),
    mat
  )
  sea.position.y = WATER
  group.add(sea)
  const update = (t, camera) => {
    mat.uniforms.uTime.value = t
    // the plane follows the camera so the horizon never runs out
    sea.position.x = camera.position.x
    sea.position.z = camera.position.z
  }
  update.night = k => (mat.uniforms.uNight.value = k)
  return update
}
