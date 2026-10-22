// The road's grip for the cars the player drives (vehicleSim.js world.grip), wet or dry: from the
// city's weather (env.js ENV: how wet the road is and how hard it rains, as game.js gives the
// police), times a hook anyone may set (GRIP.scale: a weather or a surface of their own, a cheat,
// a test). One getter, so the rain's grip is the same for every car the player drives.
import { weatherGrip, WET_GRIP } from './env.js'
import { clamp } from './constants.js'

export const GRIP = { scale: 1, min: 0.45 }
// 1 dry; down to about 0.7 soaked (a puddle's worth less again is the surface's own business)
export function roadGrip () {
  // (the weather's share: env.js weatherGrip, the one getter the shared weather state gives)
  return clamp(weatherGrip() * GRIP.scale, GRIP.min, 1.5)
}
export function setGripScale (k) {
  GRIP.scale = Number.isFinite(k) ? k : 1
}
// how wet the road is for its grip, 0 dry to 1 soaked (the rain's share counts before it has soaked
// in): the same measure env.js weatherGrip takes its 30% off by
export function wetness () {
  return (1 - weatherGrip()) / WET_GRIP
}
// a surface's grip (street.js SURFACES: its own grip and the share it loses soaked) in the weather,
// times the hook: the Roadster's in the city (street.js feel). On asphalt (wet WET_GRIP) it is
// roadGrip(), the same as every other car the player drives
export function surfaceGrip (f) {
  return Math.max(0.3, f.grip * (1 - f.wet * wetness()) * GRIP.scale)
}
