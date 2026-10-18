# The traffic's cars and the people on foot: notes

How the traffic and the people look, reworked so the streets read as today's Los Angeles rather than
a toy town. Worktree branch `worktree-agent-a9c344f1ea8d32cdb`, on `cf0ca6d`. How they drive and walk
is untouched (js/sim/ beyond the traffic's `TYPES`).

## The complaint

Close up the traffic read as boxy 1980s sedans: long flat hoods, upright windscreens, slab sides,
small wheels in big arches, flat lamp boxes on flat ends, European plates. The people were jointed
mannequins: peg limbs, a blank egg for a head, puffy shoulder balls, colours bleeding across their
few vertices.

## What changed, and why

### The bodies (js/render/carBody.js, new; carSpecs.js, new; carShapes.js)

- **Lines, not boxes.** Each type is drawn the way a designer draws a car: a centre line over the top
  (nose, hood, windscreen, roof, rear window, deck or tailgate), the beltline, the underside, the
  roof's side, and the plan (carSpecs.js `SPECS`). Stations go at every knot of those lines, at every
  boundary between pieces and round each rounded end, and each station's half section is worked out
  from the lines at its x (`sectionAt`): under the sill, up a tucked-in rocker, out to the widest
  point of the lower body, in again at a crisp character line, over a full shoulder to the beltline,
  then up the glass, leaning in about 23°, to the roof's side and over to its crown; ahead of the
  windscreen and behind the rear window, across a crowned hood or deck instead.
- **Which piece is which falls out of where it lies** (`pieceOf`): the side windows between the
  A-pillar line and the back of the glass, the windscreen and rear window across the top, C- and
  D-pillars between the side glass and the rear window (blacked out on the hatch, the SUV and the
  police car), an open bed behind a pickup's cab. No more boxes for glass.
- **Today's proportions.** Windscreens raked at 64° from upright on the sedan (the A-pillar's foot well
  forward, near the front wheel), hoods that slope down to a low nose, short overhangs, high
  beltlines and shallow side glass, a fastback rear window on the sedan, a sloping roof down to a
  steep tailgate on the hatch, a tall SUV with a short tailgate, a pickup's long flat hood and upright
  cab, a van's steep screen under its high roof, a sports car's long windscreen, ducktail and
  haunches over its rear wheels (`haunch`). Ends rounded in plan on a quarter ellipse, so the nose
  sweeps back into the sides.
- **Indexed, normals by panel** (`loftIx`): vertices are shared within a piece, normals smooth across
  each panel and sharp along the character line, the beltline and the glass's edges, so the crease
  shows as a line of light. About half the vertices of before for the same triangles.
- **Wheels that fill the arches**: radius 0.33 to 0.42 m by type (0.5 on the bus), the arches cut 4.5
  cm round them (7 cm before), tracks wider so the tyres sit a centimetre or two inside the body.

### Lamps and trim (carLamps.js, carParts.js new, carTrim.js, carExtras.js new)

- **Lamps that wrap round the corners** (`wrap`): a strip laid on the body's own surface from the end
  face round the rounded corner and back along the side, between heights that sweep up as they go.
  Each headlight is a slim dark housing, a clear lens, a running-light strip along its top (lit day
  and night) and the indicator at its outer end; each tail light a housing with the reversing lamp
  inboard, the red lamp and the indicator outboard; the sedan, SUV and sports car have a light bar
  across the back between them. Every type has a high stop lamp (at the top of the rear window, laid
  on the glass at 4.5 cm whatever its slope, or high on a van's or bus's back), amber side markers at
  the front corners and red at the back (as American cars have), and indicators in the mirrors.
- **The lamp tags** (`LAMP`) are as before plus `drl` 9, `barRed` 10, `barBlue` 11, `markFront` 12,
  `markRear` 13, and two finishes that aren't lamps: `chrome` 20 (metal, polished) and `gloss` 21
  (piano black). The trim's material gives lenses a glassy finish, chrome its shine.
- **Trim**: gloss black window surrounds along the tops and backs of the side windows and a strip
  along their feet, black pillars between them, the black frit round the windscreen and rear window,
  the cowl and wipers lying on the glass, the doors' shut lines (stopping above the arches), flush
  chrome door handles, the bumpers' shut lines round the corners to the arches, mirrors on the doors
  (a housing in the body colour, rounded in front, on a gloss black arm, the glass facing back),
  half-disc wheel wells, grilles and intakes per type, California plates front and back (US size,
  white, the state in red across the top, the number in blue, in a black frame).
- **Each type's own** (carExtras.js): an SUV's roof rails on feet; a shark fin aerial on the cars; a
  pickup's open bed (black liner, rail caps, the cab's back wall, the tailgate's inner face), chrome
  bumpers and a step; a van's black bumpers and split back doors with windows; a bus's glass doors on
  the kerb side, the fairing over the gas tanks on its roof (LA's buses run on CNG), an engine grille
  low on its back and a bike rack folded on its nose; a cab's roof sign, lit; a police car's light
  bar, push bar and A-pillar spotlight; a sports car's quad exhausts.

### Paint and wheels (carPaint.js new, carWheels.js, traffic.js)

- **LA's colours** (`carPaint.js`): about a quarter white, a fifth black, a third greys and silvers,
  then dark blues and reds and the odd green, champagne, orange, yellow or teal; sports cars in red,
  yellow, orange, blue and green more often; cabs yellow; vans mostly white; buses orange (6 in 10),
  blue (3) or red (1); police cars black.
- **The clear coat over a solid or a metallic** (traffic.js `aPaint`, carShapes.js `bodyMaterial`):
  each car's finish is its own, a solid gloss (metalness 0, base roughness 0.4) or a metallic (up to
  0.7 metalness, roughness 0.3) under the same hard clear coat; of the lighter-coloured cars, about
  one sedan in ten, one SUV in seven, one hatch in six and one sports car in five has a black roof. Whites were brought down a step: in the low
  sun a white car bloomed.
- **Liveries in the paint's shader**, by position on the body, nothing added to the geometry: a police
  car's white doors and roof (the black-and-white of an LA cruiser, no lettering), a cab's checker
  band along each side, a bus's white roof over its windows and dark skirt. The dark plastic under
  the front bumper (a lip) and the back one (a diffuser), and along an SUV's sills and round its
  arches, as before.
- **Rims**: one instanced mesh for all near rims (was two), their faces from one atlas of eight
  designs (ten-spoke, ten slim spokes with machined faces, an aero wheel, five-spoke, black steel with
  a chrome cap, a van's steel wheel, a bus's polished aluminium, a pickup's six-spoke), each car's
  picked per instance (`aRim`) and sized to its tyre (60 to 75% of its radius), in silver, graphite or
  black; the face dished. Tyres are low profile (the bead at 56% of the radius). Far off (beyond `NEAR`)
  the plain wheels as before.

### New types (js/sim/traffic.js TYPES; js/audio/cars.js)

| name | len × wid × hgt (m) | mass (kg) | share | cruise (m/s) | acc / brake / lat (m/s²) | engine voice |
| --- | --- | --- | --- | --- | --- | --- |
| `police` | 5.05 × 2.0 × 1.86 | 2300 | 2 | 13.6 | 2.7 / 3.4 / 2.8 | `v6` |
| `sports` | 4.5 × 1.9 × 1.28 | 1500 | 3 | 14.2 | 3.2 / 3.6 / 3.3 | `v8` |

The police car is an SUV-based cruiser in black and white; about one in three has its light bar
flashing (red on the driver's side, blue on the other, each a double flash, 1.5 cycles a second, its
own phase), parked or driving, as decoration only: nobody chases anyone. The existing types' shares
are unchanged (see Known issues for why).

### People (js/render/pedFigure.js new, pedShader.js new, peds.js)

- **A figure that reads as a person** (pedFigure.js): a trunk lofted through rings (hips, waist,
  chest, shoulders, the slope of the trapezius to the neck), a neck, a head a little longer than it
  is wide with a narrower jaw, a chin and a nose, upper arms with rounded shoulders, forearms
  tapering to the wrist, hands, thighs tapering to the knee, calves that swell at the back, ankles,
  trainers with their toes turned up a little. The joints and pivots are where they were, so the
  sim's stride (timed to the legs' length) still plants the feet.
- **Hair and kit only some have**, folded away to a point on everyone else, as before: hair cut short,
  worn long round the face and down the back, in a ponytail, a bun or curls (buzzed and bald too), a
  cap with a brim, a hoodie's hood, a skirt, a shoulder bag, a backpack, a phone.
- **Dressed in the fragment shader** (pedShader.js `pedDress`), from each fragment's place on the
  figure at rest, so a neckline, a strap, a sleeve's hem, the top of a sock or a trainer's sole is
  crisp (vertex colours blurred them across the few vertices). Everything follows from one number per
  person (`aLook`, the sim's `look`), hashed in the shader: a man or a woman (a woman narrower in the
  shoulders, wider in the hips, with a bust); a tank top, a T-shirt, long sleeves or a hoodie; jeans,
  chinos, leggings, shorts, a summer dress or a skirt; white, black or grey trainers or sandals, with
  white socks for some; sunglasses (three in ten), caps, bags; skin from pale through olive and brown
  to deep brown, the middle tones the most; hair to suit, grey on a few.
- **Faces**: eyes under brows, a mouth, a nose, a beard on about a quarter of the men, or sunglasses:
  two dark lenses and a bridge. At street distance the eyes and brows read as a dark band, which is
  what a face looks like from across a road.
- **One mesh, one draw call**, posed in the vertex shader as before (the walk, the planted feet, knees,
  arms, the run, the dive and panic, heads turning, phones, talking hands). The per-person data sent
  each frame went from 17 floats besides the matrix (pose, actions, shirt, trousers, skin, style) to 9
  (pose, actions, look).

## Numbers

Triangles per car (paint + glass + trim with lamps; the test's budget is 1,600), and vertices (each
car's vertices go through the vertex shader once per instance):

| type | triangles before | after | vertices before | after |
| --- | --- | --- | --- | --- |
| sedan | 1,388 | 1,464 | 4,164 | 1,875 |
| hatch | 1,346 | 1,458 | 4,038 | 1,872 |
| suv | 1,362 | 1,476 | 4,086 | 2,020 |
| taxi | 1,400 | 1,556 | 4,200 | 2,038 |
| pickup | 1,422 | 1,372 | 4,266 | 1,889 |
| van | 1,362 | 1,182 | 4,086 | 1,627 |
| bus | 1,450 | 1,408 | 4,350 | 2,496 |
| police | (new) | 1,528 |  | 2,112 |
| sports | (new) | 1,588 |  | 1,915 |

A near wheel (tyre and both rim faces) is 364 triangles (320 before); a far one 96, as before.

A person: 1,388 triangles (1,236 before), 1,045 vertices (3,708 before: the old figure wasn't indexed).

Draw calls and triangles for one frame (`renderer.info.render`, shadow passes included), the same
frozen scene in both builds (traffic and people re-seeded and reset at the Roadster, 3 s run, the
camera fixed behind the car; the traffic's and the people's shares read off by hiding them):

| spot | whole frame before | after | traffic before | after | people before | after |
| --- | --- | --- | --- | --- | --- | --- |
| spawn | 302 calls, 1.061 M tris | 305, 1.098 M | 28, 380 k | 31, 399 k | 2, 151 k | 2, 169 k |
| the jam (11 cars near) | 312, 0.989 M | 317, 1.016 M | 41, 382 k | 46, 396 k | 2, 100 k | 2, 112 k |
| downtown | 280, 0.794 M | 280, 0.815 M | 23, 271 k | 23, 281 k | 2, 91 k | 2, 103 k |

The extra draw calls are the new types in view (three each: paint, glass, trim); the rims went from
two meshes to one. The type mix differs a little between the builds (new types), so the scenes do
too. Per frame the traffic and the people upload what they did, less the people's colours, and
allocate nothing new. Programs compiled after the warm-up: none on the first night or the first
Autopilot run, as before (141 after the warm-up in the base build, 147 here, the same six added by
the intro in both).

## How it was checked

- `npm test`: 84 pass. tests/carlooks.test.mjs now checks every lamp (headlights, running lights, tail
  lights, indicators, reversing, the high stop lamp, both side markers), the cab's sign, the bus's
  board and the police car's light bar, that front lamps are at the front and rear ones at the back
  (they wrap round the corners now), that the wheels fill their arches inside the body with a sensible
  wheelbase, and each type's budget.
- Headless screenshots (the scratchpad's shoot tool): every type from the front three-quarter, rear
  three-quarter and side, close ups of noses and tails, a lineup by day and night, the police bar at
  set moments of its cycle by day and night, people in a row (front, back, three-quarter, faces),
  walking, running, on the phone, talking and panicking, a crowd at street distance and at night,
  and the game as played (the jam behind the Roadster, a junction from above, day and night), against
  the base build's bundle for the before pictures. No console errors or warnings in any run.
- The Roadster is untouched: loft.js wasn't changed (the traffic's bodies have their own lofter).

## Known issues

- **Two traffic tests are sensitive to the traffic's random sequence.** "A queue at a red moves off at
  the green in a wave" counts a car as moving off once it passes 0.3 m/s, but a car still creeping up
  the queue at the green (0.35 m/s) passes that at once; "a long run" sometimes finds an overlap. Any
  change to the mix of types (it changes how many random numbers the jam and the spawns use) flips
  them: of fourteen share settings tried, including ones with only the old types, half failed one or
  the other. The shares of the old types are therefore unchanged and the new ones take 2 and 3 of a
  hundred, which passes. A change elsewhere that shifts the random sequence (the city's stalls or
  lanes) can trip them the same way.
- The nose and tail faces are flat planes (grille, intakes, plates and lamps lie on them), so close up
  in profile the very front is a vertical face. The lamps are the strips that sweep round the corners.
- The bus's windscreen is a plain dark face; no interior is drawn behind any glass.
- The cab is one shape (a hybrid liftback, as most of LA's cabs are); no company names or numbers.
- At night a police car's light bar glows but throws no coloured light on the road.
- People: one head shape for all (the jaw and build vary only with the woman's build), and long hair
  is a sheet behind the head, so from straight above it shows its thinness.

## For the others

- **Sound**: two new type names, `police` and `sports`, mapped in js/audio/cars.js's `KIND` to the
  `v6` and `v8` voices. A third of all cars are electric by paint there, as before, these included.
- **HUD / radar**: nothing reads types by name; the radar colours cars by state. If it ever shows
  police cars, they are `TYPES[car.type].name === 'police'`, and the flashing ones are those with
  `(car.paint * 11.3) % 1 < 0.36` (js/render/traffic.js).
- **Lead**: js/sim/traffic.js changes only `TYPES` (two entries) and its comment; js/audio/cars.js only
  `KIND`. js/sim/areas.js and tests/areas.test.mjs were copied in from the main checkout, unchanged.

## README-ready prose

The traffic is today's Los Angeles: midsize sedans with long raked windscreens and fastback rear
windows, compact hatchbacks, crossover SUVs with roof rails, full-size pickups with an open bed and
chrome bumpers, high-roof delivery vans, yellow hybrid cabs with a checker band and a lit roof sign,
city buses in orange, blue or red with their gas tanks under a fairing on the roof and a bike rack on
the nose, black-and-white police SUVs (some with their light bars flashing red and blue) and the odd
sports coupe. Their bodies swell out below a crisp character line and roll over a full shoulder to a
high beltline, under shallow side windows framed in gloss black; big wheels on low-profile tyres fill
their arches, on alloys of half a dozen designs in silver, graphite or black (black steel on the
police cars, steel on the vans, polished aluminium on the buses). Slim LED headlights and tail lights
wrap round the corners, some joined by a light bar across the back, with running lights by day, amber
and red side markers, a high stop lamp, indicators in the mirrors, flush door handles and California
plates front and back. The paint is LA's mix, mostly white, black, silver and grey, then dark blue and
red and the odd bright colour, each car a solid gloss or a metallic under a hard clear coat, some with
a black roof. People are dressed for LA: T-shirts and tank tops, hoodies, jeans, shorts, leggings,
summer dresses and skirts, caps and sunglasses, trainers and the odd pair of sandals; their hair short,
long, in a ponytail, a bun or curls; faces with eyes, brows and a mouth (and a beard on some), skin from
pale to deep brown.

For the README's project layout (js/render/):

```
  traffic.js          instanced traffic cars, their paint, wheels, springs and lamps lit per car;
                      carShapes.js, a type's geometries and the paint's material (arches, liveries,
                      finishes); carBody.js, bodies lofted from lines; carSpecs.js, each type's lines;
                      carTrim.js, carExtras.js and carParts.js, the trim; carLamps.js, the lamps;
                      carWheels.js, tyres and the rims' atlas; carPaint.js, LA's colours
  peds.js             the people, all in one draw call; pedFigure.js, the figure; pedShader.js, posed
                      in the vertex shader and dressed, with their faces, in the fragment shader
```

New files: js/render/carBody.js, carSpecs.js, carParts.js, carTrim.js, carExtras.js, carPaint.js,
pedFigure.js, pedShader.js, docs/la/vehicles.md.
