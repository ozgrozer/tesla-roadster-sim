// The interiors drawn: each room (sim/interiors/rooms.js) as three meshes in its own frame (x
// across the door's wall, y up, z in from it), placed under the city where its site puts it
// (sim/interiors/sites.js): the shell (floor, walls, ceiling and everything in the room, its light
// baked into the vertex colours from the room's lamps, so it costs no lights and no shadows and
// looks the same by day and by night), what glows (the ceiling lights, the fridges, the signs:
// bright enough to bloom), and the windows (the sky's light, from the time of day). Hidden until
// the player goes in; only the room they are in is drawn.
import * as THREE from 'three'
import { merge, box, tint } from '../geo.js'
import { POCKET } from '../../sim/interiors/sites.js'

const _c = new THREE.Color(),
  _p = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _l = new THREE.Vector3()

// the light at a point p (normal n) in room R: a little everywhere, more under and facing each lamp
function lightAt (R, p, n) {
  let k = 0.26 + 0.05 * n.y
  for (const [x, z, s] of R.lamps) {
    _l.set(x - p.x, R.h - 0.15 - p.y, z - p.z)
    const d = _l.length() || 1
    const ndl = Math.max(0, n.dot(_l) / d)
    k += (s * (0.2 + 0.8 * ndl) * 1.15) / (1 + 0.3 * d * d)
  }
  // (darker into the corners where the walls meet the floor)
  if (n.y < 0.5) k *= 0.82 + 0.18 * Math.min(1, p.y / 1.2)
  return Math.min(1.05, k)
}
// bake R's light into g's vertex colours (its own colours times the light)
function bake (R, g) {
  const P = g.attributes.position,
    N = g.attributes.normal,
    C = g.attributes.color
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i)
    _n.fromBufferAttribute(N, i)
    const k = lightAt(R, _p, _n)
    C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k)
  }
  return g
}
// a flat piece facing the way it is turned (rx, ry: rotations), w by h, at (x, y, z)
function quad (w, h, rx, ry, x, y, z, colour) {
  const g = new THREE.PlaneGeometry(w, h)
  if (rx) g.rotateX(rx)
  if (ry) g.rotateY(ry)
  return tint(g.translate(x, y, z), colour)
}

// the floor in tiles (or concrete in big squares), the walls with a darker band along the
// bottom, the ceiling, the door from the inside (its frame, its glass, the exit sign over it)
function shell (R, pieces, glow, panes) {
  const { w, d, h } = R
  const tile = R.lines ? 2 : 0.6
  for (let x = -w / 2; x < w / 2 - 1e-6; x += tile)
    for (let z = 0; z < d - 1e-6; z += tile) {
      const i = Math.round((x + w / 2) / tile),
        j = Math.round(z / tile)
      const tw = Math.min(tile, w / 2 - x),
        td = Math.min(tile, d - z)
      pieces.push(quad(tw, td, -Math.PI / 2, 0, x + tw / 2, 0, z + td / 2, R.floor[(i + j) & 1]))
    }
  if (R.lines)
    for (const x of [-8.8, -2.2, 3.4])
      pieces.push(quad(0.12, d - 1.5, -Math.PI / 2, 0, x, 0.005, d / 2, R.lines))
  const band = new THREE.Color(R.trim).lerp(new THREE.Color(R.wall), 0.35).getHex()
  // the walls, in strips a metre wide (so the light falls across them), the band below
  const wallRun = (len, place) => {
    for (let u = 0; u < len - 1e-6; u += 1) {
      const s = Math.min(1, len - u)
      for (const [y0, y1, c] of [[0, 1, band], [1, h, R.wall]]) place(s, y1 - y0, u + s / 2, (y0 + y1) / 2, c)
    }
  }
  wallRun(w, (s, hh, u, y, c) => pieces.push(quad(s, hh, 0, 0, -w / 2 + u, y, 0, c))) // the door's wall, facing in
  wallRun(w, (s, hh, u, y, c) => pieces.push(quad(s, hh, 0, Math.PI, -w / 2 + u, y, d, c)))
  wallRun(d, (s, hh, u, y, c) => pieces.push(quad(s, hh, 0, Math.PI / 2, -w / 2, y, u, c)))
  wallRun(d, (s, hh, u, y, c) => pieces.push(quad(s, hh, 0, -Math.PI / 2, w / 2, y, u, c)))
  for (let x = -w / 2; x < w / 2 - 1e-6; x += 2)
    for (let z = 0; z < d - 1e-6; z += 2) {
      const tw = Math.min(2, w / 2 - x),
        td = Math.min(2, d - z)
      pieces.push(quad(tw, td, Math.PI / 2, 0, x + tw / 2, h, z + td / 2, R.ceil))
    }
  // the door: its frame, its glass (the street's light through it), and the green exit sign
  const x = R.door
  pieces.push(tint(box(x - 0.65, 0, 0.01, x + 0.65, 2.45, 0.08), 0x2b2f36))
  panes.push(tint(box(x - 0.52, 0.05, 0.08, x + 0.52, 2.3, 0.09), 0xffffff))
  glow.push(tint(box(x - 0.3, 2.62, 0.02, x + 0.3, 2.86, 0.1), 0x3cff7a))
}

// One room's meshes, in a group placed at its site: { group, panes (the windows' material) }
export function buildRoom (site, mats) {
  const R = site.room
  const pieces = [],
    glow = [],
    panes = []
  shell(R, pieces, glow, panes)
  for (const [x0, x1, z0, z1, y0, y1, c, what] of R.boxes) {
    if (what === 'x') continue
    const g = tint(box(x0, y0, z0, x1, y1, z1), what === 'w' ? 0xffffff : c)
    if (what === 'g' || what === 'gs') glow.push(g)
    else if (what === 'w') panes.push(g)
    else pieces.push(g)
  }
  const group = new THREE.Group()
  const add = (list, mat, lit) => {
    if (!list.length) return
    const g = merge(list)
    if (lit) bake(R, g)
    const m = new THREE.Mesh(g, mat)
    m.frustumCulled = false
    m.userData.streamed = true // (never streamed out: chunks.js)
    group.add(m)
  }
  add(pieces, mats.shell, true)
  add(glow, mats.glow, false)
  add(panes, mats.pane, false)
  // the frame: x along r, y up, z along f, from the frame's origin at the floor
  const { r, f, door } = site
  group.matrixAutoUpdate = false
  group.matrix.set(r.x, 0, f.x, door.x, 0, 1, 0, POCKET, r.z, 0, f.z, door.z, 0, 0, 0, 1)
  group.visible = false
  return group
}

// the rooms' three materials, shared by every room (none fogged: the room is all there is)
export function roomMaterials () {
  return {
    shell: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, color: new THREE.Color(1.5, 1.5, 1.5) }),
    pane: new THREE.MeshBasicMaterial({ fog: false, color: new THREE.Color(1.4, 1.6, 1.8) })
  }
}
