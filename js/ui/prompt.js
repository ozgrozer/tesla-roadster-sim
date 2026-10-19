// The prompt by a car the player can get into, GTA's: the key, what it does and the car ("E Break
// in · Sedan"), and what is happening while they get in (onFoot.js shows it in #prompt).
import { vehicles } from '../sim/vehicles.js'
import { howToEnter } from '../sim/boarding.js'

export const PROMPT_R = 2.4 // m from a car's body that it offers to be got into
export const TITLE = {
  roadster: 'Roadster',
  sedan: 'Sedan',
  hatch: 'Hatchback',
  suv: 'SUV',
  taxi: 'Taxi',
  pickup: 'Pickup',
  van: 'Van',
  bus: 'Bus',
  police: 'Police cruiser',
  sports: 'Sports car',
  ambulance: 'Ambulance',
  fire: 'Fire engine',
  truck: 'Box truck',
  lowrider: 'Lowrider',
  limo: 'Limousine'
}
export const VERB = { roadster: 'Get in', open: 'Get in', theft: 'Break in', jack: 'Carjack' }

export function offerFor (player, a) {
let text = ''
let target = null,
  how = null
  if (player.mode === 'foot' && a?.dir !== 'in') {
    const e = vehicles.nearest(player.pos, PROMPT_R, v => v.occupant !== 'player')
    if (e) {
      how = howToEnter(e)
      if (how) {
        target = e
        text = `<kbd>E</kbd> ${VERB[how]} · ${TITLE[e.type] || e.type}`
      } else if (e.occupant === 'npc') text = `${TITLE[e.type] || e.type} · moving`
    }
  } else if (a?.dir === 'in') {
    if (a.phase === 'walk') text = a.how === 'jack' ? 'Carjacking…' : 'To the door…'
    else if (a.phase === 'jimmy') text = a.smash ? 'Breaking the window…' : 'Forcing the lock…'
    else if (a.phase === 'pull') text = 'Out you get!'
  }
  return { text, target, how }
}
