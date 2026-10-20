# Architecture notes (open-world-v2)

A map of the code for anyone picking up work on this branch: where the loop is, what the shared
state is, and how a new system plugs in without editing the hub files. Written from the cycle 0
architecture audit; kept up to date as the extension points change.

## Boot and the loop (js/main.js)

Boot, in order: the wall, truss, lineup and Roadster meshes, `Sim`, `Autopilot`, `CameraRig`,
`SoundEngine`, `Hud`, `Traffic` (districts), `Peds`, `CityPilot`, `CityView`, `Minimap`, `Intro`,
`Tween`, the `app` state, `Climate`, `Menu(COMMANDS)`, `Input`, `OnFoot` (`foot`), `Polish`, `Game`,
then `enterCity()` (or `#site`) and `requestAnimationFrame(frame)`. The city's sim data (lanes,
colliders, lots) is built when `sim/city.js` is first imported (about 210 ms in Node); its meshes
on the first `CityView.show(true)`.

Physics is fixed at `H = 1/120 s`; `frame()` clamps dt to 0.05 s and runs at most 14 steps a frame.
Rendering interpolates between steps (`render/tween.js`).

Each step, `step(c, city)`: `foot.step` (onFoot.js) steps the Roadster `sim.step`, the stolen car
`alt.step`, then `peds.step` and `traffic.step` (through a proxy for the player), `carsMeet`,
`collidePlayer`, and on foot `stepPlayer`; then `game.step(H, VIEW)` (city only): `updatePlayerView`,
crimes through `witnesses` to `Wanted.report`, `police.step`, `W.update`, `ambient.step`,
`missions.update`, **the features' `step`** (features.js), the autosave, `arrest.step`, wasted.

Each frame after the steps: `tickGame`, `game.simEvents`, `damage`, `handleEvents()` (events.js),
`intro`, `tween.apply`, `foot.frame` (vehicles.sync, the prompt, the foot view and camera),
`updateRoadster`, `polish.frame`, skids and smoke, `rig.update`, particles, `climate.update`,
`cityView.update` (sky, trees, signals, streaming, traffic and ped views), `minimap.update`,
`game.frame` (markers, GPS, crime HUD, **the features' `frame`**), `mixSound`, `hud.update`,
shadows, reflections, `post.render`.

**Headless:** `window.__roadster.advance(sec)` runs only `step()` (with `foot.frame` every 4th
step) and `handleEvents()`. It skips `game.frame`, `tickGame`, `game.simEvents`, damage, climate,
the city view, the HUD and audio. Gameplay logic belongs in step so the playtest drives it.

## Shared state

- `sim/player.js` `player`: `mode` ('car' | 'foot' | 'entering' | 'exiting'), `pos`, `vel`,
  `heading` (nose = `(cos h, -sin h)`), `vehicle`, `wanted`, `grounded`, `speed`, `surface`,
  `down`. Written only by player.js and onFoot.js. API: `setMode`, `placePlayer`, `stepFoot`,
  `floorAt`, `blockedAt`, `freeSpot`, `knockDown`, `CITY_WORLD`.
- `sim/playerView.js` `playerView`: the read-only view game systems should use (`pos, vel,
  heading, speed, mode, driving, vehicle{id, model, kind, stolen}, health, air, wanted`).
- `sim/vehicles.js` `vehicles`: the registry of everything drivable (Roadster first), rebuilt each
  frame by `vehicles.sync`; `.of(car)`, `.byId`, `.nearest(pos, r, filter)`, `.toWorld/.toLocal`.
- `sim/gameEvents.js`: `emitGame(type, data)`, `onGame(type | '*', fn)` (returns unsubscribe).
  Events: `car-entered`, `car-exited`, `car-stolen` (`{how: theft | jack, alarm, model}`),
  `player-hit`, `crime` (`{type: carjack | car-alarm | ped-hit | ped-killed | traffic-crash, pos,
  severity}`), `ped-hit`, `busted`, `wasted`. A payload's `type` wins over the event's name (a
  crime arrives as `type: 'carjack'`); the name is always in `e.event`.
- `sim/world.js`: `groundHeight(x, z, y)`, `groundNormal`, `districtAt`, `onRoad`, `roofAt`,
  `parkingNear`, `pavementNear`, `pavementGraph()`, `spawnPoints`, `FWY`, `HILL_ROAD`, `LOOKOUT`,
  `onHillRoad`, `inTunnel`.
- `sim/grid.js` (re-exported by city.js): `N = 18`, `PITCH = 96`, `HALF = 864`, `OUTER = 899`,
  `ROADS`, `LANE_OFF`, `rng(seed)`. city.js: `BLOCKS`, `BUILDINGS`, `STALLS`, `SOLIDS`, `SIGNS`,
  `LAMPS`, `TREES`, `PALMS`; the lane graph `NODES`, `EDGES` (each with `cars[]`, `next`, `twin`,
  `closed`, `hw`), `nearestLane`; colliders `COLLIDERS`, `addCollider`, `query`, `raycast` (96 m
  grid).
- Routing: `sim/route.js` (`routeTo`, backward Dijkstra over the lanes), GPS `ui/gps.js`, AI
  drivers `sim/aiDriver.js` (`Planner`, `Follower`).
- Collision: `sim/collide.js` (`collideCity`, `bumpCars`, `carRect`, `playerRect`); collider kinds
  `building` (can be landed on), `plant`; `sim/ground.js` is the Roadster's tyres, other cars use
  `vehicleSim.js` with `handling.js`.
- `window.__roadster` debug handle (sim, traffic, peds, player, vehicles, foot, game, advance...),
  `window.__crime` the Game. URL flags: `?spawn=x,z,yaw`, `#site`, `?wanted=3`, `?mission=race`,
  `?ambient=chase`, `?cash=N`, `?drive=kind`, `?fresh` (ignore the save game).

## Adding a system (the extension points, added in cycle 1)

1. Write `js/<area>/<feature>.js` exporting `FEATURE = { name, init(game), step(h, game),
   frame(dt, game, inCity), reset() }` and add it to the list in `js/features.js` (one import, one
   entry). `game` carries `sim, foot, traffic, peds, hud, minimap, app, damage, wanted, police,
   missions, ambient`.
2. E interactions: `addInteractable({ id, x, z, r, y?, modes: ['foot'] | ['car'], label(p), act(p) })`
   from `sim/hooks.js`. onFoot.js offers the nearest one (when nearer than a car) and E calls `act`.
   In a car it takes E before getting out does, so return null from `label` above walking pace.
3. Map marks: `addRadarOverlay(fn(g, V, toRadar, k))` and `addMapOverlay(fn(g, sx, sy, k))` from
   `sim/hooks.js`. Static landmarks: `areas.js LANDMARKS` plus `ui/blips.js`.
4. Saving: `saveSection(name, { save, load })` from `sim/save.js`; Game loads at start (unless
   `?fresh`), saves every 30 s of play and at each mission's end.
5. HUD: `widget(id, css)` from `ui/widgets.js` for an element of your own; `hud.popup(html, ms,
   'hint')` for a hint, `hud.notify({title, sub, tone})` for a notice, `game.ui.title(...)` for a big
   title.
6. Missions: `js/sim/missions/<id>.js` with `{id, title, brief, start: [fx, fz], color, reward,
   objectives: [...]}`, added to `MISSIONS` in `missions/index.js`; new objective kinds in
   `objectives.js OBJECTIVES`.
7. Sounds: free functions `(sound, ...)` as in `audio/steps.js`, `sound.play(bank, vol, opts)`,
   positioned with `audio/mix.js` `hearing/panOf/placeOf`.
8. Static geometry: sim side push to the `plots.js` arrays or `addCollider` at import; render side a
   `buildX(group)` module plus a line in `CityView.build()` (render/city.js). Meshes under 420 m
   across are streamed by `chunks.js`.

## Rules for parallel work

- Hub files have one owner, the integrator: `main.js`, `onFoot.js`, `game.js`, `events.js`,
  `render/city.js`, `ui/hud.js`, `audio/sound.js`, `audio/mix.js`, `input.js`, `index.html`,
  `README.md`, `features.js`. A feature branch may add its one line to `features.js` and should
  otherwise ask for a hook rather than edit a hub.
- `dist/roadster.js` is committed and must match the sources (`tests/bundle.test.mjs`). Feature
  branches don't commit it; the integrator rebuilds after each merge.
- Each sim system has its own seeded rng; never draw from `traffic.R` or `peds.R`.
- A new test file per feature; don't edit another area's tests except to fix a real regression.
- Sim modules stay pure: no DOM, no `render/` or `ui/` imports.
- Style: StandardJS (no semicolons, single quotes, a space before a function's parenthesis,
  2-space indent); each file opens with a prose header saying what it is and its API; British
  English prose comments; UPPER for data tables and mixins; no per-frame allocation in hot loops.
- The bundler (tools/build.mjs) handles `import {a, b as c} from`, `import * as X from`, `export
  const|let|function|class` and `export {...}`; not `export default`, `export *`, dynamic
  `import()`, `import.meta` or bare `import './x.js'`. Only modules reachable from main.js are
  bundled.
- Keep files near 500 lines; split by concern rather than growing a hub.

## Tests and the playtest

- `npm test` runs every `tests/*.test.mjs` (249 + new, about 2.5 min on 2 cores). One file:
  `node --import ./tools/node-loader/register.mjs --test tests/x.test.mjs`. Modules that touch the
  DOM: stub `globalThis.window` and `document` before `await import()` (camera.test.mjs).
- `npm run build` then `npm run playtest -- career|roam|perf [--only=a,b]` with
  `PLAYWRIGHT_CORE=/opt/node-tools/node_modules/playwright-core` and
  `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; serialise browser runs with
  `flock`. Flows are `[name, async g => ...]` arrays (`career.mjs`, `roam.mjs`); `g.run(sec)`,
  `g.until`, `g.press`, `g.hold`, `g.ev`, `g.shot`, `g.expect`; page helpers in `helpers.mjs`.

## Known architectural weaknesses

1. The per-frame order is hand-wired and onFoot.js owns `traffic.step` and `peds.step`.
2. `advance()` skips frame-level logic (busted/wasted timing, traffic-crash crimes, env).
3. The world is static and built eagerly: `N = 18` in grid.js (duplicated in areas.js), the
   collider grid clamps anything past `OUTER + PITCH` into the edge cells, `chunks.js` only toggles
   visibility, `EDGES[].cars` is a module singleton. Page load exceeds 30 s under swiftshader.
4. No interior or scene switching: `app.world` is 'site' | 'city', checked in 16 files;
   `player.js keepOnMap` assumes the outdoor map.
5. Simulation cost per game second (Node): sim 14 ms, peds 39 ms, traffic 74 ms with 394 cars
   (317 parked) and 240 peds; peds scan every traffic car (`crowd.js` jaywalk, clearOver).
