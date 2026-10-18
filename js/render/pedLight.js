// The street lights' light on the people and their dogs at night (peds.js, pedShader.js, dogs.js).
// A street light lights the ground under it (the ground's own shaders work it out: lampLight.js),
// so someone standing in its pool was lit by the moon and the sky alone: a dark figure on the bright
// ground. Now each one drawn is lit, as by a point light, by the street light nearest them, from its
// lens under the head out over the road: the same warm light as the pool, and as much of it as the
// pool has where they stand (most within 2.4 m of its middle, none past 6 m), while the street
// lights are on. A light knocked down lights nobody.
import { LAMPS, COLLIDERS } from '../sim/city.js'

// where a light's lens is: out over the road from the pole, and up (cityProps.js HEAD, plus the
// lens's place under the head); the pool's middle is 2.3 m out
const LENS = { steel: [2.39, 8.92], wood: [2.07, 8.15] },
  POOL = 2.3
const BRIGHT = 4.5 // (the light at a pool's middle)
// the lights by 24 m square, for the nearest (made the first time it is wanted), and each light's
// collider (breakables.js), to know it is still standing
const CELL = 24
let GRID = null
const POST = []
function grid () {
  GRID = new Map()
  LAMPS.forEach((l, i) => {
    const k =
      Math.floor((l.x + l.ax * POOL) / CELL) * 4096 +
      Math.floor((l.z + l.az * POOL) / CELL)
    if (!GRID.has(k)) GRID.set(k, [])
    GRID.get(k).push(i)
  })
  for (const c of COLLIDERS) if (c.kind === 'lamp') POST[c.i] = c
  return GRID
}

// The light on someone standing at (x, z): into out, the lens from their feet (x, y, z, m) and its
// strength (w: 0 out of every pool); on: how far the street lights are on (0 to 1)
export function lampOn (x, z, on, out) {
  out.w = 0
  if (!(on > 0)) return out
  const g = GRID || grid(),
    cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL)
  let best = 36,
    bi = -1
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++) {
      const list = g.get(i * 4096 + j)
      if (!list) continue
      for (let n = 0; n < list.length; n++) {
        const l = LAMPS[list[n]],
          dx = l.x + l.ax * POOL - x,
          dz = l.z + l.az * POOL - z,
          d2 = dx * dx + dz * dz
        if (d2 < best && !POST[list[n]]?.down) {
          best = d2
          bi = list[n]
        }
      }
    }
  if (bi < 0) return out
  const l = LAMPS[bi],
    lens = l.wood ? LENS.wood : LENS.steel,
    d = Math.sqrt(best)
  out.x = l.x + l.ax * lens[0] - x
  out.y = lens[1]
  out.z = l.z + l.az * lens[0] - z
  // (as the pool's own fall-off, softTex in scene.js)
  const k = d < 2.4 ? 1 - (0.45 * d) / 2.4 : 0.55 * (1 - (d - 2.4) / 3.6)
  out.w = BRIGHT * on * k
  return out
}

// For the shaders: the lens's place in view space, worked out per vertex from the instance's place
// and aLamp; and its light added to the sun's, the moon's and the sky's, as a point light's is
export const LAMP_VERTEX = {
  head: `
  attribute vec4 aLamp; // the nearest street light's lens from their feet (m), and its strength
  varying vec4 vPedLamp;
`,
  main: `vPedLamp = vec4((viewMatrix * modelMatrix * vec4(instanceMatrix[3].xyz + aLamp.xyz, 1.0)).xyz, aLamp.w);`
}
export const LAMP_FRAGMENT = {
  head: `
  varying vec4 vPedLamp;
`,
  main: `
  if (vPedLamp.w > 0.001) {
    IncidentLight lamp;
    lamp.direction = normalize(vPedLamp.xyz - geometryPosition);
    lamp.color = vec3(1.0, 0.74, 0.45) * vPedLamp.w;
    lamp.visible = true;
    RE_Direct(lamp, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }`
}
