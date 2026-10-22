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

## World W2 + W3 (gta-v2-world)

W2, visual variety (241cb14, sim/variety.js + render/cityVariety.js, rng 20261020): district palettes and awnings,
balconies, rooftop tanks/terraces/solar/saw-tooth/gardens, and three landmarks seen from across the city: The Meridian
(Downtown's tallest, a stepped crown whose rings change colour after dark), the radio masts on the highest peak (red and
white, blinking), and the lighthouse on the north groyne (its beam turning at night). About 5 extra draws.

W3, explorables (72150f3, 8dd285f, aab6f35):
- sim/extras.js (rng 20261022): 75 alleys found in the existing gaps between buildings (2.6-8 m wide, open to the pavement,
  away from interior doors), so the seeded layout does not move. They hold dumpsters/bins, crates, trash bags, a lamp over
  a back door, fire escapes with solid landings, and lights strung across. Street furniture goes between the kerb lamps
  (newspaper boxes, parking meters, mailboxes), and the lookout and promenade get benches and coin telescopes. Every
  solid is drawn and goes in through city.js addCollider.
- sim/tokens.js (rng 20261023): 30 hidden tokens. There is one in each interior, plus the lookout, the pier's end, the
  beach, the lighthouse, the masts, the observatory, the tunnel, under the freeway, the roofs of the three multi-storey
  car parks (they already existed, so no new structure), the parks, the far ends of alleys and two low roofs. Picked up on
  foot (1.4 m) or in the car (3.2 m). render/interiors/hunt.js pays $100 each and a $2500 bonus for all 30, pops up
  "Hidden token n/30", emits 'token-collected' { id, n, total, where, pos } for the HUD and 'tokens-complete', and
  remembers the finds in localStorage ('tokens').
- render/cityExtras.js: merged per 576 m cell and streamed as the district meshes are, plus one glow mesh.
  render/cityTokens.js: two instanced meshes.
- tests/extras.test.mjs (6): mouths of the alleys open, nothing on the road or on the 3 pavement walking lines, interior
  doors clear, every solid drawn, all 30 tokens clear to reach, pick-up/save/load. npm test 297/297.
- Draw calls (whole composer frame, same cameras), before variety / after variety / integrated head 6a2fefc / W3:
  santamonica 444/451/428/442, hollywood 393/395/393/409, midcity 487/481/469/482, downtown 463/469/461/474,
  arts 365/379/368/387, skyline 629/710/543/562, hills 364/367/-/379. W3 adds about 13-19 over head.
- Shots: /workspace/shots/v2/world/shot-w2-*.png (landmarks from a distance), shot-w3-*.png (alleys, furniture,
  lookout, token).

## World follow-ups: crown, all-way stop signs, fire escapes

- The Meridian's crown: the bands now cover most of each step, with light fins on the corners. After dark they slowly cycle
  through fully saturated hues at a brightness the tone mapping keeps in colour. They read from 500 m
  (shot v2f3-f-crown-far-se-night.png).
- All-way stops (sim/trafficStop.js STOPS, 21 junctions):
  - sim/stopSigns.js puts a STOP octagon at the near-right corner of every approach, 1.9 m before the line and 0.75 m in
    from the kerb. Each is on a breakaway post (breakAt 4 m/s), and a knocked sign is not drawn until the city is reset.
  - "STOP" is painted in each lane before the existing stop line.
  - render/cityStopSigns.js draws all of it as 3 instanced meshes.
  - tests/stopSigns.test.mjs: every approach has a sign; signs are off the road and off the walking lines, clear of other
    colliders, and face the drivers.
- Fire escapes: they now start 2.5-6.5 m from the alley mouth, and go only on walls without a shop canopy (the canopy hid
  them). The random draws are unchanged, so the alleys and tokens stay where they were. They have open railings, brackets,
  a drop ladder and a lit window per landing (43 -> 28 escapes).
- npm test 299/299. Shots: v2f-f-stop-approach.png, v2f-f-stop-junction(-night).png, v2f2-f-alley-escape(-night).png.
