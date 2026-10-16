# Tesla Roadster Sim

A Three.js stunt simulation of the Oct 15, 2026 Roadster reveal at McGregor, Texas. The autopilot runs the show on load; press any drive key to take over.

1. **The wall.** From the flat start of the platform, climb 21 m and hang upside down at 170° on the 2 G suction fan.
2. **Reverse.** Back down the wall under brake control and stop on the platform where it started.
3. **Fly.** Full power up the wall and over the top without slowing, rear thrusters along the lip, then a push-off with the bottom ones. Roll upright and free-fall with the thrusters idle, then fire full bottom thrust a few metres off the floor (about 3 G) and settle through the vapor cloud. No flips, as at the event.
4. **The lineup.** A long run down the pad on the main thrusters to 180 km/h, then full lift thrust over the parked Cybercab, Cybertruck, Semi, Model Y and Model 3 with a kickflip (a 360° roll, as at the event), the same last-moment landing burn, then brake to a stop.

**The city.** Press **City** at the top (or `C`) to take the Roadster to a free-roam city: a 10 × 10 block downtown grid at golden hour, with glass towers, brick and stucco blocks, storefronts, palm boulevards, parks and parking lots. Two lanes each way, a signal on every corner, and live traffic that keeps its distance, changes lanes, stops for red lights and gives way when turning left. Hit a car and it gets knocked loose; like GTA, nothing on the road takes the wheel away, however hard you hit it: the Roadster bounces off cars, walls and posts and drives on. Landings don't either: however hard it comes down, anything short of its side or roof lands on its wheels, and flying into the side of a building bounces it off. Only coming down on its side or roof tumbles it. Fly up onto a building and you can land and drive on its roof: the parapet keeps you on, the stair housings and air-handling units are solid, and a hop on the lift thrusters takes you over the edge (onto the next roof, if you're quick). Street lights fold over when you hit them. The thrusters work here too, and one block of the central avenue, straight ahead of where you arrive, is gridlocked solid both ways for jumping (the gold blip on the radar). Press `P` in the city for **Autopilot**: the Roadster drives itself through traffic until you touch a drive key. `C` (or **Test site**) goes back to the reveal.

Fan-made, built from press coverage. Not affiliated with Tesla or SpaceX.

## Run it

**Double-click `index.html`.** It works offline and needs no server: three.js and the fonts are in `vendor/`, and the game code is bundled into one plain script, `dist/roadster.js`. Add `#city` to the address to start in the city.

A local server still works if you prefer one: `npm start`, or double-click `start.command` on macOS.

## Controls

| Key | On the ground / wall | In the air |
| --- | --- | --- |
| W / S | Throttle / brake, then reverse (also back down the wall) | Pitch down / up |
| A / D | Steer; after a crash, roll it back onto its wheels | Roll |
| Q / E | — | Yaw |
| B | E-brake (locks the rears: drifts, parking) | — |
| Shift | Main thrusters (boost) | Main thrusters |
| Space | Lift thrusters (take off) | Lift thrusters |
| X / K | — | Auto backflip / kickflip |
| F | Suction fan: auto, on, off | |

Other keys: `C` city / test site, `P` autopilot demo (Autopilot in the city), `M` manual, `R` reset, `1` `2` `3` start line / wall top / lineup, `V` camera, `T` slow-mo, `N` sound, `H` hide the key panel. Release the throttle and the car coasts down on regen, like a Tesla. After a crash the wreck stays where it stops, like GTA: on its roof or side, `A` or `D` rolls it back onto its wheels once it has slowed, and once it is on them any drive key carries on, even while it is still sliding (`R` still resets). Keys still held when the car leaves the ground (W for the run-up, A/D) don't fly it until you press them again, so holding W through a jump doesn't pitch the nose down.

In the city a radar at the bottom left turns with the camera, zooming out with speed; traffic shows as dots and wrecks in amber. The follow camera pulls in rather than sit inside a building, and when a knock spins the car or sends it sliding, it follows where the car is going rather than whirl round its nose.

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
  city.js             the city: street grid, lane graph, signal plan, buildings, colliders
  collide.js          2-D contacts and impulses: the Roadster against the city and traffic
  traffic.js          traffic drivers: lane following, gaps, signals, lane changes
  wrecks.js           cars knocked out of their lane: hits, sliding, rejoining
  jam.js              the jammed street: lanes closed to traffic, packed with cars to jump
  roofs.js            roofs to land and drive on: the roof under the car, parapets, rooftop plant
  cityPilot.js        Autopilot on the city's streets, through normal controls
js/render/            scene, wall, lineup, roadster, effects, skids, camera
  city*.js, geo.js    the city's ground, buildings, props and signals, sky; merge helpers
  traffic.js          instanced traffic cars
js/audio/sound.js     Web Audio synthesis (no sound files)
js/ui/                hud.js, input.js, minimap.js (the city's radar)
vendor/               three.js r170 + addons, fonts (with licenses)
dist/roadster.js      generated bundle (do not edit)
tools/                build.mjs (bundler), serve.mjs (optional server), Node loader for tests
tests/                headless physics and input tests + bundle freshness check
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

These run the full autopilot sequence, plus coast-down, braking, e-brake, drift, stability crash, crash-recovery, landing and lineup-bump checks, headless in Node against the same sim code the browser uses. The city tests check that the lane graph joins up, that traffic never runs a red light or drives through another car, that the Roadster bounces off buildings and cars however hard it hits them (on the road or flying), and shunts cars, that Autopilot gets round town cleanly, that nobody drives into the jammed street and a jump clears it, that the Roadster can land on a roof, stay on it and hop off, and that random driving never ends in NaN. An input test checks that W held through a lift-off doesn't pitch the car into the ground. One more test checks that the bundle matches the sources.

## Licenses

three.js: MIT (`vendor/three/LICENSE`). Saira Semi Condensed and JetBrains Mono: SIL Open Font License 1.1 (`vendor/fonts/OFL-*.txt`).
