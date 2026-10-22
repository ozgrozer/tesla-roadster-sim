// The menu's work each frame (menu.frame, from main.js's loop): the player's options applied where
// a frame is needed for it (the sound's levels once its context exists), a new player's hints
// (onboard.js) when the help box is free, the captions for the sounds that matter (captions.js,
// with subtitles on), the stats' tracking (stats.js), and busted or wasted counted.
import { ENV } from '../sim/env.js'
import { player } from '../sim/player.js'
import { ALARM } from '../audio/watch.js'
import { setVolumes } from '../audio/mix.js'
import { OPTS, loadOptions, onOption } from './options.js'
import { Onboard } from './onboard.js'
import { Captions } from './captions.js'
import { setReducedMotion } from '../render/motionPref.js'

const CAPTION_S = 2.6 // s a caption stays up

export class UxFrame {
  constructor ({ app, hud, sound }) {
    Object.assign(this, { app, hud, sound })
    this.onboard = new Onboard()
    this.captions = new Captions()
    this.stats = null // (the menu's: stats.js)
    this.ctx = null // the sound's context the levels were last set on
    this.downWas = null
    this.capT = 0
    const el = (this.capEl = document.createElement('div'))
    el.className = 'captions'
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
    onOption(k => {
      if (!k || k === 'master' || k === 'music' || k === 'sfx') setVolumes(sound, OPTS)
      if (k === 'px') app.onQuality?.(app.quality)
      if (k === 'subtitles' && !OPTS.subtitles) this.caption(null)
      if (k === 'motion') setReducedMotion(OPTS.motion === 'reduced') // (live: camera shake, render/motionPref.js)
    })
    loadOptions()
  }
  frame (dt, city, game) {
    const { sound, hud } = this
    // (the engine builds its context at the first key or click: the levels then)
    if (sound.ctx && sound.ctx !== this.ctx && setVolumes(sound, OPTS)) this.ctx = sound.ctx
    if (this.app.paused || !(dt > 0)) return
    const W = game?.wanted,
      stars = W?.stars || 0
    if (city) this.stats?.track(dt, player, stars, game?.missions)
    // busted, wasted: counted as they come
    const down = game?.down?.kind || null
    if (down && down !== this.downWas) this.stats?.down(down)
    this.downWas = down
    // a new player's hints, while the help box has nothing else to say
    const hb = hud.helpbox
    if (hb && (hb.cur || hb.queue.length)) this.onboard.hush()
    else {
      const other = player.mode === 'car' && player.vehicle && player.vehicle.kind !== 'roadster'
      const h = this.onboard.update(dt, {
        city,
        mode: player.mode,
        other: !!other,
        wanted: stars,
        rain: ENV.rain
      })
      if (h && !this.app.intro) hud.popup(h, 6500, 'hint')
    }
    // captions for the sounds that matter (only while the sound is on: otherwise nothing to caption)
    if ((this.capT -= dt) <= 0 && this.capEl.textContent) this.caption(null)
    if (!city || !OPTS.subtitles || !sound.enabled) return
    const c = this.captions.update(dt, {
      env: ENV,
      wanted: stars,
      units: game?.police?.units,
      at: player.pos,
      alarm: ALARM.on && ALARM.k > 0.2
    })
    if (c) this.caption(c)
  }
  caption (text) {
    this.capEl.textContent = text || ''
    this.capEl.classList.toggle('on', !!text)
    this.capT = text ? CAPTION_S : 0
  }
  // the STATS tab, drawn as it opens
  showStats (game, mph) {
    const M = game?.missions
    this.stats?.render(mph, M?.cash || 0, M?.state === 'running' ? M.active?.id : null)
  }
}
