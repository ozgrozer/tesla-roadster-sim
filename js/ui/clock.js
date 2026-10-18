// The clock on the HUD, over the radar: the time of day, 24-hour, and a small icon for the weather
// (the sun, or the moon at night; a cloud with the sun or moon behind it; a cloud; rain; a storm;
// fog), from ENV (sim/env.js). It writes only when the minute or the icon changes. The pause menu
// shows the same time and icon in its header.
import { put } from './dom.js'
import { ENV, WEATHERS } from '../sim/env.js'

// 16 x 16 line drawings, stroked in the text's colour (hud.css: .wx)
const path = d => `<path d="${d}"/>`
const RAYS =
  'M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9' +
  'M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M3.2 12.8l1.3-1.3M11.5 4.5l1.3-1.3'
const MOON = 'M12.6 10.4A5.4 5.4 0 0 1 5.6 3.4a5.4 5.4 0 1 0 7 7z'
const CLOUD =
  'M4.6 12.6h7.3a2.8 2.8 0 0 0 .2-5.6 3.9 3.9 0 0 0-7.5.9 2.4 2.4 0 0 0 0 4.7z'
// (a cloud higher up, with rain or lightning under it)
const HIGH =
  'M4.2 10.4h7.6a2.6 2.6 0 0 0 .2-5.2 3.7 3.7 0 0 0-7.1.8 2.2 2.2 0 0 0-.7 4.4z'
// (the sun or the moon behind a cloud: a little of it, top left)
const PEEK_SUN =
  'M6.3 2.6v1.3M2.4 6.5h1.3M3.5 3.7l.9.9M9.1 3.7l-.9.9' +
  'M4.2 7.4a2.4 2.4 0 0 1 4.3-1.6'
const PEEK_MOON = 'M8.4 5.2A3.6 3.6 0 0 1 3.4 3a3.6 3.6 0 1 0 1.4 5.5'
export const ICONS = {
  sun: '<circle cx="8" cy="8" r="2.9"/>' + path(RAYS),
  moon: path(MOON),
  cloudSun: path(PEEK_SUN) + path(CLOUD),
  cloudMoon: path(PEEK_MOON) + path(CLOUD),
  cloud: path(CLOUD),
  rain: path(HIGH) + path('M5.5 12.4l-.8 2M8.3 12.4l-.8 2M11.1 12.4l-.8 2'),
  storm: path(HIGH) + path('M8.8 11.2l-1.9 2.4h2.2l-1.7 2.2'),
  fog: path('M2.5 5.5h11M1.5 8.5h13M3 11.5h10M5 14.5h6')
}

// which icon goes with the weather (by its name, or ENV's), by day or by night
export function weatherIcon (weather = ENV.weather, night = ENV.night > 0.5) {
  switch (weather) {
    case 'clear':
      return night ? 'moon' : 'sun'
    case 'cloudy':
      return night ? 'cloudMoon' : 'cloudSun'
    case 'overcast':
      return 'cloud'
    case 'rain':
    case 'storm':
    case 'fog':
      return weather
    default:
      return night ? 'moon' : 'sun'
  }
}

// the clock hour h (0 to 24) as HH:MM
export function hhmm (h) {
  const m = Math.floor((((h % 24) + 24) % 24) * 60)
  const pad = v => String(v).padStart(2, '0')
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

// the time and the icon in an element (its parts made here): the HUD's clock and the menu's
export class Clock {
  constructor (box) {
    this.box = box
    box.setAttribute('role', 'img')
    box.innerHTML = '<svg class="wx" viewBox="0 0 16 16"></svg><span></span>'
    this.icon = box.firstChild
    this.time = box.lastChild
  }
  update () {
    const t = hhmm(ENV.hour),
      w = WEATHERS[ENV.weather]?.name || ''
    put(this.time, 'text', t)
    put(this.icon, 'html', ICONS[weatherIcon()])
    put(this.box, '@aria-label', `${t}, ${w}`)
  }
}
