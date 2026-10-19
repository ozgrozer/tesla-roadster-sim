// Long shadows across the whole city at golden hour. The sun light that rides along with the car
// (scene.js) only shadows a box sixty metres across round it: crisp, and it moves with the traffic,
// but past it every street was in full sun, and its edge could be seen sweeping along the pavement.
// So a second light, from the same low sun, holds a shadow map of the whole city: its buildings,
// rooftop plant, street lights, palms, trees and signal masts, drawn once (again only when something
// in it moves: a post knocked down, the city shown or hidden), with the cars left out of it. It
// gives no light of its own; instead every material takes the darker of the two maps for the sun's
// light, so a tower throws its shadow two hundred metres down the avenue, and the car still casts
// its own sharp one in it. The city's map is coarse (a third of a metre to a texel), so it is read
// with four taps blended, not the sixteen of the car's: it looks the same, at a quarter of the cost.
import * as THREE from 'three'

// The sun's own shadow (light 0) is the darker of its own and the city map's (light 1), and the city
// light, which gives no light, isn't shadow-tested at all.
const OWN = `directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;`
const chunk = THREE.ShaderChunk.lights_fragment_begin
if (!chunk.includes(OWN))
  throw new Error('sunShadow.js: three.js lights_fragment_begin has changed')
// the city's map, four texels blended (shadowmap_pars_fragment, where three.js's own getShadow is)
THREE.ShaderChunk.shadowmap_pars_fragment += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
	float cityShadowAt( sampler2D map, vec2 size, float intensity, float bias, vec4 at ) {
		at.xyz /= at.w;
		at.z += bias;
		if ( at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0 || at.z > 1.0 ) return 1.0;
		vec2 t = at.xy * size - 0.5, f = fract( t ), d = 1.0 / size, b = ( floor( t ) + 0.5 ) * d;
		float s = mix(
			mix( texture2DCompare( map, b, at.z ), texture2DCompare( map, b + vec2( d.x, 0.0 ), at.z ), f.x ),
			mix( texture2DCompare( map, b + vec2( 0.0, d.y ), at.z ), texture2DCompare( map, b + d, at.z ), f.x ),
			f.y );
		return mix( 1.0, s, intensity );
	}
#endif
`
THREE.ShaderChunk.lights_fragment_begin = chunk
  .replace(
    '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    `float cityShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
	cityShadow = receiveShadow ? cityShadowAt( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, vDirectionalShadowCoord[ 1 ] ) : 1.0;
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
// on the city (half: the half-width of the ground it covers, top: the tallest thing on it). As the
// sun moves through the day (and the moon through the night) it is aimed again (aim) and the map
// drawn again: a whole city's map is under a millisecond of the graphics card's time.
const _view = new THREE.Matrix4(),
  _lo = new THREE.Vector3(),
  _hi = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _o = new THREE.Vector3(),
  _up = new THREE.Vector3(0, 1, 0),
  _side = new THREE.Vector3(1, 0, 0)
export class CityShadow {
  constructor (scene, renderer, sun, half, top) {
    this.scene = scene
    this.renderer = renderer
    this.pending = false
    this.half = half
    this.top = top
    this.target = new THREE.WebGLRenderTarget(1, 1) // (a pass that only draws the map)
    const light = new THREE.DirectionalLight(0xffffff, 0)
    light.castShadow = true
    const s = light.shadow
    s.autoUpdate = false
    const big = renderer.capabilities.maxTextureSize >= 4096
    s.mapSize.set(big ? 4096 : 2048, big ? 2048 : 1024)
    s.bias = -0.00008
    s.normalBias = 0.35
    scene.add(light, light.target)
    this.light = light
    this.aim(sun)
  }
  // from the direction sun (toward the light), with the ground square and everything up to the
  // tallest roof, seen from the light, squared up in its shadow camera; the map is due again
  aim (sun) {
    const light = this.light,
      s = light.shadow,
      half = this.half
    light.position.copy(sun).normalize().multiplyScalar(2000)
    // (a sun straight overhead would leave the camera's up the same as its way: look past it)
    const up = Math.abs(sun.y) > 0.999 ? _side : _up
    _view
      .lookAt(light.position, _o, up)
      .setPosition(light.position)
      .invert()
    _lo.set(Infinity, Infinity, Infinity)
    _hi.copy(_lo).negate()
    for (const x of [-half, half])
      for (const y of [0, this.top])
        for (const z of [-half, half]) {
          _p.set(x, y, z).applyMatrix4(_view)
          _lo.min(_p)
          _hi.max(_p)
        }
    Object.assign(s.camera, {
      left: _lo.x,
      right: _hi.x,
      bottom: _lo.y,
      top: _hi.y,
      near: -_hi.z - 10,
      far: -_lo.z + 10
    })
    s.camera.up.copy(up)
    s.camera.updateProjectionMatrix()
    this.pending = true
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
    // (only the shadow maps' draws go through: three.js has no way to draw a shadow map alone, so the
    // pass draws the scene too, every mesh of the city into a 1 px target, some 800 draw calls a
    // refresh for nothing; the shadow maps' draws are the ones with no scene)
    const direct = r.renderBufferDirect
    r.renderBufferDirect = function (cam, sc, ...rest) {
      if (sc !== null) return
      return direct.call(this, cam, sc, ...rest)
    }
    try {
      r.render(this.scene, camera)
    } finally {
      r.renderBufferDirect = direct
    }
    r.setRenderTarget(was)
    hide.forEach((o, i) => (o.visible = shown[i]))
  }
}
