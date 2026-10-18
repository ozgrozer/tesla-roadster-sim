# The HUD: notes

The HUD and UI redone in the spirit of GTA V: a clean screen while driving, a GTA-style radar,
where you are, a compact speedometer, and stunt titles with some flair. Everything below is in files
this area owns (index.html, css/, js/ui/hud.js, js/ui/minimap.js, js/events.js) plus new modules in
js/ui/, and two one-line hook-ups in js/main.js. The sim, the renderer, input.js and gamepad.js are
untouched; js/sim/areas.js (the neighbourhoods and street names) is read, not changed.

## What changed, and why

### A clean screen (hud.js)

- **The chrome fades while you drive.** The title, the buttons and the credit fade out once the
  player is driving (a drive or fly key, or the car moving over 2 m/s under the player's hands, a
  gamepad's included) and three seconds have passed since the mouse last moved. They come back when
  the mouse moves, the screen is touched away from the drive pad, or a key that isn't a driving key
  is pressed. The driving keys are the keys card's Drive and Fly sections (W A S D Q E F, the
  arrows, Space, Shift, H, G, X, K), so the horn or a flip doesn't bring the buttons back mid-jump.
  Tab wakes it and keyboard focus inside the bar keeps it up, so every button stays reachable from
  the keyboard. While Autopilot drives, or Optimus is getting in, it stays up: those are watched.
- **The old telemetry strip is gone.** Its figures went where they matter: the speed, power and
  regen to the speedometer, the air to the bar under the radar, and pitch, G, altitude, suction and
  0-60 to the instruments, which only come up when they mean something.
- **The line of keys along the bottom** (the old context hint) is now a subtitle in white with a
  black outline. It stays while Autopilot drives, Optimus gets in or the car is wrecked; otherwise
  each line shows for seven seconds the first time it comes up in a world (the ground keys after the
  intro, the flying keys on the first lift-off), then the screen is clean.
- **The top bar** uses GTA V's menu look: dark translucent buttons in white capitals, a pressed one
  white with black text; the title is italic. Same buttons, same ids, same handlers.

### The radar (minimap.js, radarMap.js)

- **GTA V's shape**: a rounded rectangle, 1.6 wide to 1 high, 19% of the window wide (190 to
  300 px), bottom left. It still turns with the camera (heading-up). The arrow sits 66% of the way
  down, so there is more road ahead than behind.
- **Zoom**: the radar's height covers 170 m at a standstill (a block and a half), up to 250 m more
  at speed (all of it from 45 m/s) and up to 320 m more the higher the car flies, eased in.
- **The map**: the city inside the ring road is drawn once at a pixel a metre: streets, blocks,
  parks, car parks, and buildings in three shades by height. What lies round it is drawn as shapes
  on every update, so it stays sharp at any zoom: the beach and the ocean (deeper further out) on
  the coast's side, the hills with their contour lines on the hills' side, and more blocks, out of
  reach, the other ways. The sides come from areas.js (COAST west, HILLS north); a different side
  turns the shapes there. The pier is drawn from LANDMARKS.pier, straight out from the promenade.
- **Blips**: the gridlock's gold blip with its jump chevron; a blip for each landmark (the pier, a
  big wheel; the sign, its peaks; any other one a plain white disc), each held on the rim, along
  the line from the arrow, while it is off the map; the north marker on the rim; traffic as dots in
  screen pixels, so they stay visible however far it zooms out (parked cars dark, moving ones white,
  wrecks amber). The Roadster is a white arrow with a dark edge.
- **Cost**: it draws 30 times a second into a canvas at up to 2x the CSS size, and allocates next
  to nothing per update (one shared record for the view and the blips' places, the font string made
  once per size, the shapes round the city made once).

### Under the radar: condition and air (hud.js)

- **Condition**, GTA's green health bar: one minus the dents' depth, summed, over a metre
  (`damage.amount` in render/damage.js: a 20 km/h knock adds about 0.05 m, a hard one or a crash
  0.1 m), so about ten hard hits empty it. Under 30% it turns red and blinks. It fills again when
  the car is reset (R) or the demo restarts, as the dents are repaired.
- **Air**, GTA's blue armour bar: `sim.air` out of `CAR.airMass`; red and blinking under 50 kg.

### Where you are (place.js)

- Bottom right, as in GTA V: the street over the neighbourhood, from `whereIs` in areas.js. At a
  junction both streets show, the one the car is going along first ("La Cienega Blvd / Wilshire
  Blvd" heading north, "Wilshire Blvd / La Cienega Blvd" heading east).
- It is said when it changes (a new place has to hold for 0.4 s first, so a kerb doesn't flicker
  it), stays up 4.5 s and fades. Coming out of a junction back onto the street it was already on
  doesn't say it again, so along Wilshire it comes up once per junction, with the cross street.
- On first driving off after Optimus gets in, the car's name in the same corner ("Tesla" in gold
  over "Roadster"), for 3.2 s, then the place. At the test site: "Test site" over "McGregor, Texas"
  on arriving.

### The speedometer (speedo.js)

- The speed in big italic digits with a black outline, the unit beside it: km/h or mph, switched
  with **U** or by clicking the unit, and remembered (`localStorage['roadster.units']`, in a
  try/catch: a private window just forgets).
- A thin power meter from its zero: regen in green to the left (a quarter of the meter, linear to
  the 250 kW of `CAR.regenPowerW`), power in white to the right (three quarters, on a square-root
  scale to the 1.15 MW of `CAR.powerW`, so cruising shows).
- The drive selector, P R N D, the one in use lit: P after 1.5 s at a standstill with no pedal,
  wheel, e-brake or thruster (and while Optimus gets in), R while reverse is asked for (and while
  it rolls back to a stop after S is let go), N with the wheels off the ground (flying, a wreck),
  D otherwise. A slide that turns the car round doesn't light R.
- Lamps that are out of sight until they light, as on a real dash: ABS (the lead's `sim.abs` over
  0.5, above 1 m/s), ESC (`sim.escActive`, flickering), TRACK (`sim.track`) and E-BRAKE
  (`sim.ebrakeOn`). This folds in the ABS tag the lead added to the old strip.

### The instruments (instruments.js)

- The thruster schematic (each nozzle lit as it fires, the total thrust under it) and altitude,
  pitch, G load and air, plus the suction fan and the 0-60 time at the test site, in one small dark
  card over the speedometer. Up at the test site, in the air, on the wall, or while the thrusters
  fire, and for 2.5 s after; out of sight otherwise, and nothing is written to it while hidden.
  The schematic is left out on narrow windows and phones on their side.

### Stunt titles, the score and the help box (notify.js, events.js)

- **Titles** mid-screen, GTA-style: big italic capitals with a black outline that punch in (from
  1.8x and blurred to size in 0.42 s), stay 2.4 s and fade upwards; the points under them in gold,
  a line of detail under those. What each event says:

  | Sim event                       | Title                                                                              | Under it                                |
  | ------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
  | `nearMiss`                      | NEAR MISS, counting on (×2, ×3) for each one within 3.5 s, points added up         | Oncoming · double points                |
  | `drift`                         | DRIFT, ×n for linked drifts (the sim's `links`)                                    | Linked · 3.2 s · 36°                    |
  | `trick`, a donut                | DONUT, ×n as the sim counts them                                                   |                                         |
  | `trick`, the wall, a wall catch | STUNT BONUS                                                                        | Inverted at 170°                        |
  | `landing`                       | CLEAN LANDING, STUNT BONUS, DOUBLE STUNT BONUS or INSANE STUNT BONUS by the tricks | Backflip · Kickflip · 2.6 s air · 2.4 G |
  | `z60`                           | 0–60 MPH                                                                           | the time, in blue                       |
  | `crash`                         | WRECKED, in red                                                                    | the reason                              |

  The sounds, camera shake, rumble and particles in events.js are as they were.

- **The score**, top right in GTA's money style (big white figures, thin black outline, "pts"),
  with the last gain under it in gold. It shows while the top bar is up and for five seconds after
  a gain, so it doesn't sit on a clean screen; below the credit while the bar is up, in the corner
  once it has gone.
- **The help box**, top left: GTA's dark box, white words, key names (`<b>` in a hint) in white key
  caps. Hints wait their turn, one at a time for their own time, cut to 2.2 s when others are
  waiting; a hint that has waited 9 s is dropped, and so are the waiting ones on a world change
  (they were about the world you left). The fan's and the units' hints replace the last one at once
  rather than queue. `hud.popup(html, ms, 'hint')` is unchanged, so main.js's hints land there.

### The keys card (index.html, panels.css)

- Restyled as a GTA pause-menu card: a big italic title, white tab headers (Drive, Fly, Game),
  rows of keys in white key caps, a dark translucent body, two columns so it ends above the radar.
  New rows: U (km/h · mph), and a legend for the radar's gold blip and bars.
- Shown on the first visit only (`localStorage['roadster.keysSeen']`, in a try/catch); after that a
  "Press I for the controls" hint at the start instead. Touch screens never show it (no keys). I and
  the Keys button toggle it as before. While it is open on a window 1000 px or wider, the stunt
  titles and the test site's captions move into the space beside it, a little smaller.

### The loading title card (index.html, panels.css)

- GTA-style: golden hour over an SVG skyline of palms, Santa Monica's low-rise, Century City's
  towers and Downtown's skyline; "TESLA ROADSTER" over "LOS ANGELES"; a tip in a dark box bottom
  left; a spinner and "Loading" bottom right. Eight tips, five seconds each, starting at a random
  one (a few lines of inline script before the bundle set the start; the cycling itself is CSS, so
  it carries on while the city builds). A failure to start is said in a box of its own in place of
  the tips and the spinner: it is the card's first `div`, where render/scene.js already writes
  "WebGL is unavailable" (`#loading div`), and the 15 s watchdog writes its "did not start" there
  too unless scene.js got there first. Chrome paints the card before the bundle runs (first paint
  at 68 ms headless).

### The test site's demo (base.css)

- Captions as a mission title: a gold eyebrow, the title in big italic outlined capitals, a white
  line under it. The countdown is big italic outlined figures, GO in green. The autopilot pill and
  every caption and countdown write are as before.

### Phones (phone.css)

- The drive pad keeps the bottom corners. Upright (390 × 844): the title over the buttons, the
  radar (160 px) over the left cluster, the speedometer and the place over the right one, smaller
  pads (50 px) so both clusters fit across. On its side (844 × 390): the radar over the left
  cluster, the place and the instruments (figures only) over the right, the speedometer between the
  clusters at the bottom, the credit left out. The help box and the score sit under the bar.

### New keys

- **U**: the speedometer in km/h or mph (remembered). Also a click on the unit.

### Hook-ups in main.js (two lines, both commented)

- `const hud = new Hud(RS, damage)`: the HUD reads the dents for the condition bar.
- `KeyU: () => hud.toggleUnits()` in the command keys.

### Files

- Changed: index.html, css/base.css, css/hud.css, css/panels.css, js/ui/hud.js, js/ui/minimap.js,
  js/events.js, js/main.js (the two lines above), dist/roadster.js (rebuilt).
- New: css/notify.css, css/phone.css, js/ui/dom.js (`$` and `put`), js/ui/prefs.js (localStorage
  in a try/catch), js/ui/speedo.js, js/ui/place.js, js/ui/instruments.js, js/ui/notify.js,
  js/ui/radarMap.js, docs/la/hud.md.
- The HUD still writes the DOM only where it changes: every write goes through `put` (now also
  for a single class), and the sub-modules skip their writes while hidden.

## How it was checked

- `npm test`: 82 pass, including the bundle-freshness check. `prettier-standard --check` passes on
  every changed JS file (main.js has one older line it would wrap, not one of the two added).
- Headless Chrome through the screenshot tool, at 1280 × 720, 1920 × 1080, 1024 × 640 and a
  700 × 600 window, and as a phone (touch emulation, so `pointer: coarse` applies) at 390 × 844 and
  844 × 390, 2x: the loading card (from a copy of the page without the bundle, as it only shows
  until the first frame), the intro on a first and a returning visit, driving off (the car's name),
  at speed with the screen gone quiet, a junction (the cross street), NEAR MISS ×2, DOUBLE STUNT
  BONUS, a hint, flying (the instruments, the radar zoomed out), night, the test site (caption,
  countdown, instruments, "McGregor, Texas"), the ABS, Track Mode and e-brake lamps, mph, a linked
  drift, a wreck, and the mouse waking the screen. Before and after pairs of the same moments.
- In the page: three hints pushed at once came one at a time; the screen went quiet after three
  seconds of W and woke on Tab, staying up with focus in the bar; a sim donut at 3 read DONUT ×3;
  U stored mph; driving north into the Wilshire junction read "La Cienega Blvd / Wilshire Blvd"
  over Mid-City; city hints queued before a switch to the test site were dropped; two near misses
  three seconds apart read NEAR MISS ×2 with their points added.
- An independent review of the diff (by an agent that hadn't written it) found five issues, all
  fixed and checked in the page: the faded top bar's buttons still took taps on a phone (now they
  don't until it is back), a returning visitor's "Press I" hint was cleared by the boot's world
  switch (now given on the first update), scene.js's WebGL message would have landed in the
  skyline (now the card's first div is the message box), the help box and the score could overlap
  on an upright phone (the box is narrower there), and a near-miss run ended with its title
  (2.4 s) rather than after 3.5 s (the run now outlives the title).

## Known issues

- The pier on the radar is a sketch (a 130 m deck, a fairground to one side) placed from
  LANDMARKS.pier, as the pier itself is still being built; if its length or side differs, the radar
  won't match it. The sign is a blip only.
- The condition bar reads render/damage.js's summed dent depth. Nothing happens at zero (it blinks
  red) until a reset: the sim has no health.
- ESC and traction control share one lamp: the sim only says `escActive`.
- The HUD's timers run on the frame's time, which main.js caps at 50 ms a frame: at a very low
  frame rate (as headless), hints and lines stay up longer in real time.
- Two blips can sit on top of each other on the rim (north and the sign when heading east).
- Under 1000 px wide, a stunt title can cross the keys card (only up on a first visit, or on I).
- The loading tip only changes if loading takes more than five seconds; on a fast machine the card
  is up for about a second.
- On touch screens the line of keys and the keys card are hidden, as before: the help box is how a
  phone player is told things.
- The README's HUD paragraphs (the radar, the telemetry strip, the Controls table) need these notes
  folded in, with U.

## What the sim could expose to make the HUD better

- A condition of its own (0 to 1, or what has been hit), rather than the HUD reading the renderer's
  dents; it could then mean something (a smoking, limping car) as GTA's does.
- `tcActive` beside `escActive`, so the lamp could say TC or ESC.
- The gear the driver has chosen (input.js knows when S has turned into reverse after the stop
  hold), rather than the HUD reading it off the controls.
- A drift's running length and angle as it happens (`sim.drifting` has them) and a near-miss streak
  count, for a live GTA counter while a drift or a chain is still going.
- The landmarks' size and heading in LANDMARKS (the pier's length, width and side), so the radar
  draws the real thing.
