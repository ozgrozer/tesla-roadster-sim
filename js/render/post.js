// What happens to each frame after it is drawn: bloom on everything bright (lamps, thrusters, the
// low sun's glints), the speed blur (speedBlur.js), then tone mapping, the grade and colour out; and
// keeping it all the size of the window. The bloom is worked out at the window's own size, not the
// screen's pixels: a soft glow loses nothing by it, and on a high-density screen it is four times
// cheaper. It takes only the light over its threshold (with a soft knee below it), as a camera's
// glare does, so a lamp, a neon sign or the sun's glint off a windscreen glows while a white car in
// the sun stays a white car. Everything after the bloom is one pass over the screen's pixels: the
// frame, its bloom added, the speed blur when it is on, tone mapping, the grade (GRADE: the
// saturation, the contrast, the shadows and highlights each tinted a little, and a vignette, set
// for the hour and the weather by daylight.js) and colour, straight onto the canvas (rather than
// the bloom added onto the frame in a pass of its own, the blur in another and the colour in a
// third, each reading and writing every pixel of a full-size frame).
import * as THREE from 'three'
import { SPEED_BLUR, updateSpeedBlur } from './speedBlur.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputShader } from 'three/addons/shaders/OutputShader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const FRAME = 'gl_FragColor = texture2D( tDiffuse, vUv );'
const OUT = /(gl_FragColor = sRGBTransferOETF\( gl_FragColor \);\s*#endif)/
if (
  !OutputShader.fragmentShader.includes(FRAME) ||
  !OUT.test(OutputShader.fragmentShader)
)
  throw new Error('post.js: three.js OutputShader has changed')

// The grade, after the tone mapping, on the colour as it will be shown: the saturation, an S-curve
// for contrast, the shadows and the highlights each pulled a little toward a tint, a vignette
export const GRADE = {
  uSat: { value: 1 },
  uContrast: { value: 0 },
  uShadow: { value: new THREE.Vector3() },
  uHigh: { value: new THREE.Vector3() },
  uVignette: { value: 0 }
}
// (the test site keeps a plain grade of its own)
export function plainGrade () {
  GRADE.uSat.value = 1.05
  GRADE.uContrast.value = 0.12
  GRADE.uShadow.value.set(0, 0, 0)
  GRADE.uHigh.value.set(0, 0, 0)
  GRADE.uVignette.value = 0.22
}
plainGrade()
const GRADE_GLSL = `
  uniform float uSat, uContrast, uVignette;
  uniform vec3 uShadow, uHigh;
  vec3 grade (vec3 c, vec2 uv) {
    c = clamp(c, 0.0, 1.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3(l), c, uSat), 0.0, 1.0);
    c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
    c += uShadow * (1.0 - l) * (1.0 - l) + uHigh * l * l;
    vec2 d = uv - 0.5;
    return c * (1.0 - uVignette * dot(d, d) * 2.0);
  }`

// The bloom's first pass, which picks out what glows: the light over the threshold, with a knee
// below it so a light's glow comes in softly rather than at a step, and no more than a lamp's from
// any one pixel (the sun's glint across a whole car's roof glows; it doesn't light up the screen)
const KNEE = `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold, smoothWidth;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float v = max(texel.r, max(texel.g, texel.b));
    float k = smoothWidth;
    float soft = clamp(v - luminosityThreshold + k, 0.0, 2.0 * k);
    soft = soft * soft / (4.0 * k + 1e-4);
    float over = max(soft, v - luminosityThreshold) / max(v, 1e-4);
    vec3 c = texel.rgb * over;
    gl_FragColor = vec4(c * min(1.0, 2.5 / max(max(c.r, max(c.g, c.b)), 1e-4)), 1.0);
  }`

// The last pass: the frame and the bloom (as the bloom pass would have blended it on: its colour
// times its alpha, added), through the speed blur while it is on, tone mapped and out. Two shaders,
// with the blur and without, so a frame without it never pays for it.
const finalShader = blur =>
  OutputShader.fragmentShader
    .replace(
      'uniform sampler2D tDiffuse;',
      `uniform sampler2D tDiffuse, tBloom;
      vec4 frame (vec2 uv) {
        vec4 b = texture2D(tBloom, uv);
        return texture2D(tDiffuse, uv) + b * b.a;
      }
      ${blur ? SPEED_BLUR : ''}`
    )
    .replace(FRAME, `gl_FragColor = ${blur ? 'speedBlur' : 'frame'}(vUv);`)
    .replace('varying vec2 vUv;', `varying vec2 vUv;\n${GRADE_GLSL}`)
    .replace(OUT, '$1\n      gl_FragColor.rgb = grade(gl_FragColor.rgb, vUv);')
class FinalPass extends OutputPass {
  constructor (bloom) {
    super()
    this.bloom = bloom
    this.uniforms.tBloom = { value: null }
    this.uniforms.uAmount = { value: 0 }
    Object.assign(this.uniforms, GRADE)
    this.plain = this.material
    this.plain.fragmentShader = finalShader(false)
    this.blurred = this.plain.clone()
    this.blurred.uniforms = this.uniforms
    this.blurred.fragmentShader = finalShader(true)
  }
  render (renderer, writeBuffer, readBuffer) {
    this.uniforms.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture
    const m = this.uniforms.uAmount.value > 0 ? this.blurred : this.plain
    if (this.material !== m) {
      this.material = this.fsQuad.material = m
      this._outputColorSpace = null // (so OutputPass gives it its tone mapping defines)
    }
    super.render(renderer, writeBuffer, readBuffer)
  }
}

export class Post {
  constructor (renderer, scene, camera) {
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.65,
      0.45,
      1.6
    )
    bloom.materialHighPassFilter.fragmentShader = KNEE
    bloom.highPassUniforms.smoothWidth.value = 0.7
    // (the composer sizes its passes in the screen's pixels)
    const size = bloom.setSize.bind(bloom)
    bloom.setSize = (w, h) => {
      const k = Math.max(1, renderer.getPixelRatio())
      size(Math.round(w / k), Math.round(h / k))
    }
    // (the bloom is left in its own target for the last pass to add, not blended onto the frame)
    bloom.blendMaterial.visible = false
    composer.addPass(bloom)
    this.final = new FinalPass(bloom)
    composer.addPass(this.final)
    this.blur = { amount: 0 }
    this.composer = composer
    this.renderer = renderer
    const resize = (this.resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      composer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    })
    window.addEventListener('resize', resize)
    resize()
  }
  // pixels drawn per CSS pixel (resolution.js)
  setPixelRatio (r) {
    this.renderer.setPixelRatio(r)
    this.composer.setPixelRatio(r)
    this.resize()
  }
  // draw the frame (shot: the camera's shot, for the speed blur)
  render (sim, shot, dt) {
    this.final.uniforms.uAmount.value = updateSpeedBlur(this.blur, sim, shot, dt)
    this.composer.render()
  }
}
