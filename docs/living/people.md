# The people: notes

The people on the pavements walked, crossed, stood about and ran from the Roadster the same in any
weather and at any hour. Now they take the rain and the hour as Angelenos do, sit on the benches,
look in the shop windows, talk in threes and walk their dogs, and the street lights light them at
night. What changed, why, and how it was checked.

## What changed, and why

- **How many are out** (`js/sim/footfall.js`, new): everyone from 7:00 to 22:00, falling off fast
  after ten to a third at three in the morning (about 57% at midnight), back by seven; in the
  evening Hollywood's and Santa Monica's blocks half as busy again (about 300 out instead of 240
  round Hollywood Blvd at 20:00); in the rain fewer (about 71% in steady rain, half in a downpour).
  The ones over the count go indoors only out of the camera's sight, at most four every half second,
  a pair together, a dog with its owner.
- **The rain** (`shelter.js`, new): each person minds it at their own point, so the umbrellas go up
  one by one as it comes in; 62% have one. The rest hunch and hurry with shorter steps, hoods up on
  the hoodies, about a fifth of them running for it. Nobody stands chatting or sits on a wet bench;
  some without an umbrella wait under a shop's canopy (where a shopfront stands at the back of the
  pavement) until it stops.
- **The umbrella and the hood** (`js/render/pedGear.js`, new; pedFigure.js, pedShader.js): a domed
  canopy of eight ribs on a shaft through the fist, the arm raised before it opens; black most
  often, then navy and red, golf umbrellas striped in two colours, and clear bubbles (drawn with half
  their pixels left out, so the head shows through); a hood raised on a hoodie.
- **More life on the pavement** (`linger.js`, new): two to a bus bench, one to a seat, taken only
  from the line nearest the kerb (they walk along it until level with the seat, step in, turn and
  sit back onto it, feet where they were: thighs forward, shins down, hands on the knees, lowered to
  the seat for their height); window shoppers standing three to nine seconds at a shop's glass; a
  third joining an idle pair, the three facing the middle. All of it from a second seeded stream
  (`peds.Q`), so the first one's sequence (the tests') is untouched.
- **Dogs** (`js/sim/dogs.js`, `js/render/dogs.js` and `dogFigure.js`, new): about one lone walker in
  twenty has one, on the side away from the road and a little ahead, sitting when its owner stops,
  waiting behind them at the kerb, crossing with them (in `traffic.peds` while it is in the road, so
  the cars stop for it), diving clear of the Roadster on its own and never left under it. One
  instanced mesh for all of them: a trot, a wagging tail, floppy or pricked ears, a sit, coats of
  several colours, a collar, the lead a thin sagging strip to the owner's hand. Dog walkers don't
  jaywalk.
- **Lit at night** (`js/render/pedLight.js`, new): someone in a street light's pool was lit by the
  moon and the sky alone, a dark figure on the bright ground. Now each person (and dog) is lit, as by
  a point light, by the nearest standing street light, from its lens: the same warm light as the
  pool on the ground, as much of it as the pool has where they stand.
- A fix on the way: a pair walking the kerbside line had its second walking through the palms, and
  on the middle line through the bench backs; pairs keep to the middle line now, the second on the
  inside.

## How it was checked

- `tests/footfall.test.mjs` (6) and `tests/linger.test.mjs` (5): the umbrellas go up by degrees as
  the rain comes in and down after it; the counts at night and in the evening, and people going
  indoors a few at a time; sheltering, and the old guarantees in the rain (crossing only on the walk,
  keeping to the pavement, never run into); the street light's falloff; benches (one to a seat, then
  on their way), windows, threes, dogs, and a dog diving clear (which fails with its dive switched
  off).
- Long runs, 240 s on Autopilot by day, in the rain, a storm, at night and in the evening, two seeds
  each: no NaN, nobody off the pavement, run into or under the car, no seat shared, no dog off the
  pavement or hit.
- The people's step allocates 16.0 KB a step (16.2 before) and takes 0.029 ms (0.028); a person is
  1,585 triangles (1,388 before), a dog 546; room for 360 people (300 before) for the evening crowds.

## Known issues

- The evening crowd builds from 17:30, about a minute after the city opens.
- The benches aren't solid (the car drives through them; whoever is sitting there dives clear).
- The bubble umbrella's shadow is solid; the dogs' shadow shader compiles the first time a dog is
  near.
- People still snap round when they rejoin their line after crossing, and a reset (`R`) doesn't
  reset them, so the street round the car is empty for a while after one.
