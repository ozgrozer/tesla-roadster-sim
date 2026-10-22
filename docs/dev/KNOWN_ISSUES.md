# Known issues

Owner tags: **[qa]** integrator/QA/perf, **[sim]** traffic/peds/police, **[world]** city/buildings/
interiors, **[ux]** UI/menus/weather/day-night/audio/VFX, **[phys]** vehicle physics/damage, player
controller/camera. Status: open / fixed (commit) / wontfix. Anyone may append.

## Fixed in gta-v2-qa (round 2)

| # | Issue | Owner | Status |
| --- | --- | --- | --- |
| K1 | The car's name ("STOLEN · SERVICE / Taxi") stayed up bottom right under BUSTED / WASTED, and after getting out of the car (ui/place.js only lets it time out: 3.2 s of real time) | [qa] hubs | fixed 372d5e8 (`js/carName.js dropCarName` from `game.fall` and `onFoot.exit`) |
| K2 | Carjacked driver popped out at the car's middle 0.5 m from its side, on top of the player at the door: `pedBrain.keepFrom` shoved them 0.75 m off the player in one step (the "teleport backwards"), then walked off at full pace with no reaction, and snapped 90° into the flee | [qa] | fixed 372d5e8 (`sim/alight.js haul`: out of the seat by the door, thrown back along the car onto the ground with an eased slide, 1.1 s down, up and away; `render/peds.js` eases turns and getting up) |
| K3 | The city's sun-shadow refresh (about once a second at the clock's pace, `daylight.js` aim) drew the whole scene into a 1 px target to get its shadow map drawn: ~800 wasted draw calls, and `streamAll()` left every far district visible for that frame's own view as well: refresh frames 1300-1400 calls / 5.8-6.5 M triangles against 560 / 2.5 M | [qa] | fixed 8f148b2 + next (`sunShadow.js` lets only the shadow maps' draws through; `chunks.js streamBack`) |
| K4 | Mission start markers drawn city-wide: 10 markers x 3 meshes = 30 draw calls from anywhere | [qa] | fixed 8f148b2 (`crimeView.js MARKER_FAR` 450 m; radar/map still show them) |
| K5 | No draw distance in clear weather: districts are only streamed out past the fog's reach (2.2 km at density 0.001), which is past the whole 2 km city; at the spawn, 30 calls each for ledges, palms and trees across the city | [qa] | fixed 8f148b2 (`chunks.js DETAIL_FAR`: cornices 520 m, trees/date palms 900 m, fan palms 1150 m) |
| K6 | `npm test` 3 failures `navigator is not defined` (Node 20 has no `navigator`) | [qa] | fixed (tests set `globalThis.navigator ??= {}`) |

## Open

| # | Issue | Owner | Notes |
| --- | --- | --- | --- |
| K7 | "Draw-call growth after spawn" is mostly the camera: the intro camera (fov 39.6, close) eases to the follow camera (fov 55, behind) over ~3 s, so the frustum takes in more of the city: 357 -> 560 calls before the fixes, 351 -> 478 after. Not a leak (geometries 401 -> 445 then flat over 40 s; programs 259 -> 263) | [qa] | documented; first-frame numbers in old reports (381) were taken under the intro camera |
| K8 | Getting knocked down (or jacked) and getting up: the sim snaps `fall` from 1 to 0 (`pedBrain.lie`) and the state from 'down' to 'back' in one step; the renderer now eases it (RISE 7/s) but the body still slides off at 2.6 m/s while half up | [sim] | a short 'rise' phase in pedBrain.lie (0.4 s, no motion) would finish it |
| K9 | Weather popup said "Clear · O for the next" while the HUD clock showed rain and the pause map header said RAIN (career night-rain step, after L then O) | [ux] | climate.js nextWeather popup vs ENV state: check which is announced |
| K10 | Rain at night barely reads: no visible streaks in the 22:02 rain screenshot, the asphalt looks dry (shots/v2/qa/base/14-night-rain.png) | [ux] | U3 |
| K11 | Ambient street events (`sim/ambient.js start`): one-off 30 ms spikes in the step that starts one (spawnPoint + make cars + a police unit), seen as `ambient.step max 31.8 ms` | [sim] | spread the setup over a few steps or precompute spawn points |
| K12 | Traffic is ~400-460 cars (parked included) and 240 people simulated whatever the view; `traffic.step` 0.14 ms and `peds.step` 0.12 ms a 1/120 s step on this box (loaded) | [sim] | far-off traffic could step at 1/4 rate like the peds' LOD (peds.js lod) |
| K13 | The city still has ~97 unnamed `MeshStandardMaterial` meshes drawn every frame at the spawn (no name: hard to account for in the perf tally) | [world] [qa] | name meshes when built (`mesh.name`) so `tools/playtest/spawn.mjs` can attribute them |
| K14 | The playtest's `advance()` runs the game in fast-forward while the rAF loop also runs in real time, so the HUD (3.2 s car name, popups) and anything timed by real frames lags the game clock in headless runs; samples taken across several `page.evaluate` calls get real-time steps in between | [qa] | trace inside one evaluate (tools/playtest/jack.mjs does) |
| K15 | Headless draws use swiftshader at ~1 s a frame on this shared box (load 15-22 on 8 cores): every per-frame ms in PERF.md is relative, compare before/after from the same run conditions only | [qa] | |
| K16 | Rain grip only for the police: `game.js` works out `grip = 1 - 0.3 * max(ENV.wet, 0.6 * ENV.rain)` and passes it to `police.step`, but the player's city car (`sim/drivable.js step`: `stepVehicle(b, inp, dt, { city: true, t })`, no `grip`) and the ambient events' cars (`ambient.js`) drive on dry grip in the rain; the Roadster's `sim.js` has no wet term at all. Also `drivable.step` allocates its world object every 1/120 s step | [ux] U3 + [phys] P1 | one shared `wetGrip()` (env.js) passed by every `stepVehicle` caller |
| K17 | The AI allocates ~60-75 KB per 1/120 s step (7-9 MB/s of young garbage) downtown (`tools/bench/sim.mjs`). The V8 sampling heap profile puts ~27 % in `drivers.js drive`, ~21 % in `peds.js move`, ~14 % in iterators; no literal arrays or objects in those paths, so most of it is numbers boxed on store into the car/person objects (fields generalised to tagged). In the browser it is minor GC ~0.8 % of the main thread, no visible spikes; worth it only alongside other work on those files | [sim] | keep numeric fields numeric from creation (never null/undefined: 0 or NaN), check with `%DebugPrint` under `--allow-natives-syntax` |
