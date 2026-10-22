// Perf fixes pinned (docs/dev/PERF.md): details left out past their own distance (chunks.js
// DETAIL_FAR), the view put back as streamed after the city's shadow pass (streamBack), and the
// city's sun-shadow refresh drawing only its shadow maps (sunShadow.js: no draw of the scene into
// its 1 px target). npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { streamed, stream, streamAll, streamBack, DETAIL_FAR } from '../js/render/chunks.js'
import { CityShadow } from '../js/render/sunShadow.js'

const mesh = (name, x) => {
  const g = new THREE.BoxGeometry(10, 10, 10)
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g)
  m.name = name
  m.position.set(x, 0, 0)
  m.updateMatrixWorld()
  streamed(m)
  return m
}

test('ledges and trees are left out past their own distance; roofs only with the fog', () => {
  const far = DETAIL_FAR.cornices + 100
  const ledge = mesh('cornices', far),
    roof = mesh('roofs', far),
    near = mesh('cornices', 50)
  const cam = new THREE.PerspectiveCamera()
  stream(cam, 0.001) // (clear weather: the fog takes the city past 2 km)
  assert.equal(ledge.visible, false)
  assert.equal(roof.visible, true)
  assert.equal(near.visible, true)
  // the city's shadow pass sees it all, and the view is as it was after it
  streamAll()
  assert.equal(ledge.visible, true)
  streamBack()
  assert.equal(ledge.visible, false)
  assert.equal(roof.visible, true)
})

test("the city's shadow refresh draws only its shadow maps, not the scene", () => {
  const calls = { scene: 0, shadow: 0 }
  const r = {
    capabilities: { maxTextureSize: 4096 },
    target: null,
    getRenderTarget () { return this.target },
    setRenderTarget (t) { this.target = t },
    renderBufferDirect (cam, sc) { sc === null ? calls.shadow++ : calls.scene++ },
    // (three.js draws the shadow maps' casters with no scene, then the scene's own meshes)
    render (scene) {
      this.renderBufferDirect(null, null)
      this.renderBufferDirect(null, null)
      this.renderBufferDirect(null, scene)
      this.renderBufferDirect(null, scene)
    }
  }
  const own = r.renderBufferDirect
  const scene = new THREE.Scene()
  const cs = new CityShadow(scene, r, new THREE.Vector3(0.3, 0.8, 0.2), 1000, 200)
  cs.update(new THREE.PerspectiveCamera(), [])
  assert.deepEqual(calls, { shadow: 2, scene: 0 })
  assert.equal(r.renderBufferDirect, own, 'put back')
  // not due: nothing drawn
  cs.update(new THREE.PerspectiveCamera(), [])
  assert.deepEqual(calls, { shadow: 2, scene: 0 })
})
