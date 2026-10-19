// The sim workstream's headless checks (round 2): the real build served on a private port
// (python3 -m http.server 8091 from the worktree), driven through window.__roadster in a headless
// Chrome (playwright-core), screenshots to /workspace/shots/v2/sim/. Each scene sets up the city,
// runs the game clock on, reads the sim's own counters and saves a picture with them overlaid.
//   node tools/sim/shots.mjs [scene ...]     (scenes: freeway, stop, peds, police; default all)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const BASE = process.env.BASE || 'http://127.0.0.1:8091/'
const OUT = process.env.SHOTS || '/workspace/shots/v2/sim'
const req = createRequire(path.join(process.env.PLAYWRIGHT_CORE || '/tmp/polish-smoke', 'x.js'))
const { chromium } = req('playwright-core')

async function open (query) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  })
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 400)))
  page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  await page.goto(BASE + 'index.html' + query)
  await page.waitForFunction(() => window.__roadster && window.__roadster.app.world, null, { timeout: 180000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    window.__roadster.intro.finish(true)
    const h = document.getElementById('help')
    if (h) h.hidden = true
  })
  // (drawing off between pictures: swiftshader is slow; the game's clock is run on by hand)
  await page.evaluate(() => {
    const R = window.__roadster
    window.__draw = false
    for (const o of [R.renderer, R.post]) {
      if (!o || !o.render || o.__wrapped) continue
      const f = o.render.bind(o)
      o.render = (...a) => window.__draw && f(...a)
      o.__wrapped = true
    }
  })
  return { browser, page, errors }
}
async function run (page, sec) {
  const t0 = Date.now()
  for (let t = 0; t < sec; t += 0.5) await page.evaluate(s => window.__roadster.advance(s), 0.5)
  if (process.env.VERBOSE) console.log('ran', sec, 's in', Date.now() - t0, 'ms')
}
// the camera free, `up` m over the player and `back` m off along (bx, bz), looking at (lx, lz)
async function aerial (page, { up = 60, bx = 0, bz = 40, lx = null, lz = null } = {}) {
  await page.evaluate(({ up, bx, bz, lx, lz }) => {
    const R = window.__roadster
    R.rig.setMode('free')
    const p = R.sim.pos
    const tx = lx ?? p.x,
      tz = lz ?? p.z
    R.rig.controls.target.set(tx, 0, tz)
    R.rig.camera.position.set(tx + bx, up, tz + bz)
    R.rig.controls.update()
  }, { up, bx, bz, lx, lz })
}
async function shot (page, name, lines) {
  await page.evaluate(lines => {
    let d = document.getElementById('__simnote')
    if (!d) {
      d = document.createElement('div')
      d.id = '__simnote'
      d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:13px/1.35 monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px 9px;border-radius:4px;white-space:pre'
      document.body.appendChild(d)
    }
    d.textContent = lines.join('\n')
  }, lines)
  await page.evaluate(() => new Promise(resolve => {
    window.__draw = true
    let k = 0
    const f = () => (++k > 3 ? resolve() : requestAnimationFrame(f))
    requestAnimationFrame(f)
  }))
  const p = path.join(OUT, name)
  await page.screenshot({ path: p, timeout: 180000 })
  await page.evaluate(() => { window.__draw = false })
  console.log('saved', p)
  return p
}

// one game per scene: set up, run on, look, picture; returns what it read
async function play (query, fn) {
  const g = await open(query)
  try {
    const out = await fn(g.page)
    out.errors = g.errors.slice(0, 5)
    return out
  } finally {
    await g.browser.close()
  }
}
const SCENES = {
  // S1: the freeway from above, its traffic changing lanes (the Roadster parked below the deck)
  freeway: () => play('?spawn=200,192,0', async page => {
    await run(page, +(process.env.RUN || 40))
    const r = await page.evaluate(() => {
      const T = window.__roadster.traffic
      const fw = T.cars.filter(c => !c.parked && c.edge?.hw && !c.edge.road)
      return { changes: T.fwyChanges, onDeck: fw.length, changing: fw.filter(c => c.lc > 0).length, signalling: fw.filter(c => c.want).length }
    })
    await aerial(page, { up: 55, bx: -50, bz: 45, lx: 200, lz: 144 })
    r.shot = await shot(page, 's1-freeway-lanes.png', [
      'S1 freeway: lane changes so far ' + r.changes,
      `cars on the deck ${r.onDeck}, changing lanes now ${r.changing}, signalling ${r.signalling}`
    ])
    return r
  }),
  // S1: an all-way stop in the suburbs (Leimert Park), from above
  stop: () => play('?spawn=-150,520,0', async page => {
    await run(page, +(process.env.RUN || 45))
    const r = await page.evaluate(() => {
      const T = window.__roadster.traffic
      const stops = T.cars.filter(c => !c.parked && c.arrive > 0).length
      const through = T.cars.filter(c => !c.parked && c.go && c.edge?.road).length
      // (a car stopped at a stop line just now, to look at)
      const at = T.cars.find(c => !c.parked && c.arrive > 0 && c.v < 1 && c.edge && T.stopNode?.(c)) ||
        T.cars.find(c => !c.parked && c.arrive > 0 && c.v < 1)
      return { waitingAtStops: stops, stuck: T.stuckN, n: T.n, at: at ? { x: at.x, z: at.z } : null }
    })
    const at = r.at || { x: -192, z: 480 }
    await aerial(page, { up: 32, bx: 22, bz: 26, lx: at.x, lz: at.z })
    r.shot = await shot(page, 's1-allway-stop.png', [
      'S1 all-way stop at a quiet suburban junction: heads flash red, each car stops, first come first go',
      `cars that have stopped at all-way-stop lines ${r.waitingAtStops}; stuck watchdog ${JSON.stringify(r.stuck)}`
    ])
    return r
  })
}

const want = process.argv.slice(2)
const report = {}
fs.mkdirSync(OUT, { recursive: true })
for (const [name, fn] of Object.entries(SCENES)) {
  if (want.length && !want.includes(name)) continue
  const t0 = Date.now()
  try {
    report[name] = await fn()
  } catch (e) {
    report[name] = { error: String(e.stack || e) }
  }
  report[name].secs = Math.round((Date.now() - t0) / 1000)
  console.log(name, JSON.stringify(report[name]))
}
fs.writeFileSync(path.join(OUT, 'report-' + (want.join('-') || 'all') + '.json'), JSON.stringify(report, null, 2))
