// The game's extension points, so a new system plugs in with one line in js/features.js instead of
// edits to the hub files (main.js, onFoot.js, game.js): things the player can use with E on foot or
// in a car (a shop's door, a garage, a pump), marks of their own on the radar and the pause map,
// and sections of the save game (sim/save.js). Pure data and functions: no DOM, nothing drawn.
//
//   addInteractable({ id, x, z, r, y?, modes?, label(p) -> html | null, act(p) -> void })
//     -> remove(). Offered when the player is within r m (and, with y, within 3 m of its height)
//     in one of its modes ('foot' by default, 'car' for one used from the driver's seat, where
//     it takes E before getting out does); label is what follows the key in the prompt
//     ("Enter · 24/7 Store"), null while it has nothing to offer.
//   interactableFor(p) -> { it, d } | null: the nearest one on offer to the player p (sim/player.js)
//   addRadarOverlay(fn(g, V, toRadar, k)), addMapOverlay(fn(g, sx, sy, k)) -> remove(): drawn after
//     the police's and the missions' marks (ui/crimeMap.js), on the radar and the pause map
export const HOOKS = { interactables: [], radar: [], map: [] }

function adder (list) {
  return x => {
    list.push(x)
    return () => {
      const i = list.indexOf(x)
      if (i >= 0) list.splice(i, 1)
    }
  }
}
export const addInteractable = adder(HOOKS.interactables)
export const addRadarOverlay = adder(HOOKS.radar)
export const addMapOverlay = adder(HOOKS.map)

export function interactableFor (p) {
  let best = null,
    bd = Infinity
  const mode = p.mode === 'car' ? 'car' : p.mode === 'foot' ? 'foot' : null
  if (!mode) return null
  for (const it of HOOKS.interactables) {
    if (!(it.modes || ['foot']).includes(mode)) continue
    const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z)
    if (d > (it.r ?? 2) || d >= bd) continue
    if (it.y != null && Math.abs((p.pos.y ?? 0) - it.y) > 3) continue
    if (!it.label(p)) continue
    best = it
    bd = d
  }
  return best ? { it: best, d: bd } : null
}
