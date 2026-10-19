# Architecture (round 2, as of gta-v2 @ 0c56c80 + gta-v2-qa)

Plain ES modules + three.js r170 (`vendor/three`), no npm dependencies. `index.html` loads
`dist/roadster.js`, a bundle of `js/main.js` made by `tools/build.mjs` (`npm run build` after every
edit under `js/`; the bundler rejects `export default`, `export *`, dynamic `import()` and
`import.meta`). StandardJS, every file under 500 lines.

## Layers

| Folder | What lives there | Rules |
| --- | --- | --- |
| `js/sim/` | pure data and maths: the Roadster's physics (`sim.js`), other cars' bodies (`vehicleSim.js`, `handling.js`), the city's lane graph and colliders (`city.js`, `grid.js`, `street.js`, `pavement.js`), traffic (`traffic.js` + `drivers`, `laneChange`, `handover`, `makeway`, `react`, `wrecks` ...), people (`peds.js` + `crowd`, `pedBrain`, `alight`, `shelter`, `linger`), the player (`player.js`, `boarding.js`, `vehicles.js`, `playerView.js`), crime (`wanted.js`, `witness.js`, `police.js`, `policeUnit.js`, `policeAir.js`, `ambient.js`), missions (`missions/`), game events (`gameEvents.js`), weather/time state (`env.js`) | Node-testable: no DOM, no three.js rendering (THREE maths is fine) |
| `js/render/` | everything drawn: the city's meshes (`city.js` builds; `cityBuildings`, `cityProps`, `cityStreet`, `facade`, `chunks.js` districts/streaming), traffic (`traffic.js`: instanced per car type and part), people (`peds.js`: one instanced mesh, posed in the vertex shader), the Roadster, cameras (`camera.js`, `footCam.js`, `carCam.js`), light (`daylight.js`, `sunShadow.js`), post (`post.js`, `resolution.js`), particles (`effects.js`, `smoke.js`, `spray.js`) | three.js; reads the sim, never writes it |
| `js/ui/` | HUD (`hud.js`, `place.js`, `carHud.js`, `crimeHud.js`, `speedo.js`), radar and map (`minimap.js`, `map.js`, `crimeMap.js`, `gps.js`), input (`input.js`, `gamepad.js`), menu/settings (`menu.js`, `settings.js`, `prefs.js`) | DOM |
| `js/audio/` | WebAudio synth: engine, tyres, radio, sirens, ambience zones, `mix.js` (the per-frame mix) | |
| hubs | `js/main.js` (boot + loop), `js/game.js` (crime/missions glue), `js/onFoot.js` (foot/vehicle handoff), `js/polish.js` (non-Roadster car polish), `js/events.js` (sim events -> titles/sounds), `js/climate.js` (time/weather), `js/carName.js` (small HUD guard) | shared: minimal additive edits |

## The loop (`main.js frame`)

```
frame(now)                                   real dt, capped 0.05 s
  input.poll
  while acc >= H (1/120 s), at most 14 steps     (fixed physics step)
    foot.before / tween.before                   (undo last frame's interpolation)
    step(c, city)
      demo.step                                  (?drive=kind)
      foot.step(H, c, city, VIEW, peds, traffic)  onFoot.js
        sim.step (Roadster)  + alt.step (a city car the player drives: Drivable)
        peds.step(H, playerProxy, traffic, view)  people: think (pedBrain), move, dodge, clear
        traffic.step(H, playerProxy, view)        every traffic car + recycling round the player
        collidePlayer / carsMeet                  wrecks, the left Roadster
        stepPlayer (on foot: stepFoot or boarding)
      game.step(H, VIEW)                          witnesses -> wanted -> police -> ambient -> missions -> busted/wasted
  tickGame(simDt)                                 game-event clock
  game.simEvents / damage / handleEvents          knocks -> crimes, dents, titles, sounds
  tween.apply(alpha)                              draw between the last two steps
  foot.frame / updateRoadster / polish.frame      poses, camera hand-off, other car's look
  rig.update                                      camera
  particles, climate.update                       weather/time (daylight.js light + fog)
  cityView.update                                 sky, fallers, trees, signals, stream() districts, traffic + people views (frustum)
  minimap.update, game.frame, mixSound, hud.update
  cityView.shadows -> post.render (renderer + bloom + final pass)
```

`window.__roadster.advance(sec)` runs `step` (and `foot.frame` every 4th) without drawing: the
headless playtest drives the game with it; the rAF loop still runs in real time in between.

## Shared interfaces (keep the names)

- **Player** `js/sim/player.js`: `player { mode: 'car'|'foot'|'entering'|'exiting', pos, vel,
  heading, vehicle, wanted, down }`; written only by player.js and onFoot.js. Everyone else reads it,
  or reads `playerView` (`sim/playerView.js`: pos, vel, speed, vehicle, health, wanted) which game.js
  binds.
- **Vehicles** `js/sim/vehicles.js`: `vehicles.list`, `vehicles.nearest(pos, r, f)`,
  `vehicles.of(car)`, `vehicles.toWorld(e, x, z)`, `vehicles.rect(e)`; entry `{ id, kind:
  'roadster'|'traffic'|'parked', type, pos, heading, speed, occupant: 'player'|'npc'|null, parked,
  locked, stolen, vacant, seat {x,y,z}, door {x,z}, len, wid, car, sim }`. Synced each step
  (`vehicles.sync(traffic, sim)`).
- **Boarding** `js/sim/boarding.js`: `howToEnter(e)`, `startEnter`, `startExit`, `stepBoard` ->
  events `'arrived' 'smash' 'alarm' 'pulled' 'seated' 'out' 'closed'` (onFoot.js `board` acts on
  them). A carjack: `pulled` -> `onFoot.pullOut` -> `traffic.ejectDriver(car, { side, jacked,
  along })` -> `traffic.exits` -> `peds.alight` (`sim/alight.js climbOut` + `haul`: thrown out and
  down, then up and running).
- **Game events** `js/sim/gameEvents.js`: `emitGame(type, data)`, `onGame(type|'*', fn)`;
  types `car-stolen {vehicle, kind, model, pos, how: 'break'|'jack'|'open', alarm}`, `car-entered`,
  `car-exited`, `ped-hit {pos, speed, severity, by, dead}`, `player-hit`, `car-crash`, `crime
  {type, pos, severity}` (types: car-stolen, carjack, car-alarm, ped-hit, ped-killed,
  traffic-crash, hit-police ...), `busted`, `wasted`, mission events.
- **Road network** `js/sim/city.js`: `NODES`, `EDGES`, `LANES`, `nearestLane(x, z)`, `query(x0, z0,
  x1, z1, out)` (colliders), `raycast`, `kerbDist` (street.js); traffic, people, police, GPS and the
  missions all share it.
- **Time/weather** `js/sim/env.js` `ENV { hour, dark, night, rain, wet, fog, ... }` written by
  climate.js, read by everyone (grip in game.js, peds' umbrellas, lights).

## Data flow of a crime

```
player action ──> onFoot.js / game.simEvents / pedBrain.knockDown
                     │  emitGame('crime', {type,pos,severity})
                     ▼
game.step: witnesses(pos, peds, cars, police) ──> wanted.report ──> stars
                     ▼
police.step(wanted, playerView) ──> units spawn off-screen on LANES, pursue, roadblocks, heli
                     ▼
arrest.step / wasted ──> game.fall ──> title, cash penalty, (car name dropped), fade ──> getUp at STATIONS/HOSPITALS
```

## Rendering budget pieces

- City statics: one mesh per district (6x6 `chunks.js district`) per kind (cornices, roofs,
  palms, trees, lamps, masts ...), frustum-culled by three.js; small kinds streamed past their own
  distance (`streamed(m, far)`), everything past the fog's reach (`stream(camera, density)`).
- Traffic: instanced per car type x part (`render/traffic.js`), the cars nearest the player first so
  only they go into the car's shadow map; frustum-tested per car.
- People: one InstancedMesh for everyone drawn (`render/peds.js`), posed in the vertex shader.
- Shadows: the car's 2048 shadow map (60 m round the focus) every frame; the city's long sun shadow
  (`sunShadow.js`) re-rendered only when the sun moves or something falls.
- Post: bloom (half size) + one final pass (tone map, speed blur), adaptive resolution
  (`resolution.js`).

## Tools

- `npm test` — Node tests (`tests/*.test.mjs`, loader in `tools/node-loader`).
- `npm run playtest -- career|roam|perf|all` — headless Chrome (swiftshader) on the real build;
  `PORT=8095` for qa's private port, `SHOTS=` for the screenshots, `PLAYWRIGHT_CORE=` for
  playwright-core (e.g. `/tmp/foot-smoke`).
- `tools/playtest/jack.mjs` — the carjack traced every 50 ms (jumps, sliding backwards).
- `tools/playtest/spawn.mjs` — draw calls per second after the spawn, tallied by what drew them.
- `tools/playtest/perfx.mjs` — real-time play with every system's update timed, heap and
  allocation rate.
