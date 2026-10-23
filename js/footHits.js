// The player on foot hit by a moving car (onFoot.js steps it): knocked over, heard, and told.
import { player, knockDown } from './sim/player.js'
import { placeOf } from './audio/mix.js'
import { emitGame } from './sim/gameEvents.js'

// A moving car into the player on foot: knocked over (foot: the OnFoot, its world's cars and sound)
export function hitByCars (foot) {
  const p = player
  if (p.down > 0) return
  for (const r of foot.world.cars) {
    const e = r.e
    if (e.speed < 4 || r.ignore) continue
    const dx = p.pos.x - r.x,
      dz = p.pos.z - r.z
    const lf = dx * r.fx + dz * r.fz,
      ls = dz * r.fx - dx * r.fz
    if (Math.abs(lf) > r.hl + 0.5 || Math.abs(ls) > r.hw + 0.5) continue
    const vx = r.fx * e.speed * Math.sign(e.car?.v ?? 1),
      vz = r.fz * e.speed * Math.sign(e.car?.v ?? 1)
    knockDown(p, vx * 0.7 + Math.sign(ls || 1) * -r.fz * 2, vz * 0.7 + Math.sign(ls || 1) * r.fx * 2)
    foot.sound.bump?.(e.speed, 'car', placeOf(p.pos.x, p.pos.z))
    emitGame('player-hit', { by: e.id, speed: e.speed, pos: { ...p.pos } })
    return
  }
}
