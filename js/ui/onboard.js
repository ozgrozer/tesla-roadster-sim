// A new player's first steps: a short hint the first time they are on foot in the city, the first
// time they drive a car that isn't the Roadster, the first time they have stars, the first time
// they are in the rain, and once to say Esc pauses. Each is told once (remembered: prefs.js), only
// when nothing else has just been said, and with the keys as the player has bound them (keymap.js).
// Pure but for prefs: state(s) says what is going on, and update returns the hint to show (or null).
import { recall, remember } from './prefs.js'
import { BINDS, keyName } from './keymap.js'

const k = code => `<b>${keyName(BINDS[code] || code)}</b>`
// each hint: when it applies (s: the frame's state) and what it says
export const HINTS = [
  {
    id: 'foot',
    when: s => s.city && s.mode === 'foot' && s.t > 4,
    text: () =>
      `On foot · ${k('KeyW')}${k('KeyA')}${k('KeyS')}${k('KeyD')} jog · ${k('ShiftLeft')} sprint · ` +
      `${k('KeyF')} punch · ${k('Space')} jump · ${k('KeyE')} by a car gets in (or steals it)`
  },
  {
    id: 'car',
    when: s => s.city && s.mode === 'car' && s.other,
    text: () => `Driving · ${k('Space')} handbrake · ${k('KeyH')} horn · ${k('KeyE')} gets out · ` +
      'a waypoint on the map (Esc) sets the GPS'
  },
  {
    id: 'wanted',
    when: s => s.city && s.wanted > 0,
    text: () => 'Wanted · the police are after you · get out of the flashing circle on the radar ' +
      'and stay out of sight to lose them'
  },
  {
    id: 'rain',
    when: s => s.city && s.rain > 0.3,
    text: () => 'Rain · the road is slippery: brake earlier and steer gently'
  },
  {
    id: 'pause',
    when: s => s.city && s.t > 40,
    text: () => '<b>Esc</b> pauses: the map, settings, key bindings and stats'
  }
]
const GAP = 9 // s between one hint and the next

export class Onboard {
  constructor () {
    this.seen = new Set(recall('hintsSeen').split(',').filter(Boolean))
    this.t = 0
    this.quiet = 0 // s since anything was last said
  }
  // dt s; s: { city, mode, other (in a car not the Roadster), wanted, rain }. The hint to show now.
  update (dt, s) {
    this.t += dt
    this.quiet += dt
    if (this.quiet < GAP) return null
    s.t = this.t
    for (const h of HINTS) {
      if (this.seen.has(h.id) || !h.when(s)) continue
      this.seen.add(h.id)
      remember('hintsSeen', [...this.seen].join(','))
      this.quiet = 0
      return h.text()
    }
    return null
  }
  // something else was said (a mission's line, a hint of the game's): wait a while
  hush () {
    this.quiet = Math.min(this.quiet, GAP - 4)
  }
  reset () {
    this.seen.clear()
    remember('hintsSeen', '')
  }
}
