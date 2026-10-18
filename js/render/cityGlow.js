// Lights seen from afar at night: the hills' windows, the city's street lights running off to the
// horizon, the freeway's head and tail lights, the pier's lamps and the Ferris wheel's rim. Each is
// a point drawn as a soft round glow, its size in metres (never less than a pixel and a half: a far
// light fades rather than flickers), bright enough to bloom, and dimmed a little by the haze with
// distance. All of a set in one draw call.
import * as THREE from 'three'

export const GLOW_SCALE = { value: 1 } // pixels per metre at 1 m: set each frame (cityEdges.js)
const _c = new THREE.Color()

// one glow material; scale: how big each glow is drawn against its size, haze: how much the far ones
// fade, and the extra vertex code that may move each point (given position, defining p)
export function glowMaterial ({ haze = 0.55, move = '', uniforms = {} } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: GLOW_SCALE, uOn: { value: 0 }, ...uniforms },
    vertexShader: `attribute float size; uniform float uScale, uOn; varying vec3 vC;
      void main(){
        vec3 p = position;
        float k = 1.0; // (move may dim it, or colour it)
        vec3 tint = vec3(1.0);
        ${move}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = size * uScale / max(-mv.z, 0.1);
        gl_PointSize = max(px, 1.5);
        float far = -mv.z;
        vC = color * tint * k * uOn * min(1.0, px / 1.5) * (1.0 - ${haze.toFixed(
          2
        )} * (1.0 - exp(-far * far * 1.1e-6)));
        if (uOn < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.35, d)));
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}

// A set of glows: list of { x, y, z, color (THREE.Color or hex), size (m) }, drawn with mat.
export function glowPoints (list, mat) {
  const pos = new Float32Array(list.length * 3),
    col = new Float32Array(list.length * 3),
    size = new Float32Array(list.length)
  list.forEach((l, i) => {
    pos.set([l.x, l.y, l.z], i * 3)
    _c.set(l.color)
    col.set([_c.r * (l.k ?? 1), _c.g * (l.k ?? 1), _c.b * (l.k ?? 1)], i * 3)
    size[i] = l.size
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('size', new THREE.BufferAttribute(size, 1))
  g.computeBoundingSphere()
  const pts = new THREE.Points(g, mat)
  pts.renderOrder = 1 // (after the solid city, like any transparent thing)
  return pts
}
