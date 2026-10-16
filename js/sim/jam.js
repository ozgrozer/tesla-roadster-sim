// The jammed street: one block of the central avenue, straight ahead of the city's spawn point,
// stands gridlocked both ways, nose to tail, for the Roadster to jump. Its lanes are closed:
// traffic and Autopilot go round, and a wrecked Roadster is never put back inside it.
import { N, nodeAt } from './city.js'

const west = nodeAt(2, N / 2),
  east = nodeAt(3, N / 2)
export const JAM = [...west.out[0], ...east.out[2]] // both lanes each way
for (const e of JAM) e.closed = true
// the middle of the block, for the radar
export const JAM_AT = { x: (west.x + east.x) / 2, z: west.z }
