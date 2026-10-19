// The port's quay: where the coast turns south of the beach, the sand gives way to a concrete wharf
// along the container yards, ship-to-shore cranes standing on it on their rails, their booms out
// over a container ship moored alongside. The cranes' legs are solid (the car drives between them,
// under the portal); the ship lies in the water, out of reach. Pure data, as plots.js.
import { OUTER, EDGE, ROADS, rng } from './grid.js'
import { WALL } from './hills.js'
import { prop, post } from './plots.js'
import { trailer } from './works.js'

const PROMENADE = EDGE + 1.5 // (city.js)

// (out past the beach's face, over the water: citySea.js)
export const QUAY = {
  x0: -OUTER - 11,
  x1: -(PROMENADE - 0.3),
  z0: ROADS[14] - 10,
  z1: WALL - 6
}
const GAUGE = 16 // m between a crane's water-side and land-side legs
const SPAN = 17 // and between its legs along the quay
export const CRANES = []
export const SHIP = {
  x0: -OUTER - 48,
  x1: -OUTER - 16,
  z0: QUAY.z0 + 30,
  z1: QUAY.z1 - 40,
  deck: 9
}
// whether (x, z) is on the quay
export const onQuay = (x, z) =>
  x >= QUAY.x0 && x <= QUAY.x1 && z >= QUAY.z0 && z <= QUAY.z1

// lots.js: the cranes' legs into SOLIDS (as posts), the cranes and the ship into PROPS
export function layQuay () {
  const R = rng(4242)
  const xw = QUAY.x0 + 3,
    xl = xw + GAUGE
  for (const z of [QUAY.z0 + 70, QUAY.z0 + 170, QUAY.z0 + 275]) {
    for (const x of [xw, xl])
      for (const dz of [-SPAN / 2, SPAN / 2]) post(x, z + dz, 0.7, 44, 'crane')
    CRANES.push(
      prop('crane', {
        x: (xw + xl) / 2,
        z,
        xw,
        xl,
        span: SPAN,
        h: 44,
        out: 52,
        back: 22,
        c: R() < 0.5 ? 0 : 1
      })
    )
  }
  // trucks on the quay: under each crane, two in its lanes being loaded, and a line of them along
  // the land side waiting their turn (their own random numbers: the yards' stay as they were)
  const T = rng(5151),
    turn = () => (T() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
  for (const c of CRANES)
    for (const x of [xw + 5.5, xw + 10.5])
      if (T() < 0.8)
        trailer(x, c.z + (T() - 0.5) * 4, turn(), true, Math.floor(T() * 10))
  for (let z = QUAY.z0 + 20; z < QUAY.z1 - 20; z += 24)
    if (T() < 0.75) trailer(xl + 7, z, turn(), T() < 0.8, Math.floor(T() * 10))
  // the ship's cargo: rows of stacks across its deck (an index each into the boxes' colours)
  const stacks = []
  for (let z = SHIP.z0 + 30; z < SHIP.z1 - 46; z += 13)
    for (let x = SHIP.x0 + 3; x < SHIP.x1 - 3; x += 2.6)
      stacks.push({ x, z, n: 2 + Math.floor(R() * 5), c: Math.floor(R() * 10) })
  prop('ship', { ...SHIP, stacks })
}
