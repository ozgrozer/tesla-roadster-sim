// The interiors in the game: what onFoot.js asks of them through four calls (the step, the prompt,
// E, and the wallet handed over by game.js). By a door on foot the prompt offers "E Enter · Night
// Owl Mart"; E fades the screen to black, puts the player inside (the room's own world for the
// feet: sim/interiors/state.js), snaps the camera behind them and fades back; by the door inside,
// "E Exit" does the same the other way, back out onto the pavement by the same door, facing away
// from it. In a car stopped in the body shop's bay, "E Repair & respray · $150". Nothing else is
// touched: the traffic, the police and the missions go on above (the player is where the shop is,
// for all of them), and a reset or a respawn that puts the player elsewhere lets the room go.
import { player } from '../../sim/player.js'
import { emitGame } from '../../sim/gameEvents.js'
import { remember } from '../../ui/prefs.js'
import { MAT } from '../scene.js'
import {
  INTERIOR,
  inside,
  busy,
  offerAt,
  begin,
  stepTransition,
  swapIn,
  swapOut,
  clearInterior,
  strayed,
  roomWorld
} from '../../sim/interiors/state.js'
import { PRICE, canPay, nextColour, repaintKey } from '../../sim/interiors/modshop.js'
import { SITES } from '../../sim/interiors/sites.js'

export class InteriorGlue {
  constructor (foot) {
    this.foot = foot
    this.city = foot.world // (the feet's world out in the city, to go back to)
    this.current = null // what offerAt offered this frame
    this.wallet = null // { cash } (game.js's missions)
    this.damage = null // the Roadster's dents (render/damage.js)
    this.sprays = 0
  }
  // game.js: who pays, and the Roadster's dents to mend
  attach ({ wallet, damage }) {
    this.wallet = wallet
    this.damage = damage
  }
  // (for the console and the playtests: window.__roadster.foot.interiors)
  get state () {
    return INTERIOR
  }
  get sites () {
    return SITES
  }
  view () {
    return this.foot.cityView?.interiors || null
  }

  // ---------- the fixed step: true while the feet are held (the fade) ----------
  step (H) {
    if (strayed(player)) this.letGo()
    const ev = stepTransition(H)
    if (ev === 'swap') this.swap()
    this.fade()
    return busy()
  }
  swap () {
    const f = this.foot,
      s = INTERIOR.target,
      act = INTERIOR.act
    if (act === 'enter') {
      swapIn(s, player)
      f.world = roomWorld(s)
      this.view()?.show(s)
      this.snap()
      emitGame('interior-entered', { id: s.id, kind: s.kind, name: s.name, pos: { x: s.out.x, z: s.out.z } })
    } else if (act === 'exit') {
      const id = INTERIOR.site?.id
      swapOut(player)
      f.world = this.city
      this.view()?.show(null)
      this.snap()
      emitGame('interior-exited', { id, pos: { x: player.pos.x, z: player.pos.z } })
    } else if (act === 'service') this.service(s)
  }
  // the camera straight behind the player, where they now are (no glide through the floor)
  snap () {
    const f = this.foot,
      p = player.pos
    f.prev.x = p.x
    f.prev.y = p.y
    f.prev.z = p.z
    f.cam.init = false
    f.cam.blend = 1
    f.cam.pitch = 0.18
  }
  // out of the room at once, not by its door (a reset, a respawn, back in a car)
  letGo () {
    clearInterior()
    this.foot.world = this.city
    this.view()?.show(null)
    this.fade()
  }
  // the screen's black (the HUD's own fade, held to the transition's)
  fade () {
    const el = this.foot.hud?.el?.fade
    if (!el) return
    if (busy() || this.fading) {
      el.style.transition = 'none'
      el.style.opacity = String(INTERIOR.fade)
      this.fading = busy()
      if (!this.fading) el.style.transition = ''
    }
  }

  // ---------- the body shop ----------
  service (s) {
    const f = this.foot,
      w = this.wallet
    if (!canPay(w)) return
    w.cash -= PRICE
    remember('cash', String(w.cash))
    const c = nextColour()
    const e = player.vehicle
    if (f.inRoadster()) {
      this.damage?.repair()
      MAT.paint.color.setHex(c.hex)
    } else if (f.alt?.car) {
      const car = f.alt.car
      car.dmg = null
      car.paint = repaintKey(car.paint, this.sprays)
    }
    this.sprays++
    f.hud?.popup?.(`Repaired and resprayed · ${c.name} · <b>-$${PRICE}</b>`, 2600, 'hint')
    emitGame('car-resprayed', { site: s.id, vehicle: e?.id, colour: c.name, price: PRICE, wanted: player.wanted })
  }

  // ---------- the prompt (onFoot.js offer: o is the car's offer, changed in place) ----------
  offer (o) {
    const f = this.foot
    if (busy()) {
      this.current = null
      o.text = ''
      o.target = o.how = null
      return o
    }
    const speed = player.mode === 'car' ? f.driven()?.groundSpeed?.() || 0 : 0
    const c = (this.current = f.app?.intro || f.app?.auto ? null : offerAt(player, speed))
    if (inside()) {
      // (the cars in the street over the room are not in it)
      o.target = o.how = null
      o.text = c ? `<kbd>E</kbd> Exit · ${c.site.name}` : ''
      return o
    }
    if (!c || o.target) {
      this.current = null
      return o
    }
    if (c.act === 'service') {
      const short = !canPay(this.wallet)
      o.text = c.why
        ? `${c.site.name} · ${c.why}`
        : `<kbd>E</kbd> Repair & respray · $${PRICE}${short ? ' · not enough cash' : ''}`
    } else o.text = c.why ? `${c.site.name} · ${c.why}` : `<kbd>E</kbd> Enter · ${c.site.name}`
    return o
  }

  // ---------- E: true if it was for a door (or swallowed: inside, or mid-fade) ----------
  interact () {
    if (busy()) return true
    const c = this.current
    if (inside()) {
      if (c?.act === 'exit') begin(c)
      return true
    }
    if (!c) return false
    if (c.why) return c.act !== 'service' // (moving through the bay: E is the car's own)
    if (c.act === 'service') {
      if (!canPay(this.wallet)) {
        this.foot.hud?.popup?.(`A respray is <b>$${PRICE}</b>`, 2000, 'hint')
        return true
      }
      if (this.foot.alt?.car?.dmg?.wreck) {
        this.foot.hud?.popup?.('Too far gone to fix', 2000, 'hint')
        return true
      }
    }
    return begin(c)
  }
}
