// Who saw it: the people on the pavement, the drivers about and the police, each within their own
// reach and with a clear sight line to the place (city.js raycast against the buildings), for the
// wanted level (wanted.js). Also whether the police (and the helicopter) can see the player now,
// for the chase and the search. Pure: no DOM.
import { raycast } from './city.js'

export const PED_SEE = 38 // m someone on foot notices a crime
export const CAR_SEE = 46 // m a driver does
export const policeSight = stars => 75 + 12 * stars // m a police unit can see the player at
const EYE = 1.6
const MAX_RAYS = 24 // sight lines looked along per crime, each kind

// a clear line between (ax, az) and (bx, bz) at eye height?
export function clear (ax, az, bx, bz, ay = EYE, by = 1.1) {
  return raycast(ax, ay, az, bx, by, bz) >= 0.999
}

// The witnesses to something at pos: { peds, cars, police } within sight. peds: peds.list-like
// ([{ x, z, state, dead }]); cars: traffic cars ([{ x, z, parked, ctl }], the parked and the ones the
// game has taken over left out); police: [{ x, z }] (the police's units). los: the sight-line test
// (clear, by default; tests pass their own).
export function witnesses (pos, { peds = [], cars = [], police = [], stars = 0, los = clear } = {}) {
  const out = { peds: 0, cars: 0, police: 0 }
  let rays = 0
  for (const p of peds) {
    if (p.dead || p.state === 'down') continue
    const d = Math.hypot(p.x - pos.x, p.z - pos.z)
    if (d > PED_SEE || d < 0.8) continue
    if (rays++ > MAX_RAYS) break
    if (los(p.x, p.z, pos.x, pos.z)) out.peds++
    if (out.peds >= 3) break
  }
  rays = 0
  for (const c of cars) {
    if (c.parked || c.ctl || c.loose) continue
    const d = Math.hypot(c.x - pos.x, c.z - pos.z)
    if (d > CAR_SEE || d < 3) continue
    if (rays++ > MAX_RAYS) break
    if (los(c.x, c.z, pos.x, pos.z, 1.2)) out.cars++
    if (out.cars >= 3) break
  }
  const reach = policeSight(stars)
  for (const u of police) {
    const d = Math.hypot(u.x - pos.x, u.z - pos.z)
    if (d > reach) continue
    if (los(u.x, u.z, pos.x, pos.z, 1.3)) out.police++
  }
  return out
}
