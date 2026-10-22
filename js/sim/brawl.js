// People taking a beating (the player's fists: melee.js), mixed into Peds through pedBrain.js. A
// blow staggers them back (a shove and a lean, a moment with no say in it); enough of them, or the
// combo's hook, knocks them down; hit while down, or down with no health left, they don't get up
// (dead). Once they have their feet again, by who they are (living/pedProfile.js) they run, cower
// where they are, or put their fists up and fight back: closing in, a punch every second or so
// (told to the game as 'player-punched'), giving up and running once hurt or left behind. The
// first blow is an assault ('crime' 'assault'), a death 'ped-killed'; everyone round about who
// sees it runs (a threat). The dead stay lying where they fell, and are taken away a while later
// out of the player's sight. Pure: no DOM.
import { emitGame } from './gameEvents.js'

// the share of each profile (pedProfile.js TRAITS: the busy, joggers, the old, on the phone,
// tourists, locals) who fight back rather than run or cower
export const FIGHT_BACK = [0.3, 0.4, 0.02, 0.1, 0.12, 0.35]
export const BRAWL = {
  stagger: 0.5, // s reeling from a blow
  downT: [4, 7], // s down after a knockout blow (and up again)
  knockAt: 0.3, // health under which any blow knocks them down
  reach: 1.15, // m a fighter's punch lands at
  every: [0.9, 1.5], // s between a fighter's punches
  punchT: 0.32, // s a fighter's punch takes (lands at its middle)
  hurt: 0.09, // of the player's health a fighter's punch takes
  closeV: 3.2, // m/s a fighter closes in at
  giveUp: 14, // s a fight lasts before they think better of it
  leave: 16, // m: the player further than this, a fighter gives up
  bodyT: 45, // s a body lies there before it is taken away (out of sight, or the player gone off)
  bodyFar: 35, // m: and the player at least this far
  assaultEvery: 10 // s: another assault on the same person counts as a new crime after this
}
const state = new WeakMap() // person -> { hp, mode, t, next, punch, assaulted, deadT, fightT }

const drawOf = (p, k) => (p.look * 7.77 + p.i * 0.6180339887 + k * 0.1234567) % 1

export const BRAWL_MIXIN = {
  // the fight's state for p (made the first time)
  bout (p) {
    let b = state.get(p)
    if (!b) state.set(p, (b = { hp: 1, mode: '', t: 0, next: 0, punch: 0, assaulted: -1e9, deadT: 0, fightT: 0, vx: 0, vz: 0 }))
    return b
  },
  healthOf (p) {
    return state.get(p)?.hp ?? 1
  },
  // p hit by the player: hit { move: melee.js COMBO entry, dx, dz (the blow's way) }, at the time
  // now (s, the peds' clock). Returns 'stagger', 'down', 'dead' or null (already dead)
  punched (p, hit, now = this.brawlT || 0) {
    if (p.dead || p.gone) return null
    const b = this.bout(p),
      m = hit.move
    const wasDown = p.state === 'down'
    b.hp -= m.dmg * (wasDown ? 1.25 : 1)
    const pos = { x: p.x, z: p.z }
    // (the first blow, or one after a while: an assault; everyone near looks, the near ones run)
    if (now - b.assaulted > BRAWL.assaultEvery) {
      b.assaulted = now
      emitGame('crime', { type: 'assault', pos, severity: 1, id: p.i })
    }
    this.threat?.(p.x, p.z, 12, 2, 1.2)
    let what
    if (b.hp <= 0 && (wasDown || m.knock || b.hp <= -0.2)) what = 'dead'
    else if (wasDown) what = 'down'
    else if (m.knock || b.hp <= BRAWL.knockAt) what = 'down'
    else what = 'stagger'
    if (what === 'stagger') this.reel(p, b, hit)
    else this.floored(p, b, hit, what === 'dead', wasDown)
    emitGame('ped-punched', { pos, id: p.i, move: m.name, hp: b.hp, result: what })
    if (what === 'dead') {
      emitGame('ped-hit', { pos, speed: 0, severity: 3, by: 'player', id: p.i, dead: true, how: 'beaten' })
      emitGame('crime', { type: 'ped-killed', pos, severity: 1.5, id: p.i })
    }
    return what
  },
  // reeling back from a blow
  reel (p, b, hit) {
    if (p.state === 'linger') this.leave?.(p, true)
    if (p.liv) p.liv.cowerT = 0
    p.state = 'brawl'
    b.mode = 'stagger'
    b.t = 0
    b.vx = hit.dx * hit.move.push
    b.vz = hit.dz * hit.move.push
    p.yaw = Math.atan2(hit.dz, -hit.dx) // (turned to face where it came from)
    p.cross = p.aside = p.lead = null
    p.act = 0
    p.fall = 0.22
    p.fright = 1
    p.gait = 0
    p.v = 0
  },
  // knocked down (dead: for good); a blow on someone already down shoves them a little
  floored (p, b, hit, dead, wasDown) {
    if (p.state === 'linger') this.leave?.(p, true)
    const push = hit.move.push
    p.state = 'down'
    p.t = wasDown ? Math.min(p.t, 0.5) : 0
    p.vx = hit.dx * push
    p.vz = hit.dz * push
    p.hop = wasDown ? 0 : Math.min(0.6, push * 0.12)
    p.fright = 1
    p.gait = 0
    if (!wasDown) p.fall = 0.3
    p.cross = p.aside = p.lead = null
    p.act = 0
    p.yaw = Math.atan2(hit.dz, -hit.dx) // (on their back, head away from the player)
    p.downT = BRAWL.downT[0] + drawOf(p, 21) * (BRAWL.downT[1] - BRAWL.downT[0])
    p.dead = dead
    b.mode = dead ? 'dead' : 'down'
    b.t = 0
    if (dead) this.killed = (this.killed || 0) + 1
  },
  // Each step, before anyone moves (pedBrain.js think): the staggered, the fighters, and the dead.
  // foot: the player's feet on foot ({ x, z }), or null; out: the punches that landed on the player
  brawlStep (dt, foot) {
    this.brawlT = (this.brawlT || 0) + dt
    const hits = (this.brawlHits ||= [])
    hits.length = 0
    let bodies = 0
    for (const p of this.list) {
      if (p.dead) {
        bodies++
        const b = this.bout(p)
        b.deadT += dt
        continue
      }
      if (p.state !== 'brawl') continue
      const b = this.bout(p)
      b.t += dt
      if (b.mode === 'stagger') {
        p.x += b.vx * dt
        p.z += b.vz * dt
        const k = Math.exp(-dt * 6)
        b.vx *= k
        b.vz *= k
        p.fall = 0.22 * Math.max(0, 1 - b.t / BRAWL.stagger)
        this.unwall(p)
        if (b.t >= BRAWL.stagger) this.afterBlow(p, b, foot)
      } else if (b.mode === 'fight') this.fight(p, b, dt, foot, hits)
      else this.walkAway(p, foot)
    }
    if (bodies && this.brawlT - (this.bodyCheck || 0) > 1) {
      this.bodyCheck = this.brawlT
      this.clearBodies(foot || this.lastFoot)
    }
    if (foot) this.lastFoot = foot
    return hits
  },
  // up from a blow: run, cower or fight, by who they are; badly hurt, they run
  afterBlow (p, b, foot) {
    const prof = p.liv ? p.liv.prof : 0
    const fights = b.hp > 0.45 && drawOf(p, 31) < (FIGHT_BACK[prof] ?? 0.2) * 1.6
    if (foot && fights) {
      b.mode = 'fight'
      b.t = 0
      b.fightT = 0
      b.next = 0.35 + drawOf(p, 33) * 0.4
      b.punch = 0
      p.act = 3
      this.fighters = (this.fighters || 0) + 1
      return
    }
    const cowers = drawOf(p, 35) < (p.liv && this.traits ? this.traits(p).cower : 0.2) * 1.5
    if (cowers && this.cower && p.liv) {
      this.cower(p, 3 + 3 * drawOf(p, 36))
      return
    }
    this.walkAway(p, foot)
  },
  // off back to the pavement, then running (as a jacked driver does: pedBrain.js)
  walkAway (p, foot) {
    p.act = 0
    p.fall = 0
    p.jacked = true
    p.fromX = foot ? foot.x : p.x
    p.fromZ = foot ? foot.z : p.z
    this.goBack(p)
  },
  // fists up, closing in on the player, a punch now and then
  fight (p, b, dt, foot, hits) {
    b.fightT += dt
    const hp = b.hp
    if (!foot || b.fightT > BRAWL.giveUp || hp < 0.3) return this.walkAway(p, foot)
    const dx = foot.x - p.x,
      dz = foot.z - p.z,
      d = Math.hypot(dx, dz)
    if (d > BRAWL.leave) return this.walkAway(p, foot)
    p.yaw = Math.atan2(-dz, dx)
    p.fright = 0
    // (closing in to just short of reach, and circling a little)
    const want = BRAWL.reach - 0.15
    let v = 0
    if (d > want + 0.1) v = Math.min(BRAWL.closeV, (d - want) * 4)
    else if (d < want - 0.25) v = -1.2
    if (v) {
      p.x += (dx / d) * v * dt
      p.z += (dz / d) * v * dt
      this.unwall(p)
    }
    p.v = Math.abs(v)
    p.gait += ((v ? 1.1 : 0.3) - p.gait) * Math.min(1, dt * 6)
    // the punch: wound up, out at its middle (lands if the player is still in reach), back
    if (b.punch > 0) {
      const t0 = b.punch
      b.punch += dt
      const k = b.punch / BRAWL.punchT
      if (t0 < BRAWL.punchT / 2 && b.punch >= BRAWL.punchT / 2 && d < BRAWL.reach + 0.3)
        hits.push({ p, dx: dx / d, dz: dz / d, hurt: BRAWL.hurt })
      if (k >= 1) b.punch = 0
      p.act = 3 + Math.min(0.999, Math.sin(Math.PI * Math.min(1, k)))
    } else {
      p.act = 3
      if ((b.next -= dt) <= 0 && d < BRAWL.reach + 0.6) {
        b.punch = 1e-4
        b.next = BRAWL.every[0] + drawOf(p, 40 + Math.floor(b.fightT)) * (BRAWL.every[1] - BRAWL.every[0])
      }
    }
  },
  // the dead taken away a while after, where the player can't see it happen
  clearBodies (foot) {
    const before = this.list.length
    this.list = this.list.filter(p => {
      if (!p.dead) return true
      const b = state.get(p)
      if (!b || b.deadT < BRAWL.bodyT) return true
      if (foot && Math.hypot(p.x - foot.x, p.z - foot.z) < BRAWL.bodyFar) return true
      p.gone = true
      return false
    })
    this.bodiesCleared = (this.bodiesCleared || 0) + before - this.list.length
  }
}
