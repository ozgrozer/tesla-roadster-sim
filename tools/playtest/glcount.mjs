// Sync points and uploads, counted: every WebGL call that stalls the pipeline (readPixels,
// finish, getBufferSubData, clientWaitSync, getError, the get*Parameter queries) or uploads
// (texImage/texSubImage, bufferData/bufferSubData, generateMipmap), shader compiles and links, and
// 2D-canvas getImageData, wrapped on the prototypes before the page loads. Then load, drive, walk
// and drive at night with every frame drawn, and report each phase's counts per drawn frame,
// with the bundle's callers (dist/roadster.js:line) of the worst ones. Writes $SHOTS/<tag>.json.
//   PORT=8094 SHOTS=... node tools/playtest/glcount.mjs [tag] [seconds per phase]
import fs from 'node:fs'
import path from 'node:path'
import { Game, SHOTS } from './lib.mjs'

const tag = process.argv[2] || 'glcount'
const SEC = Number(process.argv[3] || 20)
const init = () => {
  const C = (window.__gl = { n: {}, bytes: {}, who: {}, frames: 0 })
  const SYNC = ['readPixels', 'finish', 'getBufferSubData', 'clientWaitSync', 'getError', 'getParameter', 'getShaderParameter', 'getProgramParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getQueryParameter', 'getSyncParameter', 'getExtension', 'checkFramebufferStatus', 'getActiveUniform', 'getUniformLocation']
  const UP = ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'compressedTexImage2D', 'bufferData', 'bufferSubData', 'generateMipmap', 'compileShader', 'linkProgram', 'createTexture', 'createBuffer', 'deleteTexture', 'deleteBuffer', 'renderbufferStorageMultisample', 'blitFramebuffer']
  const DRAW = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']
  const caller = () => {
    const s = new Error().stack.split('\n').slice(3)
    const l = s.find(x => /roadster\.js/.test(x)) || s[0] || ''
    return (l.match(/roadster\.js:(\d+)/) || [])[1] || l.trim().slice(0, 80)
  }
  const size = a => {
    for (const x of a) if (x && x.byteLength !== undefined) return x.byteLength
    for (const x of a) if (x && x.width && x.height) return x.width * x.height * 4
    return typeof a[1] === 'number' && a.length === 3 ? a[1] : 0
  }
  const wrap = (P, m, track) => {
    const f = P[m]
    if (!f || f.__w) return
    P[m] = function (...a) {
      C.n[m] = (C.n[m] || 0) + 1
      if (track) {
        const b = size(a)
        if (b) C.bytes[m] = (C.bytes[m] || 0) + b
        const k = m + ' @' + caller()
        C.who[k] = (C.who[k] || 0) + 1
      }
      return f.apply(this, a)
    }
    P[m].__w = true
  }
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const m of SYNC) wrap(P, m, !/^get(Parameter|Extension|UniformLocation|ActiveUniform)$/.test(m))
    for (const m of UP) wrap(P, m, true)
    for (const m of DRAW) wrap(P, m, false)
  }
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', true)
  wrap(CanvasRenderingContext2D.prototype, 'putImageData', true)
  wrap(HTMLCanvasElement.prototype, 'toDataURL', true)
}
const g = await Game.open({ width: 480, height: 270 })
await g.page.addInitScript(init)
await g.goto('?debug=1')
await g.ev(() => { window.__roadster.intro.finish(true); const h = document.getElementById('help'); if (h) h.hidden = true })
const take = () => g.ev(() => { const C = window.__gl, o = JSON.parse(JSON.stringify(C)); C.n = {}; C.bytes = {}; C.who = {}; C.frames = 0; return o })
// drawing on for sec real seconds, every frame drawn and counted
const play = async (sec, keys = []) => {
  await take()
  await g.ev(() => {
    window.__draw = true
    const tick = () => { if (!window.__draw) return; window.__gl.frames++; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  for (const k of keys) await g.page.keyboard.down(k)
  await g.wait(sec * 1000)
  for (const k of keys) await g.page.keyboard.up(k)
  await g.ev(() => { window.__draw = false })
  return take()
}
const phases = {}
phases.load = await take()
await g.ev(q => window.__roadster.climate.quality(q), process.argv[4] || 'high'); await g.run(1)
phases.drive = await play(SEC, ['KeyW'])
await g.ev(() => window.__roadster.seatIn('sedan')); await g.run(1)
phases.cityCar = await play(SEC, ['KeyW'])
await g.page.keyboard.press('KeyF'); await g.wait(3000)
phases.foot = await play(SEC, ['KeyW'])
await g.ev(() => { window.__roadster.climate.setHour(22.5) }); await g.run(1)
await g.page.keyboard.press('KeyF'); await g.wait(2500)
phases.night = await play(SEC, ['KeyW'])
const out = {}
for (const [p, c] of Object.entries(phases)) {
  const f = Math.max(1, c.frames)
  const per = Object.fromEntries(Object.entries(c.n).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, p === 'load' ? v : +(v / f).toFixed(2)]))
  const who = Object.entries(c.who).sort((a, b) => b[1] - a[1]).slice(0, 25)
  out[p] = { frames: c.frames, perFrame: per, bytesPerFrame: Object.fromEntries(Object.entries(c.bytes).map(([k, v]) => [k, Math.round(v / f)])), who }
  console.log(`== ${p}: ${c.frames} frames`)
  console.log('  ', JSON.stringify(per))
  console.log('   bytes/frame', JSON.stringify(out[p].bytesPerFrame))
  for (const [k, v] of who.slice(0, 14)) console.log('    ', v, k)
}
fs.mkdirSync(SHOTS, { recursive: true })
fs.writeFileSync(path.join(SHOTS, tag + '.json'), JSON.stringify(out, null, 1))
console.log('console', JSON.stringify(g.console.filter(c => c.type !== 'warning').slice(0, 5)))
await g.close()
