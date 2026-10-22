// The thirty hidden tokens (sim/tokens.js), drawn: gold coins standing on edge, turning and bobbing
// where they wait, bright enough to catch the eye (the bloom) once you are close, gone once found.
// One instanced mesh for all of them.
import * as THREE from 'three'
import { TOKENS, FOUND } from '../sim/tokens.js'

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _y = new THREE.Vector3(0, 1, 0),
  _x = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  )

export function buildTokens (group) {
  const coin = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20, 1)
  const rim = new THREE.TorusGeometry(0.42, 0.045, 6, 20)
  const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 1.15, 0.3)
    }),
    rimMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.55, 0.12)
    })
  const n = TOKENS.length
  const faces = new THREE.InstancedMesh(coin, mat, n),
    rims = new THREE.InstancedMesh(rim, rimMat, n)
  for (const m of [faces, rims]) {
    m.frustumCulled = false // (thirty, a few triangles each: cheaper than keeping their bounds)
    m.name = 'tokens'
    group.add(m)
  }
  let t = 0
  const update = dt => {
    t += dt
    for (let i = 0; i < n; i++) {
      const k = TOKENS[i]
      const gone = FOUND.has(k.id)
      _p.set(k.x, k.y + 0.9 + Math.sin(t * 2 + i) * 0.12, k.z)
      _s.setScalar(gone ? 0 : 1)
      _q.setFromAxisAngle(_y, t * 2.2 + i)
      // (the coin's axis turned to lie flat across, then the whole spun about the vertical)
      _m.compose(_p, _q.clone().multiply(_x), _s)
      faces.setMatrixAt(i, _m)
      _q.setFromAxisAngle(_y, t * 2.2 + i)
      _m.compose(_p, _q, _s)
      rims.setMatrixAt(i, _m)
    }
    faces.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true
  }
  update(0)
  return {
    update,
    night (k) {
      mat.color.setRGB(1.6 + k * 0.6, 1.15 + k * 0.4, 0.3)
    }
  }
}
