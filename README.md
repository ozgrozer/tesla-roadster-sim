# Tesla Roadster Sim

A Three.js stunt simulation of the Oct 15, 2026 Roadster reveal at McGregor, Texas. The autopilot runs the show on load; press any drive key to take over.

1. **The wall.** From the flat start of the platform, climb 21 m and hang upside down at 170° on the 2 G suction fan.
2. **Reverse.** Back down the wall under brake control and stop on the platform where it started.
3. **Fly.** Full power up the wall and over the top without slowing, rear thrusters along the lip, then a push-off with the bottom ones. Roll upright and free-fall with the thrusters idle, then fire full bottom thrust a few metres off the floor (about 3 G) and settle through the vapor cloud. No flips, as at the event.
4. **The lineup.** A long run down the pad on the main thrusters to 180 km/h, then full lift thrust over the parked Cybercab, Cybertruck, Semi, Model Y and Model 3 with a kickflip (a 360° roll, as at the event), the same last-moment landing burn, then brake to a stop.

Fan-made, built from press coverage. Not affiliated with Tesla or SpaceX.

## Run it

**Double-click `index.html`.** It works offline and needs no server: three.js and the fonts are in `vendor/`, and the game code is bundled into one plain script, `dist/roadster.js`.

A local server still works if you prefer one: `npm start`, or double-click `start.command` on macOS.

## Controls

| Key | On the ground / wall | In the air |
| --- | --- | --- |
| W / S | Throttle / brake, then reverse (also back down the wall) | Pitch down / up |
| A / D | Steer | Roll |
| Q / E | — | Yaw |
| B | E-brake (locks the rears: drifts, parking) | — |
| Shift | Main thrusters (boost) | Main thrusters |
| Space | Lift thrusters (take off) | Lift thrusters |
| X / K | — | Auto backflip / kickflip |
| F | Suction fan: auto, on, off | |

Other keys: `P` autopilot demo, `M` manual, `R` reset, `1` `2` `3` start line / wall top / lineup, `V` camera, `T` slow-mo, `N` sound, `H` hide the key panel. Release the throttle and the car coasts down on regen, like a Tesla.

Cameras (`V`): **Director** (the autopilot's shots), **Follow** (GTA-style: sits behind the car's heading, ignores flips; drag with the mouse to look around, scroll to zoom), **Chase**, **Side**, **Free** (orbit).

## Project layout

```
index.html            markup only; loads css/ and dist/roadster.js
css/                  fonts.css (self-hosted), base.css, hud.css, panels.css
js/main.js            boot, game state, sim events, main loop
js/sim/               physics, no DOM: runs in Node for tests
  constants.js        spec sheet (CAR), math helpers, controls
  track.js            wall profile, lineup, solid obstacles
  sim.js              vehicle state, mode switching, wall ride, scoring
  ground.js           tyre model: slip, friction circle, regen, e-brake, TC/ESC
  flight.js           thrust, attitude control, manoeuvres, wall catch
  crash.js            tumbling rigid-body crash
  autopilot.js        the scripted reveal sequence, flown through normal controls
js/render/            scene, wall, lineup, roadster, effects, skids, camera
js/audio/sound.js     Web Audio synthesis (no sound files)
js/ui/                hud.js, input.js
vendor/               three.js r170 + addons, fonts (with licenses)
dist/roadster.js      generated bundle (do not edit)
tools/                build.mjs (bundler), serve.mjs (optional server), Node loader for tests
tests/                headless physics tests + bundle freshness check
```

Each source file stays under 500 lines (the generated bundle and vendored files excepted). Code style is StandardJS, formatted with `prettier-standard`.

## Editing the code

The page runs the bundle, so rebuild after changing anything in `js/`:

```
npm run build     # once
npm run watch     # rebuild on every save
```

No dependencies to install: the bundler is a single file with no packages. `npm test` fails if `dist/roadster.js` is out of date.

## Tests

```
npm test
```

These run the full autopilot sequence, plus coast-down, braking, e-brake, drift, stability and crash checks, headless in Node against the same sim code the browser uses. One more test checks that the bundle matches the sources.

## Licenses

three.js: MIT (`vendor/three/LICENSE`). Saira Semi Condensed and JetBrains Mono: SIL Open Font License 1.1 (`vendor/fonts/OFL-*.txt`).
