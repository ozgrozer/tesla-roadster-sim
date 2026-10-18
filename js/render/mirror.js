// The street's reflection in the wet. While the road is wet the scene is drawn a second time, before
// the frame, from a camera mirrored below the road, into a target half the frame's size: what a
// mirror laid on the street would show (the buildings and their lit windows, the signs, the street
// lights and the cars' lamps, the sky). The road's shader (roadSurface.js) reads it back where the
// road is, through the matrix that maps a point on the street to its place in the reflection, and
// blurs it along the view as rough asphalt does. The ground itself (the asphalt, the pavements, the
// paint, the beach and the sea, the light pools and the rain's splashes) is kept out of it on a
// layer of its own (GROUND), as is anything the camera has told it to leave out, and the shadow maps
// aren't drawn again for it. Dry, it costs nothing at all.
import * as THREE from 'three'
import { WET } from './wet.js'

export const GROUND = 1 // the layer the ground is on: drawn by the camera, not in the reflection
const Y = 0.0 // the road's level, which the mirror lies on
const _n = new THREE.Vector3(0, 1, 0),
  _p = new THREE.Vector3(0, Y, 0),
  _cam = new THREE.Vector3(),
  _view = new THREE.Vector3(),
  _target = new THREE.Vector3(),
  _look = new THREE.Vector3(),
  _rot = new THREE.Matrix4(),
  _plane = new THREE.Plane(),
  _clip = new THREE.Vector4(),
  _q = new THREE.Vector4()

export class Mirror {
  constructor (renderer, scene, camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.cam = new THREE.PerspectiveCamera()
    this.cam.layers.set(0)
    // (with mipmaps: the rougher the road, the blurrier the level it reads)
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter
    })
    this.matrix = WET.uReflMat.value
    WET.tReflect.value = this.target.texture
    this.on = false
    // the target's size, a share of the frame's (the graphics quality's: 0, no reflection at all)
    this.scale = 0.5
    camera.layers.enable(GROUND)
  }
  // put a mesh (and all in it) on the ground's layer: seen, but not in the reflection
  static ground (o) {
    o.traverse(c => c.layers.set(GROUND))
  }
  // Draw the reflection for this frame (when wet: off, it is skipped and the road reads the sky)
  render (wet) {
    const on = wet > 0.01 && this.scale > 0
    WET.uReflOn.value = on ? 1 : 0
    this.on = on
    if (!on) return
    const r = this.renderer,
      camera = this.camera,
      cam = this.cam
    // the target at half the frame's size (in the screen's pixels)
    const w = Math.max(4, Math.round(r.domElement.width * this.scale)),
      h = Math.max(4, Math.round(r.domElement.height * this.scale))
    if (this.target.width !== w || this.target.height !== h)
      this.target.setSize(w, h)
    // the camera mirrored in the road (as three.js's Reflector does it)
    _cam.setFromMatrixPosition(camera.matrixWorld)
    _view.subVectors(_p, _cam)
    if (_view.dot(_n) > 0) return // (looking up at the road from under it: nothing to mirror)
    _view.reflect(_n).negate().add(_p)
    _rot.extractRotation(camera.matrixWorld)
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cam)
    _target.subVectors(_p, _look).reflect(_n).negate().add(_p)
    cam.position.copy(_view)
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n)
    cam.lookAt(_target)
    cam.far = camera.far
    cam.updateMatrixWorld()
    cam.projectionMatrix.copy(camera.projectionMatrix)
    // the matrix from a point on the street to its place in the reflection (0 to 1 across it)
    // prettier-ignore
    this.matrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1
    )
    this.matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse)
    // the near plane tilted onto the road, so nothing under it is drawn (Lengyel's oblique clip)
    _plane
      .setFromNormalAndCoplanarPoint(_n, _p)
      .applyMatrix4(cam.matrixWorldInverse)
    _clip.set(
      _plane.normal.x,
      _plane.normal.y,
      _plane.normal.z,
      _plane.constant
    )
    const P = cam.projectionMatrix.elements
    _q.x = (Math.sign(_clip.x) + P[8]) / P[0]
    _q.y = (Math.sign(_clip.y) + P[9]) / P[5]
    _q.z = -1
    _q.w = (1 + P[10]) / P[14]
    _clip.multiplyScalar(2 / _clip.dot(_q))
    P[2] = _clip.x
    P[6] = _clip.y
    P[10] = _clip.z + 1
    P[14] = _clip.w
    // draw it, without drawing the shadow maps again
    const was = r.getRenderTarget(),
      auto = r.shadowMap.autoUpdate
    r.shadowMap.autoUpdate = false
    r.setRenderTarget(this.target)
    r.clear()
    r.render(this.scene, cam)
    r.setRenderTarget(was)
    r.shadowMap.autoUpdate = auto
  }
}
