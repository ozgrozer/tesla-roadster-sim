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
  await page.goto(BASE + 'index.html' + query, { timeout: 180000 })
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
// the camera held still, `up` m over (lx, lz) (the player's place by default) and (bx, bz) m off,
// looking at it (the rig's own update held off till release())
async function aerial (page, { up = 60, bx = 0, bz = 40, lx = null, lz = null } = {}) {
  await page.evaluate(({ up, bx, bz, lx, lz }) => {
    const R = window.__roadster
    const p = R.sim.pos
    const tx = lx ?? p.x,
      tz = lz ?? p.z
    if (!R.rig.__upd) R.rig.__upd = R.rig.update
    R.rig.update = () => {
      R.rig.camera.position.set(tx + bx, up, tz + bz)
      R.rig.camera.lookAt(tx, 1, tz)
    }
  }, { up, bx, bz, lx, lz })
}
async function release (page) {
  await page.evaluate(() => {
    const R = window.__roadster
    if (R.rig.__upd) R.rig.update = R.rig.__upd
    R.rig.__upd = null
  })
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

// S2: who is about (the profiles), a street performer downtown and the passers-by stopping to watch
SCENES.peds = () => play('?spawn=100,96,0', async page => {
  await page.evaluate(() => { window.__roadster.env.hour = 14 })
  let r = null
  for (let k = 0; k < 18 && !(r && r.watching >= 2); k++) {
    await run(page, 10)
    r = await page.evaluate(() => {
      const P = window.__roadster.peds
      const names = ['commuter', 'jogger', 'tourist', 'phone', 'loiterer', 'worker']
      const mix = {}
      for (const p of P.list) if (p.liv) mix[names[p.liv.prof]] = (mix[names[p.liv.prof]] || 0) + 1
      const q = P.list.find(p => p.liv?.perf)
      const poi = q?.liv.perf
      const lp = P.list.find(p => p.liv?.poi)?.liv.poi
      return { lp: lp ? { x: lp.x, z: lp.z } : null, living: typeof P.living, n: P.list.length, mix, perf: q ? { x: q.x, z: q.z } : null, watching: poi ? poi.slots.filter(s => s.who).length : 0, gathered: P.gathered || 0, unstuck: P.unstuckN || 0 }
    })
  }
  if (r.perf) await aerial(page, { up: 9, bx: 4, bz: 13, lx: r.perf.x, lz: r.perf.z })
  r.shot = await shot(page, 's2-performer-watchers.png', [
    'S2 a street performer downtown (48, 86): watching now ' + r.watching + ', stopped to watch so far ' + r.gathered,
    'people about ' + r.n + ': ' + JSON.stringify(r.mix)
  ])
  return r
})
// S2: a carjack seen on a busy pavement: people run, freeze or stop to watch; one gets on the phone
SCENES.witness = () => play('?spawn=-96,-250,1.5708', async page => {
  await page.evaluate(() => { window.__roadster.env.hour = 13 })
  await run(page, 8)
  const r = await page.evaluate(() => {
    const R = window.__roadster
    const pos = { x: R.sim.pos.x + 9, z: R.sim.pos.z }
    window.__call = R.peds.witnessCrime({ type: 'carjack', pos, severity: 2 })
    window.__pos = pos
    return { pos, caller: window.__call?.who ?? null }
  })
  await run(page, 2)
  const look = () => page.evaluate(() => {
    const P = window.__roadster.peds,
      c = window.__call
    return { fleeing: P.list.filter(p => p.state === 'flee').length, cowering: P.list.filter(p => p.liv?.cowerT > 0).length, onPhone: P.list.filter(p => p.liv?.call).length, call: c ? c.state : 'none' }
  })
  Object.assign(r, await look())
  await aerial(page, { up: 30, bx: 22, bz: 26, lx: r.pos.x, lz: r.pos.z })
  r.shot = await shot(page, 's2-crime-witnessed.png', [
    'S2 a carjack seen (middle of the picture): 2 s after',
    `running ${r.fleeing}, cowering ${r.cowering}, the caller's call: ${r.call}`
  ])
  await run(page, 8)
  r.after = await look()
  return r
})

// S3: a carjack seen by passers-by (no stars until one rings it in), three stars: the pursuit and a
// roadblock; then away out of sight: the search circle on the radar, the stars going one at a time
SCENES.police = () => play('?spawn=-480,430,1.5708', async page => {
  await page.evaluate(() => { window.__roadster.env.hour = 13 })
  await run(page, 6)
  const r = await page.evaluate(() => {
    const R = window.__roadster
    window.__heard = []
    const S = R.events.subs
    for (const k of ['crime-witnessed', 'crime-called', 'crime-reported', 'police-search', 'police-description-lost']) {
      if (!S.has(k)) S.set(k, new Set())
      S.get(k).add(e => window.__heard.push({ type: e.type, t: +e.t.toFixed(1), by: e.by, radius: e.radius, peds: e.peds, after: e.after }))
    }
    const pos = { x: R.sim.pos.x, z: R.sim.pos.z }
    R.game.crimes.push({ type: 'carjack', pos, severity: 2 })
    R.advance(0.1)
    return { pos, starsAtOnce: R.game.wanted.stars, pending: R.game.reports.pending.length, made0: R.game.reports.made }
  })
  let t = 0
  for (; t < 30; t++) {
    if (await page.evaluate(() => window.__roadster.game.wanted.stars)) break
    await run(page, 1)
  }
  r.reportedAfter = t
  r.starsAfter = await page.evaluate(() => window.__roadster.game.wanted.stars)
  r.calls = await page.evaluate(() => ({ calls: window.__roadster.peds.calls || 0, made: window.__roadster.game.reports.made, lost: window.__roadster.game.reports.lost }))
  // three stars: the units come for them
  await page.evaluate(() => { const R = window.__roadster; R.game.wanted.set(3, R.sim.pos) })
  const pol = () => page.evaluate(() => {
    const G = window.__roadster.game, P = G.police
    return { down: G.down?.kind || null, stars: G.wanted.stars, searching: G.wanted.searching, seen: G.wanted.seen, units: P.units.length, pursuing: P.pursuing, blocks: P.units.filter(u => u.role === 'block').length, nearest: Math.round(P.nearest), described: G.wanted.described }
  })
  for (let k = 0; k < 40; k++) {
    await run(page, 1)
    r.chase = await pol()
    if (r.chase.nearest < 40 || r.chase.down) break
  }
  await aerial(page, { up: 38, bx: -30, bz: 34 })
  r.shot1 = await shot(page, 's3-pursuit.png', [
    `S3 a carjack seen by passers-by: stars at once ${r.starsAtOnce}, after a call (${r.reportedAfter} s) ${r.starsAfter}`,
    `then three stars: units ${r.chase.units} (pursuing ${r.chase.pursuing}), nearest ${r.chase.nearest} m, in sight ${r.chase.seen}`
  ])
  await release(page)
  // away round the corner, out of their sight: the search, the circle on the radar
  await page.evaluate(() => {
    const R = window.__roadster
    const G = R.game
    G.police.clearAll()
    G.wanted.set(3)
    G.wanted.spotted(R.sim.pos)
    G.wanted.seen = false
    R.resetTo('city', { x: -288, z: 288, yaw: 0 })
  })
  await run(page, 4)
  r.search = await pol()
  r.shot2 = await shot(page, 's3-search.png', [
    `S3 out of sight: searching ${r.search.searching}, stars ${r.search.stars} (flashing), police units ${r.search.units}`,
    'the search circle on the radar, from the police-search event'
  ])
  // (and the radar alone, larger)
  const box = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].map(e => e.getBoundingClientRect()).find(b => b.left < 60 && b.bottom > innerHeight - 300 && b.width < 400 && b.width > 80)
    return c ? { x: c.left, y: c.top, width: c.width, height: c.height } : null
  })
  if (box) {
    await page.evaluate(() => { window.__draw = true })
    r.shot3 = path.join(OUT, 's3-search-radar.png')
    await page.screenshot({ path: r.shot3, clip: box, timeout: 180000 })
    await page.evaluate(() => { window.__draw = false })
  }
  // (and on, far off, to lie low: the stars going one by one)
  await page.evaluate(() => window.__roadster.resetTo('city', { x: 480, z: -384, yaw: 0 }))
  const decay = [r.search.stars]
  const t0 = Date.now()
  let gt = 0
  for (let k = 0; k < 40 && decay[decay.length - 1] > 0; k++) {
    await run(page, 3)
    gt += 3
    const s = await page.evaluate(() => window.__roadster.game.wanted.stars)
    if (s !== decay[decay.length - 1]) decay.push(s)
  }
  r.decay = decay
  r.searchEvents = await page.evaluate(() => window.__heard.filter(e => e.type === 'police-search').map(e => [e.t, e.radius]))
  r.decayGameSecs = gt
  r.wallMs = Date.now() - t0
  return r
})

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
