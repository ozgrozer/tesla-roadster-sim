// Where the car is, bottom right as in GTA V: the street (and the cross street, at a junction) over
// the neighbourhood (areas.js), shown when it changes and fading out a few seconds later; the car's
// name when it first drives off, and the test site's name on arriving there.
import { $, put } from './dom.js'
import { whereIs } from '../sim/areas.js'

const SHOW_S = 4.5 // s a place stays up
const CAR_S = 3.2 // s the car's name stays up
const SETTLE_S = 0.4 // s a new place has to hold before it is said (not at every kerb)
const whole = name => name.replace(/ /g, ' ')

export class Place {
  constructor () {
    this.el = { box: $('place'), top: $('plTop'), big: $('plBig') }
    this.world = ''
    this.left = 0 // s the current words stay up
    this.carDue = false // the car's name, the first time it drives off
    this.key = '' // the place said last, and the one it may be about to say
    this.cand = ''
    this.candT = 0
    this.street = ''
    this.area = ''
    this.at = { area: '', street: '', cross: '' }
  }

  say (top, big, s, car = false) {
    put(this.el.top, 'text', top)
    put(this.el.big, 'text', big)
    put(this.el.box, '.car', car)
    this.left = s
  }

  // a new world: the test site's name now, the city's car name once it drives off
  arrive (world) {
    this.world = world
    this.key = this.cand = this.street = this.area = ''
    this.left = 0
    if (world === 'site') this.say('Test site', 'McGregor, Texas', SHOW_S)
    else this.carDue = true
  }

  update (dt, app) {
    if (app.world !== this.world) this.arrive(app.world)
    this.left -= dt
    put(this.el.box, '.on', this.left > 0)
    if (this.world !== 'city' || app.intro) return
    const sim = app.focus || app.sim // (the player on foot: onFoot.js)
    // (only the Roadster's: another car's name is said as it is got into, carHud.js)
    if (app.vehicle && app.vehicle.kind !== 'roadster') this.carDue = false
    if (this.carDue) {
      const c = app.lastCtl
      if (!app.auto && !(sim.groundSpeed() > 0.5 || c.throttle > 0)) return
      this.carDue = false
      this.say('Tesla', 'Roadster', CAR_S, true)
      return
    }
    // (the car's name has its moment before the street comes up)
    if (this.el.box.classList.contains('car') && this.left > 0) return
    const p = sim.mode === 'ground' ? sim.pos : sim.com
    const at = whereIs(p.x, p.z, this.at)
    let street = at.street,
      cross = at.cross
    // at a junction, the street the car is going along first
    if (cross) {
      const f = sim.fwd()
      if (Math.abs(f.z) > Math.abs(f.x)) [street, cross] = [cross, street]
    }
    const key = `${street}|${cross}|${at.area}`
    if (key !== this.cand) {
      this.cand = key
      this.candT = 0
      return
    }
    this.candT += dt
    if (key === this.key || this.candT < SETTLE_S) return
    // (out of a junction onto the street it was already on: no need to say it again)
    const again = !cross && street === this.street && at.area === this.area
    this.key = key
    this.street = street
    this.area = at.area
    // (each name kept whole, so a narrow screen wraps the line at the slash)
    const line = cross ? `${whole(street)} / ${whole(cross)}` : street
    if (again) {
      if (this.left > 0) put(this.el.top, 'text', line)
      return
    }
    this.say(line, at.area, SHOW_S)
  }
}
