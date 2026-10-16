// What happens to each frame after it is drawn: bloom on everything bright (lamps, thrusters, the
// low sun's glints), the speed blur (speedBlur.js), then tone mapping and colour out; and keeping it
// all the size of the window.
import * as THREE from 'three'
import { speedBlurPass, updateSpeedBlur } from './speedBlur.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

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
    composer.addPass(bloom)
    this.blur = speedBlurPass()
    composer.addPass(this.blur)
    composer.addPass(new OutputPass())
    this.composer = composer
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      composer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', resize)
    resize()
  }
  // draw the frame (shot: the camera's shot, for the speed blur)
  render (sim, shot, dt) {
    updateSpeedBlur(this.blur, sim, shot, dt)
    this.composer.render()
  }
}
