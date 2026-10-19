// How many people are out, by the hour, the weather and the neighbourhood (mixed into Peds, which
// keeps that many round the player). By day, as many as ever. Late at night far fewer: from about
// ten in the evening down to a third at about three in the morning, and back by seven. In the
// evening more along Hollywood's and Santa Monica's shopping streets, where the theatres, bars and
// restaurants are. In the rain fewer, down to about half in a downpour. When more are about than
// should be, some go indoors where nobody sees them go (in at a door, round a corner), and fewer
// come out. The clock and the rain are the city's own (env.js), eased, so the crowd thins and
// fills slowly.
import { ENV } from './env.js'
import { clamp } from './constants.js'
import { BLOCKS, superOf } from './city.js'

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
// The share of the day's people out at hour h (0 to 24): all of them from seven in the morning to
// ten at night; going home quickly at first, then fewer and fewer, a third left at three in the
// morning; and out again from about five
export function hourShare (h) {
  const t = (((h + 2) % 24) + 24) % 24 // (hours since ten at night)
  if (t >= 9) return 1
  const k = t < 5 ? 1 - (1 - t / 5) ** 2 : 1 - smooth(5, 9, t)
  return 1 - (2 / 3) * k
}
// How much of an evening it is at hour h: from half past five, in full by half past seven, over by
// midnight
export const evening = h => smooth(17.5, 19.5, h) * (1 - smooth(22, 24, h))
// The share out in the rain (0 to 1): all of them in a drizzle, half in a downpour
export const rainShare = rain => 1 - 0.5 * smooth(0.2, 0.9, rain)
// Hollywood's and Santa Monica's shopping streets, busier in the evening by EVE
const LIVELY = new Set(['boulevard', 'beach'])
export const lively = b => b.kind === 'city' && LIVELY.has(b.area)
const EVE = 0.5

export const FOOTFALL = {
  // How many people should be out round (x, z) just now: the day's number, for the hour and the
  // rain, and in the evening more where the blocks round about are lively ones
  target (x, z) {
    const eve = (this.eve = evening(ENV.hour))
    let busy = 1
    if (eve > 0) {
      const r2 = (this.radius + 48) ** 2
      let sum = 0,
        n = 0
      for (const b of BLOCKS) {
        const dx = (b.x0 + b.x1) / 2 - x,
          dz = (b.z0 + b.z1) / 2 - z
        if (dx * dx + dz * dz > r2) continue
        sum += lively(b) ? 1 + EVE * eve : 1
        n++
      }
      if (n) busy = sum / n
    }
    const share = hourShare(ENV.hour) * rainShare(ENV.rain)
    return Math.round(this.count * share * busy)
  },
  // Whether someone new turns up on block b: always on a lively block, and in the evening less
  // often elsewhere, so the lively ones fill up more (drawn from the second stream, peds.js Q)
  welcome (b) {
    if (superOf(b.bx, b.bz)) return false // (no pavements to walk round: pavement.js crossings)
    const eve = this.eve
    if (!(eve > 0) || lively(b)) return true
    return this.Q() * (1 + EVE * eve) < 1
  },
  // Too many about for the hour or the rain: up to n of them go indoors, those walking or standing
  // about and out of the camera's sight (behind it, or far off), not right by the car; whoever
  // walks with them goes in with them, and a dog with its owner (dogs.js)
  indoors (x, z, view, n) {
    const L = this.list
    for (let i = L.length - 1; i >= 0 && n > 0; i--) {
      const p = L[i]
      if ((p.state !== 'walk' && p.state !== 'idle') || p.lead) continue
      const dx = p.x - x,
        dz = p.z - z,
        d2 = dx * dx + dz * dz
      if (d2 < 900) continue
      const seen =
        view && (p.x - view.x) * view.fx + (p.z - view.z) * view.fz > -8
      if (seen && d2 < 16900) continue
      p.gone = true
      L.splice(i, 1)
      n--
      const q = p.mate,
        k = q && q.lead === p && !q.gone ? L.indexOf(q) : -1
      if (k < 0) continue
      q.gone = true
      L.splice(k, 1)
      if (k < i) i--
      n--
    }
  }
}
