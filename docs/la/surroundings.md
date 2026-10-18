# The city's surroundings and sky: notes

Everything past the ring road's outer pavement, and the sky and light, reworked so the setting reads
as Los Angeles: the Pacific and Santa Monica's pier to the west, the Hollywood Hills with their sign
to the north, and the city going on east and south behind an elevated freeway, under LA's golden
hour and its smog. Worktree branch `worktree-agent-aacc4dd5c8e87b752`, on `cf0ca6d`.

## What changed, and why

### The map's edges (js/sim/edge.js, new; areas.js `LANDMARKS`; street.js; collide.js)

- **Where things are.** Past the promenade's edge (`PROMENADE`, 492.5 m from the middle) the beach
  runs on the west only. North, east and south there is a 12.5 m verge out to the walls' face
  (`WALL`, 505 m): a concrete retaining wall 3.2 m high at the foot of the hills, and freeway sound
  walls 4.8 m high east and south. Each wall's collider runs 3 m back from its face, so nothing gets
  through it at any speed. The beach is closed at both ends by a groyne of rocks running out into
  the sea (colliders too). `keepIn(s)` replaces the square clamp at `OUTER` in `collideCity`: on the
  ground the car stops at the sand's edge (`OUTER`, as before) except on the pier's deck, and a car
  that comes down past a wall (flown over it) is put back on the verge in front of it.
- **The pier** is laid out once, in `LANDMARKS.pier` (areas.js: pure data, so the radar can read
  it): four rectangles meeting edge to edge (the long run out along Wilshire's line, 18 m wide and
  232 m long; the amusement park on its south side; the carousel's plaza on its north; a wider end
  to turn round on), the Ferris wheel's spot. edge.js works out the railings from that outline
  (every stretch of a rectangle's side with no deck beyond it, from 14 m out, so you can drive
  between the deck and the beach where it crosses the sand), and makes them colliders 1.1 m high, 3
  m deep out over the water. The pier's buildings (`PIER_HOUSES`: carousel, arcade, coaster station,
  restaurant, kiosks) are 'building' colliders, so you can land on their roofs; the arch's posts,
  the wheel's base and A-frame feet, its rim (posts at its height, for a car flying into it) and the
  coaster's columns are solid too. The renderer draws all of these from the same numbers.
- **The deck is drivable at street level**: level with the promenade (no kerb onto it), 11 cm above
  the sand, about 2.3 m above the sea. To give it that height over the water the sea came down from
  0.5 m to 2.2 m below the street and the beach's face got steeper (it drops 3 m over 12 m past
  where the car stops); the water's edge is now about 10 m beyond the car's stop on the sand (4 m
  before).
- **Surfaces** (`surfaceAt`): sand only west of the promenade; the verges' grass on the other three
  sides; the pier's planks, a new surface `wood` (grip 0.88 of the tyres', drag 0.02: weathered
  timber, its joints dragging a little). `feel` drops off the promenade's edge onto sand or verge
  (the kerb's thump, as before) but not onto the pier. `kerbDist` is unchanged (the outer pavement
  still runs round all four sides).
- **The hills' shape** is a function in the sim (`hillHeight`): from the retaining wall's top a
  shelf and then a steep face to a crest 250 to 350 m back (140 to 210 m up, lower toward the sea
  and far east), down its back into the valley; cut by canyons running back into it, roughed with
  ridged noise, a peak behind the sign, a terrace for the observatory, a pass for the freeway to go
  north through, and bluffs down to the beach at the west end. The renderer samples the same
  function, so `hillside(s, bottom)` (called from `collideAir`) holds up a car flown into a slope
  where it is drawn: it lifts it back onto the ground, takes away its speed into the slope and lets
  it slide down (it can't land: the car only drives on the flat). It comes back over the wall onto
  the verge.

### The Pacific, the beach and the pier (citySea.js, cityPier.js, cityRides.js)

- The sea is a plane west of the beach only, its shader as before (swells, ripples, the sky in it,
  the sun's glitter path, turquoise shallows, surf), now mirroring the same sky as the dome
  (`SKY_GLSL` from citySky.js), with the pier's deck shading it (its rectangles moved away from the
  sun by the deck's height, soft-edged) and, at night, the Ferris wheel's lights shimmering in it.
- The beach runs 2.6 km north and south along the coast, past the groynes; lifeguard towers on legs
  stand along it at the top of its face (out of the car's reach, so they need no colliders).
- The pier: weathered planks (laid across it, butt joints staggered), the joists' edge under them,
  rows of timber piles (a bent every 6 m, a pile every 3 m across) once it is out over the sand's
  face, pile caps; white railings; dark green lamp posts every 18 m with pairs of globes; an arch
  over the way on reading SANTA MONICA (the town's name only); the carousel's hall with its hipped
  roof and cupola, an arcade, kiosks with coloured bands, a restaurant at the end.
- The Ferris wheel (cityRides.js): white steel, two rims, spokes, a hub on two A-frames, 20 coloured
  gondolas that hang level as it turns (a turn every 75 s); turned across the pier so it shows its
  face down Wilshire and out at sea and a three-quarter face to the beach either side. At night 300
  bulbs on its rims and spokes light in colours that chase round it (a hue by angle and time, in the
  glow's vertex shader). The coaster: two tube rails and ties along a centripetal Catmull-Rom loop
  through `COASTER`'s points, a column under each (where the sim has them), a red train of four cars
  hauled slowly up the lift hill and running down as fast as its height allows (energy kept); bulbs
  along it at night.

### The hills (cityHills.js, citySign.js)

- One terrain mesh, its grid close near the wall and the city (4 m, 8 m) and opening out away from
  them, coloured per vertex as chaparral: dry gold grass and pale dirt (more on the steep slopes)
  with dark green scrub in clumps, more of it on slopes facing away from the sun and low down
  (gardens), plus a soft close-up texture. Hillside houses (about 500): a box of one or two storeys
  on the uphill ground, plaster in mid tones round a band of big windows, a dark undercroft of
  stilts down to the slope; about 1,000 trees among them and down the canyons. At night about 60% of
  the houses' windows are lit (picked per house in the shader by where it stands), with glows on
  most.
- The observatory on its terrace: a long white hall, a big dark dome on a drum and one at each end,
  a portico and the monument on the lawn; floodlit at night.
- The sign: LOS ANGELES (never HOLLYWOOD or VINEWOOD) in letters 12 m tall, built from glyph shapes
  drawn here (no fonts: lines, ellipses and smooth strokes extruded 0.35 m), each letter a little
  out of line with its neighbours, standing on the slope at the head of La Brea (so it fills the end
  of that street), framed from behind with posts and struts into the hill. Floodlit at night.

### The verges and walls (cityWalls.js)

- Dry LA grass on the verges, palms (a tall trunk and a crown with a skirt of dead fronds) and the
  odd round-headed tree along them; a hedge of oleanders, pink and white, along the sound walls. The
  retaining wall is board-marked concrete stained from the top; the sound walls are concrete blocks
  with ivy climbing them. The planting is merged 400 m at a time, so the car's shadow map draws only
  the stretch near the car.

### The freeways and the city going on (cityFreeway.js, citySprawl.js)

- Two elevated freeways (`LANDMARKS.freeways`): one north-south behind the east wall, going north
  into the hills through the pass, one east-west behind the south wall, climbing to 18 m to cross
  over the other in a stack past the city's corner and coming down at its west end into a tunnel
  short of the beach. Concrete decks swept along each (stations only where the height changes),
  jersey barriers and a median, hammerhead columns every 36 m, the road's lane lines in a texture.
- Their traffic (about 1,200 cars) is moved entirely in the vertex shader: per car only its lane
  (freeway, offset, direction, speed) and where it started, in instanced attributes; the lane's
  speed and the time place it. Each lane runs at its own speed, so no car ever overtakes another in
  it. Evening rush: out of town (north and west) crawls bumper to bumper, into town flows. Cars
  leave the stretch where nobody sees them (deep in the pass, in the haze, in the tunnel) and come
  back at its other end. At night their front faces show white and their backs red, and a glow for
  each head and tail light (only on its own side, so no white halo round a car seen from behind)
  shows over the barriers as streams of light.
- Beyond: the street grid carried on from the city's own (a street every 96 m on the city's lines,
  an avenue every fourth), drawn in the ground's shader with lots, trees, yards and the odd pool;
  about 1,100 low stucco boxes with pale roofs, two clusters of towers far off, palms along the
  nearest streets over the roofs (about 460; they show over the sound walls from the city), all
  fading into the haze. At night the streets glow sodium orange to the horizon, with street lights
  and lit windows.

### Sky and light (citySky.js)

- The sky: deep blue overhead, paler toward the horizon and warm gold on the sun's side; the smog in
  a warm band low round the horizon (golden toward the sun, a dusty brown away from it); a gold glow
  round the sun rather than a white one; a few streaks of high cloud lit gold from below. The sun's
  direction (`SUN`) is unchanged, so the city's shadows are too.
- The mountains on the horizon by bearing: the San Gabriels high in the north and north-east, the
  Santa Monica Mountains running down into the sea in the north-west, Palos Verdes and Catalina low
  across the bay, low hills far east, the open sea west under the sun; blue-grey against the sun and
  a dusty rose where it lights them, their feet lost in the haze.
- The scene's fog matches the haze (`HAZE` 0.76, 0.56, 0.43) and is a little thinner (0.00086 from
  0.00105) so the hills and the sign read from mid-city.
- Night: deep blue, stars and the moon where the sun was, the city's orange glow low on the horizon
  on every side but the sea's, the mountains black against it.

### Night lights (cityGlow.js) and the rest

- One kind of glow for everything lit far off (the hills' windows, the sprawl's street lights, the
  freeway's lights, the pier's lamps, the wheel's bulbs, the floodlights): points drawn as soft
  round glows, sized in metres but never under 1.5 px (a far light fades rather than flickers),
  bright enough to bloom, dimmed a little by the haze; a set to a draw call, shown only at night.
- cityKit.js: the shared palm, tree, lump of leaves, grass and wall textures, and instancing split
  into chunks across the land. cityEdges.js: builds the parts, one update (the water, the wheel and
  coaster, the freeway's time) and one night switch for city.js.

### Sound (small edits, see below)

- The planks: the tyres' roar quieter and hollower, a deeper rumble, and a knock at each of the
  deck's beams (2.6 m apart, deep and ringing) where the pavement has its slab joints.
- Walls (kind 'wall') sound like walls when hit. The surf is heard by the distance to the west shore
  only.

## How it was checked

- `npm test`: 87 pass (82 before). New `tests/edge.test.mjs`: the pier starts at the promenade on
  Wilshire's line, every railing has deck inside and water outside, the buildings stand on the deck,
  no wall crosses a lane or the promenade; driving west down Wilshire takes the car out along the
  pier on its planks past where the sand ends; the railing stops it at 15 m/s and it stays where it
  was; a car put down in the sea comes back on the sand; the walls stop the car at full throttle
  north, east and south, on the verge's grass, and a car put down past a wall comes back in front of
  it; a car flown into the hills at 25 m/s never sinks into them (less than 0.9 m, the corner
  against the middle's ground) and comes back down onto the verge. `tests/street.test.mjs`: sand on
  the west, grass on the three verges, wood on the pier; the grip-on-sand test runs on the west
  beach now.
- Screenshots in a headless browser (1280 x 720, the HUD hidden, the same fixed cameras before and
  after, day and night): down Wilshire to the pier and from Ocean Avenue, up La Brea to the sign
  from near and far, along Franklin under the hills, east down Wilshire, south down Beverly, the
  south-east corner, from the air south-west and south-east, from over the sea, and new ones of the
  pier (entrance, deck, park, from the beach, from the air), the observatory and the pass.
- Driven in the real page (keys sent to it): down Wilshire onto the pier at about 60 km/h (the
  surface reads `wood` once on it), into the north railing (stopped at its line), and at night.
- Shader warm-up: the number of programs is the same (163) after the warm-up, after every view by
  day and after every view by night, so the new materials all compile with the rest during the
  intro; no warm.js change was needed.
- Formatted with prettier-standard. Every source file is under 500 lines.

## Measurements

Draw calls and triangles in the main pass and the car's shadow pass (counted from the renderer in
the page, the same frames, base `cf0ca6d` against this work):

| Where                     | Main pass, before    | after             | Shadow pass, before | after          |
| ------------------------- | -------------------- | ----------------- | ------------------- | -------------- |
| Spawn (follow camera)     | 216 calls, 940k tris | 244 calls, 1,060k | 73 calls, 114k      | 77 calls, 117k |
| Down Wilshire to the pier | 165, 467k            | 188, 538k         | 73, 123k            | 77, 124k       |
| Up La Brea to the sign    | 45, 188k             | 71, 292k          | 69, 87k             | 73, 89k        |
| East down Wilshire        | 48, 205k             | 67, 310k          | 69, 87k             | 73, 89k        |
| From the air, south-east  | 218, 1,455k          | 268, 1,619k       | 76, 126k            | 80, 128k       |

What each part costs at the spawn (hiding it): the verges and walls 11 calls and 20k triangles, the
freeways 3 calls and 34k, the sprawl 7 calls and 26k, the hills 7 calls and 39k, the sea and beach
3 calls and 3k; in the shadow pass, only the walls (2 cheap long boxes) and whatever of the pier is
near. Taken down along the way: the planting from 1 mesh per 120 m of hedge to 400 m stretches
(326 calls at the spawn at one point), the freeway deck's stations from every 12 m to its height
breaks (50k triangles to 34k), the beach's towers and rocks out of the car's shadow map (they ran
the length of the coast: in it from anywhere), the pier's railings and buildings cut into 60 m
pieces for the same reason, the moving gondolas and train given fixed bounds instead of none.

## Known issues

- Flying out of bounds east and south: nothing out there is solid (the freeways' decks and the
  sprawl have no colliders), so a car flown over a sound wall passes through what it meets until it
  comes down, and is then put back in front of the wall. Over the hills the slope holds the car up,
  but not a tumbling wreck (crash mode keeps its own floor at the street's level): a wreck that ends
  up there lies under the hillside until it is put back.
- The houses and trees on the hills aren't solid (the slope is).
- The sun is where it was (23 degrees up, west-south-west), so it is golden hour rather than the sun
  on the sea's horizon; lowering it would change the city's shadows.
- The thinner fog and the new sky change the city's distant look and its reflections a little
  (glass and paint mirror a bluer sky).
- From street level the freeway's traffic is mostly hidden behind its barriers (as it would be); by
  day you see the decks and a truck's top, at night the glow of the lights over the barriers.
- The radar still draws the old square map (HUD agent).

## Shared files touched

- `js/render/city.js`: `buildEdges` in place of `buildSea` (import, build, night, update: 4 lines).
- `js/sim/collide.js`: imports `keepIn` and `hillside` from edge.js; `keepIn(s)` replaces the square
  `OUTER` clamp at the end of `collideCity`; `hillside(s, bottom)` at the end of `collideAir`.
- `js/audio/tyres.js`: `wood` in `SQUEAL` and `ROAR`, its roar peak and rumble, and a `JOINTS` table
  (the pavement's slabs as before, the pier's beams) in place of the slab-joint constants.
- `js/audio/impacts.js`: kind 'wall' counts as a wall.
- `js/audio/mix.js`: the distance to the shore is to the west shore only.
- `tests/street.test.mjs`: sand west, grass on the verges, wood on the pier.
- Not touched: warm.js, cityGround.js, geo.js, index.html, css/, README.md.

## For the others

- **Radar (HUD)**: `areas.js` `LANDMARKS.pier` keeps `x`, `z` (the middle of its run) and adds
  `deck` (rectangles to draw) and `wheel`; `sign` and `observatory` are points; `freeways` are
  centre lines (`x0, z0, x1, z1`; the decks are 28 m wide). edge.js exports `WALL` (505: the walls'
  line north, east and south), `SHORE` (516: where the sand meets the beach's face), `onDeck(x, z)`
  and `RAILS`. On the radar: sand from 492.5 to 516 west, the sea beyond; grass verges out to the
  walls on the other three sides; the pier's deck; the freeways as broad grey bands beyond the
  walls; icons for the sign and the observatory.
- **Driving (lead)**: a new surface, `wood`, comes from `surfaceAt` and `feel` (SURFACES.wood).
  camera.js's rumble treats it as smooth; it could be a little coarser. The car's bounds now come
  from `keepIn` (edge.js), not a square at `OUTER`.
- **Sound**: no freeway hum yet beyond the walls; the surf is now only by the western beach.
- **City**: nothing of this is inside the promenade's edge. The sky's colours and the fog changed
  (citySky.js), which shows in the city's distance and reflections.
- A warning: on this machine `prettier-standard --format <file>` formats every file under the working
  directory, whatever file it is given (with a prettier that wraps some lines differently from the
  repo's). It happened here; every file it touched outside this work was put back as it was.

## README-ready prose (for the city paragraph)

The city is Los Angeles, between the mountains and the sea: past the ring road's west side the beach
runs along the Pacific, and from the end of Wilshire Santa Monica's pier runs out over the water on
rows of timber piles, under an arch with the town's name: drive straight onto its planks (they drum
under the tyres) past the carousel's hall and the kiosks to the restaurant at the end, with the
amusement park beside you, its Ferris wheel turning slowly and the coaster's train racing round. To
the north the Hollywood Hills rise behind a retaining wall, houses stacked on stilts up their lower
slopes among the trees, the observatory on its spur and LOS ANGELES in white letters on the slope at
the head of La Brea; the San Gabriels stand behind them. East and south the city goes on behind a
freeway's sound wall: the freeway on its columns ten metres up, crawling out of town and flowing in,
climbing over the other in a stack at the corner, and beyond it low stucco and palms to the horizon,
fading into the haze. The sun goes down over the Pacific in gold, the smog lies brown low round the
horizon; at night the hills twinkle, the sign is floodlit, the freeway runs in streams of white and
red, the wheel lights up in colours that chase round its rim and shimmer in the sea, and the city's
orange glow lies along the horizon everywhere but over the water.
