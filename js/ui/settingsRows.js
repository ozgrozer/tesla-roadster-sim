// The SETTINGS tab's rows, under their headings: { id, name, hint, opts: [[value, label], ...] }, a
// slider, or (opt) one of the player's options (options.js), whose values are its CHOICES.
import { RATES, QUALITIES } from './world.js'
import { WEATHERS, WEATHER_NAMES } from '../sim/env.js'
import { CAM_MODES, CAM_NAMES } from '../render/camera.js'
import { CHOICES } from './options.js'

const RATE_NAMES = {
  0: 'Stopped',
  1: 'Real time',
  30: 'GTA · 30×',
  120: 'Fast · 120×'
}
const cap = s => s[0].toUpperCase() + s.slice(1)
// the rows, under their headings: { id, name, hint, opts: [[value, label], ...] } or a slider
const PALETTES = { standard: 'Standard', deutan: 'Red-green safe', tritan: 'Blue-yellow safe' }
const DRAWS = { near: 'Near', mid: 'Medium', far: 'Far' }
export const ROWS = [
  { head: 'Sound' },
  {
    id: 'sound',
    name: 'Sound',
    hint: 'The car, the street and the radio',
    opts: [
      [true, 'On'],
      [false, 'Off']
    ]
  },
  {
    opt: 'master',
    name: 'Master volume',
    hint: 'Everything you hear',
    opts: CHOICES.master.map(v => [v, v ? `${Math.round(v * 100)}%` : 'Off'])
  },
  {
    opt: 'music',
    name: 'Music volume',
    hint: 'The radio',
    opts: CHOICES.music.map(v => [v, v ? `${Math.round(v * 100)}%` : 'Off'])
  },
  {
    opt: 'sfx',
    name: 'Effects volume',
    hint: 'The cars, the street, the weather, the sirens',
    opts: CHOICES.sfx.map(v => [v, v ? `${Math.round(v * 100)}%` : 'Off'])
  },
  { head: 'Display' },
  {
    id: 'units',
    name: 'Speed units',
    hint: 'The speedometer in kilometres or miles an hour',
    opts: [
      ['kmh', 'km/h'],
      ['mph', 'mph']
    ]
  },
  {
    opt: 'subtitles',
    name: 'Subtitles',
    hint: 'Mission lines, and captions for sounds that matter: sirens, thunder',
    opts: CHOICES.subtitles.map(v => [v, v ? 'On' : 'Off'])
  },
  {
    opt: 'bigText',
    name: 'Large text',
    hint: 'The HUD, the hints and the menus larger',
    opts: CHOICES.bigText.map(v => [v, v ? 'On' : 'Off'])
  },
  {
    opt: 'palette',
    name: 'HUD colours',
    hint: 'Colours told apart without red against green (or blue against yellow)',
    opts: CHOICES.palette.map(v => [v, PALETTES[v]])
  },
  {
    opt: 'motion',
    name: 'Motion',
    hint: 'Reduced: less camera shake, no speed blur',
    opts: CHOICES.motion.map(v => [v, v === 'full' ? 'Full' : 'Reduced'])
  },
  { head: 'Camera' },
  {
    id: 'cam',
    name: 'Camera',
    hint: 'Follow sits behind the car, Director cuts between shots (V)',
    opts: CAM_MODES.map(m => [m, CAM_NAMES[m]])
  },
  {
    opt: 'sens',
    name: 'Look sensitivity',
    hint: 'How fast the mouse turns the camera',
    opts: CHOICES.sens.map(v => [v, `${v.toFixed(2).replace(/0$/, '')}×`])
  },
  {
    opt: 'invert',
    name: 'Invert look',
    hint: 'The mouse up looks down',
    opts: CHOICES.invert.map(v => [v, v ? 'On' : 'Off'])
  },
  { head: 'Controls' },
  {
    opt: 'stunts',
    name: 'Roadster stunt keys',
    hint: 'G flies the Roadster on its thrusters, X and K flip it in the air (on with ?debug=1)',
    opts: CHOICES.stunts.map(v => [v, v ? 'On' : 'Off'])
  },
  { head: 'World' },
  {
    id: 'hour',
    name: 'Time of day',
    hint: 'The time in the city, a quarter of an hour a step',
    slider: true
  },
  {
    id: 'rate',
    name: 'Time speed',
    hint: 'How fast the clock runs: GTA runs a minute every two seconds',
    opts: RATES.map(r => [r, RATE_NAMES[r]])
  },
  {
    id: 'weather',
    name: 'Weather',
    hint: 'Auto: it changes by itself, as the weather in Los Angeles does',
    opts: [['auto', 'Auto'], ...WEATHER_NAMES.map(n => [n, WEATHERS[n].name])]
  },
  { head: 'Graphics' },
  {
    id: 'quality',
    name: 'Quality',
    hint: 'Auto picks one for the graphics card and steps down when frames run slow',
    opts: QUALITIES.map(q => [q, cap(q)])
  },
  {
    opt: 'shadows',
    name: 'Shadows',
    hint: 'Off draws faster',
    opts: CHOICES.shadows.map(v => [v, v === 'on' ? 'On' : 'Off'])
  },
  {
    opt: 'px',
    name: 'Resolution',
    hint: 'Pixels to a point: Auto as the quality has it, lower draws faster',
    opts: CHOICES.px.map(v => [v, v === 'auto' ? 'Auto' : `${v}×`])
  },
  {
    opt: 'draw',
    name: 'Draw distance',
    hint: 'How far the city is drawn: nearer, the haze closes in and it draws faster',
    opts: CHOICES.draw.map(v => [v, DRAWS[v]])
  }
]
