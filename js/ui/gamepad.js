// A gamepad, any with the standard layout (Xbox, PlayStation and most others): the left stick steers
// (and in the air pitches and rolls), the triggers are an analog throttle and brake, the right stick
// looks round the car (and yaws it in the air), and the buttons press the keys they stand for, so
// they do everything the keys do. It rumbles for knocks, kerbs, landings and crashes, and buzzes
// with the tyres near their grip and past it, the rears spinning and the ground rough (input.js).
//
// GTA V's Xbox layout (the same buttons on a PlayStation pad: A cross, B circle, X square, Y triangle):
//   in a vehicle: RT accelerate · LT brake, reverse · RB handbrake · A Roadster boost · Y exit
//     L3 (left stick in) horn · R3 look behind (held) · LB radio next · D-pad left radio previous
//     D-pad right headlights · D-pad down expanded radar · View camera · Menu pause
//   on foot: left stick move · right stick look · A sprint · X jump · B melee · Y enter a vehicle
//     L3 interact · View camera · Menu pause
// (D-pad up is the Roadster's fly, with the stunt keys on: debug.js)
export const BUTTONS = {
  0: 'ShiftLeft', // A: sprint · boost
  1: 'KeyR', // B: melee · reset a wreck
  2: 'Space', // X: jump (and the handbrake)
  3: 'KeyF', // Y: enter, exit
  4: 'Period', // LB: the radio's next station
  5: 'Space', // RB: handbrake
  8: 'KeyV', // View: camera
  9: 'PadStart', // Menu: pause (main.js COMMANDS)
  10: 'KeyE', // L3: horn · interact
  11: 'KeyC', // R3: look behind
  12: 'KeyG', // D-pad up: fly (stunt keys)
  13: 'KeyZ', // D-pad down: expanded radar
  14: 'Comma', // D-pad left: the radio's previous station
  15: 'KeyH' // D-pad right: headlights
}
const DEAD = 0.12
const FEEL_MS = 150 // the tyres' and the road's buzz lasts this long each time it is set
// a stick's axis past its dead zone, rescaled to 0..1 and eased in, for fine control near the centre
const axis = v => {
  const a = Math.abs(v)
  if (a < DEAD) return 0
  const u = (a - DEAD) / (1 - DEAD)
  return Math.sign(v) * u * (0.4 + 0.6 * u)
}

export class Pad {
  // press(code) and release(code): what pressing a key would do; onConnect(name): a pad is here
  constructor ({ press, release, onConnect }) {
    Object.assign(this, { press, release, onConnect })
    this.index = -1
    this.down = new Set()
    this.steer = this.throttle = this.brake = 0
    this.stickX = this.stickY = this.lookX = this.lookY = 0
    this.active = false // the analog controls are in use
    this.usedAt = -Infinity // (and when it was last touched: performance.now(), ms)
    window.addEventListener('gamepadconnected', e => {
      if (e.gamepad.mapping === 'standard') this.onConnect?.(e.gamepad.id)
    })
  }
  get () {
    // (a page in a frame the gamepads aren't allowed into gets none, rather than an error)
    let pads = []
    try {
      pads = navigator.getGamepads?.() || []
    } catch {}
    const p = pads[this.index]
    if (p?.connected) return p
    this.index = -1
    for (const q of pads)
      if (q?.connected && q.mapping === 'standard') {
        this.index = q.index
        return q
      }
    return null
  }
  // once a frame: read the sticks and triggers, and press or release the buttons' keys
  poll () {
    const p = this.get()
    if (!p) {
      for (const code of this.down) this.release(code)
      this.down.clear()
      this.active = false
      return
    }
    const b = p.buttons
    this.stickX = axis(p.axes[0])
    this.stickY = axis(p.axes[1])
    this.lookX = axis(p.axes[2])
    this.lookY = axis(p.axes[3])
    this.throttle = b[7]?.value || 0
    this.brake = b[6]?.value || 0
    this.steer = -this.stickX
    const on =
      this.throttle > 0.05 || this.brake > 0.05 || Math.abs(this.stickX) > 0.05
    // the first touch of the sticks or triggers takes the wheel, like a drive key
    if (on && !this.active) this.press('Pad')
    this.active = on
    if (on) this.usedAt = performance.now()
    // (X and RB both press Space: the key is up once neither is held)
    const want = this.want || (this.want = new Set())
    want.clear()
    for (const [i, code] of Object.entries(BUTTONS)) {
      if (!b[i]?.pressed) continue
      this.usedAt = performance.now()
      want.add(code)
    }
    for (const code of want)
      if (!this.down.has(code)) {
        this.down.add(code)
        this.press(code)
      }
    for (const code of this.down)
      if (!want.has(code)) {
        this.down.delete(code)
        this.release(code)
      }
  }
  // strong: the big low motor, weak: the small fast one (0..1), for ms (a knock, a kerb, a crash)
  rumble (strong, weak, ms = 120) {
    this.busy = performance.now() + ms
    this.play(strong, weak, ms)
  }
  // the tyres' and the road's feel (input.js), set again a few times a second while it lasts, and
  // the buzz of Botts' dots (events.js): it waits for a knock's rumble to finish rather than
  // cutting it short
  feel (strong, weak, ms = FEEL_MS) {
    if (strong + weak < 0.01 || performance.now() < (this.busy || 0)) return
    this.play(strong, weak, ms)
  }
  play (strong, weak, ms) {
    const p = this.index >= 0 ? this.get() : null
    p?.vibrationActuator
      ?.playEffect?.('dual-rumble', {
        duration: ms,
        strongMagnitude: Math.min(1, strong),
        weakMagnitude: Math.min(1, weak)
      })
      .catch?.(() => {})
  }
}
