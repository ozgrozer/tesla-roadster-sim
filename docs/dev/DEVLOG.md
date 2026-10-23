# Devlog

## visuals (gta-v4-visuals) · slop-newyork techniques (A-D), no NYC/OSM data
- A: adaptive MSAA (4x/2x/off by pixel ratio, `?msaa=0`), pre-tonemap grade with per-hour white balance,
  canyon sky-light darkening + warm wall bounce, time-of-day road damp (film, pools, night mirror).
  MIT credit to Mr.doob in vendor/slop-newyork/LICENSE and one-line headers in adapted files.
- B: height fog thinning with altitude (aerialFog.js), road marks widened/faded under 1.5 px, box-filtered
  far window grid (no shimmer).
- C: key shadow 3072 over 72 m ahead of the camera; pooled night point lights (6 street + 4 shops).
- Night tweak: moon 0.26, hemi 0.2/0.3, exposure 0.96, more contrast, dimmer horizon glow.
- Follow camera: speed pull-back up to +16% (eased), on top of the speed FOV.
- D perf: shadowProxy.js (key-shadow stand-ins per 96 m cell), size-based far distances for instanced
  details (chunks.js sizeFar): -10-12% triangles, -0.5-2.5% calls (PERF.md v4).
- Fix: aerial fog locals prefixed/scoped (clashed with the crash-damage shader's `fdy`).
- Checks: npm test 337/337; playtest career and roam: no problems. Open: K25-K29.

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

## Phys round 2, part 2 (gta-v2-phys on top of integrated 6a2fefc)

- Body against body (vehicleHit.js `clash`, vehicleLink.js `car.body`): two cars each driven by a
  body (the player's against an ambient getaway driver's, say) used to pass straight through each
  other (overlap up to 3.2 m, no impact); now they collide by mass at the patch that landed, both
  dented, both told (`clash` on each body's events). A body left behind when a car changes hands is
  ignored (it must sit where its car is drawn). tests/physCrash.mjs (probe), physContact.test.mjs.
- Kerbs by the wheel (vehicleHit.js `kerbs`): each wheel up or down the kerb kicks heave, pitch and
  roll at its own corner (an angled kerb rocks the car corner by corner), climbing costs that wheel
  speed square to the kerb, and every one is heard: drivable.js now forwards the body's
  kerb/manhole events to the sim's (sound, rumble, the small shake; they were silent before).
  Manhole lids knock through the wheel that drops in. A car taken over up on the pavement no
  longer feels a phantom kerb on its first step.
- Up on the pavement (bodyGround.js `under`): a body sits a kerb up (player.js groundBase) instead
  of sinking its wheels into the slab, tilted while half on. tests/physKerb.mjs, physKerb.test.mjs.
- Progressive damage (carDamage.js `worn`): crumples that build up from knocks too soft to break
  anything on their own now take out the lamp at that corner (6 cm in; 10 cm in the middle takes
  the pair) and craze the glass over a face pushed in 16 cm, more as it goes deeper.

## Q1 integration (gta-v2: sim + world + ux + phys + qa on top of 6a2fefc)

- Merged in that order. Conflicts: DEVLOG (every stream's section kept), dist/roadster.js (rebuilt
  from the merged sources), js/sim/roadGrip.js (comment only: HEAD's "the weather's share" kept).
  vehicleLink.js `car.body = b` was added by both sim and phys, identical: kept once. footRescue.js
  (a phys file ux fixed) merged on its own.
- Playtest made deterministic (e56a5ed): hit-ped clears the traffic round the person and waits for a
  `ped-hit` *by the player* (a car of the traffic hitting them first made it "no crime"); drive-stolen
  starts from the lane beside the car with the traffic ahead cleared.
- Fixed in the integrated game:
  - Roadblocks never stood on a straight (23e12e1): policeAir.js puts a block 312-392 m on when all
    the nearer road is in the camera's sight (FAR_BLOCK, sim 8f73047), but police.js `retire` took
    any block over 260 m off away the very step it went down. Blocks now go past 460 m.
    tests/q1Integration.test.mjs (failed before, passes after).
  - Interior "camera in the wall" (ff9f0d2): footCam's never-under-the-ground clamp used the street's
    ground (y 0) in a room 40 m under the city, lifting the camera out through the ceiling (y 0.43
    over a player at -40). The clamp now only holds when the player is not under the street; the
    room's own clip (interiors/view.js) keeps the camera in. Camera now at -38.1, inside the box.
  - Optimus left standing at the Roadster's door (5e96cff): `foot.reset()` (any resetTo after getting
    out on foot) showed the model again in the pose the way out left it; now posed sat in.
- tools/playtest/q1shots.mjs: the integrated tour with checks, shots in shots/v2/qa/q1-*.png: on foot,
  the token counter after a real pickup (◆ 1/30, "the end of the pier"), The Marlowe entered by its
  door (y -40), an all-way stop junction, a 3-star chase with the roadblock across Wilshire, the
  crown at 22:00 from ~890 m (daylight `envWas = null; envT = 0` after the hour change), the map.

## gta-v3-drive: driving feel (on top of gta-v2 4634939)

- Measured first: tools/drive/metrics.mjs drives every class (Roadster + the 8 traffic kinds)
  through the real keyboard mapping on open ground and tables 0-100, 100-0, dive, steering in/out,
  lateral g, roll, turning circle, handbrake 180, J-turn, stop→reverse, power slide, lane change,
  handbrake drift and a handbrake pull at 100 km/h, dry and wet (grip 0.7). Full before/after in
  docs/dev/HANDLING.md.
- GTA handbrake for the cars: rears keep `hbGrip`, the tail swings at the class's `hbRate` and
  comes round in ~1.4 s keeping ~35 km/h (it used to stop the car dead); at speed it is a slide
  (rears' grip rises past 18 m/s); J-turns backing up (sedan 202°, was 27°; Roadster 171°, was 38°);
  spins damped once well sideways; power drifts held to ~35° of slip.
- Brakes 12-17 % shorter, quicker racks, more dive and roll (sedan 5.3° dive / 5.8° roll),
  brake key bites in 0.15 s; S at a standstill holds the brakes 0.3 s then reverses (traffic
  classes used to go straight into reverse); chase cam FOV widens with speed.
- tests/driveFeel.test.mjs (7 tests; 5 failed on gta-v2), tests/input.test.mjs updated for the
  quicker brake. Screenshots: tools/drive/shots.mjs → shots/v3/drive/d1-d4.
- Follow-ups: rain grip reaches every player car (K16 fixed): the Roadster through roadGrip.js
  `surfaceGrip` (stops 13.8 m → 19.3 m from 60 km/h in game in the rain; harness 100-0 31.0 → 41.9 m),
  the ambient events' cars through `weatherGrip()`. Hands off on the power (`handsOff`): the wet
  pickup straightens in 0.26 s at full throttle (never before; 0.35 s in game). Skid marks near
  black, fading after 45 s, read on dark asphalt; sedan dive drawn 2.1×. tests/wetGrip.test.mjs,
  driveFeel `slideOut`. Shots d5 (skid marks on asphalt), d6 (pickup rain power slide, straightened).

## V3 on foot (gta-v3-foot, from gta-v2 @4634939): doors, paces, fists, run-overs

- **Doors on every city car** (`render/carDoor.js`, `render/boardPose.js`, `sim/vehicles.js` DOORS,
  `sim/boarding.js` sideOf): the driver's door is its own panel lofted from the body's own sections
  (carBody.sectionAt: sill to belt in the body's paint material with its livery/dents attributes,
  belt to rail glass, a dark door card inside, a dark aperture where it was), hinged at the
  A-pillar, swung out eased (cubic in-out, 66° cars, 72° vans/trucks/fire/ambulance, 83° bus) and
  drawn on the car's own instance matrix (traffic.js `doorCar`/`doorMat`, 4 lines). DOORS gives each
  of the 14 kinds its door span; the bus's door is on its right (DOOR_SIDE). Optimus stands behind
  the door's back edge, hand on the handle riding the swing, steps into the opening turning to face
  ahead, ducks and sits sideways (inner foot in first, the outer leg swung over the sill), hands to
  the wheel, reaches to the door card to pull it shut; out is the reverse, and a hand pushes the door
  to if he's beside it. He stays visible until seated (the old box door and the vanish at 72% are
  gone). The Roadster keeps its own up-swinging door (intro.js).
- **Paces** (`sim/player.js` FOOT, paceOf/gaitOf; `render/optimusGait.js`): jog by default 4.5 m/s,
  Shift sprint 7, Caps Lock walk 2.0, accel 22 / decel 26 / turn 14 rad/s; strides matched to the
  swing (1.92 m per amplitude: no foot slide), knees and elbows pumping at a run.
- **Fists** (`sim/melee.js`, `sim/brawl.js`, `footFight.js`, `render/optimusFists.js`, ped shader
  guard/jab, `audio/fists.js`): F or left click (pointer locked). Jab, cross, hook combo (0.4 s
  chain window; a whiff resets), soft-lock within 4.2 m in a 1 rad cone, lunge up to 4.5 m/s (the
  swing waits up to 0.4 s for it), stomp on someone down. People stagger, get knocked down (hook or
  hp ≤ 0.3), die beaten; afterwards fight back (by profile), cower or run. Crime 'assault' (sev 1,
  once per 10 s per victim) → 1 star once rung in; a beating death is 'ped-killed' sev 1.5.
- **Run-overs** (`sim/pedBrain.js` knockDown/lie): above 12 m/s dead (8-12 a per-person chance),
  thrown up over the bonnet (up to 7.5 m/s up), tumbling, bouncing; 'ped-killed' sev 1.5 when dead
  (else 'ped-hit'). Bodies lie there, and are cleared after 45 s once the player is 35 m off.
  A thud and plastic crack on the hit.
- Help line, keys card, keymap labels, README on-foot table updated.
- Tests: `tests/fists.test.mjs` (combo, soft-aim, lunge; assault → 1 star through Reports; beaten
  death; run over dead/alive, thrown, body stays then cleared; every kind's door layout).
  Playtest `tools/playtest/careerFoot.mjs` (between career and career2): punch-ped, run-over-kill,
  every-car-door. Shots: `tools/playtest/footShots.mjs [doors|fists|runover|all] [--kinds=]`
  → /workspace/shots/v3/foot.
- Not touched: handling / vehicle physics (v3-drive's stream). Hub edits: main.js 2 lines (F/Space
  on foot to FootFight, Caps Lock command), onFoot.js (fight hookup, FootView gets cityView).

## gta-v3 integration (round 3): gta-v3-drive + gta-v3-foot → gta-v3-open-world

- Merged gta-v3-foot @0688077 onto gta-v3-drive @5e522c9; conflicts only in DEVLOG (both entries
  kept) and dist (rebuilt). npm test 337/337; playtest career (22 steps, careerFoot included:
  punch-ped, run-over-kill, every-car-door) and roam (8) no problems on port 8094, one at a time.
- Driving x on foot checked: get in/out of every kind with the new handling (careerFoot
  every-car-door, footShots doors), run-overs (pedBrain knocks down on the body's speed, so a
  handbrake slide sideways counts as much as head on), the faster brakes don't change the 12 m/s
  kill threshold (an impact speed).
- Polish: police cars take `roadGrip()` (game.js, was its own copy of the wet formula: now the
  grip hook too); a gamepad's X punches on foot (footFight: KeyH as well as F); the door's window
  its own lighter see-through glass (carDoor.js); footShots shoots the tall cabs' doors from
  further toward the nose and runs the run-over along the kerb.
- Shots /workspace/shots/v3/int/: d1-sports-handbrake-drift.png, d1-sports-skid-marks.png,
  door-sedan-open.png / -in / -out, door-fire-*, door-truck-*, punch-jab.png, punch-landing.png,
  ped-knocked-down.png, punch-wanted.png, runover-hit.png, runover-aftermath.png (2 stars),
  d7-sports-rain-night-drive.png, d7-sports-rain-night-slide.png; playtest/ for the runs.
