// The road's grip for the cars the player drives (vehicleSim.js world.grip), wet or dry: from the
// city's weather (env.js ENV: how wet the road is and how hard it rains, as game.js gives the
// police), times a hook anyone may set (GRIP.scale: a weather or a surface of their own, a cheat,
// a test). One getter, so the rain's grip is the same for every car the player drives.
import { weatherGrip } from './env.js'
import { clamp } from './constants.js'

export const GRIP = { scale: 1, min: 0.45 }
// 1 dry; down to about 0.7 soaked (a puddle's worth less again is the surface's own business)
export function roadGrip () {
  // (the weather's own getter, env.js: one wet grip for everyone)
  return clamp(weatherGrip() * GRIP.scale, GRIP.min, 1.5)
}
export function setGripScale (k) {
  GRIP.scale = Number.isFinite(k) ? k : 1
}
