// The engineering instruments, only when they matter (at the test site, in the air, on the wall or
// while the thrusters fire), tucked away over the speedometer: the car from above with each of its
// ten nozzles lit as it fires and the total thrust, the altitude, pitch, G load and air, and at the
// test site the suction fan and the 0-60 time.
import { CAR } from '../sim/constants.js'
import { $, put } from './dom.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HOLD_S = 2.5 // s they stay up once they no longer matter (a burst of boost, a hop)

export class Instruments {
  constructor (RS) {
    this.RS = RS
    this.el = {
      box: $('instruments'),
      dots: $('thrDots'),
      total: $('thrTotal'),
      alt: $('tAlt'),
      pitch: $('tPitch'),
      g: $('tG'),
      air: $('tAir'),
      suck: $('tSuck'),
      z60: $('t060')
    }
    this.dots = RS.nozzles.map(nz => this.makeDot(nz))
    this.hold = 0
    this.on = false
  }

  // a nozzle on the schematic, top-down with the nose at the top
  makeDot (nz) {
    let x = 60,
      y = 86
    if (nz.kind === 'main') {
      x = 60 + nz.local.z * 56
      y = 141
    } else if (nz.kind === 'lift') {
      x = nz.local.z < 0 ? 34 : 86
      y = nz.local.x > 0 ? 24 : 122
    } else x = nz.kind === 'sideL' ? 23 : 97
    const c = document.createElementNS(SVG_NS, 'circle')
    c.setAttribute('cx', x)
    c.setAttribute('cy', y)
    c.setAttribute('r', nz.kind.startsWith('side') ? 5 : 6.5)
    c.setAttribute('fill', '#bfe9ff')
    c.setAttribute('fill-opacity', '0')
    c.setAttribute('stroke', '#f0c24b')
    c.setAttribute('stroke-width', '1.6')
    this.el.dots.appendChild(c)
    return c
  }

  // every frame while they are up: the nozzles flicker with the thrust
  nozzles () {
    if (!this.on) return
    this.RS.nozzles.forEach((nz, i) =>
      put(this.dots[i], '@fill-opacity', nz.level.toFixed(2))
    )
  }

  update (dt, app) {
    const { sim } = app,
      el = this.el
    const firing = sim.thrMain + sim.thrLift + sim.thrSide > 0.02
    const matters =
      app.world === 'site' ||
      sim.mode === 'air' ||
      sim.mode === 'ramp' ||
      firing
    this.hold = matters ? HOLD_S : this.hold - dt
    this.on = this.hold > 0 && !app.intro
    put(el.box, '.on', this.on)
    if (!this.on) return
    put(el.pitch, 'text', `${Math.round(sim.pitchDeg())}°`)
    put(el.g, 'html', `${sim.gLoad.toFixed(2)}<small>G</small>`)
    const alt =
      sim.mode === 'air' || sim.mode === 'crash'
        ? Math.max(0, sim.com.y - CAR.comH)
        : sim.pos.y
    put(el.alt, 'html', `${alt.toFixed(1)}<small>m</small>`)
    put(el.air, 'html', `${Math.round(sim.air)}<small>kg</small>`)
    put(el.air, '.low', sim.air < 50)
    put(
      el.total,
      'text',
      `${Math.round(
        (sim.thrMain * CAR.mainThrust +
          sim.thrLift * CAR.liftThrust +
          sim.thrSide * CAR.sideThrust) /
          1000
      )} kN`
    )
    if (app.world !== 'site') return
    if (sim.suction > 0.05) {
      put(el.suck, 'text', `${(sim.suction * CAR.suctionG).toFixed(1)} G`)
      put(el.suck, '.on', true)
    } else {
      put(el.suck, 'text', !app.auto && app.fanMode === 'auto' ? 'AUTO' : 'OFF')
      put(el.suck, '.on', false)
    }
    if (sim.z60.last)
      put(el.z60, 'html', `${sim.z60.last.toFixed(2)}<small>s</small>`)
  }
}
