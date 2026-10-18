# The traffic: notes

The traffic already drove its lanes, kept to the lights, changed lanes and overtook, and reacted to
the Roadster; but nothing ever happened on the streets that the Roadster didn't start, and the
drivers drove a storm at three in the morning as they drove a clear evening rush. Now there are
emergency runs, as in GTA V's city: now and then a police car answers a call, lights flashing and
siren going, and the traffic gets out of its way. The drivers feel the weather and the hour, the
junctions have lost some bad habits, and the cars' lights come on one by one at dusk. What changed,
why, and how it was checked.

## What changed, and why

- **Emergency runs** (`js/sim/calls.js`, new): every two to four minutes or so (the first a minute
  or two in), a police car answers a call. It sets off out of sight, 160 to 280 m away and heading
  the Roadster's way, its light bar flashing and its siren on, and drives to a junction a block or
  two past the Roadster, so that it comes by. Its route through the grid is worked out backwards
  from that junction, a turn costing a little more than a block straight on. There it switches off
  and, over a few seconds, settles back to its own pace as ordinary traffic; a run that hasn't got
  there in 200 s is called off. The runs keep their own random numbers, so nothing in the traffic's
  own sequence changes until a car is sent (nor in the long-run tests, which depend on it).
- **How it drives** (`responder.js`, new): fast, up to about 75 km/h in town, less in the wet and
  the fog. It brakes hard for each junction, and goes over one on a red, or with anyone in it, only
  at a crawl from the line once it is clear. It goes slower past the cars pulled over for it, and
  round a queue that can't get out of its way on the wrong side of the road when that is clear. The
  siren wails on the open road and yelps near junctions. When the Roadster sits in its way, it
  slows, flashes its headlights and gives a whoop, then goes round when it can.
- **Making way** (`makeway.js`, new): each driver ahead of it, in its lane or the one beside,
  notices it at their own distance and a moment later by their own reactions. They signal, pull over
  to the kerb and stop, wait for it to go by, then signal and pull out again; one too near a
  junction to stop short of it goes on over first. Anyone coming up to the junction it is crossing
  holds at the line, and the people waiting to cross there stay on the kerb (`peds.js`).
- **The siren** (`js/audio/siren.js`, new; played from `watch.js` and `ambience.js`): a horn
  speaker's harsh tone swept by its driver, in the wail, the yelp and the whoop. It is placed like
  the traffic's other voices: the doppler, louder the nearer it is and audible across a few blocks,
  duller with distance, muffled when a building stands in the way (a raycast). The distant siren the
  ambience plays now and then is held off for 25 s after a real one has been heard.
- **The weather** (`conditions.js`, new): in the rain and on a wet road drivers go about 15% under
  their usual pace, keep about a third more gap, brake earlier and more gently, pull away a little
  more gently and take corners slower; fog slows them and holds them back too. Each by their own
  caution (the bolder ones less), eased in as the weather comes on.
- **The hour** (`conditions.js`): the streets are busiest in the morning and evening rush, a little
  quieter through the day and the evening, and late at night (from about 23:00, fewest about 3:00,
  back by 6:00) down to about 55% of the rush. Cars leave the road for a space in a lot, or come
  back out of one, one at a time, never in sight or within 120 m of the Roadster; the parked cars
  keep their own random numbers too.
- **The junctions** (`drivers.js`, `sight.js`, `react.js`, `traffic.js`): a left-turner that moved
  off into a gap but was brought to a stop at the line looks for its gap again (and at a red stays
  where it is); one with its nose over the line waits for traffic it can't get across ahead of; one
  creeping up on a red stays short of the junction, not over it. A car off its line round a turn
  keeps to as far round as its speed takes it on the curve it is really on. A right-turner in the
  kerb lane no longer holds up the left turn opposite. Backing out of a standoff is eased, and
  checks the turn lanes behind. New cars are not put down crossing a junction, or at a busy one.
- **The lights** (`js/render/traffic.js`, `carLamps.js`, `carPaint.js`): each car switches its
  headlights on at its own moment as dusk comes on (`ENV.headlights`), their beams on the road with
  the dark; tail lights are brighter in the rain; the police car's light bar flashes red and blue,
  throws its colour on the road, and is brighter at night.
- **Kept under 500 lines**: `laneChange.js` (lane changes and overtaking, moved unchanged out of
  `drivers.js` and `traffic.js`), `js/render/carRide.js` (a car's body on its springs, out of
  `render/traffic.js`), and `restore` (putting a knocked car back) moved into `wrecks.js`.

## How it was checked

- `tests/calls.test.mjs` (7): a call comes when it should, and sends a police car from out of sight;
  its top speed and its crossings on red; the traffic pulling over; cross traffic holding at the
  line; the people at the crossing staying on the kerb; the Roadster in its way; standing down.
- `tests/weather.test.mjs` (4): rain slows the drivers; a 300 s storm with no cars overlapping, none
  over on a red, and nobody stuck for good; how many are out by the hour; the easing after a jump
  of the clock.
- The junctions, 300 s runs of 110 cars, before and after:

  | | Before (40 seeds) | After (60 seeds) |
  | --- | --- | --- |
  | Runs with cars overlapping | 4 | 1 |
  | Cars into a junction on a red | 0 | 0 |
  | Hard changes of speed | 43 | 6 |
  | Cars waiting over 60 s | 68 | 49 |
  | Runs with a standstill over 75 s | 2 (the longest 124 s) | 2 (the longest 81 s) |
  | Mean speed | 4.52 m/s | 4.59 m/s |

  In a storm (32 seeds): one run with an overlap, no reds, a mean speed of 4.22 m/s.
- The calls, six forced: runs of 43 to 75 s, top speeds of 51 to 69 km/h. Every crossing on a red
  was at 1.3 to 2.2 m/s with the junction empty, and no car overlapped another. With the Roadster
  in its way, it got by in 4.6 to 8.8 s without touching it (0.41 m at the closest).
- The weather (one seed), against the dry:

  | | Cruising speed | Gap |
  | --- | --- | --- |
  | Storm | −15.8% | +24% |
  | Rain | −11% | +26% |
  | Fog | −5.7% | +12.7% |

  In the storm, corners were taken 10.5% slower and braking was 23.6% gentler. These were measured
  just before the wet gap was raised to its final third, so the gaps in the wet are now a little
  longer.
- The hour (cars out, of 100): 3:00, 55; 6:00, 88; 8:00, 100; 12:00, 90; 17:00, 100; 23:00, 86.
  After a jump of the clock from 17:00 to 3:00 the count eased from 100 to 73, 62 and 55 over
  100 s; the nearest car taken off the road was 270 m away.
- The siren, read with an analyser in headless Chrome (not listened to): about −34 dB at 100 m and
  −23 dB going by; the wail sweeps from 646 to 1572 Hz; the whoop peaks near 1530 Hz, falls to
  about 840 Hz and dips to −48 dB before the yelp comes back.
- The cost, 110 cars after a warm-up: 31.7 µs a step before; 33.3 µs now without a call, 33.8 to
  36.6 µs during one. The first call of a session runs code the engine hasn't optimised yet, so that
  minute costs 47 to 58 µs a step, once. Nothing new is allocated per step.
- At the merge, in the browser: a call forced and followed from the Roadster, the light bar's glow
  on the road, a pickup pulled over at the kerb as it went by. The weather's darkness had been
  switching every car's headlights on at once (`city.js`, `setDark`), which overrode each car's
  own moment; it no longer does.

## Known issues

- One run in 60 still has a left-turner overlapping a car going straight on.
- About 3% of runs have a standstill of over 75 s (up to 144 s in a storm).
- Buses still take their wide right turns from the stop line.
- A lane change can still finish inside a junction.
- The long-run traffic tests are still sensitive to the random sequence (the new features use their
  own, so they don't disturb it).
