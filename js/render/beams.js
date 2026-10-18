// The Roadster's headlight beams seen in the air: in rain or fog at night the light ahead of the car
// is caught by the water in the air, two pale cones reaching out down the road from the lamps,
// brightest at the lamps and fading out with distance, soft at their edges. A faint trace on a
// clear night; plain to see in a downpour or the marine layer's fog. Two additive cones on the
// car's body (so they pitch and roll with it), drawn only while the headlights are on and there is
// something in the air to catch them.
import * as THREE from 'three'
import { GROUND } from './mirror.js'

const LEN = 24 // m the beams reach
const SPREAD = 3.6 // m across at their far end
const TILT = 0.085 // rad they dip, as the dipped headlights do (roadster.js aims them so)
const LAMPS = [0.62, -0.62] // m either side of the middle, at the headlights
const AT = [2.1, 0.55] // m ahead of the body's middle, and up

const VERT = `varying float vT; varying vec3 vN, vV;
  void main(){
    vT = position.x / ${LEN.toFixed(1)};
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`
const FRAG = `uniform float uI; varying float vT; varying vec3 vN, vV;
  void main(){
    // (through the middle of the cone: its sides seen edge on fade out)
    float edge = abs(dot(normalize(vN), normalize(vV)));
    float a = uI * (1.0 - vT) * (1.0 - vT) * edge * edge * smoothstep(0.0, 0.06, vT);
    gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, 1.0);
  }`

export class Beams {
  // body: the Roadster's body (roadster.js RS.body)
  constructor (body) {
    const g = new THREE.ConeGeometry(SPREAD, LEN, 24, 1, true)
      .translate(0, -LEN / 2, 0)
      .rotateZ(Math.PI / 2)
      .rotateZ(-TILT)
    this.u = { uI: { value: 0 } }
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
    this.cones = LAMPS.map(z => {
      const c = new THREE.Mesh(g, m)
      c.position.set(AT[0], AT[1], z)
      c.renderOrder = 3
      c.visible = false
      c.layers.set(GROUND) // (not in the street's reflection)
      body.add(c)
      return c
    })
  }
  // on: the headlights are on; air: how much there is in the air to catch them (0 to 1: the rain,
  // the fog); dark: how dark it is (0 to 1)
  update (on, air, dark) {
    const k = on ? (0.025 + 0.16 * air) * (0.25 + 0.75 * dark) : 0
    this.u.uI.value = k
    for (const c of this.cones) c.visible = k > 0.003
  }
}
