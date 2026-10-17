// Speed blur: past about 150 km/h, and whenever the main thrusters fire, the edges of the picture
// streak in towards the middle, more the faster the car goes, while the middle, where the car is,
// stays sharp. Only from the cameras that ride along with the car (Follow, Chase, Cockpit); a fixed
// camera watching it go by has no reason to blur. It is drawn in the frame's last pass (post.js),
// in a shader of its own for while it is on: SPEED_BLUR is its GLSL, sampling the frame through
// frame(uv).
import { RIDING } from './camera.js'
import { clamp } from '../sim/constants.js'

export const SPEED_BLUR = `
  uniform float uAmount;
  vec4 speedBlur (vec2 uv) {
    vec2 d = uv - vec2(0.5, 0.55);
    float k = uAmount * smoothstep(0.1, 0.65, length(d)) * 0.09;
    vec4 c = vec4(0.0);
    for (int i = 0; i < 8; i++) c += frame(uv - d * k * float(i) / 7.0);
    return c / 8.0;
  }`

// blur: { amount }, eased towards what the speed asks for; returns the shader's uAmount (none at all
// once it has all but faded). shot: the camera's current shot (only those riding along blur)
export function updateSpeedBlur (blur, sim, shot, dt) {
  const riding = RIDING.has(shot)
  const v = sim.mode === 'ground' ? sim.groundSpeed() : sim.vel.length()
  const want = riding
    ? clamp((v - 40) / 60, 0, 1) * 0.85 +
      0.45 * sim.thrMain * clamp(v / 30, 0, 1)
    : 0
  const k = want > blur.amount ? 3 : 6 // (in quickly, out quicker)
  blur.amount += (want - blur.amount) * (1 - Math.exp(-dt * k))
  return blur.amount > 0.01 ? blur.amount : 0
}
