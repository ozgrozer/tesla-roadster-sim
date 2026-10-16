# Tesla Roadster Sim

A Three.js stunt simulation of the Oct 15, 2026 Roadster reveal at McGregor, Texas, and a free-roam city to drive it in. It opens in the city, where Optimus walks up to the parked Roadster, the driver's butterfly door swings up, and it gets in and takes the yoke (any drive key skips this); it stays at the wheel from then on. Press **Test site** at the top (or `C`) for the reveal, where the autopilot runs the show until you press any drive key to take over:

1. **The wall.** From the flat start of the platform, climb 21 m and hang upside down at 170° on the 2 G suction fan.
2. **Reverse.** Back down the wall under brake control and stop on the platform where it started.
3. **Fly.** Full power up the wall and over the top without slowing, rear thrusters along the lip, then a push-off with the bottom ones. Roll upright and free-fall with the thrusters idle, then fire full bottom thrust a few metres off the floor (about 3 G) and settle through the vapor cloud. No flips, as at the event.
4. **The lineup.** A long run down the pad on the main thrusters to 180 km/h, then full lift thrust over the parked Cybercab, Cybertruck, Semi, Model Y and Model 3 with a kickflip (a 360° roll, as at the event), the same last-moment landing burn, then brake to a stop.

**The city.** Where the Roadster starts: a 10 × 10 block downtown grid at golden hour on the coast, a beach and a blue sea beyond the ring road (drive straight off the promenade onto the sand, down to the water's edge), with glass towers, brick and stucco blocks (the bricks at their real size), storefronts under canopies, palm boulevards, parks and parking lots, and roofs laid in membrane strips. Every window is its own: set back in its opening (at an angle you see the reveal, the sill lit and the head in shadow) with a room behind it, a floor, a ceiling, walls and a desk or cabinet against the back, lit by its lamp or dark; warm or cool, blinds up or down, and the glass smooth enough to mirror the sky at a glancing angle, each pane at a slightly different one. The streets are worn the way a city's are: darker, polished wheel tracks down every lane, oil drips between them, patches and tar-sealed cracks, a concrete gutter along every kerb that follows it round the corners, drain grates by the corners, manholes out in the lanes, and turn arrows before each stop line showing the moves the lane allows. Two lanes each way, a signal on every corner, and live traffic (sedans, hatchbacks, SUVs, cabs, pickups, vans and buses with rounded bodies and bumpers, door shut lines, black B-pillars, glass that reflects the sky, open wheel arches over tyres on alloy or steel rims, the fronts steering through the turns, and bodies that dip under braking, squat as they pull away and lean out of the corners) that keeps its distance (minding the whole of a car crossing in front, not just its middle), signals and changes lanes, stops for red lights and gives way when turning left, taking a gap of four and a half seconds in the oncoming traffic, or going as the light changes and the oncoming traffic stops. Drivers honk at a Roadster that sits in their way or cuts them up, lean on the horn after you hit them (hazards blinking), and move over when you honk at them from behind, though nobody honks until the Roadster has sounded its own horn at the gridlock: the first horn in town is yours. The kerb is felt: each axle thumps up onto the pavement and drops back off it, a wheel over a manhole clunks (ta-dunk, front then rear), and the tyres grip less on a park's grass and less still on the beach, where the sand drags at them and sprays up behind. Hit a car and it gets knocked loose; like GTA, nothing on the road takes the wheel away, however hard you hit it: the Roadster bounces off cars, walls and posts and drives on. Landings don't either: however hard it comes down, anything short of its side or roof lands on its wheels, and flying into the side of a building bounces it off. Only coming down on its side or roof tumbles it. Fly up onto a building and you can land and drive on its roof: the stair housings and air-handling units are solid, but the edge is only a low lip, so you can drive straight off a tall roof and come down on a lower one across the alley (or on the street, if you overshoot). Street furniture breaks the way it would: a street light is a breakaway pole that folds over at a walking pace, a signal mast only goes down in a hit at nearly 50 km/h, and trees and palms snap by the size of their trunk. Each one costs the car the energy it took to snap and the momentum of what it carries along, then falls over like a pole hinged at its foot, the signal going dark and a tree shedding its leaves; a car you knock sliding takes them down too. The thrusters work here too, and one block of the central avenue, straight ahead of where you arrive, is gridlocked solid both ways for jumping (the gold blip on the radar). Press `P` in the city for **Autopilot**: the Roadster drives itself to that gridlock on a green wave (every light on its way turns green for it, after the cross street's yellow, and goes back to its cycle once it is through), pulls up behind the last car in the queue, sits there while the light at the far end of the jammed street turns red, leans on the horn, then lifts straight up on its thrusters, flies down the street over the stopped cars and comes down on the open road beyond. It drives like a Roadster: hard off the line, up to about 120 km/h on the straights, braking late and firmly, and taking corners quicker than traffic does. From there it drives itself through traffic, overtaking slower cars when the other lane is clear and keeping its green wave going (the light at the end of each street turns green for it), and whenever it is stuck in a jam again (not just at a red light) it honks and hops over that too, until you touch a drive key. `C` (or **Test site**) goes back to the reveal.

Fan-made, built from press coverage. Not affiliated with Tesla or SpaceX.

## Run it

**Double-click `index.html`.** It works offline and needs no server: three.js and the fonts are in `vendor/`, and the game code is bundled into one plain script, `dist/roadster.js`. Add `#site` to the address to start at the test site.

A local server still works if you prefer one: `npm start`, or double-click `start.command` on macOS.

## Controls

| Key | On the ground / wall | In the air |
| --- | --- | --- |
| W / S | Throttle / brake, then reverse (also back down the wall) | Pitch down / up |
| A / D | Steer; after a crash, roll it back onto its wheels | Roll |
| Q / E | — | Yaw |
| Space | E-brake, the handbrake as in GTA: straight, a hard stop (it wins over W); steered, the rears lock for handbrake turns and drifts | — |
| Shift | Main thrusters (boost) | Main thrusters |
| F | Lift thrusters (fly, take off) | Lift thrusters |
| H | Horn (hold) | Horn |
| X / K | — | Auto backflip / kickflip |
| G | Suction fan: auto, on, off | |

**Gamepad** (any with the standard layout: Xbox, PlayStation and most others): the left stick steers (and in the air pitches and rolls), `RT` is an analog throttle, `LT` an analog brake and then reverse, `A` the e-brake, `RB` boost, `LB` fly, `X` the horn, `Y` the camera, the D-pad up and down a backflip and a kickflip, `View` reset and `Menu` Autopilot. The right stick looks round the car (and yaws it in the air), and the pad rumbles for knocks, kerbs, landings and crashes. A stick held over through a lift-off only flies the car once it has come back to the middle.

Other keys: `C` city / test site, `P` autopilot demo (Autopilot in the city), `M` manual, `R` reset, `1` `2` `3` start line / wall top / lineup, `V` camera, `T` slow-mo, `N` sound, `I` hide the key panel. Release the throttle and the car coasts down on regen, like a Tesla. A tap of Space on full lock swings the car round, and when you let go it drives off the way it now points (the rears find their grip again over half a second, with stability control standing back), so the longer the tap the further round it goes: about 40° to a J-turn. Above 100 km/h the active rear wing rises out of the deck on its swan-neck pylons (it stows again below 60), and tips up as an air brake under hard braking. After a crash the wreck stays where it stops, like GTA: on its roof or side, `A` or `D` rolls it back onto its wheels once it has slowed, and once it is on them any drive key carries on, even while it is still sliding (`R` still resets). Keys still held when the car leaves the ground (W for the run-up, A/D) don't fly it until you press them again, so holding W through a jump doesn't pitch the nose down.

The sound is all synthesised: the drive units' whine (a primary tone, a gear-mesh fifth above, the motor's body below, a growl under full power, more whine under regen), tyre roar and tread hiss, a squeal that chatters at the limit and a scrub when sliding, gusting wind, the thrusters' valves banging open, a two-tone horn, the door locks (each door's actuator whirring and snapping home, a light "ka-chack" as Optimus walks up and a firmer "ka-chunk" once the door is down), and the city round you: the four nearest cars' engines (or, for a third of them, electric whine) and tyres with their doppler shift, panned left and right, other drivers' horns, buses' air brakes as they pull up, a far hum of traffic, birds, the surf breaking on the beach and gulls over it as you near the water. Your own sound comes back off the walls either side, each echo as late as the round trip to its wall, and the reverb thickens between tall buildings and thins out in the open (and at the test site). Street lights, trees and cars you pass close at speed rush by with a whoosh from their side; the tyres slap up a kerb, clunk over a manhole, hiss on sand and swish on grass; and a knock sounds like what it hit: sheet steel ringing against a car, a heavy thud and falling grit against a wall.

Smoke is carried by the air rather than flung: thruster vapor, tyre smoke and dust drift on a light breeze, curl and billow in eddies, get dragged along in the car's wake, and are lit by the low sun (they glow at the edges when you look towards it). Hot tyre smoke climbs as it trails behind a slide; the thrusters' cold vapor sinks and spreads across the ground in a cloud.

In the city a radar at the bottom left turns with the camera, zooming out with speed; traffic shows as dots and wrecks in amber. The follow camera pulls in rather than sit inside a building, and when a knock spins the car or sends it sliding, it follows where the car is going rather than whirl round its nose. It gives with the car: it falls back as the car launches and closes in under hard braking, the road trembles up through it at speed (coarser on sand and grass), and past about 150 km/h, or with the main thrusters firing, the edges of the picture streak in towards the car.

Cameras (`V`): **Director** (the autopilot's shots), **Follow** (GTA-style: sits behind the car's heading, ignores flips; drag with the mouse to look around, scroll to zoom), **Chase**, **Side**, **Free** (orbit).

## Project layout

```
index.html            markup only; loads css/ and dist/roadster.js
css/                  fonts.css (self-hosted), base.css, hud.css, panels.css
js/main.js            boot, game state, sim events, main loop
js/events.js          what the sim reports, turned into popups, sounds, shake, rumble, particles
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
  breakables.js       street lights, signals, trees and palms: what it takes to snap them
  traffic.js          traffic drivers: lane following, gaps, signals, lane changes
  manners.js          indicators, honking at the Roadster, moving over when it honks
  sight.js            what a driver sees: the car ahead, things in the way, oncoming traffic
  wrecks.js           cars knocked out of their lane: hits, sliding, rejoining
  jam.js              the jammed street: lanes closed to traffic, packed with cars to jump
  roofs.js            roofs to land and drive on: the roof under the car, rooftop plant
  street.js           what is underfoot: the kerb's line, surfaces and their grip, manholes, drains
  cityPilot.js        Autopilot on the city's streets, through normal controls
  cityHop.js          its way out of a jam: the route to the gridlock, a spot to land, the hop
js/render/            scene, wall, lineup, roadster, effects, skids, camera
  roadster*.js        the Roadster: body, canopy, doors, cabin; its tail and active wing
  tween.js            each frame drawn between the last two physics steps, so nothing judders
  loft.js             lofted bodies with smooth panels and crisp creases (Roadster and traffic)
  optimus.js          Optimus, the driver; intro.js, the city's opening scene
  smoke.js            vapor, tyre smoke, dust and sand: carried by the air, lit by the sun
  city*.js, geo.js    the city's ground, buildings, props and signals, sky, sea; merge helpers
  facade.js           window-by-window facades: reveals, the rooms behind, lights, blinds, glass
  roadSurface.js      the asphalt's wear: wheel tracks, oil, patches, tar-sealed cracks, gutters
  cityStreet.js       manholes, drain grates and the lane arrows
  traffic.js          instanced traffic cars; carShapes.js, their bodies; carWheels.js, tyres and rims
  speedBlur.js        the picture's edges streaking at speed
js/audio/             Web Audio synthesis (no sound files): sound.js, shots.js (one-shots),
                      street.js (echo off the walls, surf, tyres off the road), mix.js (what the
                      camera hears: distance, pan, doppler, walls, pass-bys)
js/ui/                hud.js, input.js, gamepad.js, minimap.js (the city's radar)
vendor/               three.js r170 + addons, fonts (with licenses)
dist/roadster.js      generated bundle (do not edit)
tools/                build.mjs (bundler), serve.mjs (optional server), og.mjs (link preview
                      image), Node loader for tests
og-image.png          the card social sites show for a shared link (npm run og)
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

`npm run og` renders `og-image.png`, the 1200 × 630 link preview, from the game itself in headless Chrome (it needs Chrome and Node 22; set `CHROME` to use another browser binary). The page's Open Graph tags point at the copy on GitHub Pages.

## Tests

```
npm test
```

These run the full autopilot sequence, plus coast-down, braking, e-brake, drift, stability crash, crash-recovery, landing and lineup-bump checks, headless in Node against the same sim code the browser uses. The city tests check that the lane graph joins up, that traffic never runs a red light or drives through another car, that the Roadster bounces off buildings and cars however hard it hits them (on the road or flying), and shunts cars, that Autopilot gets round town cleanly, that no traffic drives into the jammed street and a jump clears it, that Autopilot drives to the gridlock, joins the back of the queue clear of the junction, honks and flies over it without touching anything, that no driver honks before the Roadster has honked at the gridlock, that the Roadster can land on a roof and drive straight off its edge onto a lower one, that signal masts, street lights, trees and palms stand up to a slow knock and snap in a hard one (at a cost in speed, and to a sliding car too), and that random driving never ends in NaN. Street tests check that the kerb runs along each street and round each corner, which surface a point is on, that the tyres grip less and drag more on sand, and that the Roadster feels each axle mount the kerb and each wheel run over a manhole. Input tests check that W held through a lift-off doesn't pitch the car into the ground, and the key map (Space the e-brake, F the lift thrusters, H the horn), and that a gamepad's triggers and stick are analog throttle, brake and steering, and a stick held through a lift-off doesn't roll the car. A handbrake test checks that a tap of the e-brake on full lock turns the car and it drives off that way. One more test checks that the bundle matches the sources.

## Licenses

three.js: MIT (`vendor/three/LICENSE`). Saira Semi Condensed and JetBrains Mono: SIL Open Font License 1.1 (`vendor/fonts/OFL-*.txt`).
