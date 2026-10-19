
## 2026-10-20 · phys (gta-v2-phys): P1 vehicle physics, P2 player controller

Measured first (tests/physMetrics.mjs, `node --import ./tools/node-loader/register.mjs tests/physMetrics.mjs`),
then fixed the causes:

- **Body springs blew up at a dt spike** (vehicleSim.js `body()` ran once per frame, explicit
  Euler): pitch/roll reached 1e11–1e17 rad at dt 0.5. Now `vehicleBody.js springs()`, sub-stepped
  at <= 1/120 s inside the physics loop, semi-implicit, bump stops. Pose < 0.12 rad at any dt.
- **Full lock at speed scrubbed on the sliding grip** (no feel for the limit, unlike the
  Roadster's tyres.js): the fronts are now held to `feel x` their peak slip past the kinematic
  angle. Sports 0.82 -> 1.01 g; classes in order sports > police > sedan > suv > van > truck > bus.
- **Slow spin-out on a tight steady turn** (sedan slip oscillated to 0.57 rad at 8 m/s): the
  recovery yaw torque used the CoM's slip, which is geometric in a tight turn; now the rear axle's.
- **Opposite lock excused a spin** (`rOk` used |tan steer|): a sports car flicked with the
  handbrake then floored spun 180 deg whatever the driver did; now counter-steer catches it.
- Sports/pickup stability control cuts in earlier (power-on corners ~0.3 rad, not 1.2).
- Slope gravity along/across the car (gp/gr from bodyGround.js); truck torque 900 -> 1500 N m
  (0-60 mph 37 s -> 18 s); sedan brake 9 -> 9.6 m/s^2; more visible roll/pitch on sedan/sports/police.
- Rain: `js/sim/roadGrip.js roadGrip()` (ENV.wet/rain, x `GRIP.scale` hook via `setGripScale`),
  passed by drivable.js as `world.grip`.
- The player's car is tougher (`PLAYER_TOUGH` 0.35 of the harm, carDamage.js `hurt(..., tough)`),
  keeps more power when hurt (limp loss x0.6), and a crumpled front corner pulls the wheel a touch.
  A 58 km/h wall hit: traffic car wrecked, player's car dented, steaming, drivable. The HUD health
  for a city car follows its harm (game.js).
- Reduced motion: `js/render/motionPref.js` (prefers-reduced-motion, or `setReducedMotion(on)` —
  for the settings menu to call; remembered as `roadster.reducedMotion`) scales camera shake and the
  road tremble to 25%.

On foot:
- stepFoot sub-steps long frames (no walking through a thin wall at dt 0.5); the drawn body eases
  up a step (`player.lift`, footView.js) instead of popping.
- `js/sim/footRescue.js`: inside a solid > 0.5 s -> nearest free spot (or pavement); NaN / fallen
  through / off the map -> nearest pavement walking line (pavement.js), else the last safe spot.
  Walking into a wall is not "stuck".
- Foot camera: fat-ray clip (5 rays) so a wall alongside can't slice the view, eased back out, never
  below the ground.
- Boarding in tight spots: driver's door against a wall -> in by the other side (`a.side = -1`,
  footView poses that side); out onto any free spot round the car reachable in a straight line,
  else onto its roof.

Tests: tests/phys.test.mjs (12). Shots: /workspace/shots/v2/phys/ (tools/phys/shots.mjs, port 8094).
