// GTA-style grip for every car on vehicleSim.js's stack (the player's, the police's, the street
// events'): the tyres hold more across the road than along it (lat: arcade cornering, ~1.2-1.4 g in
// a sedan rather than a real one's 0.9), and the driven front wheels never spend all their grip on
// the throttle while the wheel is turned (traction control favouring the turn). Without that last
// one, W + A in a front-driven car (a sedan, a taxi, a hatch: most of the traffic) in first or
// second gear put the whole front grip into the drive and left none to steer with (the friction
// circle): 5 degrees of turn in a second at 30 km/h, the "I can't turn left or right" of v4.
// Pure maths: no DOM.

export const ARCADE = {
  lat: 1.3, // the tyres' grip across the road over their grip along it (a class's latGrip)
  reserve: 0.6, // the share of a steered axle's grip the drive gives up at full lock
  slip: 0.12, // rad of body slip that switches the yaw assist off
  yaw: 6 // 1/s: how fast the yaw rate is pulled to the wheel's (a class's yawK: yawAssist)
}

// the side force a tyre pushing Fx along has left, of Fmax along and Flat across (the friction
// ellipse)
export function latLeft (Fx, Fmax, Flat) {
  const k = Fx / Math.max(Fmax, 1)
  return Flat * Math.sqrt(Math.max(0, 1 - k * k))
}

// the drive Fx (N, forwards) on the steered axle with the wheel at steer (-1 to 1): held under
// what leaves the tyres room to turn
export function steerDrive (Fx, Fmax, steer) {
  if (Fx <= 0) return Fx
  const cap = Fmax * (1 - ARCADE.reserve * Math.min(1, Math.abs(steer)))
  return Fx > cap ? cap : Fx
}

// The turn-in, GTA-quick: the yaw rate pulled towards what the steered wheels ask for (the car's
// kinematic rate, u tan(steer) / wheelbase, held to what the grip can carry round at this speed)
// at ARCADE.yaw per s, so the nose answers the wheel within a few hundredths of a second instead of
// waiting on the body's inertia; gone by ARCADE.slip of body slip, so it can only point the car,
// never slide it (a drift, a handbrake turn, a spin are the tyres' own), and backing up.
// Returns the yaw moment (N m) to add.
export function yawAssist (b, S, u, r, grip, beta) {
  if (u < 1) return 0
  const want = (u * Math.tan(b.steerAng)) / S.wb,
    cap = (0.85 * grip) / Math.max(u, 3),
    k = (S.yawK ?? ARCADE.yaw) * Math.max(0, 1 - Math.abs(beta) / ARCADE.slip) * Math.min(1, (u - 1) / 3)
  const tgt = want > cap ? cap : want < -cap ? -cap : want
  return b.I * k * (tgt - r)
}
