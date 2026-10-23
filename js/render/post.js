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
import { motionFx } from '../ui/options.js'
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

// The grade, before the tone mapping, on the scene's own light (as a camera's would be: the
// technique adapted from mrdoob/slop-newyork js/post-processing.js, MIT, (c) 2026 Mr.doob): the
// white balance, the shadows cooled and the highlights warmed by multiplying (never lifting the
// black), contrast pivoted on middle grey (all three channels alike, so no hue shifts), the
// saturation with a touch of vibrance for the duller colours, and a vignette scaled to the frame
export const GRADE = {
  uSat: { value: 1 },
  uContrast: { value: 0 },
  uShadow: { value: new THREE.Vector3() },
  uHigh: { value: new THREE.Vector3() },
  uBalance: { value: new THREE.Vector3(1, 1, 1) },
  uVignette: { value: 0 }
}
// (the test site keeps a plain grade of its own)
export function plainGrade () {
  GRADE.uSat.value = 1.05
  GRADE.uContrast.value = 0.12
  GRADE.uShadow.value.set(0, 0, 0)
  GRADE.uHigh.value.set(0, 0, 0)
  GRADE.uBalance.value.set(1, 1, 1)
  GRADE.uVignette.value = 0.22
}
plainGrade()
const GRADE_GLSL = `
  uniform float uSat, uContrast, uVignette;
  uniform vec3 uShadow, uHigh, uBalance;
  uniform vec2 uAspect;
  vec3 grade (vec3 c, vec2 uv) {
    c = max(c, 0.0) * uBalance;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= (1.0 + 2.5 * uShadow * (1.0 - smoothstep(0.02, 0.6, l))) * (1.0 + uHigh * smoothstep(0.6, 3.0, l));
    c *= pow(max(l, 1e-4) / 0.18, 0.5 * uContrast);
    float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float hi = max(c.r, max(c.g, c.b));
    float vib = 0.1 * (1.0 - (hi - min(c.r, min(c.g, c.b))) / max(hi, 1e-4));
    c = max(mix(vec3(g), c, uSat + vib), 0.0);
    float r = length((uv - 0.5) * uAspect) / length(0.5 * uAspect);
    return c * (1.0 - 0.5 * uVignette * smoothstep(0.35, 1.0, r));
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
    .replace(
      FRAME,
      `gl_FragColor = ${blur ? 'speedBlur' : 'frame'}(vUv);
      gl_FragColor.rgb = grade(gl_FragColor.rgb, vUv);`
    )
    .replace('varying vec2 vUv;', `varying vec2 vUv;\n${GRADE_GLSL}`)
class FinalPass extends OutputPass {
  constructor (bloom) {
    super()
    this.bloom = bloom
    this.uniforms.tBloom = { value: null }
    this.uniforms.uAmount = { value: 0 }
    this.uniforms.uAspect = { value: new THREE.Vector2(1, 1) }
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

// MSAA samples at pixel ratio r (top: the highest the adaptive resolution goes)
export function samplesFor (r, top, max) {
  if (max <= 0 || r < 0.75 * top) return 0
  return Math.min(max, r > 1.5 ? 2 : 4)
}

export class Post {
  constructor (renderer, scene, camera) {
    // Multisampled (MSAA) targets for the frame: the edges of the poles, the kerbs, the palms'
    // trunks and the rooflines smooth instead of crawling. 4 samples, 2 on a high-density screen
    // (its pixels already small), none once the adaptive resolution has had to step well down
    // (resolution.js: the GPU is short of time) or with ?msaa=0
    this.maxSamples = /[?&]msaa=0/.test(location.search)
      ? 0
      : Math.min(4, renderer.capabilities.maxSamples || 0)
    this.top = Math.min(window.devicePixelRatio || 1, 2)
    this.samples = samplesFor(this.top, this.top, this.maxSamples)
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.samples
    })
    const composer = new EffectComposer(renderer, target)
    composer.setPixelRatio(renderer.getPixelRatio()) // (a target of our own starts it at 1)
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
      this.final.uniforms.uAspect.value.set(camera.aspect, 1)
    })
    window.addEventListener('resize', resize)
    resize()
  }
  // pixels drawn per CSS pixel (resolution.js)
  setPixelRatio (r) {
    this.setSamples(samplesFor(r, this.top, this.maxSamples))
    this.renderer.setPixelRatio(r)
    this.composer.setPixelRatio(r)
    this.resize()
  }
  // the frame's MSAA samples (the targets made again at their next use)
  setSamples (n) {
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples === n) continue
      t.samples = n
      t.dispose()
    }
    this.samples = n
  }
  // draw the frame (shot: the camera's shot, for the speed blur)
  render (sim, shot, dt) {
    const blur = updateSpeedBlur(this.blur, sim, shot, dt)
    this.final.uniforms.uAmount.value = motionFx() ? blur : 0 // (none with reduced motion)
    this.composer.render()
  }
}
