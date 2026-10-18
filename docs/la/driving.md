# Driving: notes

What changed in how the Roadster drives, why, and how it was checked. The README's Controls section
describes the behaviour for players.

## The complaint

"The current driving experience is not good." Measured through the keyboard as a player drives it
(`Input` and `Sim` headless, the same code the browser runs), the worst of it was turning with W
held, which is how anyone drives with keys:

| W and full A held for 2.5 s, from | before | after |
| --- | --- | --- |
| 30 km/h | sped up to 93 km/h, 102 m arc | 33 km/h, 7 m arc, 1.24 g |
| 50 km/h | sped up to 114 km/h, 146 m arc, turned 49° | 41 km/h, 9 m arc, 1.27 g, turned 139° |
| 80 km/h | sped up to 144 km/h, 195 m arc, turned 36° | 73 km/h, 31 m arc, 1.29 g, turned 80° |
| 110 km/h | sped up to 170 km/h, 245 m arc | 106 km/h, 68 m arc, 1.30 g |

Before, the car piled on speed through the corner (the motors' 1.15 MW at 1.28 g), the weight went
onto the rears and off the fronts, and the arc opened out until the car ran wide into whatever was
on the outside of the junction. Off the throttle it turned well, but nobody lifts off with keys.

## What changed, and why

- **Understeer control** (`js/sim/tyres.js`, `ground.js`). A Tesla's stability control cuts the
  motors' torque while the car understeers. Now, while the wheel asks the fronts for more than 85%
  of the slip they grip hardest at, the drive is taken away (all of it 35% further on). Full lock with
  W held corners at the tyres' limit and holds its pace; straighten the wheel and the power comes
  back. The cut eases in over 0.08 s and the power back over 0.2 s (`sim.pushF`), as the motors'
  torque is ramped: the band it works over is narrow, and slowly the keys sweep the wheel through it
  within a step, so unramped it switched the drive off and on in one step (an independent review
  measured 0.6 to 0.9 g jumps in a slalom at 15 to 50 km/h). Not in Track Mode: drifting, the driver
  has the power. `sim.push` says how much is being held back (the HUD's ESC lamp lights for it).
- **The friction circle** (`ground.js`). Traction control left the drive at least 35% of the tyres'
  grip however hard they were cornering, so the car could accelerate at nearly 0.5 g while turning at
  the limit. The drive now keeps at least 12%; the brakes keep their 35%, so a corner can always be
  braked in.
- **Tyres stiff like performance tyres** (`constants.js`). Cornering stiffness was 105 and 120 kN/rad
  per axle, so each axle peaked at about 12° of slip, and the rear tyres merely at their limit read as
  a slide (the slide logic starts at 6°): the steering then followed "the slide" instead of the
  driver. Now 175 and 200 kN/rad, about 90 to 100 kN/rad a tyre, peaking at about 7°. The car turns in
  more crisply too: at 80 km/h the yaw rate reaches 0.48 rad/s 0.2 s into a turn (0.35 before).
- **The weight shifts through the springs** (`ground.js`, `sim.dN`). The load moved between the axles
  in the same step as the acceleration that caused it, from the step before. With the understeer
  control that closed a loop one step long: full power, the fronts unload, the power is cut, the fronts
  load up, full power again, flipping every 1/120 s (a buzz at 60 Hz in the car's forces, at 150 km/h
  the front's load swinging between 7,100 and 10,900 N each step). The shift now follows the
  acceleration 0.09 s behind, as a body pitching on its springs does.
- **The throttle key eases the pedal down** (`js/ui/input.js`). W went to full power in one frame;
  now it takes 0.2 s (and comes up in 0.06 s), as a foot and the motors' torque do, so a tap in traffic
  creeps the car on and a launch doesn't jolt. W and S together still start a burnout at once.
- **Out of a slide with the electronics on** (`tyres.js`). Steering into a slide held it as deep as in
  Track Mode, so after a drift, with the opposite lock still held off the power, the car swung through
  straight and on into a slide the other way (the rears at 16°). With the electronics back, steering
  into a slide past a few degrees now only follows it round, and opposite lock is unwound as the car
  swings back towards straight (all of it once it will be there within 0.3 s), as a driver's hands do:
  the rears now peak at 11° and it settles into the turn the keys ask for.
- **Backing up** (`ground.js`). The reverse limit was a switch at 10 m/s, so the car's acceleration
  jumped between 0 and 0.5 g every couple of dozen steps while backing at full speed. The motors now
  ease off over the last 1.5 m/s before 9 m/s.
- **Clipping a kerb** (`ground.js`). The kerb was only a jolt in the springs and a sound. Now an axle
  mounting it loses 22% of its speed into it (a tyre meeting an 8 cm edge rolls over it at about 39
  degrees), at most 1.6 m/s a strike, as an impulse at the axle through the car's mass and turning
  inertia, so a wheel meeting it at an angle knocks that end of the car away from it: at 60 km/h and
  35 degrees the front axle costs 3 km/h and swings the nose 0.7 rad/s away from the kerb, and the rear
  axle swings it back; square into it, the two strikes cost about 12 km/h whatever the speed (21% at
  60 km/h, 8% at 150), a jolt rather than a wall (uncapped, the whole car lost what a wheel does, 40%
  of its speed). The kerb's normal is turned to face the axle as it comes, so the climb from the beach
  or a verge up onto the promenade strikes too (its distance runs the other way there, and the strike
  came out as nothing). Dropping off the kerb costs nothing.
- **Smaller**: `ground.js` was over the 500-line limit (630). The tyre curve and the driver's hands on
  the wheel are in `js/sim/tyres.js`, Track Mode's drifts, the handbrake's swing, the spin catch and the
  burnout in `js/sim/drift.js`, the wall ride in `js/sim/ramp.js` (out of `sim.js`). Autopilot's pure
  pursuit uses the same `steerMax` as the keys instead of its own copy of the formula.

## How it was checked

- `npm test`: every existing handling, braking, drift, burnout and Autopilot test passes unchanged,
  except the burnout input test, which now expects the throttle pedal to reach full a moment after W
  and S rather than in the first frame. New tests (`tests/handling.test.mjs`): W and full lock held at
  30, 50, 80 and 110 km/h corner at over 1.1 g without gaining more than a fifth in speed, on arcs of
  under 12, 25, 60 and 110 m, and full power comes back once the wheel is straight; and nothing
  chatters step to step (the mean second difference of the car's accelerations stays under 0.006 g)
  at full throttle, turning on the power at 50 and 150 km/h, coasting through a turn, a slalom, a
  drift and backing up, and, slowly, a slalom and a corner's exit on the power (they all fail on the
  old code, the slow slalom on the unramped understeer control too); a kerb clipped at 60 km/h and 30
  degrees costs each axle 1 to 6 km/h and knocks the nose away from it, then the tail; the climb from
  the beach onto the promenade strikes too, and square into the kerb at 100 km/h costs 5 to 15 km/h;
  and a car driven off a roof towards a taller building across a narrow alley drops into it (a roof's
  edge once held it up there for ever against the wall in front: `collide.js`, `EDGE_HOLD`).
- A step-by-step trace of each manoeuvre's accelerations, steering and the understeer control's cue,
  before and after (that is how the 60 Hz flip was found).
- In the browser at 120 Hz, a keyboard bot driving the first junction from the spawn: 90° to the right
  at 27 km/h in 1.3 s, the car leaning into it, no oscillation.
- An independent review of the changes (an agent that hadn't written them) checked the move into
  `tyres.js`, `drift.js` and `ramp.js` was exact (with the intended changes switched off, HEAD's
  `ground.js` and the new modules gave bit-identical state every step across 55 scripted and random
  runs: drifts, linking, burnouts, handbrake turns, e-brake stops, reversing) and that the e-brake stop
  is unchanged (29.8 m from 100 km/h, W held or not; 29.9 m before). It found the understeer control's
  one-step switching, the promenade climb that never struck and the square-on kerb's 40%, all fixed
  as above.

## Known issues

- Handling was tuned on numbers and a scripted driver, not by a person playing it; the constants at the
  top of `tyres.js` and `ground.js` (PUSH_0, PUSH_W, DRIVE_FLOOR, TRANSFER, UNWIND) are where to start
  if it feels off.
