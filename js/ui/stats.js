// The pause menu's STATS tab: the missions (each one's name, its pay, passed or not) and the
// player's record, kept between visits: time in the city, how far driven and walked, cars stolen,
// crimes, people hit, crashes, the most stars and the cash. The counts come from the game's events
// (gameEvents.js), the distances from the player's position each frame (track).
import { onGame } from '../sim/gameEvents.js'
import { MISSIONS } from '../sim/missions/index.js'
import { recall, remember } from './prefs.js'

const KEYS = ['time', 'drive', 'walk', 'stolen', 'crimes', 'hit', 'crashes', 'stars', 'busted', 'wasted']
export class Stats {
  constructor (box) {
    this.box = box
    this.s = {}
    let saved = {}
    try {
      saved = JSON.parse(recall('stats', '{}')) || {}
    } catch {}
    for (const k of KEYS) this.s[k] = Number(saved[k]) || 0
    this.passed = new Set(Array.isArray(saved.passed) ? saved.passed : [])
    this.last = null
    this.saveT = 0
    const count = (type, k) => onGame(type, () => this.s[k]++)
    count('car-stolen', 'stolen')
    count('crime', 'crimes')
    count('ped-hit', 'hit')
    count('car-crash', 'crashes')
  }
  // each frame in the city: p the player ({ mode, pos }), stars, missions (the manager), dt s
  track (dt, p, stars, missions) {
    const s = this.s
    s.time += dt
    s.stars = Math.max(s.stars, stars || 0)
    if (p?.pos) {
      if (this.last) {
        const d = Math.hypot(p.pos.x - this.last.x, p.pos.z - this.last.z)
        // (a jump of more than a sprint or a fast car's frame is a respawn, not a journey)
        if (d < 4) s[p.mode === 'foot' ? 'walk' : 'drive'] += d
      }
      this.last = { x: p.pos.x, z: p.pos.z }
    }
    if (missions) for (const id of missions.passed) this.passed.add(id)
    if ((this.saveT += dt) > 10) this.save()
  }
  // busted or wasted (game.js's down)
  down (kind) {
    if (kind in this.s) this.s[kind]++
  }
  save () {
    this.saveT = 0
    remember('stats', JSON.stringify({ ...this.s, passed: [...this.passed] }))
  }
  // the tab drawn afresh (as it opens): mph, whether to show miles; cash
  // tokens: the hidden tokens' counter (tokens.js { n, total })
  render (mph, cash = 0, running = null, tokens = null) {
    const s = this.s,
      dist = m => (mph ? `${(m / 1609).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`),
      h = Math.floor(s.time / 3600),
      min = Math.floor((s.time % 3600) / 60)
    const rows = [
      ['Time in the city', h ? `${h} h ${min} min` : `${min} min`],
      ['Distance driven', dist(s.drive)],
      ['Distance on foot', dist(s.walk)],
      ['Cars stolen', s.stolen],
      ['Crimes', s.crimes],
      ['People hit', s.hit],
      ['Crashes', s.crashes],
      ['Most stars', '★'.repeat(s.stars) || '—'],
      ['Busted · wasted', `${s.busted} · ${s.wasted}`],
      ['Cash', `$${cash.toLocaleString('en-US')}`]
    ]
    if (tokens) rows.splice(rows.length - 1, 0, ['Hidden tokens', `${tokens.n} of ${tokens.total}`])
    const done = MISSIONS.filter(m => this.passed.has(m.id)).length
    const missions = MISSIONS.map(m => {
      const state = running === m.id ? 'running' : this.passed.has(m.id) ? 'passed' : ''
      const tag = state === 'running' ? 'In progress' : state === 'passed' ? 'Passed' : 'Not done'
      return `<li class="${state}"><i style="background:${m.color || '#ccc'}"></i>` +
        `<b>${m.title}</b><span>$${m.reward}</span><em>${tag}</em></li>`
    }).join('')
    this.box.innerHTML =
      `<section class="ss-missions"><h3>Missions <small>${done} of ${MISSIONS.length}</small></h3>` +
      `<ul>${missions}</ul><p class="ss-hint">Drive into a lettered blip's marker to start one</p></section>` +
      `<section class="ss-record"><h3>Record</h3><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></section>`
  }
}
