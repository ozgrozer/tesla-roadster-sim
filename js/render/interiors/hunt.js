// The hunt for the thirty hidden tokens (sim/tokens.js), run from the interiors' step (glue.js): on
// foot or at the wheel, within reach of one it is taken, "Hidden token 7/30 · +$100" pops up, the
// game hears 'token-collected' { id, n, total, where, pos } (the HUD's counter), the find is
// remembered between visits and the wallet paid; the thirtieth pays a bonus and says so
// ('tokens-complete').
import { player } from '../../sim/player.js'
import { emitGame } from '../../sim/gameEvents.js'
import { recall, remember } from '../../ui/prefs.js'
import {
  TOTAL,
  tokenAt,
  take,
  found,
  saveFound,
  loadFound
} from '../../sim/tokens.js'

export const REWARD = 100
export const BONUS = 2500

export class TokenHunt {
  constructor (foot) {
    this.foot = foot
    loadFound(recall('tokens', ''))
  }
  get found () {
    return found()
  }
  get total () {
    return TOTAL
  }
  step (wallet) {
    const car = player.mode === 'car'
    if (!car && player.mode !== 'foot') return null
    const t = tokenAt(player.pos, car)
    if (!t) return null
    const n = take(t)
    remember('tokens', saveFound())
    const pay = REWARD + (n === TOTAL ? BONUS : 0)
    if (wallet) {
      wallet.cash += pay
      remember('cash', String(wallet.cash))
    }
    const hud = this.foot.hud
    hud?.popup?.(`Hidden token <b>${n}/${TOTAL}</b> · +$${pay}`, 2600, 'hint')
    emitGame('token-collected', {
      id: t.id,
      n,
      total: TOTAL,
      where: t.where,
      pos: { x: t.x, y: t.y, z: t.z }
    })
    if (n === TOTAL) {
      hud?.popup?.(
        `All ${TOTAL} hidden tokens found · +$${BONUS}`,
        4000,
        'hint'
      )
      emitGame('tokens-complete', { total: TOTAL, bonus: BONUS })
    }
    return t
  }
}
