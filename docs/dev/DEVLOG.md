# Devlog

## world (gta-v2-world) · W1 enterable interiors
- `js/sim/interiors/` (rooms.js templates, sites.js placement on existing buildings by footprint, state.js
  door offers + fade state machine + room world for the feet, modshop.js prices/colours) and
  `js/render/interiors/` (rooms.js baked-light room meshes, doors.js exterior doors/signs/markers, view.js,
  glue.js). Hooks: onFoot.js (step/offer/interact, 4 lines), game.js (wallet + damage, 1 line),
  render/city.js (build, night, light override, camera clip).
- Sites: Night Owl Mart (Mid-City gas station shop, -343,-416), Taqueria Sunrise (diner, -315,-403),
  Redline Body & Paint (workshop + drive-in bay on the street at -6,-140: E = repair & respray $150),
  The Marlowe (apartment lobby next to the spawn on Wilshire, -791,-395).
- Rooms are pockets 40 m under their door (player.pos.y = -40 inside, x/z = the shop's), with their
  own colliders (never in the city grid), no cars, the camera clamped to the walls, rain hidden.
  Entering is refused while wanted. A reset/respawn that moves the player lets the room go.
- Events: `interior-entered` {id, kind, name, pos}, `interior-exited` {id, pos},
  `car-resprayed` {site, vehicle, colour, price, wanted} (police may clear stars on it).
- No RNG draws added (sites found by building footprint). +4 draw calls city-wide (doors).

## ux (gta-v2-ux) — U1 pause menu, settings, remapping, accessibility
- Pause menu gains a STATS tab (missions passed, record: time, distance driven/walked, cars stolen,
  crimes, people hit, crashes, most stars, busted/wasted, cash; persisted as `roadster.stats`).
- SETTINGS: master/music/effects volume, subtitles (sound captions), large text, HUD colours
  (red-green / blue-yellow safe), motion (reduced: no speed blur, less shake), look sensitivity,
  invert look, shadows on/off, resolution (pixel ratio), draw distance. One store: `js/ui/options.js`
  (`OPTS`, `setOption`, `onOption`, `look()`, `shakeScale()`), persisted as `roadster.opt.*`.
- CONTROLS: keyboard remapping card (`js/ui/keymap.js` pure + `js/ui/remap.js` listener that
  translates the pressed key into the game's default code ahead of every listener; swaps on
  conflict; persisted as `roadster.keys`). Gamepad map shown.
- Onboarding hints (`js/ui/onboard.js`): first time on foot, in a non-Roadster car, wanted, rain,
  and "Esc pauses"; only when the help box is idle; persisted `roadster.hintsSeen`.
- Audio buses: `space.js` gains `musicBus` (radio, straight into the master) and `outVol` (after the
  limiter); `mixIn` gain is the effects level. `mix.js setVolumes(sound, OPTS)`.
- Hub edits (one line each): main.js `menu.game = game`, `menu.frame(dt, city)`; onFoot.js mouse look
  goes through `look()`.
- COORDINATION (phys): phys has `render/motionPref.js` + camera.js shake scaling. I did NOT touch
  camera.js. options.js writes the same `reducedMotion` key, so motionPref picks the choice up on
  the next load. After merge, add to ui/ux.js: `import { setReducedMotion } from
  '../render/motionPref.js'` and in its onOption: `if (k === 'motion') setReducedMotion(OPTS.motion
  === 'reduced')` for a live switch.

## ux — U2 maps
- `js/sim/poi.js`: places for the maps (gas stations from canopies, car parks from lots.js GARAGES —
  now exported —, hospitals and police stations from missions/spots.js). **World stream: call
  `addPoi({ id, kind: 'shop'|'interior'|..., x, z, name })` for each enterable interior/shop door.**
- `ui/poiMap.js` draws them (rounded squares, glyphs) on the radar (in view only) and the pause map.
- `crimeMap.js` listens for `'police-search' { pos, radius, ttl? }` (radius 0 / no pos ends it); it
  wins over game.js's own search circle while fresh (20 s default) and absence is fine.


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

## Integration 1 (qa): gta-v2 = qa + sim + world + ux + phys

- Merge conflicts: dist/roadster.js (rebuilt), js/render/city.js imports (kept qa's streamed/stream/streamAll/streamBack
  and world's InteriorView), docs/dev/DEVLOG.md (add/add: both sections kept). The hubs merged cleanly.
- Integration edits: interiors on the maps (sim/poi.js from interiors/sites.js); the reduced-motion option switched live
  (ui/ux.js -> motionPref.js); main.js back under 500 lines.
- Breakage fixed: the page did not boot, because tools/build.mjs left `import { STEP } from './roofs.js' // ...`
  (world's sim/variety.js) unbundled. The bundler now takes a trailing comment, and any import it leaves over fails the
  build (tests/build.test.mjs).
  damage.test took a street performer (sim's living/pedLife.js spawns them even with count 0) for the wreck's driver.
  ux.test's shop count now counts on top of the interiors' own shops.
- npm test 291/291; playtest career and roam: no problems. Shots: /workspace/shots/v2/qa/integrated-*.png.

## sim (gta-v2-sim) · S1 traffic, S2 pedestrians, S3 police
- S1: freeway lane changes (laneChangeFwy.js: overtake, keep right, merge, exit lane, make way, pull
  round stopped cars, signals, gap checks, letting cars in); all-way stops at 21 quiet junctions
  (trafficStop.js, flashing red); stuck watchdog (trafficStuck.js: reroute, edge out, despawn unseen).
- S2 (js/sim/living/): profiles by district/hour (commuter, jogger, tourist, phone, loiterer,
  worker); crime witnesses run/cower/watch and one phones the police (call cut if they go down or
  the player comes at them); street performers with a capped, timed audience (none on empty streets,
  the integrator's note); near-miss startles; stuck recovery.
- S3: wantedReports.js (police see it: at once; else a ped's call or a driver's after 7 s; none if
  the caller is stopped); stars decay one at a time; 'police-search' {pos, radius, stars} (radius 0
  at the end); description lost when changing car unseen (sight 0.4x, cooldown 1.6x faster);
  ramming from 4 stars; roadblocks never placed in view. Pinned police/wanted tests updated deliberately.
- Tests: tests/simTraffic2, simPeds2, simPolice2. Shots: /workspace/shots/v2/sim/ (tools/sim/shots.mjs).

### sim follow-ups (gta-v2-sim)

- The Roadster now meets a traffic car that another body drives (`car.body`, as phys ff1206d) and shares the overlap and impulse by mass (wrecks.js `clashBody`); police cars part by mass too (police.js `bodies`). tests/simContact.test.mjs.
- busted-on-foot flake, root cause: a unit not driving direct applied its arrest stop distance to its own route look-ahead, so it braked short of it and stalled (~20 m off); now it eases with a 6 m/s floor. A unit that gets no nearer in 4 s backs off and goes round by the lanes for 12 s (the Wilshire median).
- 'police-search' no longer flickers: once searching, 1.5 s of sustained sight (`REACQUIRE`) ends it; glimpses don't. Stars decay 3→2→1→0 headlessly.
- roadster-boost-fly is a position flake in the playtest itself: it drives 1.5 s blind toward the city centre from wherever the Roadster was left; from (-274.5, 590.5) it runs into a queue of ordinary traffic and stops, on gta-v2 6a2fefc as well.
