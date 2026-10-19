# Damage and crashes: notes

The Roadster dented where it was knocked, but the traffic showed nothing, however hard it was hit:
a car shoved across the road at 60 km/h slid to a stop on locked tyres, sat a few seconds with its
hazards on, and drove off as new. Now the cars are damaged as GTA V's are. A hit crumples a car in
where it lands, breaks the lamps on that side and crazes or bursts the glass of that face; a car
with some damage drives on slower, steaming from under its bonnet if its engine is hurt; one hit
hard enough, or often enough, is a wreck, which stays where it stops, hazards on and smoking, while
its driver climbs out and goes off to the pavement, until it is towed. The Roadster's own lamps and
glass break too, and what is heard and seen in a crash now follows what broke. What changed, why,
and how it was checked.

## What changed, and why

- **A car's damage** (`js/sim/carDamage.js`, new): made at the first hit that leaves a mark
  (`car.dmg`, one field in the car literal, so every car keeps one shape): twelve zones round the
  footprint (the four corners, the middle of the nose and the tail, three along each flank), each
  pushed in so many metres; the lamps broken, by end and side; three bits a pane for the windscreen,
  the rear window and each side's windows (whole, crazed by degrees, or gone); the harm taken. Every
  hit feeds it: the Roadster's (`collidePlayer`), a car's knocked into another (`bumpLoose`), a
  sliding car's into a wall or a post that stands (`slide`, which was silent before) and through one
  it snaps. How much a hit does goes by its closing speed past 2.5 m/s (where the Roadster's own
  dents start) and by the masses: a car takes `2 mo / (m + mo)` of the blow, between 0.35 and 1.6,
  so a bus barely marks and a wall hurts most. Nothing in it draws random numbers.
- **Where it landed** (`landed`, carDamage.js; used in wrecks.js and collide.js): the collisions
  push apart at the deepest corner, which for a square hit is one of the two front corners by a
  tie-break, so the middle of a nose dented a corner. The damage (and the Roadster's dents, its
  lamps, the sparks and where the knock is heard) now goes by the middle of the patch the two
  footprints really share: one footprint clipped by the other's sides, and the clipped shape's
  centroid. The impulses still use the corner, so the handling and the spins are as they were.
- **One crash, once** (`onset`): the Roadster shoving a car along touches it again a step or two
  after the first hit, at the same speed (a side hit at 42 km/h came in as 11.8 m/s and then 11.9),
  which counted twice. Touches within 0.3 s of the last now count as one crash at its hardest: a
  harder one adds only what it adds, a softer one nothing.
- **What a hit does, by speed** (a sedan hit square on the nose by the Roadster, at that closing
  speed: `hurt` itself):

  | | 18 km/h | 22 | 29 | 32 | 36 | 43 | 50 | 58 | 65+ |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Nose pushed in (m) | 0.05 | 0.08 | 0.12 | 0.14 | 0.17 | 0.21 | 0.25 | 0.30 | 0.32 |
  | Headlights | | | | both | both | both | both | both | both |
  | Windscreen crazed (of 6) | | | | 2 | 3 | 4 | 5 | 6 | 6 |
  | Harm (a wreck at 1) | 0.12 | 0.20 | 0.35 | 0.42 | 0.51 | 0.69 | 0.89 | 1.12 | 1.33 |
  | | | | | | steam | steam | steam | wreck | wreck |

  Off the middle of an end, a lamp goes from 20 km/h (5.5 m/s) on that side only; from the middle,
  both, from 32 km/h. A corner hit breaks its lamp and crazes the end's glass and the side's; from
  50 km/h (14 m/s) side and rear glass shatters and falls out (a windscreen, laminated, only ever
  crazes). Harm adds up: six hits at 22 km/h, three at 29, or two at 36 make a wreck. A car steams
  from a harm of 0.5, or a nose pushed in 16 cm.
- **Seen on the car** (`js/render/carDents.js`, new; `render/traffic.js`): each car's damage goes
  to the GPU as two numbers of four a car (`aDent`, the twelve zones packed three to a float, 8 bits
  each, 2 mm a step; `aHurt`, the lamps, the glass, the type and a seed for its crumples), one pair
  of instanced attributes per type that its body, glass and trim meshes all read. Every one of those
  meshes is bent in its vertex shader by the same function of where each vertex lies on the car at
  rest, so the paint, the glass, the trim and the lamps on it move together and nothing comes apart
  (the shut lines included); the wheels are separate meshes and stay where they are. The zones are
  drawn through smoothly along each face, reaching in from the face further the deeper they are
  (never so steeply that a panel folds over itself), more low down than at the roof, unevenly across
  the face; a bonnet or boot lid crushed from its end buckles up, and the metal folds as it goes in.
  The shadow's depth material bends the same way. The crumpled metal takes its own facets' normals
  and fine crinkles, and the paint over it loses its gloss and is scraped through to the grey primer
  in streaks; the lamps at the broken end and side (headlights, running lights, tail lights,
  reversing lamps, indicators, side markers) go dark and smashed, cut at the middle of a light bar,
  and the car's beam on the road goes with its headlights. The glass cracks in a spider's web from
  the middle of the pane, running further and finer the worse it is, milky round where it was hit;
  a pane gone is the dark of the cabin with a few crazed shards left in the frame. A car whole skips
  all of it. It is written for any type and any part: a new type gets it with no more work, and any
  other part a type is given is bent with its body.
- **Steam and smoke** (`js/render/wreckSmoke.js`, new, on smoke.js): a hurt engine steams, white
  and quick to go, trailing behind the car as it limps on; a wreck sends up a column of thick dark
  smoke with a little steam in it, carried off on the breeze. From the gap at the front of the bonnet
  and the bonnet itself (a bus's from the engine at its back), for the cars within 140 m.
- **What it does** (`wrecks.js`, `drivers.js`, `traffic.js`): a damaged car drives on at down to
  half its own pace (`dmg.limp`, applied where the driver picks a speed, so a police car's call and
  the weather leave it alone), and bold drivers overtake it. A wreck, once it has stopped, stays
  there, hazards on, and nobody drives it away; the traffic goes round it as it went round any car
  at rest in its lane (edging round it, or changing lanes). Its engine is dead (`audio/mix.js` gives
  it no voice).
- **Round a wreck that blocks the street** (`react.js`; four lines in `drivers.js`, one in
  `laneChange.js`): a wreck thrown across both lanes of its side of the street held everyone behind
  it for as long as the camera could see it (the wip's own known issue: 120 s watched, nobody by).
  Now the one held up behind it in the inner lane, after 3 s, goes round it on the wrong side of
  the road, as GTA's drivers do and as the police car on a call goes round a queue
  (`responder.js`: the same check that the inner lane the other way is clear for as long as it
  will take, nothing turning into it), 3 m off its line, or up to 4.6 m round one that reaches over
  the centre line; it creeps on as it turns out, sees the cars coming the other way while it is
  over there (and they it), and pulls back in once past. It pulls up behind a wreck 4 m further
  back than behind a stopped car, to have room to turn out; one that ends up too close backs up a
  little first, if there is room behind it. The kerb lane's cars change into the inner lane and go
  round in turn (one changing lanes beside a car held up in the lane it is leaving no longer waits
  on that car once it is far enough over to clear it, or the two would wait on each other for
  good). A car coming the other way that has pulled up for one going round backs up a little, if
  it can, to let it by. All of it is only ever about a wreck (`dmg.wreck`): a car knocked loose
  that will drive on, and everything when nothing has been wrecked, is as it was, so the traffic's
  random numbers and every car's moves in a city without a crash are unchanged (300 s, 110 cars,
  120 people: the same positions and the same next random number as living-city's). A wreck is towed (taken off the road) once it has been out of the camera's sight for
  15 s and stood more than 40 m from the Roadster; a parked car knocked out of its place is put back
  in it as good as new (`restore`), a wrecked one once out of sight for 15 s; a car recycled out of
  sight comes back as a new car.
- **Its driver gets out** (`js/sim/alight.js`, new; three lines in `peds.js`): a moment after a
  wreck comes to rest (half as long as a shaken driver sits there before driving on), its driver
  climbs out of the front door on whichever side the pavement is nearer (over the seats if need be,
  not out into the traffic) and hurries off to the pavement on that side, as anyone does who has
  dived out of a car's way, then walks on with everyone else. Parked cars are empty, the gridlock's
  aren't. The people are drawn from a random stream of their own (`peds.X`), so their own sequences
  are as they were.
- **The Roadster** (`render/damage.js`; the lamps' materials marked in `roadster.js` and
  `roadsterRear.js`): a hard knock breaks its lamps on that side (the light line along the nose and
  the tail's light bar go out at their middle) and crazes the glass of the face it lands on (the
  windscreen, the rear glass, the canopy's sides or a door's pane), from the same rules as the
  traffic's (`Wear`); a crash crazes the face it lands on, or, on its roof, all of the canopy. A
  broken headlight takes half the headlights' light off the road, and its beam in the rain and the
  fog. Its glass only crazes, and nothing it takes slows it: it stays fully drivable. A reset or the
  demo restarting mends it with the dents.
- **The crash heard and seen** (`events.js`, `audio/impacts.js`, `render/effects.js`): glass used
  to burst in seven in ten knocks over 32 km/h, whether any broke or not, and the debris was always
  nearly half glass. Now glass bursts just when some broke (louder for a pane that goes, a small high
  tinkle for a lamp's lens), the steel crunches from the speed that dents the panels, deeper when a
  car is crushed into a wreck, and the debris is glass in the share of what broke (none, for a dent
  alone). A knock that breaks glass is heard even inside the knocks' 0.15 s throttle. Cars knocked
  into each other, or a car into a wall, are now seen as well as heard when near (sparks and the
  bits of what broke), and a wall or a post sounds as itself.

## How it was checked

- `tests/damage.test.mjs` (9): the Roadster driven into a car's nose, tail, each flank and a
  corner dents the zones on that side only, and a harder hit deeper (5 m/s against 14 m/s); the
  lamps on the side hit break (a corner its own, a gentle nudge none, a hard square one both, a flank
  none) and the glass of that face crazes; a wreck stays put, hazards on and smoking, its driver
  climbs out and walks off to the pavement, and the traffic behind gets round it without one car
  through another; a damaged car drives on slower than its own pace, a wreck out of sight is towed
  after 20 s or so, a wrecked parked car is put back in its space with no damage; denting a city's
  parked cars leaves its traffic and its random numbers exactly as in the same city undented; the
  Roadster's headlights break on the side it hits, its windscreen crazes, it drives on, and its
  wear mends. Added at the review: a wreck square across both lanes, watched from behind all
  along, is gone round on the wrong side by all three cars behind it, kerb lane and inner, within
  45 s, nobody through anybody (it fails on the wip, where none got by); a wreck's driver climbing
  out leaves the people's own random numbers as they were; and the Roadster's `Damage` itself
  (render/damage.js, on a stand-in car): a corner knock darkens that headlight and takes half the
  light off the road, a hard square one both and all of it, the windscreen crazes, the tail lights
  stay lit, and a reset puts the lamps, the light and the glass back. `npm test`: 148 pass.
- Without a crash nothing has changed: 300 s of the city (110 cars, 120 people, the Roadster
  parked) ends with every car and person where living-city's are and the same next random number;
  `npm test`'s long-run traffic tests pass unchanged; the shake figures are living-city's exactly.
- The street blocked by a wreck, watched (a scratchpad script; three cars behind it, 300 s): square
  across both lanes, between them, on the inner lane's line, or a little over the centre line, and
  turned 35 degrees: all three by in 15 s to 35 s, no car through another. In 110 cars of traffic,
  with cars coming the other way, 6 and 9 got by in 300 s on two layouts, at the gaps in the
  oncoming traffic; on the third, after one, a standoff with a car coming the other way held the
  rest (see below). Before, none got by on any of them while it was watched.
- In headless Chromium (the debugging hook; scratchpad scripts, outside the repo): a sedan hit at
  the nose (47 km/h), the right flank (47) and the rear right corner (40), at 15:30 and 21:30:
  crumpled where hit, the headlights dark and no beam on the road after the nose hit, the right
  tail light dark and the left lit after the corner, the windscreen, side windows and rear window
  crazed on the face hit, steam off the bonnet. A sedan wrecked at 68 km/h, by day and by night:
  its dark smoke rising and drifting, hazards on, its driver out of the door on the pavement side
  and walking off along the pavement 4 s later (6 m off). The Roadster after a 50 km/h hit at
  night and by day: the light line and both headlights dark, no light on the road, the windscreen
  crazed; after `R`, all lit and clear. No console errors (the only warnings were the sound's
  pitch clamped while the shot scripts ran the sim sixty times fast).
- The cost (the same view in both branches: the spawn point at 16:30, the camera fixed, the
  traffic and the people held still, about 400 cars in the city; per frame, all passes):

  | | living-city | After, whole | After, 23 cars damaged | And steaming |
  | --- | --- | --- | --- | --- |
  | Draw calls | 385 | 381 | 381 | 382 |
  | Triangles (M) | 1.503 | 1.509 | 1.509 | 1.509 |
  | Programs | 225 | 230 | 230 | 230 |
  | The traffic's view update, CPU (ms) | 0.40 | 0.40 | 0.30 | 0.30 |
  | Traffic step, 110 cars (µs, median 1 s block) | 63 | 70 | 81 | |

  The calls and triangles differ by the one car more in sight in this branch's run (the traffic
  had run a moment before it was held); damaging cars adds no call and no triangle, and smoke in
  the air one call (the smoke's one mesh, which tyre smoke and dust draw too). The five programs
  more are the Roadster's lamps (one and two sided), its glass, and the traffic's bent shadows
  (with colours per car and without), compiled with the rest at start-up (`warm.js`): none is
  compiled when the first car is damaged. Per car, 32 bytes more go up each frame (`aDent` and
  `aHurt`, two vec4s shared by the body, the glass, the trim and the shadow pass), on 224 before
  (three matrices, the colour, `aPaint`, `aLit`). In the vertex shader of each of those meshes, a
  whole car costs a sum, a compare and a branch and two varyings written (`vDentK`, `vDentP`); a
  damaged one, counted by hand, about 250 scalar operations, 16 of them sines (four edges eased
  through their zones, the reach in, five wrinkle terms, the lids' buckle), the glass three
  varyings more and the trim one; the branch is the same for every vertex of a car. The
  fragment shaders add the facets (`dFdx`, `dFdy`), the scuffs, the broken lamps and the glass's
  cracks (two cell noises of nine cells each, only on crazed panes). The view update's time is
  Chromium's (0.1 ms steps; 0.55 ms against 0.56 with every car drawn); damage costs it nothing
  measurable. The step: Node, interleaved runs, four of each, on a machine running three other
  browsers (load about 9 on 4 cores), so the spread is wide (whole: 67 to 73 µs against 59 to 69);
  a step without a crash does the same work as before but for the checks of `dmg`, and a quarter
  of the moving cars damaged run slower and so differently. The GPU's time can't be measured here
  (SwiftShader, software, about a frame every few seconds while the other browsers ran): what
  remains to be timed on a real GPU is the frame with no car damaged against living-city's (the
  vertex shader's branch and the bigger varyings), and with twenty or so damaged cars close up,
  where the bend's 250 operations a vertex and the glass's cracks are paid.
- At the merge: everything that changed in shared files is listed in the report.

## Known issues

- Going round a wreck on the wrong side, a car can meet one coming the other way that has pulled
  up for it; that one backs up if it has room, but in heavy traffic with none behind it the two
  wait, and the street behind with them, until the wreck is towed out of sight. A car backing up
  to get room keeps its angle (it slides back rather than steering in reverse).
- A police car on a call doesn't go round a wreck across its lanes (its own steering, `responder.js`,
  takes over from the drivers'); it waits until the call ends.
- The wheels don't move with the body: a corner crushed deep can leave a wheel standing proud of
  its arch, as GTA's do.
- The zones are spaced by the car's size, so on a bus's flank they are 2.9 m apart and a hit there
  spreads wider than on a car's.
- The mirrors' indicators, the high stop lamp, a light bar and a cab's sign never break; a window
  gone shows a dark, empty cabin.
- Smoke rises only from cars within 140 m of the Roadster, so a column far off isn't seen.
- The driver who gets out is someone new to the street (their clothes their own), and hurries off as
  everyone does who has dived out of a car's way.
- The Roadster's dents are still the first round's (moved on the CPU), its glass only crazes, and
  its shut lines and small trim pieces still don't move with a dent.
