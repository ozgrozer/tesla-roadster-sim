// The HUD kept to whatever the player drives, or to them on foot (hud.js calls update after its
// own): the car's name bottom right as they get in (GTA's: the class small and gold over the name,
// 'Stolen' when it was), the speedometer's selector swapped for the gear (1 to 6, R, N) and its
// power meter for a rev counter that reddens at the red line and flashes at each shift in a car
// with an engine, the green bar under the radar the player's health (the Roadster's dents, another
// car's harm, or the knocks taken on foot: game.js footHealth), and the car's hints in their own
// slot of the help box, dropped once the player is out (no 'E to get out' lingering on foot).
//
//   new CarHud(hud, foot, game)  .entered(entry), .exited(), .update(dt, app)
//   (foot: onFoot.js; game: () => the Game, game.js, made after the HUD)
import { $, put } from './dom.js'
import { TITLE } from './prompt.js'

// the class over the name, for each traffic type
const CLASS = {
  sedan: 'Sedans',
  hatch: 'Compacts',
  taxi: 'Service',
  suv: 'SUVs',
  pickup: 'Off-road',
  van: 'Vans',
  bus: 'Service',
  police: 'Emergency',
  sports: 'Sports',
  ambulance: 'Emergency',
  fire: 'Emergency',
  truck: 'Commercial',
  lowrider: 'Muscle',
  limo: 'Sedans'
}
export const CAR_SLOT = 'car'

export class CarHud {
  constructor (hud, foot, game) {
    this.hud = hud
    this.foot = foot
    this.game = game
    // the gear, beside the unit in place of P R N D (shown in a car with an engine: body.ice)
    const side = $('spGear')?.parentElement
    this.gearEl = document.createElement('span')
    this.gearEl.className = 'sp-num'
    this.gearEl.setAttribute('aria-label', 'Gear')
    side?.appendChild(this.gearEl)
    this.powBox = $('spPow')?.parentElement
    this.gear = 0
    this.flash = 0
  }

  // in a car (a vehicles.js entry): its name bottom right a few seconds, as GTA says it
  entered (e) {
    const place = this.hud.place
    place.carDue = false
    if (e.kind === 'roadster') place.say('Tesla', 'Roadster', 3.2, true)
    else place.say(e.stolen ? `Stolen · ${CLASS[e.type] || ''}` : CLASS[e.type] || '', TITLE[e.type] || e.type, 3.2, true)
    if (e.kind !== 'roadster')
      this.hud.helpbox.push('<b>E</b> get out · <b>H</b> horn · <b>V</b> camera', 2600, CAR_SLOT)
  }
  // out of it: the car's hints still waiting are dropped
  exited () {
    const hb = this.hud.helpbox
    hb.queue = hb.queue.filter(h => h.slot !== CAR_SLOT)
    if (hb.cur?.slot === CAR_SLOT) hb.cur.left = 0
  }

  update (dt, app) {
    const game = this.game?.(),
      alt = this.foot?.alt,
      ice = !!alt?.active && !app.foot
    put(document.body, '.ice', ice)
    if (ice) this.engine(dt, alt.body)
    // health under the radar
    const cond = this.hud.el.cond
    let h = null
    if (app.foot) h = game?.footHealth ?? 1
    else if (alt?.active) h = 1 - Math.min(1, alt.body.dmg?.harm || 0)
    if (h !== null) {
      put(cond, 'transform', `scaleX(${Math.max(0, h).toFixed(3)})`)
      put(this.hud.el.condBox, '.low', h < 0.3)
    }
  }
  // the gear and the rev counter
  engine (dt, b) {
    const g = b.dead ? '–' : b.gear === -1 ? 'R' : Math.abs(b.u) < 0.3 && b.load === 0 ? 'N' : String(b.gear)
    if (b.gear > this.gear && this.gear > 0) this.flash = 0.25
    this.gear = b.gear
    this.flash -= dt
    put(this.gearEl, 'text', g)
    put($('spPow'), 'transform', `scaleX(${(b.rpmN || 0).toFixed(3)})`)
    put(this.powBox, '.red', (b.rpmN || 0) > 0.9)
    put(this.gearEl, '.shift', this.flash > 0)
  }
}
