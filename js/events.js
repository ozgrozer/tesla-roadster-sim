// What the sim reports (scores, landings, drifts, near misses, knocks, kerbs, honks, crashes),
// turned into GTA-style stunt titles and hints (hud.js), sounds, camera shake, a gamepad's rumble
// and particles.
import { HORNS, AIR_HORN } from './audio/shots.js'
import { BROKE } from './sim/carDamage.js'
import { burst, knockFx, sparkBurst, debrisBurst } from './render/effects.js'
import { hearing, panOf, dullness, placeOf } from './audio/mix.js'

const CONTACT = { x: 0, y: 0, z: 0 }
function contactAt (x, y, z) {
  CONTACT.x = x
  CONTACT.y = y
  CONTACT.z = z
  return CONTACT
}
const STILL = { x: 0, z: 0 }
// how much of what a knock throws off is glass, by what it broke (carDamage.js BROKE's bits): a
// pane's worth bursting, a crazed one's crumbs, a lamp's lens, or none
const glassOf = broke =>
  broke & BROKE.shatter
    ? 0.6
    : broke & BROKE.craze
    ? 0.4
    : broke & BROKE.lamp
    ? 0.25
    : 0
const GLASSY = BROKE.lamp | BROKE.craze | BROKE.shatter

// a trick from the sim: a donut (the sim counts them: '3× Donut'), or a stunt bonus (the wall, a
// wall catch)
function trick (e) {
  const d = /^(?:(\d+)× )?Donut$/.exec(e.text)
  if (d)
    return { key: 'donut', title: 'Donut', n: Number(d[1] || 1), pts: e.pts }
  return { key: 'trick', title: 'Stunt bonus', sub: e.text, pts: e.pts }
}
// a landing: the more tricks on the way down, the bigger the title
const LANDING = ['Clean landing', 'Stunt bonus', 'Double stunt bonus']
function landing (e) {
  const n = e.tricks.length
  return {
    title: LANDING[n] || 'Insane stunt bonus',
    sub: [
      ...e.tricks,
      `${e.airtime.toFixed(1)} s air`,
      `${e.g.toFixed(1)} G`
    ].join(' · '),
    pts: e.pts
  }
}

export function handleEvents (g) {
  const { sim, app, hud, sound, rig, cityView, ap, clock, pad } = g
  let dots = false
  for (const e of sim.events) {
    if (e.type === 'z60') {
      hud.notify({
        title: '0–60 mph',
        big: `${e.t.toFixed(2)} s`,
        tone: 'blue'
      })
      sound.chime()
    } else if (e.type === 'trick') {
      app.score += e.pts
      hud.notify(trick(e))
      sound.chime()
    } else if (e.type === 'track') {
      // the handbrake at speed: Track Mode, the first time it comes on, says what it does
      if (!app.trackHint) {
        app.trackHint = true
        hud.popup(
          'Track Mode · <b>W</b> holds the drift · steer into it to go deeper · ' +
            'hold the other way to link it · lift off to straighten',
          4200,
          'hint'
        )
      }
    } else if (e.type === 'drift') {
      // (linked drifts, one into the next the other way, score as one: DRIFT ×3)
      app.score += e.pts
      const deg = Math.round(e.angle * 57.3)
      hud.notify({
        key: 'drift',
        title: 'Drift',
        n: (e.links || 0) + 1,
        sub: `${e.links ? 'Linked · ' : ''}${e.t.toFixed(1)} s · ${deg}°`,
        pts: e.pts
      })
      sound.chime()
    } else if (e.type === 'nearMiss') {
      // (one after another, they count on: NEAR MISS ×3, their points added up)
      app.score += e.pts
      hud.notify({
        key: 'nearMiss',
        chain: true,
        title: 'Near miss',
        sub: e.oncoming ? 'Oncoming · double points' : '',
        pts: e.pts
      })
      sound.chime()
    } else if (e.type === 'landing') {
      app.score += e.pts
      hud.notify(landing(e))
      sound.chime()
    } else if (e.type === 'touchdown') {
      burst(
        sim.pos.x,
        sim.pos.z,
        90 + Math.min(120, Math.abs(e.vy) * 20),
        7 + Math.abs(e.vy),
        sim.pos.y
      )
      rig.shake(Math.min(0.6, 0.05 + Math.abs(e.vy) * 0.04))
      sound.thump(e.g)
      pad?.rumble(Math.min(1, e.g / 4), 0.6, 240)
      if (app.auto) ap.cap[2] = `Touchdown at ${e.g.toFixed(1)} G`
    } else if (e.type === 'bump') {
      // knocks against cars, posts and walls in the city (a scrape fires every step: it keeps the
      // scrape's loop going, and the knocks are throttled); what broke, on the car hit (e.broke)
      // or on the Roadster (e.mine: damage.js), heard and seen as it went
      sound.contact(e.what, sim.vel.length())
      const broke = (e.broke || 0) | (e.mine || 0)
      if (e.impact > 1.2 && (clock - app.lastBump > 0.15 || broke & GLASSY)) {
        app.lastBump = clock
        // (from the side of the car it was hit on, where the sim says)
        const at = sim.mode === 'ground' ? sim.pos : sim.com
        const side =
          e.px === undefined ? 0 : panOf(e.px, e.pz) - panOf(at.x, at.z)
        sound.bump(e.impact, e.what, null, side, broke)
        rig.shake(Math.min(0.3, e.impact * 0.025))
        pad?.rumble(e.impact / 12, e.impact / 8, 160)
        // (the sparks fly from where it was hit, when the sim says where, and off a car or a wall
        // hard enough, bits of bumper, and of glass if any broke)
        const p = e.px === undefined ? at : contactAt(e.px, at.y + 0.3, e.pz)
        if (e.impact > 6) sparkBurst(p, Math.min(60, e.impact * 4), sim.floor)
        if ((e.impact > 7.5 && e.what !== 'post') || broke & GLASSY)
          debrisBurst(p, e.impact, sim.vel, sim.floor, glassOf(broke))
      }
    } else if (e.type === 'knock') {
      // a street light, signal or tree snapped off, by the Roadster or a car it sent sliding
      cityView.knock(e)
      knockFx(e)
      const mine = e.by === 'roadster'
      sound.snap(
        e.kind,
        e.impact * (mine ? 1 : hearing(e.x, e.z)),
        panOf(e.x, e.z),
        !mine
      )
      if (mine) {
        rig.shake(Math.min(0.35, 0.06 + e.impact * 0.012))
        pad?.rumble(0.5, 0.6, 150)
      }
    } else if (e.type === 'clash') {
      // two cars in traffic colliding (one knocked loose into another), or one sliding into a wall
      // or a post, heard where it happened, and seen there if it's near: sparks, and bits of
      // bumper and of whatever glass broke
      sound.clashed = true
      const k = hearing(e.x, e.z)
      if (k > 0.04)
        sound.bump(e.impact, e.what || 'car', placeOf(e.x, e.z), 0, e.broke)
      if (k > 0.25 && e.impact > 5) {
        const p = contactAt(e.x, 0.55, e.z)
        sparkBurst(p, Math.min(40, e.impact * 3))
        debrisBurst(p, e.impact, STILL, 0, glassOf(e.broke))
      }
    } else if (e.type === 'kerb') {
      // up onto the kerb or down off it (and off the promenade onto the sand)
      sound.kerb(e.v, e.up)
      rig.shake(Math.min(0.1, 0.015 + e.v * 0.003))
      pad?.rumble(0.2 + e.v * 0.01, 0.35, 90)
    } else if (e.type === 'manhole') {
      sound.clunk(e.v)
      pad?.rumble(0.05, 0.3, 50)
    } else if (e.type === 'dot') {
      // a wheel onto Botts' dots: its knock kept to the moment it struck (how long before the
      // frame's last step, in real time), and the pad buzzing while they come
      sound.dot(e.v, e.left, (sim.time - e.t) / Math.max(0.05, app.timeScale))
      dots = true
    } else if (e.type === 'righted') {
      // rolled back onto its wheels after a crash
      burst(sim.pos.x, sim.pos.z, 60, 5, sim.pos.y)
      rig.shake(0.15)
      sound.thump(1.4)
    } else if (e.type === 'honk') {
      // a driver in traffic leaning on the horn
      const k = hearing(e.x, e.z)
      if (k > 0.03)
        sound.honk(
          e.big ? AIR_HORN : HORNS[Math.floor(e.horn * HORNS.length)],
          0.32 * k,
          panOf(e.x, e.z),
          e.long,
          dullness(e.x, e.z)
        )
    } else if (e.type === 'crash') {
      sparkBurst(sim.com, 120, sim.floor)
      debrisBurst(sim.com, 14, sim.vel, sim.floor)
      burst(sim.com.x, sim.com.z, 80, 8, sim.floor)
      rig.shake(0.5)
      app.restHint = false
      sound.crash()
      pad?.rumble(1, 1, 500)
      hud.notify({ title: 'Wrecked', sub: e.reason, tone: 'red', ms: 2600 })
    }
  }
  if (dots) pad?.feel(0.03, 0.28, 40) // (not over a knock's rumble)
  sim.events.length = 0
}
