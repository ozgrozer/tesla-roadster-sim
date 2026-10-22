// The places the maps mark with an icon (ui/poiMap.js): the gas stations (their canopies: strip.js),
// the multi-storey car parks (lots.js GARAGES), the hospitals and police stations the player is put
// back at (missions/spots.js), and anything another part of the game adds (addPoi: an interior's
// door, a shop you can walk into). { id, kind, x, z, name } each. Pure data, built the first time
// it is asked for.
import { BLOCKS, SOLIDS } from './plots.js'
import { GARAGES } from './lots.js'
import { spot, HOSPITALS, STATIONS } from './missions/spots.js'
import { SITES } from './interiors/sites.js'

export const POI_KINDS = {
  gas: { name: 'Gas station', color: '#f0a12a' },
  garage: { name: 'Car park', color: '#4f8fe0' },
  hospital: { name: 'Hospital', color: '#e5463b' },
  police: { name: 'Police station', color: '#3b6fd8' },
  shop: { name: 'Shop', color: '#59c27a' },
  interior: { name: 'Way in', color: '#d8d8d8' }
}
const ADDED = []
let built = null

// another stream's place: { id, kind (one of POI_KINDS, else 'interior'), x, z, name }
export function addPoi (p) {
  const i = ADDED.findIndex(q => q.id === p.id)
  const e = { kind: POI_KINDS[p.kind] ? p.kind : 'interior', ...p }
  if (!POI_KINDS[e.kind]) e.kind = 'interior'
  if (i >= 0) ADDED[i] = e
  else ADDED.push(e)
  built = null
}
export function removePoi (id) {
  const i = ADDED.findIndex(q => q.id === id)
  if (i >= 0) ADDED.splice(i, 1)
  built = null
}

export function pois () {
  if (built) return built
  const out = []
  let n = 0
  for (const s of SOLIDS)
    if (s.look === 'canopy')
      out.push({ id: `gas${n++}`, kind: 'gas', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, name: 'Gas station' })
  for (const b of BLOCKS)
    if (GARAGES.has(`${b.bx},${b.bz}`))
      out.push({ id: `garage${b.bx},${b.bz}`, kind: 'garage', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, name: 'Car park' })
  HOSPITALS.forEach(([fx, fz], i) => {
    const s = spot(fx, fz, { kerb: false })
    out.push({ id: `hospital${i}`, kind: 'hospital', x: s.x, z: s.z, name: 'Hospital' })
  })
  STATIONS.forEach(([fx, fz], i) => {
    const s = spot(fx, fz, { kerb: false })
    out.push({ id: `police${i}`, kind: 'police', x: s.x, z: s.z, name: 'Police station' })
  })
  // (the doors into the interiors: interiors/sites.js; the shops and the diner as shops)
  for (const st of SITES)
    out.push({ id: `in-${st.id}`, kind: st.kind === 'lobby' ? 'interior' : 'shop', x: st.door.x, z: st.door.z, name: st.name })
  built = out.concat(ADDED)
  return built
}
