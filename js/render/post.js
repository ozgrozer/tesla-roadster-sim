// What happens to each frame after it is drawn: bloom on everything bright (lamps, thrusters, the
// low sun's glints), the speed blur (speedBlur.js), then tone mapping and colour out; and keeping it
// all the size of the window. The bloom is worked out at the window's own size, not the screen's
// pixels: a soft glow loses nothing by it, and on a high-density screen it is four times cheaper.
// Everything after the bloom is one pass over the screen's pixels: the frame, its bloom added, the
// speed blur when it is on, tone mapping and colour, straight onto the canvas (rather than the bloom
// added onto the frame in a pass of its own, the blur in another and the colour in a third, each
// reading and writing every pixel of a full-size frame).
import * as THREE from 'three'
import { SPEED_BLUR, updateSpeedBlur } from './speedBlur.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputShader } from 'three/addons/shaders/OutputShader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const FRAME = 'gl_FragColor = texture2D( tDiffuse, vUv );'
if (!OutputShader.fragmentShader.includes(FRAME))
  throw new Error('post.js: three.js OutputShader has changed')

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
class FinalPass extends OutputPass {
  constructor (bloom) {
    super()
    this.bloom = bloom
    this.uniforms.tBloom = { value: null }
    this.uniforms.uAmount = { value: 0 }
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
      0.55,
      0.45,
      0.95
    )
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
