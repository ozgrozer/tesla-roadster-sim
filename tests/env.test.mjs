// Headless checks of the time of day and the weather (sim/env.js): the sun's path over Los Angeles
// in October, the weather coming in and going, the road soaking and drying, the lightning, the
// city's lights coming on, and the Roadster on a wet road.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sim } from '../js/sim/sim.js'
import { makeControls } from '../js/sim/constants.js'
import { ROADS, LANE_OFF } from '../js/sim/city.js'
import {
  ENV,
  sunAt,
  stepEnv,
  setHour,
  setWeather,
  envRandom,
  START_HOUR
} from '../js/sim/env.js'

const H = 1 / 120
const DEG = 180 / Math.PI
// (the compass bearing of a direction: 0 north, 90 east, 180 south, 270 west)
const bearing = d => (Math.atan2(d.x, -d.z) * DEG + 360) % 360
// a seeded random source, so the weather's choices are the same each run
function seeded (s) {
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}
// back to the city's opening: five o'clock, clear and dry, the clock and the weather standing still
function calm () {
  envRandom(seeded(7))
  ENV.rate = 0
  ENV.auto = false
  setWeather('clear', { now: true })
  setHour(START_HOUR)
}

test('the sun rises in the east-south-east about 7:05, stands 45 degrees up in the south at noon and sets about 18:15', () => {
  const d = {}
  const up = h => sunAt(h, d) > 0
  let rise = 6,
    set = 17
  while (!up(rise)) rise += 1 / 60
  while (up(set)) set += 1 / 60
  assert.ok(Math.abs(rise - 7.08) < 0.1, `sunrise at ${rise.toFixed(2)}`)
  assert.ok(Math.abs(set - 18.22) < 0.1, `sunset at ${set.toFixed(2)}`)
  sunAt(rise, d)
  assert.ok(bearing(d) > 95 && bearing(d) < 110, 'it rises east-south-east')
  sunAt(set, d)
  assert.ok(bearing(d) > 250 && bearing(d) < 265, 'and sets west-south-west')
  const noon = sunAt(12.65, d) * DEG
  assert.ok(
    Math.abs(noon - 45.4) < 1,
    `noon's sun ${noon.toFixed(1)} degrees up`
  )
  assert.ok(Math.abs(bearing(d) - 180) < 1, 'due south')
  // the city opens in the golden hour: the low sun to the west-south-west
  const open = sunAt(START_HOUR, d) * DEG
  assert.ok(open > 10 && open < 20, `the opening sun ${open.toFixed(1)} up`)
})

test('the clock runs a minute every two seconds and goes round the day', () => {
  calm()
  ENV.rate = 30
  setHour(23.9)
  const days = ENV.days
  for (let t = 0; t < 30; t += H) stepEnv(H)
  assert.ok(Math.abs(ENV.hour - (23.9 + 0.25 - 24)) < 0.01, `${ENV.hour}`)
  assert.equal(ENV.days, days + 1, 'a new day')
  calm()
})

test('the lights: dark at night, the street lights on through dusk, a storm gloomy by day', () => {
  calm()
  setHour(13)
  assert.equal(ENV.dark, 0, 'midday is light')
  assert.equal(ENV.headlights, 0, 'and nobody drives with their lights on')
  setHour(23)
  assert.equal(ENV.dark, 1, 'midnight is dark')
  assert.equal(ENV.night, 1)
  assert.equal(ENV.headlights, 1)
  setHour(18.25)
  assert.ok(
    ENV.dark > 0.3 && ENV.night < 0.5,
    'at sunset the lights are coming on'
  )
  setHour(13)
  setWeather('storm', { now: true })
  assert.ok(ENV.dark > 0.5, 'a storm darkens the day enough for the lights')
  assert.equal(ENV.headlights, 1, 'and drivers put theirs on')
  assert.ok(ENV.night === 0, 'but it is not night')
  calm()
})

test('rain comes in over a minute or so: the cloud first, the rain after it, the road soaking, the puddles last', () => {
  calm()
  setWeather('rain')
  let t = 0
  const at = {}
  let thin = 0
  for (; t < 300; t += H) {
    stepEnv(H)
    if (at.rain === undefined && ENV.rain > 0.3) at.rain = t
    if (at.wet === undefined && ENV.wet > 0.6) at.wet = t
    if (at.pool === undefined && ENV.pool > 0.4) at.pool = t
    if (ENV.rain > 0.3 && ENV.clouds < 0.65) thin++
  }
  assert.equal(thin, 0, "it doesn't rain hard until the sky has clouded over")
  assert.ok(at.rain < at.wet, 'then the road soaks')
  assert.ok(at.wet < at.pool, 'and the puddles fill last')
  assert.ok(
    at.rain > 15 && at.rain < 120,
    `rain heavy at ${at.rain.toFixed(0)} s`
  )
  assert.ok(at.pool < 240, `puddles by ${at.pool.toFixed(0)} s`)
  // and it dries once it stops, slowly
  setWeather('clear')
  for (t = 0; t < 60; t += H) stepEnv(H)
  assert.ok(ENV.rain < 0.05, 'the rain stops')
  assert.ok(ENV.wet > 0.6, 'a minute later the road is still wet')
  for (t = 0; t < 600; t += H) stepEnv(H)
  assert.ok(ENV.wet < 0.1, 'ten minutes of sun dry it')
  calm()
})

test('lightning strikes only in a storm, each with a flash and a distance for its thunder', () => {
  calm()
  setWeather('rain', { now: true })
  for (let t = 0; t < 120; t += H) stepEnv(H)
  assert.equal(ENV.strikes, 0, 'no lightning in plain rain')
  setWeather('storm', { now: true })
  let flashes = 0,
    was = 0
  for (let t = 0; t < 120; t += H) {
    stepEnv(H)
    if (ENV.flash > 0.1 && was <= 0.1) flashes++
    was = ENV.flash
  }
  assert.ok(ENV.strikes >= 3, `${ENV.strikes} strikes in two minutes`)
  assert.ok(flashes >= ENV.strikes, 'each lit the sky')
  assert.ok(ENV.strikeDist >= 600 && ENV.strikeDist < 6000, 'a few km off')
  calm()
})

test('the weather moves on by itself, mostly clear, and never rains out of a clear sky', () => {
  calm()
  ENV.auto = true
  ENV.rate = 3600 // (an hour a second)
  const seen = new Set()
  let rainyClear = 0,
    clearHours = 0,
    hours = 0
  for (let t = 0; t < 24 * 20; t += 0.05) {
    stepEnv(0.05)
    seen.add(ENV.weather)
    if (ENV.rain > 0.3 && ENV.clouds < 0.5) rainyClear++
    if (ENV.weather === 'clear') clearHours += 0.05
    hours += 0.05
  }
  assert.ok(seen.size >= 4, `it went through ${[...seen].join(', ')}`)
  assert.equal(rainyClear, 0, 'no rain from a thin sky')
  assert.ok(
    clearHours / hours > 0.3,
    'Los Angeles is clear a good part of the time'
  )
  calm()
})

test('on a wet road the Roadster stops longer, as a car does, but still stops hard', () => {
  calm()
  const stop = (wet, ebrake) => {
    ENV.wet = wet
    const sim = new Sim()
    sim.reset('city', { x: ROADS[0] + 40, z: ROADS[6] + LANE_OFF[1], yaw: 0 })
    sim.vel.set(100 / 3.6, 0, 0)
    sim.speed = 100 / 3.6
    const c = makeControls()
    c.fan = false // (as in the city: the suction fan is for the wall)
    if (ebrake) c.ebrake = true
    else c.brake = 1
    const x0 = sim.pos.x
    for (let t = 0; t < 8 && sim.groundSpeed() > 0.3; t += H) {
      sim.step(H, c)
      sim.events.length = 0
    }
    return sim.pos.x - x0
  }
  const dry = stop(0, false),
    wet = stop(1, false),
    eDry = stop(0, true),
    eWet = stop(1, true)
  assert.ok(
    wet > dry * 1.12 && wet < dry * 1.45,
    `brakes: ${dry.toFixed(1)} m dry, ${wet.toFixed(1)} m wet`
  )
  assert.ok(
    eWet > eDry * 1.12 && eWet < eDry * 1.45,
    `e-brake: ${eDry.toFixed(1)} m dry, ${eWet.toFixed(1)} m wet`
  )
  assert.ok(
    eWet < 45,
    'the e-brake still stops it from 100 in under 45 m in the wet'
  )
  ENV.wet = 0
  calm()
})
