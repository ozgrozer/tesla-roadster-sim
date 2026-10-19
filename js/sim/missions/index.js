// The missions on offer (each a data file of its own: drive, race, escape, deliver, taxi,
// getaway, valet, trial), for the
// manager (manager.js). A mission: { id, title, brief, start ([fx, fz]: spots.js), color, reward,
// tip?, timer? (s for the whole mission), wanted? (stars on starting), target? ({ model, near }: a
// car parked for it), objectives: [{ type (objectives.js), ...its data, time? (s for this one) }] }
import { DRIVE } from './drive.js'
import { RACE } from './race.js'
import { ESCAPE } from './escape.js'
import { DELIVER } from './deliver.js'
import { TAXI } from './taxi.js'
import { GETAWAY } from './getaway.js'
import { VALET } from './valet.js'
import { TRIAL } from './trial.js'

export const MISSIONS = [DRIVE, RACE, ESCAPE, DELIVER, TAXI, GETAWAY, VALET, TRIAL]
export const missionById = id => MISSIONS.find(m => m.id === id) || null
