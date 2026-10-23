// The key light's shadow casters, regrouped by where they stand (an idea from mrdoob/slop-newyork
// js/scene-culling.js, its shadow proxies; MIT, (c) 2026 Mr.doob). The city's meshes are one a
// district (chunks.js) or the size of a district or more, so the shadow box that rides along with
// the car, 72 m across, took in every caster of every district it touched: some 420 draw calls and
// two million triangles a frame at golden hour, as many as the view itself. Here each static
// caster is copied into stand-ins a block (CELL m) square: the instanced ones as instances of the
// same mesh in the same material (so they shadow just as they did: the trees' sway, the tinted depth
// material), the rest as their bare triangles merged a block at a time, and while the key light's
// map is drawn the stand-ins cast in their place, so that it only draws the few blocks it sees. The
// city's own map (sunShadow.js), drawn once for the whole city, still draws the originals.
// Anything that changes (a post knocked down, a set of things shown or hidden, something that
// moves) has its blocks made again; something that keeps changing is left to cast for itself.
import * as THREE from 'three'

const CELL = 96 // m: a block
const MIN_R = 1.5 * CELL // only casters reaching across more than a block or so are worth it
const MIN_TRIS = 600
const RESTLESS = 20 // changes in a row after which a caster is left to cast for itself
const _m = new THREE.Matrix4(),
  _a = new THREE.Vector3()
const cellOf = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL)
const trisOf = g => (g.index ? g.index.count : g.attributes.position.count) / 3

// is o shown (as the city means it to be: a streamed mesh by its own flag, not by its distance),
// it and every group up to root
function shown (o, root) {
  for (let p = o; p && p !== root; p = p.parent) {
    const on = p.userData.streamed ? p.userData.on : p.visible
    if (!on) return false
  }
  return true
}
function canProxy (o) {
  if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || Array.isArray(o.material)) return false
  const g = o.geometry,
    m = o.material
  if (!g?.attributes?.position || g.morphAttributes?.position) return false
  if (m.alphaTest > 0 || m.alphaMap || m.displacementMap || m.clippingPlanes) return false
  if (!o.isInstancedMesh && (o.customDepthMaterial || o.customDistanceMaterial)) return false
  let b = o.isInstancedMesh ? o.boundingSphere : g.boundingSphere
  if (!b) {
    if (o.isInstancedMesh) o.computeBoundingSphere()
    else g.computeBoundingSphere()
    b = o.isInstancedMesh ? o.boundingSphere : g.boundingSphere
  }
  const r = b.radius * o.matrixWorld.getMaxScaleOnAxis()
  return r > MIN_R && trisOf(g) * (o.isInstancedMesh ? o.count : 1) > MIN_TRIS
}
// what a caster's state is, to tell when it has changed
function stamp (s, root) {
  const o = s.o
  return (
    (shown(o, root) ? 'y' : 'n') +
    (o.isInstancedMesh ? o.instanceMatrix.version + ':' + o.count : '') +
    o.matrixWorld.elements.join(',')
  )
}

// the meshes under root now (before the traffic, the people and the aircraft are added)
export function statics (root) {
  const list = []
  root.traverse(o => {
    if (o.isMesh) list.push(o)
  })
  return list
}
const WHITE = new THREE.Color(1, 1, 1)

export class ShadowProxies {
  // root: the city's group; list: the casters to stand in for (the city's own, not its traffic:
  // statics); renderer; skip(): true while a pass is drawn that wants the originals
  constructor (root, list, renderer, skip) {
    this.root = root
    this.on = true
    this.sources = []
    this.kinds = new Map() // key -> { o (the first), cells: Map(cell -> mesh) }
    this.merged = new Map() // side key -> Map(cell -> mesh)
    this.mats = new Map()
    this.stats = { draws: 0, rebuilds: 0 } // (for the perf report)
    root.updateMatrixWorld(true)
    for (const o of list) {
      if (!canProxy(o)) continue
      const s = { o, stamp: '', restless: 0, live: true }
      s.key = o.isInstancedMesh
        ? [o.geometry.uuid, o.material.uuid, o.customDepthMaterial?.uuid, !!o.instanceColor, o.layers.mask].join('|')
        : [o.material.side, o.material.shadowSide, o.layers.mask].join('|')
      s.stamp = stamp(s, root)
      this.sources.push(s)
    }
    this.rebuild(new Set(this.sources.map(s => s.key)))
    const sm = renderer.shadowMap
    if (!sm || !sm.render) return
    const draw = sm.render.bind(sm)
    sm.render = (lights, scene, camera) => {
      if (!this.on || !root.visible || skip()) return draw(lights, scene, camera)
      this.stats.draws++
      this.swap(true)
      try {
        draw(lights, scene, camera)
      } finally {
        this.swap(false)
      }
    }
  }
  get count () {
    let n = 0
    for (const k of this.kinds.values()) n += k.cells.size
    for (const c of this.merged.values()) n += c.size
    return n
  }
  // the stand-ins in for the originals (or back out)
  swap (into) {
    if (into) this.check()
    for (const s of this.sources) if (s.live) s.o.castShadow = !into
    for (const k of this.kinds.values()) for (const m of k.cells.values()) m.visible = into
    for (const c of this.merged.values()) for (const m of c.values()) m.visible = into
  }
  // anything changed since its blocks were made: made again (and anything that keeps changing left
  // to itself)
  check () {
    const dirty = new Set()
    for (const s of this.sources) {
      if (!s.live) continue
      const now = stamp(s, this.root)
      if (now === s.stamp) {
        s.restless = 0
        continue
      }
      s.stamp = now
      if (++s.restless >= RESTLESS) {
        s.live = false
        s.o.castShadow = true
      }
      dirty.add(s.key)
    }
    if (dirty.size) {
      this.stats.rebuilds++
      this.rebuild(dirty)
    }
  }
  // the stand-ins for the casters of each kind in keys made again
  rebuild (keys) {
    for (const key of keys) {
      const srcs = this.sources.filter(s => s.key === key && s.live && shown(s.o, this.root))
      const inst = srcs[0]?.o.isInstancedMesh ?? this.kinds.has(key)
      const old = inst ? this.kinds.get(key)?.cells : this.merged.get(key)
      if (old) for (const m of old.values()) this.drop(m)
      const cells = new Map()
      if (inst) this.kinds.set(key, { cells })
      else this.merged.set(key, cells)
      if (!srcs.length) continue
      if (inst) this.instanced(srcs, cells)
      else this.triangles(srcs, cells)
    }
  }
  drop (m) {
    this.root.remove(m)
    if (!m.isInstancedMesh) m.geometry.dispose()
    else m.dispose()
  }
  add (m, like) {
    m.name = 'shadow proxy'
    m.castShadow = true
    m.receiveShadow = false
    m.visible = false
    m.layers.mask = like.layers.mask
    m.userData.proxy = true
    this.root.add(m)
  }
  // instanced casters: their instances sorted into blocks, each block an instanced mesh of its own
  instanced (srcs, cells) {
    const by = new Map()
    for (const s of srcs) {
      const o = s.o,
        e = o.instanceMatrix.array
      for (let i = 0; i < o.count; i++) {
        _m.fromArray(e, i * 16).premultiply(o.matrixWorld)
        const k = cellOf(_m.elements[12], _m.elements[14])
        let list = by.get(k)
        if (!list) by.set(k, (list = []))
        list.push(..._m.elements)
      }
    }
    const o = srcs[0].o
    for (const [k, list] of by) {
      const n = list.length / 16,
        m = new THREE.InstancedMesh(o.geometry, o.material, n)
      m.instanceMatrix.array.set(list)
      if (o.instanceColor) for (let i = 0; i < n; i++) m.setColorAt(i, WHITE)
      m.customDepthMaterial = o.customDepthMaterial
      m.customDistanceMaterial = o.customDistanceMaterial
      m.computeBoundingSphere()
      this.add(m, o)
      cells.set(k, m)
    }
  }
  // the rest: their triangles in the world, merged a block at a time
  triangles (srcs, cells) {
    const by = new Map()
    for (const s of srcs) {
      const o = s.o,
        g = o.geometry,
        pos = g.attributes.position,
        idx = g.index,
        start = g.drawRange.start,
        end = Math.min(idx ? idx.count : pos.count, start + g.drawRange.count),
        w = o.matrixWorld,
        t = [0, 0, 0]
      for (let i = start; i + 2 < end; i += 3) {
        let cx = 0,
          cz = 0
        for (let j = 0; j < 3; j++) {
          _a.fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j).applyMatrix4(w)
          t[j] = [_a.x, _a.y, _a.z]
          cx += _a.x
          cz += _a.z
        }
        const k = cellOf(cx / 3, cz / 3)
        let list = by.get(k)
        if (!list) by.set(k, (list = []))
        list.push(...t[0], ...t[1], ...t[2])
      }
    }
    const o = srcs[0].o,
      side = o.material.side,
      shadowSide = o.material.shadowSide
    const mk = side + ',' + shadowSide
    let mat = this.mats.get(mk)
    if (!mat) this.mats.set(mk, (mat = new THREE.MeshBasicMaterial({ side, shadowSide, colorWrite: false })))
    for (const [k, list] of by) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3))
      g.computeBoundingSphere()
      const m = new THREE.Mesh(g, mat)
      this.add(m, o)
      cells.set(k, m)
    }
  }
}
