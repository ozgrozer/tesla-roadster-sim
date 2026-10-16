// Renders og-image.png, the 1200x630 card social sites show for a shared link, from the game itself:
// the Roadster lifting off a downtown avenue at golden hour on its lift thrusters, with the title over
// it. Drives headless Chrome over the DevTools protocol, so it needs Chrome and Node 22 (for its
// built-in WebSocket), and no packages.
//
//   node tools/og.mjs          (CHROME=/path/to/chrome to use another browser binary)
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'og-image.png')
const W = 1200
const H = 630
const CHROME =
  process.env.CHROME ||
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  }[process.platform] ||
  'google-chrome'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// The shot, run in the page: the car on the avenue east of downtown, a camera level with it off its
// front quarter looking back up the avenue into the low sun, full lift until it is 6 m up, then the
// picture holds (no more frames are drawn) with the thrusters still firing.
const SHOT = `(() => {
  const r = window.__roadster
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
  r.resetTo('city', { x: 130, z: 0, yaw: 0.15 })
  r.rig.update = () => {} // the shot places the camera itself
  const cam = r.rig.camera
  cam.fov = 38
  cam.updateProjectionMatrix()
  key('KeyF', true)
  ;(function tick () {
    if (window.ogDone) return
    requestAnimationFrame(tick)
    const p = r.sim.mode === 'air' ? r.sim.com : r.sim.pos
    // aimed off to the car's left, so it sits right of the title
    cam.position.set(p.x + 7.8, p.y - 0.4, p.z + 4.3)
    cam.lookAt(p.x - 0.6, p.y + 0.5, p.z + 1.3)
    if (p.y >= 6) {
      window.ogDone = true
      window.requestAnimationFrame = () => 0
    }
  })()
})()`

// The title over the shot, in the game's own type, on a shade that keeps it readable over the sky.
const CARD = `(() => {
  document.head.insertAdjacentHTML('beforeend', \`<style>
    .hud, .fade, .loading { display: none !important }
    .og { position: fixed; inset: 0; pointer-events: none; display: flex; flex-direction: column;
      justify-content: center; padding: 0 0 12px 64px; gap: 14px; color: var(--ano);
      background: linear-gradient(90deg, rgba(5,6,10,.78) 0%, rgba(5,6,10,.5) 34%, rgba(5,6,10,0) 58%) }
    .og .k { font: 600 15px var(--mono); letter-spacing: .24em; color: var(--gold); text-transform: uppercase }
    .og h1 { margin: 0; font: 800 66px/0.98 var(--display); letter-spacing: .1em; text-transform: uppercase;
      text-shadow: 0 2px 18px rgba(0,0,0,.5) }
    .og p { margin: 4px 0 0; font: 400 19px/1.55 var(--mono); color: #d9dde2; max-width: 520px }
    .og .u { margin-top: 14px; font: 600 14px var(--mono); letter-spacing: .08em; color: var(--dim) }
  </style>\`)
  document.body.insertAdjacentHTML('beforeend', \`<div class="og">
    <div class="k">Fan-made simulation</div>
    <h1>Tesla<br>Roadster Sim</h1>
    <p>Fly it on cold-gas thrusters, ride the 170° wall and roam a living city</p>
    <div class="u">Plays in your browser</div>
  </div>\`)
  return document.fonts.ready.then(() => true)
})()`

const dir = mkdtempSync(join(tmpdir(), 'roadster-og-'))
const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--ignore-gpu-blocklist',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

// a tab to drive: send(method, params) resolves with the result of one DevTools command
async function connect () {
  for (let i = 0; i < 100; i++) {
    try {
      const tabs = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json()
      const tab = tabs.find(t => t.type === 'page')
      if (tab) {
        const ws = new WebSocket(tab.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          ws.onopen = resolve
          ws.onerror = reject
        })
        let id = 0
        const pending = new Map()
        ws.onmessage = m => {
          const msg = JSON.parse(m.data)
          const p = pending.get(msg.id)
          if (!p) return
          pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error.message))
          else p.resolve(msg.result)
        }
        return (method, params = {}) =>
          new Promise((resolve, reject) => {
            pending.set(++id, { resolve, reject })
            ws.send(JSON.stringify({ id, method, params }))
          })
      }
    } catch {}
    await sleep(100)
  }
  throw new Error(`Chrome did not start (${CHROME}); set CHROME to its path`)
}

try {
  const send = await connect()
  const run = async expression => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }
  // drawn at twice the size and scaled down, for clean edges
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 2,
    mobile: false
  })
  await send('Page.navigate', { url: `file://${join(ROOT, 'index.html')}` })
  for (let i = 0; i < 100 && !(await run('!!window.__roadster')); i++)
    await sleep(100)
  await sleep(1500) // the city builds and the first frames settle
  await run(SHOT)
  for (let i = 0; i < 100 && !(await run('!!window.ogDone')); i++)
    await sleep(100)
  await run(CARD)
  await sleep(300)
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: W, height: H, scale: 0.5 }
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`Wrote ${OUT}`)
} finally {
  chrome.kill('SIGKILL')
  await sleep(200)
  rmSync(dir, { recursive: true, force: true })
}
