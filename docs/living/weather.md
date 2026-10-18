# The weather: notes

The city had one sky. Now it has weather, as Los Angeles has it: mostly clear, sometimes cloudy,
overcast or under the marine layer's fog, now and then rain, rarely a thunderstorm; and it changes
what you see, hear and feel: the streets soak and mirror the city, puddles fill, the rain falls
through the headlights, the tyres throw up spray and grip less, the thunder rolls in after the
flash. What changed, why, and how it was checked. The README describes the result for players.

## The weather (js/sim/env.js)

- **Six weathers** (`WEATHERS`), each a cloud cover, how hard it rains, how thick the fog is, the
  wind and how often lightning strikes, how many game hours it lasts and what tends to follow it:
  clear (6 to 14 h; then clear, cloudy or fog), cloudy, overcast, rain, storm (1 to 3 h; then rain
  or overcast) and fog (the marine layer). It moves on by itself (`ENV.auto`); `O` chooses the next
  one (clear, cloudy, overcast, rain, thunderstorm, fog, then back to as it comes), and the change
  runs six times as fast (`quick`), easing back to its own pace over ten seconds or so, so rain
  chosen is falling within a few seconds.
- **Eased, in the order it happens**: the cloud comes in over about 40 s, the fog over 35, the rain
  over 14 s, but a thin sky can't rain (the rain is held under what the cloud allows), so the sky
  greys before it pours. The road soaks (`ENV.wet`) in the rain over a minute and dries over
  several once it stops, faster in the sun, slower at night and under cloud; the puddles
  (`ENV.pool`) only fill once the road is wet through, and empty after it.
- **Lightning** in a storm: a strike every 6 to 25 s, 600 m to 5.6 km off (mostly near the far end),
  its flash a flicker of two to four pulses (`ENV.flash`), its distance and bearing kept for the
  thunder.
- Tested (`tests/env.test.mjs`): rain comes in cloud first, then the road soaks, then the puddles,
  and it dries after (still wet a minute later, dry ten minutes of sun later); no lightning in plain
  rain, at least three strikes in two minutes of storm each with its flash; over twenty game days
  the weather goes through four kinds or more, is clear a good part of the time and never rains out
  of a thin sky.

## The rain (js/render/rain.js, new)

- **Streaks** falling through a box of air round the camera (44 × 24 × 44 m), each drop with its own
  place and pace (8.5 to 10 m/s), on the wind; the box wraps round the camera so the rain stays put
  in the world as the camera moves through it. Each streak is drawn along the drop's way past the
  camera, as long as it goes in a camera's exposure (1/40 s), so standing still the rain falls, and
  at speed it slants in at the windscreen. Lit by the sky, the city's glow at night, the Roadster's
  headlights where they reach (bright in the beams) and the street lights near them
  (`lampGlow`, lampLight.js); faded off with distance and close to the camera. Up to 9,000 drops,
  as many as the rain's strength and the graphics quality ask for, in one instanced draw.
- **Splashes**: little crowns thrown up all round the camera (up to 1,400 within 26 m), each at a
  new spot every time it lands, on the road or up on the pavement at its height, none right under
  the camera.
- A bug worth knowing about: the streaks were first wound away from the camera, and the material
  draws front faces only, so nothing showed; `side` is crossed from the camera to the drop's way
  now.

## The wet street (js/render/wet.js, mirror.js, new; roadSurface.js, cityGround.js)

- **The asphalt soaks**: darker (to about half its colour), smoother (roughness from 0.88 down to
  0.26, its polished wheel tracks to 0.16), a little uneven so its reflection breaks up. The
  pavements, plazas and lots go darker and smoother too (`wetGround`), the lawns hardly shine, the
  lane paint loses its chalkiness.
- **Puddles** fill from their deepest points as it rains on: in each 7 m square of the city one
  chance in three of an ellipse 1.1 to 3 m across; and water runs along the gutters by the kerb. In
  them the surface is flat and black and mirrors sharply, and the rain rings it (two layers of
  spreading rings). Where they are is an integer hash both the shader and JavaScript work out to the
  bit (`puddleAt`): the spray and the splash's sound find the same water the eye does.
- **The reflection.** Wet asphalt mirroring the city is most of what makes a wet street read, and a
  sky reflection alone (the environment map) can't do it. While the road is wet, the scene is drawn
  a second time before the frame from a camera mirrored below the road (as three.js's Reflector does
  it, with the near plane tilted onto the road so nothing under it is drawn), into a target half the
  frame's size with mipmaps; the road's shader reads it back where the road is, in place of the
  sky's reflection (so the BRDF still decides how much shows: little looking down, most at a
  glancing angle), at a mip level by its roughness (a puddle sharp, the asphalt blurred) and drawn
  out along the view as rough asphalt does, rippled where it is water. The ground itself (asphalt,
  pavements, paint, beach and sea, light pools, beams and soft shadows on the road, the skid marks,
  the rain) is on a layer of its own (`GROUND`) so the reflection leaves it out; the shadow maps
  aren't drawn again for it. Dry, it costs nothing.
- **Cost**, the graphics card's time a frame on this M4 Max at 2× pixels, dry against raining with
  the reflection: downtown 3.06 → 3.76 ms, the spawn 3.78 → 4.97, Hollywood 3.41 → 4.05 (the draw
  calls go from about 300 to 540). It is timed with the rest of the frame, so the adaptive
  resolution steps down for it on a card it is too much for; at the medium graphics quality the
  reflection is smaller (0.35 of the frame), at low there is none.

## The street lights' light (js/render/lampLight.js, new)

- At night each street light laid a soft additive glow on the ground under it, the same whatever it
  fell on: a flat beige carpet over the asphalt, the pavement and the paint alike. The lights stand
  in the same places on every street (three a side along each block, 18, 42 and 66 m from its
  corner, their heads 8.9 m up over the road; 8.15 m on a wooden pole), so the ground's shaders now
  work out the light from the eight nearest heads for themselves, as from a lamp throwing its light
  down: strongest straight under it, falling off with distance and with the slant (a pool half as
  bright at about half the lamp's height out), on the asphalt dark and on the pavement and the paint
  bright, in the rain under the reflection. Which are standing is a texel each (1,320 lights) in a
  little texture: knock one down and its pool goes out. The glows are kept out of sight.
- Cost: none measurable at night downtown (3.48 ms with them).

## The Roadster in the wet

- **Grip** (`js/sim/street.js`): each surface loses a share of its grip soaked through (asphalt and
  pavement about a quarter, as a good tyre does on a wet road; the pier's planks a third; wet sand
  none, it packs firm): `s.grip = grip × (1 − wet × loss)`. The tyre model, the electronics and the
  e-brake are as they were, at the lower grip. Measured headless through the keyboard, as a player
  drives, on Olympic Blvd: from 100 km/h S stops it in 34.1 m dry and 41.5 m wet; the e-brake with
  the wheel straight in 29.8 m dry and 38.7 m wet (tested: longer by 12 to 45%, and under 45 m).
  Under taps of the steering keys at 120 km/h with W held, and weaving at 90, the 2 to 20 Hz part of
  the yaw rate and the lateral and longitudinal acceleration is lower wet than dry (yaw 0.034
  against 0.041 rad/s under taps), so the wet adds no shake; the most it corners at weaving goes
  from 1.33 to 0.84 g.
- **Spray** (spray.js): each tyre throws up a fine mist on a wet road, more the faster it turns,
  and a sheet of water through a puddle (`puddleAt` under each wheel); the traffic near the camera
  throws it up behind it too. A sliding tyre smokes little in the wet, and leaves a quarter of the
  rubber on the road.
- **The paint** looks wet: its clear coat thicker and smoother as the rain soaks it.
- **The beams**: in rain or fog at night the headlights' light is seen in the air, two pale cones
  down the road (beams.js).

## The sound (js/audio/rain.js, new; street.js, mix.js)

- **The rain**: the hiss of countless drops and the patter of the nearer ones, two loops of drops
  synthesised at start-up (1,400 drops a second, each a tiny click of noise ringing down), one each
  side so the ears never hear the same drop; heard through the canopy from the driver's seat, where
  instead the rain drums on the canopy over your head (a loop of fatter drops, their thump ringing
  at their own pitch), straight into the mix.
- **The tyres in the water**: a swish through the spray, louder the faster the car goes, deeper
  through a puddle, and the slosh of a sheet of water thrown up as a tyre hits one.
- **The thunder**: three claps made at start-up (near, middle, far: a crack first when it is close,
  then rolls of rumble swelling and dying away for five to eight seconds), played a little faster or
  slower each time, as late as the strike is far at the speed of sound, deeper and softer the
  further off, from the side it struck on.
- The far traffic's tyres hiss through the water on a wet road; the wind is as strong as the
  weather's (a storm's gusts howl down the streets); the crickets keep quiet in the rain.
- Levels, standing still in the street (the mix's output, RMS): clear −39.8 dB, a storm −26.4 dB
  before the rain was turned down by 3 dB; from the driver's seat −34.6 dB. A near clap peaks at
  about three times the rain.

## Known issues

- The street lights light the ground, not the walls, the cars or the people under them.
- Only the Roadster's headlights show beams in the air; the traffic's don't.
- The reflection is drawn from the road's level: on a raised pavement or roof (8 cm and more up) it
  is a little off, which in a puddle on the pavement could show.
- No rain on the canopy in the driver's seat view, and no wipers.
- Nobody has listened to the rain and the thunder yet: the levels are first guesses (`updateRain`).
