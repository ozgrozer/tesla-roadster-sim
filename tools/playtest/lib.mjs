// The playtest's plumbing: a static server for the repo, a headless Chrome (playwright-core) on the
// real build (dist/roadster.js), and the helpers the flows use to play it: keys held or pressed,
// the game's clock run on (window.__roadster.advance, as rendering in a software GL is slow),
// screenshots, and every console error, warning and page error collected.
//
//   PLAYWRIGHT_CORE  where playwright-core is (a directory with node_modules/playwright-core, or
//                    the package itself); else the usual resolution from here and /tmp/*-smoke
//   CHROME           the browser (default /usr/bin/google-chrome)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const SHOTS = process.env.SHOTS || '/workspace/shots/qa'

function loadPlaywright () {
  const tries = [process.env.PLAYWRIGHT_CORE, ROOT, '/tmp/polish-smoke', '/tmp/foot-smoke'].filter(Boolean)
  for (const t of tries) {
    try {
      const req = createRequire(path.join(t, 'x.js'))
      return req(fs.existsSync(path.join(t, 'package.json')) && t.endsWith('playwright-core') ? t : 'playwright-core')
    } catch {}
  }
  throw new Error('playwright-core not found: npm i playwright-core somewhere and set PLAYWRIGHT_CORE')
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webp': 'image/webp' }
export function serve (port = 0) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const f = path.join(ROOT, u === '/' ? 'index.html' : u)
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' })
    fs.createReadStream(f).pipe(res)
  })
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)))
}

// One game in a page. issues: everything that went wrong, with the step it was in
export class Game {
  constructor (browser, page, base) {
    this.browser = browser
    this.page = page
    this.base = base
    this.step = 'load'
    this.issues = []
    this.console = []
    page.on('console', m => {
      const t = m.type()
      if (t === 'error' || t === 'warning') this.console.push({ step: this.step, type: t, text: m.text().slice(0, 300) })
    })
    page.on('pageerror', e => this.console.push({ step: this.step, type: 'pageerror', text: String(e.stack || e.message).slice(0, 600) }))
  }
  static async open ({ query = '', width = 960, height = 540 } = {}) {
    const { chromium } = loadPlaywright()
    const server = await serve(Number(process.env.PORT) || 0)
    const base = `http://127.0.0.1:${server.address().port}/`
    const browser = await chromium.launch({
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc']
    })
    const page = await browser.newPage({ viewport: { width, height } })
    const g = new Game(browser, page, base)
    g.server = server
    await g.goto(query)
    return g
  }
  async goto (query = '') {
    if (this.step === 'load') this.step = 'load ' + query
    await this.page.goto(this.base + 'index.html' + query, { timeout: 180000 })
    await this.page.waitForFunction(() => window.__roadster && window.__roadster.app.world, null, { timeout: 240000 })
    await this.wait(1500)
    // drawing off between screenshots: a software GL takes a second or more a frame, the game's
    // own work a few ms (the frame loop still runs: the clock, the HUD, the camera)
    await this.ev(() => {
      const R = window.__roadster
      window.__draw = false
      for (const o of [R.renderer, R.post]) {
        if (!o || !o.render || o.__wrapped) continue
        const f = o.render.bind(o)
        o.render = (...a) => window.__draw && f(...a)
        o.__wrapped = true
      }
    })
  }
  // n frames drawn (then drawing off again)
  async draw (n = 2) {
    await this.ev(n => new Promise(resolve => {
      window.__draw = true
      let k = 0
      const f = () => (++k > n ? resolve() : requestAnimationFrame(f))
      requestAnimationFrame(f)
    }), n)
  }
  async close () {
    await this.browser.close()
    this.server.close()
  }
  ev (f, a) {
    return this.page.evaluate(f, a)
  }
  wait (ms) {
    return this.page.waitForTimeout(ms)
  }
  // the game's clock on by sec (physics, the player, the police, the missions), a frame drawn now
  // and then
  async run (sec, chunk = 0.25, waitMs = 20) {
    for (let t = 0; t < sec - 1e-6; t += chunk) {
      await this.ev(s => window.__roadster.advance(s), Math.min(chunk, sec - t))
      if (waitMs) await this.wait(waitMs)
    }
  }
  // keys held while fn runs (fn: a number is seconds of game clock)
  async hold (keys, fn) {
    keys = [].concat(keys)
    for (const k of keys) await this.page.keyboard.down(k)
    try {
      if (typeof fn === 'number') await this.run(fn)
      else await fn()
    } finally {
      for (const k of keys) await this.page.keyboard.up(k)
    }
  }
  async press (key, after = 0.3) {
    await this.page.keyboard.press(key)
    if (after) await this.run(after)
  }
  async shot (name) {
    await this.ev(() => { if (window.__roadster.rig) window.__roadster.rig.blend = 1 })
    await this.draw(2)
    const p = path.join(SHOTS, name)
    await this.page.screenshot({ path: p, timeout: 120000 })
    await this.ev(() => { window.__draw = false })
    return p
  }
  issue (what, detail = '') {
    this.issues.push({ step: this.step, what, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) })
  }
  expect (ok, what, detail) {
    if (!ok) this.issue(what, detail)
    return !!ok
  }
  // wait (real time: what the frame loop does, the fades, the titles, the clock's lapse) until
  // test() in the page is true, up to ms
  async untilReal (test, ms, arg) {
    for (let t = 0; t < ms; t += 250) {
      if (await this.ev(test, arg)) return true
      await this.wait(250)
    }
    return !!(await this.ev(test, arg))
  }
  // wait (on the game clock) until test() in the page is true, up to sec
  async until (test, sec, arg, chunk = 0.25) {
    for (let t = 0; t < sec; t += chunk) {
      if (await this.ev(test, arg)) return true
      await this.run(chunk)
    }
    return !!(await this.ev(test, arg))
  }
}
