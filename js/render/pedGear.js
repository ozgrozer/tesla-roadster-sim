// What people put up in the rain, as pieces of the figure everyone is drawn from (pedFigure.js;
// pedShader.js shows them only on those who have them up, folded away to nothing on the rest): an
// umbrella held up in the right hand, its domed canopy on a shaft that runs through the fist with a
// handle below it, and a hoodie's hood up over the head, open round the face.
import * as THREE from 'three'

// The umbrella, held up: the shaft runs straight up through the right fist, where the hand is when
// the arm holds it (pedShader.js: the upper arm a little forward, the forearm up), to the canopy's
// top; the canopy spreads round it, R across and DROP from its top to its edge
export const UMBRELLA = {
  x: 0.164,
  z: 0.2,
  grip: 1.51,
  top: 2.04,
  R: 0.52,
  DROP: 0.24
}

// The canopy, a dome round its shaft: eight ribs from the top out to the edge, the panels between
// them sagging a little (the shader widens a golf umbrella's and deepens a clear bubble's)
function canopy () {
  const { x, z, top, R, DROP } = UMBRELLA,
    F = [0.34, 0.7, 1]
  const pos = [x, top, z],
    idx = []
  for (const f of F)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        r = R * f * (i % 2 ? 0.95 : 1)
      pos.push(
        x + r * Math.cos(a),
        top - DROP * f ** 1.7,
        z + r * Math.sin(a)
      )
    }
  for (let i = 0; i < 16; i++) idx.push(0, 1 + ((i + 1) % 16), 1 + i)
  for (let j = 0; j < F.length - 1; j++)
    for (let i = 0; i < 16; i++) {
      const a = 1 + j * 16 + i,
        b = 1 + j * 16 + ((i + 1) % 16)
      idx.push(a, b, a + 16, b, b + 16, a + 16)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The pieces, each with the name of the part it is (pedFigure.js PART), for a head whose middle is
// at head ([x, y, z])
export function gear (head) {
  const { x, z, grip, top } = UMBRELLA
  return [
    [
      new THREE.SphereGeometry(1, 9, 5, Math.PI * 1.25, Math.PI * 1.5, 0, 2.3)
        .scale(0.13, 0.148, 0.112)
        .translate(head[0] - 0.018, head[1] + 0.022, 0),
      'HOOD_UP'
    ],
    [canopy(), 'BROLLY'],
    [
      new THREE.CylinderGeometry(0.008, 0.008, top - grip + 0.18, 4).translate(
        x,
        (top + grip) / 2 - 0.02,
        z
      ),
      'SHAFT'
    ],
    [
      new THREE.CylinderGeometry(0.016, 0.016, 0.1, 5).translate(
        x,
        grip - 0.09,
        z
      ),
      'SHAFT'
    ]
  ]
}
