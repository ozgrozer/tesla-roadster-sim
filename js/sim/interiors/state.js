// Going in and out of the interiors, as a little state machine with no DOM in it (the tests drive
// it in Node; render/interiors/glue.js drives it in the game): the door on offer to the player, the
// fade to black and back (the swap happens while the screen is black), the room's own world for the
// feet (its walls and furniture, its floor, no cars), and the body shop's service for a car stopped
// in its bay. The player is only ever moved by placePlayer, between frames, under the black.
//
//   INTERIOR.site   the site the player is inside (sites.js), or null out in the city
//   INTERIOR.phase  'none', 'out' (fading to black), 'hold' (black, the work being done), 'in'
//   INTERIOR.fade   0 (clear) to 1 (black), for the renderer
import { SITES, POCKET } from './sites.js'
import { placePlayer } from '../player.js'

export const FADE = 0.35 // s to black, and back
export const HOLD = { enter: 0.15, exit: 0.15, service: 1.1 } // s held black
export const DOOR_R = 1.5 // m from the spot in front of a door that it offers to be gone through
export const SERVICE_V = 1.2 // m/s: a car slower than this in the bay may be seen to
export const INTERIOR = { site: null, phase: 'none', t: 0, fade: 0, act: null, target: null }

export const inside = () => INTERIOR.site !== null
export const busy = () => INTERIOR.phase !== 'none'

const near = (x, z, p, r) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r
const inRect = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1

// What the player can do here, if anything: { act: 'enter' | 'exit' | 'service', site, why }
// (why: the reason it can't be done now, shown instead). p: the player (sim/player.js); speed:
// the car's over the ground, at the wheel.
export function offerAt (p, speed = 0) {
  if (busy()) return null
  const s = INTERIOR.site
  if (s) {
    if (p.mode === 'foot' && near(s.inner.x, s.inner.z, p.pos, DOOR_R)) return { act: 'exit', site: s }
    return null
  }
  if (p.mode === 'foot') {
    for (const t of SITES)
      if (near(t.out.x, t.out.z, p.pos, DOOR_R) && p.pos.y > POCKET + 10) {
        if (p.wanted > 0) return { act: 'enter', site: t, why: 'Lose the cops first' }
        return { act: 'enter', site: t }
      }
    return null
  }
  if (p.mode === 'car')
    for (const t of SITES)
      if (t.drive && inRect(t.drive, p.pos.x, p.pos.z)) {
        if (speed > SERVICE_V) return { act: 'service', site: t, why: 'Stop in the bay' }
        return { act: 'service', site: t }
      }
  return null
}

// Start going through (o: an offer from offerAt with no why): the fade begins. true if it did.
export function begin (o) {
  if (!o || o.why || busy()) return false
  INTERIOR.phase = 'out'
  INTERIOR.t = 0
  INTERIOR.act = o.act
  INTERIOR.target = o.site
  return true
}

// One step of the transition (dt: game s). Returns 'swap' the step the screen goes black (do the
// move then: swapIn/swapOut, or the service), 'done' when it has cleared, else null.
export function stepTransition (dt) {
  const I = INTERIOR
  if (I.phase === 'none') return null
  I.t += dt
  if (I.phase === 'out') {
    I.fade = Math.min(1, I.t / FADE)
    if (I.t >= FADE) {
      I.phase = 'hold'
      I.t = 0
      I.fade = 1
      return 'swap'
    }
  } else if (I.phase === 'hold') {
    if (I.t >= HOLD[I.act]) {
      I.phase = 'in'
      I.t = 0
    }
  } else if (I.phase === 'in') {
    I.fade = Math.max(0, 1 - I.t / FADE)
    if (I.t >= FADE) {
      I.phase = 'none'
      I.fade = 0
      I.act = I.target = null
      return 'done'
    }
  }
  return null
}

// The player into site s's room (just inside its door, facing in), or back out of it onto the
// street in front of the door, facing away from it
export function swapIn (s, p) {
  placePlayer(s.inner.x + s.f.x * 0.5, s.inner.z + s.f.z * 0.5, s.yawIn, POCKET, p)
  INTERIOR.site = s
}
export function swapOut (p) {
  const s = INTERIOR.site
  INTERIOR.site = null
  if (!s) return
  placePlayer(s.out.x, s.out.z, s.yawOut, null, p)
}
// Out of it at once, with no fade (a reset, being put somewhere else): the state cleared
export function clearInterior () {
  INTERIOR.site = null
  INTERIOR.phase = 'none'
  INTERIOR.fade = 0
  INTERIOR.t = 0
  INTERIOR.act = INTERIOR.target = null
}
// Whether the player has left the room by some other way than its door (put back in a car, taken
// somewhere by a reset or a mission): then the interior lets go of them
export function strayed (p) {
  const s = INTERIOR.site
  if (!s || busy()) return false
  if (p.mode === 'car' || p.pos.y > POCKET + 8) return true
  const b = s.box
  return p.pos.x < b.x0 - 2 || p.pos.x > b.x1 + 2 || p.pos.z < b.z0 - 2 || p.pos.z > b.z1 + 2
}

// The room's world for the feet (player.js stepFoot): its own walls and furniture, its floor at
// POCKET, and no cars (the ones in the street over it are not in the room)
const NONE = []
export function roomWorld (s) {
  const hits = []
  return {
    site: s,
    solids (x0, z0, x1, z1) {
      hits.length = 0
      for (const c of s.solids) if (c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1) hits.push(c)
      return hits
    },
    base: () => POCKET,
    get cars () {
      NONE.length = 0
      return NONE
    }
  }
}
