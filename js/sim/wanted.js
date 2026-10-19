// The wanted level, GTA's way: 0 to 5 stars. A crime ('crime' game events: { type, pos, severity })
// only counts if someone saw it: people on the pavement, drivers, or the police (witness.js looks,
// along the city's sight lines); the police seeing it themselves count double. What is reported adds
// heat, and the heat sets the stars (STAR_HEAT). While the police (or the helicopter) have the
// player in sight, the last known position follows them; a long chase in sight escalates a star.
// Out of sight, the stars flash and the police search a circle round where they last saw them
// (bigger the more stars); leave it and stay unseen for the cooldown and the stars clear (slowly
// inside the circle). Pure logic: no DOM.

// heat for 1 to 5 stars
export const STAR_HEAT = [0, 1, 3, 6, 10, 16]
// how much heat each crime is worth, before its own severity (an unknown type counts as 1)
export const CRIMES = {
  'ped-hit': 1,
  'ped-killed': 2,
  'car-stolen': 1,
  carjack: 1.5,
  'hit-police': 2.5,
  'traffic-crash': 0.6,
  'car-alarm': 0.8,
  'shots-fired': 3,
  assault: 1.2,
  debug: 1
}
export const POLICE_WITNESS = 2 // the police seeing it themselves
export const GRACE = 1.2 // s out of sight before the stars flash and the search begins
export const searchRadius = stars => 60 + 40 * stars // m
export const cooldownFor = stars => 6 + 3.5 * stars // s unseen, outside the circle, to clear
export const IN_CIRCLE = 0.25 // the cooldown's rate inside the circle
export const ESCALATE = 45 // s of a chase in sight that adds a star (up to ESCALATE_MAX)
export const ESCALATE_MAX = 4

export const starsFor = heat => {
  let s = 0
  for (let i = 1; i <= 5; i++) if (heat >= STAR_HEAT[i]) s = i
  return s
}

export class Wanted {
  constructor () {
    this.reset()
  }
  reset () {
    this.stars = 0
    this.heat = 0
    this.seen = false // the police have the player in sight just now
    this.searching = false // stars flashing: lost sight of them
    this.last = { x: 0, z: 0 } // last known position
    this.unseenT = 0
    this.evade = 0 // s of the cooldown gone by
    this.chaseT = 0 // s of the chase in sight at this level
    this.max = 0 // most stars since the last clear (missions read it)
    this.log = [] // the last few crimes reported: { type, heat, by }
    this.changed = false // the stars changed in the last update / report
  }
  get radius () {
    return searchRadius(this.stars)
  }
  get cooldown () {
    return cooldownFor(this.stars)
  }
  // A crime at crime.pos, seen by w ({ peds, cars, police } counts: witness.js); returns the heat
  // it added (0: nobody saw it)
  report (crime, w) {
    const base = CRIMES[crime.type] ?? 1
    const sev = crime.severity ?? 1
    const by = w.police > 0 ? 'police' : w.peds + w.cars > 0 ? 'public' : null
    if (!by) return 0
    const heat = base * sev * (by === 'police' ? POLICE_WITNESS : 1)
    this.heat += heat
    this.log.push({ type: crime.type, heat, by })
    if (this.log.length > 8) this.log.shift()
    const want = Math.min(5, starsFor(this.heat))
    if (want > this.stars) this.set(want, crime.pos)
    // seen by the police: they know where the player is now
    if (by === 'police' && crime.pos) this.spotted(crime.pos)
    else if (this.stars && crime.pos && !this.seen) {
      // reported by the public: the search starts where it happened
      this.last.x = crime.pos.x
      this.last.z = crime.pos.z
      this.evade = 0
    }
    return heat
  }
  // straight to a level (missions, ?wanted=, escalation); at = where it happened
  set (stars, at = null) {
    stars = Math.max(0, Math.min(5, Math.round(stars)))
    if (stars === this.stars) return
    const was = this.stars
    this.stars = stars
    this.changed = true
    if (!stars) return this.clear()
    this.heat = Math.max(this.heat, STAR_HEAT[stars])
    this.max = Math.max(this.max, stars)
    this.chaseT = 0
    this.evade = 0
    if (at && !was) {
      this.last.x = at.x
      this.last.z = at.z
      this.unseenT = 0
    }
  }
  clear () {
    const max = this.max
    this.stars = 0
    this.heat = 0
    this.seen = this.searching = false
    this.evade = this.chaseT = this.unseenT = 0
    this.changed = true
    this.cleared = max // (how many stars were lost: a mission's escape reads it)
    this.max = 0
  }
  spotted (pos) {
    this.seen = true
    this.last.x = pos.x
    this.last.z = pos.z
    this.unseenT = 0
    this.evade = 0
    this.searching = false
  }
  // Each step: pos the player's position now, seen whether any police unit or the helicopter has
  // them in sight (police.js)
  update (dt, pos, seen) {
    this.changed = false
    if (!this.stars) {
      this.seen = this.searching = false
      this.heat = Math.max(0, this.heat - dt * 0.05) // (unreported scraps fade)
      return
    }
    if (seen) {
      this.spotted(pos)
      this.chaseT += dt
      if (this.chaseT > ESCALATE && this.stars < ESCALATE_MAX) {
        this.set(this.stars + 1)
      }
      return
    }
    this.seen = false
    this.unseenT += dt
    this.searching = this.unseenT > GRACE
    if (!this.searching) return
    const inside = this.inside(pos)
    this.evade += dt * (inside ? IN_CIRCLE : 1)
    if (this.evade >= this.cooldown) this.set(0)
  }
  inside (pos) {
    return Math.hypot(pos.x - this.last.x, pos.z - this.last.z) < this.radius
  }
  // the cooldown's progress, 0 to 1 (the HUD)
  get progress () {
    return this.stars ? Math.min(1, this.evade / this.cooldown) : 0
  }
}
