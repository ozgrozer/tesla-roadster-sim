// The lit street-name signs on the signal masts' arms, as at Los Angeles' junctions: the name of
// the street being crossed (areas.js), white on green, lit from inside at night. All the names are
// drawn into one small texture; each sign is an instance of one plate, its own name picked out of
// the texture by an attribute of its own (its rect in the texture), so the lot draws in one call.
import * as THREE from 'three'
import { Instances } from './chunks.js'
import { STREETS_EW, STREETS_NS } from '../sim/areas.js'
import { NODES } from '../sim/city.js'

// how a sign spells a street: Blvd as Bl, Ave as Av, as the signs do
const spell = s => s.replace(/ Blvd$/, ' Bl').replace(/ Ave$/, ' Av')
const NAMES = [...STREETS_EW, ...STREETS_NS]
// (two columns of names, a name 256 by 46 px; the texture 512 px square)
const CW = 256,
  CH = 46,
  TH = 512

function namesTex () {
  const cv = document.createElement('canvas')
  cv.width = 2 * CW
  cv.height = TH
  const g = cv.getContext('2d')
  NAMES.forEach((name, i) => {
    const x = (i % 2) * CW,
      y = Math.floor(i / 2) * CH
    g.fillStyle = '#0f5a3a'
    g.fillRect(x, y, CW, CH)
    g.strokeStyle = '#e9efe9'
    g.lineWidth = 2
    g.strokeRect(x + 3, y + 3, CW - 6, CH - 6)
    g.fillStyle = '#ffffff'
    g.font = 'bold 30px "Helvetica Neue", Helvetica, Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const s = spell(name),
      w = g.measureText(s).width,
      k = Math.min(1, (CW - 20) / w)
    g.save()
    g.translate(x + CW / 2, y + CH / 2 + 1)
    g.scale(k, 1)
    g.fillText(s, 0, 0)
    g.restore()
  })
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
// a name's rect in the texture: [u0, v0, u1, v1]
const rectOf = i => {
  const x = (i % 2) * CW,
    y = Math.floor(i / 2) * CH
  return [
    (x + 1) / (2 * CW),
    1 - (y + CH - 1) / TH,
    (x + CW - 1) / (2 * CW),
    1 - (y + 1) / TH
  ]
}

// A sign under each mast's arm (poles: the sim's POLES; place(p): the mast's matrix; at: where the
// plate hangs in the mast's frame, [x, y, z], facing -x), its name the street the mast's traffic
// crosses (traffic along x crosses a north-south street). Returns its instances (they go over with
// the mast) and night(k).
export function nameSigns (poles, place, at) {
  const plate = new THREE.PlaneGeometry(2.5, 0.48)
    .rotateY(-Math.PI / 2)
    .translate(...at)
  const rects = new Float32Array(poles.length * 4)
  poles.forEach((p, i) => {
    const n = NODES[p.node],
      k = p.dir % 2 === 0 ? STREETS_EW.length + n.ix : n.iz
    rects.set(rectOf(k), i * 4)
  })
  plate.setAttribute('rect', new THREE.InstancedBufferAttribute(rects, 4))
  const tex = namesTex()
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.2,
    roughness: 0.45
  })
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rect;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vMapUv = mix(rect.xy, rect.zw, uv);
        vEmissiveMapUv = vMapUv;`
      )
  }
  mat.customProgramCacheKey = () => 'street names'
  const signs = new Instances(plate, mat, poles.length, i => poles[i], {
    cast: false,
    split: false
  })
  poles.forEach((p, i) => signs.setMatrixAt(i, place(p)))
  for (const m of signs.meshes) m.name = 'street names'
  signs.bounds()
  return {
    signs,
    night (k) {
      mat.emissiveIntensity = 0.2 + 0.9 * k
    }
  }
}
