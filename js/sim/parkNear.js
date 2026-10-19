// The car parks and driveways round the player filled as full as each asks (STALLS' fill): the
// suburbs' driveways, the industrial staff lots, the strip malls' and the freeway corridor's car
// parks. The 267 parked cars the city deals at the start (plots.js parkCars) are spread over all of
// its thousands of spaces, so these few hundred metres round the player get their share on top:
// whether a space is full is fixed by the space (the same each time it is passed), filled out of
// sight as the player comes, emptied again out of sight once they are gone. Own random numbers,
// so the drivers' stay as they were. A mixin on Traffic (traffic.js).
import { STALLS, rng } from './city.js'
import { districtAt } from './world.js'

const FILL_R = 150, // m round the player: filled
  DROP_R = 210, // and emptied again beyond this
  MAX = 70, // cars at most
  EVERY = 1 // s between looks
const KINDS = new Set(['suburb', 'industrial', 'strip', 'corridor'])
let ZONE = null // the spaces in those districts, each with its fixed fullness (made on first use)
function zone () {
  if (ZONE) return ZONE
  const h = rng(60617)
  ZONE = []
  for (const st of STALLS) {
    const full = h() < Math.min(0.8, st.fill * 1.1)
    if (full && KINDS.has(districtAt(st.x, st.z).kind)) ZONE.push(st)
  }
  return ZONE
}

export const PARKNEAR = {
  // (x, z): the player; all: at a reset, every space at once, seen or not
  parkNear (x, z, view, all = false) {
    if (!this.near || all) {
      this.near = []
      this.nearT = 0
      this.nearR = rng(27191)
      for (const st of zone()) st.near = null
    }
    this.nearT -= all ? EVERY : 0.25
    if (this.nearT > 0) return
    this.nearT = EVERY
    // emptied: the ones left far behind, out of sight, not knocked about nor taken
    for (let i = this.near.length - 1; i >= 0; i--) {
      const c = this.near[i]
      const k = this.cars.indexOf(c)
      if (k < 0 || c.ctl || c.abandoned || !c.parked) {
        this.near.splice(i, 1)
        if (k < 0) c.st.near = null
        continue
      }
      if (
        c.loose ||
        Math.hypot(c.x - x, c.z - z) < DROP_R ||
        this.inView(c.x, c.z, view)
      )
        continue
      this.remove(k)
      c.st.near = null
      this.near.splice(i, 1)
    }
    if (this.near.length >= MAX) return
    for (const st of zone()) {
      if (st.taken || st.near || this.used?.has(st)) continue
      const d = Math.hypot(st.x - x, st.z - z)
      if (d > FILL_R || (!all && (d < 40 || this.inView(st.x, st.z, view))))
        continue
      if (
        this.cars.some(
          c => c.parked && Math.abs(c.x - st.x) < 1 && Math.abs(c.z - st.z) < 1
        )
      )
        continue
      const car = this.park(
        st,
        this.nearR,
        this.lotPick(this.nearR, st.x, st.z)
      )
      car.st = st
      st.near = car
      this.near.push(car)
      if (this.near.length >= MAX) return
    }
  }
}
