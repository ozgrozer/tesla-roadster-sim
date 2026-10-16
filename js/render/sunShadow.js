// Long shadows across the whole city at golden hour. The sun light that rides along with the car
// (scene.js) only shadows a box sixty metres across round it: crisp, and it moves with the traffic,
// but past it every street was in full sun, and its edge could be seen sweeping along the pavement.
// So a second light, from the same low sun, holds a shadow map of the whole city: its buildings,
// rooftop plant, street lights, palms, trees and signal masts, drawn once (again only when something
// in it moves: a post knocked down, the city shown or hidden), with the cars left out of it. It
// gives no light of its own; instead every material takes the darker of the two maps for the sun's
// light, so a tower throws its shadow two hundred metres down the avenue, and the car still casts
// its own sharp one in it.
import * as THREE from 'three'

// The sun's own shadow (light 0) is the darker of its own and the city map's (light 1), and the city
// light, which gives no light, isn't shadow-tested at all.
const OWN = `directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;`
const chunk = THREE.ShaderChunk.lights_fragment_begin
if (!chunk.includes(OWN))
  throw new Error('sunShadow.js: three.js lights_fragment_begin has changed')
THREE.ShaderChunk.lights_fragment_begin = chunk
  .replace(
    '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    `float cityShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
	cityShadow = receiveShadow ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ) : 1.0;
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )`
  )
  .replace(
    OWN,
    `#if ( UNROLLED_LOOP_INDEX == 0 )
		directLight.color *= ( directLight.visible && receiveShadow ) ? min( cityShadow, getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) ) : 1.0;
		#elif ( UNROLLED_LOOP_INDEX != 1 )
		${OWN}
		#endif`
  )

// The city light: from the sun's direction (sun: a vector towards it), its shadow camera squared up
// on the city (half: the half-width of the ground it covers, top: the tallest thing on it).
export class CityShadow {
  constructor (scene, renderer, sun, half, top) {
    this.scene = scene
    this.renderer = renderer
    this.pending = false
    this.target = new THREE.WebGLRenderTarget(1, 1) // (a pass that only draws the map)
    const L = sun.clone().normalize()
    const light = new THREE.DirectionalLight(0xffffff, 0)
    light.position.copy(L).multiplyScalar(2000)
    light.castShadow = true
    const s = light.shadow
    s.autoUpdate = false
    const big = renderer.capabilities.maxTextureSize >= 4096
    s.mapSize.set(big ? 4096 : 2048, big ? 2048 : 1024)
    s.bias = -0.00008
    s.normalBias = 0.35
    // the ground square and everything up to the tallest roof, seen from the light: its bounds
    const view = new THREE.Matrix4()
      .lookAt(light.position, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
      .setPosition(light.position)
      .invert()
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity),
      hi = lo.clone().negate(),
      p = new THREE.Vector3()
    for (const x of [-half, half])
      for (const y of [0, top])
        for (const z of [-half, half]) {
          p.set(x, y, z).applyMatrix4(view)
          lo.min(p)
          hi.max(p)
        }
    Object.assign(s.camera, {
      left: lo.x,
      right: hi.x,
      bottom: lo.y,
      top: hi.y,
      near: -hi.z - 10,
      far: -lo.z + 10
    })
    s.camera.updateProjectionMatrix()
    scene.add(light, light.target)
    this.light = light
  }
  // draw the map again before the next frame
  refresh () {
    this.pending = true
  }
  // Before a frame is drawn: if the map is due, draw it in a pass of its own, with what moves (the
  // cars: hide) out of sight, so they leave no shadows behind them in it.
  update (camera, hide) {
    if (!this.pending) return
    this.pending = false
    const shown = hide.map(o => o.visible)
    for (const o of hide) o.visible = false
    this.light.shadow.needsUpdate = true
    const r = this.renderer,
      was = r.getRenderTarget()
    r.setRenderTarget(this.target)
    r.render(this.scene, camera)
    r.setRenderTarget(was)
    hide.forEach((o, i) => (o.visible = shown[i]))
  }
}
