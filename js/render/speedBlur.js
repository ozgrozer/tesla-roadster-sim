// Speed blur: past about 150 km/h, and whenever the main thrusters fire, the edges of the picture
// streak in towards the middle, more the faster the car goes, while the middle, where the car is,
// stays sharp. Only from the cameras that ride along with the car (Follow and Chase); a fixed
// camera watching it go by has no reason to blur.
import { clamp } from '../sim/constants.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

export function speedBlurPass () {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main(){
        vec2 d = vUv - vec2(0.5, 0.55);
        float k = uAmount * smoothstep(0.1, 0.65, length(d)) * 0.09;
        vec4 c = vec4(0.0);
        for (int i = 0; i < 8; i++) c += texture2D(tDiffuse, vUv - d * k * float(i) / 7.0);
        gl_FragColor = c / 8.0;
      }`
  })
  pass.enabled = false
  pass.amount = 0
  return pass
}

// shot: the camera's current shot (only 'follow' and 'chase' blur)
export function updateSpeedBlur (pass, sim, shot, dt) {
  const riding = shot === 'follow' || shot === 'chase'
  const v = sim.mode === 'ground' ? sim.groundSpeed() : sim.vel.length()
  const want = riding
    ? clamp((v - 40) / 60, 0, 1) * 0.85 +
      0.45 * sim.thrMain * clamp(v / 30, 0, 1)
    : 0
  const k = want > pass.amount ? 3 : 6 // (in quickly, out quicker)
  pass.amount += (want - pass.amount) * (1 - Math.exp(-dt * k))
  pass.uniforms.uAmount.value = pass.amount
  pass.enabled = pass.amount > 0.01
}
