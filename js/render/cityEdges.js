// Everything past the ring road's outer pavement, which makes the city Los Angeles: the Pacific and
// Santa Monica's pier to the west, the hills with their sign to the north, and the city going on to
// the east and south behind the freeway. One update for what moves out there (the water, the Ferris
// wheel, the freeway's traffic) and one switch for night (its lights).
import { renderer } from './scene.js'
import { buildSea } from './citySea.js'
import { GLOW_SCALE } from './cityGlow.js'
import { buildWalls } from './cityWalls.js'
import { buildSprawl } from './citySprawl.js'
import { buildFreeway } from './cityFreeway.js'
import { buildHills } from './cityHills.js'
import { buildPier } from './cityPier.js'

// (each part's objects are tagged with its name in userData.edge, to measure them by)
const BUILD = {
  sea: buildSea,
  walls: buildWalls,
  freeway: buildFreeway,
  sprawl: buildSprawl,
  hills: buildHills,
  pier: buildPier
}

export function buildEdges (group) {
  const parts = Object.entries(BUILD).map(([name, build]) => {
    const n = group.children.length,
      part = build(group)
    for (const o of group.children.slice(n)) o.userData.edge = name
    return part
  })
  return {
    update (t, camera) {
      GLOW_SCALE.value =
        renderer.domElement.height /
        (2 * Math.tan((camera.fov * Math.PI) / 360))
      for (const p of parts) p.update?.(t, camera)
    },
    // 0: golden hour, 1: night
    night (k) {
      for (const p of parts) p.night?.(k)
    }
  }
}
