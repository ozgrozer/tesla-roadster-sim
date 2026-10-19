# The city as Los Angeles: notes

Worktree `agent-ab0724f006ba550af`, from `cf0ca6d`. What is built on each block and along each
pavement, and how it looks: the neighbourhoods of `js/sim/areas.js` (shared, unchanged) each built
their own way. Files owned by this area, plus new modules; no shared file was edited (`main.js`,
`render/city.js`, `events.js`, `ui/`, `index.html`, `css/`, `street.js` and `areas.js` untouched).

## What changed, and why

### The look: low, its towers in two clusters
Los Angeles reads as Los Angeles from the contrast: a city one to four storeys tall almost
everywhere, its towers standing together downtown and in Century City. The old city stepped up in
rings to a cluster in its middle; now 75% of its 675 buildings are 15 m or less, every building
over 65 m is downtown or in Century City (a test holds it there), and 21 stand over 100 m.

### What each block holds (js/sim/lots.js and the neighbourhoods' builders, new)
`lots.js` runs the block loop (blocks, parks and the parking lot as before) and hands each block to
its neighbourhood's builder by `AREAS[areaOf(bx, bz)].kind`:

- **Downtown** (`towers.js`): towers fall away in height from a middle on Wilshire (300 m there, a
  Gaussian of 185 m): a stepped cylinder of grey granite with a lit glass crown and a round helipad
  on it (as the US Bank Tower); on the corner of Wilshire and Figueroa a glass tower on a six-sided
  plan on a hotel podium, its top a sail of glass sloping up to the east with a spire over its high
  end, lit at night (as the Wilshire Grand); twin black slabs either side of a fountain; a tall
  dark slab; and round them towers on plazas (one, two side by side, or a tower beside older
  blocks), some with their corners cut back, most with a big H-marked helipad on the roof (as LA's
  fire code had it), 40% of those over 100 m with a band of lit glass round their top storeys.
  Between them the historic core's ten- to fifteen-storey stone and brick blocks (shops round their
  feet on the main streets, an old hotel's name in letters on some roofs), and out at the edges
  brick lofts and warehouses with murals on their sides.
- **Century City** (`towers.js`): glass and office towers of 85 to 160 m on plazas with palms in
  planters; a pair of three-sided towers in opposite corners of their plaza, turned half a turn to
  each other round a fountain (as the Century Plaza Towers); a granite tower with its corners cut
  back (as Fox Plaza); a long low hotel slab and its gardens.
- **Santa Monica** (`shops.js`): two to six storeys of stucco, Art Deco (pale stone with fins up
  its walls past the parapet) and brick over shops on the main streets, two- to four-storey
  apartments on the side streets, courtyards with palms, and Deco hotels facing the ocean with
  their names in neon letters on the roof.
- **Hollywood** (`shops.js`): a row of narrow one- to four-storey shops along every street (mostly
  one or two; a 9% chance of an older mid-rise on a corner), billboards on their roofs and neon
  blade signs on their fronts; two theatres on Hollywood Boulevard (a windowless stone front with
  Deco fins, a marquee over the pavement lit with bulbs underneath, its name up a vertical blade
  sign); a motel on Sunset (two storeys of rooms in an L round its car park, a tall neon sign);
  the round tower of stacked floors by Hollywood and Vine with a spire and a red light (as the
  Capitol Records Building); a car park in the middle of each block.
- **Mid-City** (`strip.js`): strip malls set back behind their car parks with a strip of lawn and
  tall palms along the street and a tenant sign on a pole; four gas stations on the corners of the
  main streets (a canopy on four columns, landable, its fascia in a made-up brand's colours and its
  ceiling lit; pumps on islands; the shop; the prices on a pole); fast-food stands with their signs
  up on poles; a donut stand with a giant donut on its roof; stucco apartment blocks on the side
  streets behind lawns, and courtyard apartments round a pool in the middle of the block;
  billboards on poles; an office mid-rise now and then. The block's base is asphalt.
- **Beverly Hills** (`homes.js`): big houses on lawns, back to back down the middle of each block,
  three to a side: Spanish revival (white stucco, a red clay tile hip roof, a one-storey garage wing
  out the back at the end of the drive) or modern (glass below, a white box above standing out over
  the lawn); hedges along the pavement (a third of them taller than a person, up to 3.6 m), open
  for the drive and the path to the front door; a pool out the back; a palm on the lawn.
- **Venice** (`homes.js`): one-storey bungalows painted bright (turquoise, coral, yellow,
  lavender...) on narrow lots under shingle hip roofs, now and then a two-storey modern box, a back
  house or garage in half the yards, low hedges or white picket fences along the front, murals on
  some side walls; bright one- and two-storey shopfronts along Venice Boulevard and facing the beach.

### Along the pavements (js/sim/kerbside.js, new)
The street lights keep their places (every 24 m both sides, as before). By the neighbourhood behind
the pavement, a line 1.6 m in from the kerb (inside the people's walking lines) holds: tall, thin
Mexican fan palms (21 to 30 m, small heads) every 12 m down the main boulevards, Ocean Avenue's
promenade and every street in Beverly Hills, and every 24 m down Mid-City's main streets; stout
date palms every 24 m on Santa Monica's, Venice's and Century City's side streets; round street
trees downtown and on Hollywood's and Mid-City's side streets. On Mid-City's and Venice's side
streets the light on one side hangs from a wooden power pole (`l.wood`), wired to the next pole
and over the junctions (`WIRES`). Bus benches on the main streets, a hydrant by most corners and
litter bins on the shopping streets are only to look at (`DECOR`).

### Solid, landable, or neither
Buildings stay boxes in the sim, each tier one collider and landable on top (`roofs.js`), so the
roof tests keep their meaning. What changed:
- **Shaped towers** (`shaft()` in `plots.js`): a prism on a convex plan (round, three-sided,
  six-sided, cut-cornered) is drawn as it is; the sim gets strips across its plan, each as wide as
  the plan across the strip's middle (tiers flagged `strip`), so it bumps and lands within about a
  metre of what is drawn. The sail's sloping top is three stepped boxes, solid but not landable.
- **Hip roofs** are solid but no roof to land on (my call): a box from the eaves to the ridge,
  kind 'plant' (look 'hip'); what comes down on it rides the ridge and slides off the way it
  overhangs, as off any roof edge (`collide.js`'s edge rule), and lands on the lawn. The walls' top
  under it is a 'building' tier at the eaves, never reached. A test drops the Roadster on one.
- **Gas station canopies** are landable ('building' at 4.7 to 5.5 m; you drive under them).
- Hedges, garden walls, fences, pumps, columns, sign poles, billboards' boards, rooftop billboards'
  frames and an old sign's frame are solid ('plant', or 'mast' for posts); the ones on a roof are
  kept in `b.plant` with a `look`, so the roof tests' clear-run checks see them and the renderer
  doesn't draw them as plant. Roof plant keeps clear of a helipad's circle; one-storey roofs get a
  few air-handling units and no stair housing.
- Street furniture: a fan palm snaps at 10 to 13 m/s (thin for its height), a date palm by its
  stout trunk; a light on a wooden pole takes 8 m/s; steel lights, masts and trees as before.

### js/sim/city.js and grid.js
The grid's measurements (N, PITCH, ROADS, LANE_W, ROAD_HW, WALK, STOP, CURB_*, HALF, EDGE, OUTER,
LANE_OFF, DIRS, SPAWN, rng) moved, unchanged, to `grid.js`, and city.js passes them on: the block
builders need them, city.js imports the builders, and the bundler can't resolve an import cycle.
city.js keeps the lane graph (the signal offsets come off its random stream first, as before), the
signal masts and the colliders, and registers `SOLIDS`. It went from 510 lines to 363.

### Parked cars: 267, as ever
The traffic parks a car in each taken space before it deals the drivers, all from one random
stream, so a different number of parked cars deals every driver a different temperament (with 909
parked, the traffic tests met a red-light run and a 164 s standstill in a different town).
`parkCars(267)` keeps the count the city always had and spreads them over 820 spaces, each car park
about as full as it asks (`fill`). The Santa Monica surface lot ('1,2') is now a city block; the
Mid-City lot ('7,7') and the two parks are where they were.

### How it is drawn (js/render/)
- `builder.js` (new): the merged-quad builder from cityBuildings.js, plus prisms on any convex plan
  (flat or shaded round, sloping tops), fan-capped tops, cornice rings and hip roofs with eaves.
- `buildingTex.js` (new, from cityBuildings.js): the facade textures, two of them new: pale stone or
  terracotta with tall windows between lit piers and sunk spandrels, and a house's rough plaster
  with painted window surrounds; clay tiles (near white, so a vertex colour makes them terracotta or
  a bungalow's grey shingle); a lit crown's glass.
- `facade.js`: `fill`, the share of bays with a window (a house's wall, half): the shader blanks the
  rest with the wall's own colour, surround and all.
- `cityBuildings.js`: per-tier styles and tints; the top storeys of the top tier in a lit glass
  band; shaped towers' prisms with whole bays on flat walls and continuous bays round a round one;
  lit crowns and the sail; the round tower's floors as rings; Deco fins; windowless walls; spires
  and the red lights on the tallest roofs (blinking with the antennas' beacons). Six facade
  materials (glass, office, brick, stucco, stone, house), one each for the whole city.
- `citySigns.js`, `signTex.js`, `signArt.js` (new): one 2048 px atlas drawn at startup (eight
  billboards, hotel names, marquees, blade signs, the motel, fast food, malls, gas prices and
  fascias, six murals, the helipad, pool water, front doors, lit panels and bulbs), and three
  meshes for every sign in the city: what is lit (the atlas is its own emissive map, so bright
  letters and billboard faces glow at night), what is painted on (murals, helipads, pools, doors)
  and the steel that holds it up (with the donut). At night, soft pools of light under the gas
  canopies and in front of the marquees.
- `cityYards.js` (new): hedges in a leafy texture (a mesh a district), stucco garden walls with
  tile coping, picket fences cut out of a texture.
- `cityTrees.js` (new, from cityProps.js): each palm and tree is one piece, trunk and head, scaled
  whole (a fan palm's grey trunk, the skirt of dead fronds and sixteen small fans in three rings; a
  date palm's thick trunk and arching fronds; a tree's trunk and faceted crown), one instanced set
  per kind.
- `cityProps.js`: LA's cobra-head street lights (a tapered pole, an arm curving up and out, a
  flattened head, its lens underneath); the wooden power poles (crossarm, transformer, the light on
  a short arm) as one instanced set; the signal masts as before plus a box for the street's name.
- `cityNames.js` (new): the lit street-name sign under every mast's arm, the name of the street
  being crossed (`STREETS_EW`/`STREETS_NS`, "Wilshire Bl"), white on green, picked out of one
  small texture by a per-instance attribute: one draw for all 440.
- `cityKerb.js` (new): the power lines (three on the crossarm and a cable, sagging, as one-pixel
  lines; a pole knocked down takes its spans with it, the city standing up restrings them) and the
  benches, hydrants and bins (one mesh, no shadows).
- `fallers.js` (new, from cityProps.js): the falling code, shared; `subset()` for sets that hold
  only some of a list (steel or wooden poles, fan or date palms), `onKnock`/`onStandUp` hooks.
- `cityGround.js`: each lot's base from the sim (paving, lawn or asphalt) and over it, with a
  polygon offset, the lawns, drives, car parks and forecourts; parking lines along each space's own
  heading; on the low-rise neighbourhoods' streets the lane lines in Botts' dots (four round dots and
  a square reflector every 7.3 m) instead of dashes.
- `cityStreet.js`: the Walk of Fame, terrazzo stars down the middle of both of Hollywood
  Boulevard's pavements through Hollywood.

## How it was checked

- `npm test`: 89 pass (82 before, plus 7 in the new `tests/lots.test.mjs`: the city is low and its
  towers where they belong; each neighbourhood has its own pieces; every building, solid, palm and
  tree is on its lot or the planting line; every parked car has room and there are 267; helipads
  clear of plant and canopies landable; power lines pole to pole along one side; a tile roof is
  ridden and slid off, not landed on). In `city.test.mjs` the finders picked their targets by luck
  (the first lamp, palm or tree in the list, a building flush with the pavement), so with things
  standing in new places they now ask for a clear run (`openRun`, a query of the colliders): the
  bounce test's building has 32 m of open street before its wall, the roof test's building room to
  drop past its east edge, and the palm test now rams a fan palm and a date palm.
- Screenshots (headless Chrome, 1280 x 720, HUD hidden) of the same 15 views by day and 8 to 14 by
  night, before (the committed bundle) and after: street level in every neighbourhood, from the
  air, the skyline, the landmarks; the intro at the spawn.
- Shader warm-up: 160 programs once it has run, and still 160 after the first night (141 before
  this work); every new material is in the city group, so `warm.js` compiles it.
- Startup: the city's meshes build in about 100 ms (78 before; the second of two builds in one page),
  the sim's layout in 20 ms in Node (10 before).

## Draw calls and triangles

At fixed viewpoints (`renderer.info` round the scene pass; the car's shadow map follows the car,
so its numbers are the spawn's in every row). "Static" hides the traffic, the people and the
Roadster. Calls / thousands of triangles:

| View | Frame, before | Frame, after | Main pass | Static, main | Static, car's shadow |
| --- | --- | --- | --- | --- | --- |
| spawn (follow camera) | 289 / 1055 | 326 / 1373 | 216 / 939 -> 244 / 1228 | 94 / 420 -> 122 / 528 | 15 / 73 -> 24 / 104 |
| downtown street | 166 / 450 | 197 / 679 | 97 / 363 -> 119 / 563 | 77 / 319 -> 99 / 411 | |
| above the city | 294 / 1578 | 329 / 1700 | 218 / 1454 -> 244 / 1549 | 96 / 430 -> 122 / 528 | |
| Beverly Hills, low air | 139 / 385 | 163 / 433 | 70 / 298 -> 85 / 317 | 50 / 206 -> 77 / 313 | |
| Mid-City, low air | 166 / 646 | 197 / 866 | 97 / 559 -> 119 / 749 | 77 / 319 -> 99 / 405 | |

The static city costs about 28 more calls and 108k more triangles at the spawn, for six facade
styles (two new), tile roofs, lit crowns, 142 signs, hedges and fences, 1347 palms (360 before) and
671 trees (69), power poles and their lines, 612 benches, hydrants and bins, street-name signs,
Botts' dots and stars. Kept down by: one mesh per material city-wide for what has few triangles
(facades, tiles, crowns, signs in three, names in one instanced draw, the kerbside props in one
shadowless mesh), a mesh a district for what casts many (palms, trees, poles, hedges), palms and
trees whole in one set each (9 fewer draws, and 9 fewer in the shadow pass, than trunks apart),
low counts (a fan palm 54 triangles, a date palm 170, a cobra head's post 60, a hydrant 30), the
signal lamps' discs in 8 sides rather than 14 (16k triangles fewer, drawn whole every frame).
The rest of the frame's growth is the traffic's: the 267 parked cars now stand in many small car
parks instead of two lots, and more of them fall inside the view (they are culled to the frustum
only).

## Known issues

- `collide.js` (not this area's): driving off a roof towards a taller building across an alley
  narrower than the car, the car is held up on the edge it left (`EDGE`, pushed off it at half a g)
  while the wall in front pushes it back, and hangs there in the air. The old city had such alleys
  too; downtown now has more. Releasing the edge hold while the car is also pressed against a wall
  (or capping its time) would fix it. The roof test now picks a roof with room past its edge.
- `effects.js` (not this area's): `knockFx` sheds a palm's leaves at 10 m, but the tall fan palms'
  heads are at 21 to 30 m (`PALMS[i].h` has the height).
- Lawns, drives and car parks are 'walk' to the tyres (`street.js`, the surroundings area's): a
  block's `base` and `ground` (grass, asphalt, concrete, pool) say what is where if grass grip is
  wanted there; the radar (`minimap.js`) could colour lawns by them too.
- Hip roofs can't be landed on (by design: the Roadster slides off them onto the lawn).
- The sign atlas is 2048 x 2048 (about 21 MB on the GPU with its mipmaps); the hotel letters, cut
  out of it, thin out with distance as their mips average away.
- A shaped tower's collider strips are within about a metre of its drawn walls, not on them.
- The palms don't sway.

## For the others

- `city.js` exports, besides everything it did: `SOLIDS` (other solid things on the lots), `SIGNS`,
  `WIRES` (pairs of wooden lamps), `DECOR`; the grid's measurements now come from `grid.js`
  (unchanged values). `BLOCKS[i]` has `area` (the neighbourhood's kind), `base` ('plaza', 'grass' or
  'asphalt') and `ground` (rects of 'grass', 'asphalt', 'concrete', 'plaza', 'pool'). `BUILDINGS[i]`
  has `area`, and may have `shafts`, `sail`, `helipad`, `spire`, `door`, `crownBand`, `records`;
  tiers may have `hip`, `eave`, `style`, `tint`, `blank`, `strip`. `PALMS[i].fan` (tall fan or date),
  `LAMPS[i].wood`, `STALLS[i].fill`.
- `PARKING` is now just '7,7'; `PARKS` unchanged; 820 spaces, 267 taken.
- `areas.js`: no change needed to its GRID or street names. The names are on the street signs.
- The traffic renderer (vehicles area): parked cars are spread over more of the city now; a
  distance cull or a plainer far model for parked cars would win back what they add in view.

## README-ready prose (for the city paragraph)

**The city.** Los Angeles, low and spread out, with its towers in two clusters: Downtown's skyline
on Wilshire (a stepped cylinder with a lit glass crown and a helipad on top, a sail-topped glass
tower with a spire, black slabs, flat roofs with big H-marked helipads, crowns of lit glass at
night) among the older stone and brick blocks of the historic core, and Century City's glass towers
on their plazas round a pair of three-sided towers. Round them, one to four storeys: Santa
Monica's stucco and Art Deco over shops, its hotels' names in neon on their roofs; Hollywood's
strip of shops with billboards on their roofs and neon blade signs, two theatres with lit marquees,
a motel under its sign, the round tower of stacked floors by Hollywood and Vine and the Walk of
Fame's stars in the pavement; Mid-City's strip malls behind their car parks, gas stations under
their canopies, fast-food signs on poles, a donut stand with a giant donut on its roof, billboards
over the car parks and power lines strung along the side streets; Beverly Hills' white houses under
red tile roofs on lawns behind tall hedges, pools out the back; Venice's bungalows painted bright.
Tall, thin fan palms line the boulevards and every street in Beverly Hills, cobra-head street
lights lean over the road, the lane lines are Botts' dots on the low-rise streets, and the street
being crossed is named on a lit sign under every signal's arm.

## The grown map (gta-world branch)

The grid went from 10 to 18 blocks a side (PITCH 96 m, HALF 864 m): 960 m to 1728 m across, 3.24
times the area. The first city keeps its blocks in the north-west (old index i at the same index,
moved by OLD = -384 m: grid.js), so its tests only needed that offset. Around it:

- **Roads**: Wilshire-style boulevards with planted medians, two-lane streets, alleys through the
  superblocks, one-way pairs (jam.js, street.js), a raised freeway on its deck across 15 blocks with
  four ramps and merge lanes (freeway.js), and the Santa Fe Canyon hill road out through the north
  wall: switchbacks at 12% with cut and fill (hillroad.js), a 210 m tunnel, a bridge over a canyon and
  a lookout 79 m up. All drivable (tests/world.test.mjs); traffic stays on the street grid.
- **Districts** (areas.js, works.js, suburbs.js, venues.js, quay.js): Arts District lofts, Vernon
  sheds and truck yards, the port's container yard and quay with three ship-to-shore cranes and a
  ship, Crenshaw/Inglewood houses and strips, the stadium superblock (bowl, tiers, canopy:
  render/cityStadium.js), the LA River channel, sports parks, garages and lots.
- **World queries** (js/sim/world.js): `groundHeight(x, z, y)`, `groundNormal`, `districtAt`,
  `onRoad`, `roofAt`, `parkingNear`, `pavementNear`, `pavementGraph`, `spawnPoints`, `onHillRoad`,
  `inTunnel`, plus FWY, HILL_ROAD, LOOKOUT. On foot, player.js's floor is the same ground
  (tests/worldFoot.test.mjs).
- **Streaming** (render/chunks.js): districts are a 6 x 6 grid (288 m each); every district-sized
  mesh is left out once the fog has swallowed it, and small instanced things (posts, bins, bushes)
  past 450-650 m. The city's shadow map pass still sees everything.
- **Maps**: the radar and pause map draw the freeway deck and ramps, the quay and the hill road (its
  tunnel dashed); the pause map opens fitted to the whole grown city.

Draw calls / triangles (headless, 1280x720, swiftshader): spawn 388 / 1.20 M (baseline before the
growth 326 / 1.37 M; grown map before streaming 351 / 1.48 M); aerial over the city 443 / 2.06 M
(before streaming 430-479 / 3.1-4.5 M).
