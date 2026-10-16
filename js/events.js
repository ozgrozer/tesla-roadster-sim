// What the sim reports (scores, landings, drifts, near misses, knocks, kerbs, honks, crashes), turned
// into popups, sounds, camera shake, a gamepad's rumble and particles.
import { HORNS } from './audio/sound.js'
import { hearing, panOf } from './audio/mix.js'
import { burst, knockFx, sparkBurst } from './render/effects.js'

export function handleEvents (g) {
  const { sim, app, hud, sound, rig, cityView, ap, clock, pad } = g
  for (const e of sim.events) {
    if (e.type === 'z60') {
      hud.popup(`0–60 mph · <b>${e.t.toFixed(2)} s</b>`)
      sound.chime()
    } else if (e.type === 'trick') {
      app.score += e.pts
      hud.popup(`${e.text} <b>+${e.pts}</b>`)
      sound.chime()
    } else if (e.type === 'drift') {
      app.score += e.pts
      const deg = Math.round(e.angle * 57.3)
      hud.popup(`Drift ${e.t.toFixed(1)} s · ${deg}° <b>+${e.pts}</b>`)
      sound.chime()
    } else if (e.type === 'nearMiss') {
      app.score += e.pts
      hud.popup(
        `${e.oncoming ? 'Oncoming near miss' : 'Near miss'} <b>+${e.pts}</b>`,
        1300
      )
      sound.chime()
    } else if (e.type === 'landing') {
      app.score += e.pts
      hud.popup(
        `${e.tricks.length ? e.tricks.join(' + ') : 'Clean landing'} <b>+${
          e.pts
        }</b>`
      )
      hud.popup(`Airtime ${e.airtime.toFixed(1)} s · ${e.g.toFixed(1)} G`, 2000)
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
      // knocks against cars, posts and walls in the city (a scrape fires every step: throttle it)
      if (e.impact > 1.2 && clock - app.lastBump > 0.15) {
        app.lastBump = clock
        sound.bump(e.impact, e.what)
        rig.shake(Math.min(0.3, e.impact * 0.025))
        pad?.rumble(e.impact / 12, e.impact / 8, 160)
        if (e.impact > 6)
          sparkBurst(sim.pos, Math.min(60, e.impact * 4), sim.floor)
      }
    } else if (e.type === 'knock') {
      // a street light, signal or tree snapped off, by the Roadster or a car it sent sliding
      cityView.knock(e)
      knockFx(e)
      const mine = e.by === 'roadster'
      sound.snap(
        e.kind,
        e.impact * (mine ? 1 : hearing(e.x, e.z)),
        panOf(e.x, e.z)
      )
      if (mine) {
        rig.shake(Math.min(0.35, 0.06 + e.impact * 0.012))
        pad?.rumble(0.5, 0.6, 150)
      }
    } else if (e.type === 'kerb') {
      // up onto the kerb or down off it (and off the promenade onto the sand)
      sound.kerb(e.v, e.up)
      rig.shake(Math.min(0.1, 0.015 + e.v * 0.003))
      pad?.rumble(0.2 + e.v * 0.01, 0.35, 90)
    } else if (e.type === 'manhole') {
      sound.clunk(e.v)
      pad?.rumble(0.05, 0.3, 50)
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
          e.big ? [262, 330] : HORNS[Math.floor(e.horn * HORNS.length)],
          0.32 * k,
          panOf(e.x, e.z),
          e.long
        )
    } else if (e.type === 'crash') {
      sparkBurst(sim.com, 120, sim.floor)
      burst(sim.com.x, sim.com.z, 80, 8, sim.floor)
      rig.shake(0.5)
      app.restHint = false
      sound.crash()
      pad?.rumble(1, 1, 500)
      hud.popup(`Crash · ${e.reason}`, 2600)
    }
  }
  sim.events.length = 0
}
