// The time of day and the weather in the city: one object, ENV, that everything reads. The sim reads
// how wet the road is (its grip), the drivers and the people how dark it is and how hard it rains,
// the renderer the sun and the moon, the sky, the light and the rain, the sound the rain and the
// thunder, the HUD the clock. The clock runs as GTA V's does, a minute every two seconds (a day in
// 48 minutes), from late afternoon; the sun crosses the sky as it does over Los Angeles in
// mid-October, rising in the east-south-east at about 7:05 and setting in the west-south-west at
// about 18:15, and a full moon rises opposite it. The weather moves from one state to the next on
// its own, as Los Angeles' does: mostly clear, now and then cloudy, overcast or the marine layer's
// fog, sometimes rain, rarely a storm; the road soaks as it rains and dries slowly after. Pure data
// and arithmetic: no DOM, no three.js, so the tests can set it and step it (they leave it dry).
import { clamp, DEG } from './constants.js'

// Each weather: its cloud cover, how hard it rains, how thick the fog is, the wind, and how often
// lightning strikes (0 to 1 each); how many game hours it lasts (at least, at most); and what
// tends to follow it (weights)
export const WEATHERS = {
  clear: {
    name: 'Clear',
    clouds: 0.06,
    rain: 0,
    fog: 0,
    wind: 0.18,
    storm: 0,
    hours: [6, 14],
    next: { clear: 5, cloudy: 3, fog: 1 }
  },
  cloudy: {
    name: 'Cloudy',
    clouds: 0.5,
    rain: 0,
    fog: 0,
    wind: 0.3,
    storm: 0,
    hours: [3, 8],
    next: { clear: 4, cloudy: 1, overcast: 3, fog: 1 }
  },
  overcast: {
    name: 'Overcast',
    clouds: 0.92,
    rain: 0,
    fog: 0.12,
    wind: 0.35,
    storm: 0,
    hours: [2, 6],
    next: { cloudy: 3, rain: 4, overcast: 1, storm: 1 }
  },
  rain: {
    name: 'Rain',
    clouds: 1,
    rain: 0.6,
    fog: 0.22,
    wind: 0.5,
    storm: 0,
    hours: [2, 5],
    next: { overcast: 4, cloudy: 2, rain: 1, storm: 2 }
  },
  storm: {
    name: 'Thunderstorm',
    clouds: 1,
    rain: 1,
    fog: 0.3,
    wind: 0.85,
    storm: 1,
    hours: [1, 3],
    next: { rain: 3, overcast: 2 }
  },
  fog: {
    name: 'Fog',
    clouds: 0.55,
    rain: 0,
    fog: 1,
    wind: 0.05,
    storm: 0,
    hours: [2, 5],
    next: { clear: 3, cloudy: 2 }
  }
}
export const WEATHER_NAMES = Object.keys(WEATHERS)

// Los Angeles in mid-October: its latitude, the sun's declination, and the clock time of solar
// noon (Pacific Daylight Time: LA lies 13° west of the zone's meridian, and the sun runs about a
// quarter of an hour ahead of the clock's mean sun in October)
const LAT = 34.05 * DEG,
  DECL = -10.6 * DEG,
  NOON = 12.65
export const DAY_RATE = 30 // game seconds a real second: a minute every two seconds, as GTA V's
export const START_HOUR = 17 // late afternoon: the low gold sun the city opens in

// the weather's eased values move toward their targets with these time constants (real s); the
// road soaks at SOAK a second in full rain and dries at DRY a second in full sun (a third of that
// at night)
const EASE = { clouds: 40, rain: 14, fog: 35, wind: 20, storm: 10 }
const SOAK = 1 / 45,
  DRY = 1 / 220

export const ENV = {
  hour: START_HOUR, // the clock, 0 to 24
  days: 0, // whole days run
  rate: DAY_RATE, // game seconds per real second (0: the clock stands still)
  // the light: unit vectors towards the sun and the moon (+x east, +y up, +z south); how high
  // the sun is (radians); its light on the city (0 to 1, gone once it is down), how night it is
  // (0 by day, 1 once the twilight has gone), and how dark it is for the lights (the street
  // lights, the windows, the signs: dusk, night, or a storm's gloom by day)
  sun: { x: 0, y: 0, z: 0 },
  moon: { x: 0, y: 0, z: 0 },
  sunAlt: 0,
  sunUp: 1,
  night: 0,
  dark: 0,
  // whether drivers have their lights on (0 to 1): at dusk, in the dark, the rain or the fog
  headlights: 0,
  // the weather: the state it is in (or heading for), and its eased values, each 0 to 1
  weather: 'clear',
  auto: true, // moving on to the next weather on its own
  left: 8, // game hours before it does
  clouds: WEATHERS.clear.clouds,
  rain: 0,
  fog: 0,
  wind: WEATHERS.clear.wind,
  windDir: 0.6, // radians: the way the wind blows towards (atan2 of z over x), wandering slowly
  storm: 0,
  wet: 0, // how wet the ground is, behind the rain: it soaks in and dries out
  pool: 0, // how full the puddles are (they fill once the road is wet through)
  // lightning: how bright its flash is this moment, how many strikes there have been, and the
  // last one's distance (m) and bearing (radians, as windDir), for the thunder
  flash: 0,
  strikes: 0,
  strikeDist: 0,
  strikeDir: 0,
  // (a quick change, as when the weather is chosen: the eases run this many times as fast)
  hurry: 1
}
let target = WEATHERS.clear
let rnd = Math.random
let nextStrike = 8,
  flashT = -1,
  flashes = null

// the sun at clock hour h, as a unit vector into out; returns its altitude (radians)
export function sunAt (h, out = {}) {
  const H = (h - NOON) * 15 * DEG
  const sa =
    Math.sin(LAT) * Math.sin(DECL) +
    Math.cos(LAT) * Math.cos(DECL) * Math.cos(H)
  const alt = Math.asin(clamp(sa, -1, 1))
  // (the azimuth from the south, westward; from the north it is half a turn more)
  const az =
    Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(LAT) - Math.tan(DECL) * Math.cos(LAT)
    ) + Math.PI
  const c = Math.cos(alt)
  out.x = c * Math.sin(az)
  out.y = Math.sin(alt)
  out.z = -c * Math.cos(az)
  return alt
}

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// the light that follows from the clock and the weather (run after either changes)
function light () {
  const e = ENV
  e.sunAlt = sunAt(e.hour, e.sun)
  e.moon.x = -e.sun.x
  e.moon.y = -e.sun.y
  e.moon.z = -e.sun.z
  const s = e.sun.y
  // the sun's own light: on the city from just over the horizon (sin 0.12: 7°), gone under it
  e.sunUp = smooth(-0.02, 0.12, s)
  // night: from sunset (sin 0) to the end of civil twilight (sin -0.1: 6° under)
  e.night = 1 - smooth(-0.11, 0.0, s)
  // the gloom of a heavy sky by day: the street lights come on in a storm
  const gloom = 0.45 * e.rain + 0.25 * e.storm + 0.15 * smooth(0.6, 1, e.clouds)
  e.dark = clamp(Math.max(1 - smooth(-0.06, 0.07, s), gloom), 0, 1)
  e.headlights = clamp(Math.max(1.6 * e.dark, 2.5 * e.rain, 1.4 * e.fog), 0, 1)
}

// how the rain and the cloud and the clock go, step by step (real seconds dt)
export function stepEnv (dt) {
  const e = ENV
  if (!(dt > 0)) return
  const gh = (dt * e.rate) / 3600 // game hours this step
  e.hour += gh
  while (e.hour >= 24) {
    e.hour -= 24
    e.days++
  }
  // the weather moves on once its time is up
  if (e.auto) {
    e.left -= gh
    if (e.left <= 0) setWeather(pickNext(e.weather))
  }
  // (each value goes its share of the way to its target this step)
  for (const name of ['clouds', 'rain', 'fog', 'wind', 'storm'])
    e[name] +=
      (target[name] - e[name]) * (1 - Math.exp((-dt * e.hurry) / EASE[name]))
  // a little rain doesn't fall from a thin sky
  e.rain = Math.min(e.rain, smooth(0.6, 0.95, e.clouds) + 0.01)
  if (e.hurry > 1) e.hurry = Math.max(1, e.hurry - dt * 0.4)
  // the wind wanders round, slowly
  e.windDir += (rnd() - 0.5) * dt * 0.05
  // the road soaks in the rain and dries after it, faster in the sun
  const dry = DRY * (0.35 + 0.65 * e.sunUp) * (1 - 0.6 * e.clouds)
  if (e.rain > 0.02)
    e.wet = Math.min(1, e.wet + dt * e.hurry * SOAK * (0.3 + e.rain))
  else e.wet = Math.max(0, e.wet - dt * e.hurry * dry)
  e.pool +=
    (smooth(0.45, 1, e.wet) - e.pool) * (1 - Math.exp((-dt * e.hurry) / 25))
  lightning(dt)
  light()
}

// Lightning in a storm: a strike every 6 to 25 s at full storm, its flash a quick flicker of two
// or three pulses, a few kilometres off in any direction (the thunder follows it: audio/rain.js).
function lightning (dt) {
  const e = ENV
  if (flashes) {
    flashT += dt
    let f = 0
    for (const [at, len, k] of flashes)
      if (flashT >= at && flashT < at + len)
        f = Math.max(f, k * (1 - (flashT - at) / len))
    e.flash = f
    if (flashT > 0.9) flashes = null
  } else e.flash = 0
  if (e.storm < 0.3) return
  nextStrike -= dt * e.storm
  if (nextStrike > 0) return
  nextStrike = 6 + rnd() * 19
  e.strikes++
  e.strikeDist = 600 + rnd() * rnd() * 5000
  e.strikeDir = rnd() * Math.PI * 2
  const near = clamp(1 - e.strikeDist / 5000, 0.2, 1)
  flashT = 0
  flashes = [[0, 0.07, near]]
  const n = 1 + Math.floor(rnd() * 3)
  let t = 0.09
  for (let i = 0; i < n; i++) {
    flashes.push([t, 0.06 + rnd() * 0.12, near * (0.5 + rnd() * 0.5)])
    t += 0.08 + rnd() * 0.16
  }
}

function pickNext (from) {
  const w = WEATHERS[from]?.next || { clear: 1 }
  let sum = 0
  for (const v of Object.values(w)) sum += v
  let r = rnd() * sum
  for (const [name, v] of Object.entries(w)) if ((r -= v) <= 0) return name
  return 'clear'
}

// Turn to a weather (one of WEATHERS): over a minute or so, or at once (now) as at a reset or in a
// test; quick, as when it is chosen, runs the change six times as fast (easing back to its own
// pace over the next ten seconds or so), so chosen rain is falling in a few seconds.
export function setWeather (name, { now = false, quick = false } = {}) {
  const e = ENV,
    w = WEATHERS[name]
  if (!w) return
  target = w
  e.weather = name
  const [lo, hi] = w.hours
  e.left = lo + rnd() * (hi - lo)
  if (quick) e.hurry = 6
  if (now) {
    for (const k of ['clouds', 'rain', 'fog', 'wind', 'storm']) e[k] = w[k]
    e.wet = w.rain > 0 ? 0.6 + 0.4 * w.rain : 0
    e.pool = w.rain > 0 ? smooth(0.45, 1, e.wet) : 0
  }
  light()
}

// The road's grip in the weather, one getter for every driver: 1 dry, down to 1 - WET_GRIP soaked
// (the road's wetness, or the rain's share before it has soaked in). The Roadster's own surface
// grip (street.js) and the police's (game.js) already take the same 30% off in the wet; the phys
// stream's roadGrip.js is this, times its own hook.
export const WET_GRIP = 0.3
export function weatherGrip () {
  return 1 - WET_GRIP * clamp(Math.max(ENV.wet, 0.6 * ENV.rain), 0, 1)
}
// the weather in a word for the HUD and the sound: 'clear', 'cloudy', 'rain', 'storm' or 'fog' (as
// it is now, eased: overcast counts as cloudy, a shower as rain once it falls)
export function weatherKind () {
  const e = ENV
  if (e.storm > 0.5) return 'storm'
  if (e.rain > 0.2) return 'rain'
  if (e.fog > 0.5) return 'fog'
  return e.clouds > 0.35 ? 'cloudy' : 'clear'
}

// set the clock (hour, 0 to 24)
export function setHour (h) {
  ENV.hour = ((h % 24) + 24) % 24
  light()
}

// for the tests: a seeded random source (and back to Math.random with none)
export function envRandom (fn = Math.random) {
  rnd = fn
}

light()
