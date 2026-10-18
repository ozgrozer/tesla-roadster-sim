# The pause menu, the map, the GPS and the clock: notes

There was no pause and no map: the top bar's buttons faded while driving, the keys card came up on
`I`, and the radar sat bottom left. Now there is GTA V's pause menu with its map, waypoints and a
GPS route, the settings, the controls, and a clock in the HUD. What changed, why, and how it was
checked.

## What changed

- **The pause menu** (`js/ui/menu.js`, new): Esc, or the Menu button in the top bar (the way in on a
  phone). While it is open nothing moves and nothing new is drawn (the sim, the traffic and the
  people stop, the sound is paused, the HUD hidden), the last frame stays up behind it, dimmed (drawn
  again if the window changes size). Tabs: Map, Settings, Controls; Q and E switch them (the arrows
  too, with the tabs in focus), Esc or Resume closes it; no key reaches the game while it is open.
  The top bar's buttons are wired through the menu now, each doing what its key does.
- **The map** (`map.js`, `mapDraw.js`, `blips.js`, new; the radar's drawing shared from
  `radarMap.js`): the blocks, the streets with their names once zoomed in, the neighbourhoods, the
  beach and the sea, the pier, the hills and their sign, the observatory, the freeways, the
  gridlock and the car's arrow; drag (or the arrows) to pan, the wheel, a pinch or + and − to zoom; a
  click or a tap on a street sets a waypoint on the nearest lane, a click on it again clears it
  (Enter sets one at the centre's cross, C finds the car); a legend, the waypoint's street and
  distance, the street under the pointer.
- **The GPS** (`js/sim/route.js`, new, no DOM; `js/ui/gps.js`, new): the way to the waypoint, worked
  out once a waypoint, backwards over the lane graph (Dijkstra's), turning only as the junctions
  allow, a lane change costing a little, the gridlock's closed lanes left out; once the car strays,
  the route is read again from that same plan (no fresh search: about 0.02 ms at the radar's 30 a
  second). Drawn on the map and on the radar in purple, the waypoint's blip held on the radar's rim
  when it is off it; within 15 m of it, cleared, and "Waypoint reached" in the help box.
- **Autopilot to the waypoint** (`js/sim/cityPilot.js`): with one set, `P` drives there, not to the
  gridlock, on the GPS's plan, and pulls up at it ("Arrived"). On the way a bug was found and fixed:
  Autopilot's green wave remembered which junctions it held but not which way, so after a change of
  route it could hold a light red against itself and sit there for good; it now lets a light run
  through its amber before turning it. (And on a wet road it drives as a careful driver does:
  cruising up to 15% slower, taking corners at 22% less, braking earlier and 20% more gently.)
- **The settings** (`settings.js`, `world.js`, new): speed units, sound, the camera, the time of day (a
  slider), the clock's speed (stopped, real time, GTA's minute every two seconds, four times that),
  the weather (as it comes, or one of the six) and the graphics quality (low, medium, high:
  climate.js). The clock's speed and the quality are remembered; the time of day and the weather
  start afresh each visit, as the city always opened.
- **The controls** tab: the keys card's content, with the menu's, the map's and a gamepad's keys
  added. The `I` card is as it was (and the Keys button hidden on touch screens, where it never
  showed).
- **The clock** in the HUD (`clock.js`, new, via hud.js): HH:MM and the weather's icon (sun or moon,
  cloud, rain, storm, fog) above the radar, staying up when the rest of the HUD goes quiet, as the
  radar does; written to the page only when the minute or the icon changes.

## How it was checked

- `tests/route.test.mjs` (7): routes between random points on the lanes exist, follow joined edges,
  keep out of the closed lanes, are no longer than a sensible bound, and are read again from the plan
  when the car strays.
- Headless screenshots at 1280 × 720, on a phone held upright (390 × 844) and sideways (844 × 390)
  with touch, with real clicks, wheel zooms, taps and pinches; a resize while paused; the test site.
  Keys checked not to reach the game with the menu open.
- Autopilot to 48 random waypoints on random traffic: all arrived (in about 50 s, the median), no
  crashes; the gridlock tests unchanged.

## Known issues

- A gamepad can't open the menu (Menu is Autopilot and View is reset on the pad).
- On a phone held sideways, at the smallest zoom, the map's area names can overlap.
