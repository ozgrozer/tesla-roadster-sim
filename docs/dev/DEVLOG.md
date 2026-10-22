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

## U3 (ux): one time+weather state, the scenes checked, the mix

- One state: `ENV` (sim/env.js) is the time and weather everything reads: sky, sun/hemi light, fog, exposure
  (render/daylight.js), the street lamps, windows and car beams (`city.setDark`), the wet road (wet.js), the rain
  (rain.js) and the ambience (audio/mix.js `st`). Grip has one getter: `weatherGrip()` (wet road down to 0.7 at most,
  WET_GRIP 0.3); sim/roadGrip.js multiplies it in instead of keeping its own. `weatherKind()` names the weather.
- Indoors (interiors/state.js `inside()`): the street, rain and thunder are heard through the walls (cabin lowpass
  520 Hz, outside bus 0.28; in a car 950 Hz / 0.5).
- Reduced motion dims the lightning flash to 0.3 (sky, hemi light).
- Fix (phys file, minimal): footRescue's `outOfWorld` judged the interiors' floor (POCKET, 40 m under the city) as
  fallen through the world and threw the player straight back out; it uses the walker's own world's `base()` (test).
- Scenes (headless, downtown ?spawn=96,-60,1.57, clock stopped): day 12.5, golden 17.2, sunset 18.2, night 22,
  rain 15, rain-night 21.5, fog 9, storm 16 -> /workspace/shots/v2/ux/u3-f-*.png (contact sheet u3-f-contact.png).
  No flicker or z-fighting between consecutive frames (diffs are rain streaks and the camera settling); bloom only
  on lamps, beams and the headlight pool. The yellow centre line saturates where the headlights fall (bright paint
  lit; left as is).
- Harness note for QA: with drawing off, daylight.js still "draws" the environment map every 0.25 s (a no-op), so a
  shot right after a time change shows the old sky in reflections. Set `cityView.daylight.envWas = null; envT = 0`
  before drawing.
- Mix (analysers on the buses): idle street about -31 dB RMS; storm -24 (peak -14); slow driving car bus -20 vs
  world -27; a chase with impacts peaks -1 dBFS at the mix input with the limiter (-9 dB, 12:1) holding it. Siren
  level 1.2/(1+d/28) from the nearest unit; units removed -> chase cleared -> siren silent; car voices freed when a
  car is unlisted; lanes with nothing to play disconnected; pause suspends the context. Volumes: master (outVol),
  music (musicBus), effects (mixIn) from the options.

### Hidden tokens counter (ux, for the world's hunt)

- `js/ui/tokens.js` TokenCounter listens for 'token-collected' { id, n, total, where, pos } and 'tokens-complete'
  (render/interiors/hunt.js on gta-v2-world): "◆ n/30" over the radar's clock for 4 s on a find (8 s and gold when
  all are found), under the pause menu; the hunt's n is the truth (never counts down); remembered as prefs
  'tokenCount'. The STATS tab has a "Hidden tokens n of 30" row. Test in tests/ux.test.mjs. Shots:
  /workspace/shots/v2/ux/x-token-hud.png, x-token-stats.png (events fed in by hand: the hunt is not on this branch).
