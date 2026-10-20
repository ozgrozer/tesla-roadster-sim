# Known issues (open-world-v2)

Open defects, with where they were found. Fixed ones move to DEVLOG.md with the fix.

## Found in the cycle 0 audits (being fixed in cycle 1)

- Height ignored for traffic cars (`vehicles.js readCar` sets y = 0): walkers under the freeway are
  knocked down by cars on the deck; exits on the deck or a roof put the player on the street.
- Police sight checks the player at a fixed 1.1 m; arrests ignore height (busted on the deck by a
  unit underneath).
- Police units and street-event cars can be "broken into" while driven; two bodies then drive the
  same car.
- Police only spawn and route on the street grid, so the freeway is a guaranteed escape.
- R in the city with stars resets the traffic, removing every police unit.
- `player.js keepOnMap` blocks the hill road's lookout and the quay's outer edge on foot.
- Lamps, palms and trees stand up through the freeway deck; slip roads cross the kerb; the pier
  arch stands 384 m from the pier; the LA River blocks are flat slabs.
- Traffic drives through police-held and abandoned cars and the Roadster left in a lane; a body in
  a lane blocks it for good; a lane change can carry a car into a junction where it freezes.
- Pedestrians walk through bus shelters, superblock solids and cars on the pavement; AI-driven
  cars shove them aside instead of being dodged.
- The pause map's arrow and "find the car" follow the parked Roadster when the player is on foot.

## Older, from docs/la/city.md

- Driving off a roof towards a taller building across an alley narrower than the car can hang the
  car on the edge (`collide.js` EDGE hold against a wall).
- `effects.js knockFx` sheds a palm's leaves at 10 m; the tall fan palms' heads are at 21-30 m.
- The sign atlas is 2048 x 2048 (about 21 MB on the GPU).
