// The pause menu's DEBUG tab (only with ?debug=1: debug.js): what the old top bar's buttons did,
// the test site, slow motion, Autopilot, and the clock, the weather and the fan, each a button that
// does what its key does (keys.js) and resumes the game. Also the credit line and the promo, which
// used to sit on the HUD.
import { DEBUG } from './debug.js'
import { keyOf } from './keymap.js'

const ACTS = [
  ['KeyY', 'City · test site', 'The McGregor test site and its 170° wall, or back to Los Angeles'],
  ['KeyT', 'Slow motion', 'Everything at a third of the pace, on and off'],
  ['KeyI', 'Autopilot · manual', 'The Roadster drives itself (to the waypoint, with one set)'],
  ['KeyL', 'Next time of day', 'Runs the clock on to the next part of the day'],
  ['KeyO', 'Next weather', 'Brings in the next weather'],
  ['KeyB', 'Suction fan', 'The test site\'s fan: auto, on, off'],
  ['Digit1', 'Test site: start', 'The Roadster back at the start line'],
  ['Digit2', 'Test site: wall top', 'Hanging at 170° on the wall'],
  ['Digit3', 'Test site: lineup', 'The run-up for a kickflip']
]
export const CREDIT =
  'Fan-made simulation built from press coverage of the Oct 15, 2026 Roadster reveal. ' +
  'Not affiliated with Tesla or SpaceX. Original assets only.'

// the tab's markup (empty without debug: the tab isn't there)
export function debugPanel () {
  if (!DEBUG.on) return ''
  return `<section class="mn-panel mn-debug" id="mnDebug" role="tabpanel"
    aria-labelledby="mnTabDebug" tabindex="0" hidden><div class="dbg-list">${ACTS.map(
      ([code, name, what]) =>
        `<button type="button" class="dbg-act" data-code="${code}"><b>${name}</b>` +
        `<kbd>${keyOf(code)}</kbd><span>${what}</span></button>`
    ).join('')}</div><p class="dbg-note">Debug mode (?debug=1): these keys work in the game too.</p></section>`
}
export const debugTabButton = () =>
  DEBUG.on ? '<button type="button" role="tab" id="mnTabDebug" aria-controls="mnDebug">Debug</button>' : ''

// each button presses its key's command and resumes the game
export function wireDebug (root, keys, menu) {
  for (const b of root.querySelectorAll('.dbg-act'))
    b.addEventListener('click', () => {
      menu.hide()
      keys[b.dataset.code]?.()
    })
}
