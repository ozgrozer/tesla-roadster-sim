// The world's settings as the pause menu shows and changes them (settings.js): the time of day
// (ENV.hour), how fast the clock runs (ENV.rate: stopped, real time, GTA's minute every two
// seconds, or faster) and the weather (one of WEATHERS, or Auto: it moves on by itself), all in
// sim/env.js, and the graphics quality (app.quality: low, medium or high, for the renderer, which
// is told of a change through app.onQuality). The menu only calls these, so what is behind them can
// change; main.js may hand the menu its own. The clock's speed and the quality are remembered
// between visits (prefs.js) and put back as the game starts; the time of day and the weather start
// afresh each visit (five o'clock, the weather as it comes), as the city has always opened.
import { recall, remember } from './prefs.js'
import { ENV, setHour, setWeather } from '../sim/env.js'

export const RATES = [0, 1, 30, 120]
export const QUALITIES = ['low', 'medium', 'high']

export function worldSettings (app) {
  const rate = recall('timeRate')
  if (rate !== '' && RATES.includes(Number(rate))) ENV.rate = Number(rate)
  const quality = recall('quality', 'high')
  app.quality = QUALITIES.includes(quality) ? quality : 'high'
  return {
    hour: () => ENV.hour,
    setHour,
    rate: () => ENV.rate,
    setRate (r) {
      ENV.rate = r
      remember('timeRate', r)
    },
    weather: () => (ENV.auto ? 'auto' : ENV.weather),
    setWeather (name) {
      ENV.auto = name === 'auto'
      if (!ENV.auto) setWeather(name, { quick: true })
    },
    quality: () => app.quality,
    setQuality (q) {
      app.quality = q
      remember('quality', q)
      app.onQuality?.(q)
    }
  }
}
