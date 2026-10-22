// The player's fists on foot (sim/melee.js) and what comes of them: the keys (F or the left mouse
// button to punch, presses in time for the combo; Caps Lock between a walk and the jog), the blows
// landing on people (sim/brawl.js: staggered, knocked down, killed; the crimes it is), the punches
// of anyone fighting back landing on the player (a shove, health off: game.js 'player-hit'), and
// the sounds. onFoot.js makes one and runs it each step on foot.
import { Melee } from './sim/melee.js'
import { emitGame } from './sim/gameEvents.js'
import { player } from './sim/player.js'
import { panOf } from './audio/mix.js'
import { swingSound, punchSound } from './audio/fists.js'

const STILL = { x: 0, z: 0, mag: 0, run: false, walk: false, jump: false }

export class FootFight {
  constructor (foot) {
    this.foot = foot
    this.melee = new Melee()
    this.out = { ctl: null, hits: [], swung: null }
    this.landed = 0 // blows landed (the playtest reads it)
    this.taken = 0 // and taken
    this.last = null // what the last blow did ('stagger', 'down', 'dead')
  }
  // a drive key pressed on foot (main.js): Space jumps, F punches. True if it was taken
  press (code, first) {
    if (!first) return false
    if (code === 'Space') return (this.foot.jumpQ = true)
    if (code === 'KeyF') return this.punch()
    return false
  }
  // any other key on foot: Caps Lock toggles walking
  command (code) {
    if (code !== 'CapsLock' || !this.foot.onFoot()) return false
    const f = this.foot
    f.walkOn = !f.walkOn
    f.hud?.popup?.(f.walkOn ? 'Walking · <b>Caps Lock</b> to jog' : 'Jogging · <b>Shift</b> to sprint', 1400, 'hint')
    return true
  }
  punch () {
    if (player.mode !== 'foot' || (this.foot.action && this.foot.action.dir === 'in')) return false
    this.melee.press()
    return true
  }
  // One step on foot: ctl the move asked for; returns the move the feet make (held still while a
  // punch is thrown, but for the lunge at whoever it is aimed at)
  step (H, ctl) {
    const peds = this.foot.peds,
      sound = this.foot.sound
    const aim = ctl && ctl.mag > 0.3 ? Math.atan2(-ctl.z, ctl.x) : null
    const o = this.melee.step(H, player, peds.list, aim, this.out)
    if (o.swung) swingSound(sound, o.swung.knock)
    for (const h of o.hits) {
      const r = peds.punched?.(h.q, h)
      if (!r) continue
      this.landed++
      this.last = r
      punchSound(sound, h.move.knock || r !== 'stagger', panOf(h.q.x, h.q.z))
      emitGame('player-punch', { id: h.q.i, move: h.move.name, result: r, pos: { x: h.q.x, z: h.q.z } })
    }
    // the punches of anyone fighting back
    for (const h of peds.brawlHits || []) {
      if (player.down > 0 || player.mode !== 'foot') continue
      this.taken++
      player.vel.x += h.dx * 1.8
      player.vel.z += h.dz * 1.8
      punchSound(sound, false, 0)
      emitGame('player-hit', { by: 'ped', speed: h.hurt * 24, pos: { x: player.pos.x, z: player.pos.z } })
    }
    if (!this.melee.busy) return ctl
    return o.ctl ? { ...STILL, ...o.ctl } : STILL
  }
  reset () {
    this.melee.reset()
  }
}
