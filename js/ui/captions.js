// Subtitles for the sounds that matter, for players who can't hear them (options.js subtitles):
// thunder (a strike: ENV.strikes), the rain coming on, sirens closing in (a police unit within
// earshot while you are wanted) and a car alarm going off near you. Each says itself in a small line
// over the bottom of the screen, held a moment, and not again for a while. Pure: update returns the
// caption to show (or null); the DOM is the caller's.
const AGAIN = { thunder: 6, rain: 120, siren: 25, alarm: 20 } // s before the same one again
const NEAR = 120 // m: a siren heard

export class Captions {
  constructor () {
    this.strikes = 0
    this.last = {}
    this.t = 0
    this.wasRain = 0
  }
  // s: { env (ENV), wanted, units ([{ x, z }]), at ({ x, z }), alarm (bool) }
  update (dt, s) {
    this.t += dt
    const e = s.env
    let say = null
    if (e.strikes !== this.strikes) {
      const far = e.strikeDist > 2500
      this.strikes = e.strikes
      say = this.say('thunder', far ? '[distant thunder]' : '[thunder]')
    }
    if (e.rain > 0.15 && this.wasRain <= 0.15) say = this.say('rain', '[rain starts]') || say
    this.wasRain = e.rain
    if (s.wanted > 0 && s.units?.length && s.at) {
      let d = Infinity
      for (const u of s.units) d = Math.min(d, Math.hypot(u.x - s.at.x, u.z - s.at.z))
      if (d < NEAR) say = this.say('siren', d < 40 ? '[sirens close by]' : '[sirens approaching]') || say
    }
    if (s.alarm) say = this.say('alarm', '[car alarm]') || say
    return say
  }
  say (id, text) {
    if (this.t - (this.last[id] ?? -1e9) < AGAIN[id]) return null
    this.last[id] = this.t
    return text
  }
}
