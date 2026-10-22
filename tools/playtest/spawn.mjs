// The draw calls in the seconds after the city starts, and what makes them: the game played on a
// game second at a time from the spawn, a frame drawn after each with every draw call tallied by
// what it drew (renderer.renderBufferDirect wrapped: the object's name, else its parent's, else its
// kind), the main view and the shadow maps apart. Also each frame's own time in the page, split
// into the update (everything up to the drawing) and the drawing (renderer and post), and the heap.
//   node --import ./tools/node-loader/register.mjs tools/playtest/spawn.mjs [--seconds=30] [--query=?spawn=..]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d

// in the page: draw-call tallies (window.__dc) and the frame split (window.__split)
export const instrument = () => {
  const R = window.__roadster,
    r = R.renderer
  if (r.__dcWrapped) return
  r.__dcWrapped = true
  const name = o => {
    for (let x = o, k = 0; x && k < 4; x = x.parent, k++) if (x.name) return x.name
    return (o.isInstancedMesh ? 'inst:' : o.isSkinnedMesh ? 'skin:' : o.isPoints ? 'pts:' : o.isLine ? 'line:' : 'mesh:') + (o.material?.type || '?')
  }
  window.__dc = { main: new Map(), shadow: new Map(), tris: new Map(), on: false }
  const trisOf = (g, o, group) => {
    const n = group ? group.count : g.index ? g.index.count : g.attributes.position?.count || 0
    const k = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1
    return o.isMesh ? (Math.min(n, g.drawRange.count) / 3) * (Number.isFinite(k) ? k : 1) : 0
  }
  const orig = r.renderBufferDirect.bind(r)
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const D = window.__dc
    if (D.on) {
      const m = scene === null ? D.shadow : D.main // (the shadow maps draw with no scene: WebGLShadowMap)
      const k = name(object)
      m.set(k, (m.get(k) || 0) + 1)
      if (m === D.main) D.tris.set(k, (D.tris.get(k) || 0) + trisOf(geometry, object, group))
    }
    return orig(camera, scene, geometry, material, object, group)
  }
  // (the frame's update and its drawing timed apart: post.render is the drawing)
  window.__split = []
  const P = R.post,
    prender = P.render.bind(P)
  P.render = (...a) => {
    const t0 = performance.now()
    const out = prender(...a)
    const t1 = performance.now()
    const s = window.__split
    s.push({ start: document.timeline.currentTime, draw: t1 - t0, end: t1 })
    if (s.length > 50) s.shift()
    return out
  }
}

// one sample: a frame drawn with the tallies on
export const sample = () => new Promise(resolve => {
  const R = window.__roadster
  const D = window.__dc
  window.__draw = true
  let k = 0
  const f = () => {
    if (k === 2) {
      D.main.clear()
      D.shadow.clear()
      D.tris.clear()
      D.on = true
      R.renderer.info.autoReset = false
      R.renderer.info.reset()
    }
    if (++k <= 3) return requestAnimationFrame(f)
    D.on = false
    R.renderer.info.autoReset = true
    window.__draw = false
    const i = R.renderer.info
    const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    const sp = window.__split.at(-1) || {}
    resolve({
      calls: i.render.calls,
      tris: i.render.triangles,
      geos: i.memory.geometries,
      tex: i.memory.textures,
      progs: i.programs?.length || 0,
      main: [...D.main.values()].reduce((a, b) => a + b, 0),
      shadow: [...D.shadow.values()].reduce((a, b) => a + b, 0),
      topMain: top(D.main),
      topShadow: top(D.shadow),
      topTris: top(D.tris).map(([k, v]) => [k, Math.round(v / 1000) + 'k']),
      cam: [R.rig.camera.position.x, R.rig.camera.position.y, R.rig.camera.position.z].map(v => +v.toFixed(1)),
      fov: +R.rig.camera.fov.toFixed(1),
      update: sp.start ? +(sp.end - sp.draw - sp.start).toFixed(1) : null,
      draw: sp.draw ? +sp.draw.toFixed(1) : null,
      heap: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      traffic: R.traffic.cars.length,
      peds: R.peds.list.length,
      scene: (() => { let n = 0; R.cityView.group?.traverse?.(() => n++); return n })()
    })
  }
  requestAnimationFrame(f)
})

export async function spawnProfile (g, seconds = 30) {
  await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
  await g.ev(instrument)
  const out = []
  for (let t = 0; t <= seconds; t++) {
    if (t) {
      const a = await g.ev(() => { const t0 = performance.now(); window.__roadster.advance(1); return performance.now() - t0 })
      var phys = a
    }
    const s = await g.ev(sample)
    s.t = t
    s.phys = t ? +phys.toFixed(1) : null
    out.push(s)
    console.log(`t=${t}s calls=${s.calls} (main ${s.main} shadow ${s.shadow}) tris=${s.tris} geos=${s.geos} progs=${s.progs} cars=${s.traffic} peds=${s.peds} scene=${s.scene} heap=${s.heap} phys=${s.phys}ms/s update=${s.update} draw=${s.draw}`)
  }
  return out
}

if (process.argv[1] && process.argv[1].endsWith('spawn.mjs')) {
  const g = await Game.open({ query: arg('query', ''), width: 480, height: 270 })
  g.step = 'spawn'
  const S = await spawnProfile(g, Number(arg('seconds', 30)))
  const tag = arg('tag', 'spawn')
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(path.join(SHOTS, `${tag}.json`), JSON.stringify(S, null, 1))
  const first = S[0], last = S.at(-1)
  console.log('first top main', JSON.stringify(first.topMain))
  console.log('last top main', JSON.stringify(last.topMain))
  console.log('first top tris', JSON.stringify(first.topTris))
  console.log('last top tris', JSON.stringify(last.topTris))
  console.log('first top shadow', JSON.stringify(first.topShadow))
  console.log('last top shadow', JSON.stringify(last.topShadow))
  console.log('console', JSON.stringify(g.console.slice(0, 5)))
  await g.close()
}
