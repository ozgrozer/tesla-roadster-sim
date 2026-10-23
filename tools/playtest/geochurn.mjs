// Which meshes get new geometry (or new attributes) while playing: the scene's geometries and
// attributes by uuid before and after sec seconds of drawing, the new ones listed by their mesh's
// name and parents, and renderer.info.memory/programs before and after.
//   PORT=8094 node tools/playtest/geochurn.mjs [foot|drive|night] [sec]
import { Game } from './lib.mjs'
const mode = process.argv[2] || 'foot', SEC = Number(process.argv[3] || 10)
const g = await Game.open({ query: '?debug=1', width: 480, height: 270 })
await g.ev(() => { window.__roadster.intro.finish(true) })
await g.ev(() => window.__roadster.climate.quality('high'))
if (mode === 'night') await g.ev(() => window.__roadster.climate.setHour(22.5))
await g.run(1)
if (mode !== 'drive') { await g.page.keyboard.press('KeyF'); await g.wait(3000) }
await g.ev(() => {
  const r = window.__roadster.renderer, f = r.render
  r.render = (...a) => { if (a[0] && a[0].isScene && !window.__scene) window.__scene = a[0]; return f(...a) }
})
await g.draw(4)
const snap = () => g.ev(() => {
  const R = window.__roadster, S = window.__snap || (window.__snap = { g: new Set(), a: new Set() })
  let sc = window.__scene
  if (!sc) {
    const seen = new Set(), q = [R]
    while (q.length && !sc) {
      const o = q.shift()
      if (!o || typeof o !== 'object' || seen.has(o) || seen.size > 20000) continue
      seen.add(o)
      if (o.isObject3D) { let x = o; while (x.parent) x = x.parent; if (x.isScene) { sc = x; break } }
      if (o.isObject3D) continue
      for (const k of Object.keys(o)) q.push(o[k])
    }
    window.__scene = sc
  }
  const name = o => { const n = []; for (let x = o; x && n.length < 4; x = x.parent) n.push(x.name || x.type); return n.join('<') }
  const newG = {}, newA = {}
  sc.traverse(o => {
    if (!o.geometry) return
    const gm = o.geometry
    if (!S.g.has(gm.uuid)) { S.g.add(gm.uuid); const k = name(o) + ' ' + gm.type; newG[k] = (newG[k] || 0) + 1 }
    for (const [an, at] of Object.entries(gm.attributes)) {
      const id = at.__id || (at.__id = Math.random())
      if (!S.a.has(id)) { S.a.add(id); const k = name(o) + '.' + an; newA[k] = (newA[k] || 0) + 1 }
    }
  })
  const i = R.renderer.info
  return { mem: { ...i.memory }, programs: (i.programs || []).length, newG, newA }
})
await g.ev(() => {
  const M = (window.__mut = { n: 0, by: {}, frames: 0 })
  new MutationObserver(l => {
    for (const r of l) {
      M.n++
      const t = r.target.nodeType === 3 ? r.target.parentNode : r.target
      const k = (t && (t.id || t.className || t.tagName)) + ':' + r.type + (r.attributeName ? '.' + r.attributeName : '')
      M.by[k] = (M.by[k] || 0) + 1
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  const f = () => { M.frames++; requestAnimationFrame(f) }
  requestAnimationFrame(f)
})
const a = await snap()
await g.ev(() => { window.__draw = true })
await g.page.keyboard.down('KeyW')
const t0 = Date.now()
const mid = []
while (Date.now() - t0 < SEC * 1000) { await g.wait(2000); mid.push(await snap()) }
await g.page.keyboard.up('KeyW')
await g.ev(() => { window.__draw = false })
console.log('before', JSON.stringify(a.mem), 'programs', a.programs)
for (const m of mid) {
  console.log('mem', JSON.stringify(m.mem), 'programs', m.programs)
  const top = o => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 10)
  for (const [k, v] of top(m.newG)) console.log('   newGeo', v, k)
  for (const [k, v] of top(m.newA)) console.log('   newAttr', v, k)
}
const mut = await g.ev(() => window.__mut)
console.log('DOM mutations', mut.n, 'frames', mut.frames, 'per frame', (mut.n / mut.frames).toFixed(2))
for (const [k, v] of Object.entries(mut.by).sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log('   ', v, k)
await g.close()
