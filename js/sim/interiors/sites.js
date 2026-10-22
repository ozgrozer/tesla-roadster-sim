// Where the interiors are: each on a building the city already has (lots.js, found by its
// footprint, so nothing in the layout or its random numbers moves), its door on one of the
// building's walls, the way out of it n (one of the four directions), and the room it opens into
// (rooms.js). The room itself is a pocket under the city, POCKET m down beneath the door, so the
// player inside is still where the map, the radar, the district names and the missions think they
// are (the shop's own spot). Each site's colliders are its own, never in the city's grid (city.js
// query), so nothing on the street ever bumps into a room under it.
//
//   SITES[i] = { id, kind, name, room, door: { x, z }, n: { x, z }, f, r, box: { x0..z1 },
//                inner: { x, z }, solids: [...], drive (the body shop's bay out front, or null) }
import { BUILDINGS } from '../city.js'
import { ROOMS } from './rooms.js'

export const POCKET = -40 // m: the rooms' floor, under the city
export const WALL_T = 0.3 // the rooms' walls, m thick

// The sites: the building (its footprint, found within a metre), the wall the door is in (N, E,
// S or W: the way out), where along it (u: m from the wall's west or north end) and the room.
const PLAN = [
  { id: 'nightowl', kind: 'store', at: [-352.6, -339.6, -426.4, -416.4], wall: 'S', u: 9 },
  { id: 'sunrise', kind: 'diner', at: [-321.0, -307.0, -415.0, -403.0], wall: 'S', u: 6 },
  { id: 'redline', kind: 'workshop', at: [-34.1, -11.4, -157.0, -131.3], wall: 'E', u: 6, drive: 17 },
  { id: 'marlowe', kind: 'lobby', at: [-800.7, -779.4, -417.3, -395.4], wall: 'S', u: 10 }
]
const NORMAL = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

function find (at) {
  const [x0, x1, z0, z1] = at
  return BUILDINGS.find(
    b =>
      Math.abs(b.x0 - x0) < 1 &&
      Math.abs(b.x1 - x1) < 1 &&
      Math.abs(b.z0 - z0) < 1 &&
      Math.abs(b.z1 - z1) < 1
  )
}

// a point of the room's frame (x across, z in from the door) in the world
export function toWorld (s, x, z) {
  return { x: s.door.x + s.r.x * x + s.f.x * z, z: s.door.z + s.r.z * x + s.f.z * z }
}
// a box of the room's frame as a box in the world (the frame is square to the world's axes)
function boxToWorld (s, x0, x1, z0, z1) {
  const a = toWorld(s, x0, z0),
    b = toWorld(s, x1, z1)
  return {
    x0: Math.min(a.x, b.x),
    x1: Math.max(a.x, b.x),
    z0: Math.min(a.z, b.z),
    z1: Math.max(a.z, b.z)
  }
}

function site (p) {
  const b = find(p.at)
  if (!b) return null
  const room = ROOMS[p.kind]
  const [nx, nz] = NORMAL[p.wall]
  // the door on the wall's outside face, u along it from its west or north end
  const door =
    p.wall === 'N' || p.wall === 'S'
      ? { x: b.x0 + p.u, z: p.wall === 'N' ? b.z0 : b.z1 }
      : { x: p.wall === 'W' ? b.x0 : b.x1, z: b.z0 + p.u }
  // the room's frame: f into the room (against n), r to the right looking in (the feet's
  // convention: right of (fx, fz) is (-fz, fx)); the door at x = room.door in it
  const f = { x: -nx, z: -nz },
    r = { x: -f.z, z: f.x }
  const s = {
    id: p.id,
    kind: p.kind,
    name: room.name,
    room,
    building: b,
    n: { x: nx, z: nz },
    f,
    r,
    door: { x: door.x - r.x * room.door, z: door.z - r.z * room.door }, // (the frame's origin)
    out: { x: door.x + nx * 0.9, z: door.z + nz * 0.9 }, // where the player stands to go in
    face: { x: door.x, z: door.z }, // the doorway on the outside wall
    yawOut: Math.atan2(-nz, nx), // facing out (the game's heading: (cos h, -sin h))
    yawIn: Math.atan2(nz, -nx),
    drive: null,
    solids: []
  }
  s.inner = toWorld(s, room.door, 0.9) // (stood just inside the door)
  s.box = boxToWorld(s, -room.w / 2, room.w / 2, 0, room.d)
  // the walls round the room, and whatever in it is solid
  const W = WALL_T,
    { w, d, h } = room
  const wall = (x0, x1, z0, z1) =>
    s.solids.push({ ...boxToWorld(s, x0, x1, z0, z1), y0: POCKET - 1, y1: POCKET + h, kind: 'building', look: 'room' })
  wall(-w / 2 - W, w / 2 + W, -W, 0)
  wall(-w / 2 - W, w / 2 + W, d, d + W)
  wall(-w / 2 - W, -w / 2, 0, d)
  wall(w / 2, w / 2 + W, 0, d)
  for (const [x0, x1, z0, z1, y0, y1, , what] of room.boxes)
    if (what === 's' || what === 'gs' || what === 'x')
      s.solids.push({ ...boxToWorld(s, x0, x1, z0, z1), y0: POCKET + y0, y1: POCKET + y1, kind: 'plant', look: 'room' })
  // the body shop's bay: the street in front of its roller door, where a car stops to be seen to
  if (p.drive) {
    const c =
      p.wall === 'N' || p.wall === 'S'
        ? { x: b.x0 + p.drive, z: door.z }
        : { x: door.x, z: b.z0 + p.drive }
    const along = p.wall === 'N' || p.wall === 'S'
    const hw = along ? 4 : 0.5,
      hd = along ? 0.5 : 4
    // (from the wall out over the pavement and the kerb lane: 11 m out, 8 m wide)
    const x0 = nx ? Math.min(c.x, c.x + nx * 11) : c.x - 4,
      x1 = nx ? Math.max(c.x, c.x + nx * 11) : c.x + 4,
      z0 = nz ? Math.min(c.z, c.z + nz * 11) : c.z - 4,
      z1 = nz ? Math.max(c.z, c.z + nz * 11) : c.z + 4
    s.drive = { x0, x1, z0, z1, door: c, hw, hd }
  }
  return s
}

export const SITES = PLAN.map(site).filter(Boolean)
export const siteById = id => SITES.find(s => s.id === id) || null
