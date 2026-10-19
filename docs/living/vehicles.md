# The city's own vehicles: notes

The traffic had ten types, from the sedan to the bus and the police SUV, and only the police went
out on calls. This round adds the vehicles that make Los Angeles' streets its own: an ambulance and
a fire engine that answer calls with the police, a delivery box truck that double-parks with its
hazards on, a lowrider that hops at the lights and a stretch limousine in Beverly Hills and
Hollywood. What each is, how it drives, how it was kept from changing the rest of the traffic, how
it was checked, and what is open.

## The vehicles

| Type | Length × width × height, m | Modelled on | Where it comes from |
| --- | --- | --- | --- |
| Ambulance | 6.9 × 2.36 × 2.86 | a US Type III: a van cab under a square box | calls only (`calls.js`) |
| Fire engine | 10.4 × 2.5 × 3.3 | a US pumper: a flat-fronted cab, compartments, a ladder on top | calls only |
| Box truck | 9.9 × 2.55 × 3.8 | a 26 ft box on a cab-over chassis | two vans in five (`fleet.js`) |
| Lowrider | 5.35 × 2.0 × 1.32 | an early-'60s hardtop on wire wheels | of the sedans, by neighbourhood |
| Limousine | 8.6 × 1.98 × 1.48 | a stretched Lincoln Town Car | of the sedans, by neighbourhood |

The bodies are lofted from lines as every traffic car's are (`carSpecs.js`, `carBody.js`,
`carClassics.js` for the lowrider's) and their working parts are trim (`carRigs.js`): the
ambulance's warning lamps (red at the box's corners, white and amber between, red in the grille),
its doors, windows and step; the fire engine's chrome grille and bumper with its air horns, the
light bar, the brushed-aluminium shutters, the pump panel, the hose bed and the ladder; the box
truck's roller door over the cargo inside, the box's frame, its clearance lamps and the chassis.
Each type is one more set of instanced meshes (body, glass, trim) beside the others, its lamps
lit per car as every car's are (`carLamps.js`), so a type costs three draw calls when one is on
screen and nothing when none is.

- **On a call** (`calls.js`, `responder.js`, `makeway.js`, `js/audio/siren.js`). About two calls
  in five go to the police, a third to an ambulance and a quarter to a fire engine (3,000 drawn:
  within 3% of each). Each drives its run as the police car does, over a red only at a crawl once
  the junction is clear, the traffic pulling over for it; the fire engine, long and heavy, takes
  the corners slower. Their lamps flash their own patterns, red and white for the ambulance, red
  and white with the light bar for the fire engine, and throw them on the road at night. The
  ambulance's siren is another make than the police car's, rounder and a little higher, its wail
  quicker and its hi-lo (two notes by turns) on the open road; the fire engine's is a mechanical
  siren, its rotor winding up over a few seconds and coasting down for longer, growled at
  junctions, with its air horn (a low chord, a long blast and two short) coming up to each one.
- **Deliveries** (`delivery.js`). A box truck coming into a block in the kerb lane stops on a
  quarter of them, double-parked: it signals, pulls in towards the kerb, stops, puts its hazards
  on and runs its roller door up; 55 to 125 s later the door comes down and it signals and drives
  on, and makes no other stop for 80 s. The drivers behind go round it as they go round a wreck,
  leaving room to pull out as it slows for its stop, and those pulling over for a call leave it
  be. In a lot, a box truck parks as a van.
- **The lowrider** (`carRide.js`). It rides low on the move. Stopped at the lights for 1.2 s,
  about half of them start to hop on their hydraulics, the body springing up off its wheels on a
  bouncier spring (2.4 Hz, damping ratio 0.16), each in its own way: the nose, the tail, or
  side to side.
- **The limousine.** Nine in a hundred sedans in Beverly Hills and seven in Hollywood, a few
  elsewhere. Long ones (the limousine, the fire engine, the box truck) take a gap 1.1 to 1.6 s
  longer in the oncoming traffic to turn left across it, wait at the line until there is room
  beyond, and don't sneak through on the red; in a lot, a limousine parks as a sedan. The bus
  keeps its old ways.

## The traffic's random numbers

Everything new draws on random numbers of its own (`fleet.js` streams): which vans and sedans are
swapped (`fleetR`), which trucks stop where and for how long (`dropR`), and which kind of vehicle
goes on a call (its own stream in `calls.js`). The swaps take the type the traffic drew and
replace it, so the traffic's own draws are made in the same number and order as before. The work
in progress had also changed how every car turns left, keeps the junction clear and judges a
responder's pass; those changes changed every car's driving, and are now confined to the long
vehicles and the responders that need them.

## How it was checked

- `npm test`: seven new tests in `tests/vehicles.test.mjs`: the new vehicles' draws leave the
  traffic's sequence as it was; about two vans in five are box trucks, lowriders mostly in
  Mid-City and the south and limousines in Beverly Hills and Hollywood; a box truck double-parks,
  signals, puts its hazards on and runs its door up, then drives on, and the traffic goes round
  it; over 400 s every delivery stop ends (4 stops, the longest 60 s) and nobody waits long behind
  one (the longest 1.8 s; under 30 s required); an ambulance and a fire engine each drive their
  run, over a red only at a crawl, and get there; the share of the calls; half the lowriders
  stopped at the lights hop (24 of 40) and none on the move. The call test now takes any of the
  three kinds (it had asked for a police car). The long-run traffic tests leave a truck stopped to
  deliver out of the "stuck" and "cruising" measures, as it is parked; the delivery test above
  measures the wait behind it instead.
- With the new vehicles off (no swaps, every call a police car), the traffic run side by side with
  living-city's is identical after 600 s, car for car and draw for draw: seeds 3 and 7 with the
  Roadster parked, 3 and 7 with it driving (66,649, 65,486, 303,058 and 295,941 draws).
- Close up in headless Chrome (SwiftShader), by day at 14:30 and by night at 22:00, each from its
  front and rear quarter at about 8 m: the proportions read as the real things, the wheels sit in
  their arches, the lamps where they belong; the ambulance's and the fire engine's red and white
  flashes light the road at night, the box truck's door is up over its load with its hazards on,
  the lowrider is caught mid-hop. Dented (damage.md), each new type crumples at the front, its
  glass crazes, its headlights go out and its steam rises from under the cab.
- The cost, in the same view from the start on Wilshire: 381 draw calls by day before, 396 after
  (a box truck, lowriders and a limousine in sight, three calls a type); 392 and 401 by night; the
  triangles within 0.6%. The traffic's step, 110 cars, 131 µs before and 139 µs after (means of
  three interleaved runs on a busy machine, the spread about 15 µs).

## Known issues

- Nobody has listened to the ambulance's and the fire engine's sirens or the air horn on real
  speakers; the voices are as written (`siren.js`), heard only through the code.
- On the tall flat fronts of the box truck and the fire engine, a hard crumple's facets read as a
  zigzag.
- A police car, an ambulance or a fire engine on a call waits behind a wreck that blocks both
  lanes rather than going round it (damage.md).
- Frame times in headless Chrome mean nothing (SwiftShader draws a frame a second); the new types'
  cost on a real GPU is still to be timed.
