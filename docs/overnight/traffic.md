# Traffic and pedestrians: notes

Branch `agent-traffic`. Everything below is in files this area owns, plus new modules. No shared
files were edited (main.js, events.js, ui/, index.html and css/ are untouched).

## What changed, and why

### Drivers (js/sim/drivers.js, new; traffic.js, sight.js, manners.js)
- **Each driver is their own** (`temperament`): desired speed (16% dawdle at 80 to 90% of the
  usual pace, 64% keep to about it, 20% press on at 110 to 134%), time gap (0.9 to 1.8 s), gap at a
  standstill, pull-away and braking (per type: a bus pulls away at about 1.1 m/s², a taxi at 2.8),
  reaction time (0.45 to 1.25 s), how fast the pedals move (jerk), cornering grip, boldness at an
  amber, the gap they take to turn left across traffic, patience, how long they signal first.
- **Smooth pedals**: the IDM acceleration is the driver's wish; the actual acceleration follows it
  at a limited rate (2 to 5 m/s³, 40 m/s³ when they need to brake harder than comfortable) and goes
  on at once only in an emergency (the braking needed to stop short exceeds 5 m/s²). Speed never
  jumps; at a standstill the acceleration is zero (nothing pitches the body).
- **Queues move off in a wave**: a stopped driver only moves off once there is a reason to (the car
  ahead has moved off about 0.6 m, or the light has changed) and their own reaction time has passed.
- **Creeping at red lights**: the front car stops 0.6 to 2.8 m short of the line and, after a few
  seconds, edges up to it; the queue behind inches up with it.
- **Ambers**: a driver stops if that needs no harder braking than they are willing to use (2.7 to
  4.6 m/s²); about 7% of drivers ("runners") go on whenever they will be over the line before red. A
  driver who decided to go but was held up stops again at red if they still can, and anyone whose
  nose is over the line at red stays put if they are stopped.
- **Keeping the junction clear**: nobody pulls into a junction unless there is room on the lane
  beyond it for them (after whoever is already crossing to it).
- **Left turns**: unchanged gap logic (now each driver's own gap, 3.3 to 4.7 s); a driver who has
  waited at the line is primed (quick off) and may go on the amber, or in the first moments of the
  red, if they can be in the junction within a couple of seconds and the oncoming traffic is
  stopping.
- **Lane changes**: indicator first (0.8 to 2.3 s), then the move over on a quintic S (no lateral
  jerk at either end) over a distance that scales with speed (never shorter than 9 m), the nose
  turned into the move. While changing, the car also keeps its distance to the car ahead in the
  lane it is leaving. Bold drivers overtake a slow car when the other lane is moving better. A lane
  change waits for the Roadster too, coming up in either lane.
- **Turning paths**: cars look along the path they will actually drive (round the arc of their
  turn, then down the lane they turn into), and count any part of an obstacle reaching across
  their path, not just its middle. A car already crossing a junction is given extra room by one
  that comes in later.
- **Steered offsets** (`steer`): anything that takes a car off its lane's line (a swerve, pulling
  back into lane after a knock, tucking in towards the kerb for the Roadster) is steered: heading
  `psi` turns at a curvature the tyres can hold at that speed, and the car only moves sideways as it
  rolls forward (no sliding sideways at a standstill).
- **Standoffs**: two (or three) cars at a standstill in a junction, each waiting on the next, are
  sorted out by the one that came in last backing up a few metres (reversing lights on), if there is
  room behind it.
- **Recovery**: a car that has not moved for a minute, out of sight and over 60 m away, is taken off
  the road (and recycled elsewhere). New cars spawn well back from the stop line and clear of the
  lane beside them (a car changing lanes there included).

### Reactions to the Roadster (js/sim/react.js, new; manners.js, wrecks.js)
- **Coming at them**: a Roadster closing at over 7 m/s that will be in the car's path within about
  1.6 s has the driver stamp on the brakes (about 7 m/s²), swerve away from it within their half of
  the road (never into a car alongside, never up the kerb), and lean on the horn.
- **Landing in front**: when the Roadster comes down on the street, every car heading at it within
  50 m panics the same way; others close by honk.
- **A hard hit** on a car (over 4 m/s at the contact) has the drivers within 22 m brake and honk.
- **After being hit**: the knocked car slides to a stop (as before), then sits 3 to 7 s with its
  hazards on, honking if the Roadster is still within 30 m, then, if it is within 3 m of its lane (or
  the one beside it) and facing within 40° of its way, it steers back into the lane from where it
  is and drives on. Otherwise it stays a wreck until recycled out of sight.
- **Chain reactions**: a car knocked sliding knocks other cars (and parked ones) loose in turn; a
  `clash` sim event is emitted for each hit over 2 m/s (`{ x, z, impact }`).
- **Behind a wreck**: drivers held up by something that isn't going anywhere (a wreck, a parked car,
  the Roadster, a car itself held up) move over to the other lane after 2 to 4 s and give an
  impatient toot if it lasts.
- **Honked at from behind**: in the inner lane they move over (as before); in the kerb lane they
  tuck in towards the kerb and slow down to let the Roadster by.
- The first-horn rule is untouched: every honk still goes through `honk()`, which stays silent while
  `traffic.quiet`.
- Bump events from `collidePlayer` carry the contact point and normal (`px, pz, nx, nz`), as the
  lead asked.

### People (js/sim/peds.js, crowd.js and pavement.js new)
- Each person has their own build (`tall`, `wide`, now in the sim) and pace (14% slow walkers, a few
  joggers at 2.5 to 3.3 m/s), some walk in pairs side by side (and cross together), some stand about
  (on the phone, waiting, chatting face to face), and walkers sometimes stop for a moment.
- Heads turn to follow the Roadster within 30 m when it is loud (over 40 km/h, or on the horn);
  someone standing turns to face it.
- **Panic**: the Roadster on the pavement over 15 km/h, a crash, a landing, a hard bump, a car knocked
  into another or a post snapped sends everyone within 16 to 40 m running along the pavement away
  from it (arms up, at 3.6 to 5.2 m/s) for 4 to 8 s, then they walk on; anyone mid-crossing hurries
  over. Nobody is ever run down (the dive is unchanged).
- **Jaywalking**: now and then someone on a straight stretch of pavement, away from the corners and
  not by the jammed street, crosses straight over once no traffic is within 12 m plus 4.5 s of it
  either way. Traffic and Autopilot stop for them as for anyone in the road.
- The stride is timed to the speed and the legs' length (see the renderer), so feet stay planted.

### For the sound agent
- `peds.panic`: how many people are running scared right now; `peds.scream`: how many started this
  step (sum it over the frame's steps for screams to trigger); `peds.panicX`, `peds.panicZ`: where
  the last fright was.
- Sim event `clash` `{ x, z, impact }`: two cars hit each other (a car knocked loose into another).
- Car fields that may help: `car.acc` (the car's acceleration, m/s², smooth), `car.v` (negative
  while reversing), `car.panic > 0` (startled, braking hard), `car.brake`.

### Render (js/render/traffic.js, peds.js)
- Car bodies on a damped spring per type (cars 1.5 Hz, vans 1.15 Hz, a bus 0.9 Hz and softer),
  driven by the sim's own acceleration (`car.acc`) and yaw rate (`car.yr`), not by differentiating
  per frame, so far-off cars stepped less often still ride smoothly. Nose dive and squat scale with
  the type, roll with the speed times the yaw rate (most for a bus), and a car knocked sliding leans
  into the slide.
- Reversing lights (white) when a car backs up; each car's indicator flashes at its own rate (1.4
  to 1.6 Hz) and phase; paint follows a real city's mix (a quarter white, a fifth black, then greys,
  silvers, blues and reds, rarely beige, green or orange).
- People: new `aAct` attribute (head turn, phone, talking, gesture clock). The gait is planted: each
  leg goes from forward to back at an even pace through its stance and swings forward smoothly,
  the knee folds through the swing (more running), arms swing against the legs with elbows bending
  more as they speed up, the upper body twists against the stride and leans in to a run, and the
  body rises over each step. A phone appears in the right hand, held up in front, head bowed.

### Performance
- Interleaved benchmark in one Node process (same CPU load for both; the machine was heavily
  loaded, so absolute numbers are inflated): baseline traffic 0.84 to 0.92 ms/step and people 0.35
  to 0.51; this branch traffic 0.78 to 0.91 and people 0.25 to 0.33. Together, lower than before.
- How: every car and person is created with all its fields (traffic.js `make`, peds.js `spawnAt`,
  including the fields tween.js, stunts.js, the sound and the renderer keep on them), so V8 keeps one
  shape per kind; no per-step closures or arrays; cars further than 110 m (200 m in sight) are driven
  every second step, beyond 170 m out of sight every fourth; people beyond 55 m (100 m in sight)
  every second or fourth step.

## How it was verified
- `npm test`: 58 tests pass (8 new). New: tests/traffic.test.mjs (drivers differ; a queue moves off
  in a wave, each a moment after the one ahead; a 300 s run with no car through another, no late red
  light runs, no instant speed change, no snap in heading, no jump along the road and no standstill
  over 75 s; a Roadster coming head-on makes the driver brake hard, swerve and honk; a knocked car
  sits with hazards, then steers back into its lane without snapping; the Roadster landing in front
  makes drivers brake hard). tests/peds.test.mjs: jaywalkers counted in the long run (traffic never
  runs into anyone), pairs, idlers and joggers present, the Roadster on the pavement sends people
  running (and screaming) and they calm down, nobody under the car, everyone still on the pavement.
- Long diagnostic runs (harness in /home/claude/work/harness/traffic: diag.mjs, why.mjs, ap.mjs)
  over several seeds, checking red runs, overlaps and long standstills; the baseline itself had a
  few overlaps per 300 s (cars changing lanes into the car ahead in the lane they left, turning cars
  that only looked straight ahead), which are fixed.
- Headless Chromium screenshots (look.mjs) at junctions by day and night and of a panic, with no
  console errors.

## Phase 2: how the cars and people look, and the last standoff

### Cars (js/render/carShapes.js, carLamps.js new, traffic.js)
- **Lamps as real units** (carLamps.js): each headlight is a rounded lens in a dark housing, with a
  running-light strip along its top (lit day and night; the main lens lights at night) and an amber
  indicator at its outer end; each tail cluster is a red lens (red by day, unlit) with an
  amber indicator and a white reversing lamp (side by side on a saloon's wide low lamp, stacked on
  the tall corner lamps of hatches, SUVs, pickups, vans and buses); hatches, SUVs, vans and buses
  have a high-mounted stop lamp on the tail, a pickup on the back of its cab; side repeaters sit on
  the front wings; a taxi's roof sign and a bus's route board (front and back) light up. They are
  baked into each type's trim mesh with a per-vertex lamp tag, and lit from one per-car instance
  attribute (`aLit`: headlights at night; tail lights; braking; flags for each indicator,
  reversing, the route board and the running lights), in the trim's own shader. The four separate instanced
  lamp meshes (heads, tails, blinkers, reversing) are gone.
- **Body**: passenger cars lose the black bumper boxes; their bumpers are the body's own rounded
  ends, with a darker plastic valance under them (done in the paint shader by position: dark,
  rough, no clear coat), and SUVs and pickups get dark cladding along the sills. Wing mirrors are
  caps in the body colour on black arms, with glass. The side windows are framed in black along
  their tops. Number plates front and back have the registration in dark letters and a blue band.
  The grille has a lighter surround. An SUV now has a proper tailgate (the roof runs back to the
  tail) rather than a sloping fastback. Pickups have pale grey bumpers.
- **Bus**: a windscreen and a back window, window pillars down both sides, its doors, the route
  board lit amber. Vans have windows in their rear doors.
- **Paint**: a harder clear coat (clear coat 1, clear coat roughness 0.045 over a base at 0.36
  roughness, 0.5 metalness), so the city's sky sits sharp in it.
- **Cost**: body, glass and trim with lamps went from about 900 triangles a car to about 1,370
  (wheels add about 1,300 either way, so a whole car is about 16% more), and the traffic draws in
  four fewer calls (26 instanced meshes instead of 30).

### People (js/render/peds.js)
- A torso narrowing from rounded shoulders to the waist on a neck, an oval head with fuller hair,
  rounded hips, instead of boxes. Each person dresses their own way (from their look): long sleeves
  (a jacket or a long-sleeved top) or bare forearms, trousers, shorts or a dress (a flared skirt, bare
  legs), long hair or short, a shoulder bag at the hip or a backpack, dark shoes or white trainers;
  skin from pale to deep brown, hair from black through brown to fair, and grey. The parts only some
  people have are folded away to nothing in the vertex shader for everyone else, so it is all still
  one draw call.

### How phase 2 was verified
- A "showroom" harness (/home/claude/work/harness/traffic/showroom.mjs) lines up all seven types on
  an empty street and shoots them from the front, back and side by day and night, close up and
  wide, and a row of people with chosen looks; plus normal play views behind cars (look.mjs). No
  console errors. Draw calls and triangles counted from the traffic's instanced meshes after the
  frame's culling.
- tests/carlooks.test.mjs: every type's trim carries its headlights (at the front), tail lights (at
  the back), indicators, reversing lamps, the taxi's sign, the bus's route board and the high stop
  lamps, a lamp tag for every vertex, and each type stays under 1,600 triangles.

### Standoffs (js/sim/react.js, drivers.js, sight.js)
- Two or three cars at a standstill in a junction, each waiting on the next, where none of them has
  room to back up: after six seconds the one that came in first edges past at a crawl (1.5 m/s),
  judging the gap by the cars' bodies alone rather than the half metre either side drivers usually
  leave, if there is a gap at all.

## Phase 3: cheaper to draw, nothing allocated per frame

- **Shadows only near the Roadster** (render/traffic.js, render/peds.js): cars and people within
  45 m of the Roadster (`NEAR`) go first in their instance lists, and the shadow pass draws only
  those (`onBeforeShadow` sets the instanced mesh's count to the near ones, `onAfterShadow` puts it
  back). The Roadster's shadow map is 60 m across, so nothing near the car looks any different.
- **Plain far wheels** (carWheels.js `farWheelGeometry`): beyond 45 m a car's wheels are an eight-
  sided tyre with flat grey rim discs, 96 triangles against 320 for a near wheel with its rims, in
  one draw for all of them.
- **Allocations**: the drivers pass an obstacle object (sight.js `OB`) rather than ten numbers per
  check, and the ray and arc tests write their result into a scratch object: in V8 every number
  passed to (or returned from) a function that is not inlined is a new heap object, and this runs
  for every car and every obstacle each step. Each car and person reads its step from itself.
  Every car, person and lane edge is made with all its fields, and the first car's (and person's)
  fields are set once to what they may later hold (`warm` in traffic.js), so their shared shape
  never changes in play; before, each first store of a new kind of value changed it, threw away the
  optimised driving code, and while that was gone every number cost an allocation. Edges were of
  four shapes (lanes, the jammed lanes, straight and turning connectors): now one. The renderers
  write vectors, quaternions and instance attributes field by field and allocate nothing; pavement
  rings are made once per block and line; `choose`, `oncoming` and the standoff check no longer
  make closures or arrays.
- **Measured** in headless Chromium (measure.mjs, measure2.mjs), against the merged branch before
  phase 3, at a busy downtown junction:
  - one scene render, shadow maps included: traffic and people 70 draw calls and 1.42 M triangles
    before, 34 and 0.52 M after;
  - warmed-up allocations per call (CDP sampling heap profiler, collected objects included):
    TrafficView.update 228 KB before, 33 KB after (a frame with all of the ~400 cars drawn);
    PedView.update 28 KB before, 11 KB after; a 1/60 s of sim (Roadster, traffic, people) 496 KB
    before, 92 to 114 KB after (it varies run to run).
  - in Node (alloc.mjs), the traffic's drive() went from about 115 MB to under 10 MB per 15 s of
    sim.

## Phase 4: the review's findings
An independent review of the traffic and people found ten problems; all are fixed, each with a
test where one could be written (tests/giveway.test.mjs, new; each of its tests but the wreck one
fails on the code before the fix).
1. **Autopilot frozen at a left turn after the hop.** Its own held green kept the walk off at that
   junction, so people piled up on the kerb; an oncoming right-turner stopped for them, so the left
   turn never had a gap, and as waiting for oncoming traffic counted as a red, Autopilot never
   counted as stuck either (the cross street waited 700 s and more). Now (cityPilot.js) after
   10 s giving way it goes another way, or, still on its way to the gridlock, counts as stuck and
   takes off over it; while a light is held, people cross the street it holds at red, a few
   seconds every half cycle (pavement.js `walkOn`). In the reviewer's runs Autopilot's longest
   standstill went from 760 s and 613 s (seeds 3 and 4) to 10 s.
2. **People waiting at the kerb counted as in the road**: their spot was on the rounded corner's
   edge, some of them out on the asphalt, and right-turners on a green stopped for them. Now they
   wait back on the pavement (pavement.js `standBack`, at least 0.6 m in from the kerb), and none of
   them is in `traffic.peds` (it was about 58%).
3. **Nobody went round the Roadster stopped in their lane** (a queue of six behind it at the city
   spawn for good), and hardly anyone round a wreck. canMerge (now in sight.js) counted the Roadster
   as in the other lane whenever it was within 5.5 m sideways, and any wreck within 9 m. Now the
   Roadster counts only if its footprint reaches into that lane, or it is pulling over into it; a
   wreck only if it reaches far into it (drivers edge round one that reaches in a little, react.js
   `roomRound`). Behind the stopped Roadster or a wreck, drivers stop far enough back to pull out
   (`pullOut`), decide sooner than behind traffic, and only start a change from a standstill with
   that room (`roomOut`); a stopped Roadster, like a wreck at rest, is crept past closer than one
   moving.
4. **People missed crashes inside traffic.step** (its events were cleared before their next step):
   traffic now keeps them for the people (`traffic.heard`, read in crowd.js `alarms`).
5. **A reset mid-air set off a landing panic at the spawn**: Traffic.reset and Peds.reset clear
   `wasAir` (and the people's `lastMode`), and the people's landing scare is only for a landing in
   the street (y under 1 m), not on a roof.
6. **Buses swept out of their lane**: a lane change is now at least 2.2 car lengths (26 m for a
   bus, where a 9 m change turned its nose 36 degrees), a bus doesn't start one at a crawl unless
   held up, and on a turn the path check is widened on the outside by how far the front corner
   swings out (sight.js `arcGap`); a turning bus also watches the cars at the junction's lines and
   those setting off in the lane beside its exit (drivers.js `atLines`).
7. **A car stopped at a red with its nose over the line** is now in `box`, so cross traffic drives
   round it. A standoff ring whose latest car can't back up any further (at the start of its turn)
   now picks one that can, the car over the line among them (react.js `canBack`).
8. **Instance uploads**: the car and people renderers send the GPU only the instances drawn
   (`addUpdateRange`), 33 KB and 41 bufferSubData calls a frame in the reviewer's harness, against
   1171 KB and 50.
9. **Wrecks for good**: a wreck at rest skips its wall query, and a parked or jammed car knocked
   loose is put back in its place once it and its place are out of sight (20 s after the knock).
10. **Spawning on someone**: new cars spawn clear of people in the road and of wrecks.

Also: the meshes all cars share (the shade under each, the beams, the wheels) are sized for the
same 420 cars as each type's, and a car past that is now not drawn rather than written past the end.

Verified with the reviewer's long.mjs runs (Autopilot seeds 1 to 4, wild seed 3, parked seed 11,
400 to 500 s each, people included): no car through another (seed 2 had 39 overlaps, all a bus
changing lanes at a crawl), nobody under a car, no late reds, no NaN, no list errors; the longest
standstill of any car about a minute. The reviewer's browser.mjs: no console errors or warnings, no
GL errors, nobody fleeing after R mid-air. `npm test` 68/68. The step costs are about what they
were after phase 3, within the noise of this machine (traffic.step 0.12 to 0.19 ms per 120 Hz step
with the Roadster parked, against 0.16 to 0.34 ms before, each in its own process); people's step
a little less, as fewer of them are in the road.

## Known issues
- In rare cases two cars merging into the same lane from different turns stop nose to nose, so
  close that even edging past by their bodies alone has no gap; they wait (honking) until one is
  recycled out of sight.
- Left turners at a busy junction can wait two light cycles (up to about a minute).
- A queue behind the stopped Roadster empties one car at a time, each pulling out after a few
  seconds; a bus behind it waits rather than swinging out at a crawl.
- A car knocked far out of line, or spun round, stays a wreck with its hazards on until it is out of
  sight (as in GTA), rather than driving off.

## README-ready prose
Each driver in the city is their own: some dawdle, most keep to about the limit and a fifth press
on; they follow at their own distance, pull away and brake at their own rate and react at their own
speed, so a queue moves off at a green in a wave, each car a moment after the one ahead. Nobody
stamps on the pedals without reason: speed changes smoothly, the brakes come on hard only in an
emergency, and the bodies dip, squat and lean on their springs with it (a bus slower and softer).
Drivers stop a little short of the line and creep up to it, a bold one goes on through an amber
they could have stopped for, nobody pulls into a junction with no room to get out of it, and a car
turning left waits for a gap and then goes as the light changes. A lane change is signalled first
and eased over on a smooth S; quicker drivers overtake a slow car. Come at a car and its driver
stamps on the brakes, swerves and leans on the horn; come down from the air in front of them and
everyone ahead panics; hit one and it slides to a stop, sits there with its hazards on (its driver
honking if you are still about), then steers back into its lane and drives on, while the cars
behind move over to get round it. Stop in the street and the cars behind you, after a moment, pull
out and go round you too. A car you send sliding into another knocks that one loose too.
Two cars stuck nose to nose in a junction sort it out, one backing up (reversing lights on) to let
the other by. People walk at their own pace and build, some in pairs, some jogging, some standing
about on their phones or chatting; heads turn to follow the Roadster when it goes by loud and fast;
now and then someone jaywalks once the traffic is far enough off (it stops for them). Drive on the
pavement, crash, land or hit something hard nearby and everyone round about runs screaming along the
pavement away from it, then calms down a few seconds later.

The traffic is built the way cars are: headlights in their own lenses and housings, with running lights
along their tops by day and the indicators at their outer ends, red tail clusters with their
indicators and reversing lamps (brighter as the car brakes, white as it backs up), a high stop lamp
on the hatches, SUVs, vans and buses, repeaters on the front wings, a lit sign on every cab and a
route board on every bus; body-coloured bumpers over a dark plastic valance (and dark cladding along
an SUV's or pickup's sills), body-coloured wing mirrors, framed windows, number plates front and
back, and paint under a hard clear coat with the sky in it. Buses have their windows down the side
between pillars, a windscreen and a lit route board. People are shaped rather than boxed, and each
dresses their own way: a jacket or bare arms, trousers, shorts or a dress, long hair or short, a bag
or a backpack, dark shoes or white trainers.

New files: js/sim/drivers.js (each driver's temperament and the driving itself), react.js (how
drivers react to the Roadster, and sort out standoffs), crowd.js (people beyond getting about:
pairs, idling, looking, panic, jaywalking, dodging), pavement.js (the pavement rings and crossings),
signals.js (the traffic lights, re-exported by city.js), js/render/carLamps.js (the traffic's lamp
units, lit per car); tests/traffic.test.mjs, tests/carlooks.test.mjs, tests/giveway.test.mjs.
