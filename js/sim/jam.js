// The jammed street: one block of the central avenue, straight ahead of the city's spawn point,
// stands gridlocked both ways, nose to tail, for the Roadster to jump. Its lanes are closed:
// traffic and Autopilot go round, and a wrecked Roadster is never put back inside it.
import { N, PITCH, ROAD_HW, nodeAt } from './city.js'

const west = nodeAt(2, N / 2),
  east = nodeAt(3, N / 2)
export const JAM = [...west.out[0], ...east.out[2]] // both lanes each way
for (const e of JAM) e.closed = true
// the middle of the block, for the radar
export const JAM_AT = { x: (west.x + east.x) / 2, z: west.z }
// on or over the jammed block, or just short of either end (where the back of the queue is)
export const atJam = (x, z) =>
  Math.abs(x - JAM_AT.x) < PITCH / 2 + 30 &&
  Math.abs(z - JAM_AT.z) < ROAD_HW + 4
