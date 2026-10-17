# Driving: notes

What changed in how the Roadster drives, looks while it drives, and how it is filmed, and how each
change was checked. The README's Controls section describes the behaviour for players.

## What changed, and why

- **Follow camera** (`js/render/follow.js`, split out of `camera.js`). It sat 8.5 m back and let
  out another 4 m with speed, and its target chased the car from behind (an exponential lag of a few
  metres more at speed), so at 100 km/h the car was a small shape far down the screen. The arm is now
  6.3 m behind and a little above (opening out at most 1.7 m with speed), the target is carried
  along with the car's velocity before it is smoothed (so only jolts are smoothed, in the sim's own
  time, so slow motion doesn't run it ahead), the aim looks up to 2.4 m down the road at speed (on
  the ground, the way the car is going), the field of view widens less with speed, and it swings
  round faster (3.4 rad/s). A burnout or a donut is watched from where the camera stands.
- **Steering keys** (`js/ui/input.js`). The time to full lock grew with speed without limit (0.71 s
  at 200 km/h); it now stops growing past 35 m/s, and grows a little slower (0.32 s at 100 km/h).
  A tap at 100 km/h is still a small correction (the input test checks it).
- **Handbrake turns** (`js/sim/ground.js`). Pulled with the wheel turned, the rears now step out at
  once: a yaw moment of up to 7 kN m, going forwards only, fading as the car comes round from the
  way it is travelling. Measured on open ground (`harness/drive/metrics.mjs`): at 50 km/h a 0.8 s
  pull turns the car 90 degrees (71 before), at 60 km/h a 0.5 s tap about 90 degrees and on the
  power it drives off that way; held for 1.5 s at 80 km/h it ends in a 180 (it span 305 degrees
  before the review's fix).
- **Spin catch** (`ground.js`). Off the handbrake, a car turning faster than its tyres could carry
  it (its grip over its speed, or what the wheel asks for, plus 0.35 rad/s) is eased back by up to
  13 kN m, so a handbrake turn stops swinging soon after Space is let go. Track Mode drifts are
  untouched (they still reach about 52 degrees).
- **Burnouts and donuts** (`ground.js`, `input.js`, `sim.js`). W and S together under 6 m/s: the
  fronts hold the car on their brakes, the rears spin (smoke, squeal, wheels spinning, motors loaded,
  brake lights on, tail squatting); steered, a yaw-rate servo swings the rears round the fronts at up
  to 2.6 rad/s while the car creeps forward: a donut. Each full turn scores (up to four times the
  base). Letting go of S leaves on spinning rears in Track Mode. Exposed for the other systems:
  `sim.burning`, `sim.burnSpin` (m/s of tread past the road), `sim.rearSpin` (0 to 1, also in Track
  Mode).
- **Body pitch** (`js/render/roadster.js`). The pitch had the wrong sign: the nose rose under
  braking and dipped under power. It now dives about 2.5 degrees under full braking and squats as
  it launches; roll is about 4 degrees at the tyres' limit; the springs settle with a touch of
  overshoot.
- **Dents** (`js/render/damage.js`, with `carFrame` in `js/sim/collide.js`). Every bump event now
  carries where it landed, in the world and in the car's frame at that moment. Knocks over 2.5 m/s
  push the lofted panels in round that point (deeper and wider with the hit, roughness hashed from
  whole millimetres so shared corners move alike, faceted shading on the crumpled triangles, the
  glass carried along); a crash dents whichever side it lands on (or the nose, for one still
  upright). A reset or the demo restarting repairs it.
- **Draw calls** (`js/render/freeze.js`). The Roadster was about 230 meshes, each drawn in the main
  pass and again into the shadow map. Everything on its body that never moves on its own is baked
  into one buffer per material (and per shadow setting), and so are each fan's and each wheel's
  pieces; the cabin and the seated driver no longer cast shadows (their shadow falls inside the
  car's). About 110 meshes remain; at the spawn point the main pass went from 271 to 148 calls, the
  car looking the same (pixel diff).
- **Smaller**: the page survives a frame that forbids gamepads or changing the address (both threw
  before), says to click into a framed page before the keys work, and `main.js` keeps under 500
  lines (one `step()` for the loop and the debug hook).

## How it was checked

- `npm test`: the existing handling tests all still pass unchanged (the handbrake's swing was tuned
  to stay inside them), plus new ones for burnouts, donuts and their scoring, and for W+S at a crawl
  versus at speed.
- `harness/drive/metrics.mjs` and `hb.mjs` (outside the repo): step steer at five speeds, taps,
  handbrake turns at several speeds and lengths, braking and acceleration, before and after.
- Headless Chromium, frames stepped by hand at fixed times (`film.mjs`, `poses.mjs`): drift
  sequences, burnouts, the camera at speed, dents before and after, night, the test site.
- An independent review of the diff (by an agent that hadn't written it) found eleven issues, all
  fixed: the handbrake swing reviving once the car went backwards, cracks along the door shut
  lines, glass not moving with dents, the camera running ahead in slow motion, dents misplaced in
  the air, dents surviving a demo restart, and a few smaller ones.

## Known issues

- The shut-line seams and small trim pieces don't move with a dent.
- Handling was tuned by measurement and filmed frames, not by playing it at full frame rate: the
  numbers above are where to start if any of it feels off.
